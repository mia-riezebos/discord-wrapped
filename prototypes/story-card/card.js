// PROTOTYPE (issue #20). One card builder: drawCard(canvas, story, result, opts) paints a story's facts onto a
// canvas and returns where it drew every word, so the DOM preview can lay real text and tap targets over it.
// Three layouts (A, B, C) disagree about what goes on the card; guess and mark styles can be mixed with ?guess= and
// ?mark=. Scenes are never captured.
import {fmt, P as Priv} from './facts.js';

export const SIZES = {tall: [1080, 1920], wide: [1200, 675]};
export const SECTION_COLOR = {Overview: 'c1', Rhythm: 'c4', 'People & servers': 'c3', 'Words & links': 'c2', 'Hall of fame': 'c5'};
const HOST = 'discordwrapped.app';

/* ---------- rich text → tokens ---------- */
// A token is one word: {pre, core, post, kind, ent, key, sp}. sp says whether a space comes before it.
export function tokens(rich) {
  const out = []; let space = false;
  for (const r of rich) {
    const s = typeof r === 'string' ? r : r.t, kind = typeof r === 'string' ? null : r.kind;
    const ent = kind ? kind + ':' + (r.id ?? s).toLowerCase() : null;
    for (const part of s.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { space = true; continue; }
      const m = part.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
      let [, pre, core, post] = m;
      if (!core) { core = part; pre = post = ''; }
      out.push({pre, core, post, kind, ent, key: core.toLowerCase(), sp: space && out.length > 0, punct: !/[\p{L}\p{N}]/u.test(core)});
      space = false;
    }
  }
  return out;
}
// Consecutive hidden words merge into one mark, so a mark doesn't tell how many words it covers.
function units(toks, isHidden) {
  const out = [];
  for (const t of toks) {
    const h = (!t.punct || t.kind) && isHidden(t), prev = out[out.length - 1];
    if (h && prev?.hidden && !prev.post) { prev.toks.push(t); continue; }
    out.push({toks: [t], hidden: h, sp: t.sp, pre: t.pre, core: t.core, post: t.post, hl: t.hl});
  }
  for (const u of out) if (u.hidden) {
    // A hidden name loses its punctuation too ("[prism-plaza]" is one name); other words keep theirs.
    const name = u.toks.every(t => t.kind === 'N' || t.kind === 'P');
    u.pre = ''; u.post = name ? '' : u.toks[u.toks.length - 1].post; u.core = u.toks.map(t => t.core).join(' ');
  }
  out.forEach((u, i) => { u.padL = u.hl && !out[i - 1]?.hl; u.padR = u.hl && !out[i + 1]?.hl; });
  return out;
}

