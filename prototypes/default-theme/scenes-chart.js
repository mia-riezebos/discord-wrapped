// PROTOTYPE variant C, "Chart hero": the frame starts as a quiet neutral page with the real chart on it. The
// question is asked over the chart's shape; the reveal grows one mark (a bar, a run of days) until it becomes
// the full-screen colour field, and the answer is set on it. Colour is spent only on the mark that matters.
import {el, ease} from './util.js';

const SECTION = {Overview: 'c1', Rhythm: 'c4', 'Words & links': 'c2'};
const fmt = n => n.toLocaleString('en-GB');
const DAY0 = s => Date.parse(s + 'T00:00:00Z') / 864e5;

function dailyCounts(s) {
  const a = DAY0(s.from ?? s.rangeFrom), b = DAY0(s.to ?? s.rangeTo);
  const counts = new Array(b - a + 1).fill(0);
  for (const [d, c] of s.days) if (d >= a && d <= b) counts[d - a] = c;
  return {counts, day0: a};
}
const fade = (n, at, dur = 380, from = 'translateY(2cqh)') => n.animate([{opacity: 0, transform: from}, {opacity: 1, transform: 'none'}], {duration: dur, delay: at, easing: ease.out, fill: 'both'});
const fadeOut = (n, at, dur = 300) => n.animate([{opacity: 1}, {opacity: 0}], {duration: dur, delay: at, easing: 'linear', fill: 'both'});
// A colour field that grows out of a rectangle (in % of the frame) to fill the frame.
function growField(stage, col, [top, right, bottom, left], at, dur = 760) {
  const f = el('div', 'c-field', null, stage);
  f.style.background = `var(--${col})`; f.style.color = `var(--on-${col})`;
  f.animate([{clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)`}, {clipPath: 'inset(0% 0% 0% 0%)'}], {duration: dur, delay: at, easing: ease.inOut, fill: 'both'});
  return f;
}
function question(stage, s) {
  // the previous story's field drains away: a clean page slides up over it
  const page = el('div', 'c-page', null, stage);
  page.animate([{clipPath: 'inset(100% 0 0 0)'}, {clipPath: 'inset(0% 0 0 0)'}], {duration: 520, easing: ease.inOut, fill: 'both'});
  const q = el('h2', 'c-q', s.question, stage);
  fade(q, 480, 420);
  const k = el('p', 'c-kicker', s.section, stage); fade(k, 480, 300);
  return q;
}
// 365 daily bars between y=top% and y=base% of the frame.
function bars(parent, counts, {top, base, at = 0, stagger = 3, col = 'var(--muted)', cls = ''}) {
  const max = Math.max(...counts), box = el('div', 'c-bars ' + cls, null, parent);
  box.style.top = top + '%'; box.style.height = (base - top) + '%'; box.style.color = col;
  box.setAttribute('aria-hidden', 'true');
  return counts.map((c, k) => {
    const b = el('i', null, null, box);
    b.style.height = Math.max(0.4, c / max * 100) + '%';
    if (at != null) b.animate([{transform: 'scaleY(0)'}, {transform: 'scaleY(1)'}], {duration: 420, delay: at + k * stagger, easing: ease.out, fill: 'both'});
    return b;
  });
}
function months(parent, y) {
  const m = el('div', 'c-months', null, parent); m.style.top = y + '%'; m.setAttribute('aria-hidden', 'true');
  for (const t of ['Jan', 'Apr', 'Jul', 'Oct', 'Dec']) el('span', null, t, m);
  return m;
}
// log ruler with the guess and the real value
function ruler(parent, g, actual, guess, at) {
  const r = el('div', 'c-ruler', null, parent);
  const x = v => (Math.log(v / g.min) / Math.log(g.max / g.min)) * 100;
  el('div', 'c-ruler-line', null, r);
  const lo = Math.min(x(actual), x(guess)), hi = Math.max(x(actual), x(guess));
  const gap = el('div', 'c-ruler-gap', null, r); gap.style.left = lo + '%'; gap.style.width = (hi - lo) + '%';
  gap.animate([{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}], {duration: 600, delay: at + 400, easing: ease.out, fill: 'both'});
  gap.style.transformOrigin = x(guess) < x(actual) ? 'left' : 'right';
  for (const [v, label, cls] of [[guess, `you ${fmt(guess)}`, 'is-guess'], [actual, fmt(actual), 'is-real']]) {
    const m = el('div', 'c-mark ' + cls, null, r); m.style.left = x(v) + '%';
    el('span', null, label, m);
    fade(m, cls === 'is-guess' ? at : at + 900, 300, 'translateY(-1cqh)');
  }
  const ends = el('div', 'c-ruler-ends', null, r); el('span', null, fmt(g.min), ends); el('span', null, fmt(g.max), ends);
  fade(r, at, 300, 'none');
  return r;
}

export default {
  cut: false,
  hold: 1300,
  scenes: {
    messages: {
      ask(stage, s) {
        question(stage, s);
        const base = el('div', 'c-axis', null, stage); base.style.top = '62%';
        base.animate([{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}], {duration: 700, delay: 200, easing: ease.out, fill: 'both'});
        fade(months(stage, 63.5), 500);
      },
      reveal(stage, s, r) {
        const col = SECTION[s.section];
        stage.querySelectorAll('.c-q, .c-kicker').forEach(n => fadeOut(n, 0, 200));
        const {counts} = dailyCounts(s);
        // the year grows from the axis…
        const holder = el('div', 'c-layer', null, stage);
        holder.style.color = `var(--${col})`;
        bars(holder, counts, {top: 30, base: 62, at: 100, stagger: 3, col: 'inherit'});
        // …then the chart floods into a field and the total lands on it
        const F = growField(stage, col, [30, 6, 38, 6], 1600);
        bars(F, counts, {top: 30, base: 62, at: null, col: 'currentColor', cls: 'is-ghost'});
        months(F, 63.5);
        const n = el('p', 'c-num', fmt(s.value), F); fade(n, 2100, 420);
        const l = el('p', 'c-label', `messages in 2025 · ${s.perDay} a day on average`, F); fade(l, 2300);
        if (!r.skipped) { ruler(F, s.guess, s.value, r.value, 2900); const line = el('p', 'c-line', r.line, F); fade(line, 3900); }
      },
    },
    streak: {
      ask(stage, s) {
        question(stage, s);
        const {counts} = dailyCounts({...s, from: s.rangeFrom, to: s.rangeTo});
        const grid = el('div', 'c-cal', null, stage); grid.setAttribute('aria-hidden', 'true');
        counts.forEach((c, k) => { const i = el('i', c ? 'on' : '', null, grid); i.animate([{opacity: 0}, {opacity: 1}], {duration: 200, delay: 200 + k * 2.5, fill: 'both'}); });
      },
      reveal(stage, s) {
        const col = SECTION[s.section];
        const {day0} = dailyCounts({...s, from: s.rangeFrom, to: s.rangeTo});
        const a = DAY0(s.from) - day0, b = DAY0(s.to) - day0;
        const cells = [...stage.querySelectorAll('.c-cal i')];
        stage.querySelectorAll('.c-q').forEach(n => fadeOut(n, 0, 200));
        cells.forEach((c, k) => {
          if (k >= a && k <= b) c.animate([{background: 'var(--soft)'}, {background: `var(--${col})`}], {duration: 120, delay: 200 + (k - a) * 9, fill: 'both'});
          else c.animate([{opacity: 1}, {opacity: .25}], {duration: 300, delay: 100, fill: 'both'});
        });
        const n = el('p', 'c-num c-num-dark', String(s.value), stage); fade(n, 200 + s.value * 9, 420);
        n.style.color = `var(--${col})`;
        const l = el('p', 'c-label c-label-dark', `days in a row · ${short(s.from)} to ${short(s.to)}${s.stillGoing ? ', still going' : ''}`, stage); fade(l, 400 + s.value * 9);
      },
    },
    'biggest-day': {
      ask(stage, s) {
        question(stage, s);
        const {counts} = dailyCounts(s);
        bars(stage, counts, {top: 40, base: 74, at: 200, stagger: 2});
        fade(months(stage, 75.5), 600);
      },
      reveal(stage, s) {
        const col = SECTION[s.section];
        const {counts, day0} = dailyCounts(s);
        const k = s.day - day0, max = Math.max(...counts);
        stage.querySelectorAll('.c-q, .c-kicker, .c-months').forEach(n => fadeOut(n, 0, 200));
        stage.querySelectorAll('.c-bars i').forEach((b, j) => { if (j !== k) b.animate([{opacity: 1}, {opacity: .2}], {duration: 300, fill: 'both'}); });
        // the peak bar, redrawn in colour, then grown into the whole frame
        const w = 88 / counts.length, left = 6 + k * w, h = counts[k] / max * 34;
        const F = growField(stage, col, [74 - h, 100 - left - w, 26, left], 900, 900);
        const pin = el('div', 'c-pin', null, stage); pin.style.left = `${left + w / 2}%`; pin.style.top = `${74 - h - 1}%`;
        el('span', null, `${fmt(s.value)}`, pin); fade(pin, 200, 300); fadeOut(pin, 900, 200);
        const d = new Date(s.date + 'T00:00:00Z');
        const n = el('p', 'c-num', fmt(s.value), F); fade(n, 1700, 420);
        const l = el('p', 'c-label', `messages on ${d.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'})}`, F); fade(l, 1900);
        const m = el('p', 'c-meta', `Mostly in ${s.mostlyIn.join(' and ')}`, F); fade(m, 2200);
        // the rest of the year stays visible as a strip, now in the field's own colour
        const strip = el('div', 'c-layer', null, F);
        bars(strip, counts, {top: 64, base: 80, at: 2400, stagger: 1, col: 'currentColor', cls: 'is-ghost'});
        if (s.topText) { const t = el('p', 'c-quote', `${s.topText.count}× “${s.topText.text}”`, F); fade(t, 2800); }
      },
    },
    'top-word': {
      ask(stage, s) {
        question(stage, s);
        // the top ten as unlabelled bars: the shape is the hint
        const list = el('ol', 'c-hbars', null, stage); list.setAttribute('aria-hidden', 'true');
        const all = [[s.word, s.value], ...s.runnersUp], max = s.value;
        all.forEach(([w, n], k) => {
          const li = el('li', null, null, list);
          el('span', 'c-rank', String(k + 1).padStart(2, '0'), li);
          const bar = el('b', null, null, li); bar.style.width = (n / max * 100) + '%';
          el('span', 'c-wordlabel', w, bar);
          bar.animate([{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}], {duration: 500, delay: 200 + k * 60, easing: ease.out, fill: 'both'});
        });
      },
      reveal(stage, s, r) {
        const col = SECTION[s.section];
        stage.querySelectorAll('.c-q, .c-kicker').forEach(n => fadeOut(n, 0, 200));
        const labels = [...stage.querySelectorAll('.c-wordlabel')];
        labels.forEach((l, k) => fade(l, 150 + k * 50, 260, 'none'));
        if (!r.skipped) {
          const idx = [s.word, ...s.runnersUp.map(w => w[0])].indexOf(r.value);
          const li = stage.querySelectorAll('.c-hbars li')[idx];
          if (li) { const tag = el('span', 'c-pick', r.right ? 'your pick ✓' : 'your pick', li); fade(tag, 700, 260, 'none'); }
        }
        // #1 floods the frame
        const top = stage.querySelector('.c-hbars li b').getBoundingClientRect(), fr = stage.getBoundingClientRect();
        const pct = (v, t) => (v / t * 100).toFixed(2);
        const F = growField(stage, col, [pct(top.top - fr.top, fr.height), pct(fr.right - top.right, fr.width), pct(fr.bottom - top.bottom, fr.height), pct(top.left - fr.left, fr.width)], 1700, 900);
        const w = el('p', 'c-num c-word', s.word, F); fade(w, 2500, 420);
        w.style.fontSize = `min(30cqw, ${(88 / (s.word.length * 0.58)).toFixed(1)}cqw)`;
        const l = el('p', 'c-label', `${fmt(s.value)} times · your #1 word of 2025`, F); fade(l, 2700);
        if (!r.skipped) { const line = el('p', 'c-line', r.line, F); fade(line, 3200); }
      },
    },
  },
};
function short(iso) { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}); }
