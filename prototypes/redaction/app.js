// PROTOTYPE (issue #15). Three variants of redaction in the share popover, ?variant=A|B|C.
// ?share=<id> opens a share on load, ?remember=1 turns on "redactions persist for the session".
const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString('en-GB');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const longDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', {timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'});
const quoteOf = (t, n = 80) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const SITE_HOST = 'discordwrapped.app', SITE = 'https://' + SITE_HOST;
const CTA = `Check yours on ${SITE_HOST}`;
const PLATFORMS = ['X', 'Bluesky', 'Threads', 'Mastodon', 'LinkedIn', 'Reddit', 'WhatsApp'];

/* ---------- copy (from share-copy.js; name() and quote() now mark what they insert) ---------- */
// Markers:  + kind + value + . Kinds: N = server, channel or DM name; M = a quoted message; W = a word or search term.
const OPEN = '', CLOSE = '';
let QK = 'M';
const QKIND = {'rank.word': 'W', 'search': 'W', 'rank.server': 'N'};
const SHARE_COPY = (() => {
  const noun = (raw, singular, plural = `${singular}s`) => raw === 1 ? singular : plural;
  const times = (value, raw) => `${value} ${noun(raw, 'time')}`;
  const clip = (value, limit) => {
    const text = String(value).trim();
    if (text.length <= limit) return text;
    const prefix = text.slice(0, limit - 1);
    const boundary = /\s/.test(text[limit - 1]) ? prefix.length : prefix.search(/\s+\S*$/);
    return `${prefix.slice(0, Math.max(0, boundary)).trimEnd()}…`;
  };
  const excerpt = (value, limit) => {
    const text = String(value).trim();
    const forbidden = text.search(/Discord Wrapped|#|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[‍️⃣]|\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)/iu);
    return clip(forbidden < 0 ? text : `${text.slice(0, forbidden).trimEnd()}…`, limit);
  };
  const quote = (value, limit = 62) => `“${OPEN}${QK}${excerpt(value, limit - 2)}${CLOSE}”`;
  const name = value => `${OPEN}N${excerpt(value, 32)}${CLOSE}`;
  // Markers add 3 characters each; clip measures without them, then keeps them.
  const card = (text, headline, sub) => ({text, headline: clipMarked(headline, 40, clip), sub: clipMarked(sub, 70, clip).replace(/\.$/, '')});
  const caption = (label, p) => `${label} ${p.in}`;
  const sent = (p, verb = 'sent') => `${p.kind === 'all' ? "I've" : 'I'} ${verb}`;
  return {
    'highlight.recordDay': (v, p) => {
      const lead = `${v.n} Discord ${noun(v.nRaw, 'message')} in one day! ${v.date} was my busiest day ${p.in}.`;
      const ending = ` ${times(v.topCount, v.topCountRaw)}.`;
      return card(v.topText ? `${lead} I sent ${quote(v.topText, Math.min(62, 199 - lead.length - 8 - ending.length))}${ending}` : lead,
        `${v.n} in one day`, `My busiest day · ${v.date}`);
    },
    'rank.word': (v, p) => card(
      v.rankRaw === 1
        ? `${quote(v.word)} was my most-used word on Discord ${p.in}. ${sent(p, 'used')} it ${times(v.n, v.nRaw)}!`
        : `${quote(v.word)} was my number ${v.rank} word on Discord ${p.in}, used ${times(v.n, v.nRaw)}.`,
      quote(v.word, 40), caption(`Number ${v.rank} word · ${times(v.n, v.nRaw)}`, p)),
    'rank.server': (v, p) => card(
      `${v.n} of my Discord messages ${p.in} went to ${name(v.name)}.`,
      name(v.name), caption(`Number ${v.rank} server · ${v.n} ${noun(v.nRaw, 'message')}`, p)),
    'search': (v, p) => card(
      `${sent(p, 'said')} ${quote(v.query)} in ${v.n} Discord ${noun(v.nRaw, 'message')} ${p.in}${v.peakLabel ? `, most of all in ${name(v.peakLabel)}` : ''}.`,
      quote(v.query, 40), caption(`In ${v.n} ${noun(v.nRaw, 'message')}`, p)),
    'fame.first': (v, p) => card(
      p.kind === 'all' ? `My first ever message on Discord was ${quote(v.text)}!` : `My first Discord message ${p.in} was ${quote(v.text)}.`,
      quote(v.text, 40), `My first${p.kind === 'all' ? ' ever' : ''} message · ${v.date}`),
    'fame.latest': (v, p) => card(
      p.kind === 'all' ? `My most recent Discord message was ${quote(v.text)}.` : `My last Discord message ${p.in} was ${quote(v.text)}.`,
      quote(v.text, 40), `My latest message · ${v.date}`),
    'fame.mostRepeated': (v, p) => card(
      `${quote(v.text)} was my most-sent Discord message ${p.in}. ${sent(p)} it ${times(v.n, v.nRaw)}!`,
      quote(v.text, 40), caption(`Most repeated message · Sent ${times(v.n, v.nRaw)}`, p)),
  };
})();
function clipMarked(s, limit, clip) {
  const plain = s.replace(/./g, '').replace(//g, '');
  if (plain.length <= limit) return s;
  const cut = clip(plain, limit);
  // Walk the marked string, copying characters until the clipped plain text is used up.
  let out = '', n = 0, open = false;
  const keep = cut.endsWith('…') ? cut.length - 1 : cut.length;
  for (let i = 0; i < s.length && n < keep; i++) {
    if (s[i] === OPEN) { out += s[i] + s[i + 1]; i++; open = true; continue; }
    if (s[i] === CLOSE) { out += s[i]; open = false; continue; }
    out += s[i]; n++;
  }
  return out + (open ? '…' + CLOSE : '…');
}
function share(key, v, P, extra = {}) {
  const vars = {};
  for (const [k, x] of Object.entries(v)) { if (typeof x === 'number') { vars[k] = fmt(x); vars[k + 'Raw'] = x; } else vars[k] = x; }
  QK = QKIND[key] === 'N' ? 'M' : QKIND[key] || 'M';
  return {key, period: P.label, ...SHARE_COPY[key](vars, P), ...extra};
}
const mark = (kind, s) => `${OPEN}${kind}${s}${CLOSE}`;
const rankBars = (items, i, label = x => x) => ({items: items.slice(0, Math.max(6, Math.min(i + 1, 10))).map(([n, v]) => [label(n), v]), highlight: i});

/* ---------- tokens ---------- */
// Every piece of card or post text becomes word tokens. A token inside a marker belongs to an entity (a name,
// message or word) so a toggle or one tap can hide all of it; plain words are hidden by value.
const norm = s => s.toLowerCase().replace(/[“”…]/g, '').replace(/\s+/g, ' ').trim();
const wordKey = s => s.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || s;
function tokenize(str, part) {
  const chars = []; let ent = null, entId = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === OPEN) { ent = {kind: str[i + 1], id: ++entId, text: ''}; i++; continue; }
    if (str[i] === CLOSE) { ent = null; continue; }
    if (ent) ent.text += str[i];
    chars.push([str[i], ent]);
  }
  const toks = []; let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const ents = cur.filter(c => c[1]), e = ents[0]?.[1];
    let a = 0, b = cur.length;
    if (e) { a = cur.findIndex(c => c[1]); b = cur.length - [...cur].reverse().findIndex(c => c[1]); }
    else { const w = cur.map(c => c[0]).join(''), m = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u); if (m[2]) { a = m[1].length; b = a + m[2].length; } }
    const s = x => x.map(c => c[0]).join('');
    const core = s(cur.slice(a, b));
    toks.push({part, pre: s(cur.slice(0, a)), core, post: s(cur.slice(b)), wkey: wordKey(core),
      kind: e?.kind || null, ekey: e ? e.kind + ':' + norm(e.text).slice(0, 14) : null, etext: e?.text, ewords: e ? e.text.trim().split(/\s+/).length : 0});
    cur = [];
  };
  for (const c of chars) { if (/\s/.test(c[0])) flush(); else cur.push(c); }
  flush();
  return toks;
}
function prepare(ctx) {
  if (ctx.parts) return ctx;
  ctx.parts = {
    headline: tokenize(ctx.headline, 'headline'),
    sub: tokenize(ctx.sub || '', 'sub'),
    bars: ctx.bars ? ctx.bars.items.map(([l]) => tokenize(l, 'bars')) : [],
    text: tokenize(ctx.text, 'text'),
  };
  ctx.all = [...ctx.parts.headline, ...ctx.parts.sub, ...ctx.parts.bars.flat(), ...ctx.parts.text];
  ctx.all.forEach((t, i) => t.i = i);
  const plain = s => s.replace(/./g, '').replace(//g, '');
  ctx.plainHeadline = plain(ctx.headline); ctx.plainSub = plain(ctx.sub || '');
  return ctx;
}

/* ---------- redaction state ---------- */
// Each variant decides which kinds its toggles cover.
const VARIANTS = {
  A: {name: 'Tap the card', toggles: [['names', 'Hide names', ['N']], ['quotes', 'Hide quotes', ['M', 'W']]], post: 'blocks'},
  B: {name: 'Word chips', toggles: [['names', 'Names', ['N']], ['messages', 'Messages', ['M']], ['words', 'Words and searches', ['W']]], post: 'labels'},
  C: {name: 'Edit mode', toggles: [['names', 'Hide names', ['N']], ['messages', 'Hide messages', ['M']]], post: 'blocks'},
};
const KIND_LABEL = {N: 'name', M: 'message', W: 'word'};
const freshState = () => ({tog: {}, ent: {}, words: []});
const clone = s => JSON.parse(JSON.stringify(s));
let variant = new URLSearchParams(location.search).get('variant')?.toUpperCase();
if (!VARIANTS[variant]) variant = 'A';
let remember = new URLSearchParams(location.search).get('remember') === '1';
let memory = freshState();   // what "remember for this session" carries between shares
let state = freshState(), carried = 0;

const togglesFor = kind => VARIANTS[variant].toggles.filter(([id, , kinds]) => kinds.includes(kind)).some(([id]) => state.tog[id]);
const entHidden = t => t.ekey ? (t.ekey in state.ent ? state.ent[t.ekey] === 'hide' : togglesFor(t.kind)) : false;
const hidden = t => entHidden(t) || state.words.includes(t.wkey);
const setWord = (k, on) => { state.words = state.words.filter(w => w !== k); if (on) state.words.push(k); };
function tap(t) {
  if (t.ekey && (t.kind === 'N' || t.ewords === 1)) state.ent[t.ekey] = entHidden(t) ? 'show' : 'hide';
  else if (t.ekey && entHidden(t)) state.ent[t.ekey] = 'show';
  else setWord(t.wkey, !state.words.includes(t.wkey));
  changed();
}
function reveal(tokens) {
  for (const t of tokens) { if (entHidden(t)) state.ent[t.ekey] = 'show'; setWord(t.wkey, false); }
  changed();
}
function hiddenCount(ctx) { return new Set(ctx.all.filter(hidden).map(t => entHidden(t) ? t.ekey : t.wkey)).size; }
// Units: consecutive hidden tokens merge into one bar, so the number of hidden words doesn't show.
function units(tokens) {
  const out = [];
  for (const t of tokens) {
    const h = hidden(t), prev = out[out.length - 1];
    if (h && prev?.hidden && !prev.post && !t.pre) { prev.tokens.push(t); prev.post = t.post; continue; }
    out.push({tokens: [t], hidden: h, pre: t.pre, core: t.core, post: t.post,
      label: h && entHidden(t) ? KIND_LABEL[t.kind] : null});
  }
  return out;
}
const BLOCK = '████';
function postText(ctx, mode = VARIANTS[variant].post) {
  return units(ctx.parts.text).map(u => u.pre + (u.hidden ? (mode === 'labels' && u.label ? `[${u.label}]` : BLOCK) : u.core) + u.post).join(' ') + ' ' + CTA;
}

/* ---------- card (renderCard from share.js, drawing word by word and recording hit areas) ---------- */
const W = 1200, H = 675, P = 64;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawCard(ctx, canvas, labelled) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d'), font = getComputedStyle(document.body).fontFamily, boxes = [];
  g.fillStyle = css('--surface'); g.fillRect(0, 0, W, H);
  g.fillStyle = css('--accent'); g.fillRect(0, 0, W, 10);
  g.textBaseline = 'alphabetic';
  g.fillStyle = css('--muted'); g.font = `600 26px ${font}`;
  g.fillText('Discord Wrapped', P, 74);
  const graphic = ctx.bars || ctx.chartData;
  const barW = (size, u) => {
    const base = size * 2.2;
    if (!labelled || !u.label) return base;
    const f = g.font; g.font = `600 ${Math.round(size * .42)}px ${font}`; const w = g.measureText(u.label).width; g.font = f;
    return Math.max(base, w + size * .7);
  };
  const uw = (u, size) => g.measureText(u.pre).width + (u.hidden ? barW(size, u) : g.measureText(u.core).width) + g.measureText(u.post).width;
  const layout = (us, size, maxW, maxLines) => {
    const sp = g.measureText(' ').width, lines = [[]]; let w = 0;
    for (const u of us) {
      const ww = uw(u, size), line = lines[lines.length - 1];
      if (line.length && w + sp + ww > maxW) { lines.push([u]); w = ww; } else { line.push(u); w += (line.length > 1 ? sp : 0) + ww; }
    }
    if (lines.length > maxLines) { lines.length = maxLines; const last = lines[maxLines - 1]; const u = last[last.length - 1]; last[last.length - 1] = {...u, post: u.post + '…'}; }
    return lines.map(l => ({units: l, width: l.reduce((a, u, i) => a + uw(u, size) + (i ? sp : 0), 0)}));
  };
  const drawLines = (lines, x, y, size, lh, color, weight) => {
    const sp = g.measureText(' ').width;
    for (const l of lines) {
      let cx = x;
      for (const u of l.units) {
        g.fillStyle = color; g.fillText(u.pre, cx, y); cx += g.measureText(u.pre).width;
        const w = u.hidden ? barW(size, u) : g.measureText(u.core).width;
        if (u.hidden) {
          g.fillStyle = css('--fg'); g.beginPath(); g.roundRect(cx, y - size * .78, w, size * .95, Math.max(2, size * .06)); g.fill();
          if (labelled && u.label) {
            const f = g.font; g.font = `600 ${Math.round(size * .42)}px ${font}`; g.fillStyle = css('--surface'); g.textAlign = 'center';
            g.fillText(u.label, cx + w / 2, y - size * .78 + size * .95 / 2 + size * .15); g.textAlign = 'left'; g.font = f;
          }
        } else { g.fillStyle = color; g.fillText(u.core, cx, y); }
        boxes.push({x: cx, y: y - size * .85, w, h: size * 1.05, unit: u});
        cx += w; g.fillStyle = color; g.fillText(u.post, cx, y); cx += g.measureText(u.post).width + sp;
      }
      y += lh;
    }
    return y;
  };
  let size = graphic ? 76 : 120, lines;
  do { g.font = `700 ${size}px ${font}`; lines = layout(units(ctx.parts.headline), size, W - 2 * P, 2); size -= 4; }
  while (lines.some(l => l.width > W - 2 * P) && size > 30);
  size += 4; g.font = `700 ${size}px ${font}`;
  let y = drawLines(lines, P, 74 + size * 1.25, size, size * 1.1, css('--fg'));
  if (ctx.parts.sub.length) {
    g.font = `400 34px ${font}`;
    const sl = layout(units(ctx.parts.sub), 34, W - 2 * P, 2);
    y = drawLines(sl, P, y + 4, 34, 46, css('--muted')) - 4;
  }
  const top = y + 10, boxH = H - 80 - top;
  if (ctx.bars && boxH >= 60) {
    const {items, highlight} = ctx.bars, x = P, w = W - 2 * P;
    const rows = items.length, gap = 6, rh = Math.min(34, (boxH - gap * (rows - 1)) / rows), labelW = Math.min(360, w * .36), max = Math.max(...items.map(r => r[1]));
    items.forEach(([, v], i) => {
      const ry = top + i * (rh + gap), on = i === highlight, fs = Math.round(rh * .62);
      g.font = `${on ? 700 : 400} ${fs}px ${font}`;
      const color = css(on ? '--fg' : '--muted');
      const toks = ctx.parts.bars[i], us = units(toks);
      // A bar label is one entity: shorten it like the site does, or draw one bar if hidden.
      if (us.length === 1 && us[0].hidden || us.every(u => u.hidden)) {
        const u = {...us[0], tokens: toks, pre: '', post: ''};
        drawLines([{units: [u]}], x, ry + rh / 2 + fs * .35, fs, 0, color);
      } else {
        let label = us.map(u => u.pre + (u.hidden ? BLOCK : u.core) + u.post).join(' ');
        while (label.length > 3 && g.measureText(label).width > labelW - 16) label = label.slice(0, -2) + '…';
        g.fillStyle = color; g.fillText(label, x, ry + rh / 2 + fs * .35);
        boxes.push({x, y: ry, w: Math.min(g.measureText(label).width, labelW - 16), h: rh, unit: {tokens: toks, hidden: false}});
      }
      g.fillStyle = css(on ? '--accent' : '--soft');
      g.beginPath(); g.roundRect(x + labelW, ry + 3, Math.max(4, (w - labelW - 120) * v / max), rh - 6, 4); g.fill();
      g.fillStyle = color; g.textAlign = 'right'; g.font = `${on ? 700 : 400} ${fs}px ${font}`;
      g.fillText(fmt(v), x + w, ry + rh / 2 + fs * .35); g.textAlign = 'left';
    });
  } else if (ctx.chartData && boxH >= 60) {
    // Stand-in for the section chart the site would borrow.
    const d = ctx.chartData, max = Math.max(...d), bw = (W - 2 * P) / d.length;
    d.forEach((v, i) => { g.fillStyle = css(i === ctx.chartHi ? '--accent' : '--soft'); g.beginPath(); g.roundRect(P + i * bw + 3, top + boxH - boxH * v / max, bw - 6, Math.max(2, boxH * v / max), 3); g.fill(); });
  }
  g.font = `600 28px ${font}`; g.fillStyle = css('--accent'); g.fillText(SITE_HOST, P, H - 36);
  g.font = `400 22px ${font}`; g.fillStyle = css('--muted'); g.textAlign = 'right';
  g.fillText('Package processed in your browser', W - P, H - 38); g.textAlign = 'left';
  return boxes;
}
const unitText = u => u.tokens.map(t => t.core).join(' ');

