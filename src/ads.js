/* ---------- sponsor rails ---------- */
// Rails sit outside the content column and only appear on wide screens, so they never cover the report
// and never end up in share images (those are drawn separately on a canvas).
const SPONSORS = 'https://github.com/sponsors/mia-riezebos';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
async function startRails() {
  let ads = [];
  try {
    const r = await fetch('/api/ads', {signal: AbortSignal.timeout(5000)});
    if (r.ok) ads = (await r.json()).ads || [];
  } catch { /* Offline or opened from a file: show the sponsor invitation instead. */ }
  const plan = schedule(ads, Math.random);
  for (const [rail, slot] of RAIL_SLOTS) runSlot(document.querySelector(`.rail.${rail} .slot-${slot}`), plan[`${rail}:${slot}`]);
}
const adMarkup = ad => `<a href="${esc(ad.href)}" target="_blank" rel="sponsored noopener noreferrer"><img src="${esc(ad.image)}" width="${ad.width}" height="${ad.height}" alt="${esc(ad.alt)}" loading="lazy"></a><span class="ad-by">Sponsor · ${esc(ad.sponsor)}</span>`;
const emptySlot = `<a class="ad-empty" href="${SPONSORS}" target="_blank" rel="noopener"><strong>Display your ad here</strong><span>by sponsoring me on GitHub</span></a>`;
function runSlot(el, list) {
  if (!el) return;
  if (!list.length) { el.innerHTML = emptySlot; return; }
  let i = 0;
  el.innerHTML = adMarkup(list[0]);
  if (list.length < 2) return;
  const tick = () => setTimeout(() => {
    // Hold still while hovered or while the tab is in the background.
    if (!document.hidden && !el.matches(':hover')) {
      i = (i + 1) % list.length;
      el.innerHTML = adMarkup(list[i]);
      el.classList.toggle('animate', !reducedMotion.matches);
    }
    tick();
  }, list[i].seconds * 1000);
  tick();
}
startRails();
