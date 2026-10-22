import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const {version} = JSON.parse(read('../package.json'));

// Runs the built public/sw.js with stub worker globals and returns its constants and event handlers.
function loadWorker() {
  const handlers = {};
  const self = {addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}};
  const context = {self, URL, Request: class { constructor(url) { this.url = url; } }, location: new URL('https://discordwrapped.app/sw.js'), caches: {open: () => new Promise(() => {}), match: async () => undefined}, fetch: () => new Promise(() => {})};
  vm.runInNewContext(read('../public/sw.js') + '\n;this.out = {VERSION, SHELL, CACHE};', context);
  return {...context.out, handlers};
}
// Sends a request through the fetch handler and reports whether the worker answered it.
function intercepts(handlers, url, {method = 'GET', mode = 'cors'} = {}) {
  let answered = false;
  handlers.fetch({request: {url, method, mode}, respondWith: () => { answered = true; }});
  return answered;
}

test('the cache name carries the release version', () => {
  const {VERSION, CACHE} = loadWorker();
  assert.match(VERSION, new RegExp(`^${version.replaceAll('.', '\\.')}-[0-9a-f]{10}$`));
  assert.equal(CACHE, `dw-${VERSION}`);
});

test('the first visit saves both pages, the manifest and the icons', () => {
  const {SHELL} = loadWorker();
  assert.deepEqual([...SHELL], ['/', '/advertise', '/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/icon.svg']);
  assert.ok(SHELL.every(u => !u.startsWith('/api/')));
});

test('sponsor requests, share links and other sites always go to the network', () => {
  const {handlers} = loadWorker();
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/api/ads'), false);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/api/footer/acme/logo'), false);
  // Even a page load of /api/ never falls back to the saved site.
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/api/availability', {mode: 'navigate'}), false);
  // Share pages and their images are rendered by the Worker, and work only online.
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/s/k3J9xQ2mPa', {mode: 'navigate'}), false);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/s/k3J9xQ2mPa.png'), false);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/api/share/k3J9xQ2mPa'), false);
  assert.equal(intercepts(handlers, 'https://esm.run/@mlc-ai/web-llm'), false);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/', {method: 'POST'}), false);
});

test('pages, icons and year themes come from the cache', () => {
  const {handlers} = loadWorker();
  for (const url of ['https://discordwrapped.app/?from=home', 'https://discordwrapped.app/index.html', 'https://discordwrapped.app/advertise'])
    assert.equal(intercepts(handlers, url, {mode: 'navigate'}), true, url);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/icons/icon-192.png'), true);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/themes/2024/index.js'), true);
  assert.equal(intercepts(handlers, 'https://discordwrapped.app/robots.txt'), false);
});

test('year-theme files the page sends are saved, skipping ones already saved', async () => {
  const saved = new Map([['/themes/define.js', 'old']]), fetched = [];
  const cache = {match: async u => saved.get(u), add: async u => { fetched.push(u); saved.set(u, 'new'); }};
  const handlers = {};
  const self = {addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}};
  vm.runInNewContext(read('../public/sw.js'), {self, URL, console, location: new URL('https://discordwrapped.app/sw.js'), caches: {open: async () => cache}});
  let done;
  handlers.message({data: {save: ['/themes/define.js', '/themes/2025/index.js']}, waitUntil: p => { done = p; }});
  await done;
  assert.deepEqual(fetched, ['/themes/2025/index.js']);
  assert.equal(saved.get('/themes/define.js'), 'old');
});