/* ---------- shares from the fixture ---------- */
let SHARES = [], D;
function buildShares(F) {
  D = F['2025'];
  const P25 = {kind: 'year', label: '2025', in: 'in 2025'};
  const PAll = {kind: 'all', label: 'since September 2016', in: 'since September 2016'};
  const servers = D.guilds.map(g => [g.name, g.count]);
  const S = [];
  servers.slice(0, 5).forEach(([name, n], i) => S.push({id: 'server' + i, group: 'servers', label: name, n,
    ctx: share('rank.server', {name, rank: i + 1, n}, P25, {bars: rankBars(servers, i, x => mark('N', x))})}));
  D.words.slice(0, 5).forEach(([word, n], i) => S.push({id: 'word' + i, group: 'words', label: word, n,
    ctx: share('rank.word', {word, rank: i + 1, n}, P25, {bars: rankBars(D.words, i, x => mark('W', x))})}));
  // Search runs in the worker; the fixture has no messages, so the count and peak are stand-ins from word counts.
  const q = 'shiggy', months = Object.keys(D.periods).sort(), per = months.map(m => (D.wordPeriods[m] || []).find(w => w[0] === q)?.[1] || 0);
  S.push({id: 'search', group: 'search', label: q, n: per.reduce((a, b) => a + b, 0),
    ctx: share('search', {query: q, n: per.reduce((a, b) => a + b, 0), peakLabel: 'Example Server'}, P25, {chartData: per, chartHi: per.indexOf(Math.max(...per))})});
  const day = m => longDate(m.at.slice(0, 10));
  const fm = D.fame;
  S.push({id: 'first', group: 'fame', label: 'First message', text: fm.first.text, ctx: share('fame.first', {text: fm.first.text || 'an attachment', date: day(fm.first)}, P25)});
  S.push({id: 'latest', group: 'fame', label: 'Latest message', text: fm.last.text, ctx: share('fame.latest', {text: fm.last.text || 'an attachment', date: day(fm.last)}, P25)});
  const mr = fm.mostRepeated;
  S.push({id: 'repeated', group: 'fame', label: 'Most repeated message', text: mr.text, n: mr.count,
    ctx: share('fame.mostRepeated', {text: mr.text, n: mr.count}, P25, {bars: rankBars(D.expressions, Math.max(0, D.expressions.findIndex(e => e[0] === mr.text.toLowerCase())), t => `“${mark('M', quoteOf(t, 24))}”`)})});
  // 2025's busiest days were mostly attachments (no notable text), so the quoted record day comes from All time.
  const pk = F.all.peakDays[0], [txt, tn] = pk.topText, notable = tn > pk.count * .2 && txt;
  const years = Object.keys(F.all.periods).sort();
  S.push({id: 'recordDay', group: 'highlights', label: longDate(pk.date), n: pk.count, text: txt, tn,
    ctx: share('highlight.recordDay', {date: longDate(pk.date), n: pk.count, topText: notable ? txt : '', topCount: notable ? tn : 0}, PAll,
      {chartData: years.map(y => F.all.periods[y].total), chartHi: years.indexOf(pk.date.slice(0, 4))})});
  const p25 = D.peakDays[0];
  S.push({id: 'recordDay2025', group: 'highlights', label: longDate(p25.date), n: p25.count,
    ctx: share('highlight.recordDay', {date: longDate(p25.date), n: p25.count, topText: '', topCount: 0}, P25, {chartData: months.map(m => D.periods[m].total), chartHi: +p25.date.slice(5, 7) - 1})});
  S.forEach(s => prepare(s.ctx));
  return S;
}
function renderReport() {
  const by = g => SHARES.filter(s => s.group === g);
  const row = s => `<button type="button" class="rankrow" data-open="${s.id}"><span class="name">${esc(s.label)}</span><span class="number">${fmt(s.n)}</span></button>`;
  const rs = SHARES.find(s => s.id === 'recordDay'), r25 = SHARES.find(s => s.id === 'recordDay2025');
  $('report').innerHTML = `
    <section class="card"><h2>People and servers</h2><div class="grid2"><div><h3>Servers</h3>${by('servers').map(row).join('')}</div>
      <div><h3>Words</h3>${by('words').map(row).join('')}</div></div></section>
    <section class="card"><h2>Search</h2><div class="searchrow"><input value="shiggy" aria-label="Search your messages" readonly> <span class="muted">${fmt(SHARES.find(s => s.id === 'search').n)} messages</span>
      <button type="button" class="share-btn" data-open="search">Share</button></div></section>
    <section class="card"><h2>Hall of fame</h2><div class="fame">${by('fame').map(s => `<article data-open="${s.id}" tabindex="0"><h3>${esc(s.label)}</h3><blockquote>${esc(quoteOf(s.text, 120))}</blockquote>${s.n ? `<small>Sent ${fmt(s.n)} times</small>` : ''}</article>`).join('')}</div></section>
    <section class="card"><h2>Highlights</h2>
      <p class="hl" data-open="recordDay" tabindex="0"><strong>You sent ${fmt(rs.n)} messages on ${esc(rs.label)},</strong> your busiest day since September 2016. You sent “${esc(rs.text)}” ${fmt(rs.tn)} times. <small>(All time)</small></p>
      <p class="hl" data-open="recordDay2025" tabindex="0"><strong>You sent ${fmt(r25.n)} messages on ${esc(r25.label)},</strong> your busiest day in 2025. <small>(no notable message that day)</small></p></section>`;
}