/* ---------- drawing context ---------- */
function mk(canvas, shape, opts) {
  const [W, H] = SIZES[shape];
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  return {g, W, H, tall: shape === 'tall', k: shape === 'tall' ? 1.6 : 1, boxes: [], occupied: [], ...opts};
}
function setFont(c, size, weight) {
  c.g.font = `${weight} ${size}px ${c.font}`;
  c.g.letterSpacing = weight >= 800 && size > 60 ? `${(-0.035 * size).toFixed(1)}px` : '0px';
}
const markW = size => size * 2.2;
function unitW(c, u, size) {
  const g = c.g;
  return g.measureText(u.pre).width + (u.hidden ? markW(size) : g.measureText(u.core).width) + g.measureText(u.post).width + ((u.padL ? 1 : 0) + (u.padR ? 1 : 0)) * size * .18;
}
// Lay units into lines no wider than maxW. Returns {lines, fits}.
function layout(c, us, size, maxW) {
  const sp = c.g.measureText(' ').width, lines = [{units: [], width: 0}];
  for (const u of us) {
    const w = unitW(c, u, size), line = lines[lines.length - 1], gap = line.units.length && u.sp ? sp : 0;
    if (line.units.length && u.sp && line.width + gap + w > maxW) lines.push({units: [u], width: w});
    else { line.units.push(u); line.width += gap + w; }
  }
  return {lines, fits: lines.every(l => l.width <= maxW + 1)};
}
// Fit text: shrink from max to min until it fits maxW in maxLines (and maxH if given), then truncate with an ellipsis.
function fit(c, toks, {max, min = 18, weight = 700, maxW, maxLines = 2, maxH = Infinity, lh = 1.12}) {
  const us = units(toks, c.isHidden);
  let size = max, r;
  for (;;) {
    setFont(c, size, weight); r = layout(c, us, size, maxW);
    if ((r.fits && r.lines.length <= maxLines && r.lines.length * size * lh <= maxH) || size <= min) break;
    size = Math.max(min, Math.floor(size * .94));
  }
  if (r.lines.length > maxLines) {
    r.lines.length = maxLines;
    const last = r.lines[maxLines - 1], u = last.units[last.units.length - 1];
    last.units[last.units.length - 1] = {...u, post: u.post + '…'};
  }
  return {lines: r.lines, size, weight, lh};
}
// Draw fitted text with its first baseline at y. Returns the bottom of the block.
function draw(c, block, x, y, color, {align = 'left', maxW = 0, back, bounce, hlFill, hlInk, bg} = {}) {
  const g = c.g, {lines, size, weight, lh} = block;
  setFont(c, size, weight);
  const sp = g.measureText(' ').width, top = y - size * .8, base = c.markBg;
  lines.forEach((l, li) => {
    let cx = align === 'center' ? x + (maxW - l.width) / 2 : x;
    const [ink, lineBg] = back ? back(li, cx, y, l.width, size) : [color, bg];
    l.units.forEach((u, ui) => {
      if (ui && u.sp) cx += sp;
      if (u.hl && (ui === 0 || !l.units[ui - 1].hl)) {
        // one colour pill behind the whole run of highlighted words on this line
        let w = 0; for (let j = ui; j < l.units.length && l.units[j].hl; j++) w += (j > ui && l.units[j].sp ? sp : 0) + unitW(c, l.units[j], size);
        g.fillStyle = hlFill; g.beginPath(); g.roundRect(cx, y - size * .86, w, size * 1.08, size * .2); g.fill();
      }
      if (u.padL) cx += size * .18;
      const fg = u.hl ? hlInk : ink;
      c.markBg = u.hl ? hlFill : lineBg || base;
      g.fillStyle = fg; g.fillText(u.pre, cx, y); cx += g.measureText(u.pre).width;
      const cw = u.hidden ? markW(size) : g.measureText(u.core).width;
      if (u.hidden) drawMark(c, cx, y - size * .74, cw, size * .9, fg, u.core);
      else if (bounce) {
        let bx = cx;
        [...u.core].forEach((ch, i) => { g.save(); g.translate(bx, y + (i % 2 ? -1 : 1) * size * .025); g.rotate((i % 3 - 1) * .035); g.fillText(ch, 0, 0); g.restore(); bx += g.measureText(ch).width; });
      } else g.fillText(u.core, cx, y);
      if (!u.toks[0].punct) c.boxes.push({x: cx, y: y - size * .82, w: cw, h: size * 1.02, unit: u, size});
      cx += cw; g.fillStyle = fg; g.fillText(u.post, cx, y); cx += g.measureText(u.post).width + (u.padR ? size * .18 : 0);
    });
    y += size * lh;
  });
  const bottom = top + lines.length * size * lh;
  c.markBg = base;
  c.occupied.push({x, y: top, w: align === 'center' ? maxW : Math.max(...lines.map(l => l.width)), h: bottom - top});
  return bottom;
}

/* ---------- redaction marks ---------- */
function seeded(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 2 ** 32); }
function drawMark(c, x, y, w, h, ink, seed) {
  const g = c.g; g.save();
  if (c.mark === 'scribble') {
    // A felt-tip scribble: tight zigzags back and forth until the space is covered.
    const r = seeded(seed), lw = h * .2;
    g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    for (let pass = 0; pass < 2; pass++) {
      const n = Math.max(4, Math.round(w / (h * .2)));
      for (let i = 0; i <= n; i++) {
        const fx = pass ? 1 - i / n : i / n, px = x + lw / 2 + fx * (w - lw) + (r() - .5) * h * .08;
        const py = i % 2 ? y + h * (.08 + r() * .08) : y + h * (.84 + r() * .08);
        i || pass ? g.lineTo(px, py) : g.moveTo(px, py);
      }
    }
    g.stroke();
  } else if (c.mark === 'hatch') {
    // A two-tone diagonal hatch, like the "waiting" progress bar: a pattern, not a blur.
    const rad = h * .22;
    g.beginPath(); g.roundRect(x, y, w, h, rad); g.fillStyle = ink; g.fill(); g.clip();
    g.strokeStyle = c.markBg; g.lineWidth = h * .11;
    for (let s = -h; s < w + h; s += h * .3) { g.beginPath(); g.moveTo(x + s, y + h + 2); g.lineTo(x + s + h, y - 2); g.stroke(); }
    g.restore(); g.save();
    g.beginPath(); g.roundRect(x, y, w, h, rad); g.strokeStyle = ink; g.lineWidth = Math.max(2, h * .07); g.stroke();
  } else {
    g.fillStyle = ink; g.beginPath(); g.roundRect(x, y, w, h, h * .22); g.fill();
  }
  g.restore();
}

