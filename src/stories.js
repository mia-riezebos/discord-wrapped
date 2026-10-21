/* Story facts: what each story asks and answers, from a period report. Pure and the same in every theme, so the
   tests can import it. All page scripts share one scope, so only the exports below are top-level names. */

/** Sections that have stories, in report order. Ids match the report's data-share-section values. */
export const STORY_SECTIONS = [
  {id: 'overview', name: 'Overview'},
  {id: 'rhythm', name: 'Rhythm'},
  {id: 'people', name: 'People & servers'},
];

/**
 * The core stories for one period report, in reel order. `period` is the app's resolved period
 * ({kind, label, in, from, to}). Each story is {id, section, enough, question, answer, share, guess?, value, data}:
 * `enough` says whether the data carries the story; stories without enough data are dropped, except Overview's,
 * which always play. `data` holds whatever the scenes draw, so a theme can restyle a story without new facts.
 */
export function buildStories(report, period) {
  const T = report.totals, all = period.kind === 'all';
  const num = n => Number(n).toLocaleString();
  const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
  const day = (iso, year) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', day: 'numeric', month: 'short', ...(year ? {year: 'numeric'} : {})});
  // Running totals over all time take the present perfect: "have you sent", "I've sent".
  const did = (past, perfect) => all ? perfect : past;
  const stories = [];

  stories.push({
    id: 'messages', section: 'overview', enough: T.messages > 0,
    question: `How many messages ${did('did you send', 'have you sent')} ${period.in}?`,
    answer: plural(T.messages, 'message'),
    share: `${did('I sent', "I've sent")} ${plural(T.messages, 'message')} on Discord ${period.in}.`,
    // Log scale up to about 1,000 a day, so the slider's middle never sits on the answer.
    guess: {type: 'slider', scale: 'log', max: 1000 * T.calendarDays, tolerance: 0.15, unit: 'messages'},
    value: T.messages,
    data: {perDay: Math.round(T.messages / Math.max(1, T.calendarDays))},
  });

  stories.push({
    id: 'active-days', section: 'overview', enough: T.activeDays > 0,
    question: `How many days ${did('did you show up', 'have you shown up')} ${period.in}?`,
    answer: `${num(T.activeDays)} of ${plural(T.calendarDays, 'day')}`,
    share: `${did('I showed up', "I've shown up")} on Discord on ${num(T.activeDays)} of the ${plural(T.calendarDays, 'day')} ${period.in}.`,
    guess: {type: 'slider', scale: 'linear', max: T.calendarDays, tolerance: 0.1, unit: 'days'},
    value: T.activeDays,
    data: {of: T.calendarDays, pct: Math.round(100 * T.activeDays / Math.max(1, T.calendarDays)), days: report.days, from: report.range.from, to: report.range.to},
  });

  // The busiest bucket of the period's bar chart: a month in a year, a year across all time.
  const unit = report.unit, keys = Object.keys(report.periods).sort();
  const bucket = k => unit === 'year' ? k : unit === 'month' ? new Date(k + '-01T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', month: 'long', ...(all ? {year: 'numeric'} : {})})
    : unit === 'week' ? `the week of ${day(k, all)}` : day(k, all);
  const top = keys.reduce((a, k) => report.periods[k].total > report.periods[a].total ? k : a, keys[0]);
  const topCount = top ? report.periods[top].total : 0, topName = top ? bucket(top) : '';
  stories.push({
    id: 'loudest', section: 'overview', enough: keys.filter(k => report.periods[k].total).length > 1,
    question: `Which ${unit} were you loudest${all ? '' : ' ' + period.in}?`,
    answer: top ? `${topName}, with ${plural(topCount, 'message')}` : 'No messages yet',
    share: top ? `My loudest ${unit} on Discord ${period.in} was ${topName}, with ${plural(topCount, 'message')}.` : '',
    value: topCount,
    data: {unit, label: topName, top: keys.indexOf(top), buckets: keys.map(k => [k, report.periods[k].total])},
  });

  const [len = 0, from = '', to = ''] = report.streaks[0] || [];
  stories.push({
    id: 'streak', section: 'overview', enough: len > 1,
    question: all ? 'How many days in a row have you shown up?' : `How many days in a row did you show up ${period.in}?`,
    answer: len > 1 ? `${num(len)} days in a row, ${day(from, all)} to ${day(to, all)}` : len ? '1 day. No two days in a row.' : 'No streak yet',
    share: len > 1 ? `My longest Discord streak ${period.in}: ${num(len)} days in a row.` : '',
    value: len,
    data: {from, to, fromText: from && day(from, all), toText: to && day(to, all)},
  });

  /* ---------- Rhythm ---------- */
  // Hours are in the report's time zone.
  const H = report.hourly, hours = hs => hs.reduce((a, h) => a + H[h], 0);
  const night = hours([21, 22, 23, 0, 1, 2]), early = hours([5, 6, 7, 8, 9, 10]), owl = night >= early;
  stories.push({
    id: 'night-owl', section: 'rhythm', enough: night + early >= 10 && night !== early,
    question: `Night owl or early bird ${period.in}?`,
    answer: owl ? `Night owl, with ${plural(night, 'message')} from 9 pm to 3 am` : `Early bird, with ${plural(early, 'message')} from 5 to 11 am`,
    share: `${did('I was', "I'm")} ${owl ? 'a night owl' : 'an early bird'} on Discord ${period.in}: ${num(night)} messages from 9 pm to 3 am, ${num(early)} from 5 to 11 am.`,
    guess: {type: 'pick', answer: owl ? 'night' : 'early', options: [
      {key: 'night', label: 'Night owl', sub: '9 pm to 3 am', count: night},
      {key: 'early', label: 'Early bird', sub: '5 to 11 am', count: early},
    ]},
    value: owl ? night : early,
    data: {owl, hourly: H},
    card: {hero: owl ? 'Night owl' : 'Early bird', fact: `${num(night)} messages from 9 pm to 3 am, ${num(early)} from 5 to 11 am.`,
      chart: {buckets: H.map((n, h) => [String(h).padStart(2, '0'), n]), top: H.indexOf(Math.max(...H))}},
  });

  // The busiest day, against an average day you showed up.
  const pk = report.peakDays[0], [quote = '', quoted = 0] = pk?.topText || [];
  const longDay = (iso, opts) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', ...opts});
  const dayOpts = {day: 'numeric', month: 'long', ...(all ? {year: 'numeric'} : {})};
  const pkText = pk ? longDay(pk.date, {weekday: 'long', ...dayOpts}) : '', times = pk ? Math.round(pk.count * T.activeDays / Math.max(1, T.messages)) : 0;
  stories.push({
    id: 'biggest-day', section: 'rhythm', enough: !!pk && T.activeDays > 1,
    question: `${did('What was', "What's been")} your biggest day ${period.in}?`,
    answer: pk ? `${pkText}, with ${plural(pk.count, 'message')}` : 'No messages yet',
    share: pk ? `My biggest day on Discord ${period.in} was ${pkText}, with ${plural(pk.count, 'message')}.` : '',
    value: pk?.count || 0,
    // A message repeated in over a fifth of the day's messages is worth quoting.
    data: {parts: pk ? [longDay(pk.date, {weekday: 'long'}), longDay(pk.date, dayOpts)] : [], times, quote: quoted > (pk?.count || 0) * 0.2 ? [quote.slice(0, 60), quoted] : null},
    card: {hero: num(pk?.count || 0), fact: `Messages on ${pkText}.${times > 1 ? ` About ${times}× your usual day.` : ''}`,
      list: report.peakDays.slice(0, 5).map(p => [day(p.date, all), p.count])},
  });

  const fast = report.bursts.bestMinute, fastWhen = fast.at ? `${day(fast.at.slice(0, 10), all)} at ${fast.at.slice(11, 16)}` : '';
  stories.push({
    id: 'fastest-minute', section: 'rhythm', enough: fast.count >= 5,
    question: `What was your fastest minute ${period.in}?`,
    answer: `${plural(fast.count, 'message')} in one minute, on ${fastWhen}`,
    share: `My fastest minute on Discord ${period.in}: ${plural(fast.count, 'message')} in 60 seconds.`,
    value: fast.count,
    data: {when: fastWhen, every: +(60 / Math.max(1, fast.count)).toFixed(1)},
    card: {hero: num(fast.count), fact: `Messages in one minute, on ${fastWhen}.`},
  });

  /* ---------- People & servers ---------- */
  const GROUPS = [['Servers', 'servers'], ['DMs', 'DMs'], ['Group DMs', 'group DMs']];
  const counts = GROUPS.map(([g]) => Object.values(report.periods).reduce((a, p) => a + (p[g] || 0), 0)), sent = counts.reduce((a, n) => a + n, 0);
  // Whole percentages that add up to 100: round down, then give the points left to the biggest remainders.
  const exact = counts.map(n => sent ? 100 * n / sent : 0), pcts = exact.map(Math.floor);
  exact.map((x, k) => [x - pcts[k], k]).sort((a, b) => b[0] - a[0]).slice(0, sent ? 100 - pcts.reduce((a, x) => a + x, 0) : 0).forEach(([, k]) => pcts[k]++);
  const went = GROUPS.map(([label, word], k) => ({label, word, count: counts[k], pct: pcts[k]})).filter(g => g.count).sort((a, b) => b.count - a.count);
  const wentText = went.filter(g => g.pct).map(g => `${g.pct}% to ${g.word}`).join(', ').replace(/, ([^,]*)$/, ' and $1');
  stories.push({
    id: 'where', section: 'people', enough: went.length > 1,
    question: `Where ${did('did your messages go', 'have your messages gone')} ${period.in}?`,
    answer: went.length ? wentText[0].toUpperCase() + wentText.slice(1) : 'No messages yet',
    share: `Where my Discord messages ${did('went', 'have gone')} ${period.in}: ${wentText}.`,
    value: went[0]?.pct || 0,
    data: {groups: went},
    card: {hero: `${went[0]?.pct || 0}%`, fact: `Of your messages went to ${went[0]?.word || 'servers'}.`, list: went.map(g => [g.label, g.count])},
  });

  const G = report.guilds, inServers = G.reduce((a, g) => a + g.count, 0), server = G[0] || {name: '', count: 0};
  const serverPct = Math.round(100 * server.count / Math.max(1, inServers)), servers = G.slice(0, 5).map(g => [g.name, g.count]);
  stories.push({
    id: 'top-server', section: 'people', enough: G.length > 1,
    question: `Which server ${did('did you talk in', 'have you talked in')} most ${period.in}?`,
    answer: `${server.name}, with ${plural(server.count, 'message')}`,
    share: `My top Discord server ${period.in}: ${server.name}, with ${plural(server.count, 'message')}.`,
    value: server.count,
    data: {name: server.name, pct: serverPct, ranked: servers},
    card: {hero: server.name, fact: `${plural(server.count, 'message')}, ${serverPct}% of what you sent in servers.`, list: servers, names: servers.map(([name]) => name)},
  });

  // DM names are private: they show in the reel and on the card (where Redaction can hide them), never in the post.
  const dms = report.channels.filter(c => c.group === 'DMs').sort((a, b) => b.count - a.count);
  const inDms = dms.reduce((a, c) => a + c.count, 0), dm = dms[0] || {name: '', count: 0}, dmPct = Math.round(100 * dm.count / Math.max(1, inDms));
  stories.push({
    id: 'top-dm', section: 'people', enough: dms.length >= 3,
    question: `Who ${did('did you DM', 'have you DMed')} most ${period.in}?`,
    answer: `${dm.name}, with ${plural(dm.count, 'message')}`,
    share: `${did('I sent', "I've sent")} ${plural(dm.count, 'message')} to the person I DMed most ${period.in}.`,
    // Seeded by period, so a replay asks the same three names in the same order.
    guess: {type: 'pick', answer: dm.id, options: pickSet(dms.map(c => ({key: c.id, label: c.name, count: c.count})), `top-dm:${period.label}`)},
    value: dm.count,
    data: {name: dm.name, pct: dmPct},
    card: {hero: dm.name, fact: `${plural(dm.count, 'message')}, ${dmPct}% of your DMs.`, names: [dm.name]},
  });

  const circle = dms.slice(0, 10), circlePct = Math.round(100 * circle.reduce((a, c) => a + c.count, 0) / Math.max(1, inDms));
  stories.push({
    id: 'inner-circle', section: 'people', enough: dms.length > 10,
    question: `How much of your DMing ${did('went', 'has gone')} to just ten people ${period.in}?`,
    answer: `${circlePct}% of your DMs to your top 10, out of ${plural(dms.length, 'conversation')}`,
    share: `${circlePct}% of my Discord DMs ${period.in} ${did('went', 'have gone')} to just ten people, out of ${plural(dms.length, 'conversation')}.`,
    value: circlePct,
    data: {conversations: dms.length, names: circle.map(c => c.name)},
    card: {hero: `${circlePct}%`, fact: `Of your DM messages went to your top 10, out of ${plural(dms.length, 'conversation')}.`},
  });

  const order = STORY_SECTIONS.map(s => s.id);
  return stories.filter(s => s.enough || s.section === 'overview').sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
