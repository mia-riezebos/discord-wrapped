/* ---------- sponsor rails and footer grid ---------- */
// Rails sit outside the content column and only appear on wide screens, so they never cover the report
// and never end up in share images (those are drawn separately on a canvas).
const adEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const PLACEMENT_FALLBACK = {tall: {width: 160, height: 600, seconds: 30}, square: {width: 160, height: 160, seconds: 20}};

const adMarkup = ad => ad.kind === 'text'
  ? `<a class="ad-text" href="${adEsc(ad.href)}" target="_blank" rel="sponsored noopener noreferrer"><strong>${adEsc(ad.headline)}</strong>${ad.body ? `<span>${adEsc(ad.body)}</span>` : ''}<small>${adEsc(ad.name)}</small></a><span class="ad-by">Sponsored</span>`
  : `<a href="${adEsc(ad.href)}" target="_blank" rel="sponsored noopener noreferrer"><img src="${adEsc(ad.image.src)}" srcset="${adEsc(ad.image.src2x)} 2x" width="${ad.width}" height="${ad.height}" alt="${adEsc(ad.alt)}" loading="lazy"></a><span class="ad-by">Sponsored · ${adEsc(ad.sponsor)}</span>`;
const emptySlot = `<a class="ad-empty" href="/advertise"><strong>Display your ad here</strong><span>by sponsoring me on GitHub</span></a>`;

async function startRails() {
  let data = null;
  try {
    const r = await fetch('/api/ads', {signal: AbortSignal.timeout(5000)});
    if (r.ok) data = await r.json();
  } catch { /* Offline or opened from a file: show the invitation instead. */ }
  const placements = data?.placements ?? PLACEMENT_FALLBACK;
  for (const [placement, conf] of Object.entries(placements)) {
    const ads = (data?.ads ?? []).filter(a => a.placement === placement).map(a => ({...a, width: conf.width, height: conf.height}));
    runPlacement(placement, conf.seconds, createRotation(ads, Math.random));
  }
}
function runPlacement(placement, seconds, rotation) {
  const slots = Object.fromEntries(SIDES.map(s => [s, document.querySelector(`.rail.${s} .slot-${placement}`)]));
  if (!slots.left || !slots.right) return;
  const paint = turn => { for (const s of turn.sides) { slots[s].innerHTML = adMarkup(turn.ad); slots[s].classList.toggle('animate', !reducedMotion.matches); } };
  for (const s of SIDES) slots[s].innerHTML = emptySlot;
  rotation.initial().forEach(paint);
  const tick = () => setTimeout(() => {
    // Hold still while either side is hovered or the tab is in the background.
    if (!document.hidden && !SIDES.some(s => slots[s].matches(':hover'))) {
      rotation.next().forEach(paint);
      for (const s of SIDES) if (!rotation.showing[s]) slots[s].innerHTML = emptySlot;
    }
    tick();
  }, seconds * 1000);
  tick();
}

async function startFooterGrid() {
  const host = document.getElementById('footer-sponsors');
  if (!host) return;
  let data = null;
  try {
    const r = await fetch('/api/footer', {signal: AbortSignal.timeout(5000)});
    if (r.ok) data = await r.json();
  } catch { /* Offline: the invitation below still shows. */ }
  const levels = (data?.levels ?? []).filter(l => l.sponsors.length);
  host.innerHTML = `<h2 id="footer-sponsors-title">Sponsors</h2>${levels.map(l => `<ul class="sponsor-level level-${adEsc(l.level)}" style="--cols:${l.columns}">${l.sponsors.map(s => `<li><a href="${adEsc(s.url)}" rel="external sponsored">${s.logo ? `<img src="${adEsc(s.logo)}" alt="${adEsc(s.name)}" loading="lazy">` : adEsc(s.name)}</a></li>`).join('')}</ul>`).join('')}
    <p class="muted">${levels.length ? 'Thank you. ' : ''}<a href="https://github.com/sponsors/mia-riezebos" rel="external">Sponsor monthly on GitHub</a> to appear here.</p>`;
}

startRails();
startFooterGrid();
