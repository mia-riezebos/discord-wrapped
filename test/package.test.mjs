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

test('reads a package whose folders and files Discord named in Dutch', async () => {
  await call('load', folder({
    'pakket/Account/gebruiker.json': {id: '1', username: 'mia', global_name: 'Mia'},
    'pakket/Servers/index.json': {'900000000000000000': 'Cozy Corner'},
    'pakket/Servers/900000000000000000/gilde.json': {id: '900000000000000000'},
    'pakket/Berichten/index.json': {'800000000000000000': 'general in Cozy Corner'},
    'pakket/Berichten/c800000000000000000/kanaal.json': {id: '800000000000000000', type: 0, name: 'general', guild: {id: '900000000000000000', name: 'Cozy Corner'}},
    'pakket/Berichten/c800000000000000000/berichten.json': [
      {ID: '1000000000000000000', Timestamp: '2022-05-01 12:00:00', Contents: 'hoi', Attachments: ''},
      {ID: '1000000000000000001', Timestamp: '2022-05-01 12:00:00', Contents: 'hallo', Attachments: ''},
    ],
  }));
  const D = await call('aggregate', {tz: 'UTC', topics: []});
  assert.equal(D.totals.messages, 2);
  assert.equal(D.validation.currentServers, 1);
  assert.deepEqual(D.user, {id: '1', username: 'Mia'});
});
