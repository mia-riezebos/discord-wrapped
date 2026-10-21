import assert from 'node:assert/strict';
import {test} from 'node:test';
import {guessLine, pickSet, scoreGuess} from '../src/guess.js';
import {markName, newRedaction, redactCard, setToggle, unmark} from '../src/redaction.js';
import {buildStories} from '../src/stories.js';
import {storyCard, summaryCard} from '../src/story-card.js';

// The page scripts share one scope; story-card.js and stories.js find these there.
Object.assign(globalThis, {markName, guessLine, pickSet});

const YEAR = {kind: 'year', label: '2025', in: 'in 2025', from: '2025-01-01', to: '2025-12-31'};
const report = {
  totals: {messages: 12345, activeDays: 200, calendarDays: 365},
  unit: 'month',
  periods: {'2025-01': {total: 1000, activeDays: 20}, '2025-02': {total: 2345, activeDays: 25}, '2025-03': {total: 9000, activeDays: 31}},
  streaks: [[41, '2025-03-01', '2025-04-10']],
  days: [],
  range: {from: '2025-01-01', to: '2025-12-31'},
  hourly: Array(24).fill(0), peakDays: [], bursts: {bestMinute: {count: 0}}, guilds: [], channels: [],
};
const stories = buildStories(report, YEAR);
const messages = stories.find(s => s.id === 'messages');
// A story whose hero is a person, the shape People stories will have.
const friend = {question: 'Who did you talk to most in 2025?', share: 'I talked to Sam most in 2025.', value: 4210,
  card: {hero: 'Sam', fact: 'Sam and Alex, 4,210 messages.', names: ['Sam', 'Alex']}};
// The card as the share popover draws it.
const drawn = (ctx, s) => redactCard({hero: ctx.headline, heroAlt: ctx.alt, fact: ctx.sub}, s);
const text = field => field.map(w => w.text).join(' ');

test("a story's card charts the report's buckets with the busiest one highlighted", () => {
  const ctx = storyCard(messages);
  assert.equal(ctx.question, messages.question);
  assert.equal(ctx.headline, '12,345');
  assert.deepEqual(ctx.columns.items.map(([, n]) => n), [1000, 2345, 9000]);
  assert.equal(ctx.columns.highlight, 2);
});

test('a locked-in guess adds its line to the card and the post; a skip adds nothing', () => {
  const locked = storyCard(messages, scoreGuess(messages.guess, messages.value, 20000));
  assert.equal(locked.guess, 'I guessed 20,000. It was 12,345.');
  assert.ok(locked.text.endsWith(' I guessed 20,000. It was 12,345.'));
  const skipped = storyCard(messages, scoreGuess(messages.guess, messages.value, null));
  assert.equal(skipped.guess, '');
  assert.equal(skipped.text, messages.share);
});

test('hiding names hides them on the card and puts the count in place of a name hero', () => {
  const ctx = storyCard(friend);
  assert.equal(unmark(ctx.text), friend.share);
  const shown = drawn(ctx, newRedaction()), hidden = drawn(ctx, setToggle(newRedaction(), 'name', true));
  assert.equal(text(shown.hero), 'Sam');
  assert.equal(text(hidden.hero), '4,210');
  assert.doesNotMatch(text(hidden.fact), /Sam|Alex/);
});

test("the summary card lists every story's answer under the period, with the score", () => {
  const ctx = summaryCard(stories, {title: '2025', ending: 'That was your 2025', score: '2 of 2 right'});
  assert.equal(ctx.headline, '2025');
  assert.deepEqual(ctx.lines, stories.map(s => s.answer));
  assert.equal(ctx.guess, '2 of 2 right');
  assert.equal(summaryCard(stories, {title: '2025', ending: ''}).guess, '');
});
