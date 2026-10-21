// PROTOTYPE variant B, "Kinetic": type that drops, stacks, rolls and gets swept away. Colour travels: each
// story wipes in over the last one, and its reveal wipes in a second colour. The palette is a conveyor belt
// (c1 → c2 → c3 → c4 → c5 → c1 …) that ignores sections.
import {el, fit, field, ease, placeClear} from './util.js';

const PAL = ['c1', 'c2', 'c3', 'c4', 'c5'];
const askCol = i => PAL[(2 * i) % 5], revCol = i => PAL[(2 * i + 1) % 5];
const fmt = n => n.toLocaleString('en-GB');

function wipe(stage, col, how = 'right', delay = 0) {
  const [bg, fg] = field(col);
  const w = el('div', 'k-field', null, stage);
  w.style.background = bg; w.style.color = fg;
  const from = {right: 'inset(0 0 0 100%)', up: 'inset(100% 0 0 0)', circle: 'circle(0% at 50% 100%)'}[how];
  const to = how === 'circle' ? 'circle(150% at 50% 100%)' : 'inset(0 0 0 0)';
  w.animate([{clipPath: from}, {clipPath: to}], {duration: 560, delay, easing: ease.inOut, fill: 'both'});
  return w;
}

// Question lines drop in from above and land with a bounce, one after another.
function stackLines(parent, lines, at = 300) {
  const box = el('h2', 'k-q', null, parent);
  lines.forEach((t, k) => {
    const line = el('span', 'k-line', t, box);
    line.animate([{transform: 'translateY(-140cqh) rotate(-6deg)'}, {transform: 'translateY(0) rotate(0)', offset: .75}, {transform: 'translateY(-4cqw)', offset: .87}, {transform: 'none'}],
      {duration: 700, delay: at + k * 140, easing: ease.out, fill: 'both'});
  });
  return box;
}
// At the reveal, the question lines get swept off to the left, staggered.
function sweep(stage, delay = 0) {
  stage.querySelectorAll('.k-line').forEach((n, k) =>
    n.animate([{transform: 'none'}, {transform: 'translateX(-130cqw) skewX(12deg)'}], {duration: 420, delay: delay + k * 60, easing: ease.in, fill: 'both'}));
}

