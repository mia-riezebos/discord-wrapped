/* Story facts: what each story asks and answers, from a period report. Pure and the same in every theme, so the
   tests can import it. All page scripts share one scope, so only the exports below are top-level names. */

/** Sections that have stories, in report order. Ids match the report's data-share-section values. */
export const STORY_SECTIONS = [
  {id: 'overview', name: 'Overview'},
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
