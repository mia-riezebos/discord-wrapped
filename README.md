# Discord Unwrapped

Live at https://wrapped.mia.cx: drop in the `package.zip` from Discord (or the unzipped folder).
To use it offline, download `public/index.html` and open it in a browser.
Everything is computed in the tab: a Web Worker unzips the package with the browser's own `DecompressionStream` and counts everything. Nothing is uploaded.
The page's Content-Security-Policy only allows network requests to the hosts that serve the optional WebLLM library and model weights.

- `src/`: `index.html`, `style.css`, `worker.js` (zip reader, parsing, aggregates, search, roast candidates), `app.js` (charts and UI)
- `python3 build.py` inlines `src/` into the single `public/index.html`
- `wrangler deploy` publishes `public/` as a static Cloudflare Worker on wrapped.mia.cx
- `node test/node-check.mjs path/to/package.zip path/to/analysis.json` runs the worker under Node and compares it with a reference `analysis.json` from an earlier Python analysis (not included)

The roast section works without AI: it picks messages full of rare words. The optional AI step runs a small model in the tab
with WebLLM (the engine bit-chat uses). It needs WebGPU, and the first run downloads the model, about 200 MB to 1.7 GB.

The parsed messages are saved in IndexedDB, so the report reopens after a reload or restart. "Update package" reads a newer
package.zip and adds only messages sent after the newest saved message, so messages that are missing from the new export
(for example ones you deleted since) stay in the report. "Remove data" clears the saved copy.
