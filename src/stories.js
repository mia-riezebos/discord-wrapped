/* Story facts: what each story asks and answers, from a period report. Pure and the same in every theme, so the
   tests can import it. All page scripts share one scope, so only the exports below are top-level names. */

/** Sections that have stories, in report order. Ids match the report's data-share-section values. */
export const STORY_SECTIONS = [
  {id: 'overview', name: 'Overview'},
  {id: 'rhythm', name: 'Rhythm'},
  {id: 'people', name: 'People & servers'},
  {id: 'words', name: 'Words & links'},
  {id: 'fame', name: 'Hall of fame'},
];

/**
 * The site a message opens with ("youtube.com"), when it opens with a web link; '' otherwise. Quotes stop at a link,
 * so a message that starts with one has no words to quote: share copy and stories describe it as a link instead (#21).
 */
export function linkHost(text) {
  const url = /^\s*<?((?:https?:\/\/|www\.)[^\s<>]+)/i.exec(text || '')?.[1];
  if (!url) return '';
  try { return new URL(/^www\./i.test(url) ? 'https://' + url : url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

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
  const pk = report.peakDays[0], [quote = '', quoteN = 0] = pk?.topText || [];
  const longDay = (iso, opts) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', ...opts});
  const dayOpts = {day: 'numeric', month: 'long', ...(all ? {year: 'numeric'} : {})};
  const pkText = pk ? longDay(pk.date, {weekday: 'long', ...dayOpts}) : '', usual = pk ? Math.round(pk.count * T.activeDays / Math.max(1, T.messages)) : 0;
  stories.push({
    id: 'biggest-day', section: 'rhythm', enough: !!pk && T.activeDays > 1,
    question: `${did('What was', "What's been")} your biggest day ${period.in}?`,
    answer: pk ? `${pkText}, with ${plural(pk.count, 'message')}` : 'No messages yet',
    share: pk ? `My biggest day on Discord ${period.in} was ${pkText}, with ${plural(pk.count, 'message')}.` : '',
    value: pk?.count || 0,
    // A message repeated in over a fifth of the day's messages is worth quoting.
    data: {parts: pk ? [longDay(pk.date, {weekday: 'long'}), longDay(pk.date, dayOpts)] : [], times: usual, quote: quoteN > (pk?.count || 0) * 0.2 ? [quote.slice(0, 60), quoteN] : null},
    card: {hero: num(pk?.count || 0), fact: `Messages on ${pkText}.${usual > 1 ? ` About ${usual}× your usual day.` : ''}`,
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

  /* ---------- Words & links ---------- */
  // Ranked lists are [text, count], most first. A top pick said only once isn't a habit, so it needs a count of 2.
  const times = n => plural(n, 'time'), quoted = t => `“${t}”`;
  const [word = '', wordN = 0] = report.words[0] || [];
  stories.push({
    id: 'top-word', section: 'words', enough: report.words.length >= 3,
    question: `Which word ${did('did you use', 'have you used')} most ${period.in}?`,
    answer: `${quoted(word)}, ${times(wordN)}`,
    share: `My top word on Discord ${period.in} was ${quoted(word)}. ${did('I used', "I've used")} it ${times(wordN)}.`,
    // Seeded by period, so a replay asks the same three words in the same order.
    guess: {type: 'pick', answer: word, options: pickSet(report.words.slice(0, 10).map(([w, n]) => ({key: w, label: w, count: n})), `top-word:${period.label}`)},
    value: wordN,
    data: {word},
    card: {hero: quoted(word), fact: `Used ${times(wordN)}.`, list: report.words.slice(0, 5)},
  });

  const [said = '', saidN = 0] = report.expressions[0] || [];
  stories.push({
    id: 'say-most', section: 'words', enough: saidN >= 2,
    question: `What ${did('did you say', 'have you said')} most ${period.in}?`,
    answer: `${quoted(said)}, ${times(saidN)}`,
    share: `${did('I sent', "I've sent")} ${quoted(said)} ${times(saidN)} on Discord ${period.in}. A whole message, every time.`,
    value: saidN,
    data: {text: said},
    card: {hero: quoted(said), fact: `Sent ${times(saidN)} as a whole message.`, list: report.expressions.slice(0, 5).map(([t, n]) => [quoted(t), n])},
  });

  // Custom emoji only: the export writes them as <:name:id>; other emoji are plain text.
  const [emoji = '', emojiN = 0] = report.emoji[0] || [];
  stories.push({
    id: 'emoji', section: 'words', enough: emojiN >= 2,
    question: `Which custom emoji ${did('did you use', 'have you used')} most ${period.in}?`,
    answer: `:${emoji}:, ${times(emojiN)}`,
    share: `:${emoji}: was my most-used custom emoji on Discord ${period.in}. ${did('I used', "I've used")} it ${times(emojiN)}.`,
    value: emojiN,
    data: {name: `:${emoji}:`, ranked: report.emoji.slice(1, 7).map(([e]) => `:${e}:`)},
    card: {hero: `:${emoji}:`, fact: `Used ${times(emojiN)}.`, list: report.emoji.slice(0, 5).map(([e, n]) => [`:${e}:`, n])},
  });

  const [site = '', siteN = 0] = report.domains[0] || [], sites = report.domains.slice(0, 5);
  stories.push({
    id: 'links', section: 'words', enough: siteN >= 2,
    question: `Where ${did('did your links go', 'have your links gone')} ${period.in}?`,
    answer: `${site}, with ${num(siteN)} of your ${plural(T.urls, 'link')}`,
    share: `${site} was my most-linked site ${period.in}. ${did('I shared', "I've shared")} it ${times(siteN)} on Discord.`,
    value: siteN,
    data: {site, of: T.urls, ranked: sites},
    card: {hero: site, fact: `${num(siteN)} of your ${plural(T.urls, 'link')}.`, list: sites},
  });

  /* ---------- Hall of fame ---------- */
  // Quotes are exact prefixes, cut at a word.
  const clip = (t, max) => t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '').trimEnd() + '…';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const first = report.fame.first, firstText = first?.text || '', host = linkHost(firstText);
  // A message that opens with a link reads as the link's site, never as an empty quote (#21).
  const firstSaid = !firstText ? 'an attachment' : host ? `a link to ${host}` : quoted(clip(firstText, 60));
  const firstDay = first ? day(first.at.slice(0, 10), all) : '';
  stories.push({
    id: 'first-message', section: 'fame', enough: !!first,
    question: all ? 'What was your first ever message?' : `What was your first message ${period.in}?`,
    answer: `${cap(firstSaid)}, on ${firstDay}`,
    share: all ? `My first ever message on Discord was ${firstSaid}!` : `My first Discord message ${period.in} was ${firstSaid}.`,
    value: null,
    data: {text: clip(firstText, 200), host, date: firstDay},
    card: {hero: cap(host || !firstText ? firstSaid : quoted(clip(firstText, 40))), fact: `Sent on ${firstDay}.`},
  });

  // The worker skips messages with links when it picks the longest, so its text always quotes.
  const longest = report.fame.longest?.text || '', chars = [...longest].length;
  const lastBucket = report.lengths.findLastIndex(([, n]) => n > 0);
  stories.push({
    id: 'longest-message', section: 'fame', enough: chars > 0 && T.messages > 1,
    question: `How long was your longest message ${period.in}?`,
    answer: plural(chars, 'character'),
    share: `${plural(chars, 'character')} in one Discord message. My longest ${period.in} starts ${quoted(clip(longest, 40))}.`,
    value: chars,
    data: {text: clip(longest, 1200)},
    card: {hero: num(chars), fact: `${chars === 1 ? 'Character' : 'Characters'} in your longest message.`, chart: {buckets: report.lengths, top: lastBucket}},
  });

  // Sessions are runs of messages with no gap of 30 minutes; the worker gives [messages, minutes, local start].
  const [run = 0, mins = 0, began = ''] = report.bursts.largestSessions[0] || [];
  const lasted = mins < 60 ? plural(Math.max(1, mins), 'minute') : plural(Math.round(mins / 60), 'hour');
  stories.push({
    id: 'longest-session', section: 'fame', enough: run >= 2,
    question: `How long was your longest session ${period.in}?`,
    answer: `${plural(run, 'message')} over ${lasted}`,
    share: `I once sent ${plural(run, 'Discord message')} over ${lasted} ${period.in}, without a 30-minute break.`,
    value: run,
    data: {lasted, began: began && `${day(began.slice(0, 10), all)}, ${began.slice(11, 16)}`},
    card: {hero: num(run), fact: `Messages over ${lasted}, never 30 minutes apart.`},
  });

  const order = STORY_SECTIONS.map(s => s.id);
  return stories.filter(s => s.enough || s.section === 'overview').sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
