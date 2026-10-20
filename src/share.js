/* ---------- sharing ---------- */
// Anything marked with shareAttr() can be shared: by selecting text inside it, clicking it (data-share-click),
// or a section's Share button. Each context carries first-person post text plus what goes on the image.
const SITE = 'https://wrapped.mia.cx';
const REPLY_TEXT = `Make your own Discord Wrapped. It runs in your browser and nothing gets uploaded: ${SITE}`;
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
async function svgImage(svg) {
  // Copy computed styles inline so CSS variables and classes survive outside the page.
  const clone = svg.cloneNode(true), from = [svg, ...svg.querySelectorAll('*')], to = [clone, ...clone.querySelectorAll('*')];
  from.forEach((el, i) => {
    const s = getComputedStyle(el);
    for (const p of ['fill', 'stroke', 'opacity', 'stroke-width', 'font-size', 'font-weight', 'font-family']) to[i].style.setProperty(p, s.getPropertyValue(p));
  });
  clone.querySelectorAll('.hit').forEach(n => n.remove());
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
  g.fillText('DISCORD WRAPPED', P, 74);
  const chartSvg = ctx.chart && $(ctx.chart)?.querySelector('svg');
  // Headline shrinks until it fits on two lines; charts leave less room.
  let size = chartSvg ? 76 : 120, lines;
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
      const {img, w, h} = await svgImage(chartSvg), top = y + 10, boxH = H - 80 - top, boxW = W - 2 * P;
      const k = Math.min(boxW / w, boxH / h);
      if (boxH > 60) g.drawImage(img, P, top, w * k, h * k);
    } catch { /* The card still works without its chart. */ }
  }
  g.font = `600 28px ${font}`; g.fillStyle = css('--accent');
  g.fillText('wrapped.mia.cx', P, H - 36);
  g.font = `400 22px ${font}`; g.fillStyle = css('--muted'); g.textAlign = 'right';
  g.fillText('made in the browser · nothing uploaded', W - P, H - 38);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

/* popover */
const pop = $('share-pop');
let current = null, anchor = null;
function openShare(ctx, rect) {
  current = {ctx, card: renderCard(ctx)};
  const canNative = !!navigator.share;
  pop.innerHTML = `<div class="sp-head"><strong>Share</strong><button type="button" class="sp-close" aria-label="Close">×</button></div>
    <img class="sp-img" alt="The image that will be shared">
    <label class="sp-label">Post text<textarea class="sp-text" rows="3">${esc(ctx.text)}</textarea></label>
    <div class="sp-platforms">${PLATFORMS.map(p => `<button type="button" data-platform="${p.id}">${p.name}</button>`).join('')}</div>
    <div class="sp-actions">${canNative ? '<button type="button" data-act="native" class="primary">Share…</button>' : ''}<button type="button" data-act="copy-image">Copy image</button><button type="button" data-act="download">Download</button><button type="button" data-act="copy-text">Copy text</button></div>
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
    server = localStorage.getItem('du-mastodon') || prompt('Your Mastodon server (for example mastodon.social):', 'mastodon.social') || '';
    server = server.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!server) return;
    localStorage.setItem('du-mastodon', server);
  }
  const text = postText(), copied = p.linkPost ? Promise.resolve(false) : copyImage().then(() => true, () => false);
  window.open(p.compose(p.derank || p.linkPost ? text : `${text}\n\n${SITE}`, server), '_blank', 'noopener');
  copied.then(ok => {
    const image = p.linkPost ? '' : ok ? `<li>The image is on your clipboard: paste it into the post (⌘V or Ctrl+V).</li>` : `<li>Copying the image didn't work here. Use Download and attach it.</li>`;
    if (!p.derank) { stepOut(image ? `<ol>${image}</ol>` : ''); return; }
    stepOut(`<ol>${image}<li>${p.name} hides posts with links, so the link goes in a reply. After posting, reply with:</li></ol>
      <div class="sp-reply"><input readonly value="${esc(REPLY_TEXT)}"><button type="button" data-act="copy-reply">Copy</button></div>
      ${p.reply ? `<div class="sp-reply"><input class="sp-post" placeholder="Paste your post's link" inputmode="url"><button type="button" data-act="open-reply" data-platform-reply="${p.id}">Open reply</button></div>` : ''}`);
  });
}
pop.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('sp-close')) return closeShare();
  if (b.dataset.platform) return sharePlatform(PLATFORMS.find(p => p.id === b.dataset.platform));
  const act = b.dataset.act;
  try {
    if (act === 'copy-image') { await copyImage(); stepOut('<p>Image copied.</p>'); }
    else if (act === 'copy-text') { await navigator.clipboard.writeText(`${postText()}\n\n${SITE}`); stepOut('<p>Text and link copied.</p>'); }
    else if (act === 'copy-reply') { await navigator.clipboard.writeText(REPLY_TEXT); b.textContent = 'Copied'; }
    else if (act === 'download') {
      const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(await current.card), download: `discord-wrapped-${slug()}.png`});
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (act === 'native') {
      const file = new File([await current.card], `discord-wrapped-${slug()}.png`, {type: 'image/png'});
      const data = {text: postText(), url: SITE};
      await navigator.share(navigator.canShare?.({files: [file]}) ? {...data, files: [file]} : data);
    } else if (act === 'open-reply') {
      const url = PLATFORMS.find(p => p.id === b.dataset.platformReply).reply(pop.querySelector('.sp-post').value, REPLY_TEXT);
      if (url) window.open(url, '_blank', 'noopener');
      else stepOut(pop.querySelector('.sp-step').innerHTML.replace(/<p class="error">.*?<\/p>/, '') + '<p class="error">That doesn’t look like a link to a post.</p>');
    }
  } catch (err) {
    if (err?.name !== 'AbortError') stepOut(`<p class="error">${esc(err.message || 'That didn’t work in this browser.')}</p>`);
  }
});

