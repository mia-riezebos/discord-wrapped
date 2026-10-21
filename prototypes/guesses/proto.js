// PROTOTYPE, throwaway. Issue #14 "How guesses feel to answer".
// One player shell; each variant owns its guess inputs, waiting behaviour and reveal.
// URL: ?variant=A|B|C &story=messages|days|owl|word|dm|outro &seed=<n> &period=2025|2020|all
'use strict';
const Q = new URLSearchParams(location.search);
const VARIANTS = { A: 'Let go to answer', B: 'Lock it in', C: 'Game show' };
const KEYS = Object.keys(VARIANTS);
const V = VARIANTS[Q.get('variant')] ? Q.get('variant') : 'A';
const PERIOD = Q.get('period') || '2025';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Every story here has a guess, so the picker shows at once.
const ASK = 0, REVEAL = 6000, CLOCK = 10000, STEPS = 1000;
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
document.body.classList.add('v-' + V);

// ---------- seeded shuffle so a reload with ?seed= repeats the same options ----------
const SEED = Number(Q.get('seed')) || Math.floor(Math.random() * 1e6);
let rs = SEED;
const rnd = () => { rs |= 0; rs = rs + 0x6D2B79F5 | 0; let t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const threeOf = list => shuffle([list[0], ...shuffle(list.slice(1, 10)).slice(0, 2)]);

// ---------- facts: the same in every variant ----------
function buildStories(R) {
  const T = R.totals, days = T.calendarDays, all = PERIOD === 'all';
  const inP = all ? '' : ` in ${PERIOD}`;
  const h = R.hourly, sum = hs => hs.reduce((a, i) => a + h[i], 0);
  const night = sum([21, 22, 23, 0, 1, 2]), early = sum([5, 6, 7, 8, 9, 10]);
  const dms = R.channels.filter(c => c.group === 'DMs');
  return [
    { id: 'messages', name: 'Messages', kind: 'slider', scale: 'log', q: `How many messages did you send${inP}?`, label: `Your guess: messages sent${inP}`,
      real: T.messages, max: 1000 * days, tol: 0.15, one: 'message', many: 'messages', days },
    { id: 'days', name: 'Days you showed up', kind: 'slider', scale: 'lin', q: `On how many days${inP} did you send a message?`, label: `Your guess: days with a message${inP}`,
      real: T.activeDays, max: days, tol: 0.10, one: 'day', many: 'days', days },
    { id: 'owl', name: 'Night owl or early bird', kind: 'pick', q: 'Night owl or early bird?',
      options: [{ key: 'night', label: 'Night owl', sub: '9 pm to 3 am', count: night }, { key: 'early', label: 'Early bird', sub: '5 to 11 am', count: early }],
      real: night >= early ? 'night' : 'early', countNoun: 'messages' },
    { id: 'word', name: 'Top word', kind: 'pick', q: `What was your top word${inP}?`,
      options: threeOf(R.words).map(([w, n]) => ({ key: w, label: w, count: n })), real: R.words[0][0], countNoun: 'times' },
    { id: 'dm', name: 'Who you DMed most', kind: 'pick', private: true, q: `Who did you DM most${inP}?`,
      options: threeOf(dms).map(c => ({ key: c.name, label: c.name, count: c.count })), real: dms[0].name, countNoun: 'messages' },
  ];
}

// slider maths: log scale for messages (0 to ~1,000 a day), linear for days
const nice = v => v < 100 ? Math.round(v) : (m => Math.round(v / m) * m)(10 ** (Math.floor(Math.log10(v)) - 1));
const posToVal = (s, p) => s.scale === 'lin' ? +p : (+p <= 0 ? 0 : nice(Math.expm1(p / STEPS * Math.log1p(s.max))));
const valToFrac = (s, v) => s.scale === 'lin' ? v / s.max : Math.log1p(v) / Math.log1p(s.max);
const sliderMax = s => s.scale === 'lin' ? s.max : STEPS;
const startPos = s => Math.round(sliderMax(s) / 2);
const valueText = (s, v) => s.id === 'messages'
  ? `${plural(v, 'message', 'messages')}, about ${fmt(v / s.days)} a day`
  : `${plural(v, 'day', 'days')} of ${fmt(s.max)}`;

function judge(s, g) {
  if (g == null) return { tier: 'skipped', right: false };
  if (s.kind === 'pick') return { tier: g === s.real ? 'right' : 'wrong', right: g === s.real };
  const err = Math.abs(g - s.real) / s.real;
  const tier = err <= s.tol ? 'right' : err <= s.tol * 2 ? 'close' : (g > 0 && Math.max(g / s.real, s.real / g) <= 2) ? 'off' : 'way';
  return { tier, right: tier === 'right', err };
}
// the closeness line under every reveal
function closeLine(s, g, j) {
  if (j.tier === 'skipped') return 'No guess this time.';
  if (s.kind === 'pick') return j.right ? 'You knew it.' : 'Not this time.';
  const pct = Math.round(j.err * 100), dir = g < s.real ? 'under' : 'over';
  if (j.tier === 'right') return pct === 0 ? 'Exactly right.' : `Spot on. Only ${pct}% ${dir}.`;
  if (j.tier === 'close') return `Close. ${pct}% ${dir}.`;
  if (j.tier === 'off') return `Not quite. ${pct}% ${dir}.`;
  if (g === 0) return 'Not even close.';
  const x = (g < s.real ? s.real / g : g / s.real);
  return g < s.real ? `Way off. It was ${x.toFixed(1)}× your guess.` : `Way off. That's ${x.toFixed(1)}× too high.`;
}
const guessText = (s, g) => g == null ? 'No guess' : s.kind === 'slider' ? plural(g, s.one, s.many) : s.options.find(o => o.key === g).label;
const answerText = s => s.kind === 'slider'
  ? (s.id === 'days' ? `${plural(s.real, 'day', 'days')} of ${fmt(s.max)}` : plural(s.real, s.one, s.many))
  : (o => `${o.label}, ${fmt(o.count)} ${s.countNoun}`)(s.options.find(o => o.key === s.real));

// ---------- player state ----------
let ST = [];
const S = { i: 0, phase: 'ask', t: 0, clock: 0, paused: false, held: false, closed: false, draft: null, touched: false, clockOff: false, guesses: {}, lastSecond: null };
const stage = $('stage'), live = $('live');
const cur = () => ST[S.i];
const open = () => S.i < ST.length && (S.phase === 'ask' || S.phase === 'wait') && !S.guesses[cur().id];
function announce(text) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 60); }
const fade = (el, delay = 0) => el && el.animate(
  reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
  { duration: reduced ? 200 : 320, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
function countUp(el, to, dur = 900) {
  if (reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / dur); el.textContent = fmt(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- shared story frame ----------
function enter(i) {
  S.i = Math.max(0, Math.min(i, ST.length)); S.t = 0; S.clock = 0; S.draft = null; S.touched = false; S.lastSecond = null;
  if (S.i === ST.length) return outro();
  const s = cur(), done = S.guesses[s.id];
  S.phase = done ? 'reveal' : 'ask';
  stage.className = 'stage';
  stage.setAttribute('aria-label', `Story ${S.i + 1} of ${ST.length}`);
  stage.innerHTML = `<h2 class="q" id="q" tabindex="-1">${esc(s.q)}</h2><div class="input" id="input"></div><div class="reveal" id="reveal" hidden></div>`;
  if (done) return showReveal(true);
  IMPL[V].input(s, $('input'));
  fade($('input'), 150);
  announce(`Story ${S.i + 1} of ${ST.length}. ${s.q} ${IMPL[V].howTo(s)}`);
  IMPL[V].focus(s);
}
function commit(value) {
  if (!open()) return;
  S.guesses[cur().id] = { value, ...judge(cur(), value) };
  showReveal();
}
function skip() { commit(null); }
function showReveal(again) {
  const s = cur(), g = S.guesses[s.id];
  S.phase = 'reveal'; S.t = again ? REVEAL * 0.3 : 0;
  stage.classList.add('revealed');
  $('input').hidden = true;
  const r = $('reveal'); r.hidden = false;
  IMPL[V].reveal(s, g.value, g, r);
  const pre = S.timeUp ? "Time's up. " : ''; S.timeUp = false;
  announce(`${pre}${g.value == null ? 'You skipped.' : 'You guessed ' + guessText(s, g.value) + '.'} The answer: ${answerText(s)}. ${closeLine(s, g.value, g)}`);
  stage.focus({ preventScroll: true });
}
function next() { if (S.closed) return; if (open()) return skip(); enter(S.i + 1); }
function prev() { if (S.closed) return; enter(S.i - 1); }
function togglePause(force) {
  S.paused = force ?? !S.paused;
  $('btn-pause').setAttribute('aria-label', S.paused ? 'Play' : 'Pause');
  $('pause-path').setAttribute('d', S.paused ? 'M8 5l11 7-11 7z' : 'M8 5v14M16 5v14');
}
function close() {
  S.closed = true;
  stage.className = 'stage';
  stage.innerHTML = `<div class="closed"><h2 class="q">Reel closed</h2><button type="button" class="primary" id="reopen">Play again</button></div>`;
  $('reopen').onclick = restart; $('reopen').focus();
  announce('Reel closed.');
}
function restart() { S.closed = false; S.guesses = {}; togglePause(false); enter(0); }

function outro() {
  S.phase = 'outro';
  const right = ST.filter(s => S.guesses[s.id]?.right).length;
  const skipped = ST.filter(s => !S.guesses[s.id] || S.guesses[s.id].tier === 'skipped').length;
  const mark = { right: 'Right', close: 'Close', off: 'Off', way: 'Way off', wrong: 'Wrong', skipped: 'Skipped' };
  stage.className = 'stage revealed';
  stage.setAttribute('aria-label', 'Your score');
  stage.innerHTML = `<div class="outro">
    <h2 class="q" id="q" tabindex="-1">Your guesses</h2>
    <div><div class="big num">${right}/${ST.length}</div><div class="unit">right${skipped ? `, ${skipped} skipped` : ''}</div></div>
    <ul>${ST.map(s => { const g = S.guesses[s.id] || { value: null, tier: 'skipped' };
      return `<li><span class="k">${esc(s.name)}</span><span class="m">${mark[g.tier]}</span><span class="g">${esc(g.value == null ? 'No guess' : 'You said ' + guessText(s, g.value))} · ${esc(answerText(s))}</span></li>`; }).join('')}</ul>
    <p class="share-preview" id="share-preview" hidden></p>
    <div class="acts"><button type="button" id="again">Play again</button><button type="button" class="primary" id="share">Share score</button></div>
  </div>`;
  $('again').onclick = restart;
  $('share').onclick = () => { const p = $('share-preview'); p.hidden = false;
    p.textContent = `Share card: "I got ${right} of ${ST.length} right about my ${PERIOD === 'all' ? 'Discord' : PERIOD + ' on Discord'}." Lists the five questions and marks. Leaves out who you DMed.`; };
  fade(stage.querySelector('.outro'));
  announce(`You got ${right} of ${ST.length} right${skipped ? `, ${skipped} skipped` : ''}.`);
  $('q').focus({ preventScroll: true });
}

// ---------- the clock ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min(100, now - last); last = now;
  if (!S.paused && !S.held && !S.closed && S.phase !== 'outro') {
    S.t += dt;
    if (V === 'C' && open() && !S.clockOff) {
      S.clock += dt;
      const left = Math.ceil((CLOCK - S.clock) / 1000);
      if (left !== S.lastSecond) { S.lastSecond = left; IMPL.C.second(left); }
      if (S.clock >= CLOCK) IMPL.C.timeUp();
    }
    if (S.phase === 'ask' && S.t >= ASK) {
      S.phase = 'wait';
      IMPL[V].onWait?.();
    } else if (S.phase === 'reveal' && S.t >= REVEAL) enter(S.i + 1);
  }
  drawBars(); drawState();
  requestAnimationFrame(tick);
}
function drawBars() {
  const bars = $('bars');
  if (bars.children.length !== ST.length + 1) bars.innerHTML = Array.from({ length: ST.length + 1 }, () => '<div class="bar"><i></i></div>').join('');
  [...bars.children].forEach((b, j) => {
    let f = j < S.i ? 1 : 0, cls = '';
    if (j === S.i) {
      if (S.phase === 'outro') f = 1;
      else if (S.phase === 'reveal') f = 0.3 + 0.7 * Math.min(1, S.t / REVEAL);
      else if (V === 'C' && !S.clockOff) { f = Math.max(0, 1 - S.clock / CLOCK); cls = f < 0.3 ? 'clock low' : 'clock'; }
      else if (S.phase === 'ask') f = 0.3;
      else { f = 0.3; cls = 'waiting'; }
    }
    b.className = 'bar ' + cls;
    b.firstChild.style.width = (f * 100).toFixed(2) + '%';
  });
  $('waitnote').hidden = !(V === 'B' && S.phase === 'wait' && open());
}
function drawState() {
  const s = cur(), right = ST.filter(x => S.guesses[x.id]?.right).length, n = Object.keys(S.guesses).length;
  const parts = [s ? s.id : 'outro', S.closed ? 'closed' : S.phase + (S.paused ? ' (paused)' : S.held ? ' (held)' : '')];
  if (s && open()) parts.push('draft ' + (S.draft == null ? '-' : s.kind === 'slider' ? fmt(S.draft) : S.draft));
  if (s && S.guesses[s.id]) parts.push('guess ' + (S.guesses[s.id].value == null ? 'skipped' : s.kind === 'slider' ? fmt(S.guesses[s.id].value) : S.guesses[s.id].value) + ' → ' + S.guesses[s.id].tier);
  if (V === 'C' && open()) parts.push(S.clockOff ? 'clock off' : 'clock ' + Math.max(0, (CLOCK - S.clock) / 1000).toFixed(1) + 's');
  parts.push(`${right}/${n} right`, 'seed ' + SEED);
  $('v-state').textContent = parts.join(' · ');
  const chip = $('scorechip'); chip.hidden = V !== 'C' || !ST.length; chip.textContent = `Score ${right}`;
}

// ---------- shared slider builder ----------
function slider(s, cls = '') {
  return `<input type="range" class="${cls}" id="range" min="0" max="${sliderMax(s)}" step="1" value="${startPos(s)}" aria-label="${esc(s.label)}" aria-valuetext="${esc(valueText(s, posToVal(s, startPos(s))))}">`;
}
function wireSlider(s, onInput) {
  const r = $('range');
  r.addEventListener('input', () => {
    S.draft = posToVal(s, r.value); S.touched = true;
    r.setAttribute('aria-valuetext', valueText(s, S.draft));
    onInput(S.draft);
  });
  return r;
}

// =====================================================================
// Variant implementations
// =====================================================================
const IMPL = {};

// ---------- A: Let go to answer ----------
// Moving the slider and letting go IS the answer. A tap on a choice is the answer.
// Keyboard and screen readers: an "Answer" button appears once the value is changed without a pointer; Enter also answers.
// Skip: Next, the right edge of the frame, → or S. The bar stops at the question beat and breathes.
IMPL.A = {
  howTo: s => s.kind === 'slider' ? 'Drag the slider and let go to answer, or use the arrow keys then Enter. Next skips.' : 'Your first choice is your answer. Next skips.',
  focus: s => (s.kind === 'slider' ? $('range') : $('q')).focus({ preventScroll: true }),
  input(s, el) {
    if (s.kind === 'slider') {
      const v0 = posToVal(s, startPos(s));
      el.innerHTML = `<div class="a-read"><div class="big num" id="read">${fmt(v0)}</div><div class="unit" id="sub">${esc(subA(s, v0))}</div></div>
        ${slider(s)}<div class="a-scale" aria-hidden="true"><span>0</span><span>${fmt(s.max)}</span></div>
        <button type="button" class="primary a-kbd" id="kbd-answer" hidden>Answer</button>
        <p class="hint" id="hint">Let go to answer</p>`;
      let pointer = false;
      const r = wireSlider(s, v => { $('read').textContent = fmt(v); $('sub').textContent = subA(s, v);
        if (!pointer) { const b = $('kbd-answer'); b.hidden = false; b.textContent = `Answer ${fmt(v)}`; $('hint').hidden = true; } });
      r.addEventListener('pointerdown', () => { pointer = true; });
      const up = () => { if (!pointer) return; pointer = false; if (S.touched) commit(posToVal(s, r.value)); };
      addEventListener('pointerup', up); addEventListener('pointercancel', up);
      r.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(posToVal(s, r.value)); } });
      $('kbd-answer').onclick = () => commit(posToVal(s, r.value));
    } else {
      el.innerHTML = `<div class="a-picks" role="group" aria-labelledby="q">${s.options.map(o =>
        `<button type="button" data-key="${esc(o.key)}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
      el.querySelectorAll('button').forEach(b => b.onclick = () => commit(b.dataset.key));
    }
  },
  pickKey(n) { const b = $('input').querySelectorAll('button')[n]; if (b) commit(b.dataset.key); },
  reveal(s, g, j, el) {
    if (s.kind === 'slider') {
      const pos = v => Math.max(0, Math.min(1, valToFrac(s, v))) * 100;
      const edge = p => p < 12 ? ' edge-l' : p > 88 ? ' edge-r' : '';
      const lo = pos(s.real * (1 - s.tol)), hi = pos(Math.min(s.max, s.real * (1 + s.tol)));
      el.innerHTML = `<div><div class="big num" id="ans">0</div><div class="unit">${esc(s.id === 'days' ? `days of ${fmt(s.max)}` : s.many)}</div></div>
        <div class="nl" aria-hidden="true"><div class="track"></div><div class="band" style="left:${lo}%;width:${hi - lo}%"></div>
          ${g != null ? `<div class="mk you${edge(pos(g))}" style="left:${pos(g)}%">You: ${fmt(g)}</div>` : ''}
          <div class="mk ans${edge(pos(s.real))}" style="left:${pos(s.real)}%">${fmt(s.real)}</div></div>
        <p class="line">${esc(closeLine(s, g, j))}</p>`;
      countUp($('ans'), s.real);
      const you = el.querySelector('.mk.you');
      if (you && !reduced) you.animate([{ left: '50%' }, { left: pos(g) + '%' }], { duration: 500, easing: 'cubic-bezier(.2,.7,.2,1)' });
      fade(el.querySelector('.nl'), 200); fade(el.querySelector('.line'), 700);
    } else {
      el.innerHTML = `<div class="a-picks">${s.options.map(o => { const a = o.key === s.real, y = o.key === g;
        return `<button type="button" disabled class="${a ? 'is-answer' : ''} ${y ? 'is-guess' : ''}">${esc(o.label)}<small>${a ? `${fmt(o.count)} ${s.countNoun}` : o.sub ? esc(o.sub) : ''}</small>${a || y ? `<span class="tag">${a && y ? 'Your pick, the answer' : a ? 'The answer' : 'Your pick'}</span>` : ''}</button>`; }).join('')}</div>
        <p class="line">${esc(closeLine(s, g, j))}</p>`;
      fade(el.querySelector('.is-answer'), 100); fade(el.querySelector('.line'), 400);
    }
  },
};
function subA(s, v) { return s.id === 'messages' ? `messages, about ${fmt(v / s.days)} a day` : `days of ${fmt(s.max)}`; }