/* ---------- popover ---------- */
const pop = $('share-pop');
let current = null, anchor = null, cEdit = false, zoomed = false;
function openShare(id, rect) {
  const s = SHARES.find(x => x.id === id); if (!s) return;
  current = s; cEdit = false; zoomed = false;
  state = remember ? clone(memory) : freshState();
  carried = remember ? hiddenCount(s.ctx) : 0;
  pop.classList.remove('hidden');
  render();
  place(rect);
  history.replaceState(null, '', urlFor());
}
function closeShare() { pop.classList.add('hidden'); pop.classList.remove('c-edit'); current = null; history.replaceState(null, '', urlFor()); bar(); }
function place(rect = anchor) {
  anchor = rect;
  if (innerWidth < 600 || !rect) { pop.classList.add('sheet'); pop.style.left = pop.style.top = ''; return; }
  pop.classList.remove('sheet');
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8);
  const below = rect.bottom + 10, above = rect.top - h - 10;
  pop.style.left = left + 'px';
  const top = below + h < innerHeight ? below : above >= 8 ? above : innerHeight - h - 8;
  pop.style.top = Math.max(8, top) + 'px';
}
function changed() {
  if (remember) memory = clone(state);
  render();
}
const switchesHTML = ctx => {
  const kinds = new Set(ctx.all.map(t => t.kind).filter(Boolean));
  return `<div class="switches" role="group" aria-label="Hide on this share">${VARIANTS[variant].toggles.filter(([, , ks]) => ks.some(k => kinds.has(k)))
    .map(([id, label]) => `<button type="button" class="switch" data-tog="${id}" aria-pressed="${!!state.tog[id]}"><span class="knob" aria-hidden="true"></span>${label}</button>`).join('')}</div>`;
};
const tailHTML = ctx => `
  <label class="sp-label">Post text<textarea class="sp-text" rows="3">${esc(postText(ctx))}</textarea></label>
  <div class="sp-platforms">${PLATFORMS.map(p => `<button type="button">Share to ${p}</button>`).join('')}</div>
  <div class="sp-actions"><button type="button">Copy image</button><button type="button">Download image</button><button type="button">Copy text and link</button></div>`;
