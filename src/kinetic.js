/* Kinetic, the default theme: heavy sentence-case type that drops, stacks, rolls and gets swept away, on full-frame
   colour fields that wipe in over the last story. Scenes are keyed by story id; a story without one plays
   `fallback`. Styles are the k- classes in style.css. */
export const KINETIC = (() => {
  const PAL = ['c1', 'c2', 'c3', 'c4', 'c5'];
  // Colour conveyor: each story asks on one palette colour and answers on the next, ignoring sections.
  // Placeholder until colour assignment across the full story set is decided.
  const askCol = i => PAL[(2 * i) % 5], revCol = i => PAL[(2 * i + 1) % 5];
  const ease = {snap: 'cubic-bezier(.2,1.4,.4,1)', out: 'cubic-bezier(.16,1,.3,1)', in: 'cubic-bezier(.7,0,.84,0)', inOut: 'cubic-bezier(.65,0,.35,1)'};
  const num = n => Number(n).toLocaleString();
  const el = (tag, cls, text, parent) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    parent?.append(n);
    return n;
  };
  const hide = n => { n.setAttribute('aria-hidden', 'true'); return n; };
  // Font size in cqw that makes `str` roughly fill `width` cqw of the frame; `k` is the glyph width per em.
  const fit = (str, width = 88, k = 0.6, max = 60) => `${Math.min(max, width / (String(str).length * k)).toFixed(2)}cqw`;
  // Greedy line breaks for question pills, about 13 characters a line.
  const lines = (text, max = 13) => text.split(' ').reduce((out, w) => {
    const last = out.at(-1);
    if (last && (last + ' ' + w).length <= max) out[out.length - 1] = last + ' ' + w; else out.push(w);
    return out;
  }, []);

  function wipe(stage, col, how = 'right', delay = 0) {
    const f = el('div', 'k-field', null, stage);
    f.style.background = `var(--${col})`; f.style.color = `var(--on-${col})`;
    const from = {right: 'inset(0 0 0 100%)', up: 'inset(100% 0 0 0)', circle: 'circle(0% at 50% 100%)'}[how];
    f.animate([{clipPath: from}, {clipPath: how === 'circle' ? 'circle(150% at 50% 100%)' : 'inset(0 0 0 0)'}], {duration: 560, delay, easing: ease.inOut, fill: 'both'});
    return f;
  }
  // Question lines drop in from above and land with a bounce, one after another.
  function stack(parent, text, at = 300) {
    const box = el('h2', 'k-q', null, parent);
    lines(text).forEach((t, k) => el('span', 'k-line', t, box).animate(
      [{transform: 'translateY(-140cqh) rotate(-6deg)'}, {transform: 'none', offset: .75}, {transform: 'translateY(-4cqw)', offset: .87}, {transform: 'none'}],
      {duration: 700, delay: at + k * 140, easing: ease.out, fill: 'both'}));
  }
  // At the reveal, the question lines get swept off to the left, staggered.
  const sweep = stage => stage.querySelectorAll('.k-line').forEach((n, k) =>
    n.animate([{transform: 'none'}, {transform: 'translateX(-130cqw) skewX(12deg)'}], {duration: 420, delay: k * 60, easing: ease.in, fill: 'both'}));
  // Odometer: each digit is a strip of 0–9 repeated, rolled into place. Screen readers get the number as one label.
  function odometer(parent, text, {at = 0, dur = 1600, cls = ''} = {}) {
    const box = el('div', 'k-odo ' + cls, null, parent);
    box.setAttribute('role', 'img'); box.setAttribute('aria-label', text);
    const digits = [...text].filter(c => /\d/.test(c)).length;
    let d = 0;
    for (const c of text) {
      if (!/\d/.test(c)) { hide(el('span', 'k-sep', c, box)); continue; }
      const strip = el('span', 'k-strip', null, hide(el('span', 'k-col', null, box)));
      const seq = [];
      for (let r = 0; r < 1 + digits - d; r++) for (let n = 0; n < 10; n++) seq.push(n); // rightmost digits spin more
      seq.push(+c);
      strip.textContent = seq.join('\n');
      strip.animate([{transform: 'translateY(0)'}, {transform: `translateY(-${seq.length - 1}em)`}], {duration: dur + d * 120, delay: at, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both'});
      d++;
    }
    return box;
  }
  const pop = (n, at, from = 'scale(0) rotate(-12deg)') => n.animate([{transform: from, opacity: 0}, {transform: 'none', opacity: 1}], {duration: 520, delay: at, easing: ease.snap, fill: 'both'});
  const slideIn = (n, at, from = 'translateX(110cqw)') => n.animate([{transform: from}, {transform: 'none'}], {duration: 520, delay: at, easing: ease.out, fill: 'both'});
  // A word that bounces in letter by letter, read as one word.
  function letters(parent, cls, text, at) {
    const w = el('p', cls, null, parent);
    w.setAttribute('aria-label', text); w.style.fontSize = fit(text, 88, 0.6, 34);
    [...text].forEach((ch, k) => pop(hide(el('span', null, ch, w)), at + k * 70, 'translateY(-60cqh) scale(.4)'));
    return w;
  }

  // Your guess against the answer: what you said and how close it was, in the clearest band of the field.
  function verdict(F, s, r, c, at, prefer) {
    if (!r || r.skipped) return;
    const tag = el('p', 'k-sticker k-guess', null, F);
    el('span', null, `You guessed ${guessText(s.guess, r.guess)}`, tag);
    tag.append(' ');
    el('b', null, r.line, tag);
    c.sticker(F, tag, prefer);
    pop(tag, at);
  }
  // Ranked rows of [label, shown value, count] at the foot of the field, each over a bar of its count, row `on` in full ink.
  function ranked(F, rows, on, at) {
    const max = Math.max(1, ...rows.map(r => r[2])), box = el('ol', 'k-picks', null, F);
    rows.forEach(([label, value, n], k) => {
      const row = el('li', k === on ? 'on' : null, null, box);
      el('span', null, label, row);
      el('b', null, value, row);
      const bar = hide(el('i', null, null, row));
      bar.style.width = `${Math.max(2, 100 * n / max)}%`;
      bar.animate([{transform: 'scaleX(0)'}, {transform: 'none'}], {duration: 520, delay: at + k * 120, easing: ease.out, fill: 'both'});
    });
  }
  // A pick-one reveal: every choice as a bar of its count, the answer in full ink and your pick marked.
  function choices(F, s, r, at) {
    const {options, answer} = s.guess;
    ranked(F, options.map(o => [o.label + (r && o.key === r.guess ? ' (your guess)' : ''), num(o.count), o.count]), options.findIndex(o => o.key === answer), at);
  }
  const times = n => `${num(n)} ${n === 1 ? 'time' : 'times'}`;

  const ask = (stage, s, c) => stack(wipe(stage, askCol(c.i)), s.question);
  const scenes = {
    messages: {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150), box = el('div', 'k-stack', null, F);
        odometer(box, num(s.value), {at: 450}).style.fontSize = fit(num(s.value), 86, 0.62, 30);
        slideIn(el('p', 'k-unit', s.value === 1 ? 'message' : 'messages', box), 1500);
        slideIn(el('p', 'k-sub', `That's about ${num(s.data.perDay)} a day.`, box), 1900);
        verdict(F, s, r, c, 2500, 0.75);
      },
    },
    'active-days': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150), box = el('div', 'k-stack', null, F);
        odometer(box, num(s.value), {at: 400}).style.fontSize = fit(num(s.value), 86, 0.62, 30);
        slideIn(el('p', 'k-unit', `of ${num(s.data.of)} days`, box), 1500);
        slideIn(el('p', 'k-sub', `You showed up on ${s.data.pct}% of them.`, box), 1900);
        // One square per day of the period, filled where you sent something. Long periods skip it.
        const {days, from, of} = s.data;
        if (of <= 400) {
          const start = Date.parse(from + 'T00:00:00Z') / 864e5, on = new Set(days.map(([d]) => d - start));
          const grid = hide(el('div', 'k-days', null, F));
          for (let k = 0; k < of; k++) el('i', on.has(k) ? 'on' : null, null, grid);
          grid.animate([{clipPath: 'inset(0 0 100% 0)'}, {clipPath: 'inset(0 0 0 0)'}], {duration: 1100, delay: 2200, easing: ease.out, fill: 'both'});
        }
        verdict(F, s, r, c, 2900, 0.5);
        if (s.data.pct >= 90) {
          const tag = el('p', 'k-sticker', s.data.pct === 100 ? 'Every single day' : 'Nearly every day', F);
          c.sticker(F, tag, 0.72);
          pop(tag, 3300);
        }
      },
    },
    loudest: {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150), box = el('div', 'k-stack', null, F);
        el('p', 'k-kicker', `Your loudest ${s.data.unit}`, box);
        letters(box, 'k-word', s.data.label, 500);
        slideIn(el('p', 'k-sub', `${num(s.value)} ${s.value === 1 ? 'message' : 'messages'}`, box), 1300);
        // The period's buckets as chunky columns rising one after another, the loudest in ink.
        const chart = hide(el('div', 'k-bars', null, F)), max = Math.max(1, ...s.data.buckets.map(b => b[1]));
        s.data.buckets.forEach(([, n], k) => {
          const b = el('i', k === s.data.top ? 'on' : null, null, chart);
          b.style.height = `${Math.max(2, 100 * n / max)}%`;
          b.animate([{transform: 'scaleY(0)'}, {transform: 'none'}], {duration: 480, delay: 1700 + k * 50, easing: ease.snap, fill: 'both'});
        });
      },
    },
    streak: {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150);
        const box = el('div', 'k-stack k-center k-fill', null, F);
        odometer(box, num(s.value), {at: 300, dur: 2600}).style.fontSize = fit(num(s.value), 86, 0.62, 50);
        slideIn(el('p', 'k-unit', s.value === 1 ? 'day' : 'days in a row', box), 2900);
        slideIn(el('p', 'k-sub', s.value > 1 ? `${s.data.fromText} to ${s.data.toText}.` : s.answer, box), 3200);
        if (s.value > 1) {
          // Every date of the streak rolls up in the space left under the answer, ending on its last day. It takes the
          // stack's remaining height, so it never runs behind the header or the number.
          const tick = hide(el('div', 'k-ticker', null, hide(el('div', 'k-ticker-box', null, box))));
          const end = Date.parse(s.data.to + 'T00:00:00Z'), n = Math.min(s.value, 800);
          tick.textContent = Array.from({length: n}, (_, k) => new Date(end - (n - 1 - k) * 864e5).toLocaleDateString(undefined, {day: 'numeric', month: 'short', timeZone: 'UTC'})).join('\n');
          tick.animate([{transform: 'translateY(100%)'}, {transform: 'none'}], {duration: 3200, delay: 300, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'both'});
        }
      },
    },

    /* ---------- Rhythm ---------- */
    'night-owl': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150), box = el('div', 'k-stack', null, F), {owl, hourly} = s.data;
        letters(box, 'k-word', owl ? 'Night owl' : 'Early bird', 450);
        slideIn(el('p', 'k-sub', `${num(s.value)} ${s.value === 1 ? 'message' : 'messages'} ${owl ? 'from 9 pm to 3 am' : 'from 5 to 11 am'}.`, box), 1300);
        // The day's 24 hours as columns, your window in ink.
        const hours = hide(el('div', 'k-bars k-hours', null, box)), max = Math.max(1, ...hourly), win = owl ? [21, 22, 23, 0, 1, 2] : [5, 6, 7, 8, 9, 10];
        hourly.forEach((n, h) => {
          const b = el('i', win.includes(h) ? 'on' : null, null, hours);
          b.style.height = `${Math.max(3, 100 * n / max)}%`;
          b.animate([{transform: 'scaleY(0)'}, {transform: 'none'}], {duration: 420, delay: 1500 + h * 30, easing: ease.snap, fill: 'both'});
        });
        choices(F, s, r, 2100);
        verdict(F, s, r, c, 2600, 0.55);
      },
    },
    'biggest-day': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150), box = el('div', 'k-stack', null, F);
        // The weekday and the date spin in from opposite sides.
        const date = el('p', 'k-date', null, box), {parts} = s.data;
        date.setAttribute('aria-label', parts.join(' '));
        date.style.fontSize = fit(parts.reduce((a, p) => p.length > a.length ? p : a), 86, 0.6, 18);
        parts.forEach((t, k) => pop(hide(el('span', null, t, date)), 400 + k * 220, `translateX(${k ? '' : '-'}110cqw) rotate(${k ? 14 : -14}deg)`));
        odometer(box, num(s.value), {at: 1100, dur: 1300}).style.fontSize = fit(num(s.value), 86, 0.62, 26);
        slideIn(el('p', 'k-unit', s.value === 1 ? 'message' : 'messages', box), 2300);
        if (s.data.times > 1) slideIn(el('p', 'k-sub', `About ${s.data.times}× your usual day.`, box), 2600);
        if (s.data.quote) {
          const [text, n] = s.data.quote, tag = el('p', 'k-sticker', `${num(n)}× “${text}”`, F);
          c.sticker(F, tag, 0.8);
          pop(tag, 3100);
        }
      },
    },
    'fastest-minute': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150), box = el('div', 'k-stack k-center', null, F), n = Math.min(s.value, 60);
        // One pill per message (up to 60) fires in over the time the number rolls.
        const burst = hide(el('div', 'k-burst', null, F));
        for (let k = 0; k < n; k++) pop(el('i', null, null, burst), 300 + k * 1100 / n, 'scale(0)');
        odometer(box, num(s.value), {at: 300, dur: 1300}).style.fontSize = fit(num(s.value), 70, 0.62, 44);
        slideIn(el('p', 'k-unit', 'messages in one minute', box), 1700);
        slideIn(el('p', 'k-sub', `${s.data.when}. ${s.data.every === 1 ? 'One a second' : `One every ${s.data.every} seconds`}.`, box), 2000);
      },
    },

    /* ---------- People & servers ---------- */
    where: {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150), box = el('div', 'k-stack', null, F), [top] = s.data.groups;
        el('p', 'k-kicker', 'Of your messages', box);
        odometer(box, `${top.pct}%`, {at: 400}).style.fontSize = fit(`${top.pct}%`, 70, 0.62, 40);
        slideIn(el('p', 'k-unit', `went to ${top.word}`, box), 1500);
        ranked(F, s.data.groups.map(g => [g.label, g.pct ? `${g.pct}%` : 'Under 1%', g.count]), 0, 1900);
      },
    },
    'top-server': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150), box = el('div', 'k-stack', null, F);
        el('p', 'k-kicker', 'Your top server', box);
        letters(box, 'k-word', s.data.name, 450);
        slideIn(el('p', 'k-sub', `${num(s.value)} messages, ${s.data.pct}% of what you sent in servers.`, box), 1500);
        ranked(F, s.data.ranked.map(([name, n]) => [name, num(n), n]), 0, 1900);
      },
    },
    'top-dm': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150), box = el('div', 'k-stack', null, F);
        el('p', 'k-kicker', 'You DMed most', box);
        letters(box, 'k-word', s.data.name, 450);
        slideIn(el('p', 'k-sub', `${num(s.value)} messages, ${s.data.pct}% of your DMs.`, box), 1500);
        choices(F, s, r, 1900);
        verdict(F, s, r, c, 2500, 0.5);
      },
    },
    'inner-circle': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150), box = el('div', 'k-stack k-fill', null, F);
        odometer(box, `${s.value}%`, {at: 400}).style.fontSize = fit(`${s.value}%`, 70, 0.62, 26);
        slideIn(el('p', 'k-unit', 'of your DMs', box), 1500);
        slideIn(el('p', 'k-sub', `went to just ten people, out of ${num(s.data.conversations)} conversations.`, box), 1800);
        // Your ten fall in and pile up in the space left at the foot, slightly askew.
        const pile = hide(el('div', 'k-pile', null, box));
        s.data.names.forEach((name, k) => {
          const chip = el('span', null, name, pile);
          chip.style.rotate = `${[-6, 4, -3, 7, -5, 3, -7, 5, -2, 6][k]}deg`;
          chip.animate([{transform: 'translateY(-120cqh)'}, {transform: 'none', offset: .8}, {transform: 'translateY(-2cqw)', offset: .9}, {transform: 'none'}], {duration: 650, delay: 2100 + k * 100, easing: ease.in, fill: 'both'});
        });
      },
    },
    /* ---------- Words & links ---------- */
    'top-word': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150), box = el('div', 'k-stack', null, F);
        letters(box, 'k-word', s.data.word, 500);
        slideIn(el('p', 'k-unit', times(s.value), box), 900 + s.data.word.length * 70);
        choices(F, s, r, 1700);
        verdict(F, s, r, c, 2400, 0.5);
      },
    },
    'say-most': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150), box = el('div', 'k-stack', null, F), said = `“${s.data.text}”`;
        const q = el('p', 'k-say', said, box);
        q.style.fontSize = fit(said, 86, 0.55, 22);
        pop(q, 450, 'scale(2.4) rotate(-8deg)');
        slideIn(el('p', 'k-unit', times(s.value), box), 1100);
        // The same message again and again below, one copy per send (up to 60), stamping down in quick succession.
        const echo = hide(el('div', 'k-echo', null, F)), n = Math.min(60, s.value);
        for (let k = 0; k < n; k++) pop(el('span', null, said, echo), 1500 + k * 45, `scale(1.8) rotate(${k % 2 ? 6 : -6}deg)`);
      },
    },
    emoji: {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150), box = el('div', 'k-stack', null, F);
        letters(box, 'k-word', s.data.name, 450);
        slideIn(el('p', 'k-unit', times(s.value), box), 900 + s.data.name.length * 70);
        // The runners-up fall and pile up at the bottom, slightly askew.
        const pile = hide(el('div', 'k-pile', null, F));
        s.data.ranked.forEach((name, k) => {
          const chip = el('span', null, name, pile);
          chip.style.rotate = [-7, 5, -3, 8, -5, 3][k] + 'deg';
          chip.animate([{transform: 'translateY(-120cqh)'}, {transform: 'none', offset: .8}, {transform: 'translateY(-2cqw)', offset: .9}, {transform: 'none'}], {duration: 650, delay: 1800 + k * 110, easing: ease.in, fill: 'both'});
        });
      },
    },
    links: {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150), box = el('div', 'k-stack', null, F);
        letters(box, 'k-word', s.data.site, 450);
        slideIn(el('p', 'k-sub', `${num(s.value)} of your ${num(s.data.of)} ${s.data.of === 1 ? 'link' : 'links'}`, box), 900 + s.data.site.length * 70);
        ranked(F, s.data.ranked.map(([label, count]) => [label, num(count), count]), 0, 1800);
      },
    },

    /* ---------- Hall of fame ---------- */
    'first-message': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'up', 150), box = el('div', 'k-stack', null, F), {text, host, date} = s.data;
        slideIn(el('p', 'k-sub', date, box), 400);
        // The message lands as a chat bubble; one that opens with a link shows the site it links to.
        const bubble = el('p', 'k-bubble', null, box), said = host || !text ? '' : `“${text}”`;
        if (said) bubble.textContent = said;
        else { el('span', null, host ? 'A link to' : 'An attachment', bubble); if (host) el('b', null, host, bubble); }
        bubble.style.fontSize = `${said.length > 120 ? 5.5 : said.length > 50 ? 7 : 9.5}cqw`;
        pop(bubble, 700, 'translateY(40cqh) scale(.3)');
      },
    },
    'longest-message': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'circle', 150), box = el('div', 'k-stack k-fill', null, F);
        odometer(box, num(s.value), {at: 400}).style.fontSize = fit(num(s.value), 86, 0.62, 30);
        slideIn(el('p', 'k-unit', s.value === 1 ? 'character' : 'characters', box), 1500);
        // The message itself rolls up underneath, ending on its last line.
        const roll = el('p', 'k-scroll', s.data.text, el('div', 'k-ticker-box', null, box));
        roll.animate([{transform: 'translateY(100%)'}, {transform: 'none'}], {duration: 3000, delay: 1700, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'both'});
      },
    },
    'longest-session': {
      ask,
      reveal(stage, s, r, c) {
        sweep(stage);
        const F = wipe(stage, revCol(c.i), 'right', 150), box = el('div', 'k-stack', null, F);
        odometer(box, num(s.value), {at: 400}).style.fontSize = fit(num(s.value), 86, 0.62, 30);
        slideIn(el('p', 'k-unit', 'messages', box), 1500);
        slideIn(el('p', 'k-sub', `Over ${s.data.lasted}, never 30 minutes apart.`, box), 1900);
        // One dot per message (up to 270), filling in like a feed scrolling by.
        const dots = hide(el('div', 'k-days', null, F));
        for (let k = 0; k < Math.min(270, s.value); k++) el('i', 'on', null, dots);
        dots.animate([{clipPath: 'inset(0 0 100% 0)'}, {clipPath: 'inset(0 0 0 0)'}], {duration: 1400, delay: 2200, easing: ease.out, fill: 'both'});
      },
    },
  };
  // Any story without its own scene: the question, then the answer set large.
  const fallback = {
    ask,
    reveal(stage, s, r, c) {
      sweep(stage);
      const F = wipe(stage, revCol(c.i), 'circle', 150);
      const a = el('p', 'k-answer', s.answer, F);
      slideIn(a, 400);
      if (s.guess?.type === 'pick') choices(F, s, r, 900);
      verdict(F, s, r, c, 1500, 0.55);
    },
  };
  // The controls take the text colour of the field on screen.
  const chrome = (i, phase) => phase === 'summary' ? 'var(--on-c4)' : `var(--on-${phase === 'ask' || phase === 'guess' ? askCol(i) : revCol(i)})`;
  return {id: 'kinetic', scenes, fallback, chrome};
})();
