/* ---------- sharing ---------- */
// Anything marked with shareAttr() can be shared: by selecting text inside it, clicking it (data-share-click),
// or a section's Share button. Each context carries first-person post text plus what goes on the image.
// Links point at whichever host is serving this page (production domains, preview deploys, local dev).
// A copy opened from disk has no host, so it falls back to the main domain.
const SITE = /^https?:$/.test(location.protocol) ? location.origin : 'https://discordwrapped.app';
const SITE_HOST = new URL(SITE).host;
// Every post ends with an invitation to the site, as a full link so platforms link it and show its preview. With a
// share link (share-link.js) that link is the image's own page, which platforms unfurl into the image.
const CTA = `Check yours on ${SITE_HOST}`;
const withoutCta = t => t.replace(CTA, '').trim();
const withLink = (t, link = SITE) => (t.includes(CTA) || link === SITE && t.includes(SITE_HOST) ? t : `${t}\n\n${link}`).replace(CTA, `Check yours on ${link}`);
const shared = shareLinks({origin: SITE});
// Whether sharing to a platform or copying the link uploads the image for its preview: on unless turned off.
const UPLOAD_KEY = 'du-share-upload';
const uploadOn = () => localStorage.getItem(UPLOAD_KEY) !== 'off';
// "Delete shared images" in the Your data menu, shown once this browser has uploaded any.
const deleteShares = $('delete-shares');
$('data-menu').addEventListener('toggle', () => { deleteShares.hidden = !shared.count(); });
deleteShares.addEventListener('click', async () => {
  const n = shared.count();
  if (!confirm(`Delete the ${n === 1 ? 'image' : `${n} images`} you shared from this browser? Links to ${n === 1 ? 'it' : 'them'} will open the home page instead.`)) return;
  const left = await shared.deleteAll();
  if (left) alert(`Couldn't delete ${left === 1 ? 'one image' : `${left} images`}. Check your connection and try again.`);
});
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

// brand: the tile behind the white mark, each at least 3:1 against it (WhatsApp uses its darker teal for that).
const PLATFORMS = [
  {id: 'x', name: 'X', brand: '#000', compose: t => `https://x.com/intent/post?text=${enc(t)}`},
  {id: 'bluesky', name: 'Bluesky', brand: '#1185fe', compose: t => `https://bsky.app/intent/compose?text=${enc(t)}`},
  {id: 'threads', name: 'Threads', brand: '#000', compose: t => `https://www.threads.com/intent/post?text=${enc(t)}`},
  {id: 'mastodon', name: 'Mastodon', brand: '#6364ff', compose: (t, server) => `https://${server}/share?text=${enc(t)}`, needsServer: true},
  {id: 'linkedin', name: 'LinkedIn', brand: '#0a66c2', compose: t => `https://www.linkedin.com/feed/?shareActive=true&text=${enc(t)}`},
  {id: 'reddit', name: 'Reddit', brand: '#ff4500', linkPost: true, compose: (t, server, link) => `https://www.reddit.com/submit?url=${enc(link)}&title=${enc(t)}`},
  {id: 'whatsapp', name: 'WhatsApp', brand: '#128c7e', compose: t => `https://wa.me/?text=${enc(t)}`},
];
// Brand marks on a 24-unit grid: Simple Icons (CC0), and LinkedIn's "in" drawn here since Simple Icons dropped it.
const ICONS = {
  x: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  bluesky: 'M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026',
  threads: 'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z',
  mastodon: 'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z',
  linkedin: 'M2.5 4a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 1 0-4.5 0M2.7 8.4h3.9V22H2.7zm6.4 0h3.7v1.9c.6-1 1.9-2.2 4.1-2.2 4.2 0 5 2.8 5 6.3V22H18v-6.8c0-1.6 0-3.7-2.3-3.7s-2.6 1.8-2.6 3.6V22H9.1z',
  reddit: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z',
  whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
};
// The system share glyph: a tray with an arrow out of it.
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m-4 4 4-4 4 4M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2"/></svg>';

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
  return {question: ctx.question, hero: ctx.headline, heroAlt: ctx.alt, fact: ctx.sub, lines: ctx.lines, chart, columns: ctx.columns, bars, guess: ctx.guess, host: SITE_HOST};
}
// Every marked text a share puts on its card or in its post, for the redaction toggles and an edited post. A story's
// frame shows its names too.
const ctxTexts = c => [c.text, c.question, c.headline, c.sub, c.guess, ...(c.lines || []), ...[c.bars, c.columns].flatMap(g => g?.items.map(([n]) => n) || []),
  ...c.snapshot ? c.names.map(markName) : []];