const head = (title = 'Share', extra = '') => `<div class="sp-head"><strong>${title}</strong>${extra}<button type="button" class="sp-close" aria-label="Close sharing">×</button></div>`;
const resetBtn = ctx => hiddenCount(ctx) ? `<button type="button" class="linkish" data-act="reset">Show everything</button>` : '';
function render() {
  if (!current) return;
  const ctx = current.ctx, focusSel = document.activeElement?.closest?.('#share-pop') && focusKey(document.activeElement);
  const scrollTop = pop.scrollTop;
  pop.classList.toggle('c-edit', variant === 'C' && cEdit);
  pop.classList.toggle('wide', variant === 'A');
  if (variant === 'A') renderA(ctx);
  else if (variant === 'B') renderB(ctx);
  else renderC(ctx);
  pop.scrollTop = scrollTop;
  if (focusSel) pop.querySelector(focusSel)?.focus({preventScroll: true});
  if (!pop.classList.contains('sheet')) place();
  bar();
}
function focusKey(el) {
  for (const a of ['data-tog', 'data-hit', 'data-chip', 'data-ent', 'data-whole', 'data-act']) if (el.hasAttribute(a)) return `[${a}="${CSS.escape(el.getAttribute(a))}"]`;
  return null;
}

/* A: tap words on the card itself. Hit areas come from where the canvas drew each word. */
function renderA(ctx) {
  const small = innerWidth < 600;
  pop.innerHTML = head() + switchesHTML(ctx) + `
    <div class="cardscroll ${zoomed ? 'zoomed' : ''}">
      ${small ? `<button type="button" class="zoom" data-act="zoom" aria-pressed="${zoomed}">${zoomed ? 'Fit card' : 'Zoom in'}</button>` : ''}
      <div class="cardwrap"><canvas class="sp-card" role="img"></canvas></div></div>
    <div class="row-between"><p class="hint">Tap a word to black it out.</p>${resetBtn(ctx)}</div>` + tailHTML(ctx);
  const canvas = pop.querySelector('canvas'), boxes = drawCard(ctx, canvas, false);
  canvas.setAttribute('aria-label', `Share card: ${ctx.plainHeadline}. ${ctx.plainSub}`);
  const wrap = pop.querySelector('.cardwrap');
  // Hit areas at least 24 px tall on screen; on a phone the zoom makes the small lines tappable.
  const shown = (pop.clientWidth - 28) * (zoomed ? 2.5 : 1), k = shown / W, minH = 24 / k;
  boxes.forEach((b, i) => {
    const h = Math.max(b.h, minH), y = b.y - (h - b.h) / 2, u = b.unit, txt = unitText(u);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hit'; btn.dataset.hit = i;
    btn.setAttribute('aria-label', u.hidden ? `Show “${txt}”` : `Black out “${txt}”`);
    Object.assign(btn.style, {left: (b.x - 4) / W * 100 + '%', top: y / H * 100 + '%', width: (b.w + 8) / W * 100 + '%', height: h / H * 100 + '%'});
    btn.onclick = () => u.hidden ? reveal(u.tokens) : tap(u.tokens[0]);
    wrap.appendChild(btn);
  });
}

