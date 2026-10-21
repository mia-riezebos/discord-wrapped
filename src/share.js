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
async function svgImage(svg, focus, hideWord = () => false) {
  // Copy computed styles inline so CSS variables and classes survive outside the page.
  const clone = svg.cloneNode(true), from = [svg, ...svg.querySelectorAll('*')], to = [clone, ...clone.querySelectorAll('*')];
  from.forEach((el, i) => {
    const s = getComputedStyle(el);
    for (const p of ['fill', 'stroke', 'opacity', 'stroke-width', 'font-size', 'font-weight', 'font-family']) to[i].style.setProperty(p, s.getPropertyValue(p));
  });
  clone.querySelectorAll('.hit').forEach(n => n.remove());
  // A shared bump-chart word keeps full colour; every other word fades back.
  if (focus) clone.querySelectorAll('.bw').forEach(g => { if (g.dataset.word !== focus) g.style.opacity = '.15'; });
  // Ranked words are quotes, so hidden ones go from the chart too, as the same mark as in the post.
  clone.querySelectorAll('.bw').forEach(g => { if (hideWord(g.dataset.word)) g.querySelectorAll('text').forEach(t => t.textContent = HIDDEN); });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type: 'image/svg+xml'}));
  const img = new Image();
  img.src = url;
  try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return {img, w: +svg.getAttribute('width'), h: +svg.getAttribute('height')};
}
// A share context as a card model, its text still marked for redaction. The chart is rasterised here, once per set
// of hidden chart words (charts caches them for the open sheet); a chart that fails to load leaves it off the card.
async function cardModel(ctx, red, charts = new Map()) {
  const chartSvg = ctx.chart && $(ctx.chart)?.querySelector('svg');
  let chart = null;
  if (chartSvg) {
    const hide = w => isHidden(tokenize(markQuote(w))[0], red), key = [...chartSvg.querySelectorAll('.bw')].map(g => g.dataset.word).filter(hide).join('\n');
    if (!charts.has(key)) charts.set(key, svgImage(chartSvg, ctx.focus, hide).then(({img, w, h}) => ({image: img, width: w, height: h}), () => null));
    chart = await charts.get(key);
  }
  const bars = ctx.bars && !chartSvg ? {items: ctx.bars.items.map(([n, v]) => [n, v, fmt(v)]), highlight: ctx.bars.highlight} : null;
  return {hero: ctx.headline, heroAlt: ctx.alt, fact: ctx.sub, chart, bars, host: SITE_HOST};
}
const pageTheme = () => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {font: getComputedStyle(document.body).fontFamily, colors: Object.fromEntries(['surface', 'fg', 'muted', 'accent', 'soft'].map(k => [k, css('--' + k)]))};
};
// Draws a share with its redaction. Resolves with the word boxes as soon as they're drawn; blob is the PNG to come.
async function renderCard(ctx, shape, red, charts) {
  const {canvas, words} = drawCard(await cardModel(ctx, red, charts), shape, pageTheme(), m => redactCard(m, red));
  return {words, blob: new Promise(r => canvas.toBlob(r, 'image/png'))};
}

