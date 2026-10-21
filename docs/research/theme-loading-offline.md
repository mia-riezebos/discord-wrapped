# Theme loading, fonts and offline: what the browser allows

Research for [#16](https://github.com/mia-riezebos/discord-wrapped/issues/16), part of the Stories map ([#10](https://github.com/mia-riezebos/discord-wrapped/issues/10)). Researched 2026-10-21.

Constraints from [#11](https://github.com/mia-riezebos/discord-wrapped/issues/11#issuecomment-6305927817): the site is client-only, `build.py` inlines everything into `public/index.html`, a Cloudflare Worker serves `public/` as static assets, year themes load lazily from the same origin, the site works offline after the first visit through a service worker, and a saved copy of the page keeps working with inline code only.

## Start here: the site has two policies, not one

The ticket says the policy is the `<meta>` tag in `src/index.html`. It is, but `public/_headers` sends the same policy again as a `Content-Security-Policy` header on every static asset (confirmed with `curl -I https://discordwrapped.app/`; the header also adds `frame-ancestors 'none'`). Both are enforced. The CSP spec says a meta policy "will be enforced along with any other policies active for the protected resource", and that adding policies "can only further restrict the capabilities of the protected resource" ([CSP3 §3.3, §8.1](https://w3c.github.io/webappsec-csp/#multiple-policies)).

So every change below must be made in **both** `src/index.html` and `public/_headers`, or the stricter one wins. The header matters on its own for one more reason: a service worker gets its CSP only from the HTTP headers of its own script, never from a page's meta tag ([Service Workers §6.4](https://w3c.github.io/ServiceWorker/#content-security-policy): "If serviceWorker's script resource was delivered with a Content-Security-Policy HTTP header containing the value policy, the user agent must enforce policy for serviceWorker").

The current policy is also wider than the ticket's summary: `script-src` already allows `blob:`, `'wasm-unsafe-eval'`, `esm.run` and `cdn.jsdelivr.net` (for the WebLLM roast), `connect-src` already allows `'self'`, and `img-src` already allows `'self' data: blob:`. There is no `font-src` and no `style-src 'self'`.

How each request type maps to a directive (from [CSP3 §6.8.1 and §6.8.3](https://w3c.github.io/webappsec-csp/#effective-directive-for-a-request)):

| Request | Directive checked | Falls back to |
|---|---|---|
| `import()`, `<script src>` | `script-src-elem` | `script-src`, `default-src` |
| `<link rel=stylesheet>`, CSS module | `style-src-elem` | `style-src`, `default-src` |
| `@font-face` `url()` | `font-src` | `default-src` |
| `<img>`, SVG `<image>`, CSS `background-image` | `img-src` | `default-src` |
| `fetch()` for JSON, text, Lottie data | `connect-src` | `default-src` |
| `navigator.serviceWorker.register()` | `worker-src` | `child-src`, `script-src`, `default-src` |

## 1. Custom fonts for year themes

### What the policy allows today

Neither option works today. With no `font-src`, fonts fall back to `default-src 'none'` ([CSP3 §6.8.3](https://w3c.github.io/webappsec-csp/#directive-fallback-list)), which blocks a `data:` font inlined in the page's `<style>` just as it blocks `/fonts/x.woff2`.

| Option | CSP change (meta and header) | Works from file:// | Cached separately |
|---|---|---|---|
| Inline as a `data:` URL in CSS | `font-src data:` | Yes | No, it is re-downloaded with every HTML change |
| Load from the site | `font-src 'self'` | No | Yes, by the browser and the service worker |

`font-src data:` is low risk: a font is not script, and `img-src` already allows `data:`.

### File sizes

Measured on 2026-10-21 from the Google Fonts CSS2 API with a Chrome user agent. Each figure is the `latin` subset WOFF2 Google serves ([CSS2 API](https://developers.google.com/fonts/docs/css2)):

| Font | Axes | Latin WOFF2 |
|---|---|---|
| Bebas Neue | one weight | 8.6 KB |
| Archivo Black | one weight | 9.8 KB |
| Anton | one weight | 12.0 KB |
| Space Grotesk | weight 300–700 | 22.3 KB |
| Inter | weight 100–900 | 48.4 KB |
| Bricolage Grotesque | opsz and weight | 76.9 KB |

Subsetting further helps a lot. Asking for digits and `,.%` only (`text=0123456789,.%`, which suits "huge numbers") gave 2.4 KB for Anton and 2.1 KB for Bebas Neue. Google says `text=` "can reduce the size of the font file by up to 90%" ([Getting started](https://developers.google.com/fonts/docs/getting_started#optimizing_your_font_requests)).

**Typical cost:** 8–12 KB for one weight of a display face (Latin subset), 20–80 KB for a variable family, about 2 KB for a digits-only subset.

### Cost of inlining

Base64 turns every 3 bytes into 4 characters ([RFC 4648 §4](https://www.rfc-editor.org/rfc/rfc4648#section-4)). Anton's 12,004 bytes became 16,008 characters. On the wire that mostly disappears: the site is served with Brotli, and Brotli at default settings shrank the base64 to 12,051 bytes, about the same as the raw WOFF2 (12,039 bytes gzipped). The real costs are elsewhere:

- The HTML grows by a third of the font size after decompression, and the HTML has to be parsed before anything renders.
- The font can't be cached on its own, so every release re-downloads it inside `index.html`.
- `build.py` would have to inline it, so it ships to everyone, not only people whose data covers that year.

### Licence

Most display faces on Google Fonts use the SIL Open Font License. The OFL FAQ says webfonts served through `@font-face` are distribution, which the licence allows ([OFL FAQ 2.1](https://openfontlicense.org/ofl-faq/)). Subsetting is modification, which is allowed, "but would not normally allow the use of RFNs" (Reserved Font Names) ([2.6](https://openfontlicense.org/ofl-faq/)). In practice: if the font declares a Reserved Font Name, don't use that name as the `font-family` of a subset. The FAQ also asks that copyright and licence information be "sufficiently visible" and kept in the font's metadata ([2.4](https://openfontlicense.org/ofl-faq/)), so the subsetter must keep the `name` table and the About page should credit the font.

### Recommendation

Load year-theme fonts from the site (`font-src 'self'`). They belong to a lazily loaded theme anyway, and the file:// copy plays the default theme, which uses the system font stack (`--font` in `src/style.css`). Inline a font with `font-src data:` only if the default theme ever gets a custom face. The cost is about a third more HTML for that face on every release. Either way, keep each theme's font to one weight, Latin plus the symbols it needs, as a guide 10–25 KB, and use `font-display: swap` or a `FontFace.load()` before the story starts so text never sits invisible. Google notes that a value other than `auto` "is usually appropriate" ([Getting started](https://developers.google.com/fonts/docs/getting_started#use_font-display)).

## 2. Lazily loading theme modules and assets from the same origin

Changes needed in both the meta tag and `_headers`:

| Directive | Today | Needed | Why |
|---|---|---|---|
| `script-src` | `'unsafe-inline' 'wasm-unsafe-eval' blob: …` | add `'self'` | `import('/themes/2024/index.js')` is checked by `script-src-elem` → `script-src` ([CSP3 §6.8.1](https://w3c.github.io/webappsec-csp/#effective-directive-for-a-request)) |
| `connect-src` | has `'self'` | none | Theme JSON, SVG text or data files fetched with `fetch()` are already allowed |
| `img-src` | has `'self' data: blob:` | none | Theme images and SVG files via `<img>` or CSS are already allowed |
| `font-src` | missing (falls back to `'none'`) | add `font-src 'self'` | See section 1 |
| `style-src` | `'unsafe-inline'` | add `'self'` only if themes ship `.css` files | A `<link rel=stylesheet>` to a same-origin file is blocked without it; a theme module that injects a `<style>` element or sets `style` attributes is already allowed by `'unsafe-inline'` |
| `worker-src` | `blob:` | add `'self'` | Needed for the service worker in section 3; `worker-src` covers `ServiceWorker` registration ([CSP3 §6.2.2](https://w3c.github.io/webappsec-csp/#directive-worker-src)) |

Two details:

- **Module scripts are always fetched in CORS mode** ([HTML, fetch a single module script](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script): "mode is "cors""). Same-origin requests pass without extra headers, so this only matters for file:// (section 4).
- **`'self'` does not open the door to other origins**, and since the policy doesn't use `'strict-dynamic'`, a theme module can't load scripts from anywhere the policy doesn't list.

**Recommendation:** add `'self'` to `script-src` and `worker-src`, add `font-src 'self'`, and have themes ship CSS as strings inside their JS module and inject it as a `<style>` element. That avoids adding `style-src 'self'` and means one request per theme entry instead of two. The trade-off is that CSS inside JS can't be edited or linted as a CSS file. If that matters more, add `style-src 'self'` instead; it is equally safe for a same-origin static site.

## 3. Service worker for offline use

### Scope and registration

- A service worker's scope defaults to the folder of its script: "The scope url for the registration is set to the location of the service worker script by default" ([SW spec, Start Register](https://w3c.github.io/ServiceWorker/#start-register-algorithm)). Serve it at `/sw.js` so it covers `/`, `/advertise` and `/themes/`. A wider scope from a deeper path needs a `Service-Worker-Allowed` header ([§ Service-Worker-Allowed](https://w3c.github.io/ServiceWorker/#service-worker-allowed)), which a root script avoids.
- It must be a real same-origin `https:` file. The script URL's scheme must be `http` or `https` or registration rejects with a `TypeError` ([Start Register](https://w3c.github.io/ServiceWorker/#start-register-algorithm)), so a `blob:` service worker the way the parser worker is built today isn't possible. `build.py` has to write `public/sw.js` as a separate file. That is fine because file:// can't use a service worker anyway.
- Service workers need a secure context ([§6.1](https://w3c.github.io/ServiceWorker/#secure-context)). All three routes are HTTPS custom domains.
- `/sw.js` receives the `_headers` policy (`default-src 'none'; connect-src 'self' …`). That is enough for the worker's own `fetch()` and Cache API calls to the same origin. The worker should ignore cross-origin requests (esm.run, Hugging Face): its policy would allow them, but WebLLM keeps its own model cache and the service worker shouldn't duplicate it.
- Cloudflare sends `Cache-Control: public, max-age=0, must-revalidate` and a content-hash `ETag` on static assets by default ([Workers static assets: headers](https://developers.cloudflare.com/workers/static-assets/headers/)). That was confirmed on the live site. The browser therefore always revalidates `sw.js` and `index.html`, so no HTTP cache gets in the way of updates. Note that `_headers` rules are "not applied to responses generated by your Worker code" ([same page](https://developers.cloudflare.com/workers/static-assets/headers/)). Today only `/api/*` runs the Worker first (`run_worker_first` in `wrangler.jsonc`), so `/sw.js` and `/themes/*` get the `_headers` policy as long as that stays true.

### Versioning against releases

- The browser checks for an update on every navigation inside the scope. It treats a worker as new when the script is "byte-different" ([web.dev, lifecycle](https://web.dev/articles/service-worker-lifecycle); [SW spec, Update](https://w3c.github.io/ServiceWorker/#update-algorithm): "not byte-for-byte identical"). By default the HTTP cache is skipped for the main script (`updateViaCache: "imports"`, [SW spec](https://w3c.github.io/ServiceWorker/#dom-registrationoptions-updateviacache)). A registration counts as stale after 86,400 seconds without a check ([SW spec](https://w3c.github.io/ServiceWorker/#dfn-stale)).
- Keep the URL `/sw.js` fixed. web.dev advises against a new script URL per version ([lifecycle](https://web.dev/articles/service-worker-lifecycle#avoid_changing_the_url_of_your_service_worker_script)).
- **Recommendation:** have `build.py` hash the files in `public/`, write the hash and the precache list into `sw.js` (`const VERSION = '…'; const SHELL = ['/', '/advertise', …]`), and name the cache `dw-<hash>`. Any release then changes the bytes of `sw.js`, and `activate` deletes caches whose names don't match. The offline cookbook uses this versioned-name-and-cleanup pattern ([web.dev, offline cookbook](https://web.dev/articles/offline-cookbook#on_activate)).
- Each Cloudflare deploy is a new version that "captures the complete state of your Worker … static assets" ([Versions & deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)), so the previous release's theme files stop being served. Cloudflare's own docs show an old HTML page requesting a file the new version lacks and getting a 404 ([Version affinity](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/#static-assets)). That decides the update flow:
  - **Recommended:** don't call `skipWaiting()`. The new worker installs, precaches the new release, and waits until no tab uses the old one ([lifecycle](https://web.dev/articles/service-worker-lifecycle#waiting)). The page can watch `registration.waiting` and offer "A new version is ready. Reload." An open tab keeps the old worker and its matching cache, so a lazy `import()` of an old theme file still resolves offline or from cache.
  - **Alternative:** `skipWaiting()` plus `clients.claim()` updates at once, but web.dev warns that pages loaded under the old worker are then served by the new one ([lifecycle](https://web.dev/articles/service-worker-lifecycle#skip_the_waiting_phase)). Here that means an open tab could ask for an old theme file the new cache and the server no longer have. Only safe if theme files keep stable names across releases or old caches are kept for one release.

### Cache strategy

Following the [offline cookbook](https://web.dev/articles/offline-cookbook):

| What | Strategy | Reason |
|---|---|---|
| `/`, `/advertise`, `sw.js`'s shell list | Precache at install ("as a dependency"), serve cache first | The single HTML file is the whole app; `cache.addAll()` rejects if any file fails, so a half-cached release never installs ([cookbook](https://web.dev/articles/offline-cookbook#on_install_as_a_dependency)) |
| Theme entry files and assets `/themes/<year>/…` | Cache first, filled by idle prefetch or on first use | Versioned by the release cache name; never changes within a release |
| `/api/*` (sponsors) | Network only, don't cache | Sponsor rotation and availability must be live; offline simply shows no ad |
| Cross-origin (esm.run, Hugging Face, GitHub raw) | Don't intercept | WebLLM manages its own cache |

Stale-while-revalidate for the HTML is a reasonable alternative ([cookbook](https://web.dev/articles/offline-cookbook#stale-while-revalidate)). It gets new HTML one load sooner, but it can pair new HTML with the old worker's theme cache, so the versioned-precache approach is simpler to reason about.

### Idle prefetch

- `requestIdleCallback` ships in Chrome 47+ and Firefox 55+ but **not in stable Safari** (Safari has it only behind a flag in Technology Preview) ([browser-compat-data, `api.Window.requestIdleCallback`](https://github.com/mdn/browser-compat-data/blob/main/api/Window.json); [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback#browser_compatibility)). A fallback is needed, such as `setTimeout` a few seconds after `load`. Pass a `timeout`; MDN says one "is strongly recommended for required work, as otherwise it's possible multiple seconds will elapse before the callback is fired" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback#timeout)).
- `navigator.connection.saveData` is "true if the user has set a reduced data usage option" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData)). It exists **only in Chromium** (Chrome 65+). Firefox removed `NetworkInformation` and Safari never shipped it ([browser-compat-data, `api.NetworkInformation`](https://github.com/mdn/browser-compat-data/blob/main/api/NetworkInformation.json)). Treat it as opt-out only: skip the prefetch when `navigator.connection?.saveData === true`, otherwise prefetch.
- **Recommendation:** prefetch only the themes for years present in the loaded data, not every year, after the report has rendered. Do it from the page by sending the service worker a message, or by calling `caches.open(name).then(c => c.addAll(list))` directly. Each theme should declare its file list in its entry file so the prefetch knows what to fetch. The trade-off: "after the first visit" then means "after the first visit with your data loaded". Themes for years without data are never needed offline, so nothing is lost.

### Storage limits

From [MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria):

- Chrome: up to 60% of total disk per origin.
- Firefox: the smaller of 10% of disk or 10 GiB per site group in best-effort mode; up to 50% (capped at 8 TiB) if persisted.
- Safari 17+: about 60% of disk in the browser app, about 15% in embedded WebViews.
- Eviction under storage pressure is least-recently-used and all or nothing per origin: IndexedDB and the Cache API go together.
- **Safari deletes all script-written storage for a site after seven days of Safari use without a user interaction on it.** That includes "Service Worker registrations and cache" and IndexedDB ([WebKit blog](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/); also noted on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#does_browser-stored_data_persist)). Home Screen web apps have their own day counter. The offline promise and the saved IndexedDB report are therefore weaker on Safari for occasional visitors. That limits the product, and no code fixes it.
- `navigator.storage.persist()` (Chrome 55+, Firefox 57+, Safari 15.2+) asks the browser to exempt the origin from pressure eviction. Firefox shows a prompt; Chromium and Safari decide silently from engagement ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#how_to_tell_if_an_origin_has_persistent_storage)). `navigator.storage.estimate()` reports usage and quota (Safari 17+).

The site itself is tiny next to these limits: `index.html` is 176 KB uncompressed, and a theme at the font guide above plus motion code should stay well under 1 MB. The large items on this origin are the parsed messages in IndexedDB, which already exist. **Recommendation:** call `persist()` once the person loads a package (they have shown intent, so Chromium's engagement check is likelier to pass), wrap cache writes in `try … catch` for `QuotaExceededError` as MDN advises, and don't count on persistence on Safari.

## 4. A page saved to disk (file://)

What the specs say happens:

| Feature | On file:// | Source |
|---|---|---|
| Service worker | `register()` rejects with a `TypeError`, because the script URL's scheme is not `http` or `https` | [SW spec, Start Register](https://w3c.github.io/ServiceWorker/#start-register-algorithm) |
| Cache API | Requests with a non-HTTP(S) URL are rejected | [SW spec, Cache `put`/`add`](https://w3c.github.io/ServiceWorker/#cache-put) |
| `fetch()` of a `file:` URL | Left to the browser: "file: URLs are left as an exercise for the reader. When in doubt, return a network error." Chrome refuses | [Fetch, scheme fetch](https://fetch.spec.whatwg.org/#scheme-fetch) |
| Origin of the page | Implementation-defined, "When in doubt, return a new opaque origin" | [URL, origin](https://url.spec.whatwg.org/#concept-url-origin) |
| `import('/themes/…')` | A root-relative path resolves to `file:///themes/…`, which doesn't exist. An absolute `https://discordwrapped.app/…` import is a cross-origin CORS request from an opaque origin, so the server would need `Access-Control-Allow-Origin`, and the meta CSP's `'self'` would not match it | [HTML module fetch is CORS](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script) |
| CSP | Only the meta tag applies; the `_headers` policy is gone with the server | [CSP3 §3.3](https://w3c.github.io/webappsec-csp/#meta-element) |
| `/api/*` sponsor calls | Resolve to `file:///api/…` and fail, as they do today | — |

What already works stays working: inline scripts and styles, the `blob:` parser worker, `data:` and `blob:` images, and the share card canvas. The README already presents the downloaded `index.html` as the offline option.

**Recommendation for graceful failure:**

1. Register the service worker only when `location.protocol === 'https:'` (or `http:` for local dev) and `'serviceWorker' in navigator`, and swallow a rejection. Don't rely on `navigator.serviceWorker` being missing on file://; it is `[SecureContext]`, and browsers differ on whether file:// counts as one.
2. Decide theme availability up front: `const canLoadThemes = location.protocol.startsWith('http')`. On file://, every year plays the default theme, and the reel can say once that "Year themes play on discordwrapped.app". There are no failed requests to catch and nothing half-styled.
3. Keep the default theme and all 18 core stories inline, as #11 already decided, and make each year theme strictly additive (the "falls back to the default theme story by story" rule), so a missing theme can never break a core story.
4. Don't make the saved copy fetch themes cross-origin from the live site. It would need a CORS header on `/themes/*`, an absolute origin in `script-src` and `font-src` of the meta tag, and an online connection. That contradicts "Year themes need the site" and widens the policy for little gain.

**Uncertain, worth a quick test in Chromium over CDP before building:** what "Save Page As → Webpage, Complete" writes for this page. If it saves the live DOM, any `<style>` a year theme injected would come along, and the saved copy would show half a theme with no motion code. Making the theme loader remove its own `<style>` when a reel closes, or tagging injected nodes so the app strips them on start-up, avoids this whatever the browser does. Also untested: whether IndexedDB persists across reloads for a file:// page in each browser. Today's README implies it does, at least in the browsers that were tried.

## Policy after these changes

Meta tag (the header gets the same plus `frame-ancestors 'none'`):

```
default-src 'none';
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://esm.run https://cdn.jsdelivr.net;
worker-src 'self' blob:;
style-src 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' blob: data: https://esm.run https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com;
form-action 'none'; base-uri 'none'
```

Add `data:` to `font-src` only if a font is inlined, and `'self'` to `style-src` only if themes ship `.css` files.