/* B: every word of the post as a chip under the preview, with card-only labels after it. */
function renderB(ctx) {
  pop.innerHTML = head() + `<div class="b-sticky"><canvas class="sp-card" role="img"></canvas></div>` + switchesHTML(ctx) + `
    <div class="row-between"><span class="chips-label" id="b-words">Tap words to black them out</span>${resetBtn(ctx)}</div>
    <div class="chips" role="group" aria-labelledby="b-words">${chipsHTML(ctx.parts.text)}</div>
    ${cardOnly(ctx).length ? `<p class="chips-label" id="b-card">Also on the card</p><div class="chips" role="group" aria-labelledby="b-card">${chipsHTML(cardOnly(ctx))}</div>` : ''}` + tailHTML(ctx);
  const canvas = pop.querySelector('canvas');
  drawCard(ctx, canvas, true);
  canvas.setAttribute('aria-label', `Share card: ${ctx.plainHeadline}. ${ctx.plainSub}`);
  pop.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => tap(ctx.all[+b.dataset.chip]));
  pop.querySelectorAll('[data-whole]').forEach(b => b.onclick = () => {
    const toks = ctx.all.filter(t => t.ekey === b.dataset.whole), hide = !toks.every(hidden);
    state.ent[b.dataset.whole] = hide ? 'hide' : 'show';
    if (!hide) toks.forEach(t => setWord(t.wkey, false));
    changed();
  });
}
function cardOnly(ctx) {
  const inPost = new Set(ctx.parts.text.map(t => t.ekey || t.wkey)), seen = new Set(), out = [];
  for (const t of [...ctx.parts.headline, ...ctx.parts.sub, ...ctx.parts.bars.flat()]) {
    const k = t.ekey || t.wkey;
    if (inPost.has(k) || seen.has(k) || !/[\p{L}]/u.test(t.core)) continue;
    // Only first token of a multi-word entity stands for it.
    seen.add(k); out.push(t);
  }
  return out;
}
function chipsHTML(tokens) {
  let html = '', i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.ekey && t.kind !== 'N' && t.ewords > 1) {
      let j = i; while (j < tokens.length && tokens[j].ekey === t.ekey) j++;
      const group = tokens.slice(i, j), all = group.every(hidden);
      html += `<span class="qgroup"><button type="button" class="chip whole" data-whole="${esc(t.ekey)}" aria-pressed="${all}">Whole ${KIND_LABEL[t.kind]}</button>${group.map(chip).join('')}</span>`;
      i = j; continue;
    }
    if (t.ekey) { let j = i; while (j < tokens.length && tokens[j].ekey === t.ekey) j++; html += chip(t, t.etext.trim()); i = j; continue; }
    html += chip(t); i++;
  }
  return html;
}
function chip(t, text = t.core) {
  const h = hidden(t), ent = t.ekey && (t.kind === 'N' || t.ewords === 1);
  return `<button type="button" class="chip ${ent ? 'ent' : ''}" data-chip="${t.i}" aria-pressed="${h}" aria-label="${esc(text)}${ent ? ', ' + KIND_LABEL[t.kind] : ''}">${esc(text)}${ent ? `<span class="tag" aria-hidden="true">${KIND_LABEL[t.kind]}</span>` : ''}</button>`;
}

