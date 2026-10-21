import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {unmark} from '../src/redaction.js';

// Share copy is page-scope code: run it with the scripts it uses, the way the page does.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^export /gm, '');
const context = {URL};
vm.runInNewContext(['../src/redaction.js', '../src/stories.js', '../src/share-copy.js'].map(read).join('\n') + '\n;this.COPY = SHARE_COPY;', context);
const copy = (key, v, p = {kind: 'year', label: '2025', in: 'in 2025'}) => {
  const c = context.COPY[key](v, p);
  return {text: unmark(c.text), headline: unmark(c.headline)};
};

test('a message that opens with a link shares as its site, never as "…" (#21)', () => {
  const link = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert.deepEqual(copy('fame.first', {text: link, date: '3 Jan 2025'}), {text: 'My first Discord message in 2025 was a link to youtube.com.', headline: 'A link to youtube.com'});
  assert.equal(copy('fame.first', {text: link}, {kind: 'all', in: 'since 2019'}).text, 'My first ever message on Discord was a link to youtube.com!');
  assert.equal(copy('fame.latest', {text: `${link} lol`}).text, 'My last Discord message in 2025 was a link to youtube.com.');
  assert.equal(copy('fame.mostRepeated', {text: link, n: '3', nRaw: 3}).text, 'A link to youtube.com was my most-sent Discord message in 2025. I sent it 3 times!');
});

test('a message with words before a link still quotes them', () => {
  assert.deepEqual(copy('fame.first', {text: 'look at this https://youtube.com/x', date: '3 Jan 2025'}), {text: 'My first Discord message in 2025 was “look at this…”.', headline: '“look at this…”'});
});

test('a quote reads as Discord shows it: mentions as @someone, custom emoji as :name:, a message of only mentions as "a mention"', () => {
  assert.equal(copy('fame.first', {text: '<@400140550503923713> hi'}).text, 'My first Discord message in 2025 was “@someone hi”.');
  assert.deepEqual(copy('fame.first', {text: '<@!400140550503923713> <@&400140550503923714>'}), {text: 'My first Discord message in 2025 was a mention.', headline: 'A mention'});
  assert.equal(copy('rank.expression', {text: 'gg <:kekw:400140550503923713> in <#400140550503923713>', n: '2', nRaw: 2, rank: '1'}).text, 'I sent “gg :kekw: in a channel” 2 times in 2025. A whole message, every time.');
});
