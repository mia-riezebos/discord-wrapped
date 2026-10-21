// PROTOTYPE (issue #13). Facts for four core stories. Same in every variant; scenes never change these.
export const fmt = n => Number(n).toLocaleString('en-GB');
const DAY = 864e5;
export const dayDate = d => new Date(d * DAY);
export const longDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'});
export const shortDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});

// Small seeded random so the pick-one options are stable per load (seed in ?seed=).
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

export function buildStories(D, year, opts = {}) {
  const rand = rng(opts.seed ?? 7);
  const t = D.totals;
  const stories = [];

  // 1. How many messages (slider guess, log scale up to ~1,000 a day of the period)
  if (t.messages > 0) {
    const max = 1000 * t.calendarDays;
    stories.push({
      id: 'messages', section: 'Overview', n: 1,
      question: `How many messages did you send in ${year}?`,
      answer: `${fmt(t.messages)} messages`,
      value: t.messages,
      perDay: Math.round(t.messages / t.calendarDays),
      days: D.days, from: D.range.from, to: D.range.to,
      guess: {type: 'slider', min: 10, max, scale: 'log', tolerance: 0.15, unit: 'messages'},
      share: `I sent ${fmt(t.messages)} messages on Discord in ${year}.`,
    });
  }

  // 2. Top word (pick one of three: #1 plus two random picks from #2 to #10)
  if (D.words.length >= 3) {
    const top = D.words[0];
    const pool = D.words.slice(1, 10).map(w => w);
    const picks = [];
    while (picks.length < 2 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const options = [top, ...picks].map(w => w[0]);
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    stories.push({
      id: 'top-word', section: 'Words & links', n: 2,
      question: `Which word did you use most in ${year}?`,
      answer: `“${top[0]}”, ${fmt(top[1])} times`,
      word: top[0], value: top[1],
      runnersUp: D.words.slice(1, 10),
      guess: {type: 'pick', options, correct: top[0]},
      share: `My top word on Discord in ${year} was “${top[0]}”.`,
    });
  }

  // 3. Biggest day (peakDays[0], with its top repeated message if over 20% of the day)
  const pk = D.peakDays[0];
  if (pk && pk.count > 0) {
    let [txt, n] = pk.topText;
    if (opts.fakeTop) { txt = 'LMAO'; n = Math.round(pk.count * 0.31); }
    const notable = n > pk.count * 0.2 && txt;
    stories.push({
      id: 'biggest-day', section: 'Rhythm', n: 3,
      question: `What was your biggest day of ${year}?`,
      answer: `${longDate(pk.date)}: ${fmt(pk.count)} messages`,
      date: pk.date, day: pk.day, value: pk.count,
      mostlyIn: pk.contexts.slice(0, 2).map(c => c[0]),
      topText: notable ? {text: txt.slice(0, 60), count: n} : null,
      days: D.days, from: D.range.from, to: D.range.to,
      share: `My biggest Discord day of ${year}: ${fmt(pk.count)} messages on ${longDate(pk.date)}.`,
    });
  }

  // 4. Longest streak (streaks[0])
  const st = D.streaks[0];
  if (st && st[0] > 1) {
    const [len, from, to] = st;
    stories.push({
      id: 'streak', section: 'Overview', n: 4,
      question: `How many days in a row did you show up?`,
      answer: `${fmt(len)} days in a row, ${shortDate(from)} to ${shortDate(to)}`,
      value: len, from, to, stillGoing: to === D.range.to,
      days: D.days, rangeFrom: D.range.from, rangeTo: D.range.to,
      share: `My longest Discord streak in ${year}: ${len} days in a row.`,
    });
  }
  // Report order: Overview, Rhythm, then Words & links.
  const order = ['messages', 'streak', 'biggest-day', 'top-word'];
  return stories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// Guess scoring (player-owned). Returns what the reveal receives.
export function score(story, raw) {
  if (raw == null) return {skipped: true};
  const g = story.guess;
  if (g.type === 'pick') {
    const right = raw === g.correct;
    return {value: raw, right, line: right ? 'You knew it.' : `Not “${raw}”. Close, though.`};
  }
  const ratio = raw / story.value, off = Math.abs(ratio - 1);
  const right = off <= g.tolerance;
  const line = right ? 'Spot on.'
    : off <= 0.5 ? (ratio < 1 ? 'Close. A bit more than that.' : 'Close. A bit fewer than that.')
    : ratio < 1 ? `About ${Math.round(1 / ratio)}× more than your guess.` : `Your guess was about ${Math.round(ratio)}× too high.`;
  return {value: raw, right, ratio, line};
}
