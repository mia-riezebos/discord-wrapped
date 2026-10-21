import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildStories} from '../src/stories.js';
import {pickSet} from '../src/guess.js';

// On the page all scripts share one scope, so stories.js finds pickSet there.
globalThis.pickSet = pickSet;

const n = x => x.toLocaleString();
const YEAR = {kind: 'year', label: '2025', in: 'in 2025', from: '2025-01-01', to: '2025-12-31'};
const ALL = {kind: 'all', label: 'since 2019', in: 'since 2019', from: '2019-03-02', to: '2025-06-30'};
const month = (total, rest = {}) => ({total, ...rest});
// A small hand-made year: three months of messages and two streaks.
const report = (over = {}) => ({
  totals: {messages: 12345, activeDays: 200, calendarDays: 365},
  unit: 'month',
  periods: {'2025-01': month(1000), '2025-03': month(9000), '2025-02': month(2345)},
  streaks: [[41, '2025-03-01', '2025-04-10'], [3, '2025-01-02', '2025-01-04']],
  days: [[20089, 4]],
  range: {from: '2025-01-01', to: '2025-12-31'},
  words: [], expressions: [], emoji: [], domains: [], lengths: [], fame: {first: null, longest: null}, bursts: {largestSessions: []},
  ...over,
});
const byId = stories => Object.fromEntries(stories.map(s => [s.id, s]));

test('Overview plays its four stories in report order', () => {
  const stories = buildStories(report(), YEAR);
  assert.deepEqual(stories.map(s => s.id), ['messages', 'active-days', 'loudest', 'streak']);
  assert.ok(stories.every(s => s.section === 'overview' && s.enough));
});

test('questions, answers and share text carry the period numbers', () => {
  const s = byId(buildStories(report(), YEAR));
  assert.equal(s.messages.question, 'How many messages did you send in 2025?');
  assert.equal(s.messages.answer, `${n(12345)} messages`);
  assert.equal(s.messages.share, `I sent ${n(12345)} messages on Discord in 2025.`);
  assert.equal(s.messages.value, 12345);
  assert.equal(s.messages.data.perDay, 34);
  assert.equal(s['active-days'].answer, '200 of 365 days');
  assert.equal(s['active-days'].data.pct, 55);
  assert.equal(s.loudest.question, 'Which month were you loudest in 2025?');
  assert.equal(s.loudest.value, 9000);
  assert.match(s.loudest.answer, new RegExp(`, with ${n(9000)} messages$`));
  assert.equal(s.loudest.data.top, 2, 'buckets are in date order, the busiest one marked');
  assert.equal(s.streak.value, 41);
  assert.match(s.streak.answer, /^41 days in a row, /);
  assert.equal(s.streak.share, 'My longest Discord streak in 2025: 41 days in a row.');
});

test('guess specs size the sliders from the period, not the answer', () => {
  const s = byId(buildStories(report(), YEAR));
  assert.deepEqual(s.messages.guess, {type: 'slider', scale: 'log', max: 365000, tolerance: 0.15, unit: 'messages'});
  assert.deepEqual(s['active-days'].guess, {type: 'slider', scale: 'linear', max: 365, tolerance: 0.1, unit: 'days'});
  assert.equal(s.loudest.guess, undefined);
});

test('all time asks in the present perfect and names years', () => {
  const s = byId(buildStories(report({unit: 'year', periods: {2019: month(10), 2020: month(500)}}), ALL));
  assert.equal(s.messages.question, 'How many messages have you sent since 2019?');
  assert.equal(s.messages.share, `I've sent ${n(12345)} messages on Discord since 2019.`);
  assert.equal(s['active-days'].question, 'How many days have you shown up since 2019?');
  assert.equal(s.loudest.question, 'Which year were you loudest?');
  assert.equal(s.loudest.answer, '2020, with 500 messages');
  assert.equal(s.streak.question, 'How many days in a row have you shown up?');
});

