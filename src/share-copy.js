// Share posts and image captions. Helpers stay private to this one browser binding.
const SHARE_COPY = (() => {
  const noun = (raw, singular, plural = `${singular}s`) => raw === 1 ? singular : plural;
  const times = (value, raw) => `${value} ${noun(raw, 'time')}`;

  // Keep quotes as exact prefixes; never rewrite words inside someone's message.
  const clip = (value, limit) => {
    const text = String(value).trim();
    if (text.length <= limit) return text;
    const prefix = text.slice(0, limit - 1);
    const boundary = /\s/.test(text[limit - 1]) ? prefix.length : prefix.search(/\s+\S*$/);
    return `${prefix.slice(0, Math.max(0, boundary)).trimEnd()}…`;
  };
  // Omit a prohibited token and everything after it, preserving an honest excerpt.
  // Bare domains identify the ranked sites; posts never add a URL or link scheme.
  const excerpt = (value, limit) => {
    const text = String(value).trim();
    const forbidden = text.search(/Discord Wrapped|#|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u200d\ufe0f\u20e3]|\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)/iu);
    return clip(forbidden < 0 ? text : `${text.slice(0, forbidden).trimEnd()}…`, limit);
  };
  const quote = (value, limit = 62) => `“${excerpt(value, limit - 2)}”`;
  const name = value => excerpt(value, 32);
  const card = (text, headline, sub) => ({
    text,
    headline: clip(headline, 40),
    sub: clip(sub, 70).replace(/\.$/, ''),
  });
  const caption = (label, p) => `${label} ${p.in}`;
  // Running totals take the present perfect, including singular totals.
  const sent = (p, verb = 'sent') => `${p.kind === 'all' ? "I've" : 'I'} ${verb}`;

  return {
    'stat.messages': (v, p) => card(
      v.nRaw === 1
        ? `${sent(p)} exactly 1 message on Discord ${p.in}. One.`
        : `${sent(p)} ${v.n} messages on Discord ${p.in}. How many did you send?`,
      v.n, caption(`${noun(v.nRaw, 'Message')} sent`, p)),

    'stat.words': (v, p) => card(
      `${v.n} ${noun(v.nRaw, 'word')}. That's how much ${p.kind === 'all' ? "I've" : 'I'} typed on Discord ${p.in}.`,
      v.n, caption(`${noun(v.nRaw, 'Word')} typed`, p)),

    'stat.characters': (v, p) => card(
      `My Discord messages ${p.kind === 'all' ? 'have added' : 'added'} up to ${v.n} ${noun(v.nRaw, 'character')} ${p.in}.`,
      v.n, caption(`${noun(v.nRaw, 'Character')} typed`, p)),

    'stat.activeDays': (v, p) => card(
      `${sent(p)} a Discord message on ${v.active} of the ${v.days} ${noun(v.daysRaw, 'day')} ${p.in}.${v.activeRaw === v.daysRaw && v.daysRaw > 1 ? ' Every single day.' : ''}`,
      v.pct, caption(`Active on ${v.active} of ${v.days} ${noun(v.daysRaw, 'day')}`, p)),

    'stat.links': (v, p) => card(
      `${sent(p, 'dropped')} ${v.n} ${noun(v.nRaw, 'link')} into Discord ${p.in}.`,
      v.n, caption(`${noun(v.nRaw, 'Link')} shared`, p)),

    'stat.attachments': (v, p) => card(
      `${sent(p)} ${v.n} ${noun(v.nRaw, 'attachment')} in my Discord chats ${p.in}.`,
      v.n, caption(`${noun(v.nRaw, 'Attachment')} sent`, p)),

    'highlight.loudest': (v, p) => card(
      `${name(v.label)} alone accounts for ${v.sharePct} of my Discord messages ${p.in}. ${v.n} ${noun(v.nRaw, 'message')}.`,
      v.sharePct, `${name(v.label)} · ${v.n} ${noun(v.nRaw, 'message')} ${p.in}`),

    'highlight.quiet': (v, p) => card(
      `I sent ${v.dropPct} fewer Discord messages in ${name(v.label)} than in ${name(v.prevLabel)}.`,
      `${v.dropPct} fewer messages`, `${v.prevLabel} to ${v.label} · ${v.n} ${noun(v.nRaw, 'message')}`),

    'highlight.busiestMonth': (v, p) => card(
      `${name(v.month)} was my busiest Discord month ${p.in}. ${v.n} ${noun(v.nRaw, 'message')}, averaging ${v.perDay} a day.`,
      v.n, `${v.month} · ${v.perDay} ${noun(v.perDayRaw, 'message')} per day`),

    'highlight.lateNight': (v, p) => card(
      `${v.pct} of my Discord messages ${p.in} landed between midnight and 6 am.`,
      v.pct, caption('Messages sent from midnight to 6 am', p)),

    'highlight.streak': (v, p) => card(
      v.daysRaw === 1
        ? `My longest Discord streak ${p.in} was 1 day. No two days in a row.`
        : `I sent a Discord message every day for ${v.days} days straight ${p.in}.`,
      `${v.days} ${noun(v.daysRaw, 'day')} in a row`, `${v.from} to ${v.to} · Longest messaging streak`),

    'highlight.recordDay': (v, p) => {
      const lead = `${v.n} Discord ${noun(v.nRaw, 'message')} in one day! ${v.date} was my busiest day ${p.in}.`;
      const ending = ` ${times(v.topCount, v.topCountRaw)}.`;
      return card(v.topText
        ? `${lead} I sent ${quote(v.topText, Math.min(62, 199 - lead.length - 8 - ending.length))}${ending}`
        : lead,
      `${v.n} in one day`, `My busiest day · ${v.date}`);
    },

    'highlight.bursts': (v, p) => card(
      `I once sent ${v.bestMinute} Discord ${noun(v.bestMinuteRaw, 'message')} in a single minute ${p.in}.`,
      `${v.bestMinute} in one minute`, caption(`${v.shortPct} of messages were 20 characters or fewer`, p)),

    // The input counts conversations, which can include group DMs, not people.
    'highlight.innerCircle': (v, p) => card(
      v.dmCountRaw > 10
        ? `${v.pct} of my Discord DMs ${p.in} were in just 10 of my ${v.dmCount} conversations.`
        : `All my Discord DMs ${p.in} were in ${v.dmCount} ${noun(v.dmCountRaw, 'conversation')}.`,
      v.pct, caption(v.dmCountRaw > 10 ? 'Of DM messages in my top 10 conversations' : 'Of DM messages in all conversations', p)),

    'highlight.longer': (v, p) => card(
      `My Discord messages averaged ${v.fromWords} ${noun(v.fromWordsRaw, 'word')} in ${name(v.fromLabel)}, then ${v.toWords} in ${name(v.toLabel)}.`,
      `${v.fromWords} → ${v.toWords} ${noun(v.toWordsRaw, 'word')}`, `Per message, ${v.fromLabel} to ${v.toLabel}`),

    'highlight.topLink': (v, p) => card(
      `${name(v.domain)} was my most-linked site ${p.in}. I shared it ${times(v.n, v.nRaw)} on Discord.`,
      name(v.domain), caption(`Most-linked site · Shared ${times(v.n, v.nRaw)}`, p)),

    'rank.word': (v, p) => card(
      v.rankRaw === 1
        ? `${quote(v.word)} was my most-used word on Discord ${p.in}. ${sent(p, 'used')} it ${times(v.n, v.nRaw)}!`
        : `${quote(v.word)} was my number ${v.rank} word on Discord ${p.in}, used ${times(v.n, v.nRaw)}.`,
      quote(v.word, 40), caption(`Number ${v.rank} word · ${times(v.n, v.nRaw)}`, p)),

    'rank.expression': (v, p) => card(
      `${sent(p)} ${quote(v.text)} ${times(v.n, v.nRaw)} ${p.in}. A whole message, every time.`,
      quote(v.text, 40), caption(`Number ${v.rank} short message · Sent ${times(v.n, v.nRaw)}`, p)),

    'rank.link': (v, p) => card(
      `${sent(p, 'shared')} ${v.n} ${noun(v.nRaw, 'link')} to ${name(v.domain)} on Discord ${p.in}.`,
      name(v.domain), caption(`Number ${v.rank} linked site · ${times(v.n, v.nRaw)}`, p)),

    'rank.emoji': (v, p) => card(
      `${name(v.name)} appeared ${times(v.n, v.nRaw)} in my Discord messages ${p.in}.`,
      name(v.name), caption(`Number ${v.rank} custom emoji · ${times(v.n, v.nRaw)}`, p)),

    'rank.server': (v, p) => card(
      `${v.n} of my Discord messages ${p.in} went to ${name(v.name)}.`,
      name(v.name), caption(`Number ${v.rank} server · ${v.n} ${noun(v.nRaw, 'message')}`, p)),

    'bump.word': (v, p) => card(
      v.rankRaw === 1
        ? `My top word on Discord in ${v.label} was ${quote(v.word)}!`
        : `${quote(v.word)} made my top 10 words on Discord in ${v.label}, at number ${v.rank}.`,
      quote(v.word, 40), `Number ${v.rank} word · ${times(v.n, v.nRaw)} · ${v.label}`),

    'search': (v, p) => card(
      `${sent(p, 'said')} ${quote(v.query)} in ${v.n} Discord ${noun(v.nRaw, 'message')} ${p.in}${v.peakLabel ? `, most of all in ${name(v.peakLabel)}` : ''}.`,
      quote(v.query, 40), caption(`In ${v.n} ${noun(v.nRaw, 'message')}`, p)),

    'fame.first': (v, p) => card(
      p.kind === 'all' ? `My first ever message on Discord was ${quote(v.text)}!` : `My first Discord message ${p.in} was ${quote(v.text)}.`,
      quote(v.text, 40), `My first${p.kind === 'all' ? ' ever' : ''} message · ${v.date}`),

    'fame.latest': (v, p) => card(
      p.kind === 'all' ? `My most recent Discord message was ${quote(v.text)}.` : `My last Discord message ${p.in} was ${quote(v.text)}.`,
      quote(v.text, 40), `My latest message · ${v.date}`),

    'fame.mostRepeated': (v, p) => card(
      `${quote(v.text)} was my most-sent Discord message ${p.in}. ${sent(p)} it ${times(v.n, v.nRaw)}!`,
      quote(v.text, 40), caption(`Most repeated message · Sent ${times(v.n, v.nRaw)}`, p)),

    'fame.longest': (v, p) => card(
      `${v.chars} ${noun(v.charsRaw, 'character')} in one Discord message. My longest ${p.in} starts ${quote(v.text)}.`,
      `${v.chars} ${noun(v.charsRaw, 'character')}`, caption('My longest message', p)),

    'fame.fastestMinute': (v, p) => card(
      `${v.n} ${noun(v.nRaw, 'message')} in 60 seconds. That's my Discord record ${p.in}.`,
      `${v.n} in 60 seconds`, caption('Most messages in a minute', p)),

    'fame.longestSession': (v, p) => card(
      `I once sent ${v.n} Discord ${noun(v.nRaw, 'message')} over ${v.hours} ${noun(v.hoursRaw, 'hour')} ${p.in}, without a 30-minute break between messages.`,
      `${v.n} ${noun(v.nRaw, 'message')}`, `${v.hours} ${noun(v.hoursRaw, 'hour')} · No gap of 30 minutes · ${p.label}`),

    'fame.recordDay': (v, p) => card(
      `${v.n} Discord ${noun(v.nRaw, 'message')} in one day! ${v.date} was my busiest day ${p.in}.`,
      `${v.n} in one day`, `My busiest day · ${v.date}`),

    'section.overview': (v, p) => card(
      `${v.messages} Discord ${noun(v.messagesRaw, 'message')} ${p.in}. My busiest stretch was ${name(v.loudest)}.`,
      v.messages, caption(`${noun(v.messagesRaw, 'Message')} sent`, p)),

    'section.rhythm': (v, p) => card(
      `${v.peakHour} was my peak Discord hour ${p.in}. ${v.lateNightPct} of my messages landed between midnight and 6 am.`,
      v.peakHour, caption('Peak messaging hour', p)),

    'section.people': (v, p) => card(
      `${v.dmPct} of my Discord messages ${p.in} were DMs, and ${v.serverPct} went to servers.`,
      `${v.dmPct} DMs`, caption(`${v.serverPct} of messages in servers`, p)),

    'section.words': (v, p) => card(
      `${quote(v.topWord)} was my top Discord word ${p.in}. ${sent(p, 'typed')} it ${times(v.topWordCount, v.topWordCountRaw)}.`,
      quote(v.topWord, 40), caption(`Top word · Used ${times(v.topWordCount, v.topWordCountRaw)}`, p)),

    'selection': (v, p) => card(
      `${quote(v.text, 120)}, straight from my Discord history ${p.in}.`,
      quote(v.text, 40), caption('From my Discord history', p)),
  };
})();
