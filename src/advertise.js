/* ---------- advertise page ---------- */
// Live prices, caps and next openings come from the sponsor service; the static table is the offline fallback.
const advEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const SPONSORS_PAGE = 'https://github.com/sponsors/mia-riezebos?frequency=one-time';
const LIMITS = {tall: {width: 160, height: 600, headline: 40, body: 90}, square: {width: 160, height: 160, headline: 30, body: 0}};
const weeks = days => `${days / 7} weeks`;
const openingText = iso => {
  const d = new Date(iso);
  return d <= new Date(Date.now() + 60_000) ? 'now' : d.toLocaleDateString(undefined, {day: 'numeric', month: 'long', year: 'numeric'});
};

async function loadAvailability() {
  const runs = document.getElementById('runs');
  runs.innerHTML = '<p class="muted">Checking next openings…</p>';
  try {
    const r = await fetch('/api/availability', {signal: AbortSignal.timeout(5000)});
    if (!r.ok) throw new Error();
    const data = await r.json();
    document.getElementById('price-rows').innerHTML = Object.values(data.placements).map(p =>
      `<tr><td>${advEsc(p.name)}</td><td>${p.width} × ${p.height} px</td>${p.prices.map(x => `<td class="num">$${x.dollars}</td>`).join('')}</tr>`).join('');
    for (const [key, p] of Object.entries(data.placements)) {
      const cap = document.querySelector(`[data-cap="${key}"]`);
      if (cap) cap.textContent = p.cap;
    }
    runs.innerHTML = Object.values(data.placements).flatMap(p => p.prices.map(x => `<article class="run">
      <h3>${advEsc(p.name)} · ${weeks(x.days)}</h3>
      <p class="run-price">$${x.dollars}</p>
      <p class="muted">Next opening: ${advEsc(openingText(p.nextOpening[x.days]))}${p.free ? ` · ${p.free} of ${p.cap} slots free now` : ' · full right now'}</p>
      <a class="button primary" href="${SPONSORS_PAGE}" rel="external">Pay $${x.dollars} on GitHub</a>
    </article>`)).join('');
  } catch {
    runs.innerHTML = `<p class="muted">We couldn’t load the next openings. Email <a href="mailto:sponsor@mia.cx">sponsor@mia.cx</a> for available dates.</p>`;
  }
}

/* preview: everything stays in the browser */
const form = document.getElementById('preview-form');
const slot = document.getElementById('preview-slot');
const errorBox = document.getElementById('preview-error');
let imageUrl = null;
function renderPreview() {
  const f = Object.fromEntries(new FormData(form));
  const lim = LIMITS[f.placement];
  form.querySelectorAll('.f-image').forEach(el => el.hidden = f.format !== 'image');
  form.querySelectorAll('.f-text').forEach(el => el.hidden = f.format !== 'text');
  form.querySelector('.f-body').hidden = f.format !== 'text' || !lim.body;
  form.querySelector('[data-count="headline"]').textContent = `${(f.headline || '').length}/${lim.headline} characters`;
  form.querySelector('[data-count="body"]').textContent = `${(f.body || '').length}/${lim.body} characters`;
  slot.className = `slot slot-${f.placement}`;
  slot.style.width = lim.width + 'px';
  const problems = [];
  if ((f.headline || '').length > lim.headline) problems.push(`Shorten the headline to ${lim.headline} characters or fewer.`);
  if (lim.body && (f.body || '').length > lim.body) problems.push('Shorten the body to 90 characters or fewer.');
  if (f.format === 'image') {
    slot.innerHTML = imageUrl
      ? `<img src="${imageUrl}" width="${lim.width}" height="${lim.height}" alt="Your ad" style="object-fit:cover"><span class="ad-by">Sponsored · you</span>`
      : `<div class="ad-empty" style="height:${lim.height}px"><span>Choose an image to preview your ad.</span></div>`;
  } else if (!f.name || !f.headline) {
    slot.innerHTML = `<div class="ad-empty" style="height:${lim.height}px"><span>Enter your name and headline to preview your ad.</span></div>`;
  } else {
    slot.innerHTML = `<div class="ad-text" style="height:${lim.height}px"><strong>${advEsc(f.headline)}</strong>${lim.body && f.body ? `<span>${advEsc(f.body)}</span>` : ''}<small>${advEsc(f.name)}</small></div><span class="ad-by">Sponsored</span>`;
  }
  errorBox.textContent = problems.join(' ');
}
form.addEventListener('input', renderPreview);
form.addEventListener('change', async e => {
  if (e.target.name !== 'image') return;
  const file = e.target.files[0];
  errorBox.textContent = '';
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  if (file) {
    if (!/^image\/(png|jpeg|webp|avif)$/.test(file.type)) errorBox.textContent = 'Choose a PNG, JPEG, WebP or AVIF image.';
    else if (file.size > 300 * 1024) errorBox.textContent = 'This image is over 300 KB. Choose a smaller file.';
    else imageUrl = URL.createObjectURL(file);
  }
  renderPreview();
});
form.addEventListener('reset', () => setTimeout(() => { if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null; renderPreview(); }));
renderPreview();
loadAvailability();
