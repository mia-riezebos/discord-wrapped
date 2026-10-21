/* ---------- sharing ---------- */
// Anything marked with shareAttr() can be shared: by selecting text inside it, clicking it (data-share-click),
// or a section's Share button. Each context carries first-person post text plus what goes on the image.
// Links point at whichever host is serving this page (production domains, preview deploys, local dev).
// A copy opened from disk has no host, so it falls back to the main domain.
const SITE = /^https?:$/.test(location.protocol) ? location.origin : 'https://discordwrapped.app';
const SITE_HOST = new URL(SITE).host;
// Every post ends with an invitation to the site; platforms that bury links get it as a reply instead.
const CTA = `Check yours on ${SITE_HOST}`;
const withoutCta = t => t.replace(CTA, '').trim();
const ensureLink = t => t.includes(SITE_HOST) ? t : `${t}\n\n${SITE}`;
const REPLY_TEXT = `Check yours on ${SITE}. It runs in your browser, so your messages never leave your device.`;
const enc = encodeURIComponent;
const shareCtx = new Map();
let shareSeq = 0;
function shareAttr(ctx) {
  if (!ctx) return '';
  const id = 's' + ++shareSeq;
  shareCtx.set(id, ctx);
  return `data-share="${id}"`;
}
const quoteOf = (t, n = 80) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// derank: the platform hides posts with links, so the link goes in a reply instead of the post.
const PLATFORMS = [
  {id: 'x', name: 'X', derank: true, compose: t => `https://x.com/intent/post?text=${enc(t)}`,
    reply: (post, t) => { const id = post.match(/status(?:es)?\/(\d+)/)?.[1]; return id && `https://x.com/intent/post?in_reply_to=${id}&text=${enc(t)}`; }},
  {id: 'bluesky', name: 'Bluesky', compose: t => `https://bsky.app/intent/compose?text=${enc(t)}`},
  {id: 'threads', name: 'Threads', derank: true, compose: t => `https://www.threads.com/intent/post?text=${enc(t)}`},
  {id: 'mastodon', name: 'Mastodon', compose: (t, server) => `https://${server}/share?text=${enc(t)}`, needsServer: true},
  {id: 'linkedin', name: 'LinkedIn', derank: true, compose: t => `https://www.linkedin.com/feed/?shareActive=true&text=${enc(t)}`},
  {id: 'reddit', name: 'Reddit', linkPost: true, compose: t => `https://www.reddit.com/submit?url=${enc(SITE)}&title=${enc(t)}`},
  {id: 'whatsapp', name: 'WhatsApp', compose: t => `https://wa.me/?text=${enc(t)}`},
];

