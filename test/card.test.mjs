import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CARD_SHAPES, drawCard, layoutCard} from '../src/card.js';

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
        assert.equal(w.x, r.x + measure(r.text.slice(0, at), r.size));
        assert.equal(w.w, measure(w.text, r.size));
        assert.ok(w.y < r.y && w.y + w.h > r.y, 'box spans the baseline');
        assert.ok(w.x >= 0 && w.x + w.w <= L.width && w.y >= 0 && w.y + w.h <= L.height, `${w.text} stays on the card`);
        at += w.text.length;
      }
    });
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

  test(`${shape}: drawCard paints every run and returns the layout's word boxes`, () => {
    const texts = [];
    const g = {font: '', measureText(t) { return {width: measure(t, +this.font.match(/(\d+(?:\.\d+)?)px/)[1])}; },
      fillText: t => texts.push(t), fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, drawImage() {}};
    globalThis.document = {createElement: () => ({getContext: () => g})};
    try {
      const theme = {font: 'system-ui', colors: {surface: '#fff', fg: '#000', muted: '#666', accent: '#58f', soft: '#eee'}};
      const {canvas, words} = drawCard(ranked, shape, theme, null);
      assert.deepEqual([canvas.width, canvas.height], CARD_SHAPES[shape]);
      const L = layoutCard(ranked, shape, measure);
      assert.deepEqual(texts, L.runs.map(r => r.text));
      assert.deepEqual(words, L.words);
    } finally { delete globalThis.document; }
  });
}
