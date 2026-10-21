/* Parses a Discord data package and computes aggregates. Runs in a Web Worker; never touches the network. */
const STOP = new Set(('the and you that this for with have was but not are just like what can all your about how its it i a to of in is my me on so do be at we im if as or an they he she them his her from dont thats yeah yes no oh lol lmao okay really would there get know think one some more too well good has had when now then out been will also want did much only even right than why got should could into up here any still same because make need see something actually going gonna people someone time thing things us our very though who where these those their being were am id does ive ill didnt isnt lets youre said say go doesnt wont cant ' +
  'als een het ik je de en dat die niet voor maar met ook dan wat dit er mijn mij heb zijn op om wel nog aan zo te uit kan geen hoe ben bij naar dus ja nee door doen veel weet even gewoon want tot echt gaan meer jij ze hebben al mn ff ' +
  'der die das und ist nicht ich du es ein eine zu den mit auf für sich auch aber wie noch nur wenn mal schon ' +
  'que les des est pas une pour dans qui sur avec mais vous nous tout fait ' +
  'los las por con una para más pero muy').split(' '));
const TYPE_NAMES = {0:'GUILD_TEXT',1:'DM',2:'GUILD_VOICE',3:'GROUP_DM',4:'GUILD_CATEGORY',5:'GUILD_ANNOUNCEMENT',10:'ANNOUNCEMENT_THREAD',11:'PUBLIC_THREAD',12:'PRIVATE_THREAD',13:'GUILD_STAGE_VOICE',15:'GUILD_FORUM',16:'GUILD_MEDIA'};
const URL_RE = /https?:\/\/[^\s<>]+/g;
const LINK_RE = /https?:\/\/[^\s<>\[\]"`{}]+/g;
const MARKUP_RE = /<(?:@!?|@&|#|a?:\w+:)\d+>/g;
const WORD_RE = /[\p{L}\p{Nl}\p{No}]+(?:['’][\p{L}\p{Nl}\p{No}]+)?/gu;
const EMOJI_RE = /<a?:(\w+):\d+>/g;
// Phones type curly apostrophes (it’s), keyboards straight ones (it's); count them as one word.
const foldQuotes = s => s.replace(/[’‘]/g, "'");
const DAY = 86400000, EPOCH = 1420070400000;

let STORE = null;
const send = msg => self.postMessage(msg);
const progress = (phase, done, total) => send({type:'progress', phase, done, total});

/* ---------- archive access ---------- */
async function openZip(file) {
  const tailSize = Math.min(file.size, 65557 + 20);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tailSize - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is not a zip archive.');
  let count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  if ((cdOff === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) && eocd >= 20 && tail.getUint32(eocd - 20, true) === 0x07064b50) {
    const at = Number(tail.getBigUint64(eocd - 12, true));
    const z = new DataView(await file.slice(at, at + 56).arrayBuffer());
    count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true));
  }
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const utf8 = new TextDecoder(), entries = new Map();
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true);
    let csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true), off = cd.getUint32(p + 42, true);
    const nlen = cd.getUint16(p + 28, true), elen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
    const name = utf8.decode(new Uint8Array(cd.buffer, p + 46, nlen));
    for (let q = p + 46 + nlen, end = q + elen; q + 4 <= end;) {
      const id = cd.getUint16(q, true), size = cd.getUint16(q + 2, true);
      if (id === 1) {
        let r = q + 4;
        if (usize === 0xffffffff) { usize = Number(cd.getBigUint64(r, true)); r += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.getBigUint64(r, true)); r += 8; }
        if (off === 0xffffffff) off = Number(cd.getBigUint64(r, true));
      }
      q += 4 + size;
    }
    if (!name.endsWith('/')) entries.set(name, {method, csize, usize, off, encrypted: !!(flags & 1)});
    p += 46 + nlen + elen + clen;
  }
  return {
    names: [...entries.keys()],
    bytes: [...entries.values()].reduce((a, e) => a + e.usize, 0),
    async read(name) {
      const e = entries.get(name);
      if (e.encrypted) throw new Error(`${name} is encrypted.`);
      const h = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
      const start = e.off + 30 + h.getUint16(26, true) + h.getUint16(28, true);
      const blob = file.slice(start, start + e.csize);
      if (e.method === 0) return blob.text();
      if (e.method === 8) return new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      throw new Error(`${name} uses unsupported compression method ${e.method}.`);
    },
  };
}
function openFolder(files) {
  const map = new Map(files.map(f => [f.path, f.file]));
  return {names: [...map.keys()], bytes: files.reduce((a, f) => a + f.file.size, 0), read: name => map.get(name).text()};
}

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function snowflakeTime(id) { return /^\d{15,20}$/.test(id) ? Math.floor(Number(id) / 4194304) + EPOCH : NaN; }
function parseTimestamp(ts) {
  if (!ts) return NaN;
  let s = String(ts).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  return Date.parse(s);
}
function codePoints(s) {
  let n = s.length;
  if (/[\uD800-\uDBFF]/.test(s)) for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0xD800 && c <= 0xDBFF) n--; }
  return n;
}
function hostOf(u) {
  u = u.replace(/[.,;:!?)\]]+$/, '');
  const m = /^https?:\/\/([^/?#]*)/i.exec(u);
  if (!m) return '';
  let net = m[1]; const at = net.lastIndexOf('@'); if (at >= 0) net = net.slice(at + 1);
  if (net.startsWith('[')) { const end = net.indexOf(']'); if (end < 0) return ''; net = net.slice(1, end); }
  else if (net.includes(']')) return '';
  else { const colon = net.lastIndexOf(':'); if (colon >= 0) net = net.slice(0, colon); }
  return net.toLowerCase().replace(/^www\./, '');
}

async function parsePackage(source) {
  const archive = source.kind === 'zip' ? await openZip(source.file) : openFolder(source.files);
  const lower = archive.names.map(n => n.toLowerCase());
  const indexAt = lower.findIndex(n => /(^|\/)messages\/index\.json$/.test(n));
  const anyChannel = lower.findIndex(n => /(^|\/)messages\/[^/]+\/channel\.json$/.test(n));
  if (indexAt < 0 && anyChannel < 0) throw new Error('No Messages folder found. Choose the package.zip Discord emailed you, or its unzipped folder.');
  const ref = lower[indexAt >= 0 ? indexAt : anyChannel];
  const prefixLen = ref.search(/messages\//);
  const prefix = ref.slice(0, prefixLen);
  const byLower = new Map(archive.names.map((n, i) => [lower[i], n]));
  const readJSON = async l => byLower.has(l) ? JSON.parse(await archive.read(byLower.get(l))) : null;
  const index = (await readJSON(prefix + 'messages/index.json')) || {};
  const serverIndex = (await readJSON(prefix + 'servers/index.json')) || {};
  let user = (await readJSON(prefix + 'account/user.json')) || null;
  if (user) user = {id: user.id, username: user.global_name || user.username};
  const dirs = lower.filter(n => n.startsWith(prefix + 'messages/') && n.endsWith('/channel.json')).map(n => n.slice(0, -'channel.json'.length)).sort();
  const sections = [...new Set(archive.names.filter((n, i) => lower[i].startsWith(prefix)).map(n => n.slice(prefix.length).split('/')[0]).filter(s => s && !s.includes('.')))];

  const channels = [], seen = new Set(), errors = [];
  const ts = [], ch = [], text = [], ids = [], att = [];
  let duplicates = 0, mismatches = 0, messageFiles = 0;
  for (let d = 0; d < dirs.length; d++) {
    if (d % 50 === 0) progress('Reading messages', d, dirs.length);
    const dir = dirs[d];
    let meta;
    try { meta = await readJSON(dir + 'channel.json'); } catch (e) { errors.push([dir, 'channel.json: ' + e.message]); continue; }
    let rows = null;
    try {
      // Quote numeric IDs first: snowflakes exceed 2^53 and would collide as JS numbers.
      if (byLower.has(dir + 'messages.json')) rows = JSON.parse((await archive.read(byLower.get(dir + 'messages.json'))).replace(/("ID"\s*:\s*)(\d+)/g, '$1"$2"'));
      else if (byLower.has(dir + 'messages.csv')) rows = parseCSV(await archive.read(byLower.get(dir + 'messages.csv')));
    } catch (e) { errors.push([dir, e.message]); continue; }
    if (!rows) { errors.push([dir, 'no messages file']); continue; }
    messageFiles++;
    const cid = String(meta.id);
    const type = typeof meta.type === 'number' ? (TYPE_NAMES[meta.type] || 'TYPE_' + meta.type) : String(meta.type || 'UNKNOWN');
    const group = type === 'DM' ? 'DMs' : type === 'GROUP_DM' ? 'Group DMs' : 'Servers';
    let guild = meta.guild || null, guildId = guild?.id ? String(guild.id) : null;
    const label = String(index[cid] || '');
    if (group === 'Servers' && !guild && label.startsWith('Unknown channel in ')) guild = {name: label.slice('Unknown channel in '.length)};
    const name = meta.name || label.replace(/^Direct Message with /, '').replace(/#0$/, '') || (group === 'DMs' ? 'Unknown DM' : `${type} ${cid}`);
    const ci = channels.length;
    channels.push({id: cid, name, type, group, guild: guild?.name || '', guildId, contextKey: guildId || (guild ? 'name:' + guild.name : null), current: guildId ? guildId in serverIndex : false});
    for (const r of rows) {
      const id = String(r.ID ?? r.id ?? '');
      if (id && seen.has(id)) { duplicates++; continue; }
      if (id) seen.add(id);
      const stamped = parseTimestamp(r.Timestamp ?? r.timestamp);
      const flake = snowflakeTime(id);
      if (Number.isFinite(stamped) && Number.isFinite(flake) && Math.abs(stamped - flake) >= 1000) mismatches++;
      const t = Number.isFinite(flake) ? flake : stamped;
      if (!Number.isFinite(t)) { errors.push([dir, 'unreadable timestamp ' + (r.Timestamp ?? '')]); continue; }
      ts.push(t); ch.push(ci); ids.push(id);
      text.push(String(r.Contents ?? r.contents ?? ''));
      const a = String(r.Attachments ?? r.attachments ?? '');
      att.push(a ? (a.match(URL_RE) || ['']).length : 0);
    }
  }
  progress('Reading messages', dirs.length, dirs.length);
  if (!ts.length) throw new Error('The package contains no messages.');
  return {channels, ts, ch, text, ids, att, serverIndex, user,
    validation: {duplicateIds: duplicates, parseErrors: errors.slice(0, 50), parseErrorCount: errors.length, snowflakeMismatches: mismatches, messageFiles, channelFolders: dirs.length, indexedChannels: Object.keys(index).length, sections, archiveFiles: archive.names.length, archiveBytes: archive.bytes, currentServers: Object.keys(serverIndex).length}};
}

/* ---------- saved copy and incremental updates ---------- */
// The parsed messages live in IndexedDB so the report survives reloads; aggregates are cheap to recompute.
// The database keeps the project's original name so copies saved before the rename still load.
const DB_NAME = 'discord-unwrapped', DB_KEY = 'package';
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not save in this browser.')); };
    };
  });
}
function setStore(p) {
  const ts = Float64Array.from(p.ts);
  STORE = {...p, ts, ch: Int32Array.from(p.ch), att: Uint16Array.from(p.att), order: Uint32Array.from({length: ts.length}, (_, i) => i).sort((a, b) => ts[a] - ts[b]), cache: null};
}
const latest = () => { let m = -Infinity; for (const t of STORE.ts) if (t > m) m = t; return m; };
function meta() { return {messages: STORE.ts.length, cutoff: new Date(latest()).toISOString(), history: STORE.history || []}; }
async function save() {
  progress('Saving in this browser', 0, 1);
  const {order, cache, ...rest} = STORE;
  await idb('readwrite', kv => kv.put(rest, DB_KEY));
}
async function restore() {
  const saved = await idb('readonly', kv => kv.get(DB_KEY)).catch(() => null);
  if (!saved) return null;
  setStore(saved);
  return meta();
}
async function load(source) {
  setStore(await parsePackage(source));
  STORE.history = [{at: Date.now(), kind: 'load', added: STORE.ts.length, latest: new Date(latest()).toISOString()}];
  await save();
  return meta();
}
// Keeps everything already saved and appends only messages newer than the saved copy's last message.
async function update(source) {
  const p = await parsePackage(source), S = STORE, cutoff = latest();
  const seen = new Set(S.ids), byId = new Map(S.channels.map((c, i) => [c.id, i]));
  const ts = Array.from(S.ts), ch = Array.from(S.ch), att = Array.from(S.att);
  let added = 0, newChannels = 0;
  const slot = new Map();
  for (let k = 0; k < p.ts.length; k++) {
    if (p.ts[k] <= cutoff || (p.ids[k] && seen.has(p.ids[k]))) continue;
    const c = p.channels[p.ch[k]];
    if (!slot.has(p.ch[k])) {
      if (byId.has(c.id)) {
        const i = byId.get(c.id), old = S.channels[i];
        // Newer packages sometimes drop server details for old channels; keep the richer record.
        S.channels[i] = c.guildId || !old.guildId ? {...old, ...c} : {...old, current: c.current};
        slot.set(p.ch[k], i);
      } else { slot.set(p.ch[k], S.channels.length); S.channels.push(c); newChannels++; }
    }
    ts.push(p.ts[k]); ch.push(slot.get(p.ch[k])); S.text.push(p.text[k]); S.ids.push(p.ids[k]); att.push(p.att[k]);
    added++;
  }
  if (added) {
    setStore({...S, ts, ch, att, serverIndex: p.serverIndex, user: p.user || S.user, validation: p.validation});
  }
  STORE.history = [...(S.history || []), {at: Date.now(), kind: 'update', added, newChannels, cutoff: new Date(cutoff).toISOString(), latest: new Date(latest()).toISOString()}];
  await save();
  return {...meta(), added, newChannels};
}