/* image card */
async function svgImage(svg, focus) {
  // Copy computed styles inline so CSS variables and classes survive outside the page.
  const clone = svg.cloneNode(true), from = [svg, ...svg.querySelectorAll('*')], to = [clone, ...clone.querySelectorAll('*')];
  from.forEach((el, i) => {
    const s = getComputedStyle(el);
    for (const p of ['fill', 'stroke', 'opacity', 'stroke-width', 'font-size', 'font-weight', 'font-family']) to[i].style.setProperty(p, s.getPropertyValue(p));
  });
  clone.querySelectorAll('.hit').forEach(n => n.remove());
  // A shared bump-chart word keeps full colour; every other word fades back.
  if (focus) clone.querySelectorAll('.bw').forEach(g => { if (g.dataset.word !== focus) g.style.opacity = '.15'; });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type: 'image/svg+xml'}));
  const img = new Image();
  img.src = url;
  try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return {img, w: +svg.getAttribute('width'), h: +svg.getAttribute('height')};
}
function wrapLines(g, text, maxWidth, maxLines) {
  const words = text.split(' '), out = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (g.measureText(next).width > maxWidth && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
async function renderCard(ctx) {
  const W = 1200, H = 675, P = 64, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const font = getComputedStyle(document.body).fontFamily;
  g.fillStyle = css('--surface'); g.fillRect(0, 0, W, H);
  g.fillStyle = css('--accent'); g.fillRect(0, 0, W, 10);
  g.textBaseline = 'alphabetic';
  g.fillStyle = css('--muted'); g.font = `600 26px ${font}`;
  g.fillText('Discord Wrapped', P, 74);
  const chartSvg = ctx.chart && $(ctx.chart)?.querySelector('svg'), graphic = chartSvg || ctx.bars;
  // Headline shrinks until it fits on two lines; charts leave less room.
  let size = graphic ? 76 : 120, lines;
  do { g.font = `700 ${size}px ${font}`; lines = wrapLines(g, ctx.headline, W - 2 * P, 2); size -= 4; }
  while (lines.some(l => g.measureText(l).width > W - 2 * P) && size > 30);
  g.fillStyle = css('--fg');
  let y = 74 + size * 1.25;
  for (const l of lines) { g.fillText(l, P, y); y += size * 1.1; }
  if (ctx.sub) {
    g.font = `400 34px ${font}`; g.fillStyle = css('--muted');
    for (const l of wrapLines(g, ctx.sub, W - 2 * P, 2)) { y += 4; g.fillText(l, P, y); y += 42; }
  }
  if (chartSvg) {
    try {
      const {img, w, h} = await svgImage(chartSvg, ctx.focus), top = y + 10, boxH = H - 80 - top, boxW = W - 2 * P;
      const k = Math.min(boxW / w, boxH / h);
      if (boxH > 60) g.drawImage(img, P, top, w * k, h * k);
    } catch { /* The card still works without its chart. */ }
  }
  if (ctx.bars && !chartSvg) drawBars(g, ctx.bars, P, y + 10, W - 2 * P, H - 80 - (y + 10), font, css);
  g.font = `600 28px ${font}`; g.fillStyle = css('--accent');
  g.fillText(SITE_HOST, P, H - 36);
  g.font = `400 22px ${font}`; g.fillStyle = css('--muted'); g.textAlign = 'right';
  g.fillText('Package processed in your browser', W - P, H - 38);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

// A ranked list as horizontal bars, the shared row in the accent colour and the rest muted.
function drawBars(g, {items, highlight}, x, top, w, h, font, css) {
  if (h < 60 || !items.length) return;
  const rows = items.length, gap = 6, rh = Math.min(34, (h - gap * (rows - 1)) / rows), labelW = Math.min(360, w * .36), max = Math.max(...items.map(r => r[1]));
  g.textBaseline = 'middle';
  items.forEach(([name, v], i) => {
    const y = top + i * (rh + gap), on = i === highlight;
    g.font = `${on ? 700 : 400} ${Math.round(rh * .62)}px ${font}`; g.fillStyle = css(on ? '--fg' : '--muted'); g.textAlign = 'left';
    let label = name; while (label.length > 3 && g.measureText(label).width > labelW - 16) label = label.slice(0, -2) + '…';
    g.fillText(label, x, y + rh / 2);
    g.fillStyle = css(on ? '--accent' : '--soft');
    g.beginPath(); g.roundRect(x + labelW, y + 3, Math.max(4, (w - labelW - 120) * v / max), rh - 6, 4); g.fill();
    g.fillStyle = css(on ? '--fg' : '--muted'); g.textAlign = 'right';
    g.fillText(fmt(v), x + w, y + rh / 2);
  });
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

/* popover */
const pop = $('share-pop');
let current = null, anchor = null;
function openShare(ctx, rect) {
  current = {ctx, card: renderCard(ctx)};
  const canNative = !!navigator.share;
  pop.innerHTML = `<div class="sp-head"><strong>Share</strong><button type="button" class="sp-close" aria-label="Close sharing">×</button></div>
    <img class="sp-img" alt="Share card showing ${esc(ctx.headline)}. ${esc(ctx.sub || '')}">
    <label class="sp-label">Post text<textarea class="sp-text" rows="3">${esc(`${ctx.text} ${CTA}`)}</textarea></label>
    <div class="sp-platforms">${PLATFORMS.map(p => `<button type="button" data-platform="${p.id}">Share to ${p.name}</button>`).join('')}</div>
    <div class="sp-actions">${canNative ? '<button type="button" data-act="native" class="primary">Share…</button>' : ''}<button type="button" data-act="copy-image">Copy image</button><button type="button" data-act="download">Download image</button><button type="button" data-act="copy-text">Copy text and link</button></div>
    <div class="sp-step" aria-live="polite"></div>`;
  current.card.then(b => { if (b && current?.ctx === ctx) pop.querySelector('.sp-img').src = URL.createObjectURL(b); });
  addEventListener('resize', () => current && place(), {once: true});
  pop.classList.remove('hidden');
  place(rect);
  pop.querySelector('.sp-text').focus({preventScroll: true});
}
function place(rect = anchor) {
  anchor = rect;
  if (innerWidth < 600 || !rect) { pop.classList.add('sheet'); pop.style.left = pop.style.top = ''; return; }
  pop.classList.remove('sheet');
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8);
  const below = rect.bottom + 10, above = rect.top - h - 10;
  pop.style.left = left + 'px';
  // Prefer below the anchor, then above; either way keep the whole popover on screen as it grows.
  const top = below + h < innerHeight ? below : above >= 8 ? above : innerHeight - h - 8;
  pop.style.top = Math.max(8, top) + 'px';
}
function closeShare() { pop.classList.add('hidden'); current = null; }
const postText = () => pop.querySelector('.sp-text').value.trim();
const stepOut = html => { pop.querySelector('.sp-step').innerHTML = html; place(); };
function copyImage() {
  // Passing the promise keeps the click's user activation for the clipboard write.
  if (!window.ClipboardItem || !navigator.clipboard?.write) return Promise.reject(new Error('no image clipboard'));
  return navigator.clipboard.write([new ClipboardItem({'image/png': current.card})]);
}
const slug = () => quoteOf(current.ctx.headline, 40).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'card';

function sharePlatform(p) {
  let server = '';
  if (p.needsServer) {
    server = localStorage.getItem('du-mastodon') || prompt('Enter your Mastodon server, such as mastodon.social.', 'mastodon.social') || '';
    server = server.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!server) return;
    localStorage.setItem('du-mastodon', server);
  }
  const text = postText(), copied = p.linkPost ? Promise.resolve(false) : copyImage().then(() => true, () => false);
  // Mastodon only links addresses that start with https://.
  const post = p.derank || p.linkPost ? withoutCta(text) : p.needsServer ? ensureLink(text).replace(CTA, `Check yours on ${SITE}`) : ensureLink(text);
  window.open(p.compose(post, server), '_blank', 'noopener');
  copied.then(ok => {
    const image = p.linkPost ? '' : ok ? `<li>Paste the copied image into your post with ⌘V or Ctrl+V.</li>` : `<li>Couldn't copy the image. Choose "Download image" and attach it to your post.</li>`;
    if (!p.derank) { stepOut(image ? `<ol>${image}</ol>` : ''); return; }
    stepOut(`<ol>${image}<li>After posting, add this link in a reply:</li></ol>
      <div class="sp-reply"><input aria-label="Reply text" readonly value="${esc(REPLY_TEXT)}"><button type="button" data-act="copy-reply">Copy reply</button></div>
      ${p.reply ? `<div class="sp-reply"><input aria-label="Post link" class="sp-post" placeholder="Paste your post's link" inputmode="url"><button type="button" data-act="open-reply" data-platform-reply="${p.id}">Open reply</button></div>` : ''}`);
  });
}
pop.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('sp-close')) return closeShare();
  if (b.dataset.platform) return sharePlatform(PLATFORMS.find(p => p.id === b.dataset.platform));
  const act = b.dataset.act;
  try {
    if (act === 'copy-image') { await copyImage(); stepOut('<p>Image copied.</p>'); }
    else if (act === 'copy-text') { await navigator.clipboard.writeText(ensureLink(postText())); stepOut('<p>Text and link copied.</p>'); }
    else if (act === 'copy-reply') { await navigator.clipboard.writeText(REPLY_TEXT); b.textContent = 'Reply copied'; }
    else if (act === 'download') {
      const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(await current.card), download: `discord-wrapped-${slug()}.png`});
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (act === 'native') {
      const file = new File([await current.card], `discord-wrapped-${slug()}.png`, {type: 'image/png'});
      const data = {text: ensureLink(postText())};
      await navigator.share(navigator.canShare?.({files: [file]}) ? {...data, files: [file]} : data);
    } else if (act === 'open-reply') {
      const url = PLATFORMS.find(p => p.id === b.dataset.platformReply).reply(pop.querySelector('.sp-post').value, REPLY_TEXT);
      if (url) window.open(url, '_blank', 'noopener');
      else stepOut(pop.querySelector('.sp-step').innerHTML.replace(/<p class="error">.*?<\/p>/, '') + '<p class="error">This link doesn’t identify an X post. Paste the full link to your post and try again.</p>');
    }
  } catch (err) {
    if (err?.name !== 'AbortError') stepOut(`<p class="error">Couldn't share from this browser. Download the image and attach it to your post.</p>`);
  }
});

