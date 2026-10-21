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
  hourly: Array(24).fill(0), peakDays: [], bursts: {bestMinute: {count: 0}}, guilds: [], channels: [],
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

/* ---------- Rhythm and People & servers ---------- */
const hourly = (night, early) => Array.from({length: 24}, (_, h) => [21, 22, 23, 0, 1, 2].includes(h) ? night : [5, 6, 7, 8, 9, 10].includes(h) ? early : 1);
const dm = (id, name, count) => ({id, name, count, group: 'DMs'});
// Twelve DM conversations, two servers, and a period split between servers and DMs.
const rich = (over = {}) => report({
  periods: {'2025-01': month(1000, {Servers: 600, DMs: 400, 'Group DMs': 0}), '2025-02': month(2000, {Servers: 1400, DMs: 550, 'Group DMs': 50})},
  hourly: hourly(100, 10),
  peakDays: [{date: '2025-08-17', count: 600, contexts: [['general', 400]], topText: ['lol', 200]}, {date: '2025-02-01', count: 300, contexts: [], topText: ['', 0]}],
  bursts: {bestMinute: {count: 32, at: '2025-02-17 17:38', channel: 'general'}},
  guilds: [{name: 'Synth club', count: 1500}, {name: 'Game night', count: 500}],
  channels: [dm('a', 'ada', 300), {id: 's', name: 'general', count: 900, group: 'Servers'}, dm('b', 'bo', 200),
    ...Array.from({length: 10}, (_, k) => dm('d' + k, 'pal' + k, 50 - k))],
  ...over,
});
const RHYTHM = ['night-owl', 'biggest-day', 'fastest-minute'], PEOPLE = ['where', 'top-server', 'top-dm', 'inner-circle'];

test('Rhythm and People & servers play after Overview, in report order', () => {
  const stories = buildStories(rich(), YEAR);
  assert.deepEqual(stories.map(s => s.id), ['messages', 'active-days', 'loudest', 'streak', ...RHYTHM, ...PEOPLE]);
  assert.deepEqual(stories.map(s => s.section).slice(4), [...RHYTHM.map(() => 'rhythm'), ...PEOPLE.map(() => 'people')]);
});

test('stories without enough data are skipped', () => {
  const ids = over => buildStories(rich(over), YEAR).map(s => s.id);
  assert.ok(!ids({hourly: hourly(0, 0)}).includes('night-owl'), 'no messages at night or in the morning');
  assert.ok(!ids({hourly: hourly(5, 5)}).includes('night-owl'), 'a tie has no answer');
  assert.ok(!ids({totals: {messages: 50, activeDays: 1, calendarDays: 365}}).includes('biggest-day'), 'one day is not a biggest day');
  assert.ok(!ids({peakDays: []}).includes('biggest-day'));
  assert.ok(!ids({bursts: {bestMinute: {count: 4, at: '2025-02-17 17:38'}}}).includes('fastest-minute'));
  assert.ok(!ids({periods: {'2025-01': month(10, {Servers: 10, DMs: 0, 'Group DMs': 0})}}).includes('where'), 'all in one place');
  assert.ok(!ids({guilds: [{name: 'Synth club', count: 1500}]}).includes('top-server'), 'one server has no ranking');
  const twoDms = ids({channels: [dm('a', 'ada', 300), dm('b', 'bo', 200)]});
  assert.ok(!twoDms.includes('top-dm') && !twoDms.includes('inner-circle'));
  const tenDms = ids({channels: rich().channels.slice(0, 11)});
  assert.ok(tenDms.includes('top-dm') && !tenDms.includes('inner-circle'), 'an inner circle needs more than ten DMs');
  assert.deepEqual(buildStories(report(), YEAR).map(s => s.section), ['overview', 'overview', 'overview', 'overview'], 'a report without them still plays Overview');
});

