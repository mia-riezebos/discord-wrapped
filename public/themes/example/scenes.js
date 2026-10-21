/* Late edition's one scene, drawn from each story's card facts so it fits every story. Styles are the n- classes in
   style.js. Scenes only build elements and start Web Animations; the player times and skips them. */
const ease = {land: 'cubic-bezier(.2,.8,.2,1)', thud: 'cubic-bezier(.55,0,.9,.3)', out: 'cubic-bezier(.16,1,.3,1)'};
const num = n => Number(n).toLocaleString();
const el = (tag, cls, text, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.append(n);
  return n;
};
const hide = n => { n.setAttribute('aria-hidden', 'true'); return n; };
// Font size in cqw that sets `str` across about `width` cqw of the page, for a face about k em per character.
const fit = (str, width = 86, k = .62, max = 32) => `${Math.min(max, width / (String(str).length * k)).toFixed(2)}cqw`;

// A page of the paper: the masthead, its rules drawn in from the left.
function sheet(stage, c, cls = '') {
  const page = el('div', 'n-sheet ' + cls, null, stage), mast = hide(el('header', 'n-mast', null, page));
  el('p', 'n-name', 'The Wrapped', mast);
  const meta = el('p', 'n-meta', null, mast);
  el('span', null, `${c.title} edition`, meta);
  el('span', null, `No. ${c.i + 1} of ${c.total}`, meta);
  mast.querySelectorAll('.n-name, .n-meta').forEach(n => n.animate([{opacity: 0}, {opacity: 1}], {duration: 300, delay: 350, fill: 'both'}));
  mast.animate([{backgroundSize: '0% 3px, 0% 1px'}, {backgroundSize: '100% 3px, 100% 1px'}], {duration: 520, delay: 300, easing: ease.out, fill: 'both'});
  return page;
}
// The words of a line set one after another, like type going in.
function typeset(parent, cls, text, at) {
  const line = el('h2', cls, null, parent);
  line.setAttribute('aria-label', text);
  text.split(' ').forEach((w, k) => {
    hide(el('span', null, w, line)).animate([{opacity: 0, transform: 'translateY(.35em)'}, {opacity: 1, transform: 'none'}], {duration: 380, delay: at + k * 45, easing: ease.out, fill: 'both'});
    line.append(' ');
  });
  return line;
}
const rise = (n, at) => n.animate([{opacity: 0, transform: 'translateY(3cqw)'}, {opacity: 1, transform: 'none'}], {duration: 420, delay: at, easing: ease.out, fill: 'both'});

// The card's chart as hairline columns, the top bucket in red, labelled at both ends and under the top one.
function columns(page, {buckets, top}, at) {
  const box = hide(el('div', 'n-cols', null, page)), max = Math.max(1, ...buckets.map(b => b[1]));
  buckets.forEach(([label, n], k) => {
    const col = el('div', k === top ? 'on' : null, null, box), bar = el('i', null, null, col);
    bar.style.height = `${Math.max(1, 100 * n / max)}%`;
    if (k === top) el('b', null, num(n), bar);
    if (k === top || k === 0 || k === buckets.length - 1) el('span', null, label, col);
    bar.animate([{transform: 'scaleY(0)'}, {transform: 'none'}], {duration: 500, delay: at + k * 35, easing: ease.out, fill: 'both'});
  });
}
// A box score: ranked rows with dotted leaders, the row that matters set in red. Row `mine` is marked as your guess;
// its label clips first, so the mark always shows.
function table(page, rows, on, at, mine = -1) {
  const box = el('ol', 'n-table', null, page);
  rows.forEach(([label, value], k) => {
    const row = el('li', k === on ? 'on' : null, null, box);
    el('span', null, label, row);
    if (k === mine) el('em', null, ' (your guess)', row);
    el('b', null, value, row);
    row.animate([{clipPath: 'inset(0 100% 0 0)'}, {clipPath: 'inset(0 0 0 0)'}], {duration: 420, delay: at + k * 90, easing: ease.out, fill: 'both'});
  });
}
// What you guessed, as said in the stamp.
const said = (spec, guess) => spec.type === 'pick' ? spec.options.find(o => o.key === guess)?.label : `${num(guess)} ${spec.unit}`;

export const front = {
  ask(stage, s, c) {
    const page = sheet(stage, c);
    page.animate([{transform: 'translateY(105%) rotate(4deg)'}, {transform: 'none'}], {duration: 650, easing: ease.land, fill: 'both'});
    typeset(page, 'n-head', s.question, 550);
  },
  reveal(stage, s, r, c) {
    const card = s.card, page = sheet(stage, c, 'n-answer');
    page.animate([{transform: 'translateX(102%) rotate(3deg)'}, {transform: 'none'}], {duration: 560, easing: ease.land, fill: 'both'});
    rise(el('p', 'n-kicker', s.question, page), 450);
    const lead = el('p', 'n-lead', card.hero, page);
    lead.style.fontSize = fit(card.hero);
    lead.animate([{opacity: 0, transform: 'scale(1.3)'}, {opacity: 1, transform: 'none'}], {duration: 260, delay: 700, easing: ease.thud, fill: 'both'});
    hide(el('div', 'n-rule', null, page)).animate([{transform: 'scaleX(0)'}, {transform: 'none'}], {duration: 480, delay: 950, easing: ease.out, fill: 'both'});
    if (card.fact) rise(el('p', 'n-dek', card.fact, page), 1050);
    const g = s.guess;
    if (g?.type === 'pick') table(page, g.options.map(o => [o.label, num(o.count)]), g.options.findIndex(o => o.key === g.answer), 1300, r && !r.skipped ? g.options.findIndex(o => o.key === r.guess) : -1);
    else if (card.chart) columns(page, card.chart, 1300);
    else if (card.list) table(page, card.list.map(([label, n]) => [label, num(n)]), 0, 1300);
    if (!r || r.skipped) return;
    const stamp = el('p', 'n-stamp', null, page);
    el('span', null, `You guessed ${said(g, r.guess)}`, stamp);
    stamp.append(' ');
    el('b', null, r.line, stamp);
    c.sticker(page, stamp, .5);
    stamp.animate([{opacity: 0, transform: 'scale(2.2) rotate(-14deg)'}, {opacity: 1, transform: 'none'}], {duration: 300, delay: 1900, easing: ease.thud, fill: 'both'});
  },
};