/* triggers */
// Shares without a chart of their own borrow the main chart of the section they came from.
const SECTION_CHART = {'s-overview': 'year-chart', 's-rhythm': 'heat-chart', 's-people': 'share-chart', 's-words': 'bump-chart', 's-search': 'search-chart'};
const withSectionChart = (ctx, el) => ctx.chart || ctx.bars ? ctx : {...ctx, chart: SECTION_CHART[el.closest('section.card')?.id]};
function contextFromSelection() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const text = sel.toString().trim();
  if (!text || text.length > 600) return null;
  const range = sel.getRangeAt(0), node = range.commonAncestorContainer, el = node.nodeType === 1 ? node : node.parentElement;
  if (!el?.closest('#report') || el.closest('#share-pop, input, textarea, select, [data-private]')) return null;
  const owner = el.closest('[data-share]');
  // Quoted messages share as a quote; interface text shares its section instead.
  const section = el.closest('section.card')?.id?.replace(/^s-/, '');
  const ctx = owner ? shareCtx.get(owner.dataset.share) : el.closest('blockquote, .msg .text') ? share('selection', {text}) : section && sectionShare(section);
  return ctx && {ctx: withSectionChart(ctx, el), rect: range.getBoundingClientRect()};
}
document.addEventListener('pointerup', e => {
  if (pop.contains(e.target)) return;
  setTimeout(() => { const s = contextFromSelection(); if (s) openShare(s.ctx, s.rect); });
});
document.addEventListener('keyup', e => {
  if (!e.shiftKey || pop.contains(e.target)) return;
  const s = contextFromSelection(); if (s) openShare(s.ctx, s.rect);
});
document.addEventListener('pointerdown', e => {
  if (!pop.classList.contains('hidden') && !pop.contains(e.target)) closeShare();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !pop.classList.contains('hidden')) closeShare();
  // Shareable chart labels act as buttons from the keyboard.
  const t = e.target.closest?.('[data-share-click]');
  if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const ctx = shareCtx.get(t.dataset.share); if (ctx) openShare(withSectionChart(ctx, t), t.getBoundingClientRect()); }
});
document.addEventListener('click', e => {
  const t = e.target.closest?.('[data-share-click]');
  if (t && !getSelection()?.toString()) { const ctx = shareCtx.get(t.dataset.share); if (ctx) openShare(withSectionChart(ctx, t), t.getBoundingClientRect()); return; }
  const b = e.target.closest?.('[data-share-section]');
  if (b) { const ctx = sectionShare(b.dataset.shareSection); if (ctx) openShare(ctx, b.getBoundingClientRect()); }
});