/* C: an edit mode. The normal popover gains one button; editing lists what was found and shows each text field. */
function renderC(ctx) {
  const n = hiddenCount(ctx);
  if (!cEdit) {
    pop.innerHTML = head() + `<canvas class="sp-card" role="img"></canvas>
      <div class="row-between"><button type="button" data-act="edit" style="margin-top:8px;font-size:13px;padding:6px 10px">${n ? `Edit blacked-out words (${n})` : 'Black out words…'}</button></div>` + tailHTML(ctx);
  } else {
    const ents = [], seen = new Set();
    for (const t of ctx.all) if (t.ekey && !seen.has(t.ekey)) { seen.add(t.ekey); ents.push(t); }
    const field = (label, toks) => toks.length ? `<div class="field-label">${label}</div><div class="field" data-field>${toks.map(t => `<span class="tk ${hidden(t) ? 'hid' : ''}" data-ti="${t.i}">${esc(t.pre + t.core + t.post)}</span>`).join(' ')}</div>` : '';
    pop.innerHTML = head('Black out words') + `<div class="c-preview"><canvas class="sp-card" role="img"></canvas></div>` + switchesHTML(ctx) + `
      <div class="field-label">Found in this share</div>
      <ul class="found">${ents.map(t => `<li><span class="kind">${t.kind === 'N' ? 'Name' : t.kind === 'M' ? 'Message' : 'Word'}</span><span class="what">${esc(t.kind === 'N' ? t.etext : '“' + t.etext + '”')}</span><button type="button" data-ent="${esc(t.ekey)}" aria-pressed="${ctx.all.filter(x => x.ekey === t.ekey).every(hidden)}">${ctx.all.filter(x => x.ekey === t.ekey).every(hidden) ? 'Show' : 'Hide'}</button></li>`).join('')}</ul>
      ${field('Headline', ctx.parts.headline)}${field('Line under it', ctx.parts.sub)}${ctx.parts.bars.length ? field('Chart labels', ctx.parts.bars.flat()) : ''}${field('Post', ctx.parts.text)}
      <div class="c-foot"><button type="button" data-act="black-sel" disabled>Black out selection</button>${n ? '<button type="button" data-act="reset">Show everything</button>' : ''}<button type="button" class="primary" data-act="done">Done</button></div>`;
    pop.querySelectorAll('[data-ent]').forEach(b => b.onclick = () => {
      const toks = ctx.all.filter(t => t.ekey === b.dataset.ent), hide = !toks.every(hidden);
      state.ent[b.dataset.ent] = hide ? 'hide' : 'show';
      if (!hide) toks.forEach(t => setWord(t.wkey, false));
      changed();
    });
    pop.querySelectorAll('.tk.hid').forEach(s => s.onclick = () => reveal([ctx.all[+s.dataset.ti]]));
  }
  const canvas = pop.querySelector('canvas');
  drawCard(ctx, canvas, false);
  canvas.setAttribute('aria-label', `Share card: ${ctx.plainHeadline}. ${ctx.plainSub}`);
}
function selectedTokens() {
  const sel = getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  return [...pop.querySelectorAll('.field .tk')].filter(s => r.intersectsNode(s)).map(s => current.ctx.all[+s.dataset.ti]);
}
document.addEventListener('selectionchange', () => {
  const b = pop.querySelector('[data-act="black-sel"]'); if (b) b.disabled = !selectedTokens().length;
});

