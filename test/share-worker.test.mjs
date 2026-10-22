import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from '../worker/index.js';

// An in-memory stand-in for the SHARES R2 binding.
function bucket() {
  const objects = new Map();
  return {objects,
    async put(key, body, {httpMetadata, customMetadata}) { objects.set(key, {body, httpMetadata, customMetadata}); },
    async head(key) { return objects.get(key) ?? null; },
    async delete(key) { objects.delete(key); }};
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const call = (env, path, init) => worker.fetch(new Request(`https://discordwrapped.app${path}`, init), env);
const post = (env, body, query = '?title=58%2C827%20messages&description=Mine') => call(env, `/api/share${query}`, {method: 'POST', body});

test('a PNG upload is stored under a random id and returns its share link and delete key', async () => {
  const env = {SHARES: bucket()};
  const res = await post(env, PNG);
  assert.equal(res.status, 201);
  const {id, url, deleteKey} = await res.json();
  assert.match(id, /^[0-9A-Za-z]{10}$/);
  assert.equal(url, `https://discordwrapped.app/s/${id}`);
  const stored = env.SHARES.objects.get(id);
  assert.deepEqual(stored.body, PNG);
  assert.equal(stored.httpMetadata.contentType, 'image/png');
  assert.equal(stored.customMetadata.title, '58,827 messages');
  assert.equal(stored.customMetadata.description, 'Mine');
  assert.ok(!JSON.stringify(stored).includes(deleteKey), 'only a hash of the delete key is stored');
});

test('two uploads get different ids', async () => {
  const env = {SHARES: bucket()};
  const [a, b] = await Promise.all([post(env, PNG), post(env, PNG)].map(p => p.then(r => r.json())));
  assert.notEqual(a.id, b.id);
});

test('anything but a PNG is refused', async () => {
  const env = {SHARES: bucket()};
  const res = await post(env, new TextEncoder().encode('<svg></svg>'));
  assert.equal(res.status, 415);
  assert.equal(env.SHARES.objects.size, 0);
});

test('a PNG over 2 MB is refused', async () => {
  const env = {SHARES: bucket()};
  const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set(PNG);
  const res = await post(env, big);
  assert.equal(res.status, 413);
  assert.equal(env.SHARES.objects.size, 0);
});

test('long titles and descriptions are cut to size', async () => {
  const env = {SHARES: bucket()};
  const {id} = await (await post(env, PNG, `?title=${'a'.repeat(500)}&description=${'b'.repeat(500)}`)).json();
  const {title, description} = env.SHARES.objects.get(id).customMetadata;
  assert.equal(title.length, 200);
  assert.equal(description.length, 300);
});

test('deleting needs the delete key from the upload', async () => {
  const env = {SHARES: bucket()};
  const {id, deleteKey} = await (await post(env, PNG)).json();
  const del = key => call(env, `/api/share/${id}`, {method: 'DELETE', headers: {'x-delete-key': key}});
  assert.equal((await del('not-the-key')).status, 403);
  assert.ok(env.SHARES.objects.has(id));
  assert.equal((await del(deleteKey)).status, 204);
  assert.ok(!env.SHARES.objects.has(id));
  assert.equal((await del(deleteKey)).status, 204, 'deleting again is fine');
});

test('other share paths and methods are not found', async () => {
  const env = {SHARES: bucket()};
  assert.equal((await call(env, '/api/share')).status, 404);
  assert.equal((await call(env, '/api/share/../x', {method: 'DELETE'})).status, 404);
  assert.equal((await call(env, '/api/share/short', {method: 'DELETE'})).status, 404);
});
