// PROTOTYPE (issue #20). Gallery: every story's card in both shapes, the post text under it, redaction in both.
import {buildStories, score, plain, fmt} from './facts.js';
import {drawCard, tokens, guessPost, SIZES} from './card.js';

const VARIANTS = {
  A: {name: 'Scene still', guess: 'none', mark: 'bar'},
  B: {name: 'Report card', guess: 'line', mark: 'scribble'},
  C: {name: 'Poster + sticker', guess: 'sticker', mark: 'hatch'},
};
const KEYS = Object.keys(VARIANTS);
const params = new URLSearchParams(location.search);
const st = {
  variant: VARIANTS[params.get('variant')?.toUpperCase()] ? params.get('variant').toUpperCase() : 'A',
  guess: params.get('guess'), mark: params.get('mark'),
  shape: params.get('shape') || 'both', result: params.get('result') || 'mix', period: params.get('period') || '2025',
  names: params.get('names') === '1', quotes: params.get('quotes') === '1', sample: params.get('marks') === '1', hits: false,
};
const MIX = {messages: 'wrong', 'night-owl': 'right', 'top-dm': 'wrong', 'top-word': 'right'};
const CTA = ' Check yours on discordwrapped.app';

const F = await (await fetch('../report-fixture.json')).json();
let stories = [], red = {};
const load = () => {
  stories = buildStories(F[st.period], st.period, {seed: 7});
  red = Object.fromEntries(stories.map(s => [s.id, {words: new Set(), over: new Map()}]));
};
load();

const v = () => ({...VARIANTS[st.variant], ...(st.guess && {guess: st.guess}), ...(st.mark && {mark: st.mark})});
const resultFor = s => {
  if (!s.guess) return null;
  const how = st.result === 'mix' ? MIX[s.id] || 'right' : st.result;
  return how === 'skip' ? score(s, null) : score(s, s.guess.samples[how]);
};
// The owner's sample: names and quotes off the card, plus one tapped word (the period, or the first word of the sub).
const sampleWord = s => st.period !== 'all' && s.question.includes(st.period) ? st.period : tokens(s.sub).find(t => !t.punct && !t.kind)?.key;

function hiddenFor(s) {
  const R = red[s.id], names = st.names || st.sample, quotes = st.quotes || st.sample;
  return t => {
    if (t.kind === 'N' || t.kind === 'P') { const o = R.over.get(t.ent); return o ?? (t.kind === 'P' || names); }
    if (R.words.has(t.key) || (st.sample && t.key === sampleWord(s) && !R.over.has('w:' + t.key))) return true;
    if (t.kind === 'Q') { const o = R.over.get(t.ent); return o ?? quotes; }
    return false;
  };
}
function tap(s, toks, hidden) {
  const R = red[s.id];
  if (hidden) for (const t of toks) {
    if (t.ent) R.over.set(t.ent, false);
    R.words.delete(t.key); R.over.set('w:' + t.key, true);
  } else {
    const t = toks[0];
    if (t.kind === 'N' || t.kind === 'P') R.over.set(t.ent, true); else { R.words.add(t.key); R.over.delete('w:' + t.key); }
  }
  renderStory(s);
}

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const font = getComputedStyle(document.body).fontFamily;
const gallery = document.getElementById('gallery');