/* ---------- graphics ---------- */
// colours: {on, off} for marks; returns label boxes through c.boxes.
function graphic(c, gr, x, y, w, h, col, {bleed = false, labelColor, font = 1} = {}) {
  if (!gr || h < 40) return;
  const g = c.g; c.occupied.push({x, y, w, h});
  const bar = (bx, by, bw, bh, on, r = Math.min(bw * .3, 12 * c.k)) => {
    g.fillStyle = on ? col.on : col.off; g.beginPath(); g.roundRect(bx, by, bw, Math.max(2, bh), [r, r, bleed ? 0 : r, bleed ? 0 : r]); g.fill();
  };
  const small = Math.round(20 * c.k * font);
  if (gr.type === 'columns' || gr.type === 'hours') {
    const vals = gr.values, max = Math.max(...vals), n = vals.length, lab = bleed ? 0 : small * 1.6;
    const gap = bleed ? 4 * c.k : Math.max(3, w / n * .18), bw = (w - gap * (n - 1)) / n, ch = h - lab;
    vals.forEach((v, i) => { const bh = ch * v / max; bar(x + i * (bw + gap), y + ch - bh, bw, bh, gr.type === 'hours' ? gr.band.includes(i) : i === gr.hi); });
    if (!bleed) {
      g.fillStyle = labelColor; setFont(c, small, 650); g.textAlign = 'center';
      if (gr.type === 'hours') [[0, 'midnight'], [6, '6 am'], [12, 'noon'], [18, '6 pm']].forEach(([i, t]) => g.fillText(t, x + i * (bw + gap) + bw / 2, y + h - small * .2));
      else gr.labels.forEach((t, i) => (n <= 14 || i % 2 === 0) && g.fillText(t, x + i * (bw + gap) + bw / 2, y + h - small * .2));
      g.textAlign = 'left';
    }
  } else if (gr.type === 'days') {
    const start = Date.parse(gr.from + 'T00:00:00Z') / 864e5, end = Date.parse(gr.to + 'T00:00:00Z') / 864e5, n = end - start + 1;
    const vals = new Array(n).fill(0); for (const [d, v] of gr.days) if (d - start >= 0 && d - start < n) vals[d - start] = v;
    const max = Math.max(...vals), bw = w / n;
    vals.forEach((v, i) => { if (!v) return; const on = start + i === gr.hi, bh = h * v / max; g.fillStyle = on ? col.on : col.thin || col.off; g.fillRect(x + i * bw, y + h - bh, on ? Math.max(bw, 6 * c.k) : Math.max(1, bw - .5), bh); });
    const hx = x + (gr.hi - start) * bw;
    g.fillStyle = col.on; g.beginPath(); g.arc(hx + 3 * c.k, y - 4 * c.k, 9 * c.k, 0, 7); g.fill();
  } else if (gr.type === 'calendar') {
    // A year: one row per month, one cell per day. Longer periods: weeks as columns. The streak lit, other active days dim.
    const day = t => new Date(t).toISOString().slice(0, 10), D0 = Date.parse(gr.from + 'T00:00:00Z'), D1 = Date.parse(gr.to + 'T00:00:00Z');
    const lit0 = Date.parse(gr.lit[0] + 'T00:00:00Z'), lit1 = Date.parse(gr.lit[1] + 'T00:00:00Z'), nDays = (D1 - D0) / 864e5 + 1;
    const cells = [];
    if (nDays <= 366) {
      const y0 = new Date(D0).getUTCFullYear();
      for (let i = 0; i < nDays; i++) { const d = new Date(D0 + i * 864e5); cells.push({t: +d, col: d.getUTCDate() - 1, row: (d.getUTCFullYear() - y0) * 12 + d.getUTCMonth()}); }
    } else {
      // one row per year, one cell per week
      const y0 = new Date(D0).getUTCFullYear();
      for (let i = 0; i < nDays; i += 1) {
        const d = new Date(D0 + i * 864e5), doy = (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5;
        if (doy % 7 === 0 || i === 0) cells.push({t: +d, span: 7, col: Math.floor(doy / 7), row: d.getUTCFullYear() - y0});
      }
    }
    const cols = Math.max(...cells.map(q => q.col)) + 1, rows = Math.max(...cells.map(q => q.row)) + 1;
    const cell = Math.min(w / cols, h / rows), gap = cell > 6 ? cell * .2 : 0, ox = x + (w - cols * cell) / 2, oy = y + (h - rows * cell) / 2;
    for (const q of cells) {
      const span = q.span || 1, on = q.t + (span - 1) * 864e5 >= lit0 && q.t <= lit1;
      let act = false; for (let j = 0; j < span && !act; j++) act = gr.days.has(day(q.t + j * 864e5));
      g.fillStyle = on ? col.on : act ? col.off : col.empty || col.off;
      g.beginPath(); g.roundRect(ox + q.col * cell, oy + q.row * cell, cell - gap, cell - gap, cell * .25); g.fill();
    }
  } else if (gr.type === 'bars') {
    // Rows stay readable: fewer rows rather than smaller ones.
    const gap = 10 * c.k, n = Math.max(1, Math.min(gr.items.length, Math.floor((h + gap) / (36 * c.k + gap)))), items = gr.items.slice(0, n);
    const max = Math.max(...items.map(r => r[1])), rh = Math.min(64 * c.k, (h - gap * (n - 1)) / n);
    const labelW = Math.min(w * .42, 420 * c.k), numW = 130 * c.k, fs = Math.round(rh * .56);
    items.forEach(([rich, v], i) => {
      const ry = y + i * (rh + gap), on = i === gr.hi;
      // Shorten a long label by characters, like the site does; it keeps its identity for redaction.
      setFont(c, fs, on ? 800 : 600);
      let label = rich[0].t; const room = labelW - 14 * c.k - (gr.quoted ? fs : 0);
      while (label.length > 3 && c.g.measureText(label).width > room) label = label.slice(0, -2).trimEnd() + '…';
      rich = [{...rich[0], t: label, id: rich[0].id ?? rich[0].t}];
      const lab = fit(c, tokens(gr.quoted ? ['“', ...rich, '”'] : rich), {max: fs, min: fs, weight: on ? 800 : 600, maxW: labelW - 14 * c.k, maxLines: 1});
      draw(c, lab, x, ry + rh / 2 + fs * .36, on ? col.labelOn : col.labelOff);
      bar(x + labelW, ry + rh * .12, Math.max(6, (w - labelW - numW) * v / max), rh * .76, on, rh * .2);
      setFont(c, fs, on ? 800 : 600); g.fillStyle = on ? col.labelOn : col.labelOff; g.textAlign = 'right';
      g.fillText(fmt(v), x + w, ry + rh / 2 + fs * .36); g.textAlign = 'left';
    });
  }
}

/* ---------- guess result ---------- */
function guessRich(s, r) {
  const val = v => typeof v === 'number' ? [fmt(v)] : s.guess.private ? ['“', Priv(v), '”'] : ['“', v, '”'];
  if (r.right) return ['I guessed ', ...val(r.value), '. ', 'Spot on.'];
  return ['I guessed ', ...val(r.value), '. It was ', ...val(r.correct), '.'];
}
export function guessPost(s, r) {
  if (!r || r.skipped) return [];
  const val = v => typeof v === 'number' ? [fmt(v)] : s.guess.private ? ['“', Priv(v), '”'] : ['“', v, '”'];
  return r.right ? [' I guessed it right.'] : [' I guessed ', ...val(r.value), '.'];
}
function stickerRich(s, r) {
  const val = v => typeof v === 'number' ? [fmt(v)] : s.guess.private ? ['“', Priv(v), '”'] : ['“', v, '”'];
  if (r.right) return {big: ['Called', ' it'], small: ['Guessed ', ...val(r.value)]};
  if (s.guess.type === 'slider') {
    const k = r.ratio < 1 ? 1 / r.ratio : r.ratio;
    return {big: k < 1.5 ? ['So', ' close'] : [`${k.toFixed(1)}×`, r.ratio < 1 ? ' too low' : ' too high'], small: ['Guessed ', ...val(r.value)]};
  }
  return {big: ['Not', ' quite'], small: ['Guessed ', ...val(r.value)]};
}
// A round sticker in the largest empty space; it shrinks, then docks in the header if there's no room.
function sticker(c, s, r, dock, prefer) {
  const g = c.g, base = c.tall ? 330 : 190, txt = stickerRich(s, r);
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let d = base; d >= base * .62; d *= .87) {
    const pad = 16 * c.k, cands = [];
    for (let cy = pad; cy + d <= c.H - pad; cy += 12 * c.k) for (let cx = pad; cx + d <= c.W - pad; cx += 12 * c.k) {
      const box = {x: cx - pad / 2, y: cy - pad / 2, w: d + pad, h: d + pad};
      if (!c.occupied.some(o => hits(o, box))) cands.push({cx: cx + d / 2, cy: cy + d / 2});
    }
    if (!cands.length) continue;
    const [px, py] = prefer, best = cands.sort((a, b) => Math.hypot(a.cx - px * c.W, a.cy - py * c.H) - Math.hypot(b.cx - px * c.W, b.cy - py * c.H))[0];
    g.save(); g.translate(best.cx, best.cy); g.rotate(-.14);
    g.fillStyle = r.right ? c.css('--paper') : c.css('--ink');
    g.beginPath(); g.arc(0, 0, d / 2, 0, 7); g.fill();
    g.lineWidth = d * .03; g.strokeStyle = r.right ? c.css('--ink') : c.css('--paper'); g.setLineDash([d * .05, d * .035]);
    g.beginPath(); g.arc(0, 0, d / 2 - d * .06, 0, 7); g.stroke(); g.setLineDash([]);
    g.restore();
    // The sticker's text is drawn unrotated so its words stay tappable.
    const ink = r.right ? c.css('--ink') : c.css('--paper'), inner = d * .74, ox = best.cx - inner / 2;
    c.markBg = r.right ? c.css('--paper') : c.css('--ink');
    const big = fit(c, tokens(txt.big), {max: d * .2, min: d * .1, weight: 900, maxW: inner, maxLines: 2, lh: 1});
    const sm = fit(c, tokens(txt.small), {max: d * .085, min: d * .06, weight: 700, maxW: inner, maxLines: 2});
    const total = big.lines.length * big.size + sm.lines.length * sm.size * 1.12 + d * .03;
    let y = best.cy - total / 2 + big.size * .8;
    const sbg = r.right ? c.css('--paper') : c.css('--ink');
    y = draw(c, big, ox, y, ink, {align: 'center', maxW: inner, bg: sbg});
    draw(c, sm, ox, y + d * .03 + sm.size * .8, ink, {align: 'center', maxW: inner, bg: sbg});
    return;
  }
  dock(stickerRich(s, r));
}

