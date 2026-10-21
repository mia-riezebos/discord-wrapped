import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildStories} from '../src/stories.js';

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
