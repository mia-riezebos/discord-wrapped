/* Share card builder. Pure layout plus a thin canvas painter, so the tests can import it. */
// Every share image comes from one card model:
//   {question?, hero, fact?, lines?, chart?: {image, width, height}, columns?: {items: [[label, value]], highlight},
//    bars?: {items: [[label, value, shown]], highlight}, guess?, host}
// chart is an already decoded image of a report chart; columns is a story's chart in the report's buckets; bars is a
// ranked list with the shared row highlighted; lines are short single lines under the fact (a reel's summary).
// Text fields are strings, or lists of card words {text, hidden?, pre?, post?, ref?} once redaction has run
// (redactCard): a hidden word draws as a fixed-width scribble between its pre and post punctuation.
export const CARD_SHAPES = {wide: [1200, 675], tall: [1080, 1920]};

// Sizes per shape. Wide matches the original 16:9 card. Tall scales it up, centres the content and keeps the host
// clear of the bottom of the screen, where story apps put their reply bar.
const SPEC = {
  wide: {P: 64, band: 10, brand: 26, brandY: 74, question: 28, hero: [120, 76], heroMin: 30, fact: 34, factStep: 42, guess: 30, row: 34, host: 28, hostY: 36, foot: 80},
  tall: {P: 96, band: 24, brand: 40, brandY: 160, question: 44, hero: [180, 128], heroMin: 48, fact: 50, factStep: 64, guess: 46, row: 60, host: 44, hostY: 200, foot: 300},
};

const asWords = v => Array.isArray(v) ? v : String(v ?? '').split(/\s+/).filter(Boolean).map(text => ({text}));
const withEllipsis = w => w.hidden ? {...w, text: w.text + '…', post: (w.post || '') + '…'} : {...w, text: w.text + '…'};
// A mark is the same width whatever it hides, so its length gives nothing away.
const markW = size => size * 2.2;
// Width of a line of words at one size and weight, a single space between words.
const lineWidth = (ws, size, weight, measure) => ws.reduce((a, w, i) => a + (i ? measure(' ', size, weight) : 0)
  + (w.hidden ? measure(w.pre || '', size, weight) + markW(size) + measure(w.post || '', size, weight) : measure(w.text, size, weight)), 0);

// Greedy word wrap. Returns lines of words; the last kept line ends in an ellipsis when the text runs over maxLines.
function wrap(words, maxW, maxLines, width) {
  const out = [];
  let line = [];
  for (const w of words) {
    if (line.length && width([...line, w]) > maxW) { out.push(line); line = [w]; } else line.push(w);
  }
  if (line.length) out.push(line);
  if (out.length > maxLines) {
    out.length = maxLines;
    const last = out[maxLines - 1].slice(0, -1);
    out[maxLines - 1] = last.length ? [...last.slice(0, -1), withEllipsis(last.at(-1))] : [{text: '…'}];
  }
  return out;
}
// Largest size from max down to min at which text fits maxLines lines of maxW.
function fitSize(words, max, min, weight, maxW, maxLines, measure) {
  let size = max;
  for (;; size -= 4) {
    const width = ws => lineWidth(ws, size, weight, measure), lines = wrap(words, maxW, Infinity, width);
    if (size <= min || lines.length <= maxLines && lines.every(l => width(l) <= maxW)) return Math.max(size, min);
  }
}
// Shorten a single-line label by characters until it fits. A mark is never cut; it drops whole.
function clipTo(words, maxW, width) {
  let ws = words;
  while (width(ws) > maxW) {
    const last = ws.at(-1), core = last.text.replace(/…$/, '');
    if (!last.hidden && core.length > 2) ws = [...ws.slice(0, -1), {...last, text: core.slice(0, -2).trimEnd() + '…'}];
    else if (ws.length > 1) ws = [...ws.slice(0, -2), withEllipsis(ws.at(-2))];
    else break;
  }
  return ws;
}

/**
 * Positions every piece of a card without touching a canvas. measure(text, size, weight) returns the drawn width.
 * Returns {width, height, band, runs, words, chart, bars}: runs are single lines of text (as text and as card words)
 * with their left x and baseline y; words are one box per word of each run, the targets tap overlays attach to.
 */
