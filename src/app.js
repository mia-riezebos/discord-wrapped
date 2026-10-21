/* Page logic: hand the package to the worker, then draw every view from the returned aggregates. */
const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString();
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '–';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const COLORS = [1, 2, 3, 4, 5].map(n => `var(--c${n})`);
const GROUPS = ['Servers', 'DMs', 'Group DMs'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY = 86400000;
const longDate = s => new Date(s.length > 10 ? s.replace(' ', 'T') + 'Z' : s + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'});
const DEFAULT_TOPICS = `Music: music, song, songs, track, tracks, album, synth, synths, ableton, fl studio, soundcloud, spotify, mixing, mastering, melody, chord, chords, producer, producing
Code: code, coding, github, typescript, javascript, react, api, docker, programming, software, linux, database, backend, frontend, rust, python, git, css, html
Games: game, games, gaming, minecraft, steam, valorant, fortnite, league, roblox, playing, xbox, playstation, nintendo, switch
AI: chatgpt, claude, codex, copilot, llm, llms, openai, anthropic, cursor, gpt, gemini, agent, agents
School & work: school, class, exam, exams, homework, teacher, university, uni, college, work, job, boss, meeting, shift`;

/* ---------- worker bridge ---------- */
let worker, nextId = 1;
const pending = new Map();
function startWorker() {
  const src = $('worker-src').textContent;
  const onMessage = ({data}) => {
    if (data.type === 'progress') return showProgress(data);
    const p = pending.get(data.id); if (!p) return;
    pending.delete(data.id);
    data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data.result);
  };
  try {
    worker = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
    worker.onmessage = onMessage;
  } catch {
    // Some browsers refuse blob workers on file:// pages; run the same code on the main thread instead.
    const scope = {postMessage: d => setTimeout(() => onMessage({data: d}))};
    new Function('self', src)(scope);
    worker = {postMessage: d => setTimeout(() => scope.onmessage({data: d}))};
  }
}
const call = (type, payload) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, {resolve, reject}); worker.postMessage({type, id, payload}); });

/* ---------- loading ---------- */
function showProgress({phase, done, total}) {
  $(D ? 'notice' : 'status').innerHTML = `<div>${esc(phase)}… ${total > 1 ? fmt(done) + ' / ' + fmt(total) : ''}</div><div class="bar"><span style="width:${total ? 100 * done / total : 0}%"></span></div>`;
}
let saved = null;
async function show(info) {
  saved = info; reports.clear();
  await analyse();
  $('landing').classList.add('hidden'); $('report').classList.remove('hidden'); document.body.classList.add('has-report');
  window.scrollTo(0, 0); renderAll(); savedNotice();
}
async function open(source) {
  $('status').innerHTML = '<div>Opening package…</div>';
  try {
    await show(await call('load', source));
    navigator.storage?.persist?.();
  } catch (e) {
    $('status').innerHTML = `<p class="error">Couldn't open this package: ${esc(e.message)}</p>`;
  }
}
async function updatePackage(source) {
  const before = saved.cutoff;
  $('notice').innerHTML = '<div>Opening the new package…</div>';
  try {
    const r = await call('update', source);
    await show(r);
    $('notice').innerHTML = r.added
      ? `<p><strong>Added ${fmt(r.added)} new messages</strong> sent after ${esc(stamp(before))}${r.newChannels ? `. Added ${fmt(r.newChannels)} new channels` : ''}. Your earlier messages are still saved.</p>`
      : `<p><strong>No new messages.</strong> This package has no messages after ${esc(stamp(before))}.</p>`;
  } catch (e) {
    $('notice').innerHTML = `<p class="error">Couldn't update the report: ${esc(e.message)}</p>`;
  }
}
const stamp = isoString => new Date(isoString).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
function savedNotice() {
  const h = saved?.history || [], updates = h.filter(x => x.kind === 'update' && x.added);
  $('notice').innerHTML = `<p class="muted">Saved in this browser · messages up to ${esc(stamp(saved.cutoff))}${updates.length ? ` · updated ${updates.length} time${updates.length > 1 ? 's' : ''}, last on ${esc(stamp(updates.at(-1).at))}` : ''}</p>`;
}
let D = null, topicsText = localStorage.getItem('du-topics') || DEFAULT_TOPICS;
const parseTopics = text => text.split('\n').map(l => l.split(':')).filter(p => p.length > 1 && p[0].trim()).slice(0, 5).map(([name, ...rest]) => ({name: name.trim(), terms: rest.join(':').split(',').map(t => t.trim().toLowerCase()).filter(Boolean)}));
async function analyse() {
  const tz = $('tz').value;
  localStorage.setItem('du-tz', tz); localStorage.setItem('du-topics', topicsText);
  const r = resolvePeriod(period, await call('bounds', {tz})), key = [tz, topicsText, r.from, r.to].join('|');
  // Reports are cached per period, so stepping back to one you've seen is instant. The worker only switches its view.
  if (reports.has(key)) { D = reports.get(key); reports.delete(key); await call('view', {tz, range: {from: r.from, to: r.to}}); }
  else D = await call('aggregate', {tz, topics: parseTopics(topicsText), range: {from: r.from, to: r.to}});
  reports.set(key, D);
  if (reports.size > 24) reports.delete(reports.keys().next().value);
}
// Cached reports, oldest first. A new or updated package clears them.
const reports = new Map();

// The "Your data" menu closes on outside clicks and after picking an action.
document.addEventListener('click', e => {
  const menu = $('data-menu');
  if (menu.open && (!menu.contains(e.target) || e.target.closest('button'))) menu.open = false;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('data-menu').open = false; });