test('night owl or early bird is a pick-one guess between the two windows', () => {
  const s = byId(buildStories(rich(), YEAR))['night-owl'];
  assert.equal(s.question, 'Night owl or early bird in 2025?');
  assert.deepEqual(s.guess, {type: 'pick', answer: 'night', options: [
    {key: 'night', label: 'Night owl', sub: '9 pm to 3 am', count: 600},
    {key: 'early', label: 'Early bird', sub: '5 to 11 am', count: 60},
  ]});
  assert.equal(s.answer, 'Night owl, with 600 messages from 9 pm to 3 am');
  assert.equal(s.share, 'I was a night owl on Discord in 2025: 600 messages from 9 pm to 3 am, 60 from 5 to 11 am.');
  assert.equal(s.card.hero, 'Night owl');
  assert.equal(s.card.chart.buckets.length, 24);
  assert.equal(s.card.chart.top, 0, 'the busiest hour');
  const bird = byId(buildStories(rich({hourly: hourly(1, 50)}), ALL))['night-owl'];
  assert.equal(bird.guess.answer, 'early');
  assert.equal(bird.value, 300);
  assert.match(bird.share, /^I'm an early bird on Discord since 2019: /);
});

test('biggest day, with how it compares to a usual day', () => {
  const s = byId(buildStories(rich(), YEAR))['biggest-day'];
  assert.equal(s.value, 600);
  assert.match(s.answer, new RegExp(`, with 600 messages$`));
  assert.equal(s.data.times, 10, '600 messages against 12,345 over 200 days');
  assert.deepEqual(s.data.quote, ['lol', 200]);
  assert.equal(s.card.hero, '600');
  assert.match(s.card.fact, /About 10× your usual day\.$/);
  assert.deepEqual(s.card.list.map(([, n]) => n), [600, 300]);
  const plain = byId(buildStories(rich({peakDays: [{date: '2025-08-17', count: 600, contexts: [], topText: ['lol', 100]}]}), YEAR))['biggest-day'];
  assert.equal(plain.data.quote, null, 'a message is only quoted when it is over a fifth of the day');
});

test('fastest minute', () => {
  const s = byId(buildStories(rich(), YEAR))['fastest-minute'];
  assert.equal(s.question, 'What was your fastest minute in 2025?');
  assert.equal(s.value, 32);
  assert.match(s.answer, /^32 messages in one minute, on .+ at 17:38$/);
  assert.equal(s.share, 'My fastest minute on Discord in 2025: 32 messages in 60 seconds.');
  assert.equal(s.data.every, 1.9);
  assert.equal(s.card.hero, '32');
});

test('where messages went adds up to 100%', () => {
  const s = byId(buildStories(rich(), YEAR)).where;
  assert.deepEqual(s.data.groups.map(g => [g.label, g.count, g.pct]), [['Servers', 2000, 67], ['DMs', 950, 32], ['Group DMs', 50, 1]]);
  assert.equal(s.answer, '67% to servers, 32% to DMs and 1% to group DMs');
  assert.equal(s.share, 'Where my Discord messages went in 2025: 67% to servers, 32% to DMs and 1% to group DMs.');
  assert.equal(s.card.hero, '67%');
  assert.deepEqual(s.card.list, [['Servers', 2000], ['DMs', 950], ['Group DMs', 50]]);
  assert.equal(byId(buildStories(rich(), ALL)).where.question, 'Where have your messages gone since 2019?');
});

test('top server names every server on its card', () => {
  const s = byId(buildStories(rich(), YEAR))['top-server'];
  assert.equal(s.answer, `Synth club, with ${n(1500)} messages`);
  assert.equal(s.share, `My top Discord server in 2025: Synth club, with ${n(1500)} messages.`);
  assert.equal(s.data.pct, 75);
  assert.deepEqual(s.card.list, [['Synth club', 1500], ['Game night', 500]]);
  assert.deepEqual(s.card.names, ['Synth club', 'Game night']);
});

test('who you DMed most guesses between your #1 and two of #2 to #10, and keeps the name out of the post', () => {
  const stories = buildStories(rich(), YEAR), s = byId(stories)['top-dm'];
  assert.equal(s.question, 'Who did you DM most in 2025?');
  assert.equal(s.guess.type, 'pick');
  assert.equal(s.guess.answer, 'a');
  assert.equal(s.guess.options.length, 3);
  assert.ok(s.guess.options.some(o => o.key === 'a' && o.label === 'ada' && o.count === 300));
  assert.ok(s.guess.options.every(o => o.key !== 's'), 'server channels are never a choice');
  assert.deepEqual(byId(buildStories(rich(), YEAR))['top-dm'].guess, s.guess, 'a replay asks the same choices');
  assert.equal(s.answer, 'ada, with 300 messages');
  assert.equal(s.share, 'I sent 300 messages to the person I DMed most in 2025.');
  assert.doesNotMatch(s.share, /ada/);
  assert.equal(s.card.hero, 'ada');
  assert.deepEqual(s.card.names, ['ada']);
  assert.match(s.card.fact, /^300 messages, /);
});

test('inner circle is the top ten DMs\' share of all DM messages', () => {
  const s = byId(buildStories(rich(), YEAR))['inner-circle'];
  // ada 300, bo 200 and pal0 to pal7 (50 down to 43): 872 of 955.
  assert.equal(s.value, 91);
  assert.equal(s.answer, '91% of your DM messages, out of 12 conversations');
  assert.equal(s.share, '91% of my Discord DMs in 2025 went to just ten people, out of 12 conversations.');
  assert.equal(s.data.names.length, 10);
  assert.equal(s.card.hero, '91%');
  assert.equal(s.card.names, undefined, 'the card shows no names');
});
