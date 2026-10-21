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

/** The summary heading for a reel of `period`: the whole period, or the stories of one `section` id. */
export function reelEnding(period, section) {
  const name = STORY_SECTIONS.find(s => s.id === section)?.name, all = period.kind === 'all';
  if (name) return `${all ? "That's" : 'That was'} your ${name} ${period.in}`;
  return all ? `That's you on Discord ${period.in}` : `That was your ${period.label}`;
}

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
 * A message as it reads in Discord, links and all; the report shows messages this way. The export writes mentions and
 * custom emoji as markup with ids (<@id>, <@&id>, <#id>, <:name:id>), and has no names for them: a person reads as
 * @someone, a role as @role, a channel as "a channel" (posts never carry a #), a custom emoji as :name:.
 */
export function discordText(text) {
  return String(text || '').replace(/<a?(:\w+:)\d+>/g, '$1').replace(/<@!?\d+>/g, '@someone').replace(/<@&\d+>/g, '@role')
    .replace(/<#\d+>/g, 'a channel');
}

/** A message as a story or share quotes it: as it reads in Discord (discordText), stopping at a link with an ellipsis. */
export function plainText(text) {
  return discordText(text).replace(/\s*<?\b(?:https?:\/\/|www\.)[\s\S]*$/i, '…');
}

/** Whether a message is nothing but mentions, so it reads as "a mention" instead of a quote of placeholders. */
export function onlyMentions(text) {
  return /^(?:\s*<(?:@[!&]?|#)\d+>)+\s*$/.test(text || '');
}

/**
 * The core stories for one period report, in reel order. `period` is the app's resolved period
 * ({kind, label, in, from, to}). Each story is {id, section, enough, question, answer, share, guess?, value, data, card}:
 * `enough` says whether the data carries the story; stories without enough data are dropped, except Overview's,
 * which always play. `data` holds whatever the scenes draw, so a theme can restyle a story without new facts.
 * `card` is what the story's share card shows (story-card.js), every string final copy:
 *   {hero, fact, chart?: {buckets: [[label, count]], top}, list?: [[label, count]], names?: [name]}
 * hero is the big number or word and fact one line under it. A card has at most one of chart (bars in the report's
 * buckets, bucket `top` highlighted) and list (a short ranked list, at most 5). names lists every personal name the
 * card or the story's own frame shows (its share image), so Redaction's names toggle can hide them; a hero that is a hidden name shows the story's value instead.
 */
export function buildStories(report, period) {
  const T = report.totals, all = period.kind === 'all';
  const num = n => Number(n).toLocaleString();
  const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
  // Quotes and names are exact prefixes, cut at a word.
  const clip = (t, max) => t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '').trimEnd() + '…';
  const day = (iso, year) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', day: 'numeric', month: 'short', ...(year ? {year: 'numeric'} : {})});
  // Running totals over all time take the present perfect: "have you sent", "I've sent".
  const did = (past, perfect) => all ? perfect : past;
  // Answers carry no "you" or "my": the summary lists them without their questions, and its post quotes them as mine.
  const none = `No messages ${period.in}`, silent = `${did('I sent', "I've sent")} no messages on Discord ${period.in}.`, perDay = Math.round(T.messages / Math.max(1, T.calendarDays));
  // An empty card: "No messages" over "In 2025."
  const blank = {hero: 'No messages', fact: `${period.in[0].toUpperCase()}${period.in.slice(1)}.`};
  const stories = [];
  // The period's bar chart buckets: months in a year, years across all time. A card chart labels them as the report does.
  const unit = report.unit, keys = Object.keys(report.periods).sort();
  const short = k => unit === 'year' ? k : unit === 'month' ? new Date(k + '-01T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', month: 'short', ...(all ? {year: '2-digit'} : {})}) : day(k);
  const chartOf = (field, top) => ({buckets: keys.map(k => [short(k), report.periods[k][field] || 0]), top});
  const busiest = field => keys.reduce((a, k, i) => (report.periods[k][field] || 0) > (report.periods[keys[a]][field] || 0) ? i : a, 0);

  stories.push({
    id: 'messages', section: 'overview', enough: T.messages > 0,
    question: `How many messages ${did('did you send', 'have you sent')} ${period.in}?`,
    answer: plural(T.messages, 'message'),
    share: `${did('I sent', "I've sent")} ${plural(T.messages, 'message')} on Discord ${period.in}.${perDay > 1 ? ` About ${num(perDay)} a day.` : ''}`,
    // Log scale up to about 1,000 a day, so the slider's middle never sits on the answer.
    guess: {type: 'slider', scale: 'log', max: 1000 * T.calendarDays, tolerance: 0.15, unit: 'messages'},
    value: T.messages,
    data: {perDay},
    card: {hero: num(T.messages), fact: perDay > 1 ? `About ${num(perDay)} a day.` : `${T.messages === 1 ? 'Message' : 'Messages'} ${period.in}.`, chart: chartOf('total', busiest('total'))},
  });

  // An active day is a day with a message sent, so the copy says posted, not "showed up".
  stories.push({
    id: 'active-days', section: 'overview', enough: T.activeDays > 0,
    question: `How many days ${did('did you post', 'have you posted')} ${period.in}?`,
    answer: `Active on ${num(T.activeDays)} of ${plural(T.calendarDays, 'day')}`,
    share: `${did('I sent', "I've sent")} a Discord message on ${num(T.activeDays)} of the ${plural(T.calendarDays, 'day')} ${period.in}.${T.activeDays === T.calendarDays && T.calendarDays > 1 ? ' Every single day.' : ''}`,
    guess: {type: 'slider', scale: 'linear', max: T.calendarDays, tolerance: 0.1, unit: 'days'},
    value: T.activeDays,
    data: {of: T.calendarDays, pct: Math.round(100 * T.activeDays / Math.max(1, T.calendarDays)), days: report.days, from: report.range.from, to: report.range.to},
    card: {hero: plural(T.activeDays, 'day'), fact: `Out of ${num(T.calendarDays)}. That's ${Math.round(100 * T.activeDays / Math.max(1, T.calendarDays))}%.`, chart: chartOf('activeDays', busiest('activeDays'))},
  });

  // The busiest bucket of the period's bar chart: a month in a year, a year across all time.
  const bucket = k => unit === 'year' ? k : unit === 'month' ? new Date(k + '-01T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', month: 'long', ...(all ? {year: 'numeric'} : {})})
    : unit === 'week' ? `the week of ${day(k, all)}` : day(k, all);
  const top = keys.reduce((a, k) => report.periods[k].total > report.periods[a].total ? k : a, keys[0]);
  const topCount = top ? report.periods[top].total : 0, topName = top ? bucket(top) : '';
  stories.push({
    id: 'loudest', section: 'overview', enough: keys.filter(k => report.periods[k].total).length > 1,
    question: `Which ${unit} were you loudest${all ? '' : ' ' + period.in}?`,
    answer: top ? `Loudest in ${topName}, with ${plural(topCount, 'message')}` : none,
    // A year across all time is over, but the record still stands: "has been … so far".
    share: !top ? silent : all ? `${topName} has been my loudest ${unit} on Discord so far, with ${plural(topCount, 'message')}.`
      : `${topName} was my loudest ${unit} on Discord ${period.in}, with ${plural(topCount, 'message')}.`,
    value: topCount,
    data: {unit, label: topName, top: keys.indexOf(top), buckets: keys.map(k => [k, report.periods[k].total])},
    card: {...top ? {hero: topName, fact: `${plural(topCount, 'message')}.`} : blank, chart: chartOf('total', keys.indexOf(top))},
  });

  const [len = 0, from = '', to = ''] = report.streaks[0] || [];
  stories.push({
    id: 'streak', section: 'overview', enough: len > 1,
    question: all ? 'How many days in a row have you posted?' : `How many days in a row did you post ${period.in}?`,
    answer: len > 1 ? `${num(len)} days in a row, ${day(from, all)} to ${day(to, all)}` : len ? '1 day. No two days in a row.' : none,
    share: !len ? silent
      : all ? `My longest Discord streak ${period.in} is ${len > 1 ? `${num(len)} days in a row, ${day(from, all)} to ${day(to, all)}` : '1 day. No two days in a row'}.`
      : len > 1 ? `I sent a Discord message every day for ${num(len)} days straight ${period.in}.` : `My longest Discord streak ${period.in} was 1 day. No two days in a row.`,
    value: len,
    data: {from, to, fromText: from && day(from, all), toText: to && day(to, all)},
    card: len > 1 ? {hero: `${num(len)} days`, fact: `In a row, ${day(from, all)} to ${day(to, all)}.`} : len ? {hero: '1 day', fact: 'No two days in a row.'} : blank,
  });

  /* ---------- Rhythm ---------- */
  // Hours are in the report's time zone.
  const H = report.hourly, hours = hs => hs.reduce((a, h) => a + H[h], 0);
  const night = hours([21, 22, 23, 0, 1, 2]), early = hours([5, 6, 7, 8, 9, 10]), owl = night >= early;
  // The winning window first: "600 messages from 9 pm to 3 am, 60 from 5 to 11 am".
  const few = n => n ? num(n) : 'none';
  const split = owl ? `${plural(night, 'message')} from 9 pm to 3 am, ${few(early)} from 5 to 11 am` : `${plural(early, 'message')} from 5 to 11 am, ${few(night)} from 9 pm to 3 am`;
  stories.push({
    id: 'night-owl', section: 'rhythm', enough: night + early >= 10 && night !== early,
    question: `Night owl or early bird ${period.in}?`,
    answer: owl ? `Night owl, with ${plural(night, 'message')} from 9 pm to 3 am` : `Early bird, with ${plural(early, 'message')} from 5 to 11 am`,
    share: `${did('I was', "I've been")} ${owl ? 'a night owl' : 'an early bird'} on Discord ${period.in}. ${split}.`,
    guess: {type: 'pick', answer: owl ? 'night' : 'early', options: [
      {key: 'night', label: 'Night owl', sub: '9 pm to 3 am', count: night},
      {key: 'early', label: 'Early bird', sub: '5 to 11 am', count: early},
    ]},
    value: owl ? night : early,
    data: {owl, hourly: H},
    card: {hero: owl ? 'Night owl' : 'Early bird', fact: `${split}.`,
      chart: {buckets: H.map((n, h) => [String(h).padStart(2, '0'), n]), top: H.indexOf(Math.max(...H))}},
  });

  // The busiest day, against an average day you showed up.
  const pk = report.peakDays[0], [quoteRaw = '', quoteN = 0] = pk?.topText || [];
  const quote = onlyMentions(quoteRaw) || linkHost(quoteRaw) ? '' : plainText(quoteRaw);
  const longDay = (iso, opts) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {timeZone: 'UTC', ...opts});
  const dayOpts = {day: 'numeric', month: 'long', ...(all ? {year: 'numeric'} : {})};
  const pkText = pk ? longDay(pk.date, {weekday: 'long', ...dayOpts}) : '', usual = pk ? Math.round(pk.count * T.activeDays / Math.max(1, T.messages)) : 0;
  stories.push({
    id: 'biggest-day', section: 'rhythm', enough: !!pk && T.activeDays > 1,
    question: `${did('What was', "What's been")} your busiest day ${period.in}?`,
    answer: pk ? `Busiest on ${pkText}, with ${plural(pk.count, 'message')}` : none,
    share: pk ? `${plural(pk.count, 'Discord message')} on ${pkText}. My busiest day ${period.in}${usual > 1 ? `, about ${num(usual)}× my usual day` : ''}.` : '',
    value: pk?.count || 0,
    // A message repeated in over a fifth of the day's messages is worth quoting.
    data: {parts: pk ? [longDay(pk.date, {weekday: 'long'}), longDay(pk.date, dayOpts)] : [], times: usual, quote: quote && quoteN > (pk?.count || 0) * 0.2 ? [quote.slice(0, 60), quoteN] : null},
    card: {hero: plural(pk?.count || 0, 'message'), fact: `On ${pkText}.${usual > 1 ? ` About ${num(usual)}× your usual day.` : ''}`,
      list: report.peakDays.slice(0, 5).map(p => [day(p.date, all), p.count])},
  });

  const fast = report.bursts.bestMinute, fastWhen = fast.at ? `${day(fast.at.slice(0, 10), all)} at ${fast.at.slice(11, 16)}` : '';
  stories.push({
    id: 'fastest-minute', section: 'rhythm', enough: fast.count >= 5,
    question: `${did('What was', "What's been")} your fastest minute ${period.in}?`,
    answer: `${plural(fast.count, 'message')} in one minute, on ${fastWhen}`,
    share: `${plural(fast.count, 'message')} in 60 seconds. ${did('That was', "That's")} my Discord record ${period.in}.`,
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
    answer: went.length ? wentText[0].toUpperCase() + wentText.slice(1) : none,
    share: `${wentText.replace(/^(\d+%) to/, `$1 of my Discord messages ${period.in} ${did('went', 'have gone')} to`)}.`,
    value: went[0]?.pct || 0,
    data: {groups: went},
    card: {hero: `${went[0]?.pct || 0}%`, fact: `Of your messages ${did('went', 'have gone')} to ${went[0]?.word || 'servers'}.`, list: went.map(g => [g.label, g.count])},
  });

  const G = report.guilds, inServers = G.reduce((a, g) => a + g.count, 0), server = G[0] || {name: '', count: 0};
  const serverPct = Math.round(100 * server.count / Math.max(1, inServers)), servers = G.slice(0, 5).map(g => [g.name, g.count]);
  stories.push({
    id: 'top-server', section: 'people', enough: G.length > 1,
    question: `Which server ${did('did you talk in', 'have you talked in')} most ${period.in}?`,
    answer: `${plural(server.count, 'message')} in ${server.name}`,
    share: `${num(server.count)} of my Discord messages ${period.in} ${did('went', 'have gone')} to ${server.name}, my top server.`,
    value: server.count,
    data: {name: server.name, pct: serverPct, ranked: servers},
    // A long name is clipped on the card, so the clipped form is a name too.
    card: {hero: clip(server.name, 24), fact: `${plural(server.count, 'message')}, ${serverPct}% of your server messages.`, list: servers, names: [...new Set([...servers.map(([name]) => name), clip(server.name, 24)])]},
  });

  // DM names are private: they show in the reel and on the card (where Redaction can hide them), never in the post.
  const dms = report.channels.filter(c => c.group === 'DMs').sort((a, b) => b.count - a.count);
  const inDms = dms.reduce((a, c) => a + c.count, 0), dm = dms[0] || {name: '', count: 0}, dmPct = Math.round(100 * dm.count / Math.max(1, inDms));
  // Seeded by period, so a replay asks the same three names in the same order.
  const dmPicks = pickSet(dms.map(c => ({key: c.id, label: c.name, count: c.count})), `top-dm:${period.label}`);
  stories.push({
    id: 'top-dm', section: 'people', enough: dms.length >= 3,
    question: `Who ${did('did you DM', 'have you DMed')} most ${period.in}?`,
    answer: `DMed ${dm.name} most, with ${plural(dm.count, 'message')}`,
    share: `${did('I sent', "I've sent")} one person ${plural(dm.count, 'Discord DM')} ${period.in}. That's ${dmPct}% of all my DMs.`,
    guess: {type: 'pick', answer: dm.id, options: dmPicks},
    value: dm.count,
    data: {name: dm.name, pct: dmPct},
    card: {hero: clip(dm.name, 24), fact: `${plural(dm.count, 'message')}, ${dmPct}% of your DMs.`, names: [...new Set([dm.name, clip(dm.name, 24), ...dmPicks.map(o => o.label)])]},
  });

  const circle = dms.slice(0, 10), circlePct = Math.round(100 * circle.reduce((a, c) => a + c.count, 0) / Math.max(1, inDms));
  stories.push({
    id: 'inner-circle', section: 'people', enough: dms.length > 10,
    // A DM is one conversation with one person, so conversations count people.
    question: `How many of your DMs ${did('went', 'have gone')} to your top ten ${period.in}?`,
    answer: `${circlePct}% of DMs to the top 10 of ${num(dms.length)} people`,
    share: `${did('I DMed', "I've DMed")} ${num(dms.length)} people on Discord ${period.in}, but ${circlePct}% of my DMs ${did('went', 'have gone')} to just ten of them.`,
    value: circlePct,
    data: {conversations: dms.length, names: circle.map(c => c.name)},
    card: {hero: `${circlePct}%`, fact: `Of your DMs ${did('went', 'have gone')} to your top 10 of ${num(dms.length)} people.`, names: circle.map(c => c.name)},
  });

  /* ---------- Words & links ---------- */
  // Ranked lists are [text, count], most first. A top pick said only once isn't a habit, so it needs a count of 2.
  const times = n => plural(n, 'time'), quoted = t => `“${t}”`;
  const [word = '', wordN = 0] = report.words[0] || [];
  stories.push({
    id: 'top-word', section: 'words', enough: report.words.length >= 3,
    question: `Which word ${did('did you use', 'have you used')} most ${period.in}?`,
    answer: `The word ${quoted(word)}, ${times(wordN)}`,
    share: `${quoted(clip(word, 40))} ${did('was', 'has been')} my top Discord word ${period.in}. ${did('I typed', "I've typed")} it ${times(wordN)}.`,
    // Seeded by period, so a replay asks the same three words in the same order.
    guess: {type: 'pick', answer: word, options: pickSet(report.words.slice(0, 10).map(([w, n]) => ({key: w, label: w, count: n})), `top-word:${period.label}`)},
    value: wordN,
    data: {word},
    // Card heroes hold 24 characters, quote marks included.
    card: {hero: quoted(clip(word, 22)), fact: `Used ${times(wordN)}.`, list: report.words.slice(0, 5)},
  });

  const [saidRaw = '', saidN = 0] = report.expressions[0] || [], said = plainText(saidRaw);
  stories.push({
    id: 'say-most', section: 'words', enough: saidN >= 2,
    question: `Which message ${did('did you send', 'have you sent')} most ${period.in}?`,
    answer: `The message ${quoted(clip(said, 60))}, ${times(saidN)}`,
    share: `${did('I sent', "I've sent")} ${quoted(clip(said, 60))} ${times(saidN)} on Discord ${period.in}. A whole message, every time.`,
    value: saidN,
    data: {text: said},
    card: {hero: quoted(clip(said, 22)), fact: `Sent ${times(saidN)} as a whole message.`, list: report.expressions.slice(0, 5).map(([t, n]) => [quoted(plainText(t)), n])},
  });

  // Custom emoji only: the export writes them as <:name:id>; other emoji are plain text.
  const [emoji = '', emojiN = 0] = report.emoji[0] || [];
  stories.push({
    id: 'emoji', section: 'words', enough: emojiN >= 2,
    question: `Which custom emoji ${did('did you use', 'have you used')} most ${period.in}?`,
    answer: `:${emoji}:, ${times(emojiN)}`,
    share: `:${emoji}: ${did('showed up', 'has shown up')} ${times(emojiN)} in my Discord messages ${period.in}. My top custom emoji.`,
    value: emojiN,
    data: {name: `:${emoji}:`, ranked: report.emoji.slice(1, 7).map(([e]) => `:${e}:`)},
    card: {hero: `:${emoji}:`, fact: `Used ${times(emojiN)}.`, list: report.emoji.slice(0, 5).map(([e, n]) => [`:${e}:`, n])},
  });

  const [site = '', siteN = 0] = report.domains[0] || [], sites = report.domains.slice(0, 5);
  stories.push({
    id: 'links', section: 'words', enough: siteN >= 2,
    question: `Which site ${did('did you link', 'have you linked')} most ${period.in}?`,
    answer: `${site}, with ${num(siteN)} of ${plural(T.urls, 'link')}`,
    share: `${did('I shared', "I've shared")} ${num(siteN)} links to ${site} on Discord ${period.in}. ${did('It was', "It's")} my most-linked site.`,
    value: siteN,
    data: {site, of: T.urls, ranked: sites},
    card: {hero: clip(site, 24), fact: `${num(siteN)} of your ${plural(T.urls, 'link')}.`, list: sites},
  });

  /* ---------- Hall of fame ---------- */
  const first = report.fame.first, firstRaw = first?.text || '', host = linkHost(firstRaw), mention = onlyMentions(firstRaw);
  const firstText = host || mention ? '' : plainText(firstRaw);
  // A message that opens with a link reads as the link's site, never as an empty quote (#21).
  const firstSaid = host ? `a link to ${host}` : mention ? 'a mention' : firstText ? quoted(clip(firstText, 60)) : 'an attachment';
  const firstDay = first ? day(first.at.slice(0, 10), all) : '';
  stories.push({
    id: 'first-message', section: 'fame', enough: !!first,
    question: all ? 'What was your first ever message?' : `What was your first message ${period.in}?`,
    answer: `Started with ${firstSaid}, on ${firstDay}`,
    share: all ? `My first ever message on Discord was ${firstSaid}!` : `My first Discord message ${period.in} was ${firstSaid}.`,
    value: null,
    data: {text: clip(firstText, 200), host, lead: host ? 'A link to' : mention ? 'A mention' : firstText ? '' : 'An attachment', date: firstDay},
    card: {hero: host || (mention ? 'A mention' : firstText ? quoted(clip(firstText, 22)) : 'An attachment'), fact: `${host ? 'A link, sent' : 'Sent'} on ${firstDay}.`},
  });

  // The worker skips messages with links when it picks the longest, so its text always quotes.
  const longestRaw = report.fame.longest?.text || '', chars = [...longestRaw].length, longest = plainText(longestRaw);
  const lastBucket = report.lengths.findLastIndex(([, n]) => n > 0);
  stories.push({
    id: 'longest-message', section: 'fame', enough: chars > 0 && T.messages > 1,
    question: all ? `What's been your longest message ${period.in}?` : `How long was your longest message ${period.in}?`,
    answer: `${plural(chars, 'character')} in one message`,
    share: `${plural(chars, 'character')} in one Discord message. My longest ${period.in} starts ${quoted(clip(longest, 40))}.`,
    value: chars,
    data: {text: clip(longest, 1200)},
    card: {hero: num(chars), fact: `${chars === 1 ? 'Character' : 'Characters'} in your longest message.`, chart: {buckets: report.lengths, top: lastBucket}},
  });

  // Sessions are runs of messages with no gap of 30 minutes; the worker gives [messages, minutes, local start], the
  // session with the most messages first. So the copy says biggest, not longest; hours are rounded, so "about".
  const [run = 0, mins = 0, began = ''] = report.bursts.largestSessions[0] || [];
  const lasted = mins < 60 ? plural(Math.max(1, mins), 'minute') : `about ${plural(Math.round(mins / 60), 'hour')}`;
  stories.push({
    id: 'longest-session', section: 'fame', enough: run >= 2,
    question: `${did('What was', "What's been")} your biggest session ${period.in}?`,
    answer: `${plural(run, 'message')} over ${lasted}, no 30-minute break`,
    share: all ? `My record ${period.in} is ${plural(run, 'Discord message')} in one sitting, over ${lasted} without a 30-minute break.`
      : `I once sent ${plural(run, 'Discord message')} in one sitting ${period.in}, over ${lasted} without a 30-minute break.`,
    value: run,
    data: {lasted, began: began && `${day(began.slice(0, 10), all)}, ${began.slice(11, 16)}`},
    card: {hero: num(run), fact: `Messages over ${lasted}, never 30 minutes apart.`},
  });

  const order = STORY_SECTIONS.map(s => s.id);
  return stories.filter(s => s.enough || s.section === 'overview').sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