// ---------- B: Lock it in ----------
// Nothing counts until "Lock it in". Skip is a visible button beside it.
// The bar stops at the question beat, the rest turns hatched, and "Waiting for you" shows by the bars.
// Tapping the frame never skips while a guess is open; only Skip, Next, → or S do.
IMPL.B = {
  noTapSkip: true,
  howTo: s => s.kind === 'slider' ? 'Set your guess with the slider or the minus and plus buttons, then Lock it in. Or Skip.' : 'Choose one, then Lock it in. Or Skip.',
  focus: s => (s.kind === 'slider' ? $('range') : $('input').querySelector('input')).focus({ preventScroll: true }),
  onWait: () => announce('The story waits for your answer.'),
  input(s, el) {
    const actions = `<div class="b-actions"><button type="button" id="b-skip">Skip</button><button type="submit" class="primary" id="b-lock" ${s.kind === 'pick' ? 'disabled' : ''}>Lock it in</button></div>`;
    if (s.kind === 'slider') {
      const v0 = posToVal(s, startPos(s));
      el.innerHTML = `<form class="b-box" id="b-form">
        <div class="b-read"><button type="button" id="b-minus" aria-label="Less">−</button>
          <div><div class="big num" id="read">${fmt(v0)}</div><div class="unit" id="sub">${esc(subA(s, v0))}</div></div>
          <button type="button" id="b-plus" aria-label="More">+</button></div>
        ${slider(s)}${actions}</form>`;
      const r = wireSlider(s, v => { $('read').textContent = fmt(v); $('sub').textContent = subA(s, v); });
      const nudge = d => { const step = s.scale === 'lin' ? 1 : 10; r.value = Math.max(0, Math.min(sliderMax(s), +r.value + d * step)); r.dispatchEvent(new Event('input')); };
      $('b-minus').onclick = () => nudge(-1); $('b-plus').onclick = () => nudge(1);
      r.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(posToVal(s, r.value)); } });
      $('b-form').onsubmit = e => { e.preventDefault(); commit(posToVal(s, r.value)); };
    } else {
      el.innerHTML = `<form class="b-box" id="b-form"><fieldset class="b-radios" aria-labelledby="q">${s.options.map((o, n) =>
        `<label><input type="radio" name="pick" value="${esc(o.key)}"><span>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></label>`).join('')}</fieldset>${actions}</form>`;
      el.querySelectorAll('input[type=radio]').forEach(x => x.onchange = () => { S.draft = x.value; S.touched = true; $('b-lock').disabled = false; });
      $('b-form').onsubmit = e => { e.preventDefault(); if (S.draft != null) commit(S.draft); };
    }
    $('b-skip').onclick = skip;
  },
  pickKey(n) { const x = $('input').querySelectorAll('input[type=radio]')[n]; if (x) { x.checked = true; x.dispatchEvent(new Event('change')); x.focus(); } },
  reveal(s, g, j, el) {
    if (s.kind === 'slider') {
      const top = Math.max(s.real, g ?? 0) || 1;
      el.innerHTML = `<div class="cmp">
        <div class="row"><span class="lbl">Your guess</span><span class="val num">${g == null ? 'Skipped' : fmt(g)}</span><div class="barwrap"><span id="bar-g" style="width:${(g ?? 0) / top * 100}%"></span></div></div>
        <div class="row real"><span class="lbl">${esc(s.id === 'days' ? `Days you showed up, of ${fmt(s.max)}` : 'Messages you sent')}</span><span class="val num">${fmt(s.real)}</span><div class="barwrap"><span id="bar-r" style="width:${s.real / top * 100}%"></span></div></div>
        </div><p class="line">${esc(closeLine(s, g, j))}</p>`;
    } else {
      const top = Math.max(...s.options.map(o => o.count));
      el.innerHTML = `<div class="cmp">${s.options.map(o => { const a = o.key === s.real, y = o.key === g;
        return `<div class="row ${a ? 'real' : ''}"><span class="lbl">${esc(o.label)}${a ? ' · the answer' : ''}${y ? ' · your guess' : ''}</span><span class="val num">${fmt(o.count)}</span><div class="barwrap"><span style="width:${o.count / top * 100}%"></span></div></div>`; }).join('')}
        </div><p class="detail">${esc(s.countNoun === 'times' ? 'Times you used each word' : 'Messages each')}</p><p class="line">${esc(closeLine(s, g, j))}</p>`;
    }
    if (!reduced) el.querySelectorAll('.barwrap span').forEach((b, n) => b.animate([{ width: '0%' }, { width: b.style.width }], { duration: 600, delay: 150 + n * 120, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
    fade(el.querySelector('.line'), 600);
  },
};

// ---------- C: Game show ----------
// A 10 second clock starts with the question; the story's bar drains as the clock.
// Sliders: drag the tall vertical meter, then "Final answer". Choices: tapping one buzzes in.
// Time's up: a moved slider is locked in as it stands; an untouched one, or no choice, is skipped.
// "Stop the clock" turns the clock off for this story (timing must be adjustable). Pause also stops it.
IMPL.C = {
  howTo: s => `You have 10 seconds. ${s.kind === 'slider' ? 'Move the slider, then Final answer.' : 'Choose one to answer, or press 1, 2' + (s.options.length > 2 ? ' or 3.' : '.')} Stop the clock is next to the timer.`,
  focus: s => (s.kind === 'slider' ? $('range') : $('q')).focus({ preventScroll: true }),
  input(s, el) {
    const clock = `<div class="c-clock"><div class="c-ring" id="ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" id="ring-fg" cx="32" cy="32" r="28" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><b id="ring-n">10</b></div>
      <button type="button" id="c-stop" aria-pressed="false">Stop the clock</button></div>`;
    if (s.kind === 'slider') {
      const v0 = posToVal(s, startPos(s));
      el.innerHTML = `${clock}<div class="c-slider" style="margin-top:14px">
          <div class="c-board"><div><div class="big num" id="read">${fmt(v0)}</div><div class="unit" id="sub">${esc(subA(s, v0))}</div></div>
            <button type="button" class="primary c-buzz" id="c-buzz">Final answer</button></div>
          ${slider(s, 'vert')}</div>`;
      const r = wireSlider(s, v => { $('read').textContent = fmt(v); $('sub').textContent = subA(s, v); });
      r.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(posToVal(s, r.value)); } });
      $('c-buzz').onclick = () => commit(posToVal(s, r.value));
    } else {
      const two = s.options.length === 2;
      el.innerHTML = `${clock}<div class="c-picks ${two ? 'two' : ''}" role="group" aria-labelledby="q" style="margin-top:14px">${s.options.map((o, n) =>
        `<button type="button" data-key="${esc(o.key)}" aria-keyshortcuts="${n + 1}">${two ? '' : `<kbd aria-hidden="true">${n + 1}</kbd>`}<span>${esc(o.label)}${o.sub ? `<br><small>${esc(o.sub)}</small>` : ''}</span></button>`).join('')}</div>`;
      el.querySelectorAll('.c-picks button').forEach(b => b.onclick = () => commit(b.dataset.key));
    }
    $('c-stop').onclick = () => {
      S.clockOff = !S.clockOff;
      $('c-stop').setAttribute('aria-pressed', String(S.clockOff));
      $('c-stop').textContent = S.clockOff ? 'Start the clock' : 'Stop the clock';
      $('ring').classList.toggle('off', S.clockOff);
      $('ring-n').textContent = S.clockOff ? 'Off' : Math.ceil((CLOCK - S.clock) / 1000);
      announce(S.clockOff ? 'Clock stopped. Take your time.' : `Clock running. ${Math.ceil((CLOCK - S.clock) / 1000)} seconds.`);
    };
    S.clockOff = false;
  },
  second(left) {
    const n = $('ring-n'), fg = $('ring-fg'), ring = $('ring');
    if (!n) return;
    n.textContent = Math.max(0, left);
    fg.setAttribute('stroke-dashoffset', String(100 - Math.max(0, left) * 10));
    ring.classList.toggle('low', left <= 3);
    if (left === 5) announce('5 seconds left.');
    if (left <= 3 && left > 0 && !reduced) ring.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  },
  timeUp() {
    const s = cur();
    S.timeUp = true;
    if (s.kind === 'slider' && S.touched) commit(S.draft); else skip();
  },
  pickKey(n) { const b = $('input').querySelectorAll('.c-picks button')[n]; if (b) commit(b.dataset.key); },
  reveal(s, g, j, el) {
    const stamp = { right: ['Right!', 'right'], close: ['Close', 'close'], off: ['Miss', 'miss'], way: ['Miss', 'miss'], wrong: ['Miss', 'miss'], skipped: ['No answer', 'none'] }[j.tier];
    const ansVal = s.kind === 'slider' ? fmt(s.real) : esc(s.options.find(o => o.key === s.real).label);
    const ansSub = s.kind === 'slider' ? (s.id === 'days' ? `days of ${fmt(s.max)}` : s.many) : `${fmt(s.options.find(o => o.key === s.real).count)} ${s.countNoun}`;
    el.innerHTML = `<div class="c-stamp ${stamp[1]}">${stamp[0]}</div>
      <div class="c-tiles"><div class="c-tile"><span class="lbl">You said</span><span class="val num">${g == null ? '–' : s.kind === 'slider' ? fmt(g) : esc(guessText(s, g))}</span></div>
        <div class="c-tile ans"><span class="lbl">The answer</span><span class="val num" id="ans">${ansVal}</span><span class="lbl">${esc(ansSub)}</span></div></div>
      <p class="line">${esc(closeLine(s, g, j))}</p>`;
    const st = el.querySelector('.c-stamp');
    st.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(1.6) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1) rotate(-3deg)' }], { duration: reduced ? 200 : 360, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' });
    fade(el.querySelector('.c-tile.ans'), 250); fade(el.querySelector('.line'), 600);
    if (s.kind === 'slider') countUp($('ans'), s.real, 700);
  },
};