function sectionShare(id) {
  const T = D.totals, Y = D.periods, ks = Object.keys(Y).sort();
  const busiest = ks.reduce((a, k) => Y[k].total > Y[a].total ? k : a, ks[0]);
  const peakHour = D.hourly.indexOf(Math.max(...D.hourly));
  if (id === 'overview') return share('section.overview', {messages: T.messages, loudest: bucketName(busiest, D.unit, true)}, {chart: 'year-chart'});
  if (id === 'rhythm') return share('section.rhythm', {lateNightPct: pctOf(T.lateNight, T.messages), peakHour: String(peakHour).padStart(2, '0') + ':00'}, {chart: 'heat-chart'});
  if (id === 'people') {
    const sum = g => ks.reduce((a, k) => a + Y[k][g], 0);
    return share('section.people', {dmPct: pctOf(sum('DMs') + sum('Group DMs'), T.messages), serverPct: pctOf(sum('Servers'), T.messages)}, {chart: 'share-chart'});
  }
  if (id === 'words') return D.words[0] && share('section.words', {topWord: D.words[0][0], topWordCount: D.words[0][1]}, {chart: 'bump-chart'});
  if (id === 'fame') { const r = D.fame.mostRepeated; return r && share('fame.mostRepeated', {text: r.text, n: r.count}); }
  if (id === 'search') return lastSearchShare;
  return null;
}
let lastSearchShare = null;