// The card takes the page's colours, so a themed year's cards come in its colours and display face (--display).
const pageTheme = () => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {font: getComputedStyle(document.body).fontFamily, display: css('--display'), colors: Object.fromEntries(['surface', 'fg', 'muted', 'accent', 'soft'].map(k => [k, css('--' + k)]))};
};
// Draws a share with its redaction. Resolves with the word boxes as soon as they're drawn and the image size; blob is
// the PNG to come. A story from the player is its own frame instead of a drawn card.
async function renderCard(ctx, shape, red, charts) {
  if (ctx.snapshot) return frameCard(ctx, red);
  const {canvas, words} = drawCard(await cardModel(ctx, red, charts), shape, pageTheme(), m => redactCard(m, red));
  return {words, size: CARD_SHAPES[shape], blob: new Promise(r => canvas.toBlob(r, 'image/png'))};
}

/* story frame images */
const FRAME_WIDTH = 1080;
const dataUrl = blob => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });
// The page's CSS as it applies right now, for an SVG image, which loads nothing: media rules resolved here, fonts
// inlined. Fetched fonts are kept for the visit.
const fontData = new Map();
async function pageCss() {
  const out = [];
  const add = async rules => {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) { if (matchMedia(r.conditionText).matches) await add(r.cssRules); continue; }
      const url = r instanceof CSSFontFaceRule && r.style.getPropertyValue('src').match(/url\("?([^")]+)"?\)/)?.[1];
      if (!url || url.startsWith('data:')) { out.push(r.cssText); continue; }
      if (!fontData.has(url)) fontData.set(url, fetch(url).then(res => res.blob()).then(dataUrl).catch(() => null));
      const data = await fontData.get(url);
      if (data) out.push(r.cssText.replace(url, data));
    }
  };
  for (const s of [...document.styleSheets, ...document.adoptedStyleSheets]) await add(s.cssRules);
  return out.join('\n') + '\n* { animation: none !important; transition: none !important; }';
}
// The story's frame (ctx.snapshot()) as the share image: every text redacted in place, a box per word for taps,
// the site at the foot, then the whole frame rasterised through an SVG foreignObject at FRAME_WIDTH.
async function frameCard(ctx, red) {
  const node = ctx.snapshot(), css = await pageCss();
  try {
    const host = Object.assign(document.createElement('p'), {className: 'reel-host', textContent: SITE_HOST});
    node.append(host);
    // A word that drops in letter by letter reads as one text, so it can be hidden whole.
    node.querySelectorAll('[aria-label]').forEach(n => {
      if (n.children.length && [...n.children].every(c => c.getAttribute('aria-hidden') && c.textContent.length < 3)) n.textContent = n.getAttribute('aria-label');
    });
    const box = node.getBoundingClientRect(), k = FRAME_WIDTH / box.width, words = [], texts = [];
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) texts.push(walk.currentNode);
    for (const t of texts) {
      // Rolled numbers are digit strips; the site can't be hidden.
      if (!t.nodeValue.trim() || host.contains(t) || t.parentElement.closest('[role="img"]')) continue;
      const lead = t.nodeValue.match(/^\s*/)[0], trail = t.nodeValue.match(/\s*$/)[0];
      const us = units(tokenize(markNames(t.nodeValue.trim(), ctx.names)), red);
      t.nodeValue = lead + us.map(u => u.text).join(' ') + trail;
      let at = lead.length;
      for (const u of us) {
        const r = document.createRange();
        r.setStart(t, at); r.setEnd(t, at + u.text.length);
        const b = r.getBoundingClientRect();
        if (!u.tokens[0].punct) words.push({ref: u, hidden: u.hidden, text: u.text, x: (b.left - box.left) * k, y: (b.top - box.top) * k, w: b.width * k, h: b.height * k});
        at += u.text.length + 1;
      }
    }
    // An SVG image has no page root, so the copy sits in a body that carries the root's custom properties.
    const copy = node.cloneNode(true), s = getComputedStyle(node), body = document.createElement('body');
    for (const v of new Set(css.match(/--[\w-]+(?=\s*:)/g))) body.style.setProperty(v, s.getPropertyValue(v));
    body.style.margin = '0';
    Object.assign(copy.style, {position: 'relative', left: '0'});
    body.append(copy);
    const [W, H] = [box.width, box.height], size = [FRAME_WIDTH, Math.round(H * k)];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}" viewBox="0 0 ${W} ${H}"><style><![CDATA[${css}]]></style><foreignObject width="${W}" height="${H}">${new XMLSerializer().serializeToString(body)}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const blob = img.decode().then(() => {
      const c = Object.assign(document.createElement('canvas'), {width: size[0], height: size[1]});
      c.getContext('2d').drawImage(img, 0, 0, ...size);
      return new Promise(r => c.toBlob(r, 'image/png'));
    });
    return {words, size, blob};
  } finally { node.remove(); }
}

