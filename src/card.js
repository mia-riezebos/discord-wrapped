/* Share card builder. Pure layout plus a thin canvas painter, so the tests can import it. */
// Every share image comes from one card model:
//   {question?, hero, fact?, chart?: {image, width, height}, bars?: {items: [[label, value, shown]], highlight}, guess?, host}
// chart is an already decoded image of a report chart; bars is a ranked list with the shared row highlighted.
export const CARD_SHAPES = {wide: [1200, 675], tall: [1080, 1920]};

// Sizes per shape. Wide matches the original 16:9 card. Tall scales it up, centres the content and keeps the host
// clear of the bottom of the screen, where story apps put their reply bar.
const SPEC = {
  wide: {P: 64, band: 10, brand: 26, brandY: 74, question: 28, hero: [120, 76], heroMin: 30, fact: 34, factStep: 42, guess: 30, row: 34, host: 28, hostY: 36, foot: 80},
  tall: {P: 96, band: 24, brand: 40, brandY: 160, question: 44, hero: [180, 128], heroMin: 48, fact: 50, factStep: 64, guess: 46, row: 60, host: 44, hostY: 200, foot: 300},
};

// Greedy word wrap. Returns lines; the last kept line ends in an ellipsis when the text runs over maxLines.
function wrap(text, maxW, maxLines, width) {
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? line + ' ' + w : w;
    if (line && width(next) > maxW) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
// Largest size from max down to min at which text fits maxLines lines of maxW.
function fitSize(text, max, min, weight, maxW, maxLines, measure) {
  let size = max;
  for (;; size -= 4) {
    const width = t => measure(t, size, weight), lines = wrap(text, maxW, Infinity, width);
    if (size <= min || lines.length <= maxLines && lines.every(l => width(l) <= maxW)) return Math.max(size, min);
  }
}
// Shorten a single-line label by characters until it fits.
function clipTo(text, maxW, width) {
  let t = text;
  while (t.length > 3 && width(t) > maxW) t = t.slice(0, -2).trimEnd() + '…';
  return t;
}

/**
 * Positions every piece of a card without touching a canvas. measure(text, size, weight) returns the drawn width.
 * Returns {width, height, band, runs, words, chart, bars}: runs are single lines of text with their left x and
 * baseline y; words are one box per word of each run, the targets redaction and tap overlays attach to.
 */
export function layoutCard(model, shape, measure) {
  const [W, H] = CARD_SHAPES[shape], S = SPEC[shape], P = S.P, maxW = W - 2 * P, runs = [];
  const run = (role, text, x, y, size, weight, color) => { runs.push({role, text, x, y, size, weight, color}); return runs.length - 1; };
  const block = (role, text, size, weight, color, maxLines, lh, y) => {
    for (const l of wrap(text, maxW, maxLines, t => measure(t, size, weight))) { run(role, l, P, y, size, weight, color); y += size * lh; }
    return y;
  };
  // Text first, from the brand line down; the tall card shifts it all later to centre the content.
  run('brand', 'Discord Wrapped', P, S.brandY, S.brand, 600, 'muted');
  const graphic = !!(model.chart || model.bars?.items.length);
  const heroSize = fitSize(model.hero, S.hero[graphic ? 1 : 0], S.heroMin, 700, maxW, 2, measure);
  let y = S.brandY;
  if (model.question) y = block('question', model.question, S.question, 600, 'muted', 2, 1.3, y + S.question * 1.6) - S.question * 1.3;
  y = block('hero', model.hero, heroSize, 700, 'fg', 2, 1.06, y + heroSize * 1.2);
  if (model.fact) for (const l of wrap(model.fact, maxW, 2, t => measure(t, S.fact, 400))) { y += 4; run('fact', l, P, y, S.fact, 400, 'muted'); y += S.factStep; }
  if (model.guess) y = block('guess', model.guess, S.guess, 600, 'fg', 2, 1.3, y + S.guess * .4);
  const top = y + 10, bottom = H - S.foot, room = bottom - top;
  let chart = null, bars = null, height = 0;
  if (model.chart && room > 60) {
    const k = Math.min(maxW / model.chart.width, room / model.chart.height);
    chart = {image: model.chart.image, x: P, y: top, w: model.chart.width * k, h: model.chart.height * k};
    height = chart.h;
  } else if (!model.chart && model.bars?.items.length && room >= 60) {
    bars = layoutBars(model.bars, P, top, maxW, room, S.row, measure, run);
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

// A ranked list as horizontal bars, the shared row in the accent colour and the rest quiet. Labels and values are runs.
function layoutBars({items, highlight}, x, top, w, h, maxRow, measure, run) {
  const n = items.length, gap = maxRow / 34 * 6, rh = Math.min(maxRow, (h - gap * (n - 1)) / n), size = Math.round(rh * .62);
  const labelW = Math.min(w * .36, maxRow / 34 * 360), max = Math.max(...items.map(r => r[1])), rows = [];
  items.forEach(([name, v, shown], i) => {
    const y = top + i * (rh + gap), on = i === highlight, weight = on ? 700 : 400, color = on ? 'fg' : 'muted', base = y + rh / 2 + size * .36;
    const value = shown ?? String(v), label = clipTo(name, labelW - 16, t => measure(t, size, weight));
    run('bar-label', label, x, base, size, weight, color);
    run('bar-value', value, x + w - measure(value, size, weight), base, size, weight, color);
    rows.push({x: x + labelW, y: y + 3, w: Math.max(4, (w - labelW - 120) * v / max), h: rh - 6, on});
  });
  return {rows, height: n * rh + (n - 1) * gap};
}

// One box per word: x from the width of the text before it, height from the font size.
function wordsOf(r, runIndex, measure) {
  const out = [];
  for (const m of r.text.matchAll(/\S+/g)) {
    const x = r.x + (m.index ? measure(r.text.slice(0, m.index), r.size, r.weight) : 0);
    out.push({text: m[0], run: runIndex, role: r.role, x, y: r.y - r.size * .82, w: measure(m[0], r.size, r.weight), h: r.size * 1.02});
  }
  return out;
}

/**
 * Draws a card model to a new canvas. theme: {font, colors: {surface, fg, muted, accent, soft}}.
 * Returns {canvas, words} with word boxes in canvas pixels. redaction is reserved for hiding names and quotes.
 */
export function drawCard(model, shape, theme, redaction) {
  const c = document.createElement('canvas'), [W, H] = CARD_SHAPES[shape];
  c.width = W; c.height = H;
  const g = c.getContext('2d'), col = theme.colors, font = (size, weight) => `${weight} ${size}px ${theme.font}`;
  const measure = (t, size, weight) => { g.font = font(size, weight); return g.measureText(t).width; };
  const L = layoutCard(model, shape, measure);
  g.fillStyle = col.surface; g.fillRect(0, 0, W, H);
  g.fillStyle = col.accent; g.fillRect(0, 0, W, L.band);
  if (L.chart) try { g.drawImage(L.chart.image, L.chart.x, L.chart.y, L.chart.w, L.chart.h); } catch { /* The card still works without its chart. */ }
  for (const b of L.bars || []) { g.fillStyle = b.on ? col.accent : col.soft; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 4); g.fill(); }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  for (const r of L.runs) { g.font = font(r.size, r.weight); g.fillStyle = col[r.color]; g.fillText(r.text, r.x, r.y); }
  return {canvas: c, words: L.words};
}