test('a thin period still plays every Overview story, marked as not enough', () => {
  const thin = report({totals: {messages: 1, activeDays: 1, calendarDays: 365}, periods: {'2025-05': month(1)}, streaks: [[1, '2025-05-04', '2025-05-04']]});
  const s = byId(buildStories(thin, YEAR));
  assert.deepEqual(Object.keys(s), ['messages', 'active-days', 'loudest', 'streak']);
  assert.equal(s.messages.answer, '1 message');
  assert.equal(s.loudest.enough, false);
  assert.equal(s.streak.enough, false);
  assert.equal(s.streak.answer, '1 day. No two days in a row.');
});

test('a period without streaks or buckets does not throw', () => {
  const s = byId(buildStories(report({totals: {messages: 0, activeDays: 0, calendarDays: 365}, periods: {}, streaks: [], days: []}), YEAR));
  assert.equal(s.streak.answer, 'No streak yet');
  assert.equal(s.loudest.answer, 'No messages yet');
  assert.equal(s.messages.enough, false);
});

/* ---------- Words & links and Hall of fame ---------- */
const ranked = (prefix, k) => Array.from({length: k}, (_, i) => [`${prefix}${i + 1}`, 100 - i]);
const msg = (text, at = '2025-01-03 09:15') => ({text, at, channel: 'general'});
// Twelve ranked words and sites, a repeated message, custom emoji, and the three Hall of fame records.
const words = (over = {}) => report({
  totals: {messages: 12345, activeDays: 200, calendarDays: 365, urls: 400},
  words: ranked('word', 12), expressions: [['lol', 300], ['ok', 120]], emoji: [['blobheart', 40], ['kekw', 12]], domains: [['youtube.com', 250], ['github.com', 90]],
  lengths: [['1–20', 900], ['21–100', 300], ['101–500', 20], ['500+', 0]],
  fame: {first: msg('hello there'), longest: msg('a '.repeat(150).trim())},
  bursts: {largestSessions: [[480, 200, '2025-08-17 21:04'], [90, 50, '2025-02-01 10:00']]},
  ...over,
});
const WORDS = ['top-word', 'say-most', 'emoji', 'links'], FAME = ['first-message', 'longest-message', 'longest-session'];

test('Words & links and Hall of fame play after Overview, in report order', () => {
  const stories = buildStories(words(), YEAR);
  assert.deepEqual(stories.map(s => s.id), ['messages', 'active-days', 'loudest', 'streak', ...WORDS, ...FAME]);
  assert.deepEqual(stories.map(s => s.section).slice(4), [...WORDS.map(() => 'words'), ...FAME.map(() => 'fame')]);
});

test('the top word is a pick-one guess between the real #1 and two of the next nine', () => {
  const {guess, ...s} = byId(buildStories(words(), YEAR))['top-word'];
  assert.equal(s.question, 'Which word did you use most in 2025?');
  assert.equal(s.answer, '“word1”, 100 times');
  assert.equal(s.share, 'My top word on Discord in 2025 was “word1”. I used it 100 times.');
  assert.equal(guess.type, 'pick');
  assert.equal(guess.answer, 'word1');
  assert.equal(guess.options.length, 3);
  assert.ok(guess.options.some(o => o.key === 'word1'));
  assert.ok(guess.options.every(o => +o.key.slice(4) <= 10), 'the others come from #2 to #10');
  assert.deepEqual(byId(buildStories(words(), YEAR))['top-word'].guess, guess, 'a replay asks the same choices');
  assert.deepEqual(s.card, {hero: '“word1”', fact: 'Used 100 times.', list: ranked('word', 5)});
});

