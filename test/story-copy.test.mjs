// Proves every story's copy fits its slot, keeps its tense and plurals, and never posts a DM name, for a year and
// All time with counts of 0, 1 and very large.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildStories, reelEnding, STORY_SECTIONS} from '../src/stories.js';
import {guessText, pickSet, scoreGuess} from '../src/guess.js';
import {defineTheme} from '../src/themes/define.js';

globalThis.pickSet = pickSet;

const YEAR = {kind: 'year', label: '2025', in: 'in 2025', from: '2025-01-01', to: '2025-12-31'};
const ALL = {kind: 'all', label: 'since 2019', in: 'since 2019', from: '2019-03-02', to: '2025-06-30'};
const LONG = 'okay so I have been thinking about this for a while and I finally figured out what was bothering me '.repeat(3).trim();
// Discord's markup for a person, a role, a channel and a custom emoji; none of it may reach the screen.
const AT = '<@400140550503923713>', MARKUP = /<(?:@[!&]?|#|a?:\w+:)\d+>/;
const DM_NAMES = ['averyveryverylongusername_here', 'bo', ...Array.from({length: 10}, (_, k) => 'pal' + k)];

// A report where every count is `n` (or the least that still plays its story), so 1 reaches every singular.
function report(period, n, {messages = n, activeDays = n} = {}) {
  const all = period.kind === 'all', days = all ? 2400 : 365, at = n > 1 ? n : Math.max(2, n);
  const keys = all ? ['2019', '2022', '2025'] : ['2025-01', '2025-03', '2025-07'];
  const big = n > 1;
  return {
    totals: {messages, activeDays: big ? days : activeDays, calendarDays: days, urls: at},
    unit: all ? 'year' : 'month',
    periods: n ? Object.fromEntries(keys.map((k, i) => [k, {total: i ? n : 1, Servers: n, DMs: i ? n : 1, 'Group DMs': big ? n : 0}])) : {},
    streaks: n ? [[big ? 91 : 1, keys[0].slice(0, 4) + '-03-01', keys[0].slice(0, 4) + (big ? '-05-30' : '-03-01')]] : [],
    days: [], range: {from: period.from, to: period.to},
    hourly: Array.from({length: 24}, (_, h) => !n ? 0 : [21, 22, 23, 0, 1, 2].includes(h) ? (big ? n : 9) / 6 : h === 7 ? 1 : 0).map(Math.round),
    peakDays: n ? [{date: '2024-09-25', count: big ? n : 1, contexts: [], topText: big ? [`${AT} wait`, n] : ['', 0]}] : [],
    guilds: n ? [{name: 'The extremely long server name', count: n}, {name: 'Game night', count: 1}] : [],
    channels: n ? DM_NAMES.map((name, k) => ({id: 'd' + k, name, count: big ? n - k : 1, group: 'DMs'})) : [],
    words: n ? [['supercalifragilisticexpialidocious', n], ['honestly', 1], ['wait', 1]] : [],
    expressions: n ? [[big ? 'gg <:kekw:400140550503923713>' : LONG, at], ['<a:party:400140550503923713>', 2]] : [],
    emoji: n ? [['cat_stare', at], ['kekw', 1]] : [],
    domains: n ? [['open.spotify.com', at], ['github.com', 1]] : [],
    lengths: [['1–20', n], ['500+', n ? 1 : 0]],
    fame: n ? {first: {text: big ? `${AT} ${LONG}` : `${AT} <@&400140550503923714>`, at: '2019-03-02 09:15'}, longest: {text: big ? `${LONG} <#400140550503923713>` : 'k'}} : {first: null, longest: null},
    bursts: {bestMinute: {count: big ? 61 : n && 5, at: '2024-09-25 22:13'}, largestSessions: n ? [[at, big ? 400 : 0, '2024-09-25 21:04']] : []},
  };
}

// Kinetic's question pills break greedily at about 13 characters; a question gets 1.5 s, so 5 lines at most.
const pills = text => text.split(' ').reduce((out, w) => {
  const last = out.at(-1);
  if (last && (last + ' ' + w).length <= 13) out[out.length - 1] = last + ' ' + w; else out.push(w);
  return out;
}, []).length;

const BROKEN = /undefined|NaN|null|Infinity|\[object/;
const NOUNS = '(?:Discord )?(?:message|day|time|character|link|hour|minute|person|people|DM|conversation)';
const ONE_MANY = new RegExp(`(?<![\\d,.])1 ${NOUNS}s\\b|(?<![\\d,.])1 people\\b`);
const MANY_ONE = new RegExp(`(?<![\\d,.])(?:[02-9]|\\d{2,}|\\d{1,3}(?:,\\d{3})+) (?:Discord )?(?:message|day|time|character|link|hour|minute|DM|conversation)\\b(?!s)`);
// Running totals over all time take the present perfect; a year is told in the past.
const TENSE = {
  all: /\bdid you\b|(?<!have )\b(?:I|you) (?:sent|used|shared|typed|DMed|was|showed)\b|\bwent\b|\bThat was\b/,
  year: /\b(?:have|has) (?:you|been|gone|shown|sent|posted|DMed|linked|used|talked)\b|\bI've\b|What's been|\bThat's\b(?! \d)/,
};

const cases = [YEAR, ALL].flatMap(p => [
  ['0', report(p, 0)], ['1', report(p, 1)], ['1, two days', report(p, 1, {messages: 2, activeDays: 2})], ['large', report(p, 1234567)],
].map(([size, r]) => ({p, size, r})));

test('every story reads right for a year and all time, at 0, 1 and large counts', () => {
  for (const {p, size, r} of cases) {
    const where = `${p.kind}, ${size}`, stories = buildStories(r, p);
    if (size === 'large') assert.equal(stories.length, 18, `${where}: every story plays`);
    for (const s of stories) {
      const at = `${s.id} (${where})`, texts = {question: s.question, answer: s.answer, share: s.share, ...s.card && {hero: s.card.hero, fact: s.card.fact}};
      for (const [field, text] of Object.entries(texts)) {
        // Quotes are someone's own words; the rules are for ours.
        const ours = text.replace(/“[^”]*”/g, '“…”');
        assert.ok(typeof text === 'string' && text.trim(), `${at}: ${field} is empty`);
        assert.doesNotMatch(text, BROKEN, `${at}: ${field}`);
        assert.doesNotMatch(ours, ONE_MANY, `${at}: ${field} has a plural after 1`);
        assert.doesNotMatch(ours, MANY_ONE, `${at}: ${field} has a singular after a count`);
        if (field !== 'answer') assert.doesNotMatch(ours, TENSE[p.kind === 'all' ? 'all' : 'year'], `${at}: ${field} is in the wrong tense`);
      }
      for (const text of strings(s)) assert.doesNotMatch(text, MARKUP, `${at}: raw markup in ${text}`);
      const ours = s.share.replace(/“[^”]*”/g, '“…”');
      assert.ok(pills(s.question) <= 5, `${at}: question takes ${pills(s.question)} lines`);
      assert.ok(s.share.length < 200, `${at}: share has ${s.share.length} characters`);
      assert.doesNotMatch(s.share, /Discord Wrapped|#|\p{Extended_Pictographic}|\b[a-z][a-z\d+.-]*:\/\/|\bwww\./iu, at);
      assert.match(ours, /\b(?:I|I've|I'm|my)\b/i, `${at}: share is first person`);
      for (const name of DM_NAMES) assert.doesNotMatch(s.share, new RegExp(`\\b${name}\\b`), `${at}: share names someone from the DMs`);
      assert.doesNotMatch(s.answer.replace(/“[^”]*”/g, '“…”'), /\b(?:you|your|I|I've|my|me)\b/i, `${at}: the summary lists answers alone, and its post quotes them`);
      if (!s.card) continue;
      assert.ok(s.card.hero.length <= 24, `${at}: hero has ${s.card.hero.length} characters`);
      assert.ok(s.card.fact.length <= 70, `${at}: fact has ${s.card.fact.length} characters`);
      assert.match(s.card.fact, /^[A-Z\d“:].*\.$/, `${at}: fact is a sentence`);
    }
  }
});

// Every string in a story, its card and the data its scenes draw.
const strings = x => typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : [];

// Just enough DOM for a scene to draw: each node keeps its text and aria-label, animations are no-ops.
const node = () => ({
  children: [], style: {setProperty() {}}, attrs: {}, className: '', textContent: '',
  append(...kids) { this.children.push(...kids.map(k => typeof k === 'string' ? {textContent: k, children: []} : k)); },
  setAttribute(k, v) { this.attrs[k] = v; }, animate: () => ({}), querySelectorAll: () => [],
});
// What a scene shows: every node's text and label. Odometer strips are digits only and read through their label.
const shown = n => [n.className === 'k-strip' ? '' : n.textContent, n.attrs?.['aria-label'] || '', ...n.children.flatMap(shown)].filter(Boolean);
const scenes = (() => {
  const context = {document: {createElement: node}, guessText, defineTheme};
  vm.runInNewContext(readFileSync(new URL('../src/kinetic.js', import.meta.url), 'utf8').replace(/^export /gm, '') + ';this.K = KINETIC;', context);
  return context.K;
})();

test('every Kinetic scene shows real plurals and no raw markup, at 0, 1 and large counts', () => {
  for (const {p, size, r} of cases) for (const s of buildStories(r, p)) {
    const scene = scenes.scenes[s.id] || scenes.fallback, stage = node(), c = {i: 0, sticker() {}};
    // A guess locked in at 1, so "You guessed 1 message" reads too.
    const guess = s.guess && {guess: s.guess.type === 'pick' ? s.guess.answer : 1, line: 'Close.'};
    scene.ask(stage, s, c);
    scene.reveal(stage, s, guess, c);
    for (const text of shown(stage)) {
      const at = `${s.id} (${p.kind}, ${size}): ${text}`, ours = text.replace(/“[^”]*”/g, '“…”');
      assert.doesNotMatch(text, BROKEN, at);
      assert.doesNotMatch(text, MARKUP, at);
      assert.doesNotMatch(ours, ONE_MANY, at);
      assert.doesNotMatch(ours, MANY_ONE, at);
    }
  }
});

test('a pick-one reveal marks your guess apart from its label, so a long label clips and the mark stays', () => {
  const s = buildStories(cases.at(-1).r, ALL).find(s => s.guess?.type === 'pick'), {options} = s.guess, stage = node();
  scenes.scenes[s.id].reveal(stage, s, {guess: options[1].key, line: 'Close.'}, {i: 0, sticker() {}});
  const all = n => [n, ...n.children.flatMap(all)], mine = all(stage).filter(n => n.className === 'k-mine');
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].children.map(shown), [[options[1].label], [' (your guess)']]);
});

test('reel endings name the period, or the section, in its tense', () => {
  for (const p of [YEAR, ALL]) for (const section of [undefined, ...STORY_SECTIONS.map(s => s.id)]) {
    const ending = reelEnding(p, section);
    assert.doesNotMatch(ending, BROKEN);
    assert.doesNotMatch(ending, /\.$/, 'a heading; the screen reader adds the period');
    assert.ok(ending.includes(p.kind === 'all' ? p.in : p.label), ending);
    assert.match(ending, p.kind === 'all' ? /^That's / : /^That was /, ending);
  }
});

test('every verdict is one short line, at 0, 1 and large answers', () => {
  const slider = {type: 'slider', scale: 'log', max: 365000, tolerance: 0.15, unit: 'messages'};
  for (const answer of [0, 1, 37, 1234567]) for (const guess of [0, 1, answer * 0.5, answer * 0.9, answer, answer * 1.25, answer * 3, 365000]) {
    const {line} = scoreGuess(slider, answer, Math.round(guess));
    assert.ok(line && line.length <= 40, `${guess} for ${answer}: ${line}`);
    assert.doesNotMatch(line, BROKEN);
    assert.match(line, /\.$/);
  }
});
