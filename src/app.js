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
  saved = info;
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
  localStorage.setItem('du-tz', $('tz').value); localStorage.setItem('du-topics', topicsText);
  D = await call('aggregate', {tz: $('tz').value, topics: parseTopics(topicsText)});
}

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

/* ---------- chart primitives ---------- */
const tip = $('tip');
document.addEventListener('pointermove', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.classList.remove('show'); return; }
  tip.textContent = t.dataset.tip; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.classList.add('show');
});
function frameFixed(target, w, h, title, draw) {
  $(target).innerHTML = `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" style="width:${w}px">${draw(w, h)}</svg>`;
}
function frame(target, height, title, draw) {
  const host = $(target), w = Math.max(280, host.clientWidth), h = height;
  host.innerHTML = `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">${draw(w, h)}</svg>`;
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
  });
  if (onPick) $(target).onclick = e => { const i = e.target.dataset?.i; if (i !== undefined) onPick(+i); };
}
function stacked(target, labels, series, {height = 240, title, onPick, selected} = {}) {
  frame(target, height, title, (w, h) => {
    const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
    const max = niceMax(Math.max(...totals)), {L, T, pw, ph, s: base} = axes(w, h, max);
    const step = pw / labels.length, every = Math.ceil(labels.length / Math.max(1, Math.floor(pw / 40)));
    let s = base;
    labels.forEach((name, i) => {
      let acc = 0; const x = L + i * step;
      series.forEach((ser, j) => { const v = ser.values[i], bh = ph * v / max; s += `<rect x="${x + step * .14}" y="${T + ph - ph * (acc + v) / max}" width="${step * .72}" height="${bh}" fill="${COLORS[j]}" opacity="${selected === undefined || selected === i ? 1 : .45}"/>`; acc += v; });
      s += `<rect class="hit" x="${x}" y="${T}" width="${step}" height="${ph}" data-i="${i}" data-tip="${esc(name)} · ${fmt(totals[i])} total · ${series.map(se => `${se.name} ${fmt(se.values[i])}`).join(' · ')}"/>`;
      if (i % every === 0) s += `<text class="tick" x="${x + step / 2}" y="${h - 8}" text-anchor="middle">${esc(name)}</text>`;
    });
    return s;
  });
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
  });
  if (onHover) $(target).onpointerover = e => { const i = e.target.dataset?.i; if (i !== undefined) onHover(+i); };
}
function ranks(target, items, max = 10, label = fmt, share = () => null) {
  const rows = items.slice(0, max), top = Math.max(1, ...rows.map(r => r[1]));
  $(target).innerHTML = rows.map(([name, v], i) => `<div class="rankrow" ${shareAttr(share(name, v, i))}><span class="name" title="${esc(name)}">${esc(name)}</span><span class="number">${label(v)}</span><div class="track"><span style="width:${100 * v / top}%;background:${COLORS[0]}"></span></div></div>`).join('') || '<p class="muted">No results in this report.</p>';
}
const legend = (target, names) => $(target).innerHTML = names.map((n, i) => `<span><i class="swatch" style="background:${COLORS[i]}"></i>${esc(n)}</span>`).join('');
const metric = (v, label, share) => `<div class="metric" ${shareAttr(share)}><strong>${v}</strong><span>${label}</span></div>`;
const table = (target, head, rows) => $(target).innerHTML = `<thead><tr>${head.map((h, i) => `<th${i === head.length - 1 ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === r.length - 1 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
const yearOptions = (all = 'All years') => `<option value="all">${all}</option>` + Object.keys(D.years).sort().map(y => `<option>${y}</option>`).join('');

/* ---------- findings ---------- */
function findings() {
  const T = D.totals, ys = Object.keys(D.years).sort(), Y = D.years, out = [];
  const full = ys.slice(1, -1).filter(y => Y[y].calendarDays >= 365);
  const busiest = ys.reduce((a, y) => Y[y].total > Y[a].total ? y : a, ys[0]);
  out.push(['years', `<strong>${busiest} was your busiest year</strong> with ${fmt(Y[busiest].total)} messages. That's ${pct(Y[busiest].total, T.messages)} of the messages in this report.`,
    {text: `${busiest} was my loudest year on Discord: ${fmt(Y[busiest].total)} messages!`, headline: busiest, sub: `My busiest year · ${fmt(Y[busiest].total)} messages`, chart: 'year-chart'}]);
  // Biggest fall between two consecutive full years; partial first and last years would exaggerate it.
  const drops = full.slice(1).filter(y => full.includes(String(+y - 1))).map(y => [y, 1 - Y[y].total / Y[+y - 1].total]).sort((a, b) => b[1] - a[1]);
  if (drops[0]?.[1] > .3) { const [y, d] = drops[0]; out.push(['years', `<strong>You sent ${(100 * d).toFixed(0)}% fewer messages in ${y} than in ${+y - 1}.</strong> That's ${fmt(Y[y].total)} messages across ${fmt(Y[y].activeDays)} days.`,
    {text: `I went quiet on Discord in ${y}: ${(100 * d).toFixed(0)}% fewer messages than ${+y - 1}.`, headline: y, sub: `${(100 * d).toFixed(0)}% fewer messages than ${+y - 1}`, chart: 'year-chart'}]); }
  const months = Object.entries(D.months), topMonth = months.reduce((a, m) => m[1].total > a[1].total ? m : a);
  const monthName = new Date(topMonth[0] + '-01T00:00:00Z').toLocaleDateString(undefined, {month: 'long', year: 'numeric', timeZone: 'UTC'}), perDay = fmt(Math.round(topMonth[1].total / 30));
  out.push(['month', `<strong>Your busiest month was ${monthName},</strong> with ${fmt(topMonth[1].total)} messages.`,
    {text: `My busiest month on Discord ever was ${monthName}: ${fmt(topMonth[1].total)} messages!`, headline: monthName, sub: `My busiest month · ${fmt(topMonth[1].total)} messages`, chart: 'month-chart'}]);
  const peakHour = D.hourly.indexOf(Math.max(...D.hourly));
  out.push(['rhythm', `<strong>You sent ${pct(T.lateNight, T.messages)} of your messages between midnight and 6 am.</strong> Your busiest hour was ${String(peakHour).padStart(2, '0')}:00–${String((peakHour + 1) % 24).padStart(2, '0')}:00.`,
    {text: `${pct(T.lateNight, T.messages)} of my Discord messages were sent between midnight and 6 am. Night owl confirmed.`, headline: pct(T.lateNight, T.messages), sub: 'Sent between midnight and 6 am', chart: 'heat-chart'}]);
  const st = D.streaks[0];
  if (st) out.push(['calendar', `<strong>Your longest streak was ${fmt(st[0])} days,</strong> from ${longDate(st[1])} to ${longDate(st[2])}. You sent messages on ${pct(T.activeDays, T.calendarDays)} of days in this report's date range.`,
    {text: `I sent a Discord message every single day for ${fmt(st[0])} days straight!`, headline: `${fmt(st[0])} days in a row`, sub: `My longest streak, ${longDate(st[1])} to ${longDate(st[2])}`}]);
  const pk = D.peakDays[0];
  if (pk) {
    const [txt, n] = pk.topText;
    out.push(['peaks', `<strong>You sent ${fmt(pk.count)} messages on ${longDate(pk.date)},</strong> your busiest day in this report${pk.contexts[0] ? `. Most went to ${esc(pk.contexts[0][0])}` : ''}.${n > pk.count * .2 && txt ? ` You sent "${esc(txt.slice(0, 60))}" ${fmt(n)} times.` : ''}`,
      {text: `My biggest day on Discord: ${fmt(pk.count)} messages on ${longDate(pk.date)}!${n > pk.count * .2 && txt ? ` ${fmt(n)} of them were just “${quoteOf(txt, 60)}”.` : ''}`, headline: `${fmt(pk.count)} messages in a day`, sub: `My busiest day, ${longDate(pk.date)}`}]);
  }
  out.push(['length', `<strong>${pct(D.bursts.within60, T.messages - 1)} of consecutive message pairs were at most a minute apart.</strong> ${pct(T.shortMessages, T.messages)} of your messages have 20 characters or fewer. Your fastest minute had ${fmt(D.bursts.bestMinute.count)} messages.`,
    {text: `My Discord record: ${fmt(D.bursts.bestMinute.count)} messages in one minute!`, headline: `${fmt(D.bursts.bestMinute.count)} messages in a minute`, sub: `${pct(T.shortMessages, T.messages)} of my messages have 20 characters or fewer`, chart: 'length-chart'}]);
  const dms = D.channels.filter(c => c.group === 'DMs' && c.count), dmTotal = dms.reduce((a, c) => a + c.count, 0);
  if (dms.length > 10) out.push(['people', `<strong>Your top 10 DM conversations contain</strong> ${pct(dms.slice(0, 10).reduce((a, c) => a + c.count, 0), dmTotal)} of your ${fmt(dmTotal)} DM messages. Your report includes ${fmt(dms.length)} DM conversations.`,
    {text: `${pct(dms.slice(0, 10).reduce((a, c) => a + c.count, 0), dmTotal)} of my Discord DMs go to just 10 people.`, headline: pct(dms.slice(0, 10).reduce((a, c) => a + c.count, 0), dmTotal), sub: 'Of my DM messages are in 10 conversations'}]);
  if (ys.length > 2) {
    const a = full[0] || ys[0], b = ys.at(-1), wa = Y[a].words / Y[a].total, wb = Y[b].words / Y[b].total;
    if (Math.abs(wb - wa) > .8) out.push(['wpm', `<strong>Your messages averaged ${wa.toFixed(1)} words in ${a}</strong> and ${wb.toFixed(1)} in ${b}.`,
      {text: `My Discord messages went from ${wa.toFixed(1)} words on average in ${a} to ${wb.toFixed(1)} in ${b}.`, headline: `${wa.toFixed(1)} → ${wb.toFixed(1)} words`, sub: `Per Discord message, ${a} to ${b}`, chart: 'wpm-chart'}]);
  }
  if (D.domains[0]) out.push(['links', `<strong>You linked to ${esc(D.domains[0][0])} most often,</strong> with ${fmt(D.domains[0][1])} links. Your report contains ${fmt(T.urls)} links to ${fmt(T.distinctDomains)} sites.`,
    {text: `I've shared ${fmt(D.domains[0][1])} links to ${D.domains[0][0]} on Discord.`, headline: D.domains[0][0], sub: `${fmt(D.domains[0][1])} links I've shared on Discord`}]);
  // Each highlight sits next to the chart that shows it.
  document.querySelectorAll('[data-slot]').forEach(el => {
    el.innerHTML = out.filter(([slot]) => slot === el.dataset.slot).map(([, html, share]) => `<p ${shareAttr(share)}>${html}</p>`).join('');
  });
}

/* ---------- sections ---------- */
// Years with very few messages make per-message rates swing wildly, so rate charts skip them.
const rateYears = () => Object.keys(D.years).sort().filter(y => D.years[y].total >= 500);
const draws = [];
function overview() {
  const T = D.totals;
  $('hero-title').textContent = `${fmt(T.messages)} messages${D.user?.username ? ' from ' + D.user.username : ''}`;
  $('hero-sub').textContent = `${longDate(T.first)} – ${longDate(T.last)} · ${fmt(T.channels)} channels · times in ${D.tz}`;
  const since = T.first.slice(0, 4), stat = (n, what) => ({text: `I've ${what} on Discord since ${since}.`, headline: fmt(n), sub: `${what.replace(/^\S+ [\d,.]+ /, '')} on Discord since ${since}`});
  $('counts').innerHTML = metric(fmt(T.messages), 'messages', stat(T.messages, `sent ${fmt(T.messages)} messages`)) + metric(fmt(T.words), 'words', stat(T.words, `typed ${fmt(T.words)} words`)) + metric(fmt(T.characters), 'characters', stat(T.characters, `typed ${fmt(T.characters)} characters`))
    + metric(fmt(T.activeDays), `days with messages out of ${fmt(T.calendarDays)}`, {text: `I've sent Discord messages on ${fmt(T.activeDays)} of the last ${fmt(T.calendarDays)} days.`, headline: pct(T.activeDays, T.calendarDays), sub: `Of days in my report with at least one message`, chart: 'calendar'})
    + metric(fmt(T.urls), 'links', stat(T.urls, `shared ${fmt(T.urls)} links`)) + metric(fmt(T.attachmentLinks), 'attachments', stat(T.attachmentLinks, `sent ${fmt(T.attachmentLinks)} attachments`));
  findings();
  legend('group-legend', GROUPS);
  const ys = Object.keys(D.years).sort();
  $('year').innerHTML = yearOptions();
  const update = () => {
    const year = $('year').value, sel = ys.indexOf(year);
    stacked('year-chart', ys, GROUPS.map(g => ({name: g, values: ys.map(y => D.years[y][g])})), {title: 'Messages per year by conversation type', selected: sel < 0 ? undefined : sel, onPick: i => { $('year').value = $('year').value === ys[i] ? 'all' : ys[i]; update(); }});
    const ms = Object.keys(D.months).filter(m => year === 'all' || m.startsWith(year));
    lines('month-chart', ms, GROUPS.map(g => ({name: g, values: ms.map(m => D.months[m][g])})), {title: 'Messages per month', tickLabel: m => year === 'all' ? m.slice(0, 4) : new Date(m + '-01T00:00:00Z').toLocaleDateString(undefined, {month: 'short', timeZone: 'UTC'}),
      onHover: i => { const m = D.months[ms[i]]; $('month-readout').textContent = `${ms[i]} · ${fmt(m.total)} messages · ${GROUPS.map(g => `${g} ${fmt(m[g])}`).join(' · ')}`; }});
    $('month-readout').textContent = 'Hover a month for details. Click a year bar to zoom in.';
    calendar(year === 'all' ? ys.at(-1) : year);
  };
  $('year').onchange = update;
  update();
  draws.push(update);
}
function calendar(year) {
  const counts = new Map(D.days.map(([d, n]) => [d, n]));
  const start = Date.UTC(+year, 0, 1) / DAY, end = Date.UTC(+year, 11, 31) / DAY, lead = (new Date(start * DAY).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((end - start + 1 + lead) / 7), max = Math.max(1, ...[...counts].filter(([d]) => d >= start && d <= end).map(x => x[1]));
  $('calendar-title').textContent = `Every day of ${year}`;
  // Cells keep a readable minimum size; narrow screens scroll the calendar sideways.
  const L = 30, cell = Math.max(11, Math.min(16, ($('calendar').clientWidth - L) / weeks)), h = cell * 7 + 24;
  frameFixed('calendar', L + weeks * cell, h, `Messages per day in ${year}`, () => {
    let s = '';
    for (let d = start; d <= end; d++) {
      const k = d - start + lead, wk = Math.floor(k / 7), wd = k % 7, n = counts.get(d) || 0;
      s += `<rect x="${L + wk * cell}" y="${18 + wd * cell}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${n ? 'var(--c1)' : 'var(--soft)'}" opacity="${n ? .2 + .8 * Math.log1p(n) / Math.log1p(max) : 1}" data-tip="${new Date(d * DAY).toLocaleDateString(undefined, {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short'})} · ${fmt(n)} messages"/>`;
    }
    for (let m = 0; m < 12; m++) { const d = Date.UTC(+year, m, 1) / DAY, wk = Math.floor((d - start + lead) / 7); s += `<text class="tick" x="${L + wk * cell}" y="11">${new Date(d * DAY).toLocaleDateString(undefined, {month: 'short', timeZone: 'UTC'})}</text>`; }
    [0, 2, 4].forEach(i => s += `<text class="tick" x="0" y="${18 + i * cell + cell * .75}">${WEEK[i]}</text>`);
    return s;
  });
  const total = [...counts].filter(([d]) => d >= start && d <= end), active = total.length, sum = total.reduce((a, x) => a + x[1], 0);
  $('calendar-readout').textContent = `${fmt(sum)} messages on ${fmt(active)} days. Darker squares mean more messages.`;
}
function rhythm() {
  const heat = () => frame('heat-chart', 230, 'Messages by weekday and hour', (w, h) => {
    const L = 40, T = 20, cw = (w - L) / 24, rh = (h - T - 4) / 7, max = Math.max(...D.heat.flat());
    let s = '';
    D.heat.forEach((row, d) => { s += `<text class="tick" x="0" y="${T + d * rh + rh * .65}">${WEEK[d]}</text>`; row.forEach((n, hr) => s += `<rect x="${L + hr * cw}" y="${T + d * rh}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="var(--c1)" opacity="${.06 + .94 * n / max}" data-tip="${WEEK[d]} ${String(hr).padStart(2, '0')}:00 · ${fmt(n)} messages"/>`); });
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
  table('peaks', ['Day', 'Mostly in', 'Messages'], D.peakDays.slice(0, 8).map(p => [longDate(p.date), esc(p.contexts.map(c => c[0]).slice(0, 2).join(', ')) + (p.topText[1] > p.count * .2 ? `<br><small>${fmt(p.topText[1])}× "${esc(p.topText[0].slice(0, 40))}"</small>` : ''), fmt(p.count)]));
  const ys = rateYears();
  const draw = () => {
    heat(); hours();
    bars('length-chart', D.lengths, {title: 'Messages by length in characters', color: COLORS[1], label: n => `${fmt(n)} messages (${pct(n, D.totals.messages)})`});
    lines('wpm-chart', ys, [{name: 'Words per message', values: ys.map(y => D.years[y].words / D.years[y].total)}], {height: 200, title: 'Average words per message by year', format: v => v.toFixed(1) + ' words'});
  };
  draw(); draws.push(draw);
}
function people() {
  $('people-year').innerHTML = yearOptions('All time');
  const ys = rateYears();
  const update = () => {
    const y = $('people-year').value, val = c => y === 'all' ? c.count : c.years[y] || 0;
    const dms = D.channels.filter(c => c.group === 'DMs').map(c => [c.name, val(c)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    ranks('dm-ranks', dms, 10, n => fmt(n));
    const dmTotal = dms.reduce((a, x) => a + x[1], 0);
    $('dm-share').textContent = dms.length ? `${fmt(dms.length)} DM conversations · top 10 = ${pct(dms.slice(0, 10).reduce((a, x) => a + x[1], 0), dmTotal)} of DM messages` : '';
    const servers = D.guilds.map(g => [g.name, y === 'all' ? g.count : g.years[y] || 0]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    ranks('server-ranks', servers, 10, fmt, (name, n, i) => ({text: `I've sent ${fmt(n)} messages in ${name} on Discord${y === 'all' ? '' : ` in ${y}`}.`, headline: name, sub: `${i ? `#${i + 1}` : 'my top'} Discord server${y === 'all' ? '' : ` in ${y}`} · ${fmt(n)} messages`}));
    $('server-note').textContent = servers.length ? `${fmt(servers.length)} servers. A renamed server can appear twice when the export only identifies it by name.` : '';
  };
  $('people-year').onchange = update; update();
  legend('share-legend', GROUPS);
  const draw = () => lines('share-chart', ys, GROUPS.map(g => ({name: g, values: ys.map(y => 100 * D.years[y][g] / D.years[y].total)})), {height: 220, title: 'Share of messages by conversation type per year', format: v => v.toFixed(0) + '%'});
  draw(); draws.push(draw);
}
function words() {
  const ys = rateYears(), names = Object.keys(D.topics);
  legend('topic-legend', names);
  const draw = () => lines('topic-chart', ys, names.map(n => ({name: n, values: ys.map(y => 1000 * (D.topicYears[y]?.[n] || 0) / D.years[y].total)})), {title: 'Messages containing topic keywords per 1,000 messages', format: v => v.toFixed(1)});
  draw(); draws.push(draw);
  const drawBump = () => bump('bump-chart', ys.filter(y => D.wordYears[y]?.length));
  drawBump(); draws.push(drawBump);
  $('topics-input').value = topicsText;
  $('words-year').innerHTML = yearOptions();
  const wy = () => {
    const y = $('words-year').value;
    ranks('word-ranks', y === 'all' ? D.words : D.wordYears[y] || [], 12, fmt, (w, n, i) => wordShare(w, n, i, y === 'all' ? null : y));
  };
  $('words-year').onchange = wy; wy();
  ranks('expr-ranks', D.expressions, 12, fmt, (t, n, i) => ({text: i ? `“${quoteOf(t, 60)}” is my #${i + 1} most-sent message on Discord: ${fmt(n)} times.` : `The thing I say most on Discord is just “${quoteOf(t, 60)}”: ${fmt(n)} times.`, headline: `"${quoteOf(t, 40)}"`, sub: `Short message rank #${i + 1} · Sent ${fmt(n)} times`}));
  ranks('link-ranks', D.domains, 10, fmt, (d, n) => ({text: `I've shared ${fmt(n)} links to ${d} on Discord.`, headline: d, sub: `${fmt(n)} links I've shared on Discord`}));
  ranks('emoji-ranks', D.emoji.map(([n, v]) => [':' + n + ':', v]), 10, fmt, (e, n, i) => ({text: `${i ? `My #${i + 1}` : 'My most-used'} custom emoji on Discord is ${e} (${fmt(n)} times).`, headline: e, sub: `${i ? `#${i + 1} ` : 'most-used '}custom emoji · ${fmt(n)} times`}));
}
const wordShare = (w, n, i, y) => ({
  text: y ? (i ? `“${w}” was my #${i + 1} word on Discord in ${y} (${fmt(n)} times).` : `My top word on Discord in ${y} was “${w}” (${fmt(n)} times).`)
    : (i ? `“${w}” is my #${i + 1} word on Discord, used ${fmt(n)} times.` : `My most-used word on Discord is “${w}”: ${fmt(n)} times.`),
  headline: `“${w}”`, sub: `My #${i + 1} word on Discord${y ? ` in ${y}` : ''} · ${fmt(n)} times`});
// Bump chart: one column per year, words placed by rank, lines joining a word across consecutive years.
function bump(target, years) {
  const tops = years.map(y => D.wordYears[y].slice(0, 10));
  const paths = new Map();
  tops.forEach((list, i) => list.forEach(([word, count], r) => { if (!paths.has(word)) paths.set(word, []); paths.get(word).push({i, r, count}); }));
  // Words that recur get a palette colour, most-recurring first; one-year words stay muted.
  const recurring = [...paths].filter(([, p]) => p.length > 1).sort((a, b) => b[1].length - a[1].length).map(([w]) => w);
  const color = w => recurring.includes(w) ? COLORS[recurring.indexOf(w) % COLORS.length] : 'var(--muted)';
  const host = $(target), w = Math.max(host.clientWidth, years.length * 92), T = 26, rh = 30, h = T + rh * 10 + 4, cw = w / years.length;
  const x = i => cw * (i + .5), y = r => T + rh * (r + .5), half = word => Math.min(cw / 2 - 6, fit(word).length * 3.4 + 2);
  const fit = word => word.length * 6.8 > cw - 12 ? word.slice(0, Math.max(3, Math.floor((cw - 12) / 6.8) - 1)) + '…' : word;
  frameFixed(target, w, h, 'Top 10 words for each year', () => {
    let s = years.map((yr, i) => `<text class="tick" x="${x(i)}" y="14" text-anchor="middle">${yr}</text>`).join('');
    for (const [word, pts] of paths) {
      const c = color(word);
      s += `<g class="bw">`;
      pts.forEach((p, k) => {
        const next = pts[k + 1];
        if (next && next.i === p.i + 1) s += `<path d="M${x(p.i) + half(word) + 4},${y(p.r)} C${x(p.i) + cw / 2},${y(p.r)} ${x(next.i) - cw / 2},${y(next.r)} ${x(next.i) - half(word) - 4},${y(next.r)}" fill="none" stroke="${c}" stroke-width="2" opacity=".75"/>`;
        s += `<text x="${x(p.i)}" y="${y(p.r) + 4}" text-anchor="middle" fill="${c}" style="fill:${c}" data-tip="${esc(word)} · #${p.r + 1} in ${years[p.i]} · ${fmt(p.count)} times" data-share-click ${shareAttr(wordShare(word, p.count, p.r, years[p.i]))}>${esc(fit(word))}</text>`;
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
  const ms = Object.keys(D.months);
  const peakYear = Object.entries(r.years).sort((a, b) => b[1] - a[1])[0][0];
  lastSearchShare = {text: `I've said “${r.query}” ${fmt(r.total)} times on Discord, most of all in ${peakYear}.`, headline: `“${quoteOf(r.query, 40)}”`, sub: `${fmt(r.total)} matching messages · Most in ${peakYear}`, chart: 'search-chart'};
  $('search-out').innerHTML = `<div class="sechead"><span></span><button class="share-btn" type="button" data-share-section="search">Share</button></div><div class="metrics">${metric(fmt(r.total), 'messages', lastSearchShare)}${metric(longDate(r.first.at.slice(0, 10)), 'first match')}${metric(peakYear, 'busiest year', lastSearchShare)}</div><div id="search-chart"></div><h3>Where you said it</h3><div class="rank" id="search-ranks" data-private></div><h3>Messages${r.total > r.results.length ? ` (${r.results.length} of ${fmt(r.total)}, spread over time)` : ''}</h3><div class="messages">${r.results.map(m => messageCard(m, r.query)).join('')}</div>`;
  const draw = () => $('search-chart') && lines('search-chart', ms, [{name: r.query, values: ms.map(m => r.months[m] || 0)}], {height: 200, title: `Messages containing ${r.query} per month`, tickLabel: m => m.slice(0, 4)});
  draw(); ranks('search-ranks', r.channels, 8);
  searchDraw = draw;
});
let searchDraw = () => {};

function channels() {
  let page = 0; const size = 10;
  $('ch-year').innerHTML = yearOptions();
  const results = () => {
    const q = $('ch-q').value.toLowerCase().trim(), t = $('ch-type').value, y = $('ch-year').value;
    return D.channels.filter(c => (!q || (c.name + ' ' + c.guild).toLowerCase().includes(q)) && (t === 'all' || c.group === t) && (y === 'all' || c.years[y]))
      .map(c => ({c, n: y === 'all' ? c.count : c.years[y]})).sort((a, b) => b.n - a.n);
  };
  const update = () => {
    const r = results(), last = Math.max(0, Math.ceil(r.length / size) - 1); page = Math.min(page, last);
    $('ch-label').textContent = `${fmt(r.length)} channels · ${fmt(r.reduce((a, x) => a + x.n, 0))} messages`;
    $('ch-rows').innerHTML = r.slice(page * size, page * size + size).map(({c, n}) => `<tr><td><button class="rowbutton" data-ch="${c.i}">${esc(c.name)}</button><br><small>${esc(c.guild || c.group)}</small></td><td><small>${c.first} → ${c.last}</small></td><td class="num">${fmt(n)}</td></tr>`).join('') || '<tr><td colspan="3">No channels match. Change the search or filters.</td></tr>';
    $('ch-page').textContent = `Page ${page + 1} of ${last + 1}`; $('ch-prev').disabled = page === 0; $('ch-next').disabled = page >= last;
  };
  ['ch-q', 'ch-type', 'ch-year'].forEach(id => $(id).oninput = () => { page = 0; update(); });
  $('ch-prev').onclick = () => { page--; update(); }; $('ch-next').onclick = () => { page++; update(); };
  $('ch-rows').onclick = e => {
    const b = e.target.closest('[data-ch]'); if (!b) return;
    const c = D.channels.find(x => x.i === +b.dataset.ch), ys = Object.keys(D.years).sort();
    $('ch-detail').classList.remove('hidden');
    $('ch-detail').innerHTML = `<strong>${esc(c.name)}</strong> <small>${esc(c.guild || c.group)} · ${esc(c.type)}</small><p>${fmt(c.count)} messages · ${fmt(c.words)} words · ${fmt(c.links)} messages with links · ${fmt(c.attachments)} messages with attachments</p><div id="ch-chart"></div>`;
    bars('ch-chart', ys.map(y => [y, c.years[y] || 0]), {height: 160, title: `Messages per year in ${c.name}`});
  };
  update();
}
function fame() {
  const F = D.fame, card = (title, m, extra = '', share) => m ? `<article ${shareAttr(share || {text: `${title.replace('Your', 'My')} on Discord (${m.at.slice(0, 10)}): “${quoteOf(m.text || '', 200)}”`, headline: `“${quoteOf(m.text || '…', 60)}”`, sub: `${title.replace('Your', 'my')} on Discord · ${longDate(m.at.slice(0, 10))}`})}><h3>${title}</h3><blockquote>${esc((m.text || 'Attachment only').slice(0, 1200))}</blockquote><small data-private>${esc(m.at)} · ${esc(m.channel)}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noreferrer">Open in Discord</a>` : ''}${extra}</small></article>` : '';
  const pk = D.peakDays[0], bm = D.bursts.bestMinute, ls = D.bursts.largestSessions[0];
  const said = (lead, m) => m && {text: `${lead} “${quoteOf(m.text || '…', 200)}”!`, headline: `“${quoteOf(m.text || '…', 60)}”`, sub: `${lead.replace(/ was$/, '')} · ${longDate(m.at.slice(0, 10))}`};
  $('fame').innerHTML = card('First message in this report', F.first, '', said('My first ever message on Discord was', F.first)) + card('Latest message in this report', F.last, '', said('My latest message on Discord was', F.last)) +
    (F.mostRepeated ? `<article ${shareAttr(sectionShare('fame'))}><h3>Your most repeated message</h3><blockquote>${esc(F.mostRepeated.text.slice(0, 300))}</blockquote><small>Sent ${fmt(F.mostRepeated.count)} times</small></article>` : '') +
    card('Your longest message', F.longest, F.longest ? ` · ${fmt([...F.longest.text].length)} characters` : '', F.longest && {text: `My longest Discord message ever was ${fmt([...F.longest.text].length)} characters long.`, headline: `${fmt([...F.longest.text].length)} characters`, sub: `Longest message · "${quoteOf(F.longest.text, 50)}"`}) +
    `<article ${shareAttr({text: `My Discord record: ${fmt(bm.count)} messages in 60 seconds!`, headline: `${fmt(bm.count)} messages`, sub: 'Messages in 60 seconds'})}><h3>Fastest minute</h3><p><strong style="font-size:28px">${fmt(bm.count)}</strong> messages in 60 seconds</p><small data-private>${esc(bm.at)} · ${esc(bm.channel || '')}</small></article>` +
    (ls ? `<article ${shareAttr({text: `My longest Discord session: ${fmt(ls[0])} messages without a 30-minute break.`, headline: `${fmt(ls[0])} messages`, sub: 'Messages without a 30-minute break'})}><h3>Most messages in a session</h3><p><strong style="font-size:28px">${fmt(ls[0])}</strong> messages without a 30-minute break</p><small>Started ${esc(ls[2])} · about ${fmt(Math.round(ls[1] / 60))} hours</small></article>` : '') +
    (pk ? `<article ${shareAttr({text: `My biggest day on Discord: ${fmt(pk.count)} messages on ${longDate(pk.date)}!`, headline: `${fmt(pk.count)} messages in a day`, sub: `My busiest day, ${longDate(pk.date)}`})}><h3>Busiest day</h3><p><strong style="font-size:28px">${fmt(pk.count)}</strong> messages on ${longDate(pk.date)}</p><small data-private>${esc(pk.contexts.map(c => c[0]).join(', '))}</small></article>` : '');
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
  overview(); rhythm(); people(); words(); channels(); fame(); roast(); dataQuality();
}
let resizeTimer, lastWidth = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastWidth) return; lastWidth = innerWidth; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (D) { draws.forEach(f => f()); searchDraw(); } }, 120); });
const links = [...document.querySelectorAll('#nav a')];
const observer = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), {rootMargin: '-40% 0px -55% 0px'});
document.querySelectorAll('section.card').forEach(s => observer.observe(s));
startWorker();
// Reopen the saved copy, if there is one, instead of asking for the zip again.
$('status').innerHTML = '<div>Checking for a saved report…</div>';
call('restore').then(info => info ? show(info) : ($('status').innerHTML = '')).catch(() => { $('status').innerHTML = ''; });