// ---------- input: pointer (tap zones, hold to pause), keys ----------
const INTERACTIVE = 'button, input, label, a, select, textarea, [role=group]';
let downAt = 0, holdTimer = null;
stage.addEventListener('pointerdown', e => {
  if (e.target.closest(INTERACTIVE)) return;
  downAt = performance.now();
  holdTimer = setTimeout(() => { S.held = true; }, 220);
});
stage.addEventListener('pointerup', e => {
  if (!downAt) return;
  clearTimeout(holdTimer); downAt = 0;
  if (S.held) { S.held = false; return; }
  if (S.phase === 'outro' || S.closed) return;
  const box = $('frame').getBoundingClientRect(), x = (e.clientX - box.left) / box.width;
  if (x < 0.3) prev();
  else if (open()) { if (!IMPL[V].noTapSkip && x > 0.7) skip(); }
  else next();
});
stage.addEventListener('pointercancel', () => { clearTimeout(holdTimer); downAt = 0; S.held = false; });
$('btn-prev').onclick = prev; $('btn-next').onclick = next; $('btn-pause').onclick = () => togglePause(); $('btn-close').onclick = close;

function switchVariant(d) {
  const k = KEYS[(KEYS.indexOf(V) + d + KEYS.length) % KEYS.length];
  const p = new URLSearchParams(location.search); p.set('variant', k); p.set('seed', SEED);
  if (cur()) p.set('story', cur().id); else p.set('story', 'outro');
  location.search = p;
}
$('v-prev').onclick = () => switchVariant(-1); $('v-next').onclick = () => switchVariant(1);
$('v-label').textContent = `${V} · ${VARIANTS[V]}`;

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target, inRange = t.matches?.('input[type=range]'), inRadio = t.matches?.('input[type=radio]'), onButton = t.matches?.('button');
  if (e.key === '[' || e.key === ']') { switchVariant(e.key === ']' ? 1 : -1); return; }
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (S.closed) return;
  if ((e.key === ' ' && !onButton && !inRadio) || e.key === 'k') { e.preventDefault(); togglePause(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (inRange || inRadio) return; // the control owns its arrows while a guess is open
    e.preventDefault(); e.key === 'ArrowLeft' ? prev() : next(); return;
  }
  if (open() && /^[1-3]$/.test(e.key) && cur().kind === 'pick') { e.preventDefault(); IMPL[V].pickKey(+e.key - 1); return; }
  if (open() && (e.key === 's' || e.key === 'S')) { e.preventDefault(); skip(); }
});

// ---------- boot ----------
fetch('../report-fixture.json').then(r => r.json()).then(all => {
  const R = all[PERIOD] || all['2025'];
  ST = buildStories(R);
  $('period').textContent = PERIOD === 'all' ? 'All time' : PERIOD;
  $('player').setAttribute('aria-label', `Your ${PERIOD === 'all' ? 'all time' : PERIOD} reel`);
  const want = Q.get('story'), idx = want === 'outro' ? ST.length : ST.findIndex(s => s.id === want);
  enter(idx < 0 ? 0 : idx);
  requestAnimationFrame(tick);
});
window.__proto = { S, commit, skip, next, prev, enter, togglePause, get ST() { return ST; } };