/* triggers */
function contextFromSelection() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const text = sel.toString().trim();
  if (!text || text.length > 600) return null;
  const range = sel.getRangeAt(0), node = range.commonAncestorContainer, el = node.nodeType === 1 ? node : node.parentElement;
  if (!el?.closest('#report') || el.closest('#share-pop, input, textarea, select, [data-private]')) return null;
  const owner = el.closest('[data-share]');
  const ctx = owner ? shareCtx.get(owner.dataset.share) : {text: `“${quoteOf(text, 200)}”\n\nFrom my Discord Wrapped.`, headline: `“${quoteOf(text)}”`, sub: 'From my Discord Wrapped'};
  return ctx && {ctx, rect: range.getBoundingClientRect()};
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
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.classList.contains('hidden')) closeShare(); });
document.addEventListener('click', e => {
  const t = e.target.closest?.('[data-share-click]');
  if (t && !getSelection()?.toString()) { const ctx = shareCtx.get(t.dataset.share); if (ctx) openShare(ctx, t.getBoundingClientRect()); return; }
  const b = e.target.closest?.('[data-share-section]');
  if (b) { const ctx = sectionShare(b.dataset.shareSection); if (ctx) openShare(ctx, b.getBoundingClientRect()); }
});

function sectionShare(id) {
  const T = D.totals, Y = D.years, ys = Object.keys(Y).sort();
  const busiest = ys.reduce((a, y) => Y[y].total > Y[a].total ? y : a, ys[0]);
  const since = T.first.slice(0, 4);
  if (id === 'overview') return {text: `I've sent ${fmt(T.messages)} messages on Discord since ${since}. ${busiest} was the loudest year.`, headline: `${fmt(T.messages)} messages`, sub: `on Discord since ${since} · loudest year ${busiest}`, chart: 'year-chart'};
  if (id === 'rhythm') return {text: `${pct(T.lateNight, T.messages)} of my Discord messages are sent between midnight and 6 am.`, headline: 'When I’m on Discord', sub: `${pct(T.lateNight, T.messages)} of my messages are sent between midnight and 6 am`, chart: 'heat-chart'};
  if (id === 'people') return {text: 'Where my Discord messages went: servers, DMs and group chats, year by year.', headline: 'Servers vs DMs', sub: 'share of my Discord messages, year by year', chart: 'share-chart'};
  if (id === 'words') {
    const y = rateYears().filter(y => D.wordYears[y]?.length).at(-1), w = D.wordYears[y]?.[0];
    return {text: `My top 10 words on Discord, year by year.${w ? ` In ${y} it was “${w[0]}”.` : ''}`, headline: 'My top words, year by year', sub: w ? `${y}: “${w[0]}”` : '', chart: 'bump-chart'};
  }
  if (id === 'fame') {
    const r = D.fame.mostRepeated;
    return r && {text: `The message I've sent most on Discord is “${quoteOf(r.text, 100)}”: ${fmt(r.count)} times.`, headline: `“${quoteOf(r.text, 60)}”`, sub: `my most repeated Discord message · ${fmt(r.count)} times`};
  }
  if (id === 'search') return lastSearchShare;
  return null;
}
let lastSearchShare = null;
