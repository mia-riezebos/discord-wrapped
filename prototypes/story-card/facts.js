// PROTOTYPE (issue #20). Facts for eight core stories, copied from default-theme/facts.js and extended with what a
// share card needs. Facts are the same in every card variant; the card builder only decides how they look.
//
// Rich text: an array of plain strings and marked runs, so redaction knows what each word is.
//   N(x) a server or channel name   P(x) a private name (DM or group DM): left off share cards by default
//   Q(x) a quoted message           W(x) a ranked word
export const fmt = n => Number(n).toLocaleString('en-GB');
export const N = t => ({t, kind: 'N'});
export const P = t => ({t, kind: 'P'});
export const Q = t => ({t, kind: 'Q'});
export const W = t => ({t, kind: 'W'});
export const plain = rich => rich.map(r => typeof r === 'string' ? r : r.t).join('');
const DAY = 864e5;
const iso = d => new Date(d * DAY).toISOString().slice(0, 10);
export const longDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'});
export const shortDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});
const monthName = k => new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', {month: 'long', timeZone: 'UTC'});
const nice = v => { const p = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
const quoteOf = (t, n) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function pickOptions(list, rand) {
  const pool = list.slice(1, 10), picks = [];
  while (picks.length < 2 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const opts = [list[0], ...picks];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return opts;
}

// period: '2025', '2020' or 'all'
export function buildStories(D, period, opts = {}) {
  const rand = rng(opts.seed ?? 7), t = D.totals, S = [];
  const all = period === 'all', since = D.range.from.slice(0, 4);
  const per = all ? {label: 'All time', in: `since ${since}`, of: 'ever'} : {label: period, in: `in ${period}`, of: `of ${period}`};

  // Messages: slider guess. Card graphic: messages per bucket (months for a year, years for all time).
  {
    const ks = Object.keys(D.periods).sort(), vals = ks.map(k => D.periods[k].total), hi = vals.indexOf(Math.max(...vals));
    S.push({
      id: 'messages', section: 'Overview', label: 'How many messages',
      question: `How many messages did you send ${per.in}?`, value: t.messages,
      guess: {type: 'slider', unit: 'messages', tolerance: .15, samples: {right: nice(t.messages * 1.04), wrong: nice(t.messages * .36)}},
      hero: {text: fmt(t.messages), kind: 'number'}, unit: ['messages'],
      sub: [`That's ${fmt(Math.round(t.messages / t.calendarDays))} a day. Loudest in ${all ? ks[hi] : monthName(ks[hi])}.`],
      graphic: {type: 'columns', values: vals, hi, labels: ks.map(k => all ? k.slice(2) : monthName(k)[0])},
      share: [`I sent ${fmt(t.messages)} messages on Discord ${per.in}.`],
    });
  }
  // Longest streak. Card graphic: the calendar with the streak lit.
  const st = D.streaks[0];
  if (st && st[0] > 1) {
    const [len, from, to] = st;
    S.push({
      id: 'streak', section: 'Overview', label: 'Longest streak',
      question: 'How many days in a row did you show up?', value: len,
      hero: {text: fmt(len), kind: 'number'}, unit: ['days in a row'],
      sub: [`${shortDate(from)} to ${to === D.range.to && !all ? 'the last day of the year' : shortDate(to)}.`],
      graphic: {type: 'calendar', days: new Set(D.days.map(d => iso(d[0]))), from: D.range.from, to: D.range.to, lit: [from, to], all},
      share: [`My longest Discord streak ${per.in}: ${fmt(len)} days in a row.`],
    });
  }
  // Night owl or early bird: pick-one guess. 9 pm to 3 am against 5 am to 11 am.
  {
    const h = D.hourly, night = [21, 22, 23, 0, 1, 2].reduce((a, k) => a + h[k], 0), morning = [5, 6, 7, 8, 9, 10].reduce((a, k) => a + h[k], 0);
    const owl = night >= morning, pct = Math.round(100 * (owl ? night : morning) / t.messages);
    const ans = owl ? 'Night owl' : 'Early bird';
    S.push({
      id: 'night-owl', section: 'Rhythm', label: 'Night owl or early bird',
      question: 'Are you a night owl or an early bird?',
      guess: {type: 'pick', options: ['Night owl', 'Early bird'], correct: ans, samples: {right: ans, wrong: owl ? 'Early bird' : 'Night owl'}},
      hero: {text: ans, kind: 'word'}, unit: [`${pct}% of my messages`],
      sub: [owl ? 'came between 9 pm and 3 am.' : 'came between 5 am and 11 am.'],
      graphic: {type: 'hours', values: h, band: owl ? [21, 22, 23, 0, 1, 2] : [5, 6, 7, 8, 9, 10]},
      share: [`I'm a ${ans.toLowerCase()} on Discord: ${pct}% of my messages ${per.in} came ${owl ? 'between 9 pm and 3 am' : 'between 5 am and 11 am'}.`],
    });
  }
  // Biggest day. Card graphic: every day of the period, the biggest one lit.
  const pk = D.peakDays[0];
  if (pk && pk.count > 0) {
    const ctx = pk.contexts.slice(0, 2).map(c => c[0]);
    const named = c => c === 'DMs' || c === 'Group DMs' ? c : N(c);
    const mostly = ctx.length > 1 ? ['mostly in ', named(ctx[0]), ' and ', named(ctx[1])] : ctx.length ? ['mostly in ', named(ctx[0])] : [];
    const days = all ? null : D.days;
    S.push({
      id: 'biggest-day', section: 'Rhythm', label: 'Biggest day',
      question: `What was your biggest day ${per.of}?`, value: pk.count,
      hero: {text: new Date(pk.date + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'long', ...(all ? {year: 'numeric'} : {}), timeZone: 'UTC'}), kind: 'date'},
      unit: [`${fmt(pk.count)} messages`], sub: [`A ${new Date(pk.date + 'T00:00:00Z').toLocaleDateString('en-GB', {weekday: 'long', timeZone: 'UTC'})}, `, ...mostly, '.'],
      graphic: days ? {type: 'days', days, from: D.range.from, to: D.range.to, hi: pk.day} : null,
      share: [`My biggest Discord day ${per.of}: ${fmt(pk.count)} messages on ${longDate(pk.date)}, `, ...mostly, '.'],
    });
  }
  // Top server. Card graphic: the top five servers as bars; the bar labels are names too.
  if (D.guilds.length) {
    const top = D.guilds.slice(0, 5);
    S.push({
      id: 'top-server', section: 'People & servers', label: 'Top server',
      question: `Where did you talk most ${per.in}?`,
      hero: {rich: [N(top[0].name)], kind: 'name'}, unit: [`${fmt(top[0].count)} messages`],
      sub: [`${Math.round(100 * top[0].count / t.messages)}% of everything I sent.`],
      graphic: {type: 'bars', items: top.map(g => [[N(g.name)], g.count]), hi: 0},
      share: [`My top Discord server ${per.in} was `, N(top[0].name), `, with ${fmt(top[0].count)} messages.`],
    });
  }
  // Who you DMed most: pick-one guess. Private: the reel shows the names, the card leaves them out by default.
  const dms = D.channels.filter(c => c.group === 'DMs').sort((a, b) => b.count - a.count);
  if (dms.length >= 3) {
    const options = pickOptions(dms.map(c => c.name), rand), wrong = options.find(o => o !== dms[0].name);
    S.push({
      id: 'top-dm', section: 'People & servers', label: 'Who you DMed most',
      question: `Who did you DM most ${per.in}?`,
      guess: {type: 'pick', options, correct: dms[0].name, private: true, samples: {right: dms[0].name, wrong}},
      hero: {rich: [P(dms[0].name)], kind: 'name'}, unit: [`${fmt(dms[0].count)} messages`],
      sub: [`Then `, P(dms[1].name), ` and `, P(dms[2].name), '.'],
      graphic: {type: 'bars', items: dms.slice(0, 5).map(c => [[P(c.name)], c.count]), hi: 0},
      share: [`The person I DMed most ${per.in} was `, P(dms[0].name), `: ${fmt(dms[0].count)} messages.`],
    });
  }
  // Top word: pick-one guess. Card graphic: the top five words as bars.
  if (D.words.length >= 3) {
    const top = D.words[0], options = pickOptions(D.words.map(w => w[0]), rand), wrong = options.find(o => o !== top[0]);
    S.push({
      id: 'top-word', section: 'Words & links', label: 'Top word',
      question: `Which word did you use most ${per.in}?`, value: top[1],
      guess: {type: 'pick', options, correct: top[0], samples: {right: top[0], wrong}},
      hero: {rich: [W(top[0])], kind: 'word'}, unit: [`${fmt(top[1])} times`],
      sub: ['Then ', W(D.words[1][0]), ', ', W(D.words[2][0]), ' and ', W(D.words[3][0]), '.'],
      graphic: {type: 'bars', items: D.words.slice(0, 5).map(w => [[W(w[0])], w[1]]), hi: 0},
      share: [`My top word on Discord ${per.in} was “`, W(top[0]), `”: ${fmt(top[1])} times.`],
    });
  }
  // The thing you say most: a quoted message. Card graphic: the messages you repeat most.
  const mr = D.fame.mostRepeated;
  if (mr) {
    const ex = D.expressions.slice(0, 5), hi = Math.max(0, ex.findIndex(e => e[0] === mr.text.toLowerCase()));
    S.push({
      id: 'say-most', section: 'Words & links', label: 'The thing you say most',
      question: `What did you say most ${per.in}?`, value: mr.count,
      hero: {rich: [Q(quoteOf(mr.text, 60))], kind: 'quote'}, unit: [`${fmt(mr.count)} times`],
      sub: [`As a whole message, not inside one.`],
      graphic: {type: 'bars', items: ex.map(e => [[Q(quoteOf(e[0], 24))], e[1]]), hi, quoted: true},
      share: [`The thing I said most on Discord ${per.in}: “`, Q(quoteOf(mr.text, 80)), `”, ${fmt(mr.count)} times.`],
    });
  }
  return S;
}

// Guess scoring, as in default-theme/facts.js. `raw` is the guess; returns what the card receives.
export function score(story, raw) {
  if (raw == null) return {skipped: true};
  const g = story.guess;
  if (g.type === 'pick') return {value: raw, right: raw === g.correct, correct: g.correct};
  const ratio = raw / story.value, off = Math.abs(ratio - 1);
  return {value: raw, right: off <= g.tolerance, ratio, correct: story.value};
}