/* popover */
const pop = $('share-pop');
let current = null, anchor = null;
// 9:16 for stories on phones, 16:9 for posts elsewhere; a choice holds for the rest of the visit.
let cardShape = null;
const SHAPES = [['tall', '9:16'], ['wide', '16:9']];
function openShare(ctx, rect) {
  const red = newRedaction(), kinds = kindsIn(...ctxTexts(ctx));
  // A shared bump-chart word is a ranked word, drawn on the chart image.
  if (ctx.chart === 'bump-chart') kinds.add('quote');
  current = {ctx, red, charts: new Map(), zoomed: false, edited: false};
  const canNative = !!navigator.share, shape = cardShape || (innerWidth < 600 ? 'tall' : 'wide');
  const toggle = (kind, label) => kinds.has(kind) ? `<label class="inline"><input type="checkbox" data-hide="${kind}"${red[kind === 'name' ? 'names' : 'quotes'] ? ' checked' : ''}> ${label}</label>` : '';
  pop.innerHTML = `<div class="sp-head"><strong>Share</strong><button type="button" class="sp-close" aria-label="Close sharing">×</button></div>
    <div class="sp-preview"><div class="sp-card"><img class="sp-img" alt=""><div class="sp-hits" role="group" aria-label="Words on the card" aria-describedby="sp-hint"></div></div></div>
    <div class="sp-tools">${toggle('name', 'Hide names')}${toggle('quote', 'Hide quotes')}<button type="button" class="sp-zoom" data-act="zoom" aria-pressed="false">Zoom in</button></div>
    <p class="sp-hint" id="sp-hint">Tap a word on the card or in the post to hide it. Tap it again to show it.</p>
    ${ctx.snapshot ? '' : `<fieldset class="seg sp-shape"><legend class="sr-only">Image shape</legend>${SHAPES.map(([v, t]) => `<label><input type="radio" name="sp-shape" value="${v}"${v === shape ? ' checked' : ''}><span>${t}</span></label>`).join('')}</fieldset>`}
    <div class="sp-label"><span id="sp-post-label">Post text</span><button type="button" class="sp-edit" data-act="edit">Edit text</button></div>
    <p class="sp-post" role="group" aria-labelledby="sp-post-label" aria-describedby="sp-hint"></p>
    ${canNative ? `<div class="sp-native"><button type="button" data-act="native" class="primary" aria-disabled="true">${SHARE_ICON}Share…</button></div>` : ''}
    <label class="inline sp-upload"><input type="checkbox" data-upload${uploadOn() ? ' checked' : ''}> Upload the image for link previews</label>
    <div class="sp-platforms">${PLATFORMS.map(p => `<button type="button" data-platform="${p.id}"><span class="sp-icon" style="background:${p.brand}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[p.id]}"/></svg></span><span class="sr-only">Share to </span>${p.name}</button>`).join('')}</div>
    <div class="sp-actions"><button type="button" data-act="copy-image">Copy image</button><button type="button" data-act="download">Download image</button><button type="button" data-act="copy-text">Copy text and link</button></div>
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
// Renders the open context at a shape; a later call wins if an earlier render is still running. The native share
// waits for the new image as a File: Safari drops the click's user activation if the share awaits a render, and the
// previous image may show words just hidden.
function showCard(shape) {
  const cur = current, render = renderCard(cur.ctx, shape, cur.red, cur.charts), img = pop.querySelector('.sp-img');
  const native = pop.querySelector('[data-act="native"]');
  Object.assign(cur, {render, card: render.then(r => r.blob), shape, file: null});
  native?.setAttribute('aria-disabled', 'true');
  pop.querySelector('.sp-card').classList.toggle('tall', shape === 'tall' || !!cur.ctx.snapshot);
  render.then(async ({words, size, blob}) => {
    const b = await blob;
    if (!b || current !== cur || cur.render !== render) return;
    img.style.aspectRatio = size.join(' / ');
    cur.size = size;
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(b);
    img.alt = `Share card showing ${cardSummary()}`;
    cur.words = words;
    cur.file = new File([b], `discord-wrapped-${slug()}.png`, {type: 'image/png'});
    native?.removeAttribute('aria-disabled');
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
  const box = pop.querySelector('.sp-hits'), [W, H] = current.size;
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
    const terms = ctxTexts(current.ctx)
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
  if ('upload' in e.target.dataset) return localStorage.setItem(UPLOAD_KEY, e.target.checked ? 'on' : 'off');
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
// Resolves to the link the post should carry: the image's share link when uploading is on and works, else the site.
function linkFor() {
  if (!uploadOn()) return Promise.resolve(SITE);
  const meta = {title: cardSummary(), description: withoutCta(postText())};
  return current.card.then(blob => blob && shared.link(blob, meta).catch(e => { alert(e.message); return null; })).then(url => url || SITE, () => SITE);
}
// Writes text that's still being worked out, keeping the click's user activation where the browser allows it.
function copyText(text) {
  if (!window.ClipboardItem || !navigator.clipboard?.write) return text.then(t => navigator.clipboard.writeText(t));
  return navigator.clipboard.write([new ClipboardItem({'text/plain': text.then(t => new Blob([t], {type: 'text/plain'}))})]);
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
  // Reddit takes the link as the post's own URL.
  const compose = link => p.compose(p.linkPost ? withoutCta(text) : withLink(text, link), server, link);
  if (!uploadOn()) window.open(compose(SITE), '_blank', 'noopener');
  else {
    // Open the tab during the click, so it isn't blocked as a popup, and send it to the post once the upload is done.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    linkFor().then(link => tab ? tab.location.replace(compose(link)) : window.open(compose(link), '_blank', 'noopener'));
  }
  copied.then(ok => {
    const image = p.linkPost ? '' : ok ? `<li>Paste the copied image into your post with ⌘V or Ctrl+V.</li>` : `<li>Couldn't copy the image. Choose "Download image" and attach it to your post.</li>`;
    stepOut(image ? `<ol>${image}</ol>` : '');
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
    else if (act === 'copy-text') { const text = postText(); await copyText(linkFor().then(link => withLink(text, link))); stepOut('<p>Text and link copied.</p>'); }
    else if (act === 'zoom') {
      current.zoomed = !current.zoomed;
      b.setAttribute('aria-pressed', current.zoomed);
      pop.querySelector('.sp-preview').classList.toggle('zoomed', current.zoomed);
      hits();
    } else if (act === 'edit') {
      // From here the post is the person's own text; later redactions still black out newly hidden terms in it.
      const area = Object.assign(document.createElement('textarea'), {className: 'sp-text', rows: 3, value: postText()});
      area.setAttribute('aria-labelledby', 'sp-post-label');
      const note = Object.assign(document.createElement('p'), {className: 'sp-hint', textContent: 'Words you hide now are blacked out here too. Showing them again won’t restore them.'});
      current.edited = true;
      pop.querySelector('.sp-post').replaceWith(area, note);
      b.remove();
      area.focus();
    } else if (act === 'download') {
      const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(await current.card), download: `discord-wrapped-${slug()}.png`});
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (act === 'native') {
      // No await before share(), so the click still counts as the user's.
      const file = current.file, data = {text: withLink(postText())};
      if (!file) return;
      await navigator.share(navigator.canShare?.({files: [file]}) ? {...data, files: [file]} : data);
    }
  } catch (err) {
    if (err?.name !== 'AbortError') stepOut(`<p class="error">Couldn't share from this browser. Download the image and attach it to your post.</p>`);
  }
});