/* ---------- aggregation ---------- */
function localClock(tz) {
  const f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'});
  const cache = new Map();
  return t => {
    const k = Math.floor(t / 3600000);
    let off = cache.get(k);
    if (off === undefined) {
      const p = {}; for (const x of f.formatToParts(new Date(k * 3600000))) p[x.type] = +x.value;
      off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - k * 3600000;
      cache.set(k, off);
    }
    return t + off;
  };
}
const iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const inc = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v);
const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k);
const cleanText = s => s.replace(URL_RE, ' ').replace(MARKUP_RE, ' ');

function topicMatchers(groups) {
  return groups.map(g => {
    const terms = g.terms.map(t => t.trim()).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*$/, '[\\p{L}\\p{N}]*').replace(/ /g, '\\s*'));
    return {name: g.name, re: terms.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.join('|')})(?![\\p{L}\\p{N}_])`, 'iu') : null};
  });
}

// Bucket keys sort as strings in time order. Weeks start on Monday and are keyed by that date.
function keyOf(unit, L) {
  const s = new Date(L).toISOString();
  if (unit === 'year') return s.slice(0, 4);
  if (unit === 'month') return s.slice(0, 7);
  if (unit === 'day') return s.slice(0, 10);
  if (unit === 'hour') return s.slice(0, 13);
  const d = Math.floor(L / DAY);
  return iso(d - (new Date(d * DAY).getUTCDay() + 6) % 7);
}
const FINER = {year: 'month', month: 'day', week: 'day', day: 'hour'};
// Pick the bucket size that gives the period's charts roughly 4 to 24 bars.
const unitFor = days => days > 731 ? 'year' : days > 92 ? 'month' : days > 14 ? 'week' : 'day';
const blankBucket = () => ({total: 0, Servers: 0, DMs: 0, 'Group DMs': 0, words: 0, chars: 0, links: 0, attachments: 0, activeDays: 0, calendarDays: 0});

// Tokens depend only on the messages, and local times only on the time zone, so both survive range changes.
function prepare(tz) {
  const S = STORE, n = S.ts.length;
  let C = S.cache;
  if (!C) {
    const tokensOf = new Array(n), lens = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      if (i % 20000 === 0) progress('Reading words', i, n);
      tokensOf[i] = foldQuotes(cleanText(S.text[i]).toLowerCase()).match(WORD_RE) || [];
      lens[i] = codePoints(S.text[i]);
    }
    C = S.cache = {tokensOf, lens};
  }
  if (C.tz !== tz) {
    const clock = localClock(tz), local = new Float64Array(n), dayOf = new Int32Array(n);
    let first = Infinity, last = -Infinity;
    for (let i = 0; i < n; i++) {
      const L = local[i] = clock(S.ts[i]), d = dayOf[i] = Math.floor(L / DAY);
      if (d < first) first = d; if (d > last) last = d;
    }
    Object.assign(C, {tz, clock, local, dayOf, first, last});
  }
  return C;
}

function aggregate({tz, topics, range}) {
  const S = STORE, C = prepare(tz), clock = C.clock, {local, dayOf, tokensOf, lens} = C;
  const matchers = topicMatchers(topics);
  const bounds = {first: iso(C.first), last: iso(C.last)};
  const from = Math.max(C.first, range?.from ? Date.parse(range.from) / DAY : -Infinity), to = Math.min(C.last, range?.to ? Date.parse(range.to) / DAY : Infinity);
  // Messages in the period, oldest first.
  const sel = S.order.filter(i => dayOf[i] >= from && dayOf[i] <= to), n = sel.length;
  C.view = {from, to, unit: unitFor(to - from + 1), sel};
  if (!n) return {tz, user: S.user, bounds, range: {from: iso(from), to: iso(to)}, empty: true, validation: S.validation};
  const unit = C.view.unit, fineUnit = FINER[unit];
  const chStats = S.channels.map(() => ({count: 0, words: 0, attachments: 0, links: 0, first: Infinity, last: -Infinity, periods: {}}));
  const periods = {}, fine = {}, days = new Map(), hourly = Array(24).fill(0), weekdays = Array(7).fill(0), heat = Array.from({length: 7}, () => Array(24).fill(0));
  // Every bucket in the period appears on the time axis, including ones without messages.
  for (let d = from; d <= to; d++) {
    (periods[keyOf(unit, d * DAY)] ||= blankBucket()).calendarDays++;
    if (fineUnit === 'hour') for (let h = 0; h < 24; h++) fine[keyOf('hour', d * DAY + h * 3600000)] ||= {total: 0, Servers: 0, DMs: 0, 'Group DMs': 0};
    else fine[keyOf(fineUnit, d * DAY)] ||= {total: 0, Servers: 0, DMs: 0, 'Group DMs': 0};
  }
  // The first and last buckets can be cut off by the period or by the data.
  periods[keyOf(unit, from * DAY)].partial = keyOf(unit, (from - 1) * DAY) === keyOf(unit, from * DAY);
  periods[keyOf(unit, to * DAY)].partial ||= keyOf(unit, (to + 1) * DAY) === keyOf(unit, to * DAY);
  const words = new Map(), wordPeriods = {}, allFreq = new Map(), expressions = new Map(), emoji = new Map(), domains = new Map(), domainPeriods = {};
  const topicPeriods = {}, topicTotals = Object.fromEntries(matchers.map(m => [m.name, 0]));
  const lengths = Array(9).fill(0), LEN_EDGES = [5, 10, 20, 40, 80, 160, 320, 640];
  let totalWords = 0, chars = 0, urlMessages = 0, urls = 0, attachmentMessages = 0, attachmentLinks = 0, blank = 0, questions = 0, code = 0, commands = 0, short = 0;
  let longest = -1, longestLen = 0;
  for (let k = 0; k < n; k++) {
    if (k % 20000 === 0) progress('Counting', k, n);
    const i = sel[k], L = local[i], d = dayOf[i], date = new Date(L), y = keyOf(unit, L);
    const h = date.getUTCHours(), wd = (date.getUTCDay() + 6) % 7;
    const c = S.channels[S.ch[i]], cs = chStats[S.ch[i]], txt = S.text[i];
    const Y = periods[y], F = fine[keyOf(fineUnit, L)];
    Y.total++; Y[c.group]++; F.total++; F[c.group]++;
    inc(days, d); hourly[h]++; weekdays[wd]++; heat[wd][h]++;
    cs.count++; cs.periods[y] = (cs.periods[y] || 0) + 1; if (d < cs.first) cs.first = d; if (d > cs.last) cs.last = d;
    const toks = tokensOf[i], len = lens[i];
    totalWords += toks.length; cs.words += toks.length; Y.words += toks.length; Y.chars += len; chars += len;
    if (len > longestLen && !/https?:\/\//.test(txt)) { longestLen = len; longest = i; }
    let b = 0; while (b < LEN_EDGES.length && len > LEN_EDGES[b]) b++; if (len) lengths[b]++;
    const wy = wordPeriods[y] ||= new Map();
    for (const w of toks) {
      inc(allFreq, w);
      if (w.length > 2 && !STOP.has(w)) { inc(words, w); inc(wy, w); }
    }
    const trimmed = txt.trim();
    const tl = codePoints(trimmed);
    if (tl > 0 && tl <= 40 && !txt.includes('\n') && !/https?:\/\/[^\s<>]/.test(txt) && !/<[@#]/.test(txt)) inc(expressions, foldQuotes(trimmed.toLowerCase()));
    for (const m of txt.matchAll(EMOJI_RE)) inc(emoji, m[1]);
    let hosts = 0;
    for (const u of txt.match(LINK_RE) || []) {
      const host = hostOf(u);
      if (host) { hosts++; inc(domains, host); inc(domainPeriods[y] ||= new Map(), host); }
    }
    if (hosts) { urlMessages++; cs.links++; Y.links++; urls += hosts; }
    if (S.att[i]) { attachmentMessages++; cs.attachments++; Y.attachments++; attachmentLinks += S.att[i]; }
    if (!trimmed) blank++;
    if (txt.includes('?')) questions++;
    if (txt.includes('```')) code++;
    if (/^[/!][\w-]+/.test(txt)) commands++;
    if (len <= 20) short++;
    if (matchers.some(m => m.re)) {
      const clean = cleanText(txt);
      for (const m of matchers) if (m.re && m.re.test(clean)) { topicTotals[m.name]++; const tp = topicPeriods[y] ||= {}; tp[m.name] = (tp[m.name] || 0) + 1; }
    }
  }
  progress('Finding patterns', 0, 1);
  const dayList = [...days.keys()].sort((a, b) => a - b), first = dayList[0], last = dayList.at(-1);
  for (const d of dayList) periods[keyOf(unit, d * DAY)].activeDays++;
  const streaks = [], gaps = [];
  let s0 = first, prev = first;
  for (const d of dayList.slice(1)) {
    if (d - prev !== 1) { streaks.push([prev - s0 + 1, iso(s0), iso(prev)]); gaps.push([d - prev - 1, iso(prev), iso(d)]); s0 = d; }
    prev = d;
  }
  streaks.push([prev - s0 + 1, iso(s0), iso(prev)]);
  streaks.sort((a, b) => b[0] - a[0]); gaps.sort((a, b) => b[0] - a[0]);

  // Bursts and sessions follow chronological order.
  let within60 = 0, sameChannel60 = 0, sessions = [], sStart = S.ts[sel[0]], sPrev = sStart, sCount = 0, best = {count: 0};
  for (let k = 0, lo = 0; k < n; k++) {
    const i = sel[k], t = S.ts[i];
    if (k) { const j = sel[k - 1]; if (t - S.ts[j] <= 60000) { within60++; if (S.ch[i] === S.ch[j]) sameChannel60++; } }
    if (t - sPrev > 1800000) { sessions.push([sCount, (sPrev - sStart) / 60000, sStart]); sStart = t; sCount = 0; }
    sCount++; sPrev = t;
    while (t - S.ts[sel[lo]] > 60000) lo++;
    if (k - lo + 1 > best.count) best = {count: k - lo + 1, start: S.ts[sel[lo]], channel: S.ch[i]};
  }
  sessions.push([sCount, (sPrev - sStart) / 60000, sStart]);
  const sessionSizes = sessions.map(s => s[0]).sort((a, b) => a - b);

  const peakDays = top(days, 12).map(([d, count]) => ({date: iso(d), day: d, count, contexts: new Map(), texts: new Map()}));
  const peakByDay = new Map(peakDays.map(p => [p.day, p]));
  const repeated = new Map();
  for (const i of sel) {
    const p = peakByDay.get(dayOf[i]);
    if (p) { const c = S.channels[S.ch[i]]; inc(p.contexts, c.guild || c.group); inc(p.texts, S.text[i].trim().toLowerCase()); }
    const t = S.text[i].trim();
    if (t.length >= 2) inc(repeated, t.toLowerCase());
  }
  for (const p of peakDays) { p.contexts = top(p.contexts, 4); p.topText = top(p.texts, 1)[0] || ['', 0]; delete p.texts; }

  const guilds = new Map();
  S.channels.forEach((c, i) => {
    if (!c.contextKey) return;
    const g = guilds.get(c.contextKey) || {name: c.guild, identified: !!c.guildId, current: c.current, count: 0, channels: 0, periods: {}};
    const cs = chStats[i]; if (cs.count) g.channels++; g.count += cs.count;
    for (const y in cs.periods) g.periods[y] = (g.periods[y] || 0) + cs.periods[y];
    guilds.set(c.contextKey, g);
  });
  const channels = S.channels.map((c, i) => {
    const cs = chStats[i];
    return {i, id: c.id, name: c.name, guild: c.guild, guildId: c.guildId, type: c.type, group: c.group, count: cs.count, words: cs.words, attachments: cs.attachments, links: cs.links, first: cs.count ? iso(cs.first) : '', last: cs.count ? iso(cs.last) : '', periods: cs.periods};
  }).filter(c => c.count).sort((a, b) => b.count - a.count);

  // Keep word frequencies for the roast candidate scorer.
  Object.assign(C, {allFreq, totalTokens: totalWords});
  const msgRef = i => i < 0 ? null : messageRef(i);
  const mostRepeated = top(repeated, 1)[0];
  const sortObj = o => Object.fromEntries(Object.entries(o).sort());
  return {
    tz, user: S.user, bounds, range: {from: iso(from), to: iso(to)}, unit, fineUnit,
    totals: {messages: n, words: totalWords, characters: chars, channels: channels.length, servers: [...guilds.values()].filter(g => g.count).length, first: iso(first), last: iso(last), calendarDays: to - from + 1, activeDays: dayList.length,
      attachmentMessages, attachmentLinks, urlMessages, urls, distinctDomains: domains.size, blankMessages: blank, questionMessages: questions, codeBlockMessages: code, commandLikeMessages: commands, shortMessages: short,
      medianChars: median(sel.map(i => lens[i])), lateNight: hourly.slice(0, 6).reduce((a, b) => a + b, 0)},
    validation: S.validation,
    periods: sortObj(periods), fine: sortObj(fine), days: dayList.map(d => [d, days.get(d)]), hourly, weekdays, heat,
    lengths: lengths.map((v, i) => [i === 0 ? '1–5' : i === LEN_EDGES.length ? `${LEN_EDGES.at(-1) + 1}+` : `${LEN_EDGES[i - 1] + 1}–${LEN_EDGES[i]}`, v]),
    guilds: [...guilds.values()].filter(g => g.count).sort((a, b) => b.count - a.count),
    channels,
    domains: top(domains, 100), domainPeriods: Object.fromEntries(Object.entries(domainPeriods).map(([y, m]) => [y, top(m, 25)])),
    words: top(words, 150), wordPeriods: Object.fromEntries(Object.entries(wordPeriods).map(([y, m]) => [y, top(m, 40)])),
    expressions: top(expressions, 60), emoji: top(emoji, 30),
    topics: topicTotals, topicPeriods,
    streaks: streaks.slice(0, 10), gaps: gaps.slice(0, 10), peakDays,
    bursts: {within60, sameChannel60, sessions: sessions.length, medianSession: sessionSizes[sessionSizes.length >> 1], largestSessions: sessions.sort((a, b) => b[0] - a[0]).slice(0, 5).map(([c, mins, t]) => [c, Math.round(mins), toISOStringLocal(clock(t))]), bestMinute: {count: best.count, at: toISOStringLocal(clock(best.start)), channel: S.channels[best.channel]?.name}},
    fame: {first: msgRef(sel[0]), last: msgRef(sel[n - 1]), longest: msgRef(longest), mostRepeated: mostRepeated ? {text: mostRepeated[0], count: mostRepeated[1]} : null},
  };
}
function median(a) { const s = Array.from(a).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }
function toISOStringLocal(L) { return new Date(L).toISOString().slice(0, 16).replace('T', ' '); }
function messageRef(i) {
  const S = STORE, c = S.channels[S.ch[i]];
  return {i, id: S.ids[i], text: S.text[i], at: S.cache ? toISOStringLocal(S.cache.local[i]) : new Date(S.ts[i]).toISOString(), channel: c.name, guild: c.guild, group: c.group,
    url: S.ids[i] && (c.guildId || c.group !== 'Servers') ? `https://discord.com/channels/${c.guildId || '@me'}/${c.id}/${S.ids[i]}` : null};
}