function cardFigure(s, shape) {
  const fig = document.createElement('figure');
  fig.innerHTML = `<div class="cardwrap"><canvas role="img"></canvas></div>
    <figcaption><span>${shape === 'tall' ? '9:16 · 1080 × 1920' : '16:9 · 1200 × 675'}</span><button type="button">Download PNG</button></figcaption>`;
  const canvas = fig.querySelector('canvas'), wrap = fig.querySelector('.cardwrap'), hidden = hiddenFor(s), r = resultFor(s), V = v();
  const boxes = drawCard(canvas, s, r, shape, {layout: st.variant, guess: V.guess, mark: V.mark, isHidden: hidden, css, font,
    period: st.period === 'all' ? 'All time' : st.period});
  const [W, H] = SIZES[shape];
  canvas.setAttribute('aria-label', `Share card, ${shape === 'tall' ? 'portrait' : 'landscape'}. Words on it follow as buttons.`);
  // Each word the canvas drew gets a real-text button over it; taps black it out (or bring it back) on card and post.
  const shown = wrap.clientWidth || (shape === 'tall' ? 300 : 640), minH = 24 * W / shown;
  for (const b of boxes) {
    const u = b.unit, word = u.toks.map(t => t.core).join(' '), h = Math.max(b.h, minH), y = b.y - (h - b.h) / 2;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hit'; btn.textContent = u.hidden ? '████' : word;
    btn.setAttribute('aria-pressed', u.hidden);
    btn.setAttribute('aria-label', u.hidden ? 'Hidden word. Show it' : `Black out “${word}”`);
    btn.title = u.hidden ? 'Tap to show' : 'Tap to black out';
    Object.assign(btn.style, {left: (b.x - 3) / W * 100 + '%', top: y / H * 100 + '%', width: (b.w + 6) / W * 100 + '%', height: h / H * 100 + '%'});
    btn.onclick = () => tap(s, u.toks, u.hidden);
    wrap.append(btn);
  }
  fig.querySelector('figcaption button').onclick = () => canvas.toBlob(blob => {
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `discord-wrapped-${s.id}-${shape}.png`}); a.click();
  });
  return fig;
}
function postHTML(s) {
  const hidden = hiddenFor(s), r = resultFor(s), V = v();
  const toks = tokens([...s.share, ...(V.guess !== 'none' ? guessPost(s, r) : [])]);
  const box = document.createElement('div'); box.className = 'post-text';
  // merge consecutive hidden words, as the card does
  const us = [];
  for (const t of toks) { const h = !t.punct && hidden(t), p = us[us.length - 1]; if (h && p?.hidden && !p.toks.at(-1).post) p.toks.push(t); else us.push({toks: [t], hidden: h}); }
  us.forEach((u, i) => {
    const t0 = u.toks[0], tl = u.toks.at(-1);
    if (i && t0.sp) box.append(' ');
    if (t0.punct) { box.append(t0.core); return; }
    const w = document.createElement('span'); w.style.whiteSpace = 'nowrap';
    w.append(u.hidden ? '' : t0.pre);
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = u.hidden ? '████' : t0.core; b.setAttribute('aria-pressed', u.hidden);
    b.setAttribute('aria-label', u.hidden ? 'Hidden word. Show it' : `Black out “${t0.core}”`);
    b.onclick = () => tap(s, u.toks, u.hidden);
    w.append(b, tl.post); box.append(w);
  });
  const cta = document.createElement('span'); cta.className = 'cta'; cta.textContent = CTA; box.append(cta);
  return box;
}
const nodes = {};
function renderStory(s) {
  let sec = nodes[s.id];
  if (!sec) { sec = nodes[s.id] = document.createElement('section'); sec.className = 'story'; gallery.append(sec); }
  sec.innerHTML = `<h2>${s.label}<small>${s.section}${s.guess ? ' · guess' : ''}</small></h2>`;
  if (st.shape !== 'wide') sec.append(cardFigure(s, 'tall'));
  if (st.shape !== 'tall') sec.append(cardFigure(s, 'wide'));
  const post = document.createElement('div'); post.className = 'post';
  post.innerHTML = `<span class="lbl">Post text</span>`;
  post.append(postHTML(s));
  const r = resultFor(s);
  const facts = document.createElement('p'); facts.className = 'facts';
  facts.textContent = `Question: ${s.question} Answer: ${plain(s.hero.rich || [s.hero.text])}, ${plain(s.unit)}.` + (r ? r.skipped ? ' Guess skipped.' : ` Guess: ${typeof r.value === 'number' ? fmt(r.value) : r.value} (${r.right ? 'right' : 'wrong'}).` : '');
  post.append(facts);
  sec.append(post);
}
function renderAll() {
  document.documentElement.dataset.shape = st.shape;
  document.body.classList.toggle('show-hits', st.hits);
  gallery.innerHTML = ''; for (const k in nodes) delete nodes[k];
  stories.forEach(renderStory);
  sync();
}
function sync() {
  const V = v(), p = new URLSearchParams();
  p.set('variant', st.variant);
  if (st.guess) p.set('guess', st.guess); if (st.mark) p.set('mark', st.mark);
  if (st.shape !== 'both') p.set('shape', st.shape); if (st.result !== 'mix') p.set('result', st.result); if (st.period !== '2025') p.set('period', st.period);
  if (st.names) p.set('names', 1); if (st.quotes) p.set('quotes', 1); if (st.sample) p.set('marks', 1);
  history.replaceState(null, '', '?' + p);
  document.querySelector('.p-name').textContent = `${st.variant} (${V.name})`;
  document.querySelector('.p-state').textContent = `guess: ${V.guess} · marks: ${V.mark} · ${st.result} · ${st.period} · ${stories.length} stories${st.sample ? ' · sample marks' : ''}${st.names ? ' · names hidden' : ''}${st.quotes ? ' · quotes hidden' : ''}`;
  document.querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', st[g.dataset.param] === b.dataset.v)));
  document.querySelectorAll('[data-tog]').forEach(i => i.checked = st[i.dataset.tog]);
}

document.querySelectorAll('.seg').forEach(g => g.onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  st[g.dataset.param] = b.dataset.v;
  if (g.dataset.param === 'period') load();
  renderAll();
});
document.querySelectorAll('[data-tog]').forEach(i => i.onchange = () => {
  st[i.dataset.tog] = i.checked;
  // A toggle is the master switch for its kind: it clears taps that overrode it.
  if (i.dataset.tog === 'names') Object.values(red).forEach(R => [...R.over.keys()].filter(k => /^[NP]:/.test(k)).forEach(k => R.over.delete(k)));
  if (i.dataset.tog === 'quotes') Object.values(red).forEach(R => [...R.over.keys()].filter(k => /^Q:/.test(k)).forEach(k => R.over.delete(k)));
  renderAll();
});
const step = d => { st.variant = KEYS[(KEYS.indexOf(st.variant) + d + KEYS.length) % KEYS.length]; st.guess = st.mark = null; renderAll(); };
document.querySelector('.p-prev').onclick = () => step(-1);
document.querySelector('.p-next').onclick = () => step(1);
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'm') { st.sample = !st.sample; renderAll(); }
  else if (e.key === 'g') { const o = ['mix', 'right', 'wrong', 'skip']; st.result = o[(o.indexOf(st.result) + 1) % 4]; renderAll(); }
  else if (e.key === 's') { const o = ['both', 'tall', 'wide']; st.shape = o[(o.indexOf(st.shape) + 1) % 3]; renderAll(); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderAll, 200); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
renderAll();
