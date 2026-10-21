// PROTOTYPE (issue #13): three variants of the default theme's look and motion, switchable via ?variant=.
// The player owns timing, controls, progress bars and guess inputs. Scenes only create elements and start
// Web Animations; the player pauses, resumes and skips them through frame.getAnimations({subtree: true}).
import {buildStories, score, fmt} from './facts.js';

addEventListener('unhandledrejection', e => console.error('unhandled', e.reason?.stack || e.reason));
const VARIANTS = [
  {key: 'poster', name: 'Poster'},
  {key: 'kinetic', name: 'Kinetic'},
  {key: 'chart', name: 'Chart hero'},
  {key: 'mix', name: 'Mix'},
];
// Mix: each story uses the look that fits its data best. Chart hero needs a chart with few, chunky marks; a lone
// dramatic value (a date) gets Poster; Kinetic carries everything else, plus the frame, transitions and outro.
const MIX = {messages: 'kinetic', streak: 'chart', 'biggest-day': 'poster', 'top-word': 'chart'};
const params = new URLSearchParams(location.search);
const variant = VARIANTS.find(v => v.key === params.get('variant')) || VARIANTS[0];
const reduced = params.get('motion') === 'reduce' || (params.get('motion') !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const YEAR = 2025;
// A story with a guess shows its picker at once; any other question stays up for 1.5 s, or until its entrance ends.
const ASK_MIN = 1500, REVEAL_MIN = 4000, REVEAL_MAX = 9000;

document.documentElement.dataset.variant = variant.key;
if (variant.key !== 'mix') document.getElementById('theme-css').href = `./theme-${variant.key}.css`;
else {
  // Each look's stylesheet applies only while that look is active, via CSS nesting under [data-look].
  for (const look of ['poster', 'kinetic', 'chart']) {
    const css = await (await fetch(`./theme-${look}.css`)).text();
    document.head.append(Object.assign(document.createElement('style'), {textContent: `[data-look="${look}"] {\n${css}\n}`}));
  }
  document.documentElement.dataset.look = 'kinetic';
}

const $ = s => document.querySelector(s);
const reel = $('.reel'), frame = $('.frame'), stages = $('.stages'), barsEl = $('.bars'), guessEl = $('.guess');
const sr = $('.sr'), pauseBtn = $('.ctl-pause'), closeBtn = $('.ctl-close'), label = $('.ctl-label');
const cta = $('.cta'), outro = $('.outro'), afterEl = $('.after'), sheet = $('.sheet');

const D = (await (await fetch('../report-fixture.json')).json())[String(YEAR)];
const stories = buildStories(D, YEAR, {seed: +(params.get('seed') || 7), fakeTop: params.has('fakeTop')});
const theme = variant.key !== 'mix' ? (await import(`./scenes-${variant.key}.js`)).default : await (async () => {
  const looks = Object.fromEntries(await Promise.all(['poster', 'kinetic', 'chart'].map(async k => [k, (await import(`./scenes-${k}.js`)).default])));
  return {cut: false, hold: 1000, scenes: Object.fromEntries(Object.entries(MIX).map(([id, look]) => [id, looks[look].scenes[id]]))};
})();

// Stand-in for the report behind the frame (the dev server refuses to be framed).
{
  const t = D.totals, m = $('.mock');
  const nums = [['Messages', t.messages], ['Words', t.words], ['Active days', t.activeDays], ['Servers', t.servers], ['Channels', t.channels], ['Longest streak', D.streaks[0][0] + ' days']];
  m.innerHTML = `<header><b>Discord Wrapped</b></header><div class="m-period"><span class="on">Year</span><span>All time</span><b>${YEAR}</b></div>
    <section><h2>Overview</h2><div class="m-nums">${nums.map(([k, v]) => `<div><small>${k}</small><strong>${typeof v === 'number' ? fmt(v) : v}</strong></div>`).join('')}</div>
    <div class="m-chart">${D.days.filter((_, k) => k % 3 === 0).map(([, c]) => `<i style="height:${Math.max(2, c / 13)}%"></i>`).join('')}</div></section>
    <section><h2>Rhythm</h2><div class="m-chart">${D.hourly.map(c => `<i style="height:${Math.max(2, (+c || 0) / Math.max(...D.hourly.map(Number)) * 100)}%"></i>`).join('')}</div></section>`;
}

const state = {i: 0, phase: 'ask', paused: false, guess: null, results: {}, closed: false};
let token = 0, clock = null, guessResolve = null, revealStart = 0;

// progress bars
const segs = stories.map(() => { const s = document.createElement('div'); s.className = 'seg'; s.append(document.createElement('i')); barsEl.append(s); return s; });
function setBars(i) { segs.forEach((s, k) => { s.firstChild.getAnimations().forEach(a => a.cancel()); s.firstChild.style.transform = `scaleX(${k < i ? 1 : 0})`; }); }
function fillBar(i, from, to, duration) {
  const b = segs[i].firstChild;
  b.getAnimations().forEach(a => a.cancel());
  b.style.transform = `scaleX(${from})`;
  b.animate([{transform: `scaleX(${from})`}, {transform: `scaleX(${to})`}], {duration, fill: 'forwards', easing: 'linear'});
}

// timing helpers
const sceneAnims = stage => stage.getAnimations({subtree: true}).filter(a => a.id !== 'clock');
const endOf = anims => anims.reduce((m, a) => { const e = a.effect.getComputedTiming().endTime; return Number.isFinite(e) ? Math.max(m, e) : m; }, 0);
function startClock(stage, duration) {
  const a = stage.animate([], {duration});
  a.id = 'clock';
  return a;
}
// Reduced motion: every scene animation becomes a short crossfade into its own end state, at its own time.
function crossfade(anims) {
  const skip = new Set(['offset', 'easing', 'composite', 'computedOffset']);
  for (const a of anims) {
    const k = a.effect.getKeyframes(); if (!k.length) continue;
    const first = k[0], last = k[k.length - 1], hold = {};
    for (const [p, v] of Object.entries(last)) if (!skip.has(p) && p !== 'opacity') hold[p] = v;
    const o0 = 'opacity' in first ? first.opacity : 0, o1 = 'opacity' in last ? last.opacity : 1;
    const t = a.effect.getTiming();
    a.effect.setKeyframes([{...hold, opacity: o0}, {...hold, opacity: o1}]);
    a.effect.updateTiming({duration: 300, easing: 'linear', iterations: 1, fill: 'both'});
  }
}

const sceneFor = s => theme.scenes[s.id];
const ctxFor = i => ({reduced, i, total: stories.length, year: YEAR, D, prev: stories[i - 1]?.id, next: stories[i + 1]?.id, fmt});

async function play(i) {
  const my = ++token;
  hideGuess(); outro.hidden = true; afterEl.hidden = true; sheet.hidden = true;
  state.i = i; state.phase = 'ask'; state.guess = null; setPaused(false);
  const s = stories[i];
  setBars(i);
  label.textContent = `${YEAR} · ${s.section}`;
  if (variant.key === 'mix') document.documentElement.dataset.look = MIX[s.id] || 'kinetic';
  frame.dataset.story = s.id; frame.dataset.section = s.section.split(' ')[0].toLowerCase();
  const old = [...stages.children];
  // Hard cuts drop the old story at once; other themes keep it underneath until the new ask has entered.
  if (theme.cut) old.forEach(o => o.remove());
  else old.forEach(o => { o.inert = true; o.getAnimations({subtree: true}).forEach(a => { try { a.finish(); } catch { a.cancel(); } }); });
  const stage = document.createElement('div');
  stage.className = 'stage'; stage.dataset.story = s.id;
  stages.append(stage);
  sr.textContent = s.question;

  await sceneFor(s).ask(stage, s, ctxFor(i));
  if (my !== token) return;
  const askAnims = sceneAnims(stage);
  if (reduced) crossfade(askAnims);
  if (!s.guess) {
    const askDur = Math.max(endOf(askAnims), ASK_MIN);
    clock = startClock(stage, askDur);
    fillBar(i, 0, 0.25, askDur);
    try { await clock.finished; } catch {}
    if (my !== token) return;
  } else fillBar(i, 0, 0.25, 0);
  old.forEach(o => o.remove());

  let result = {skipped: true};
  if (s.guess) {
    state.phase = 'guess'; render();
    const raw = await askGuess(s);
    if (my !== token) return;
    result = score(s, raw);
    if (!result.skipped) state.results[s.id] = result;
  }
  hideGuess();
  stage.getAnimations({subtree: true}).forEach(a => { try { a.finish(); } catch {} });

  state.phase = 'reveal'; render();
  const before = new Set(stage.getAnimations({subtree: true}));
  await sceneFor(s).reveal(stage, s, result, ctxFor(i));
  if (my !== token) return;
  const revAnims = sceneAnims(stage).filter(a => !before.has(a));
  if (reduced) crossfade(revAnims);
  const revDur = Math.min(REVEAL_MAX, Math.max(REVEAL_MIN, endOf(revAnims) + (theme.hold ?? 1200)));
  sr.textContent = `${s.answer}.${result.line ? ' ' + result.line : ''}`;
  revealStart = performance.now();
  clock = startClock(stage, revDur);
  fillBar(i, 0.25, 1, revDur);
  try { await clock.finished; } catch {}
  if (my !== token) return;
  // No auto-advance: the story holds on its answer and invites a share. Next (or tapping right) moves on.
  state.phase = 'done'; render();
  afterEl.querySelector('.after-next').firstChild.textContent = i + 1 < stories.length ? 'Next ' : 'Summary ';
  afterEl.hidden = false;
  sr.textContent = 'Share this story, or go to the next one.';
}

/* ---- share sheet ---- */
let cardBlob = null;
const SECTION_COLOR = {Overview: 'c1', Rhythm: 'c4', 'People & servers': 'c3', 'Words & links': 'c2', 'Hall of fame': 'c5'};
function wrap(g, text, max) { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
async function renderStoryCard(s, shape) {
  const [W, H] = shape === 'tall' ? [1080, 1920] : [1200, 675], c = Object.assign(document.createElement('canvas'), {width: W, height: H}), g = c.getContext('2d');
  const css = n => getComputedStyle(frame).getPropertyValue(n).trim(), font = getComputedStyle(document.body).fontFamily, col = SECTION_COLOR[s.section] || 'c1';
  const P = shape === 'tall' ? 90 : 64, k = shape === 'tall' ? 1.6 : 1;
  g.fillStyle = css(`--${col}`); g.fillRect(0, 0, W, H);
  g.fillStyle = css(`--on-${col}`) || '#fff';
  g.font = `700 ${28 * k}px ${font}`; g.fillText(`${YEAR} · ${s.section.toUpperCase()}`, P, P + 20 * k);
  g.font = `600 ${40 * k}px ${font}`;
  let y = P + 110 * k; for (const l of wrap(g, s.question, W - 2 * P)) { g.fillText(l, P, y); y += 50 * k; }
  let size = 150 * k; g.font = `900 ${size}px ${font}`;
  const headline = s.answer.split(',')[0];
  while (g.measureText(headline).width > W - 2 * P && size > 40) { size -= 6; g.font = `900 ${size}px ${font}`; }
  y += size * (shape === 'tall' ? 1.4 : 1.05); g.fillText(headline, P, y);
  g.font = `600 ${34 * k}px ${font}`; y += 60 * k;
  for (const l of wrap(g, s.answer, W - 2 * P).slice(0, 3)) { g.fillText(l, P, y); y += 44 * k; }
  g.font = `700 ${30 * k}px ${font}`; g.fillText(location.port === '8800' ? 'discordwrapped.app' : location.host, P, H - P);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
async function openSheet() {
  const s = stories[state.i], shape = sheet.querySelector('input[name=shape]:checked').value;
  sheet.querySelector('.sheet-text').value = `${s.share} Check yours on discordwrapped.app`;
  cardBlob = await renderStoryCard(s, shape);
  const img = sheet.querySelector('.sheet-img'); URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(cardBlob); img.alt = `Share card: ${s.question} ${s.answer}`;
  sheet.hidden = false; sheet.querySelector('.sheet-close').focus();
}
function closeSheet() { sheet.hidden = true; afterEl.querySelector('.after-share').focus(); }
afterEl.querySelector('.after-share').onclick = openSheet;
afterEl.querySelector('.after-next').onclick = () => next();
sheet.querySelector('.sheet-close').onclick = closeSheet;
sheet.querySelector('.sheet-shape').onchange = openSheet;
sheet.querySelector('.sheet-actions').onclick = async e => {
  const act = e.target.closest('button')?.dataset.act; if (!act) return;
  const file = new File([cardBlob], `discord-wrapped-${stories[state.i].id}.png`, {type: 'image/png'});
  if (act === 'download') { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(cardBlob), download: file.name}); a.click(); }
  if (act === 'copy') navigator.clipboard?.write?.([new ClipboardItem({'image/png': cardBlob})]).catch(() => {});
  if (act === 'native') { const data = {text: sheet.querySelector('.sheet-text').value, files: [file]}; if (navigator.canShare?.(data)) navigator.share(data).catch(() => {}); else e.target.textContent = 'Not supported here'; }
};
// Story auto-advance is off, so the share sheet never fights a timer.

function end() {
  token++;
  state.phase = 'end'; render();
  const guessed = stories.filter(s => s.guess), right = guessed.filter(s => state.results[s.id]?.right).length;
  const answered = guessed.filter(s => state.results[s.id]).length;
  outro.querySelector('.outro-score').textContent = answered ? `${right} of ${guessed.length}` : '–';
  outro.querySelector('.outro-sub').textContent = answered ? `guesses right` : 'No guesses this time';
  if (variant.key === 'mix') document.documentElement.dataset.look = 'kinetic';
  outro.hidden = false;
  outro.querySelector('button').focus();
  sr.textContent = `That was your ${YEAR}. ${answered ? `${right} of ${guessed.length} guesses right.` : ''}`;
}

// ---- guess inputs (player-owned, restyled by theme CSS only) ----
const nice = v => { const p = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
function askGuess(s) {
  const g = s.guess;
  guessEl.innerHTML = '';
  guessEl.dataset.type = g.type;
  return new Promise(resolve => {
    guessResolve = v => { guessResolve = null; resolve(v); };
    if (g.type === 'slider') {
      const toVal = t => nice(g.min * (g.max / g.min) ** (t / 1000));
      guessEl.innerHTML = `<p class="guess-prompt" id="gp">Your guess</p>
        <output class="guess-read" for="gr" aria-hidden="true"></output>
        <input id="gr" type="range" min="0" max="1000" step="1" value="500" aria-labelledby="gp">
        <div class="guess-scale" aria-hidden="true"><span>${fmt(g.min)}</span><span>${fmt(g.max)}</span></div>
        <button type="button" class="guess-go">Lock it in</button>`;
      const r = guessEl.querySelector('input'), out = guessEl.querySelector('output');
      const upd = () => { const v = toVal(+r.value); out.textContent = fmt(v); r.setAttribute('aria-valuetext', `${fmt(v)} ${g.unit}`); guessEl.style.setProperty('--t', r.value / 1000); state.guess = v; render(); };
      r.addEventListener('input', upd); upd();
      guessEl.querySelector('.guess-go').onclick = () => guessResolve?.(toVal(+r.value));
    } else {
      guessEl.innerHTML = `<p class="guess-prompt" id="gp">Pick one</p><div class="guess-picks" role="group" aria-labelledby="gp"></div>`;
      const box = guessEl.querySelector('.guess-picks');
      g.options.forEach((w, k) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'guess-pick'; b.textContent = w;
        b.style.setProperty('--k', k);
        b.onfocus = b.onpointerenter = () => { state.guess = w; render(); };
        b.onclick = () => guessResolve?.(w);
        box.append(b);
      });
    }
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'guess-skip'; skip.textContent = 'Skip';
    skip.onclick = () => guessResolve?.(null);
    guessEl.append(skip);
    guessEl.hidden = false;
    guessEl.querySelector('input, .guess-pick')?.focus({preventScroll: true});
  });
}
function hideGuess() { guessEl.hidden = true; guessEl.innerHTML = ''; if (guessResolve) { const r = guessResolve; guessResolve = null; r(null); } }

// ---- controls ----
function setPaused(p) {
  state.paused = p;
  for (const a of frame.getAnimations({subtree: true})) { if (p && a.playState === 'running') a.pause(); else if (!p && a.playState === 'paused') a.play(); }
  pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
  pauseBtn.dataset.paused = p;
  render();
}
function next() {
  if (state.closed) return;
  if (state.phase === 'end') return;
  if (state.phase === 'ask') { sceneAnims(stages.lastChild).forEach(a => { try { a.finish(); } catch {} }); setPaused(false); clock?.finish(); return; }
  if (state.phase === 'guess') { guessResolve?.(null); return; }
  if (!sheet.hidden) return;
  // During a reveal, the first Next jumps to its end state; the next one moves on.
  if (state.phase === 'reveal') { sceneAnims(stages.lastChild).forEach(a => { try { a.finish(); } catch {} }); clock?.finish(); return; }
  if (state.i + 1 < stories.length) play(state.i + 1); else end();
}
function prev() {
  if (state.closed) return;
  if (state.phase === 'end') return play(stories.length - 1);
  if ((state.phase === 'reveal' && performance.now() - revealStart > 1500) || state.phase === 'done') return play(state.i);
  play(Math.max(0, state.i - 1));
}
function close() {
  if (state.closed) return;
  setPaused(true); state.closed = true; reel.hidden = true; cta.hidden = false; cta.focus(); render();
}
function open(i = 0) { state.closed = false; reel.hidden = false; cta.hidden = true; state.results = {}; play(i); frame.focus({preventScroll: true}); }

let holdTimer = 0, held = false;
for (const [zone, fn] of [[$('.zone-prev'), prev], [$('.zone-next'), next]]) {
  zone.addEventListener('pointerdown', e => { held = false; zone.setPointerCapture(e.pointerId); holdTimer = setTimeout(() => { held = true; setPaused(true); }, 220); });
  zone.addEventListener('pointerup', () => { clearTimeout(holdTimer); if (held) setPaused(false); else fn(); held = false; });
  zone.addEventListener('pointercancel', () => { clearTimeout(holdTimer); if (held) setPaused(false); held = false; });
  zone.addEventListener('click', e => { if (e.detail === 0) fn(); }); // keyboard activation only
  zone.addEventListener('contextmenu', e => e.preventDefault());
}
pauseBtn.onclick = () => setPaused(!state.paused);
closeBtn.onclick = close;
cta.onclick = () => open(0);
outro.querySelector('button').onclick = () => open(0);

addEventListener('keydown', e => {
  const t = e.target, typing = t.matches?.('input, textarea, [contenteditable]');
  if (e.key === '[' || e.key === ']') { const k = VARIANTS.indexOf(variant), n = VARIANTS.length; return go({variant: VARIANTS[(k + (e.key === ']' ? 1 : n - 1)) % n].key}); }
  if (state.closed) return;
  if (e.key === 'Escape') { e.preventDefault(); if (!sheet.hidden) closeSheet(); else close(); }
  else if (typing) return;
  else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  else if (e.key === ' ' && !t.matches?.('button')) { e.preventDefault(); setPaused(!state.paused); }
});

// ---- prototype bar ----
function go(change) { const p = new URLSearchParams(location.search); for (const [k, v] of Object.entries(change)) v == null ? p.delete(k) : p.set(k, v); location.search = p; }
const bar = $('.proto');
bar.querySelector('.p-prev').onclick = () => { const k = VARIANTS.indexOf(variant); go({variant: VARIANTS[(k + VARIANTS.length - 1) % VARIANTS.length].key}); };
bar.querySelector('.p-next').onclick = () => { const k = VARIANTS.indexOf(variant); go({variant: VARIANTS[(k + 1) % VARIANTS.length].key}); };
bar.querySelector('.p-motion').onclick = () => go({motion: reduced ? 'full' : 'reduce'});
bar.querySelector('.p-name').textContent = `${String.fromCharCode(65 + VARIANTS.indexOf(variant))} · ${variant.name}`;
function render() {
  const s = stories[state.i];
  frame.dataset.phase = state.phase;
  const g = state.guess == null ? '–' : typeof state.guess === 'number' ? fmt(state.guess) : `“${state.guess}”`;
  const res = s && state.results[s.id];
  bar.querySelector('.p-state').textContent = state.closed ? 'closed' :
    `${state.phase === 'end' ? 'outro' : `${state.i + 1}/${stories.length} ${s.id}`} · ${state.phase}${state.paused ? ' (paused)' : ''} · guess ${g}${res ? (res.right ? ' ✓' : ' ✗') : ''}`;
  bar.querySelector('.p-motion').textContent = reduced ? 'Motion: reduced' : 'Motion: full';
  Object.assign(window.__proto ??= {}, {state, variant: variant.key, reduced});
}
window.__proto = {state, play, next, prev, setPaused, stories};

const startAt = Math.max(0, stories.findIndex(s => s.id === params.get('story')));
open(startAt);