/* ---------- search ---------- */
function search({query, wholeWord, limit = 150}) {
  const S = STORE, C = S.cache, {sel, unit} = C.view, fineUnit = FINER[unit];
  const q = query.trim();
  if (!q) return {query, total: 0, periods: {}, fine: {}, channels: [], results: []};
  // Either apostrophe in the query matches both kinds in messages.
  const body = foldQuotes(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’‘]");
  const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body, 'iu');
  const periods = {}, fine = {}, chans = new Map(), hits = [];
  for (const i of sel) {
    if (!re.test(S.text[i])) continue;
    hits.push(i);
    inc2(periods, keyOf(unit, C.local[i])); inc2(fine, keyOf(fineUnit, C.local[i])); inc(chans, S.ch[i]);
  }
  const step = Math.max(1, Math.floor(hits.length / limit));
  const sample = hits.length <= limit ? hits : hits.filter((_, k) => k % step === 0).slice(0, limit);
  return {query: q, wholeWord, total: hits.length, periods, fine, channels: top(chans, 8).map(([c, v]) => [S.channels[c].name + (S.channels[c].guild ? ' · ' + S.channels[c].guild : ''), v]),
    first: hits.length ? messageRef(hits[0]) : null, results: sample.reverse().map(messageRef)};
}
const inc2 = (o, k) => o[k] = (o[k] || 0) + 1;

