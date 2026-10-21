import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sliderScale, pickSet, scoreGuess, guessText, guessLine} from '../src/guess.js';

const MESSAGES = {type: 'slider', scale: 'log', max: 365000, tolerance: 0.15, unit: 'messages'};
const DAYS = {type: 'slider', scale: 'linear', max: 365, tolerance: 0.1, unit: 'days'};
const n = x => x.toLocaleString();

test('the messages slider is a log scale from 0 to the period maximum', () => {
  const s = sliderScale(MESSAGES, 12345);
  assert.equal(s.toValue(0), 0);
  assert.equal(s.toValue(s.steps), 365000);
  assert.ok(s.toValue(s.steps / 2) < 1000, 'the middle of a log scale is far below half the maximum');
  for (const v of [1, 50, 999, 12345, 200000]) assert.ok(Math.abs(s.toValue(s.toPos(v)) - v) <= v * 0.05, `${v} is in reach`);
});

test('the days slider is linear, one day a step, up to the days in the period', () => {
  const s = sliderScale(DAYS, 200);
  assert.equal(s.steps, 365);
  assert.equal(s.toValue(123), 123);
  assert.equal(s.toPos(365), 365);
});

test('the slider never starts on the answer, or anywhere that already counts as right', () => {
  for (const [spec, answers] of [[DAYS, [0, 1, 160, 182, 183, 200, 365]], [MESSAGES, [0, 3, 550, 600, 650, 12345, 365000]]]) {
    for (const a of answers) {
      const s = sliderScale(spec, a);
      assert.notEqual(s.start, s.toPos(a), `${spec.unit} answer ${a}`);
      assert.equal(scoreGuess(spec, a, s.toValue(s.start)).right, false, `${spec.unit} answer ${a}`);
    }
  }
  assert.equal(sliderScale(DAYS, 20).start, 183, 'mid-range when that gives nothing away');
});

test('right means within 15% for messages and 10% for days, the boundary included', () => {
  assert.equal(scoreGuess(MESSAGES, 1000, 1150).right, true);
  assert.equal(scoreGuess(MESSAGES, 1000, 850).right, true);
  assert.equal(scoreGuess(MESSAGES, 1000, 1151).right, false);
  assert.equal(scoreGuess(MESSAGES, 1000, 849).right, false);
  assert.equal(scoreGuess(DAYS, 200, 220).right, true);
  assert.equal(scoreGuess(DAYS, 200, 180).right, true);
  assert.equal(scoreGuess(DAYS, 200, 221).right, false);
  assert.equal(scoreGuess(DAYS, 30, 33).right, true, 'float error does not push 10% of 30 out');
  assert.equal(scoreGuess(DAYS, 0, 0).right, true);
  assert.equal(scoreGuess(DAYS, 0, 1).right, false);
  assert.equal(scoreGuess(DAYS, 200, 150).ratio, 0.75);
});

test('verdict lines say how close the guess was, never contradicting the score', () => {
  const line = (spec, a, g) => scoreGuess(spec, a, g).line;
  assert.equal(line(DAYS, 200, 200), 'Exactly right.');
  assert.equal(line(DAYS, 200, 190), 'Spot on. Only 5% under.');
  assert.equal(line(DAYS, 200, 220), 'Spot on. Only 10% over.');
  assert.equal(line(MESSAGES, 10000, 10040), 'Spot on. Less than 1% over.');
  assert.equal(line(MESSAGES, 10000, 11504), 'Close. 16% over.', '15.04% rounds to 15 but is not right, so it reads 16');
  assert.equal(line(MESSAGES, 10000, 7000), 'Close. 30% under.');
  assert.equal(line(MESSAGES, 10000, 5500), 'Not quite. 45% under.');
  assert.equal(line(MESSAGES, 10000, 2500), 'Way off. It was 4.0× your guess.');
  assert.equal(line(MESSAGES, 10000, 31000), "Way off. That's 3.1× too high.");
  assert.equal(line(MESSAGES, 10000, 0), 'Way off.');
});

test('a skip scores nothing and leaves no line', () => {
  assert.deepEqual(scoreGuess(MESSAGES, 1000, null), {guess: null, skipped: true, right: false, ratio: null, line: ''});
  assert.equal(guessLine(MESSAGES, 1000, scoreGuess(MESSAGES, 1000, null)), '');
});

const ranked = Array.from({length: 14}, (_, k) => ({key: `w${k + 1}`, label: `word ${k + 1}`, count: 100 - k}));

test('pick-one sets are the real #1 plus two distinct picks from #2 to #10', () => {
  for (let seed = 0; seed < 200; seed++) {
    const set = pickSet(ranked, `top-word|2025|${seed}`), keys = set.map(o => o.key);
    assert.equal(set.length, 3);
    assert.ok(keys.includes('w1'));
    assert.equal(new Set(keys).size, 3);
    assert.ok(keys.every(k => +k.slice(1) <= 10), keys.join());
  }
});

test('pick-one sets are shuffled, and the same seed gives the same set in the same order', () => {
  const firsts = new Set(), sets = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const keys = pickSet(ranked, seed).map(o => o.key).join();
    assert.equal(pickSet(ranked, seed).map(o => o.key).join(), keys);
    firsts.add(keys.split(',')[0]); sets.add(keys);
  }
  assert.ok(firsts.has('w1') && firsts.size > 2, 'the answer is not always in one place');
  assert.ok(sets.size > 20);
});

test('short rankings give every choice there is', () => {
  assert.deepEqual(pickSet(ranked.slice(0, 2), 'x').map(o => o.key).sort(), ['w1', 'w2']);
  assert.deepEqual(pickSet(ranked.slice(0, 1), 'x').map(o => o.key), ['w1']);
});

test('pick-one guesses are right only on the answer', () => {
  const spec = {type: 'pick', options: ranked.slice(0, 3), answer: 'w1'};
  assert.equal(scoreGuess(spec, 'w1', 'w1').right, true);
  assert.equal(scoreGuess(spec, 'w1', 'w1').line, 'You knew it.');
  assert.equal(scoreGuess(spec, 'w1', 'w2').right, false);
  assert.equal(scoreGuess(spec, 'w1', 'w2').line, 'Not this time.');
});

test('guesses read as words, and as one plain line for a share', () => {
  assert.equal(guessText(MESSAGES, 20000), `${n(20000)} messages`);
  assert.equal(guessText(MESSAGES, 1), '1 message');
  assert.equal(guessText(DAYS, 1), '1 day');
  const pick = {type: 'pick', options: ranked.slice(0, 3), answer: 'w1'};
  assert.equal(guessText(pick, 'w2'), 'word 2');
  assert.equal(guessLine(MESSAGES, 55474, scoreGuess(MESSAGES, 55474, 20000)), `I guessed ${n(20000)}. It was ${n(55474)}.`);
  assert.equal(guessLine(pick, 'w1', scoreGuess(pick, 'w1', 'w2')), 'I guessed word 2. It was word 1.');
});