/* triggers */
// Shares without a chart of their own borrow the main chart of the section they came from.
const SECTION_CHART = {'s-overview': 'year-chart', 's-rhythm': 'heat-chart', 's-people': 'share-chart', 's-words': 'bump-chart', 's-search': 'search-chart'};
// Shares from a chart's own text (its heading, legend, readout or callout) borrow that chart instead.
const withSectionChart = (ctx, el) => ctx.chart || ctx.bars ? ctx : {...ctx, chart: chartNear(el) || SECTION_CHART[el.closest('section.card')?.id]};
// The chart that report text belongs to: the one it sits in, else the first chart under its heading, before the next.
function chartNear(el) {
  const isChart = n => n.id && n.querySelector(':scope > svg.chart');
  const own = el.closest('[id]'); if (own && isChart(own)) return own.id;
  const section = el.closest('section.card');
  if (!section) return null;
  // Headings and charts in reading order; a block that holds its own heading (the calendar) reads as its own run.
  const marks = [...section.querySelectorAll('h3, [id]')].filter(n => n.matches('h3') || isChart(n));
  const before = marks.filter(n => n.compareDocumentPosition(el) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY) || n.contains(el));
  const head = before.findLast(n => n.matches('h3'));
  if (!head) return null;
  const next = marks[marks.indexOf(head) + 1];
  return next && !next.matches('h3') ? next.id : null;
}
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
  const quote = !owner && el.closest('blockquote, .msg .text'), whole = !owner && !quote && section && sectionShare(section);
  // A section's share takes the chart the selected text belongs to, over the section's main one.
  const ctx = owner ? shareCtx.get(owner.dataset.share) : quote ? share('selection', {text}) : whole && {...whole, chart: chartNear(el) || whole.chart};
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
