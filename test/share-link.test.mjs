import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shareLinks} from '../src/share-link.js';

const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v))}; };
// A fetch that answers uploads with the given responses in turn, recording each request.
function server(...answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({url, init});
    const a = answers[Math.min(calls.length, answers.length) - 1];
    if (a instanceof Error) throw a;
    return {ok: a.status < 300, status: a.status, json: async () => a.body};
  };
  return {fetch, calls};
}
const created = n => ({status: 201, body: {id: `id${n}`, deleteKey: `key${n}`}});
const SITE = 'https://discordwrapped.app';
const png = () => new Blob([new Uint8Array([0x89, 0x50])], {type: 'image/png'});

test('an image uploads with its title and description and resolves to its share link', async () => {
  const {fetch, calls} = server(created(1)), storage = memory();
  const url = await shareLinks({origin: SITE, fetch, storage}).link(png(), {title: '58,827 messages', description: 'Mine & yours'});
  assert.equal(url, 'https://discordwrapped.app/s/id1');
  assert.equal(calls[0].init.method, 'POST');
  const q = new URL(calls[0].url, 'https://x').searchParams;
  assert.equal(q.get('title'), '58,827 messages');
  assert.equal(q.get('description'), 'Mine & yours');
  assert.deepEqual(JSON.parse(storage.getItem('du-shares')), [{id: 'id1', deleteKey: 'key1'}]);
});

test('the same image uploads once, however often it is shared', async () => {
  const {fetch, calls} = server(created(1), created(2));
  const links = shareLinks({origin: SITE, fetch, storage: memory()}), blob = png();
  const [a, b] = await Promise.all([links.link(blob), links.link(blob)]);
  assert.equal(await links.link(blob), a);
  assert.equal(a, b);
  assert.equal(calls.length, 1);
});

test('a new image version uploads again', async () => {
  const {fetch, calls} = server(created(1), created(2));
  const links = shareLinks({origin: SITE, fetch, storage: memory()});
  assert.notEqual(await links.link(png()), await links.link(png()));
  assert.equal(calls.length, 2);
});

test('deleting sends each recorded upload its own key and forgets them', async () => {
  const {fetch, calls} = server(created(1), created(2), {status: 204}, {status: 204});
  const storage = memory(), links = shareLinks({origin: SITE, fetch, storage});
  await links.link(png()); await links.link(png());
  assert.equal(links.count(), 2);
  assert.equal(await links.deleteAll(), 0);
  assert.deepEqual(calls.slice(2).map(c => [c.url, c.init.method, c.init.headers['x-delete-key']]), [['/api/share/id1', 'DELETE', 'key1'], ['/api/share/id2', 'DELETE', 'key2']]);
  assert.equal(links.count(), 0);
});

test('uploads that could not be deleted stay recorded for another try', async () => {
  const {fetch} = server(created(1), created(2), {status: 204}, new TypeError('offline'));
  const storage = memory(), links = shareLinks({origin: SITE, fetch, storage});
  await links.link(png()); await links.link(png());
  assert.equal(await links.deleteAll(), 1);
  assert.deepEqual(JSON.parse(storage.getItem('du-shares')), [{id: 'id2', deleteKey: 'key2'}]);
});

test('a refused or failed upload resolves to null and is tried again next time', async () => {
  const {fetch, calls} = server({status: 429}, new TypeError('offline'), created(3));
  const storage = memory(), links = shareLinks({origin: SITE, fetch, storage}), blob = png();
  assert.equal(await links.link(blob), null);
  assert.equal(await links.link(blob), null);
  assert.equal(await links.link(blob), 'https://discordwrapped.app/s/id3');
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(storage.getItem('du-shares')), [{id: 'id3', deleteKey: 'key3'}]);
});
