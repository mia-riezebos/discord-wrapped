/* Service worker: keeps the site working offline after the first visit. build.py writes the release into VERSION and
   the files to save at install into SHELL, so every release changes this file's bytes and the browser installs it. */
const VERSION = "0.4.0-1aee81640e";
const SHELL = ["/", "/advertise", "/manifest.webmanifest", "/icons/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/icon.svg"];
const CACHE = `dw-${VERSION}`;

// addAll fails if any file fails, so a release is either saved whole or not at all.
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: 'reload'}))))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dw-') && k !== CACHE).map(k => caches.delete(k))))));
// A new release waits until every tab has closed. The page only asks it to take over when someone chooses Reload.
// The page also sends the year-theme files for the years in its package ({save: [url]}) to save while it's idle. A file
// that can't be saved now (offline, storage full) is saved on first use instead.
self.addEventListener('message', e => {
  if (e.data === 'activate') self.skipWaiting();
  if (e.data?.save) e.waitUntil(caches.open(CACHE).then(c => Promise.all(e.data.save.map(async u => {
    if (!(await c.match(u))) await c.add(u).catch(err => console.warn(`Couldn't save ${u} for offline use`, err));
  }))));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // Sponsors (/api/) stay live, and cross-origin requests (the AI library and model) keep their own cache.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const path = url.pathname.replace(/(\/index)?\.html$/, '').replace(/(.)\/$/, '$1') || '/';
  // Year themes (/themes/<year>/) aren't in SHELL: they are saved on first use, or ahead of time by the theme prefetch.
  const theme = path.startsWith('/themes/');
  if (!SHELL.includes(path) && !theme) {
    if (req.mode === 'navigate') e.respondWith(fetch(req).catch(() => caches.match('/', {cacheName: CACHE})));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(theme ? req : path);
    if (hit) return hit;
    const res = await fetch(req);
    if (theme && res.ok) c.put(req, res.clone()).catch(() => { /* Storage full: it still loads from the network. */ });
    return res;
  }));
});
