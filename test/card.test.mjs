import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CARD_SHAPES, drawCard, layoutCard} from '../src/card.js';
import {markName, newRedaction, redactCard, setToggle} from '../src/redaction.js';

// Every character is 0.55 em wide, so widths are predictable.
const measure = (t, size) => t.length * size * .55;
const SHAPES = Object.keys(CARD_SHAPES);
const plain = {hero: '12,345', fact: 'Messages sent in 2025', host: 'discordwrapped.app'};
const ranked = {hero: '#2 server: Cozy Corner', fact: '4,210 messages in 2025', host: 'discordwrapped.app',
  bars: {items: [['Big Hall', 9000, '9,000'], ['Cozy Corner', 4210, '4,210'], ['Tiny Room', 12, '12']], highlight: 1}};
const charted = {...plain, chart: {image: {}, width: 1000, height: 240}};

for (const shape of SHAPES) {
  test(`${shape}: one word box per word of every run, at the run's measured offsets`, () => {
    const L = layoutCard({...ranked, question: 'Which server did you talk in most?', guess: 'I guessed Big Hall.'}, shape, measure);
    assert.deepEqual(L.words.map(w => w.text), L.runs.flatMap(r => r.text.split(' ')));
    L.runs.forEach((r, i) => {
      let at = 0;
      for (const w of L.words.filter(w => w.run === i)) {
        at = r.text.indexOf(w.text, at);
        assert.ok(Math.abs(w.x - (r.x + measure(r.text.slice(0, at), r.size))) < 1e-9);
        assert.equal(w.w, measure(w.text, r.size));
        assert.ok(w.y < r.y && w.y + w.h > r.y, 'box spans the baseline');
        assert.ok(w.x >= 0 && w.x + w.w <= L.width && w.y >= 0 && w.y + w.h <= L.height, `${w.text} stays on the card`);
        at += w.text.length;
      }
    });
  });

  test(`${shape}: a long summary shrinks its lines and keeps the score clear of the footer`, () => {
    const lines = Array.from({length: 18}, (_, i) => `Answer number ${i + 1}`);
    const L = layoutCard({hero: '2025', question: 'That was your 2025', lines, guess: 'I got 3 of 5 guesses right.', host: 'discordwrapped.app'}, shape, measure);
    const host = L.runs.find(r => r.role === 'host'), drawn = L.runs.filter(r => r.role === 'line'), guess = L.runs.find(r => r.role === 'guess');
    assert.ok(drawn.length >= 4, `${drawn.length} lines fit, at least Overview's four`);
    assert.ok(drawn.at(-1).y < guess.y - guess.size, 'the score sits below the last line');
    assert.ok(guess.y < host.y - host.size, 'the score sits above the footer');
  });

  test(`${shape}: every bar ends before its value starts`, () => {
    const L = layoutCard({...ranked, bars: {items: [['Big Hall', 19333, '19,333'], ['Cozy Corner', 7696, '7,696']], highlight: 0}}, shape, measure);
    const values = L.runs.filter(r => r.role === 'bar-value');
    L.bars.forEach((b, i) => assert.ok(b.x + b.w < values[i].x, `bar ${i} stops short of ${values[i].text}`));
  });

  test(`${shape}: a long headline shrinks to fit two lines instead of being cut`, () => {
    const hero = 'Wednesday, 17 September 2025 was my busiest day ever';
    for (const model of [{...plain, hero}, {...charted, hero}]) {
      const lines = layoutCard(model, shape, measure).runs.filter(r => r.role === 'hero');
      assert.equal(lines.length, 2);
      assert.equal(lines.map(l => l.text).join(' '), hero);
      for (const l of lines) assert.ok(l.x + measure(l.text, l.size) <= CARD_SHAPES[shape][0] - l.x);
    }
  });

  test(`${shape}: the footer is the host only`, () => {
    const L = layoutCard(plain, shape, measure), foot = L.runs.filter(r => r.y > L.height * .8);
    assert.deepEqual(foot.map(r => [r.role, r.text]), [['host', 'discordwrapped.app']]);
  });

  test(`${shape}: ranked bars highlight the shared row and fit under the text`, () => {
    const L = layoutCard(ranked, shape, measure), labels = L.runs.filter(r => r.role === 'bar-label');
    assert.deepEqual(labels.map(r => r.text), ['Big Hall', 'Cozy Corner', 'Tiny Room']);
    assert.deepEqual(labels.map(r => r.color), ['muted', 'fg', 'muted']);
    assert.deepEqual(L.bars.map(b => b.on), [false, true, false]);
    const fact = L.runs.find(r => r.role === 'fact'), host = L.runs.find(r => r.role === 'host');
    for (const b of L.bars) assert.ok(b.y > fact.y && b.y + b.h < host.y - host.size);
  });

  test(`${shape}: a chart keeps its aspect ratio and sits between the text and the footer`, () => {
    const L = layoutCard(charted, shape, measure), fact = L.runs.find(r => r.role === 'fact'), host = L.runs.find(r => r.role === 'host');
    assert.ok(Math.abs(L.chart.w / L.chart.h - 1000 / 240) < 1e-9);
    assert.ok(L.chart.y > fact.y && L.chart.y + L.chart.h < host.y - host.size);
    assert.equal(L.bars, null);
  });

  test(`${shape}: drawCard paints every word and returns the layout's word boxes`, () => {
    const texts = [];
    const g = {font: '', measureText(t) { return {width: measure(t, +this.font.match(/(\d+(?:\.\d+)?)px/)[1])}; },
      fillText: t => texts.push(t), fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, drawImage() {}};
    globalThis.document = {createElement: () => ({getContext: () => g})};
    try {
      const theme = {font: 'system-ui', colors: {surface: '#fff', fg: '#000', muted: '#666', accent: '#58f', soft: '#eee'}};
      const {canvas, words} = drawCard(ranked, shape, theme, null);
      assert.deepEqual([canvas.width, canvas.height], CARD_SHAPES[shape]);
      const L = layoutCard(ranked, shape, measure);
      assert.deepEqual(texts, L.words.map(w => w.text));
      assert.deepEqual(words, L.words);
    } finally { delete globalThis.document; }
  });
}