// Odometer: each digit is a strip of 0–9 repeated, rolled into place. Real text for screen readers.
function odometer(parent, text, {at = 0, dur = 1600, cls = ''} = {}) {
  const box = el('div', 'k-odo ' + cls, null, parent);
  box.setAttribute('role', 'img'); box.setAttribute('aria-label', text);
  const chars = [...text]; let d = 0;
  const digits = chars.filter(c => /\d/.test(c)).length;
  for (const c of chars) {
    if (!/\d/.test(c)) { const s = el('span', 'k-sep', c, box); s.setAttribute('aria-hidden', 'true'); continue; }
    const col = el('span', 'k-col', null, box); col.setAttribute('aria-hidden', 'true');
    const strip = el('span', 'k-strip', null, col);
    const turns = 1 + (digits - d); // rightmost digits spin more
    const seq = []; for (let r = 0; r < turns; r++) for (let n = 0; n < 10; n++) seq.push(n);
    seq.push(+c);
    strip.textContent = seq.join('\n');
    const end = seq.length - 1;
    strip.animate([{transform: 'translateY(0)'}, {transform: `translateY(-${end}em)`}], {duration: dur + d * 120, delay: at, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both'});
    d++;
  }
  return box;
}
const pop = (n, at, from = 'scale(0) rotate(-12deg)') => n.animate([{transform: from, opacity: 0}, {transform: 'none', opacity: 1}], {duration: 520, delay: at, easing: ease.snap, fill: 'both'});
const slideIn = (n, at, from = 'translateX(110cqw)') => n.animate([{transform: from}, {transform: 'none'}], {duration: 520, delay: at, easing: ease.out, fill: 'both'});

function guessLine(F, r, at) {
  if (r.skipped) return;
  const g = el('p', 'k-guess' + (r.right ? ' is-right' : ''), null, F);
  el('span', 'k-guess-you', `You said ${typeof r.value === 'number' ? fmt(r.value) : '“' + r.value + '”'}`, g);
  el('span', 'k-guess-line', r.line, g);
  placeClear(F, g, 0.8);
  slideIn(g, at, 'translateX(-110cqw)');
}

export default {
  cut: false,
  hold: 1000,
  scenes: {
    messages: {
      ask(stage, s, c) { const F = wipe(stage, askCol(c.i)); stackLines(F, ['How many', 'messages', 'did you send', `in ${c.year}?`]); },
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150);
        el('p', 'k-kicker', 'You sent', F);
        const o = odometer(F, fmt(s.value), {at: 450, cls: 'k-big'});
        o.style.fontSize = fit(fmt(s.value), 90, 0.62);
        const u = el('p', 'k-unit', 'messages', F); slideIn(u, 1500);
        const per = el('p', 'k-sub', `That's ${s.perDay} a day.`, F); slideIn(per, 1900);
        guessLine(F, r, 2600);
      },
    },
    streak: {
      ask(stage, s, c) { const F = wipe(stage, askCol(c.i)); stackLines(F, ['How many', 'days in a row', 'did you', 'show up?']); },
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150);
        // a ticker of every date in the streak scrolls up behind the number
        const tick = el('div', 'k-ticker', null, F); tick.setAttribute('aria-hidden', 'true');
        const start = new Date(s.from + 'T00:00:00Z'), lines = [];
        for (let k = 0; k < s.value; k++) lines.push(new Date(+start + k * 864e5).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}));
        tick.textContent = lines.join('\n');
        tick.animate([{transform: 'translateY(100cqh)'}, {transform: 'translateY(calc(-100% + 30cqh))'}], {duration: 3200, delay: 300, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'both'});
        const o = odometer(F, String(s.value), {at: 300, dur: 2600, cls: 'k-big k-streak'});
        const u = el('p', 'k-unit', 'days in a row', F); slideIn(u, 2900);
        const sub = el('p', 'k-sub', s.stillGoing ? `${shortD(s.from)} to the last day of the year.` : `${shortD(s.from)} to ${shortD(s.to)}.`, F); slideIn(sub, 3200);
      },
    },
    'biggest-day': {
      ask(stage, s, c) { const F = wipe(stage, askCol(c.i)); stackLines(F, ['What was', 'your', 'biggest', `day of ${c.year}?`]); },
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150);
        const d = new Date(s.date + 'T00:00:00Z');
        const date = el('p', 'k-date', null, F);
        date.setAttribute('aria-label', d.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'}));
        const parts = [d.toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'UTC'}), String(d.getUTCDate()), d.toLocaleDateString('en-GB', {month: 'short', timeZone: 'UTC'})];
        parts.forEach((p, k) => { const w = el('span', 'k-dw', p, date); w.setAttribute('aria-hidden', 'true'); pop(w, 500 + k * 180, `translateY(${k % 2 ? '' : '-'}80cqh) rotate(${k % 2 ? 20 : -20}deg)`); });
        const o = odometer(F, fmt(s.value), {at: 1300, dur: 1300, cls: 'k-mid'});
        const u = el('p', 'k-unit k-unit-sm', `messages, mostly in ${s.mostlyIn.join(' and ')}`, F); slideIn(u, 2400);
        if (s.topText) { const t = el('p', 'k-quote', `${s.topText.count}× “${s.topText.text}”`, F); pop(t, 2900); }
      },
    },
    'top-word': {
      ask(stage, s, c) { const F = wipe(stage, askCol(c.i)); stackLines(F, ['Which word', 'did you', 'use most?']); },
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150);
        el('p', 'k-kicker', 'Your top word', F);
        const w = el('p', 'k-word', null, F);
        w.setAttribute('aria-label', s.word); w.style.fontSize = fit(s.word, 88, 0.6, 40);
        [...s.word].forEach((ch, k) => { const sp = el('span', null, ch, w); sp.setAttribute('aria-hidden', 'true'); pop(sp, 500 + k * 90, 'translateY(-60cqh) scale(.4)'); });
        const u = el('p', 'k-unit', `${fmt(s.value)} times`, F); slideIn(u, 1300);
        // runners-up fall and pile up at the bottom, slightly askew
        const pile = el('div', 'k-pile', null, F);
        s.runnersUp.slice(0, 6).forEach(([word], k) => {
          const b = el('span', 'k-chip', word, pile);
          const rot = [-7, 5, -3, 8, -5, 3][k];
          b.style.rotate = rot + 'deg';
          b.animate([{transform: 'translateY(-120cqh)'}, {transform: 'none', offset: .8}, {transform: 'translateY(-2cqw)', offset: .9}, {transform: 'none'}], {duration: 650, delay: 1700 + k * 110, easing: ease.in, fill: 'both'});
        });
        guessLine(F, r, 2600);
      },
    },
  },
};
function shortD(iso) { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}); }
