# Discord Wrapped

Live at https://wrapped.mia.cx: drop in the `package.zip` from Discord (or the unzipped folder).
To use it offline, download `public/index.html` and open it in a browser.
Everything is computed in the tab: a Web Worker unzips the package with the browser's own `DecompressionStream` and counts everything. Nothing is uploaded.
The page's Content-Security-Policy only allows network requests to the hosts that serve the optional WebLLM library and model weights.

- `src/`: `index.html`, `style.css`, `worker.js` (zip reader, parsing, aggregates, search, roast candidates), `app.js` (charts and UI), `share.js` (share popover and image cards), `ads.js` and `ads-schedule.js` (sponsor rails)
- `worker/`: the Cloudflare Worker. It serves the static page and the sponsor ads API, which reads campaigns from D1
- `python3 build.py` inlines `src/` into the single `public/index.html`
- `pnpm check` rebuilds and fails if `public/index.html` is out of date; commit the rebuilt file with your change
- `node test/node-check.mjs path/to/package.zip path/to/analysis.json` runs the worker under Node and compares it with a reference `analysis.json` from an earlier Python analysis (not included)

The roast section works without AI: it picks messages full of rare words. The optional AI step runs a small model in the tab
with WebLLM (the engine bit-chat uses). It needs WebGPU, and the first run downloads the model, about 200 MB to 1.7 GB.

The parsed messages are saved in IndexedDB, so the report reopens after a reload or restart. "Update package" reads a newer
package.zip and adds only messages sent after the newest saved message, so messages that are missing from the new export
(for example ones you deleted since) stay in the report. "Remove data" clears the saved copy.

## Releasing

1. Open a pull request with your change and a changeset (`pnpm changeset`). CI checks the build and that a changeset exists.
2. After it merges, the Release workflow opens or updates a "chore(release): version discord-wrapped" pull request.
3. Merging that pull request deploys wrapped.mia.cx and publishes a GitHub release with the changelog.

To retry a failed deploy, run the Release workflow by hand with the release merge commit's SHA.
CI needs two secrets, `CLOUDFLARE_API_TOKEN` (Workers and D1) and `RELEASE_PR_TOKEN`; run `bash scripts/setup-ci.sh` to create them, and again when either expires.

## Sponsor ads

Screens at least 1480 px wide get a sponsor rail on each side of the report. The rails sit outside the content column,
never cover it, don't print, and aren't part of share images. Empty slots invite people to
[sponsor on GitHub](https://github.com/sponsors/mia-riezebos).

| Tier | Size | Where | Time per turn |
| --- | --- | --- | --- |
| `square` | 160 × 160 | one rail, under the tower | 8 s |
| `tower` | 160 × 600 | one rail | 12 s |
| `twin` | 160 × 600 | both rails | 15 s |

Each slot is a carousel: active ads take turns for their tier's time, starting at a random ad on each page load. The
carousel pauses while hovered or while the tab is in the background. Images are fetched through the Worker
(`/api/ads/:id/image`), so the page itself still only talks to its own site.

To run a campaign, add a row in the Cloudflare dashboard (Storage & Databases → D1 → discord-wrapped → Console).
It shows up between `starts_at` and `ends_at` (UTC) without a deploy:

```sql
INSERT INTO campaigns (sponsor, tier, placement, image_url, link_url, alt, starts_at, ends_at)
VALUES ('their-github-login', 'tower', 'right', 'https://example.com/ad-160x600.png', 'https://example.com',
        'What the ad says, for screen readers', '2026-11-01 00:00:00', '2026-12-01 00:00:00');
```

`placement` is `left` or `right` (ignored for `twin`). Images must be PNG, JPEG, GIF, WebP or AVIF, at most 2 MB, at the
tier's size. The schema lives in `migrations/`; releases apply new migrations before deploying.

For local testing: `pnpm exec wrangler d1 migrations apply DB --local`, insert a row with `wrangler d1 execute DB --local`,
then `pnpm exec wrangler dev`.