/* ---------- roast candidates (no inference) ---------- */
function candidates({seed = 1, count = 30}) {
  const S = STORE, C = S.cache, N = C.totalTokens;
  const scored = [];
  for (const i of C.view.sel) {
    const len = C.lens[i];
    if (len < 30 || len > 600) continue;
    const t = S.text[i];
    // Skip links, mentions, code and pasted or quoted text; the roast wants things you typed.
    if (/https?:\/\/|`|<[@#:]|^>|"[^"]{40,}"|“[^”]{40,}”/.test(t) || (t.match(/\n/g) || []).length > 2) continue;
    const toks = C.tokensOf[i];
    if (toks.length < 6) continue;
    const distinct = new Set(toks); let rare = 0, info = 0;
    for (const w of distinct) { const f = C.allFreq.get(w) || 1; info += Math.min(14, Math.log2(N / f)); if (f <= 3 && w.length > 3) rare++; }
    const score = info / Math.sqrt(toks.length + 4) + rare * 1.5 + (/[!?]{2,}/.test(t) ? 1 : 0);
    scored.push([score, i, rare]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  // Spread picks across channels and days, then sample from the strongest pool.
  const perBucket = new Map(), pool = [];
  for (const [score, i, rare] of scored) {
    const key = S.ch[i] + ':' + Math.floor(C.local[i] / DAY);
    if ((perBucket.get(key) || 0) >= 1) continue;
    perBucket.set(key, 1); pool.push([score, i, rare]);
    if (pool.length >= 400) break;
  }
  let x = seed * 2654435761 % 4294967296 || 1;
  const rand = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const picked = [];
  const taken = new Set();
  while (picked.length < Math.min(count, pool.length)) {
    const k = Math.floor(Math.pow(rand(), 2.2) * pool.length);
    if (taken.has(k)) continue;
    taken.add(k); picked.push(pool[k]);
  }
  return picked.map(([score, i, rare]) => ({...messageRef(i), score: +score.toFixed(1), rare, followup: followup(i)}));
}
function followup(i) {
  const S = STORE;
  const k = S.order.indexOf(i);
  for (let j = k + 1; j < S.order.length; j++) {
    const o = S.order[j];
    if (S.ts[o] - S.ts[i] > 300000) break;
    if (S.ch[o] === S.ch[i] && S.text[o].trim()) return {text: S.text[o], seconds: Math.round((S.ts[o] - S.ts[i]) / 1000)};
  }
  return null;
}

self.onmessage = async e => {
  const {type, id, payload} = e.data;
  try {
    let result;
    if (type === 'load') result = await load(payload);
    else if (type === 'restore') result = await restore();
    else if (type === 'update') result = await update(payload);
    else if (type === 'forget') { STORE = null; result = await idb('readwrite', kv => kv.delete(DB_KEY)); }
    else if (type === 'bounds') { const C = prepare(payload.tz); result = {first: iso(C.first), last: iso(C.last)}; }
    else if (type === 'aggregate') result = aggregate(payload);
    else if (type === 'search') result = search(payload);
    else if (type === 'candidates') result = candidates(payload);
    send({type: 'result', id, result});
  } catch (err) {
    send({type: 'error', id, message: err?.message || String(err)});
  }
};
