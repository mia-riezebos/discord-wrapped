import assert from 'node:assert/strict';
import {test} from 'node:test';
import {STORY_SECTIONS} from '../src/stories.js';
import {loadTheme, themeCss, themePrefetch, themeStories} from '../src/theme.js';
import {defineTheme} from '../src/themes/define.js';

// theme.js finds STORY_SECTIONS in the page's shared scope.
Object.assign(globalThis, {STORY_SECTIONS});
// Failures are logged on purpose; keep the test output clean.
console.error = () => {};

// A stage that records what scenes put on it, as {text, remove()} nodes.
const stage = () => ({children: []});
const said = s => s.children.map(n => n.text);
// A scene that writes `name:step` on the stage, or throws after writing when `fails` names the step.
const scene = (name, fails) => Object.fromEntries(['ask', 'reveal'].map(step => [step, st => {
  st.children.push({text: `${name}:${step}`, remove() { st.children.splice(st.children.indexOf(this), 1); }});
  if (fails === step) throw new Error(`${name} broke`);
}]));
const KINETIC = defineTheme({id: 'kinetic', scenes: {messages: scene('k-messages'), streak: scene('k-streak')}, fallback: scene('k-plain'), chrome: () => 'kinetic'});
const load = def => async id => ({default: defineTheme({id, ...def})});

test('a scene the theme leaves out plays Kinetic’s', async () => {
  const t = await loadTheme('2025', KINETIC, load({scenes: {messages: scene('y-messages')}}));
  const a = stage(), b = stage();
  await t.scenes.messages.ask(a); await t.scenes.streak.ask(b);
  assert.deepEqual(said(a), ['y-messages:ask']);
  assert.deepEqual(said(b), ['k-streak:ask']);
});

test('a scene that fails to load plays Kinetic’s', async () => {
  const t = await loadTheme('2025', KINETIC, load({scenes: {messages: () => Promise.reject(new Error('404')), streak: async () => ({default: {ask() {}}})}}));
  const a = stage(), b = stage();
  await t.scenes.messages.ask(a); await t.scenes.streak.reveal(b);
  assert.deepEqual(said(a), ['k-messages:ask']);
  assert.deepEqual(said(b), ['k-streak:reveal'], 'a module without ask and reveal is no scene');
});

test('a scene that throws is cleared and replayed in Kinetic, keeping what was there before', async () => {
  const t = await loadTheme('2025', KINETIC, load({scenes: {messages: async () => ({default: scene('y-messages', 'reveal')}), loudest: scene('y-loudest', 'ask')}}));
  const a = stage();
  await t.scenes.messages.ask(a);
  await t.scenes.messages.reveal(a);
  assert.deepEqual(said(a), ['y-messages:ask', 'k-messages:reveal']);
  // A story Kinetic has no scene for falls back to its plain scene.
  const b = stage();
  await t.scenes.loudest.ask(b);
  assert.deepEqual(said(b), ['k-plain:ask']);
});

test('an entry file that fails gives all-Kinetic, marked failed', async () => {
  for (const broken of [async () => { throw new Error('offline'); }, async () => ({default: defineTheme({id: '2024'})}), load({css: () => Promise.reject(new Error('404'))})]) {
    const t = await loadTheme('2025', KINETIC, broken);
    assert.equal(t.failed, true);
    assert.equal(t.id, 'kinetic');
    assert.equal(t.scenes, KINETIC.scenes);
  }
});

test('the controls follow the theme on its own scenes and summary, and Kinetic on the rest', async () => {
  const t = await loadTheme('2025', KINETIC, load({scenes: {messages: scene('y')}, chrome: () => 'year'}));
  assert.equal(t.chrome(0, 'ask', {id: 'messages'}), 'year');
  assert.equal(t.chrome(1, 'ask', {id: 'streak'}), 'kinetic');
  assert.equal(t.chrome(2, 'summary', undefined), 'year');
  const plain = await loadTheme('2025', KINETIC, load({}));
  assert.equal(plain.chrome(2, 'summary', undefined), 'kinetic');
});

const core = [{id: 'messages', section: 'overview', question: 'How many?'}, {id: 'night-owl', section: 'rhythm', question: 'Owl?'}, {id: 'top-word', section: 'words', question: 'Word?'}];
const facts = (extra = {}) => async () => ({question: 'Q?', answer: 'A', share: 'S', card: {hero: 'H'}, ...extra});

