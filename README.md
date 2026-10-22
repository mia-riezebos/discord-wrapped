# Discord Wrapped

Live at https://discordwrapped.app (also https://wrapped.mia.cx): drop in the `package.zip` from Discord (or the unzipped folder).
It works offline after the first visit and can be installed as an app. You can also download `public/index.html` and open it in a browser.
Everything is computed in the tab: a Web Worker unzips the package with the browser's own `DecompressionStream` and counts everything. The package and its messages are never uploaded; the only upload is the share image behind a share link, which you can turn off in the share sheet.
The page's Content-Security-Policy only allows network requests to the hosts that serve the optional WebLLM library and model weights.

- `src/`: `index.html`, `style.css`, `worker.js` (zip reader, parsing, aggregates, search, roast candidates), `app.js` (charts and UI), `share.js` (share popover), `card.js` (share card layout and drawing, tested in `test/card.test.mjs`), `redaction.js` (what a share hides, tested in `test/redaction.test.mjs`), `stories.js` (story facts), `player.js` (the story player) and `kinetic.js` (the default reel theme), `ads.js` and `ads-schedule.js` (sponsor rails)
- `worker/`: the Cloudflare Worker. It serves the static pages, stores share images in R2 and renders their `/s/<id>` pages, and forwards sponsor requests to the sponsor service
- `python3 build.py` inlines `src/` into the single `public/index.html`, and writes `public/sw.js` and `public/manifest.webmanifest`
- `src/sw.js` is the service worker. The build fills in the release (package version plus a hash of `public/`) and the files saved on the first visit: both pages, the manifest and `public/icons/`. It never caches `/api/`. Year themes under `public/themes/<year>/` are saved on first use, or while the browser is idle for the years in an opened package (not with data saver on). A new release waits until you choose Reload in the "New version ready" notice (`src/offline.js`)
- `python3 scripts/icons.py` draws the icons in `public/icons/`; run it by hand when the mark changes
- `pnpm check` runs the theme guard (`scripts/theme-guard.mjs`, see DESIGN.md "Year themes"), rebuilds and fails if `public/index.html` is out of date; commit the rebuilt file with your change
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
CI needs two secrets, `CLOUDFLARE_API_TOKEN` and `RELEASE_PR_TOKEN`; run `bash scripts/setup-ci.sh` to create them, and again when either expires.

## Sponsor ads

Screens at least 1480 px wide get a sponsor rail on each side of the report: a tall 160 × 600 slot with a 160 × 160
square under it. The rails sit outside the content column, never cover it, don't print, and aren't part of share
images. Monthly GitHub sponsors appear in a grid at the top of the footer. `/advertise` explains the placements and
prices to advertisers, with live next openings and a preview that never uploads anything.

Campaigns, prices and footer sponsors live in the shared sponsor service, [mia-cx/sponsors](https://github.com/mia-cx/sponsors)
at sponsors.mia.cx, managed from its `/admin` dashboard. This site's Worker forwards `/api/ads`, `/api/availability`
and `/api/footer` to it over a service binding (`SPONSORS`) with `SPONSOR_SITE=discordwrapped.app`, so the page only
ever talks to its own origin.

Rotation rules live in `src/ads-schedule.js` (tested in `test/ads.test.mjs`): each placement takes turns, each turn
puts the next ad on a random side, and a mirrored campaign (bought twice) shows on both sides at once.

For local testing, run both Workers together against the sponsor service's local data:

```sh
pnpm exec wrangler dev -c wrangler.jsonc -c ../sponsors/wrangler.jsonc --persist-to ../sponsors/.wrangler/state
```