/* ---------- the card ---------- */
// opts: {layout: 'A'|'B'|'C', guess: 'none'|'line'|'sticker', mark: 'bar'|'scribble'|'hatch', isHidden, css, font, period}
export function drawCard(canvas, s, r, shape, opts) {
  const c = mk(canvas, shape, opts), {g, W, H, k} = c, css = opts.css;
  const col = SECTION_COLOR[s.section] || 'c1', field = css(`--${col}`), on = css(`--on-${col}`);
  const heroToks = () => tokens(s.hero.rich || [s.hero.text]);
  const heroMax = {number: 330, date: 210, word: 230, name: 210, quote: 230}[s.hero.kind];
  g.textBaseline = 'alphabetic';
  const L = opts.layout;
  if (L === 'A') layoutA(); else if (L === 'B') layoutB(); else layoutC();
  return c.boxes;

  function footer(color, muted, y = H - (c.tall ? 84 : 36)) {
    setFont(c, 30 * k, 800); g.fillStyle = color; g.fillText(HOST, c.tall ? 84 : 56, c.tall ? y - 40 : y);
    setFont(c, 21 * k, 600); g.fillStyle = muted;
    if (c.tall) g.fillText('Package processed in your browser', 84, y + 8);
    else { g.textAlign = 'right'; g.fillText('Package processed in your browser', W - 56, y - 1); g.textAlign = 'left'; }
    c.occupied.push({x: 0, y: y - (c.tall ? 100 : 34 * k), w: W, h: H});
  }
  function guessLineAt(x, y, maxW, color, size) {
    if (opts.guess !== 'line' || !r || r.skipped) return y;
    const d = size * 1.1, cy = y + d * .1;
    g.fillStyle = r.right ? css('--c3') : css('--fg'); g.beginPath(); g.arc(x + d / 2, cy - d * .3, d / 2, 0, 7); g.fill();
    g.fillStyle = r.right ? css('--on-c3') : css('--bg'); setFont(c, size * .8, 900); g.textAlign = 'center'; g.fillText(r.right ? '✓' : '✗', x + d / 2, cy - d * .3 + size * .28); g.textAlign = 'left';
    c.markBg = c.lineBg || c.markBg;
    return draw(c, fit(c, tokens(guessRich(s, r)), {max: size, min: size * .7, weight: 750, maxW: maxW - d - size * .5, maxLines: 2}), x + d + size * .4, y + size * .2, color) + size * .2;
  }
  function dockIn(x, y, color, ink) {
    return t => {
      // No room: a small pill riding in the header label.
      const blk = fit(c, tokens([...t.big, ' · ', ...t.small]), {max: 24 * k, min: 18 * k, weight: 800, maxW: W * .45, maxLines: 1});
      const w = blk.lines[0].width + 24 * k;
      g.fillStyle = color; g.beginPath(); g.roundRect(x - w, y - 30 * k, w, 40 * k, 20 * k); g.fill();
      draw(c, blk, x - w + 12 * k, y - 2 * k, ink, {bg: color});
    };
  }

  // A: the reveal, stilled. Question as alternating ink pills, hero, unit, sub, the story's chart. No guess.
  function layoutA() {
    g.fillStyle = field; g.fillRect(0, 0, W, H);
    const P = c.tall ? 84 : 52, gr = s.graphic, split = !c.tall && gr;
    const colW = split ? 600 : W - 2 * P;
    setFont(c, 28 * k, 800); g.fillStyle = on; g.fillText('Discord Wrapped', P, P + 20 * k);
    g.textAlign = 'right'; g.fillText(opts.period, W - P, P + 20 * k); g.textAlign = 'left';
    c.occupied.push({x: 0, y: 0, w: W, h: P + 30 * k});
    c.markBg = field;
    let y = P + (c.tall ? 200 : 96);
    const qb = fit(c, tokens([s.question]), {max: c.tall ? 74 : 34, min: 24, weight: 850, maxW: colW - 20, maxLines: 3, lh: 1.32});
    y = draw(c, qb, P + qb.size * .18, y, on, {maxW: colW, back: (i, x, by, w, size) => {
      if (i % 2) return [on, field];
      g.fillStyle = on; g.beginPath(); g.roundRect(x - size * .18, by - size * .84, w + size * .36, size * 1.1, size * .22); g.fill();
      return [field, on];
    }}) + (c.tall ? 70 : 26);
    const unitB = fit(c, tokens(s.unit), {max: c.tall ? 84 : 38, weight: 850, maxW: colW, maxLines: 2});
    const subB = fit(c, tokens(s.sub), {max: c.tall ? 44 : 22, weight: 700, maxW: colW, maxLines: 3, lh: 1.25});
    const bottom = c.tall ? (gr ? H * .5 : H - 260) : H - 84;
    const room = bottom - y - unitB.lines.length * unitB.size * 1.12 - subB.lines.length * subB.size * 1.25 - 40 * k;
    const heroB = fit(c, heroToks(), {max: c.tall ? heroMax : heroMax * .55, min: 40, weight: 900, maxW: colW, maxLines: s.hero.kind === 'number' ? 1 : 2, maxH: room, lh: 1});
    y = draw(c, heroB, P, y + heroB.size * .78, on, {maxW: colW}) + 10 * k;
    y = draw(c, unitB, P, y + unitB.size * .82, on, {maxW: colW}) + 14 * k;
    y = draw(c, subB, P, y + subB.size * .82, on, {maxW: colW});
    y = guessLineAt(P, y + 30 * k, colW, on, 30 * k);
    const gc = {on, off: mix(on, field, .38), labelOn: on, labelOff: on, empty: mix(on, field, .15)};
    if (gr) {
      if (c.tall) { const top = Math.max(y + 90, H * .5); graphic(c, gr, P, top, W - 2 * P, Math.min(H - 240 - top, 760), gc, {labelColor: on, font: 1.2}); }
      else graphic(c, gr, 700, 120, W - 700 - P, H - 84 - 120 - 20, gc, {labelColor: on});
    }
    footer(on, on);
    finishGuess([.72, .5], dockIn(W - P, P + 22 * k, on, field), gc);
  }

  // B: the site's share card, heavier. Surface, a section-colour band, the hero in a colour pill, the chart in the
  // site's style (shared row in colour, the rest quiet), and the guess as a plain line.
  function layoutB() {
    const P = c.tall ? 96 : 64;
    g.fillStyle = css('--surface'); g.fillRect(0, 0, W, H);
    g.fillStyle = field; g.fillRect(0, 0, W, c.tall ? 28 : 12);
    c.markBg = css('--surface'); c.lineBg = css('--surface');
    setFont(c, 26 * k, 600); g.fillStyle = css('--muted'); g.fillText(`Discord Wrapped · ${opts.period}`, P, c.tall ? 140 : 74);
    c.occupied.push({x: 0, y: 0, w: W, h: c.tall ? 160 : 84});
    let y = c.tall ? 230 : 128;
    const qb = fit(c, tokens([s.question]), {max: 34 * k, min: 20, weight: 600, maxW: W - 2 * P, maxLines: 2});
    y = draw(c, qb, P, y, css('--muted')) + 18 * k;
    const head = [...heroToks().map(t => ({...t, hl: true})), ...tokens(s.unit).map((t, i) => i ? t : {...t, sp: true})];
    const gr = s.graphic, hb = fit(c, head, {max: gr ? (c.tall ? 150 : 72) : (c.tall ? 190 : 110), min: 30, weight: 850, maxW: W - 2 * P, maxLines: c.tall ? 3 : 2, lh: 1.2});
    c.markBg = field;
    y = draw(c, hb, P, y + hb.size * .9, css('--fg'), {hlFill: field, hlInk: on}) + 10 * k;
    c.markBg = css('--surface');
    const sb = fit(c, tokens(s.sub), {max: 32 * k, min: 20, weight: 400, maxW: W - 2 * P, maxLines: 2, lh: 1.3});
    y = draw(c, sb, P, y + sb.size * .9, css('--muted')) + 12 * k;
    y = guessLineAt(P, y + 30 * k, W - 2 * P, css('--fg'), 30 * k) + 10 * k;
    const gc = {on: field, off: css('--soft'), thin: css('--muted'), labelOn: css('--fg'), labelOff: css('--muted'), empty: css('--soft')};
    const gTop = y + 24 * k, gBot = H - (c.tall ? 230 : 80);
    if (gr) graphic(c, gr, P, gTop, W - 2 * P, Math.min(gBot - gTop, c.tall ? 700 : 400), gc, {labelColor: css('--muted'), font: 1.1});
    // the site's footer: host in the accent colour bottom left
    setFont(c, 28 * k, 600); g.fillStyle = css('--accent'); g.fillText(HOST, P, H - (c.tall ? 110 : 36));
    setFont(c, 22 * k, 400); g.fillStyle = css('--muted');
    if (c.tall) g.fillText('Package processed in your browser', P, H - 46);
    else { g.textAlign = 'right'; g.fillText('Package processed in your browser', W - P, H - 38); g.textAlign = 'left'; }
    c.occupied.push({x: 0, y: H - (c.tall ? 170 : 70), w: W, h: 200});
    finishGuess([.78, .3], dockIn(W - P, c.tall ? 140 : 74, field, on), gc);
  }

  // C: the answer as a poster. No question; a giant bouncing hero; lists pile up as chips, charts bleed off the
  // bottom edge; the guess is a round scored sticker.
  function layoutC() {
    g.fillStyle = field; g.fillRect(0, 0, W, H);
    c.markBg = field;
    const P = c.tall ? 80 : 48, gr = s.graphic;
    setFont(c, 28 * k, 800); g.fillStyle = on; g.fillText(HOST, P, P + 22 * k);
    // the period in an ink pill, top right
    setFont(c, 28 * k, 850); const pw = g.measureText(opts.period).width + 30 * k;
    g.fillStyle = on; g.beginPath(); g.roundRect(W - P - pw, P - 10 * k, pw, 44 * k, 22 * k); g.fill();
    g.fillStyle = field; g.fillText(opts.period, W - P - pw + 15 * k, P + 22 * k);
    c.occupied.push({x: 0, y: 0, w: W, h: P + 40 * k});
    const isList = gr?.type === 'bars', chartH = gr ? (isList ? (c.tall ? 520 : 0) : (c.tall ? H * .3 : H * .34)) : 0;
    const colW = !c.tall && isList ? 640 : W - 2 * P;
    let y = c.tall ? 330 : 118;
    const unitB = fit(c, tokens(s.unit), {max: c.tall ? 96 : 44, weight: 850, maxW: colW, maxLines: 2});
    const subB = fit(c, tokens(s.sub), {max: c.tall ? 46 : 22, weight: 700, maxW: colW, maxLines: 2, lh: 1.25});
    const bottom = H - chartH - (c.tall ? 80 : 26);
    const room = bottom - y - unitB.lines.length * unitB.size * 1.12 - subB.lines.length * subB.size * 1.25 - 30 * k;
    const heroB = fit(c, heroToks(), {max: c.tall ? heroMax * 1.35 : heroMax * .78, min: 40, weight: 900, maxW: colW, maxLines: s.hero.kind === 'number' ? 1 : 2, maxH: room, lh: .98});
    y = draw(c, heroB, P - heroB.size * .03, y + heroB.size * .76, on, {bounce: true, maxW: colW}) + 14 * k;
    y = draw(c, unitB, P, y + unitB.size * .82, on, {maxW: colW}) + 12 * k;
    y = draw(c, subB, P, y + subB.size * .82, on, {maxW: colW});
    guessLineAt(P, y + 26 * k, colW, on, 28 * k);
    if (gr && !isList) graphic(c, gr, 0, H - chartH, W, chartH, {on, off: mix(on, field, .4), empty: mix(on, field, .15)}, {bleed: true});
    if (isList) pile(gr, c.tall ? {x: P, y: H - chartH - 40, w: W - 2 * P, h: chartH} : {x: 700, y: 110, w: W - 700 - P, h: H - 150});
    finishGuess(c.tall ? [.72, .36] : [.82, .5], dockIn(W - P - pw - 12 * k, P + 22 * k, on, field), null);
  }
  // Runners-up as rotated chips piled from the bottom up.
  function pile(gr, box) {
    const items = gr.items.filter((_, i) => i !== gr.hi), fs = Math.round((c.tall ? 64 : 30)), padX = fs * .6, rowH = fs * 1.9;
    c.occupied.push(box);
    const rots = [-.09, .07, -.04, .1, -.06];
    let row = [], rows = [], rw = 0;
    const blocks = items.map(([rich, v]) => {
      const b = fit(c, tokens(gr.quoted ? ['“', ...rich, '”', ` ${fmt(v)}`] : [...rich, ` ${fmt(v)}`]), {max: fs, min: fs * .7, weight: 800, maxW: box.w - 2 * padX, maxLines: 1});
      return {b, w: b.lines[0].width + 2 * padX};
    });
    for (const bl of blocks) { if (rw + bl.w > box.w && row.length) { rows.push(row); row = []; rw = 0; } row.push(bl); rw += bl.w + fs * .4; }
    if (row.length) rows.push(row);
    let y = box.y + box.h - rows.length * rowH; let i = 0;
    for (const r of rows) {
      const total = r.reduce((a, b) => a + b.w, 0) + fs * .4 * (r.length - 1); let x = box.x + (box.w - total) / 2;
      for (const bl of r) {
        g.save(); g.translate(x + bl.w / 2, y + rowH / 2); g.rotate(rots[i++ % 5]);
        g.fillStyle = on; g.beginPath(); g.roundRect(-bl.w / 2, -fs * .75, bl.w, fs * 1.5, fs * .75); g.fill(); g.restore();
        draw(c, bl.b, x + padX, y + rowH / 2 + fs * .34, field, {bg: on});
        x += bl.w + fs * .4;
      }
      y += rowH;
    }
  }
  function finishGuess(prefer, dock) {
    if (opts.guess !== 'sticker' || !r || r.skipped || !s.guess) return;
    sticker(c, s, r, dock, prefer);
  }
}
// Blend two hex colours: t of a over b.
function mix(a, b, t) {
  const p = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}