export function layoutCard(model, shape, measure) {
  const [W, H] = CARD_SHAPES[shape], S = SPEC[shape], P = S.P, maxW = W - 2 * P, runs = [];
  const width = (size, weight) => ws => lineWidth(ws, size, weight, measure);
  const run = (role, words, x, y, size, weight, color) => {
    const ws = asWords(words);
    runs.push({role, text: ws.map(w => w.text).join(' '), words: ws, x, y, size, weight, color});
    return runs.length - 1;
  };
  const block = (role, text, size, weight, color, maxLines, lh, y) => {
    for (const l of wrap(asWords(text), maxW, maxLines, width(size, weight))) { run(role, l, P, y, size, weight, color); y += size * lh; }
    return y;
  };
  // Text first, from the brand line down; the tall card shifts it all later to centre the content.
  run('brand', 'Discord Wrapped', P, S.brandY, S.brand, 600, 'muted');
  const graphic = !!(model.chart || model.bars?.items.length || model.columns?.items.length || model.lines?.length);
  const heroSize = fitSize(asWords(model.hero), S.hero[graphic ? 1 : 0], S.heroMin, 700, maxW, 2, measure);
  let y = S.brandY;
  if (model.question) y = block('question', model.question, S.question, 600, 'muted', 2, 1.3, y + S.question * 1.6) - S.question * 1.3;
  y = block('hero', model.hero, heroSize, 700, 'fg', 2, 1.06, y + heroSize * 1.2);
  if (model.fact) for (const l of wrap(asWords(model.fact), maxW, 2, width(S.fact, 400))) { y += 4; run('fact', l, P, y, S.fact, 400, 'muted'); y += S.factStep; }
  // Lines share the room left above the guess and the footer: they shrink to 70% before the last ones are dropped.
  const lines = model.lines || [], room0 = H - S.foot - y - (model.guess ? S.guess * 3.3 : 0);
  const lineSize = Math.max(S.fact * .7, Math.min(S.fact, room0 / (lines.length * 1.4)));
  for (const l of lines.slice(0, Math.floor(room0 / (lineSize * 1.4)))) y = block('line', l, lineSize, 600, 'fg', 1, 1.4, y + lineSize * 1.4) - lineSize * 1.4;
  if (model.guess) y = block('guess', model.guess, S.guess, 600, 'fg', 2, 1.3, y + S.guess * (model.lines ? 2 : .4));
  const top = y + 10, bottom = H - S.foot, room = bottom - top;
  let chart = null, bars = null, height = 0;
  if (model.columns?.items.length && room >= 120) {
    bars = layoutColumns(model.columns, P, top + S.row * .4, maxW, Math.min(room, S.row * 12) - S.row * .4, S.row, measure, width, run);
    height = bars.height + S.row * .4;
  } else if (model.chart && room > 60) {
    const k = Math.min(maxW / model.chart.width, room / model.chart.height);
    chart = {image: model.chart.image, x: P, y: top, w: model.chart.width * k, h: model.chart.height * k};
    height = chart.h;
  } else if (!model.chart && model.bars?.items.length && room >= 60) {
    bars = layoutBars(model.bars, P, top, maxW, room, S.row, measure, width, run);
    height = bars.height;
  }
  // Tall cards centre everything above the footer.
  if (shape === 'tall') {
    const from = S.brandY - S.brand, dy = Math.max(0, S.band + (bottom - S.band - (top + height - from)) / 2 - from);
    for (const r of runs) r.y += dy;
    if (chart) chart.y += dy;
    if (bars) for (const r of bars.rows) r.y += dy;
  }
  run('host', model.host, P, H - S.hostY, S.host, 600, 'accent');
  return {width: W, height: H, band: S.band, runs, words: runs.flatMap((r, i) => wordsOf(r, i, measure)), chart, bars: bars?.rows || null};
}

// A chart in the report's buckets as columns, labels under them and the top bucket in the accent colour with its count
// above it. Labels shrink to fit the column width.
function layoutColumns({items, highlight}, x, top, w, h, maxRow, measure, width, run) {
  const n = items.length, cw = w / n, gap = Math.min(cw * .25, maxRow * .4), max = Math.max(1, ...items.map(r => r[1])), rows = [];
  const size = Math.max(10, Math.min(Math.round(maxRow * .6), ...items.map(([l]) => Math.floor(maxRow * .6 * (cw - 4) / Math.max(1, width(maxRow * .6, 400)(asWords(l)))))));
  const plot = h - size * 1.6, value = highlight >= 0 ? String(Number(items[highlight][1]).toLocaleString()) : '', head = value ? size * 1.5 : 0;
  items.forEach(([label, v], i) => {
    const on = i === highlight, bh = Math.max(4, (plot - head) * v / max), cx = x + i * cw, color = on ? 'fg' : 'muted', weight = on ? 700 : 400;
    rows.push({x: cx + gap / 2, y: top + plot - bh, w: cw - gap, h: bh, on});
    const ws = clipTo(asWords(label), cw - 2, width(size, weight));
    run('col-label', ws, cx + (cw - width(size, weight)(ws)) / 2, top + h - size * .3, size, weight, color);
    if (on) run('col-value', value, Math.min(Math.max(x, cx + cw / 2 - measure(value, size, 700) / 2), x + w - measure(value, size, 700)), top + plot - bh - size * .45, size, 700, 'fg');
  });
  return {rows, height: h};
}