test('year stories play after their section, and a failing one is skipped', async () => {
  const t = await loadTheme('2025', KINETIC, load({stories: [
    {id: 'fame-year', section: 'fame', facts: facts()},
    {id: 'rhythm-year', section: 'rhythm', facts: facts(), scene: async () => ({default: scene('y-rhythm')})},
    {id: 'throws', section: 'overview', facts: async () => { throw new Error('bad data'); }},
    {id: 'thin', section: 'overview', facts: async () => null},
    {id: 'no-answer', section: 'overview', facts: async () => ({question: 'Q?', card: {hero: 'H'}})},
    {id: 'lost-scene', section: 'words', facts: facts(), scene: () => Promise.reject(new Error('404'))},
  ]}));
  const list = await themeStories(t, core, {});
  assert.deepEqual(list.map(s => s.id), ['messages', 'night-owl', 'rhythm-year', 'top-word', 'fame-year']);
  const a = stage();
  await t.scenes['rhythm-year'].ask(a);
  assert.deepEqual(said(a), ['y-rhythm:ask']);
});

test("a year story's facts can ask for another period's report", async () => {
  const reports = {2024: {totals: {messages: 50}}};
  const t = await loadTheme('2025', KINETIC, load({stories: [{id: 'vs', section: 'overview', facts: async ({report, reportOf}) => {
    const last = await reportOf({kind: 'year', anchor: '2024-12-31'});
    return {question: 'More than 2024?', answer: `${report.totals.messages - last.totals.messages} more`, share: 'S', card: {hero: 'H'}};
  }}]}));
  const [, vs] = await themeStories(t, core.slice(0, 1), {report: {totals: {messages: 80}}, reportOf: async p => reports[p.anchor.slice(0, 4)]});
  assert.equal(vs.answer, '30 more');
});

test('a theme may reword a question, never the answer', async () => {
  const t = await loadTheme('2025', KINETIC, load({questions: {messages: s => `Extra! ${s.question}`, 'night-owl': () => { throw new Error('typo'); }}}));
  const list = await themeStories(t, core, {});
  assert.deepEqual(list.map(s => s.question), ['Extra! How many?', 'Owl?', 'Word?']);
});

test("the page stylesheet scopes the theme's tokens to its year", async () => {
  const t = await loadTheme('2025', KINETIC, load({tokens: {light: {bg: '#fff'}, dark: {bg: '#000'}}, fonts: [{family: 'Face', src: '/themes/2025/face.woff2'}], css: async () => ({default: '.x { color: red }'})}));
  const css = themeCss(t);
  assert.match(css, /html\[data-theme="2025"\] \{ --bg: #fff; \}/);
  assert.match(css, /prefers-color-scheme: dark\) \{ html\[data-theme="2025"\] \{ --bg: #000; \}/);
  assert.match(css, /@font-face \{ font-family: "Face"; src: url\("\/themes\/2025\/face\.woff2"\)/);
  assert.match(css, /\.x \{ color: red \}/);
});

test('the example theme loads every scene, its stylesheet and its year story', async () => {
  const t = await loadTheme('example', KINETIC, id => import(`../src/themes/${id}/index.js`));
  assert.equal(t.failed, undefined);
  assert.equal(t.id, 'example');
  assert.ok(Object.keys(t.scenes).length >= 18);
  assert.match(t.css, /\.n-sheet/);
  const report = y => ({range: {from: `${y}-01-01`}, totals: {messages: y === '2024' ? 1000 : 1500}});
  const [, vs] = await themeStories(t, core.slice(0, 1), {report: report('2025'), period: {kind: 'year', label: '2025'}, reportOf: async p => report(p.anchor.slice(0, 4))});
  assert.equal(vs.id, 'vs-last-year');
  assert.equal(vs.card.hero, '+50%');
  // Without messages the year before, the story has nothing to compare.
  const alone = await themeStories(t, core.slice(0, 1), {report: report('2025'), period: {kind: 'year', label: '2025'}, reportOf: async () => ({empty: true})});
  assert.deepEqual(alone.map(s => s.id), ['messages']);
});

test('only the themes for years in the package are saved ahead, and none with data saver on', () => {
  const files = {2019: ['/themes/define.js', '/themes/2019/index.js'], 2021: ['/themes/define.js', '/themes/2021/index.js', '/themes/2021/face.woff2'], 2024: ['/themes/define.js', '/themes/2024/index.js']};
  const bounds = {first: '2020-03-14', last: '2022-01-02'};
  assert.deepEqual(themePrefetch(bounds, files, undefined), ['/themes/define.js', '/themes/2021/index.js', '/themes/2021/face.woff2']);
  assert.deepEqual(themePrefetch({first: '2019-12-31', last: '2024-01-01'}, files, {saveData: false}), ['/themes/define.js', '/themes/2019/index.js', '/themes/2021/index.js', '/themes/2021/face.woff2', '/themes/2024/index.js']);
  assert.deepEqual(themePrefetch(bounds, files, {saveData: true}), []);
  assert.deepEqual(themePrefetch({first: '2025-01-01', last: '2025-06-30'}, files, undefined), []);
});
