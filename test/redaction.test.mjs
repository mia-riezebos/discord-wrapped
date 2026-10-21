import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HIDDEN, blackOut, kindsIn, markName, markQuote, newRedaction, redactCard, redactText, setToggle, tap, tokenize, units, unmark} from '../src/redaction.js';

const fresh = newRedaction();
const names = setToggle(fresh, 'name', true);
const server = {
  text: `4,210 of my Discord messages in 2025 went to ${markName('Cozy Corner')}.`,
  model: {hero: markName('Cozy Corner'), heroAlt: '4,210 messages', fact: 'Number 2 server · 4,210 messages in 2025', host: 'discordwrapped.app',
    bars: {items: [[markName('Big Hall'), 9000], [markName('Cozy Corner'), 4210], [markName('Tiny Room'), 12]], highlight: 1}},
};
const word = {
  text: `“${markQuote('lol')}” was my number 2 word on Discord in 2025, used 900 times.`,
  model: {hero: `“${markQuote('lol')}”`, fact: 'Number 2 word · 900 times in 2025', host: 'discordwrapped.app',
    bars: {items: [[markQuote('the'), 2000], [markQuote('lol'), 900]], highlight: 1}},
};
const fame = `My first Discord message in 2025 was “${markQuote('see you at the meetup')}”.`;
// Card text as drawn: hidden units show as ████, like the post.
const cardText = (model, s) => {
  const m = redactCard(model, s), line = f => f?.map(w => w.text).join(' ');
  return {hero: line(m.hero), fact: line(m.fact), bars: m.bars?.items.map(([l]) => line(l))};
};
const unitOf = (text, s, core) => units(tokenize(text), s).find(u => u.tokens.some(t => t.core === core));

test('nothing starts hidden', () => {
  assert.equal(redactText(server.text, fresh), '4,210 of my Discord messages in 2025 went to Cozy Corner.');
  assert.deepEqual(cardText(server.model, fresh), {hero: 'Cozy Corner', fact: server.model.fact, bars: ['Big Hall', 'Cozy Corner', 'Tiny Room']});
  assert.equal(redactText(fame, fresh), unmark(fame));
  assert.deepEqual(cardText(word.model, fresh).bars, ['the', 'lol']);
});

test('Hide names covers the post, the hero and every bar label', () => {
  assert.equal(redactText(server.text, names), `4,210 of my Discord messages in 2025 went to ${HIDDEN}.`);
  assert.deepEqual(cardText(server.model, names).bars, [HIDDEN, HIDDEN, HIDDEN]);
});

test('a hidden name as the hero falls back to the count', () => {
  assert.equal(cardText(server.model, names).hero, '4,210 messages');
  const revealed = tap(names, unitOf(server.model.hero, names, 'Cozy'));
  assert.equal(cardText(server.model, revealed).hero, 'Cozy Corner');
});

test('Hide quotes covers quoted messages and ranked words, keeping the quote marks', () => {
  const q = setToggle(fresh, 'quote', true);
  assert.equal(redactText(fame, q), `My first Discord message in 2025 was “${HIDDEN}”.`);
  assert.equal(redactText(word.text, q), `“${HIDDEN}” was my number 2 word on Discord in 2025, used 900 times.`);
  assert.deepEqual(cardText(word.model, q), {hero: `“${HIDDEN}”`, fact: word.model.fact, bars: [HIDDEN, HIDDEN]});
  assert.equal(redactText(fame, fresh), unmark(fame));
});

test('neighbouring hidden words merge into one mark, so a mark never tells how many words it covers', () => {
  const q = setToggle(fresh, 'quote', true);
  assert.equal(redactText(fame, q).split(HIDDEN).length, 2);
  assert.equal(units(tokenize(fame), q).filter(u => u.hidden).length, 1);
});

test('tapping a word in the post hides it on the card too, and tapping again restores it', () => {
  const s = tap(fresh, unitOf(word.text, fresh, 'lol'));
  assert.match(redactText(word.text, s), new RegExp(`^“${HIDDEN}” was`));
  assert.deepEqual(cardText(word.model, s).bars, ['the', HIDDEN]);
  const back = tap(s, unitOf(word.text, s, 'lol'));
  assert.equal(redactText(word.text, back), unmark(word.text));
  assert.deepEqual(cardText(word.model, back).bars, ['the', 'lol']);
});

test('tapping a plain word hides it wherever it appears', () => {
  const s = tap(fresh, unitOf(word.text, fresh, '2025'));
  assert.equal(redactText(word.text, s), `“lol” was my number 2 word on Discord in ${HIDDEN}, used 900 times.`);
  assert.equal(cardText(word.model, s).fact, `Number 2 word · 900 times in ${HIDDEN}`);
});

test('tapping a word of a name on the card hides the whole name everywhere, clipped copies included', () => {
  const long = markName('Programming Server Deluxe'), clipped = markName('Programming Ser…');
  const s = tap(fresh, unitOf(long, fresh, 'Server'));
  assert.equal(redactText(`I talk in ${long}`, s), `I talk in ${HIDDEN}`);
  assert.equal(redactText(clipped, s), HIDDEN);
  assert.equal(redactText(markName('Programming Club'), s), 'Programming Club');
});

test('a name shown by a tap stays shown while Hide names is on, until the toggle is set again', () => {
  const s = tap(names, unitOf(server.text, names, 'Cozy'));
  assert.ok(s.names);
  assert.match(redactText(server.text, s), /Cozy Corner/);
  assert.deepEqual(cardText(server.model, s).bars, [HIDDEN, 'Cozy Corner', HIDDEN]);
  assert.deepEqual(cardText(server.model, setToggle(s, 'name', true)).bars, [HIDDEN, HIDDEN, HIDDEN]);
});

test('punctuation on its own never hides, and tapping it changes nothing', () => {
  const text = 'Number 2 · 900 times', s = tap(fresh, unitOf(text, fresh, '·'));
  assert.equal(s, fresh);
  assert.equal(redactText(text, setToggle(fresh, 'quote', true)), text);
});

test('kindsIn lists the toggles a share needs', () => {
  assert.deepEqual([...kindsIn(server.text, server.model.hero)], ['name']);
  assert.deepEqual([...kindsIn(fame)], ['quote']);
  assert.deepEqual([...kindsIn('12,345 messages')], []);
});

test('blackOut applies hidden terms to edited text, at word edges only', () => {
  assert.equal(blackOut('Cozy Corner rules. cozy corner forever, Cozy Cornered', ['Cozy Corner']), `${HIDDEN} rules. ${HIDDEN} forever, Cozy Cornered`);
  assert.equal(blackOut('a (b) c', ['(b)']), `a ${HIDDEN} c`);
  assert.equal(blackOut('unchanged', []), 'unchanged');
});