// A ranked list as horizontal bars, the shared row in the accent colour and the rest quiet. Labels and values are runs.
function layoutBars({items, highlight}, x, top, w, h, maxRow, measure, width, run) {
  const n = items.length, gap = maxRow / 34 * 6, rh = Math.min(maxRow, (h - gap * (n - 1)) / n), size = Math.round(rh * .62);
  const labelW = Math.min(w * .36, maxRow / 34 * 360), max = Math.max(...items.map(r => r[1])), rows = [];
  // The value column fits the widest value, set bold, plus the gap between rows.
  const valueW = Math.max(...items.map(([, v, shown]) => measure(shown ?? String(v), size, 700))) + gap * 2;
  items.forEach(([name, v, shown], i) => {
    const y = top + i * (rh + gap), on = i === highlight, weight = on ? 700 : 400, color = on ? 'fg' : 'muted', base = y + rh / 2 + size * .36;
    const value = shown ?? String(v), label = clipTo(asWords(name), labelW - 16, width(size, weight));
    run('bar-label', label, x, base, size, weight, color);
    run('bar-value', value, x + w - measure(value, size, weight), base, size, weight, color);
    rows.push({x: x + labelW, y: y + 3, w: Math.max(4, (w - labelW - valueW) * v / max), h: rh - 6, on});
  });
  return {rows, height: n * rh + (n - 1) * gap};
}

// One box per word: x from the width of the words before it, height from the font size. A hidden word's box covers
// its mark and punctuation; ref is whatever the model attached to the word, so a tap knows what to flip.
function wordsOf(r, runIndex, measure) {
  let x = r.x;
  return r.words.map(word => {
    const w = lineWidth([word], r.size, r.weight, measure), box = {text: word.text, run: runIndex, role: r.role, x, y: r.y - r.size * .82, w, h: r.size * 1.02};
    if (word.hidden) box.hidden = true;
    if (word.ref) box.ref = word.ref;
    x += w + measure(' ', r.size, r.weight);
    return box;
  });
}

/**
 * Draws a card model to a new canvas. theme: {font, colors: {surface, fg, muted, accent, soft}}. redaction, when
 * given, maps the model to the one to draw (share.js passes redactCard with the sheet's state).
 * Returns {canvas, words} with word boxes in canvas pixels.
 */
export function drawCard(model, shape, theme, redaction) {
  const c = document.createElement('canvas'), [W, H] = CARD_SHAPES[shape];
  c.width = W; c.height = H;
  const g = c.getContext('2d'), col = theme.colors, font = (size, weight) => `${weight} ${size}px ${theme.font}`;
  const measure = (t, size, weight) => { g.font = font(size, weight); return g.measureText(t).width; };
  const L = layoutCard(redaction ? redaction(model) : model, shape, measure);
  g.fillStyle = col.surface; g.fillRect(0, 0, W, H);
  g.fillStyle = col.accent; g.fillRect(0, 0, W, L.band);
  if (L.chart) try { g.drawImage(L.chart.image, L.chart.x, L.chart.y, L.chart.w, L.chart.h); } catch { /* The card still works without its chart. */ }
  for (const b of L.bars || []) { g.fillStyle = b.on ? col.accent : col.soft; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 4); g.fill(); }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  // Word by word at the layout's boxes, so what's drawn lines up with the tap targets.
  let k = 0;
  for (const r of L.runs) for (const word of r.words) {
    const w = L.words[k++];
    g.font = font(r.size, r.weight); g.fillStyle = col[r.color];
    if (!word.hidden) { g.fillText(word.text, w.x, r.y); continue; }
    const pre = word.pre || '', post = word.post || '', at = w.x + measure(pre, r.size, r.weight);
    if (pre) g.fillText(pre, w.x, r.y);
    // Inset like a glyph's side bearings, so the mark doesn't touch its neighbours.
    scribble(g, at + r.size * .1, r.y - r.size * .74, markW(r.size) - r.size * .2, r.size * .9, col.fg, w.x * 7 + r.y);
    if (post) g.fillText(post, at + markW(r.size), r.y);
  }
  return {canvas: c, words: L.words};
}

// A felt-tip scribble: two passes of tight zigzags across the box. Seeded by position, never by the hidden text, so
// two marks over the same word don't match.
function scribble(g, x, y, w, h, ink, seed) {
  let n = seed >>> 0 || 1;
  const rand = () => (n = Math.imul(n ^ n >>> 15, 2246822507) + 0x9e3779b9 >>> 0) / 2 ** 32;
  const lw = h * .2, steps = Math.max(4, Math.round(w / (h * .2)));
  g.save(); g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = g.lineJoin = 'round'; g.beginPath();
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i <= steps; i++) {
    const f = pass ? 1 - i / steps : i / steps, px = x + lw / 2 + f * (w - lw) + (rand() - .5) * h * .08;
    const py = y + h * (i % 2 ? .08 + rand() * .08 : .84 + rand() * .08);
    if (i || pass) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.stroke(); g.restore();
}