test('what you say most, your top custom emoji and where your links go', () => {
  const s = byId(buildStories(words(), YEAR));
  assert.equal(s['say-most'].answer, '“lol”, 300 times');
  assert.equal(s['say-most'].share, 'I sent “lol” 300 times on Discord in 2025. A whole message, every time.');
  assert.deepEqual(s['say-most'].card.list, [['“lol”', 300], ['“ok”', 120]]);
  assert.equal(s.emoji.question, 'Which custom emoji did you use most in 2025?');
  assert.equal(s.emoji.answer, ':blobheart:, 40 times');
  assert.deepEqual(s.emoji.card, {hero: ':blobheart:', fact: 'Used 40 times.', list: [[':blobheart:', 40], [':kekw:', 12]]});
  assert.equal(s.links.answer, 'youtube.com, with 250 of your 400 links');
  assert.equal(s.links.share, 'youtube.com was my most-linked site in 2025. I shared it 250 times on Discord.');
  assert.deepEqual(s.links.card, {hero: 'youtube.com', fact: '250 of your 400 links.', list: [['youtube.com', 250], ['github.com', 90]]});
});

test('the Hall of fame: first message, longest message and longest session', () => {
  const s = byId(buildStories(words(), YEAR));
  assert.equal(s['first-message'].question, 'What was your first message in 2025?');
  assert.match(s['first-message'].answer, /^“hello there”, on /);
  assert.equal(s['first-message'].share, 'My first Discord message in 2025 was “hello there”.');
  assert.equal(s['first-message'].card.hero, '“hello there”');
  assert.equal(s['longest-message'].answer, '299 characters');
  assert.equal(s['longest-message'].share, `299 characters in one Discord message. My longest in 2025 starts “${'a '.repeat(19).trim()}…”.`);
  assert.deepEqual(s['longest-message'].card.chart, {buckets: words().lengths, top: 2}, 'the last bucket with messages holds the longest');
  assert.equal(s['longest-session'].answer, '480 messages over 3 hours');
  assert.equal(s['longest-session'].share, 'I once sent 480 Discord messages over 3 hours in 2025, without a 30-minute break.');
  assert.equal(byId(buildStories(words({bursts: {largestSessions: [[12, 25, '2025-01-01 10:00']]}}), YEAR))['longest-session'].answer, '12 messages over 25 minutes');
});

test('all time asks about your first ever message, in the present perfect', () => {
  const s = byId(buildStories(words(), ALL));
  assert.equal(s['first-message'].question, 'What was your first ever message?');
  assert.equal(s['first-message'].share, 'My first ever message on Discord was “hello there”!');
  assert.equal(s['top-word'].question, 'Which word have you used most since 2019?');
  assert.equal(s.links.question, 'Where have your links gone since 2019?');
});

test('stories without enough data are skipped', () => {
  const thin = words({
    words: ranked('word', 2), expressions: [['lol', 1]], emoji: [['kekw', 1]], domains: [['github.com', 1]],
    fame: {first: null, longest: null}, bursts: {largestSessions: [[1, 0, '2025-01-01 10:00']]},
  });
  assert.deepEqual(buildStories(thin, YEAR).map(s => s.id), ['messages', 'active-days', 'loudest', 'streak']);
  assert.deepEqual(buildStories(report(), YEAR).map(s => s.id), ['messages', 'active-days', 'loudest', 'streak'], 'an empty report has none');
});

test('a first message that opens with a link reads as the site, never as "…" (#21)', () => {
  for (const text of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=x look at this', '<https://www.youtube.com/watch?v=x>', 'www.youtube.com']) {
    const s = byId(buildStories(words({fame: {first: msg(text), longest: null}}), YEAR))['first-message'];
    assert.match(s.answer, /^A link to youtube\.com, on /, text);
    assert.equal(s.share, 'My first Discord message in 2025 was a link to youtube.com.', text);
    assert.equal(s.card.hero, 'A link to youtube.com', text);
    assert.equal(s.data.host, 'youtube.com');
  }
  const later = byId(buildStories(words({fame: {first: msg('look https://youtube.com'), longest: null}}), YEAR))['first-message'];
  assert.equal(later.share, 'My first Discord message in 2025 was “look https://youtube.com”.', 'a link after words stays in the quote');
  assert.equal(byId(buildStories(words({fame: {first: msg(''), longest: null}}), YEAR))['first-message'].share, 'My first Discord message in 2025 was an attachment.');
});