pop.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('sp-close')) return closeShare();
  if (b.dataset.tog) { state.tog[b.dataset.tog] = !state.tog[b.dataset.tog]; return changed(); }
  const act = b.dataset.act;
  if (act === 'reset') { state = freshState(); changed(); }
  else if (act === 'zoom') { zoomed = !zoomed; render(); }
  else if (act === 'edit') { cEdit = true; render(); pop.scrollTop = 0; pop.querySelector('.switch, [data-ent]')?.focus(); }
  else if (act === 'done') { cEdit = false; render(); pop.querySelector('[data-act="edit"]')?.focus(); }
  else if (act === 'black-sel') {
    const toks = selectedTokens();
    toks.forEach(t => { if (t.ekey && entHidden(t)) return; setWord(t.wkey, true); });
    getSelection().removeAllRanges(); changed();
  }
});
pop.addEventListener('input', e => { if (e.target.classList.contains('sp-text')) e.target.dataset.edited = '1'; });

/* ---------- triggers ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-open]');
  if (t) openShare(t.dataset.open, t.getBoundingClientRect());
});
document.addEventListener('keydown', e => {
  const t = e.target.closest?.('[data-open]');
  if (t && t.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openShare(t.dataset.open, t.getBoundingClientRect()); }
  if (e.key === 'Escape' && current) {
    if (cEdit) { cEdit = false; render(); } else { const id = current.id; closeShare(); document.querySelector(`[data-open="${id}"]`)?.focus(); }
  }
  const typing = e.target.closest?.('input, textarea, [contenteditable]');
  if (typing) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { cycleVariant(e.key === 'ArrowRight' ? 1 : -1); }
  if (e.key === 's' || e.key === 'S') cycleShare(e.key === 's' ? 1 : -1);
  if (e.key === 'r') toggleRemember();
});
document.addEventListener('pointerdown', e => {
  if (current && !pop.contains(e.target) && !$('proto-bar').contains(e.target) && !e.target.closest('[data-open]')) closeShare();
});
addEventListener('resize', () => { if (current) { place(); render(); } });

/* ---------- prototype bar ---------- */
const KEYS = Object.keys(VARIANTS);
function urlFor() {
  const p = new URLSearchParams({variant});
  if (current) p.set('share', current.id);
  if (remember) p.set('remember', '1');
  return '?' + p;
}
function cycleVariant(d) {
  variant = KEYS[(KEYS.indexOf(variant) + d + KEYS.length) % KEYS.length];
  memory = freshState();
  if (current) openShare(current.id, anchor); else bar();
  history.replaceState(null, '', urlFor());
}
function cycleShare(d) {
  const i = current ? SHARES.indexOf(current) : -1, next = SHARES[(i + d + SHARES.length) % SHARES.length];
  const el = document.querySelector(`[data-open="${next.id}"]`);
  openShare(next.id, el?.getBoundingClientRect());
}
function toggleRemember() {
  remember = !remember; memory = remember ? clone(state) : freshState();
  history.replaceState(null, '', urlFor()); bar();
}
function bar() {
  const v = VARIANTS[variant], ctx = current?.ctx;
  const hid = ctx ? [...new Set(units(ctx.all.filter(hidden)).flatMap(u => u.tokens.map(t => t.etext?.trim() || t.core)))] : [];
  const tog = v.toggles.filter(([id]) => state.tog[id]).map(([, l]) => l.replace(/^Hide /, '')).join(', ') || 'none';
  const mem = [...Object.entries(memory.ent).filter(([, x]) => x === 'hide').map(([k]) => k.slice(2)), ...memory.words];
  $('proto-bar').innerHTML = `<button type="button" data-v="-1" aria-label="Previous variant">◀</button>
    <span class="vname">${variant} · ${v.name}</span>
    <button type="button" data-v="1" aria-label="Next variant">▶</button>
    <span class="st">share <b>${current ? current.id + ' (' + ctx.key + ', ' + ctx.period + ')' : 'closed'}</b></span>
    <span class="st">hidden <b>${hid.length ? esc(hid.join(' · ').slice(0, 60)) : 'nothing'}</b></span>
    <span class="st">toggles <b>${tog}</b></span>
    <span class="st">post <b>${v.post === 'labels' ? '[name]' : BLOCK}</b></span>
    <button type="button" data-remember aria-pressed="${remember}">Remember for session: ${remember ? 'on' : 'off'}</button>
    ${remember ? `<span class="st">remembered <b>${mem.length ? esc(mem.join(', ').slice(0, 40)) : 'nothing'}</b>${carried ? ` · carried into this share <b>${carried}</b>` : ''}</span>` : ''}
    <button type="button" data-s="1" aria-label="Next share">share ▸</button>`;
}
$('proto-bar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.v) cycleVariant(+b.dataset.v);
  else if (b.dataset.s) cycleShare(+b.dataset.s);
  else if ('remember' in b.dataset) toggleRemember();
});

fetch('../report-fixture.json').then(r => r.json()).then(F => {
  SHARES = buildShares(F);
  renderReport();
  const id = new URLSearchParams(location.search).get('share');
  bar();
  if (id) requestAnimationFrame(() => { const el = document.querySelector(`[data-open="${id}"]`); openShare(id, el?.getBoundingClientRect()); });
});