/* popover */
const pop = $('share-pop');
let current = null, anchor = null;
// 9:16 for stories on phones, 16:9 for posts elsewhere; a choice holds for the rest of the visit.
let cardShape = null;
const SHAPES = [['tall', '9:16'], ['wide', '16:9']];
function openShare(ctx, rect) {
  const red = newRedaction(), kinds = kindsIn(ctx.text, ctx.headline, ctx.sub, ...(ctx.bars?.items || []).map(([n]) => n));
  // A shared bump-chart word is a ranked word, drawn on the chart image.
  if (ctx.chart === 'bump-chart') kinds.add('quote');
  current = {ctx, red, charts: new Map(), zoomed: false, edited: false};
  const canNative = !!navigator.share, shape = cardShape || (innerWidth < 600 ? 'tall' : 'wide');
  const toggle = (kind, label) => kinds.has(kind) ? `<label class="inline"><input type="checkbox" data-hide="${kind}"${red[kind === 'name' ? 'names' : 'quotes'] ? ' checked' : ''}> ${label}</label>` : '';
  pop.innerHTML = `<div class="sp-head"><strong>Share</strong><button type="button" class="sp-close" aria-label="Close sharing">×</button></div>
    <div class="sp-preview"><div class="sp-card"><img class="sp-img" alt=""><div class="sp-hits" role="group" aria-label="Words on the card" aria-describedby="sp-hint"></div></div></div>
    <div class="sp-tools">${toggle('name', 'Hide names')}${toggle('quote', 'Hide quotes')}<button type="button" class="sp-zoom" data-act="zoom" aria-pressed="false">Zoom in</button></div>
    <p class="sp-hint" id="sp-hint">Tap a word on the card or in the post to hide it. Tap it again to show it.</p>
    <fieldset class="seg sp-shape"><legend class="sr-only">Image shape</legend>${SHAPES.map(([v, t]) => `<label><input type="radio" name="sp-shape" value="${v}"${v === shape ? ' checked' : ''}><span>${t}</span></label>`).join('')}</fieldset>
    <div class="sp-label"><span id="sp-post-label">Post text</span><button type="button" class="sp-edit" data-act="edit">Edit text</button></div>
    <p class="sp-post" role="group" aria-labelledby="sp-post-label" aria-describedby="sp-hint"></p>
    <div class="sp-platforms">${PLATFORMS.map(p => `<button type="button" data-platform="${p.id}">Share to ${p.name}</button>`).join('')}</div>
    <div class="sp-actions">${canNative ? '<button type="button" data-act="native" class="primary">Share…</button>' : ''}<button type="button" data-act="copy-image">Copy image</button><button type="button" data-act="download">Download image</button><button type="button" data-act="copy-text">Copy text and link</button></div>
    <div class="sp-step" aria-live="polite"></div>`;
  renderPost();
  showCard(shape);
  addEventListener('resize', () => current && place(), {once: true});
  pop.classList.remove('hidden');
  place(rect);
  // Focus the sheet itself, so Tab starts at its first control.
  pop.focus({preventScroll: true});
}
// The post as tappable words, hidden units as ████. Once edited by hand it's a plain text box instead.
function renderPost() {
  const box = pop.querySelector('.sp-post');
  if (!box) return;
  const us = current.postUnits = units(tokenize(current.ctx.text), current.red);
  box.innerHTML = us.map((u, i) => u.tokens[0].punct ? esc(u.text)
    : `<span class="nowrap">${esc(u.pre)}<button type="button" class="sp-word" data-unit="${i}" tabindex="-1" aria-pressed="${u.hidden}"${u.hidden ? ` aria-label="${esc(unitWords(u))}"` : ''}>${esc(u.hidden ? HIDDEN : unitWords(u))}</button>${esc(u.post)}</span>`).join(' ')
    + ` <span class="sp-cta">${esc(CTA)}</span>`;
  rove(box);
}
// One tab stop per group of words; the arrow keys move between them (see the keydown handler). After a tap, focus
// returns to the button nearest the one tapped, since hiding or showing words can change how many there are.
function rove(group) {
  const bs = [...group.querySelectorAll('button')], f = current.focus?.group === group.className && current.focus;
  if (!bs.length) return;
  const at = b => b.getBoundingClientRect(), d = r => Math.hypot(r.left - f.left, r.top - f.top);
  const b = f ? bs.reduce((a, x) => d(at(x)) < d(at(a)) ? x : a) : bs[0];
  b.tabIndex = 0;
  if (f) { b.focus({preventScroll: true}); current.focus = null; }
}
// Renders the open context at a shape; a later call wins if an earlier render is still running.
function showCard(shape) {
  const cur = current, render = renderCard(cur.ctx, shape, cur.red, cur.charts), img = pop.querySelector('.sp-img');
  Object.assign(cur, {render, card: render.then(r => r.blob), shape});
  pop.querySelector('.sp-card').classList.toggle('tall', shape === 'tall');
  render.then(async ({words, blob}) => {
    const b = await blob;
    if (!b || current !== cur || cur.render !== render) return;
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(b);
    img.alt = `Share card showing ${cardSummary()}`;
    cur.words = words;
    hits();
  });
}
const cardSummary = () => {
  const m = redactCard({hero: current.ctx.headline, heroAlt: current.ctx.alt, fact: current.ctx.sub}, current.red), line = f => f ? f.map(w => w.text).join(' ') : '';
  return [line(m.hero), line(m.fact)].filter(Boolean).join('. ');
};
// A button over every word the card drew, at least 24 px tall on screen. Brand and host can't be hidden.
function hits() {
  if (!current.words) return;
  const box = pop.querySelector('.sp-hits'), shape = current.shape, [W, H] = CARD_SHAPES[shape];
  const k = (pop.querySelector('.sp-img').clientWidth || 300) / W, minH = 24 / k;
  box.innerHTML = '';
  current.words.forEach((w, i) => {
    if (!w.ref || w.ref.tokens[0].punct) return;
    const h = Math.max(w.h, minH), b = document.createElement('button');
    b.type = 'button'; b.className = 'sp-hit'; b.dataset.word = i; b.tabIndex = -1;
    b.setAttribute('aria-pressed', !!w.hidden);
    b.setAttribute('aria-label', w.hidden ? unitWords(w.ref) : w.text);
    Object.assign(b.style, {left: (w.x - 4) / W * 100 + '%', top: (w.y - (h - w.h) / 2) / H * 100 + '%', width: (w.w + 8) / W * 100 + '%', height: h / H * 100 + '%'});
    box.append(b);
  });
  rove(box);
}
// A tap, a toggle or a reveal: redraw the card and the post, and black out new terms in an edited post.
function redact(red, focus) {
  current.red = red;
  current.focus = focus;
  if (current.edited) {
    const c = current.ctx, terms = [c.text, c.headline, c.sub, ...(c.bars?.items || []).map(([n]) => n)]
      .flatMap(t => units(tokenize(t), red).filter(u => u.hidden).map(unitWords));
    const area = pop.querySelector('.sp-text');
    area.value = blackOut(area.value, [...terms, ...red.words]);
  } else renderPost();
  showCard(current.shape);
}
const focusOf = b => { const {left, top} = b.getBoundingClientRect(); return {group: b.closest('.sp-hits, .sp-post').className, left, top}; };
pop.addEventListener('keydown', e => {
  const b = e.target.closest?.('.sp-hit, .sp-word');
  if (!b) return;
  const bs = [...b.closest('.sp-hits, .sp-post').querySelectorAll('button')], i = bs.indexOf(b);
  const j = {ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: bs.length - 1}[e.key];
  if (j === undefined) return;
  e.preventDefault();
  const next = bs[Math.max(0, Math.min(bs.length - 1, j))];
  b.tabIndex = -1; next.tabIndex = 0; next.focus();
});
pop.addEventListener('change', e => {
  if (!current) return;
  if (e.target.dataset.hide) return redact(setToggle(current.red, e.target.dataset.hide, e.target.checked));
  if (e.target.name !== 'sp-shape') return;
  cardShape = e.target.value;
  showCard(cardShape);
  place();
});
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
const postText = () => current.edited ? pop.querySelector('.sp-text').value.trim() : `${redactText(current.ctx.text, current.red)} ${CTA}`;
const stepOut = html => { pop.querySelector('.sp-step').innerHTML = html; place(); };
function copyImage() {
  // Passing the promise keeps the click's user activation for the clipboard write.
  if (!window.ClipboardItem || !navigator.clipboard?.write) return Promise.reject(new Error('no image clipboard'));
  return navigator.clipboard.write([new ClipboardItem({'image/png': current.card})]);
}
const slug = () => quoteOf(cardSummary().split('. ')[0].replaceAll(HIDDEN, ''), 40).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'card';

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
  if (b.dataset.word) return redact(tap(current.red, current.words[b.dataset.word].ref), focusOf(b));
  if (b.dataset.unit) return redact(tap(current.red, current.postUnits[b.dataset.unit]), focusOf(b));
  if (b.dataset.platform) return sharePlatform(PLATFORMS.find(p => p.id === b.dataset.platform));
  const act = b.dataset.act;
  try {
    if (act === 'copy-image') { await copyImage(); stepOut('<p>Image copied.</p>'); }
    else if (act === 'copy-text') { await navigator.clipboard.writeText(ensureLink(postText())); stepOut('<p>Text and link copied.</p>'); }
    else if (act === 'zoom') {
      current.zoomed = !current.zoomed;
      b.setAttribute('aria-pressed', current.zoomed);
      pop.querySelector('.sp-preview').classList.toggle('zoomed', current.zoomed);
      hits();
    } else if (act === 'edit') {
      // From here the post is the person's own text; later redactions still black out newly hidden terms in it.
      const area = Object.assign(document.createElement('textarea'), {className: 'sp-text', rows: 3, value: postText()});
      area.setAttribute('aria-labelledby', 'sp-post-label');
      current.edited = true;
      pop.querySelector('.sp-post').replaceWith(area);
      b.remove();
      area.focus();
    } else if (act === 'copy-reply') { await navigator.clipboard.writeText(REPLY_TEXT); b.textContent = 'Reply copied'; }
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