// A canvas stand-in that records what was written and how many marks were scribbled.
function fakeCanvas() {
  const g = {font: '', texts: [], strokes: 0, measureText(t) { return {width: measure(t, +this.font.match(/(\d+(?:\.\d+)?)px/)[1])}; },
    fillText(t) { this.texts.push(t); }, fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, drawImage() {},
    save() {}, restore() {}, moveTo() {}, lineTo() {}, stroke() { this.strokes++; }};
  globalThis.document = {createElement: () => ({getContext: () => g})};
  return g;
}
const theme = {font: 'system-ui', colors: {surface: '#fff', fg: '#000', muted: '#666', accent: '#58f', soft: '#eee'}};
const named = {hero: markName('Cozy Corner'), heroAlt: '4,210 messages', fact: 'Number 2 server in 2025', host: 'discordwrapped.app',
  bars: {items: [[markName('Big Hall'), 9000, '9,000'], [markName('Cozy Corner'), 4210, '4,210'], [markName('A Very Long Server Name Indeed'), 12, '12']], highlight: 1}};

for (const shape of SHAPES) {
  test(`${shape}: a hidden word is a mark of one fixed width, whatever it covers`, () => {
    const hide = text => ({text: '████', hidden: true, pre: '', post: ''});
    const L = layoutCard({...plain, fact: [{text: 'I'}, hide('a'), {text: 'and'}, hide('a much longer phrase')]}, shape, measure);
    const marks = L.words.filter(w => w.hidden);
    assert.equal(marks.length, 2);
    assert.equal(marks[0].w, marks[1].w);
    assert.ok(marks[0].w > measure('a', marks[0].h));
  });

  test(`${shape}: drawCard scribbles hidden names, bar labels included, and keeps the rest as text`, () => {
    const g = fakeCanvas();
    try {
      const {words} = drawCard(named, shape, theme, m => redactCard(m, setToggle(newRedaction(), 'name', true)));
      assert.equal(g.strokes, 3, 'one mark per bar label');
      assert.ok(!g.texts.some(t => /Hall|Cozy|Server/.test(t)), 'no name is written');
      assert.ok(g.texts.includes('4,210') && g.texts.includes('messages'), 'the hero falls back to the count');
      for (const w of words.filter(w => w.hidden)) assert.ok(w.ref.tokens.length >= 2, 'a mark covers the whole name');
      assert.equal(new Set(words.filter(w => w.hidden).map(w => w.w)).size, 1, 'every label mark is the same width');
    } finally { delete globalThis.document; }
  });
}
