/* Story facts: what each story asks and answers, from a period report. Pure and the same in every theme, so the
   tests can import it. All page scripts share one scope, so only the exports below are top-level names. */

/** Sections that have stories, in report order. Ids match the report's data-share-section values. */
export const STORY_SECTIONS = [
  {id: 'overview', name: 'Overview'},
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

  const order = STORY_SECTIONS.map(s => s.id);
  return stories.filter(s => s.enough || s.section === 'overview').sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
