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
// The SHARE_UPLOADS rate limiter, allowing `allowed` calls per key.
function limiter(allowed = Infinity) {
  const seen = new Map();
  return {async limit({key}) { seen.set(key, (seen.get(key) ?? 0) + 1); return {success: seen.get(key) <= allowed}; }};
}
const site = allowed => ({SHARES: bucket(), SHARE_UPLOADS: limiter(allowed), SHARE_DELETES: limiter()});
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
// Cloudflare names the visitor's address on every request it forwards.
const call = (env, path, init = {}) => worker.fetch(new Request(`https://discordwrapped.app${path}`, {duplex: 'half', ...init, headers: {'cf-connecting-ip': '192.0.2.1', ...init.headers}}), env);
const post = (env, body, query = '?title=58%2C827%20messages&description=Mine') => call(env, `/api/share${query}`, {method: 'POST', body});

test('a PNG upload is stored under a random id and returns its share link and delete key', async () => {
  const env = site();
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
  const env = site();
  const [a, b] = await Promise.all([post(env, PNG), post(env, PNG)].map(p => p.then(r => r.json())));
  assert.notEqual(a.id, b.id);
});

test('anything but a PNG is refused', async () => {
  const env = site();
  const res = await post(env, new TextEncoder().encode('<svg></svg>'));
  assert.equal(res.status, 415);
  assert.equal(env.SHARES.objects.size, 0);
});

test('a PNG over 2 MB is refused', async () => {
  const env = site();
  const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set(PNG);
  const res = await post(env, big);
  assert.equal(res.status, 413);
  assert.equal(env.SHARES.objects.size, 0);
});

test('a body without a length stops being read once it passes 2 MB', async () => {
  const env = site(), CHUNK = 256 * 1024;
  let pulled = 0;
  const body = new ReadableStream({pull(c) { if (++pulled > 64) c.close(); else c.enqueue(new Uint8Array(CHUNK)); }});
  const res = await post(env, body);
  assert.equal(res.status, 413);
  assert.ok(pulled <= 2 * 1024 * 1024 / CHUNK + 2, `read ${pulled} of 64 chunks`);
  assert.equal(env.SHARES.objects.size, 0);
});

test('long titles and descriptions are cut to size', async () => {
  const env = site();
  const {id} = await (await post(env, PNG, `?title=${'a'.repeat(500)}&description=${'b'.repeat(500)}`)).json();
  const {title, description} = env.SHARES.objects.get(id).customMetadata;
  assert.equal(title.length, 200);
  assert.equal(description.length, 300);
});

test('deleting needs the delete key from the upload', async () => {
  const env = site();
  const {id, deleteKey} = await (await post(env, PNG)).json();
  const del = key => call(env, `/api/share/${id}`, {method: 'DELETE', headers: {'x-delete-key': key}});
  assert.equal((await del('not-the-key')).status, 403);
  assert.ok(env.SHARES.objects.has(id));
  assert.equal((await del(deleteKey)).status, 204);
  assert.ok(!env.SHARES.objects.has(id));
  assert.equal((await del(deleteKey)).status, 204, 'deleting again is fine');
});

test('past the rate limit, uploads from the same address are refused and others still work', async () => {
  const env = site(1);
  const from = ip => call(env, '/api/share', {method: 'POST', body: PNG, headers: {'cf-connecting-ip': ip}});
  assert.equal((await from('192.0.2.1')).status, 201);
  assert.equal((await from('192.0.2.1')).status, 429);
  assert.equal((await from('192.0.2.2')).status, 201);
  assert.equal(env.SHARES.objects.size, 2);
});

test('IPv6 addresses in one /64 share a limit, and a request with no address is refused', async () => {
  const env = site(1);
  const from = ip => call(env, '/api/share', {method: 'POST', body: PNG, headers: {'cf-connecting-ip': ip}});
  assert.equal((await from('2001:db8:1:2::1')).status, 201);
  assert.equal((await from('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).status, 429);
  assert.equal((await from('2001:db8:1:3::1')).status, 201);
  const anonymous = await worker.fetch(new Request('https://discordwrapped.app/api/share', {method: 'POST', body: PNG}), env);
  assert.equal(anonymous.status, 429);
});

test("the Worker's own responses forbid sniffing and framing", async () => {
  const env = site();
  for (const res of [await post(env, PNG), await call(env, '/api/nothing'), await call(env, '/s/short')]) {
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  }
});

test('other share paths and methods are not found', async () => {
  const env = site();
  assert.equal((await call(env, '/api/share')).status, 404);
  assert.equal((await call(env, '/api/share/../x', {method: 'DELETE'})).status, 404);
  assert.equal((await call(env, '/api/share/short', {method: 'DELETE'})).status, 404);
  assert.equal((await call(env, '/s/k3J9xQ2mPa', {method: 'POST'})).status, 405);
});
