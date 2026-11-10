import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

// The worker runs as a classic script; saving needs IndexedDB, which Node doesn't have.
const src = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8').replaceAll('await save();', '');
const self = {postMessage: m => { if (m.type !== 'progress') self.last = m; }};
new Function('self', src)(self);
const call = async (type, payload) => {
  await self.onmessage({data: {type, id: 1, payload}});
  if (self.last.type === 'error') throw new Error(self.last.message);
  return self.last.result;
};
const folder = entries => ({kind: 'folder', files: Object.entries(entries).map(([path, json]) => ({path, file: new Blob([JSON.stringify(json)])}))});

test('reads a package whose folders Discord named in Dutch', async () => {
  await call('load', folder({
    'pakket/Account/user.json': {id: '1', username: 'mia', global_name: 'Mia'},
    'pakket/Servers/index.json': {'900000000000000000': 'Cozy Corner'},
    'pakket/Servers/900000000000000000/guild.json': {id: '900000000000000000'},
    'pakket/Berichten/index.json': {'800000000000000000': 'general in Cozy Corner'},
    'pakket/Berichten/c800000000000000000/channel.json': {id: '800000000000000000', type: 0, name: 'general', guild: {id: '900000000000000000', name: 'Cozy Corner'}},
    'pakket/Berichten/c800000000000000000/messages.json': [
      {ID: '1000000000000000000', Timestamp: '2022-05-01 12:00:00', Contents: 'hoi', Attachments: ''},
      {ID: '1000000000000000001', Timestamp: '2022-05-01 12:00:00', Contents: 'hallo', Attachments: ''},
    ],
  }));
  const D = await call('aggregate', {tz: 'UTC', topics: []});
  assert.equal(D.totals.messages, 2);
  assert.equal(D.validation.currentServers, 1);
  assert.deepEqual(D.user, {id: '1', username: 'Mia'});
});

test('phrases count each message once, skip stop-word runs, and count a repeated message once', async () => {
  const texts = ['banana bread banana bread', 'banana bread is great', 'i love banana bread', 'i love banana bread!', 'i am so', 'i am so tired'];
  await call('load', folder({
    'package/Account/user.json': {id: '1', username: 'mia'},
    'package/Messages/c800000000000000000/channel.json': {id: '800000000000000000', type: 1, recipients: ['1', '2']},
    'package/Messages/c800000000000000000/messages.json': texts.map((Contents, i) => ({ID: String(1000000000000000000n + BigInt(i)), Timestamp: '2022-05-01 12:00:00', Contents, Attachments: ''})),
  }));
  await call('aggregate', {tz: 'UTC', topics: []});
  assert.deepEqual(await call('phrases', {size: 2}), [['banana bread', 3]]);
});
