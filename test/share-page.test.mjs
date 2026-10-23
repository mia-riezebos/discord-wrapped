import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import worker from '../worker/index.js';

// An in-memory stand-in for the SHARES R2 binding, holding one share.
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ID = 'k3J9xQ2mPa';
function bucket(customMetadata, uploaded = new Date()) {
  const objects = new Map([[ID, {customMetadata, uploaded}]]);
  return {
    async head(key) { return objects.get(key) ?? null; },
    async get(key) { return objects.has(key) ? {...objects.get(key), body: new Blob([PNG]).stream()} : null; }};
}
const env = {SHARES: bucket({title: 'Me <"&> you', description: '58,827 messages & counting', deleteHash: 'x'})};
const call = path => worker.fetch(new Request(`https://discordwrapped.app${path}`), env);
const meta = (html, key) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];

test('the share page carries preview tags with the escaped title and description', async () => {
  const res = await call(`/s/${ID}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
  const html = await res.text();
  assert.equal(meta(html, 'og:title'), 'Me &lt;&quot;&amp;&gt; you');
  assert.equal(meta(html, 'og:description'), '58,827 messages &amp; counting');
  assert.equal(meta(html, 'og:image'), `https://discordwrapped.app/s/${ID}.png`);
  assert.equal(meta(html, 'og:url'), `https://discordwrapped.app/s/${ID}`);
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(html, 'twitter:image'), `https://discordwrapped.app/s/${ID}.png`);
  assert.match(html, /<title>Me &lt;&quot;&amp;&gt; you<\/title>/);
});

test('a person opening the share page is sent to the home page, by the only script the page allows', async () => {
  const res = await call(`/s/${ID}`);
  const html = await res.text();
  const scripts = [...html.matchAll(/<script>(.*?)<\/script>/g)].map(m => m[1]);
  assert.deepEqual(scripts, ["location.replace('/')"]);
  const hash = createHash('sha256').update(scripts[0]).digest('base64');
  assert.match(res.headers.get('content-security-policy'), new RegExp(`script-src 'sha256-${hash.replace(/[+/]/g, '\\$&')}'`));
  assert.match(html, /<a href="\/">/, 'without scripts, a link home');
});

test('the image is served with a short cache, so a deleted one stops showing soon', async () => {
  const res = await call(`/s/${ID}.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG);
});

test('a share older than 90 days goes to the home page even if the bucket still has it', async () => {
  const old = {SHARES: bucket({title: 'Old', deleteHash: 'x'}, new Date(Date.now() - 91 * 24 * 60 * 60 * 1000))};
  for (const path of [`/s/${ID}`, `/s/${ID}.png`]) {
    const res = await worker.fetch(new Request(`https://discordwrapped.app${path}`), old);
    assert.equal(res.status, 302, path);
  }
});

test('unknown, expired and malformed ids go to the home page', async () => {
  for (const path of ['/s/AAAAAAAAAA', '/s/AAAAAAAAAA.png', '/s/short', '/s/', `/s/${ID}/x`]) {
    const res = await call(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), 'https://discordwrapped.app/', path);
  }
});
