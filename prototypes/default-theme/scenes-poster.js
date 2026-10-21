// PROTOTYPE variant A, "Poster": giant static type on flat colour blocks. Nothing tweens: things cut in on a
// beat, and the few things that move do it in stop-motion steps, like posters slapped on a wall.
import {el, fit, field, placeClear} from './util.js';

const SECTION = {Overview: 'c1', Rhythm: 'c4', 'Words & links': 'c2'};
const BEAT = 110;

const cut = (n, at) => n.animate([{opacity: 0}, {opacity: 1}], {duration: 1, delay: at, fill: 'both'});
const cutOut = (n, at) => n.animate([{opacity: 1}, {opacity: 0}], {duration: 1, delay: at, fill: 'both'});
// stop-motion move: three hard steps from `from` to rest
const slap = (n, at, from, dur = 270) => { cut(n, at); return n.animate([{transform: from}, {transform: 'none'}], {duration: dur, delay: at, easing: 'steps(3, end)', fill: 'both'}); };

function block(stage, colour, cls = '') {
  const [bg, fg] = field(colour);
  const b = el('div', 'p-block ' + cls, null, stage);
  b.style.background = bg; b.style.color = fg;
  return b;
}

// The question: huge stacked words on the ink field, the key words in the section colour, one word per beat.
function askPoster(stage, s, key, {block: withBlock = true} = {}) {
  const col = SECTION[s.section];
  const bgField = block(stage, 'fg', 'p-full');
  cut(bgField, 0);
  const q = el('h2', 'p-q', null, stage);
  const words = s.question.split(' ');
  let t = 60;
  for (const w of words) {
    const span = el('span', key.includes(w.toLowerCase().replace(/[?]/g, '')) ? 'p-key' : '', w, q);
    span.style.setProperty('--key', `var(--${col})`); span.style.setProperty('--key-on', `var(--on-${col})`);
    cut(span, t); t += BEAT;
    q.append(' ');
  }
  if (withBlock) {
    const b = block(stage, col, 'p-foot');
    slap(b, t, 'translateY(100%)');
  } else {
    const tag = el('div', 'p-tag', s.section, stage);
    tag.style.background = `var(--${col})`; tag.style.color = `var(--on-${col})`;
    slap(tag, t, 'translateX(-120%) rotate(-4deg)');
  }
  return q;
}

// Every reveal starts with a hard cut to the section colour.
function revealField(stage, s) {
  const col = SECTION[s.section];
  const f = block(stage, col, 'p-full');
  cut(f, 0);
  return f;
}

function stamp(stage, text, right, at, where = 'p-stamp') {
  const st = el('div', where + (right ? ' is-right' : ''), text, stage);
  placeClear(stage, st);
  slap(st, at, 'scale(1.8) rotate(-14deg)', 180);
  return st;
}

export default {
  cut: true,
  hold: 1400,
  scenes: {
    messages: {
      ask(stage, s) { askPoster(stage, s, ['messages']); },
      reveal(stage, s, r) {
        const F = revealField(stage, s);
        const kick = el('p', 'p-kicker', 'You sent', F); cut(kick, 120);
        const num = el('p', 'p-num', s.answer.split(' ')[0], F);
        num.style.fontSize = fit(num.textContent, 92, 0.58);
        slap(num, 240, 'translateY(18%)');
        const unit = el('p', 'p-unit', 'messages', F); cut(unit, 600);
        const foot = el('p', 'p-footline', `That's ${s.perDay} a day.`, F); cut(foot, 1300);
        if (!r.skipped) stamp(F, `You said ${s.guess && r.value.toLocaleString('en-GB')}. ${r.line}`, r.right, 2000);
      },
    },
    streak: {
      ask(stage, s) { askPoster(stage, s, ['days', 'in', 'a', 'row'], {block: false}); },
      reveal(stage, s) {
        const F = revealField(stage, s);
        // split poster: ink block slides up from below in steps, carrying the dates
        const num = el('p', 'p-num p-num-top', String(s.value), F);
        num.style.fontSize = fit(num.textContent, 90, 0.58);
        slap(num, 150, 'translateX(-30%)');
        const unit = el('p', 'p-unit p-unit-top', 'days in a row', F); cut(unit, 520);
        const low = block(F, 'fg', 'p-low');
        slap(low, 1000, 'translateY(100%)');
        el('p', 'p-range', `${s.from.slice(5).split('-').reverse().join('.')} → ${s.to.slice(5).split('-').reverse().join('.')}`, low);
        el('p', 'p-footline', s.stillGoing ? 'Still going when the year ended.' : 'Your longest run of the year.', low);
      },
    },
    'biggest-day': {
      ask(stage, s) { askPoster(stage, s, ['biggest', 'day'], {block: false}); },
      reveal(stage, s) {
        const F = revealField(stage, s);
        const d = new Date(s.date + 'T00:00:00Z');
        const wd = el('p', 'p-kicker', d.toLocaleDateString('en-GB', {weekday: 'long', timeZone: 'UTC'}), F); cut(wd, 100);
        const day = el('p', 'p-num p-day', String(d.getUTCDate()), F);
        slap(day, 200, 'translateY(-25%)');
        const mon = el('p', 'p-unit p-month', d.toLocaleDateString('en-GB', {month: 'long', timeZone: 'UTC'}), F); cut(mon, 520);
        const low = block(F, 'fg', 'p-low');
        slap(low, 1100, 'translateY(100%)');
        const c = el('p', 'p-lownum', s.value.toLocaleString('en-GB'), low);
        el('p', 'p-footline', `messages, mostly in ${s.mostlyIn.join(' and ')}.`, low);
        if (s.topText) stamp(F, `${s.topText.count}× “${s.topText.text}”`, true, 2000, 'p-stamp p-stamp-high');
      },
    },
    'top-word': {
      ask(stage, s) { askPoster(stage, s, ['word']); },
      reveal(stage, s, r) {
        const F = revealField(stage, s);
        const kick = el('p', 'p-kicker', 'Your top word', F); cut(kick, 100);
        const w = el('p', 'p-num p-word', `“${s.word}”`, F);
        w.style.fontSize = fit(w.textContent, 92, 0.56, 34);
        slap(w, 220, 'rotate(-8deg) scale(1.3)');
        const unit = el('p', 'p-unit p-unit-word', `${s.value.toLocaleString('en-GB')} times`, F); cut(unit, 650);
        const list = el('ol', 'p-runners', null, F); list.start = 2;
        s.runnersUp.slice(0, 4).forEach(([word, n], k) => { const li = el('li', null, null, list); el('b', null, word, li); el('span', null, n.toLocaleString('en-GB'), li); cut(li, 1300 + k * BEAT); });
        if (!r.skipped) stamp(F, r.right ? `You picked it. ${r.line}` : `You picked “${r.value}”`, r.right, 2100);
      },
    },
  },
};