$('pick-update').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) updatePackage({kind: 'zip', file: f}); });
$('pick-zip').addEventListener('change', e => { const f = e.target.files[0]; if (f) open({kind: 'zip', file: f}); });
$('pick-folder').addEventListener('change', e => { const files = [...e.target.files].map(f => ({path: f.webkitRelativePath || f.name, file: f})); if (files.length) open({kind: 'folder', files}); });
const drop = $('drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', async e => {
  const item = [...e.dataTransfer.items].find(i => i.kind === 'file');
  const entry = item?.webkitGetAsEntry?.();
  if (entry?.isDirectory) open({kind: 'folder', files: await readTree(entry)});
  else if (e.dataTransfer.files[0]) open({kind: 'zip', file: e.dataTransfer.files[0]});
});
async function readTree(root) {
  const out = [];
  const walk = async (entry, path) => {
    if (entry.isFile) { out.push({path: path + entry.name, file: await new Promise((res, rej) => entry.file(res, rej))}); return; }
    const reader = entry.createReader();
    for (let batch; (batch = await new Promise((res, rej) => reader.readEntries(res, rej))).length;) for (const child of batch) await walk(child, path + entry.name + '/');
  };
  await walk(root, '');
  return out;
}

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = (Intl.supportedValuesOf?.('timeZone') || [localTz]);
$('tz').innerHTML = [...new Set([localTz, 'UTC', ...zones])].map(z => `<option>${esc(z)}</option>`).join('');
$('tz').value = zones.includes(localStorage.getItem('du-tz')) || localStorage.getItem('du-tz') === 'UTC' ? localStorage.getItem('du-tz') : localTz;
$('tz').addEventListener('change', async () => { document.body.style.cursor = 'progress'; await analyse(); document.body.style.cursor = ''; renderAll(); });
$('reset').addEventListener('click', async () => {
  if (!confirm('Remove the saved messages and report from this browser? You can open package.zip again later.')) return;
  await call('forget'); localStorage.removeItem('du-topics'); location.reload();
});
$('export').addEventListener('click', () => {
  // The summary keeps counts and labels only; message text is left out.
  const {fame, peakDays, expressions, ...rest} = D;
  const blob = new Blob([JSON.stringify({...rest, peakDays: peakDays.map(({topText, ...p}) => p)}, null, 2)], {type: 'application/json'});
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'discord-summary.json'});
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- report period ---------- */
// The report covers one period: a week, month or year stepped with Previous and Next, everything, or a custom range.
// Dates are local calendar days written as YYYY-MM-DD and handled as UTC midnights.
const dayNum = s => Date.parse(s + 'T00:00:00Z') / DAY;
const isoDay = d => new Date(d * DAY).toISOString().slice(0, 10);
const dateText = (s, opts = {day: 'numeric', month: 'long', year: 'numeric'}) => new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', ...opts});
let period = JSON.parse(localStorage.getItem('du-period') || 'null') || {kind: 'year'};
function resolvePeriod(p, bounds) {
  const anchor = Math.min(dayNum(bounds.last), Math.max(dayNum(bounds.first), p.anchor ? dayNum(p.anchor) : Infinity)), a = new Date(anchor * DAY);
  const y = a.getUTCFullYear(), m = a.getUTCMonth();
  if (p.kind === 'year') return {kind: 'year', from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), in: `in ${y}`};
  if (p.kind === 'month') {
    const from = isoDay(Date.UTC(y, m, 1) / DAY), to = isoDay(Date.UTC(y, m + 1, 0) / DAY), label = dateText(from, {month: 'long', year: 'numeric'});
    return {kind: 'month', from, to, label, in: `in ${label}`};
  }
  if (p.kind === 'week') {
    const mon = anchor - (a.getUTCDay() + 6) % 7, from = isoDay(mon), label = `the week of ${dateText(from)}`;
    return {kind: 'week', from, to: isoDay(mon + 6), label, in: `in ${label}`};
  }
  if (p.kind === 'custom' && p.from && p.to && p.from <= p.to) {
    const label = `${dateText(p.from, {day: 'numeric', month: 'short', year: 'numeric'})} – ${dateText(p.to, {day: 'numeric', month: 'short', year: 'numeric'})}`;
    return {kind: 'custom', from: p.from, to: p.to, label, in: `between ${dateText(p.from, {day: 'numeric', month: 'short', year: 'numeric'})} and ${dateText(p.to, {day: 'numeric', month: 'short', year: 'numeric'})}`};
  }
  const since = bounds.first.slice(0, 4);
  return {kind: 'all', from: bounds.first, to: bounds.last, label: `since ${since}`, in: `since ${since}`};
}
// The same period length, one step earlier or later, anchored on its first day.
function stepPeriod(dir) {
  const r = resolvePeriod(period, D.bounds), d = new Date(r.from + 'T00:00:00Z');
  if (r.kind === 'year') d.setUTCFullYear(d.getUTCFullYear() + dir);
  else if (r.kind === 'month') d.setUTCMonth(d.getUTCMonth() + dir);
  else d.setUTCDate(d.getUTCDate() + 7 * dir);
  return {kind: r.kind, anchor: d.toISOString().slice(0, 10)};
}
// A step is possible while the next period still overlaps the messages.
const ANY = {first: '0000-01-01', last: '9999-12-31'};
function canStep(dir) {
  const r = resolvePeriod(stepPeriod(dir), ANY);
  return r.to >= D.bounds.first && r.from <= D.bounds.last;
}
const shortLabel = r => r.kind === 'year' ? r.label : r.kind === 'month' ? dateText(r.from, {month: 'short', year: 'numeric'}) : dateText(r.from, {day: 'numeric', month: 'short'});
let P = null;
function periodControls() {
  P = resolvePeriod(period, D.bounds);
  const stepping = ['year', 'month', 'week'].includes(P.kind), unit = {year: 'year', month: 'month', week: 'week'}[P.kind];
  document.querySelectorAll('#period input[name=pkind]').forEach(r => r.checked = r.value === P.kind);
  $('p-prev').hidden = $('p-next').hidden = !stepping; $('p-custom').hidden = P.kind !== 'custom';
  $('p-label').textContent = P.kind === 'week' ? `Week of ${dateText(P.from)}` : P.kind === 'all' ? `${dateText(D.bounds.first)} – ${dateText(D.bounds.last)}` : P.label;
  if (stepping) {
    for (const [id, dir] of [['p-prev', -1], ['p-next', 1]]) {
      const b = $(id), ok = canStep(dir), target = resolvePeriod(stepPeriod(dir), ANY);
      b.disabled = !ok;
      b.querySelector('.t').textContent = shortLabel(target);
      b.setAttribute('aria-label', `${dir < 0 ? 'Previous' : 'Next'} ${unit}: ${target.kind === 'week' ? 'week of ' + dateText(target.from) : target.label}`);
    }
  }
  // Reels exist for a year or All time only.
  $('p-play').hidden = !!D.empty || !['year', 'all'].includes(P.kind);
  $('p-play').textContent = `Play ${reelTitle()}`;
  $('p-from').min = $('p-to').min = D.bounds.first; $('p-from').max = $('p-to').max = D.bounds.last;
  // Leave a date alone while someone is typing in it.
  if (P.kind === 'custom') for (const [id, v] of [['p-from', P.from], ['p-to', P.to]]) if (document.activeElement !== $(id)) $(id).value = v;
}
async function setPeriod(p) {
  period = p; localStorage.setItem('du-period', JSON.stringify(p));
  document.body.style.cursor = 'progress'; $('period').setAttribute('aria-busy', 'true');
  await analyse();
  document.body.style.cursor = ''; $('period').removeAttribute('aria-busy');
  renderAll();
}
$('period').addEventListener('change', e => {
  if (e.target.name === 'pkind') {
    const k = e.target.value, cur = resolvePeriod(period, D.bounds);
    // Switching length keeps the newest part of the current period in view.
    const anchor = cur.to < D.bounds.last ? cur.to : D.bounds.last;
    if (k === 'custom') setPeriod({kind: 'custom', from: cur.from < D.bounds.first ? D.bounds.first : cur.from, to: anchor});
    else setPeriod({kind: k, anchor});
  } else if (e.target.id === 'p-from' || e.target.id === 'p-to') {
    const from = $('p-from').value, to = $('p-to').value;
    if (from && to && from <= to) setPeriod({kind: 'custom', from, to});
  }
});
const reelTitle = () => P.kind === 'all' ? 'All time' : P.label;
// No "Share this" until a story can share its own card (#29).
$('p-play').onclick = e => openReel({stories: buildStories(D, P), theme: KINETIC, title: reelTitle(), ending: P.kind === 'all' ? `That was you on Discord ${P.label}` : `That was your ${P.label}`, opener: e.currentTarget});
$('p-prev').onclick = () => setPeriod(stepPeriod(-1));
$('p-next').onclick = () => setPeriod(stepPeriod(1));
// Bucket keys from the worker: YYYY, YYYY-MM, a week's Monday or a day as YYYY-MM-DD, or YYYY-MM-DDTHH.
function bucketName(key, unit, long = false) {
  if (unit === 'year') return key;
  if (unit === 'month') return dateText(key + '-01', long ? {month: 'long', year: 'numeric'} : P.kind === 'year' ? {month: 'short'} : {month: 'short', year: '2-digit'});
  if (unit === 'week') return (long ? 'the week of ' : '') + dateText(key, {day: 'numeric', month: 'short', ...(long ? {year: 'numeric'} : {})});
  if (unit === 'day') return dateText(key, long ? {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'} : P.kind === 'week' ? {weekday: 'short', day: 'numeric'} : {day: 'numeric', month: 'short'});
  return dateText(key.slice(0, 10), {weekday: 'short'}) + ' ' + key.slice(11) + ':00';
}
const UNIT_NAME = {year: 'year', month: 'month', week: 'week', day: 'day', hour: 'hour'};
// Zooming into a bar opens that bucket as the period, when it's a period length.
const zoomTo = (key, unit) => ['year', 'month', 'week'].includes(unit) && setPeriod({kind: unit, anchor: unit === 'year' ? key + '-01-01' : unit === 'month' ? key + '-01' : key});

/* ---------- chart primitives ---------- */
const tip = $('tip');
// Keyboard focus shows the same tooltip as hovering.
document.addEventListener('focusin', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.classList.remove('show'); return; }
  const r = t.getBoundingClientRect();
  tip.textContent = t.dataset.tip; tip.style.left = r.left + r.width / 2 + 'px'; tip.style.top = r.top + 'px'; tip.classList.add('show');
});
document.addEventListener('focusout', () => tip.classList.remove('show'));
// The period bar sticks under the header, whose height changes as it wraps.
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--header-h', e.target.offsetHeight + 'px')).observe(document.querySelector('header.top'));
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--period-h', e.target.offsetHeight + 'px')).observe($('period'));
document.addEventListener('pointermove', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.classList.remove('show'); return; }
  tip.textContent = t.dataset.tip; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.classList.add('show');
});
function frameFixed(target, w, h, title, draw) {
  $(target).innerHTML = `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" style="width:${w}px">${draw(w, h)}</svg>`;
}
// Every chart carries its numbers in a collapsed table, for screen readers, keyboards and exact values.
const dataTable = (head, rows) => `<details class="data"><summary>Show the numbers</summary><div class="scroll"><table><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''} scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td class="num">${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
function frame(target, height, title, draw, data) {
  const host = $(target), w = Math.max(280, host.clientWidth), h = height;
  // Keep an open table open when the chart redraws.
  const open = host.querySelector('details.data')?.open;
  host.innerHTML = `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">${draw(w, h)}</svg>${data ? dataTable(...data) : ''}`;
  if (open) host.querySelector('details.data').open = true;
}
const short = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'm' : v >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(v * 10) / 10);
// Round the axis top so each of the four gridlines lands on a round number.
function niceMax(v) { if (v <= 0) return 1; const step = v / 4, p = 10 ** Math.floor(Math.log10(step)), m = step / p; return 4 * (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function axes(w, h, max, opts = {}) {
  const L = opts.left ?? 48, R = 8, T = 10, B = opts.bottom ?? 26, pw = w - L - R, ph = h - T - B;
  let s = '';
  for (let i = 0; i <= 4; i++) { const y = T + ph * (1 - i / 4); s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${y}" y2="${y}"/><text class="tick" x="${L - 8}" y="${y + 4}" text-anchor="end">${short(max * i / 4)}</text>`; }
  return {L, T, pw, ph, s};
}
function bars(target, items, {height = 220, color = COLORS[0], label = v => fmt(v), title, highlight, onPick} = {}) {
  frame(target, height, title, (w, h) => {
    const max = niceMax(Math.max(...items.map(x => x[1]))), {L, T, pw, ph, s: base} = axes(w, h, max);
    const step = pw / items.length, every = Math.ceil(items.length / Math.max(1, Math.floor(pw / 46)));
    let s = base;
    items.forEach(([name, v], i) => {
      const bh = ph * v / max, x = L + i * step;
      s += `<rect x="${x + step * .12}" y="${T + ph - bh}" width="${Math.max(1, step * .76)}" height="${bh}" rx="2" fill="${color}" opacity="${highlight === undefined || highlight === i ? 1 : .55}"/>`;
      s += `<rect class="hit" x="${x}" y="${T}" width="${step}" height="${ph}" data-tip="${esc(name)} · ${esc(label(v))}" data-i="${i}"/>`;
      if (i % every === 0) s += `<text class="tick" x="${x + step / 2}" y="${h - 8}" text-anchor="middle">${esc(name)}</text>`;
    });
    return s;
  }, [['', 'Messages'], items.map(([name, v]) => [name, label(v)])]);
  if (onPick) $(target).onclick = e => { const i = e.target.dataset?.i; if (i !== undefined) onPick(+i); };
}
function stacked(target, labels, series, {height = 240, title, onPick, selected, tipNames = labels} = {}) {
  frame(target, height, title, (w, h) => {
    const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
    const max = niceMax(Math.max(...totals)), {L, T, pw, ph, s: base} = axes(w, h, max);
    const step = pw / labels.length, every = Math.ceil(labels.length / Math.max(1, Math.floor(pw / 40)));
    let s = base;
    labels.forEach((name, i) => {
      let acc = 0; const x = L + i * step;
      series.forEach((ser, j) => { const v = ser.values[i], bh = ph * v / max; s += `<rect x="${x + step * .14}" y="${T + ph - ph * (acc + v) / max}" width="${step * .72}" height="${bh}" fill="${COLORS[j]}" opacity="${selected === undefined || selected === i ? 1 : .45}"/>`; acc += v; });
      s += `<rect class="hit" x="${x}" y="${T}" width="${step}" height="${ph}" data-i="${i}" data-tip="${esc(tipNames[i])} · ${fmt(totals[i])} total · ${series.map(se => `${se.name} ${fmt(se.values[i])}`).join(' · ')}"/>`;
      if (i % every === 0) s += `<text class="tick" x="${x + step / 2}" y="${h - 8}" text-anchor="middle">${esc(name)}</text>`;
    });
    return s;
  }, [['', ...series.map(se => se.name), 'Total'], labels.map((_, i) => [tipNames[i], ...series.map(se => fmt(se.values[i])), fmt(series.reduce((a, se) => a + se.values[i], 0))])]);
  if (onPick) $(target).onclick = e => { const i = e.target.dataset?.i; if (i !== undefined) onPick(+i); };
}
function lines(target, labels, series, {height = 240, title, format = fmt, tickLabel = x => x, onHover} = {}) {
  frame(target, height, title, (w, h) => {
    const max = niceMax(Math.max(1e-9, ...series.flatMap(s => s.values))), {L, T, pw, ph, s: base} = axes(w, h, max);
    const n = labels.length, x = i => L + (n === 1 ? pw / 2 : pw * i / (n - 1)), y = v => T + ph - ph * v / max;
    let s = base;
    series.forEach((ser, j) => {
      s += `<path d="${ser.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${COLORS[j]}" stroke-width="2" stroke-linejoin="round"/>`;
      if (n <= 16) ser.values.forEach((v, i) => s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${COLORS[j]}"/>`);
    });
    const ticks = Math.min(n, Math.max(2, Math.floor(pw / 80)));
    for (let k = 0; k < ticks; k++) { const i = Math.round(k * (n - 1) / (ticks - 1 || 1)); s += `<text class="tick" x="${x(i)}" y="${h - 8}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${esc(tickLabel(labels[i]))}</text>`; }
    const half = n > 1 ? pw / (n - 1) / 2 : pw / 2;
    labels.forEach((lab, i) => s += `<rect class="hit" x="${x(i) - half}" y="${T}" width="${half * 2}" height="${ph}" data-i="${i}" data-tip="${esc(lab)} · ${series.map(se => (series.length > 1 ? se.name + ' ' : '') + format(se.values[i])).join(' · ')}"/>`);
    return s;
  }, [['', ...series.map(se => se.name)], labels.map((lab, i) => [lab, ...series.map(se => format(se.values[i]))])]);
  if (onHover) $(target).onpointerover = e => { const i = e.target.dataset?.i; if (i !== undefined) onHover(+i); };
}
function ranks(target, items, max = 10, label = fmt, share = () => null) {
  const rows = items.slice(0, max), top = Math.max(1, ...rows.map(r => r[1]));
  $(target).innerHTML = rows.map(([name, v], i) => `<div class="rankrow" ${shareAttr(share(name, v, i))}><span class="name" title="${esc(name)}">${esc(name)}</span><span class="number">${label(v)}</span><div class="track"><span style="width:${100 * v / top}%;background:${COLORS[0]}"></span></div></div>`).join('') || '<p class="muted">No results in this report.</p>';
}
const legend = (target, names) => $(target).innerHTML = names.map((n, i) => `<span><i class="swatch" style="background:${COLORS[i]}"></i>${esc(n)}</span>`).join('');
const metric = (v, label, share) => `<div class="metric" ${shareAttr(share)}><strong>${v}</strong><span>${label}</span></div>`;
const table = (target, head, rows) => $(target).innerHTML = `<thead><tr>${head.map((h, i) => `<th${i === head.length - 1 ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === r.length - 1 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;

/* ---------- share copy ---------- */
// Numbers go to the copy both formatted ("1,234") and raw (nRaw) so it can pick singular or plural.
function share(key, v, extra = {}) {
  const vars = {};
  for (const [k, x] of Object.entries(v)) { if (typeof x === 'number') { vars[k] = fmt(x); vars[k + 'Raw'] = x; } else vars[k] = x; }
  return {...SHARE_COPY[key](vars, P), ...extra};
}
// A ranked list on a share card: the top rows as bars, with the shared row highlighted.
const rankBars = (items, i, label = x => x) => ({items: items.slice(0, Math.max(6, Math.min(i + 1, 10))).map(([n, v]) => [label(n), v]), highlight: i});
const pctOf = (n, d) => d ? Math.round(100 * n / d) + '%' : '0%';

/* ---------- findings ---------- */
const keysOf = o => Object.keys(o).sort();
function findings() {
  const T = D.totals, ks = keysOf(D.periods), Y = D.periods, U = D.unit, out = [];
  const name = k => bucketName(k, U, true), inName = k => (U === 'day' ? 'on ' : 'in ') + name(k);
  // A week's busiest day already has its own highlight.
  if (ks.length > 1 && U !== 'day') {
    const busiest = ks.reduce((a, k) => Y[k].total > Y[a].total ? k : a, ks[0]);
    out.push(['years', `<strong>${esc(cap(name(busiest)))} was your busiest ${UNIT_NAME[U]}</strong> with ${fmt(Y[busiest].total)} messages. That's ${pct(Y[busiest].total, T.messages)} of the messages ${esc(P.in)}.`,
      share('highlight.loudest', {label: cap(name(busiest)), n: Y[busiest].total, sharePct: pctOf(Y[busiest].total, T.messages)}, {chart: 'year-chart'})]);
  }
  // Biggest fall between two whole consecutive buckets; cut-off buckets would exaggerate it.
  if (U === 'year' || U === 'month') {
    const drops = ks.slice(1).map((k, j) => [k, ks[j]]).filter(([k, prev]) => !Y[k].partial && !Y[prev].partial && Y[prev].total >= 100).map(([k, prev]) => [k, prev, 1 - Y[k].total / Y[prev].total]).sort((a, b) => b[2] - a[2]);
    if (drops[0]?.[2] > .3) {
      const [k, prev, d] = drops[0];
      out.push(['years', `<strong>You sent ${(100 * d).toFixed(0)}% fewer messages ${esc(inName(k))} than ${esc(inName(prev))}.</strong> That's ${fmt(Y[k].total)} messages across ${fmt(Y[k].activeDays)} days.`,
        share('highlight.quiet', {label: cap(name(k)), prevLabel: name(prev), dropPct: (100 * d).toFixed(0) + '%', n: Y[k].total}, {chart: 'year-chart'})]);
    }
  }
  if (D.fineUnit === 'month') {
    const topMonth = Object.entries(D.fine).reduce((a, m) => m[1].total > a[1].total ? m : a), monthName = bucketName(topMonth[0], 'month', true);
    const perDay = Math.round(topMonth[1].total / new Date(Date.UTC(+topMonth[0].slice(0, 4), +topMonth[0].slice(5), 0)).getUTCDate());
    out.push(['month', `<strong>Your busiest month was ${esc(monthName)},</strong> with ${fmt(topMonth[1].total)} messages, about ${fmt(perDay)} a day.`,
      share('highlight.busiestMonth', {month: monthName, n: topMonth[1].total, perDay}, {chart: 'month-chart'})]);
  }
  const peakHour = D.hourly.indexOf(Math.max(...D.hourly)), hh = h => String(h).padStart(2, '0') + ':00';
  out.push(['rhythm', `<strong>You sent ${pct(T.lateNight, T.messages)} of your messages between midnight and 6 am.</strong> Your busiest hour was ${hh(peakHour)}–${hh((peakHour + 1) % 24)}.`,
    share('highlight.lateNight', {pct: pctOf(T.lateNight, T.messages), peakHour: hh(peakHour)}, {chart: 'heat-chart'})]);
  const st = D.streaks[0];
  if (st && st[0] > 1) out.push(['calendar', `<strong>Your longest streak was ${fmt(st[0])} days,</strong> from ${longDate(st[1])} to ${longDate(st[2])}. You sent messages on ${pct(T.activeDays, T.calendarDays)} of the days ${esc(P.in)}.`,
    share('highlight.streak', {days: st[0], from: longDate(st[1]), to: longDate(st[2])}, {chart: 'calendar'})]);
  const pk = D.peakDays[0];
  if (pk) {
    const [txt, n] = pk.topText, notable = n > pk.count * .2 && txt;
    out.push(['peaks', `<strong>You sent ${fmt(pk.count)} messages on ${longDate(pk.date)},</strong> your busiest day ${esc(P.in)}${pk.contexts[0] ? `. Most went to ${esc(pk.contexts[0][0])}` : ''}.${notable ? ` You sent “${esc(txt.slice(0, 60))}” ${fmt(n)} times.` : ''}`,
      share('highlight.recordDay', {date: longDate(pk.date), n: pk.count, topText: notable ? txt : '', topCount: notable ? n : 0})]);
  }
  out.push(['length', `<strong>${pct(D.bursts.within60, T.messages - 1)} of your messages came within a minute of the one before.</strong> ${pct(T.shortMessages, T.messages)} have 20 characters or fewer. Your fastest minute had ${fmt(D.bursts.bestMinute.count)} messages.`,
    share('highlight.bursts', {bestMinute: D.bursts.bestMinute.count, shortPct: pctOf(T.shortMessages, T.messages)}, {chart: 'length-chart'})]);
  const dms = D.channels.filter(c => c.group === 'DMs'), dmTotal = dms.reduce((a, c) => a + c.count, 0), top10 = dms.slice(0, 10).reduce((a, c) => a + c.count, 0);
  if (dms.length > 10) out.push(['people', `<strong>Your top 10 DM conversations hold</strong> ${pct(top10, dmTotal)} of your ${fmt(dmTotal)} DM messages ${esc(P.in)}, out of ${fmt(dms.length)} conversations.`,
    share('highlight.innerCircle', {pct: pctOf(top10, dmTotal), dmCount: dms.length})]);
  const rk = rateKeys();
  if (rk.length > 2 && (U === 'year' || U === 'month')) {
    const a = rk.find(k => !Y[k].partial) || rk[0], b = rk.at(-1), wa = Y[a].words / Y[a].total, wb = Y[b].words / Y[b].total;
    if (a !== b && Math.abs(wb - wa) > .8) out.push(['wpm', `<strong>Your messages averaged ${wa.toFixed(1)} words ${esc(inName(a))}</strong> and ${wb.toFixed(1)} ${esc(inName(b))}.`,
      share('highlight.longer', {fromLabel: name(a), toLabel: name(b), fromWords: wa.toFixed(1), toWords: wb.toFixed(1), longer: wb > wa}, {chart: 'wpm-chart'})]);
  }
  if (D.domains[0]) out.push(['links', `<strong>You linked to ${esc(D.domains[0][0])} most often,</strong> with ${fmt(D.domains[0][1])} links. You shared ${fmt(T.urls)} links to ${fmt(T.distinctDomains)} sites ${esc(P.in)}.`,
    share('highlight.topLink', {domain: D.domains[0][0], n: D.domains[0][1]}, {bars: rankBars(D.domains, 0)})]);
  // Each highlight sits next to the chart that shows it.
  document.querySelectorAll('[data-slot]').forEach(el => {
    el.innerHTML = out.filter(([slot]) => slot === el.dataset.slot).map(([, html, ctx]) => `<p ${shareAttr(ctx)}>${html}</p>`).join('');
  });
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- sections ---------- */
// Buckets with very few messages make per-message rates swing wildly, so rate charts skip them.
function rateKeys() {
  const ks = keysOf(D.periods), mean = D.totals.messages / ks.length, min = Math.min(500, Math.max(10, mean * .1));
  return ks.filter(k => D.periods[k].total >= min);
}
const per = unit => `per ${UNIT_NAME[unit]}`;
const draws = [];
function overview() {
  const T = D.totals, U = D.unit, F = D.fineUnit;
  $('hero-title').textContent = `${fmt(T.messages)} ${T.messages === 1 ? 'message' : 'messages'} ${P.in}`;
  $('hero-sub').textContent = `${D.user?.username ? D.user.username + ' · ' : ''}${T.first === T.last ? longDate(T.first) : `${longDate(T.first)} – ${longDate(T.last)}`} · ${fmt(T.channels)} ${T.channels === 1 ? 'channel' : 'channels'} · times in ${D.tz}`;
  const days = T.calendarDays;
  $('counts').innerHTML = metric(fmt(T.messages), T.messages === 1 ? 'message' : 'messages', share('stat.messages', {n: T.messages}, {chart: 'year-chart'})) + metric(fmt(T.words), 'words', share('stat.words', {n: T.words})) + metric(fmt(T.characters), 'characters', share('stat.characters', {n: T.characters}))
    + metric(fmt(T.activeDays), `days with messages, out of ${fmt(days)}`, share('stat.activeDays', {active: T.activeDays, days, pct: pctOf(T.activeDays, days)}, days >= 60 ? {chart: 'calendar'} : {}))
    + metric(fmt(T.urls), 'links', share('stat.links', {n: T.urls})) + metric(fmt(T.attachmentLinks), 'attachments', share('stat.attachments', {n: T.attachmentLinks}));
  findings();
  legend('group-legend', GROUPS);
  const ks = keysOf(D.periods), fs = keysOf(D.fine);
  $('period-chart-title').textContent = `Messages ${per(U)}`;
  $('fine-chart-title').textContent = `Messages ${per(F)}`;
  const zoomable = ['year', 'month', 'week'].includes(U);
  const draw = () => {
    stacked('year-chart', ks.map(k => bucketName(k, U)), GROUPS.map(g => ({name: g, values: ks.map(k => D.periods[k][g])})), {title: `Messages ${per(U)} by conversation type`, onPick: zoomable ? i => zoomTo(ks[i], U) : undefined, tipNames: ks.map(k => bucketName(k, U, true))});
    lines('month-chart', fs.map(k => bucketName(k, F)), GROUPS.map(g => ({name: g, values: fs.map(k => D.fine[k][g])})), {title: `Messages ${per(F)}`,
      onHover: i => { const m = D.fine[fs[i]]; $('month-readout').textContent = `${cap(bucketName(fs[i], F, true))} · ${fmt(m.total)} messages · ${GROUPS.map(g => `${g} ${fmt(m[g])}`).join(' · ')}`; }});
    $('month-readout').textContent = zoomable ? `Hover the chart for details. Choose a bar above to open that ${UNIT_NAME[U]}.` : 'Hover the chart for details.';
    calendar();
  };
  draw(); draws.push(draw);
}
// The calendar covers the period, or its last year when the period is longer. Short periods skip it.
function calendar() {
  const to = dayNum(D.range.to), from = Math.max(dayNum(D.range.from), to - 370);
  $('calendar-block').hidden = to - dayNum(D.range.from) < 59;
  if ($('calendar-block').hidden) return;
  const y0 = new Date(from * DAY).getUTCFullYear(), y1 = new Date(to * DAY).getUTCFullYear();
  const start = y0 === y1 || to - dayNum(D.range.from) > 370 ? Math.max(from, Date.UTC(y1, 0, 1) / DAY) : from, end = to;
  const counts = new Map(D.days), lead = (new Date(start * DAY).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((end - start + 1 + lead) / 7), max = Math.max(1, ...[...counts].filter(([d]) => d >= start && d <= end).map(x => x[1]));
  const label = start === Date.UTC(y1, 0, 1) / DAY && end === Date.UTC(y1, 11, 31) / DAY ? String(y1) : `${longDate(isoDay(start))} – ${longDate(isoDay(end))}`;
  $('calendar-title').textContent = `Every day, ${label}`;
  // Cells keep a readable minimum size; narrow screens scroll the calendar sideways.
  const L = 30, cell = Math.max(11, Math.min(18, ($('calendar').clientWidth - L) / weeks)), h = cell * 7 + 24;
  frameFixed('calendar', L + weeks * cell, h, `Messages per day, ${label}`, () => {
    let s = '', lastMonth = -1;
    for (let d = start; d <= end; d++) {
      const k = d - start + lead, wk = Math.floor(k / 7), wd = k % 7, n = counts.get(d) || 0, date = new Date(d * DAY);
      s += `<rect x="${L + wk * cell}" y="${18 + wd * cell}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${n ? 'var(--c1)' : 'var(--soft)'}" opacity="${n ? .2 + .8 * Math.log1p(n) / Math.log1p(max) : 1}" data-tip="${date.toLocaleDateString(undefined, {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'})} · ${fmt(n)} messages"/>`;
      if (date.getUTCMonth() !== lastMonth && (wd === 0 || d === start)) { lastMonth = date.getUTCMonth(); if (wk < weeks - 1 || d === start) s += `<text class="tick" x="${L + wk * cell}" y="11">${date.toLocaleDateString(undefined, {month: 'short', timeZone: 'UTC'})}</text>`; }
    }
    [0, 2, 4].forEach(i => s += `<text class="tick" x="0" y="${18 + i * cell + cell * .75}">${WEEK[i]}</text>`);
    return s;
  });
  const inside = [...counts].filter(([d]) => d >= start && d <= end), sum = inside.reduce((a, x) => a + x[1], 0);
  $('calendar-readout').textContent = `${fmt(sum)} messages on ${fmt(inside.length)} days. Darker squares mean more messages.`;
}
function rhythm() {
  const heat = () => frame('heat-chart', 230, 'Messages by weekday and hour', (w, h) => {
    const L = 40, T = 20, cw = (w - L) / 24, rh = (h - T - 4) / 7, flat = D.heat.flat(), max = Math.max(1, ...flat), min = Math.min(...flat);
    // Stretch the shading over the actual range so quiet and busy hours stay distinguishable.
    const shade = n => n ? .12 + .88 * Math.sqrt((n - min) / Math.max(1, max - min)) : .04;
    let s = '';
    D.heat.forEach((row, d) => { s += `<text class="tick" x="0" y="${T + d * rh + rh * .65}">${WEEK[d]}</text>`; row.forEach((n, hr) => s += `<rect x="${L + hr * cw}" y="${T + d * rh}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="var(--c1)" opacity="${shade(n)}" data-tip="${WEEK[d]} ${String(hr).padStart(2, '0')}:00 · ${fmt(n)} messages"/>`); });
    for (let hr = 0; hr < 24; hr += w < 500 ? 6 : 3) s += `<text class="tick" x="${L + hr * cw + cw / 2}" y="12" text-anchor="middle">${String(hr).padStart(2, '0')}</text>`;
    return s;
  });
  $('day').innerHTML = '<option value="all">Whole week</option>' + WEEK.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  const hours = () => {
    const v = $('day').value, vals = v === 'all' ? D.hourly : D.heat[+v], peak = vals.indexOf(Math.max(...vals));
    bars('hours-chart', vals.map((n, i) => [String(i).padStart(2, '0'), n]), {title: 'Messages by hour', highlight: peak, label: n => fmt(n) + ' messages'});
    $('hours-readout').textContent = `${v === 'all' ? 'Whole week' : WEEK[+v]} · busiest hour ${String(peak).padStart(2, '0')}:00 with ${fmt(vals[peak])} messages`;
  };
  $('day').onchange = hours;
  table('streaks', ['From', 'To', 'Days'], D.streaks.slice(0, 6).map(s => [longDate(s[1]), longDate(s[2]), fmt(s[0])]));
  table('gaps', ['After', 'Until', 'Days without messages'], D.gaps.slice(0, 6).map(g => [longDate(g[1]), longDate(g[2]), fmt(g[0])]));
  table('peaks', ['Day', 'Mostly in', 'Messages'], D.peakDays.slice(0, 8).map(p => [longDate(p.date), esc(p.contexts.map(c => c[0]).slice(0, 2).join(', ')) + (p.topText[1] > p.count * .2 ? `<br><small>${fmt(p.topText[1])}× “${esc(p.topText[0].slice(0, 40))}”</small>` : ''), fmt(p.count)]));
  const ks = rateKeys();
  $('wpm-title').textContent = `Words per message, ${per(D.unit)}`;
  const draw = () => {
    heat(); hours();
    bars('length-chart', D.lengths, {title: 'Messages by length in characters', color: COLORS[1], label: n => `${fmt(n)} messages (${pct(n, D.totals.messages)})`});
    lines('wpm-chart', ks.map(k => bucketName(k, D.unit)), [{name: 'Words per message', values: ks.map(k => D.periods[k].words / D.periods[k].total)}], {height: 200, title: `Average words per message ${per(D.unit)}`, format: v => v.toFixed(1) + ' words'});
  };
  draw(); draws.push(draw);
}
function people() {
  const ks = rateKeys();
  const dms = D.channels.filter(c => c.group === 'DMs').map(c => [c.name, c.count]);
  ranks('dm-ranks', dms, 10, n => fmt(n));
  const dmTotal = dms.reduce((a, x) => a + x[1], 0);
  $('dm-share').textContent = dms.length ? `${fmt(dms.length)} DM conversations · top 10 = ${pct(dms.slice(0, 10).reduce((a, x) => a + x[1], 0), dmTotal)} of DM messages` : '';
  const servers = D.guilds.map(g => [g.name, g.count]);
  ranks('server-ranks', servers, 10, fmt, (name, n, i) => share('rank.server', {name, rank: i + 1, n}, {bars: rankBars(servers, i, markName)}));
  $('server-note').textContent = servers.length ? `${fmt(servers.length)} servers. A renamed server can appear twice when the export only identifies it by name.` : '';
  legend('share-legend', GROUPS);
  const draw = () => lines('share-chart', ks.map(k => bucketName(k, D.unit)), GROUPS.map(g => ({name: g, values: ks.map(k => 100 * D.periods[k][g] / D.periods[k].total)})), {height: 220, title: `Share of messages by conversation type ${per(D.unit)}`, format: v => v.toFixed(0) + '%'});
  draw(); draws.push(draw);
}
function words() {
  const ks = rateKeys(), names = Object.keys(D.topics), U = D.unit;
  legend('topic-legend', names);
  const draw = () => lines('topic-chart', ks.map(k => bucketName(k, U)), names.map(n => ({name: n, values: ks.map(k => 1000 * (D.topicPeriods[k]?.[n] || 0) / D.periods[k].total)})), {title: 'Messages containing topic keywords per 1,000 messages', format: v => v.toFixed(1)});
  draw(); draws.push(draw);
  const cols = ks.filter(k => D.wordPeriods[k]?.length);
  $('bump-title').textContent = `Your top 10 words, ${UNIT_NAME[U]} by ${UNIT_NAME[U]}`;
  const drawBump = () => bump('bump-chart', cols);
  drawBump(); draws.push(drawBump);
  $('topics-input').value = topicsText;
  ranks('word-ranks', D.words, 12, fmt, (word, n, i) => share('rank.word', {word, rank: i + 1, n}, {bars: rankBars(D.words, i, markQuote)}));
  ranks('expr-ranks', D.expressions, 12, fmt, (text, n, i) => share('rank.expression', {text, rank: i + 1, n}, {bars: rankBars(D.expressions, i, t => `“${markQuote(quoteOf(t, 24))}”`)}));
  ranks('link-ranks', D.domains, 10, fmt, (domain, n, i) => share('rank.link', {domain, rank: i + 1, n}, {bars: rankBars(D.domains, i)}));
  const emoji = D.emoji.map(([n, v]) => [':' + n + ':', v]);
  ranks('emoji-ranks', emoji, 10, fmt, (name, n, i) => share('rank.emoji', {name, rank: i + 1, n}, {bars: rankBars(emoji, i)}));
}
// Bump chart: one column per bucket, words placed by rank, lines joining a word across neighbouring columns.
function bump(target, keys) {
  const U = D.unit, tops = keys.map(k => D.wordPeriods[k].slice(0, 10)), labels = keys.map(k => bucketName(k, U));
  const paths = new Map();
  tops.forEach((list, i) => list.forEach(([word, count], r) => { if (!paths.has(word)) paths.set(word, []); paths.get(word).push({i, r, count}); }));
  // Words that recur get a palette colour, most-recurring first; one-off words stay muted.
  const recurring = [...paths].filter(([, p]) => p.length > 1).sort((a, b) => b[1].length - a[1].length).map(([w]) => w);
  const color = w => recurring.includes(w) ? COLORS[recurring.indexOf(w) % COLORS.length] : 'var(--muted)';
  const host = $(target), w = Math.max(host.clientWidth, keys.length * 92), T = 26, rh = 30, h = T + rh * 10 + 4, cw = w / Math.max(1, keys.length);
  const x = i => cw * (i + .5), y = r => T + rh * (r + .5), half = word => Math.min(cw / 2 - 6, fit(word).length * 3.4 + 2);
  const fit = word => word.length * 6.8 > cw - 12 ? word.slice(0, Math.max(3, Math.floor((cw - 12) / 6.8) - 1)) + '…' : word;
  frameFixed(target, w, h, `Top 10 words ${per(U)}`, () => {
    let s = labels.map((lab, i) => `<text class="tick" x="${x(i)}" y="14" text-anchor="middle">${esc(lab)}</text>`).join('');
    for (const [word, pts] of paths) {
      const c = color(word);
      s += `<g class="bw" data-word="${esc(word)}">`;
      pts.forEach((p, k) => {
        const next = pts[k + 1];
        if (next && next.i === p.i + 1) s += `<path d="M${x(p.i) + half(word) + 4},${y(p.r)} C${x(p.i) + cw / 2},${y(p.r)} ${x(next.i) - cw / 2},${y(next.r)} ${x(next.i) - half(word) - 4},${y(next.r)}" fill="none" stroke="${c}" stroke-width="2" opacity=".75"/>`;
        const where = bucketName(keys[p.i], U, true);
        s += `<text x="${x(p.i)}" y="${y(p.r) + 4}" text-anchor="middle" fill="${c}" style="fill:${c}" tabindex="0" role="button" aria-label="${esc(word)}, number ${p.r + 1} in ${esc(where)}, ${fmt(p.count)} times. Share" data-tip="${esc(word)} · #${p.r + 1} in ${esc(where)} · ${fmt(p.count)} times" data-share-click ${shareAttr(share('bump.word', {word, rank: p.r + 1, label: where, n: p.count}, {chart: 'bump-chart', focus: word}))}>${esc(fit(word))}</text>`;
      });
      s += '</g>';
    }
    return s;
  });
}
async function retopic(text) {
  topicsText = text; $('topics-apply').disabled = true;
  await analyse(); $('topics-apply').disabled = false; renderAll(); location.hash = '#s-words';
}
$('topics-apply').onclick = () => retopic($('topics-input').value);
$('topics-reset').onclick = () => retopic(DEFAULT_TOPICS);

function messageCard(m, q) {
  let text = esc(m.text || 'Attachment only');
  if (q) text = text.replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), x => `<mark>${x}</mark>`);
  return `<div class="msg"><div class="text">${text}</div><div class="meta" data-private>${esc(m.at)} · ${esc(m.channel)}${m.guild ? ' · ' + esc(m.guild) : ''}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noreferrer">Open in Discord</a>` : ''}</div></div>`;
}
$('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('search-q').value; if (!q.trim()) return;
  $('search-out').innerHTML = '<p class="readout">Searching…</p>';
  const r = await call('search', {query: q, wholeWord: $('search-whole').checked});
  if (!r.total) { $('search-out').innerHTML = `<p>No messages match "${esc(r.query)}" in this report. Try another phrase.</p>`; return; }
  const ms = keysOf(D.fine), F = D.fineUnit, U = D.unit;
  const peak = Object.entries(r.periods).sort((a, b) => b[1] - a[1])[0][0], peakName = bucketName(peak, U, true);
  const multi = keysOf(D.periods).length > 1;
  lastSearchShare = share('search', {query: r.query, n: r.total, peakLabel: multi ? peakName : ''}, {chart: 'search-chart'});
  $('search-out').innerHTML = `<div class="sechead"><span></span><button class="share-btn" type="button" data-share-section="search">Share</button></div><div class="metrics">${metric(fmt(r.total), r.total === 1 ? 'message' : 'messages', lastSearchShare)}${metric(longDate(r.first.at.slice(0, 10)), 'first match')}${multi ? metric(esc(cap(peakName)), `busiest ${UNIT_NAME[U]}`, lastSearchShare) : ''}</div><div id="search-chart"></div><h3>Where you said it</h3><div class="rank" id="search-ranks" data-private></div><h3>Messages${r.total > r.results.length ? ` (${r.results.length} of ${fmt(r.total)}, spread over time)` : ''}</h3><div class="messages">${r.results.map(m => messageCard(m, r.query)).join('')}</div>`;
  const draw = () => $('search-chart') && lines('search-chart', ms.map(k => bucketName(k, F)), [{name: r.query, values: ms.map(k => r.fine[k] || 0)}], {height: 200, title: `Messages containing ${r.query} ${per(F)}`});
  draw(); ranks('search-ranks', r.channels, 8);
  searchDraw = draw;
});
let searchDraw = () => {};

function channels() {
  let page = 0; const size = 10;
  const results = () => {
    const q = $('ch-q').value.toLowerCase().trim(), t = $('ch-type').value;
    return D.channels.filter(c => (!q || (c.name + ' ' + c.guild).toLowerCase().includes(q)) && (t === 'all' || c.group === t)).map(c => ({c, n: c.count}));
  };
  const update = () => {
    const r = results(), last = Math.max(0, Math.ceil(r.length / size) - 1); page = Math.min(page, last);
    $('ch-label').textContent = `${fmt(r.length)} channels · ${fmt(r.reduce((a, x) => a + x.n, 0))} messages`;
    $('ch-rows').innerHTML = r.slice(page * size, page * size + size).map(({c, n}) => `<tr><td><button class="rowbutton" data-ch="${c.i}">${esc(c.name)}</button><br><small>${esc(c.guild || c.group)}</small></td><td><small>${c.first} → ${c.last}</small></td><td class="num">${fmt(n)}</td></tr>`).join('') || '<tr><td colspan="3">No channels match. Change the search or filters.</td></tr>';
    $('ch-page').textContent = `Page ${page + 1} of ${last + 1}`; $('ch-prev').disabled = page === 0; $('ch-next').disabled = page >= last;
  };
  ['ch-q', 'ch-type'].forEach(id => $(id).oninput = () => { page = 0; update(); });
  $('ch-prev').onclick = () => { page--; update(); }; $('ch-next').onclick = () => { page++; update(); };
  $('ch-rows').onclick = e => {
    const b = e.target.closest('[data-ch]'); if (!b) return;
    const c = D.channels.find(x => x.i === +b.dataset.ch), ks = keysOf(D.periods);
    $('ch-detail').classList.remove('hidden');
    $('ch-detail').innerHTML = `<strong>${esc(c.name)}</strong> <small>${esc(c.guild || c.group)} · ${esc(c.type)}</small><p>${fmt(c.count)} messages · ${fmt(c.words)} words · ${fmt(c.links)} messages with links · ${fmt(c.attachments)} messages with attachments</p><div id="ch-chart"></div>`;
    bars('ch-chart', ks.map(k => [bucketName(k, D.unit), c.periods[k] || 0]), {height: 160, title: `Messages ${per(D.unit)} in ${c.name}`});
  };
  update();
}
function fame() {
  const F = D.fame, day = m => longDate(m.at.slice(0, 10));
  const card = (title, m, extra = '', ctx) => m ? `<article ${shareAttr(ctx)}><h3>${title}</h3><blockquote>${esc((m.text || 'Attachment only').slice(0, 1200))}</blockquote><small data-private>${esc(m.at)} · ${esc(m.channel)}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noreferrer">Open in Discord</a>` : ''}${extra}</small></article>` : '';
  const big = (title, n, what, ctx, note = '') => `<article ${shareAttr(ctx)}><h3>${title}</h3><p><strong class="big">${fmt(n)}</strong> ${what}</p>${note}</article>`;
  const pk = D.peakDays[0], bm = D.bursts.bestMinute, ls = D.bursts.largestSessions[0];
  const chars = F.longest ? [...F.longest.text].length : 0, all = P.kind === 'all';
  $('fame').innerHTML = card(all ? 'Your first message' : 'First message', F.first, '', F.first && share('fame.first', {text: F.first.text || 'an attachment', date: day(F.first)}))
    + card('Latest message', F.last, '', F.last && share('fame.latest', {text: F.last.text || 'an attachment', date: day(F.last)}))
    + (F.mostRepeated ? `<article ${shareAttr(share('fame.mostRepeated', {text: F.mostRepeated.text, n: F.mostRepeated.count}, {bars: rankBars(D.expressions, Math.max(0, D.expressions.findIndex(e => e[0] === F.mostRepeated.text.toLowerCase())), t => `“${markQuote(quoteOf(t, 24))}”`)}))}><h3>Most repeated message</h3><blockquote>${esc(F.mostRepeated.text.slice(0, 300))}</blockquote><small>Sent ${fmt(F.mostRepeated.count)} ${F.mostRepeated.count === 1 ? 'time' : 'times'}</small></article>` : '')
    + card('Longest message', F.longest, F.longest ? ` · ${fmt(chars)} characters` : '', F.longest && share('fame.longest', {chars, text: F.longest.text}, {chart: 'length-chart'}))
    + big('Fastest minute', bm.count, 'messages in 60 seconds', share('fame.fastestMinute', {n: bm.count}), `<small data-private>${esc(bm.at)} · ${esc(bm.channel || '')}</small>`)
    + (ls ? big('Longest session', ls[0], 'messages without a 30-minute break', share('fame.longestSession', {n: ls[0], hours: Math.max(1, Math.round(ls[1] / 60))}), `<small>Started ${esc(ls[2])} · about ${fmt(Math.max(1, Math.round(ls[1] / 60)))} hours</small>`) : '')
    + (pk ? big('Busiest day', pk.count, `messages on ${longDate(pk.date)}`, share('fame.recordDay', {date: longDate(pk.date), n: pk.count}, D.totals.calendarDays >= 60 ? {chart: 'calendar'} : {chart: 'month-chart'}), `<small data-private>${esc(pk.contexts.map(c => c[0]).join(', '))}</small>`) : '');
}

/* ---------- roast ---------- */
let roastSeed = 1, roastPool = [];
async function roast() {
  roastPool = await call('candidates', {seed: roastSeed, count: 30});
  renderRoast(roastPool.slice(0, 5));
}
function renderRoast(items) {
  $('roast').innerHTML = items.map((m, i) => `<article class="quote"><h3>${esc(m.title || 'Exhibit ' + String.fromCharCode(65 + i))}</h3><blockquote>${esc(m.text)}</blockquote>${m.followup ? `<p class="roastline">${fmt(m.followup.seconds)} seconds later, you sent "${esc(m.followup.text.slice(0, 200))}".</p>` : ''}${m.caption ? `<p class="roastline">${esc(m.caption)}</p>` : ''}<small>${esc(m.at)} · ${esc(m.channel)}${m.guild ? ' · ' + esc(m.guild) : ''}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noreferrer">Open in Discord</a>` : ''}${m.aiScore !== undefined ? ` · AI score ${m.aiScore}/10` : ''}</small></article>`).join('') || '<p class="muted">No roast candidates in this report.</p>';
}
$('reroll').onclick = async () => { roastSeed++; await roast(); };

const MODELS = [
  ['Qwen2.5-0.5B-Instruct-q4f16_1-MLC', 'Qwen 2.5 0.5B · ~350 MB'],
  ['SmolLM2-360M-Instruct-q4f16_1-MLC', 'SmolLM2 360M · ~200 MB'],
  ['Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Llama 3.2 1B · ~600 MB'],
  ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Qwen 2.5 1.5B · ~900 MB'],
  ['Llama-3.2-3B-Instruct-q4f16_1-MLC', 'Llama 3.2 3B · ~1.7 GB'],
];
$('ai-model').innerHTML = MODELS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
let engine = null, engineModel = null;
async function ask(system, user, maxTokens) {
  const r = await engine.chat.completions.create({messages: [{role: 'system', content: system}, {role: 'user', content: user}], temperature: .7, max_tokens: maxTokens});
  return (r.choices[0]?.message?.content || '').trim();
}
$('ai-run').onclick = async () => {
  const status = $('ai-status'), bar = $('ai-bar'), btn = $('ai-run');
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter().catch(() => null))) { status.innerHTML = '<span class="error">WebGPU isn’t available in this browser. Try a browser with WebGPU, or use the roast without AI.</span>'; return; }
  btn.disabled = true;
  try {
    const model = $('ai-model').value;
    if (engineModel !== model) {
      status.textContent = 'Loading the AI model…'; bar.classList.remove('hidden');
      const webllm = await import('https://esm.run/@mlc-ai/web-llm@0.2.82');
      const report = r => { status.textContent = 'Loading the AI model…'; bar.firstElementChild.style.width = (100 * (r.progress || 0)) + '%'; };
      if (engine) { await engine.reload(model); } else engine = await webllm.CreateMLCEngine(model, {initProgressCallback: report});
      engineModel = model;
    }
    const pool = roastPool.slice(0, 20);
    for (let i = 0; i < pool.length; i++) {
      status.textContent = `Judging message ${i + 1} of ${pool.length}…`; bar.firstElementChild.style.width = (100 * i / pool.length) + '%';
      const a = await ask('You rate chat messages for how absurd, unhinged or funny they are out of context. Reply with only a whole number from 1 to 10.', pool[i].text.slice(0, 600), 4);
      pool[i].aiScore = Math.min(10, Math.max(1, parseInt(a.match(/\d+/)?.[0] || '5', 10)));
    }
    const best = [...pool].sort((a, b) => b.aiScore - a.aiScore || b.score - a.score).slice(0, 5);
    for (let i = 0; i < best.length; i++) {
      status.textContent = `Writing roast ${i + 1} of ${best.length}…`; bar.firstElementChild.style.width = (100 * i / best.length) + '%';
      const out = await ask('You are a dry, affectionate comedy writer. Given a chat message someone sent, reply in exactly two lines.\nLine 1: a funny title of at most 5 words.\nLine 2: a one-sentence roast of at most 25 words. No slurs, nothing cruel.', best[i].text.slice(0, 600), 70);
      const [title, ...rest] = out.replace(/^(line \d:|title:|roast:)\s*/gim, '').split('\n').map(s => s.trim().replace(/^["*]+|["*]+$/g, '')).filter(Boolean);
      best[i].title = title?.slice(0, 60); best[i].caption = rest.join(' ').slice(0, 220) || undefined;
      renderRoast(best);
    }
    status.textContent = 'Captions ready.';
  } catch (e) {
    status.innerHTML = `<span class="error">Couldn't finish the AI roast: ${esc(e.message)}</span>`;
  } finally { btn.disabled = false; bar.classList.add('hidden'); }
};

function dataQuality() {
  const V = D.validation, T = D.totals;
  const sections = V.sections.length ? V.sections.join(', ') : 'Messages';
  $('data-quality').innerHTML = `<p>Read ${fmt(V.messageFiles)} message files from ${fmt(V.archiveFiles)} files in the package. Uncompressed size is ${(V.archiveBytes / 1e6).toFixed(0)} MB. Package folders: ${esc(sections)}.</p>
  <p>${fmt(T.messages)} unique messages · ${fmt(V.duplicateIds)} duplicate messages skipped · ${fmt(V.parseErrorCount)} read errors · ${fmt(V.snowflakeMismatches)} message dates that disagree with their IDs.</p>
  ${V.parseErrorCount ? `<details class="more"><summary>Read errors</summary><ul>${V.parseErrors.map(e => `<li><code>${esc(e[0])}</code>: ${esc(e[1])}</li>`).join('')}</ul></details>` : ''}
  <p class="muted">Discord exports your sent messages. Replies from other people are not included. Times use ${esc(D.tz)}. Change the time zone in "Your data". Word counts exclude links, mentions and custom emoji code. "Download summary" downloads a JSON file with counts and labels. It omits full messages, but includes words, names and link domains.</p>`;
}

function renderAll() {
  draws.length = 0; shareCtx.clear();
  periodControls();
  const empty = !!D.empty;
  document.querySelectorAll('#report section.card').forEach(s => s.classList.toggle('hidden', empty ? s.id !== 's-empty' : s.id === 's-empty'));
  $('nav').hidden = empty;
  if (empty) {
    $('hero-title').textContent = `No messages ${P.in}`;
    $('hero-sub').textContent = `Your messages run from ${longDate(D.bounds.first)} to ${longDate(D.bounds.last)}.`;
    return;
  }
  overview(); rhythm(); people(); words(); channels(); fame(); dataQuality();
  // The roast picks candidates in the worker, so it waits until you scroll near it.
  roastShown = false; $('roast').innerHTML = '';
  roastWatch.observe($('s-roast'));
}
let roastShown = false;
const roastWatch = new IntersectionObserver(entries => {
  if (!entries.some(e => e.isIntersecting) || roastShown) return;
  roastShown = true; roastWatch.disconnect(); roast();
}, {rootMargin: '600px 0px'});
let resizeTimer, lastWidth = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastWidth) return; lastWidth = innerWidth; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (D) { draws.forEach(f => f()); searchDraw(); } }, 120); });
const links = [...document.querySelectorAll('#nav a')];
const observer = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), {rootMargin: '-40% 0px -55% 0px'});
document.querySelectorAll('section.card').forEach(s => observer.observe(s));
startWorker();
// Reopen the saved copy, if there is one, instead of asking for the zip again.
$('status').innerHTML = '<div>Checking for a saved report…</div>';
call('restore').then(info => info ? show(info) : ($('status').innerHTML = '')).catch(() => { $('status').innerHTML = ''; });
