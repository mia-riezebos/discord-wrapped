/* Story share cards: a story's `card` facts (see buildStories) as a share context for the share popover, with its
   names marked for redaction. Pure, so the tests can import it; markName (redaction.js) and guessLine (guess.js)
   come from the page's shared scope. */

// Marks every occurrence of the card's names, longest first, so Redaction's names toggle and taps can hide them.
const markNames = (text, names = []) => {
  if (!text || !names.length) return text;
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const list = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length).map(esc);
  return list.length ? String(text).replace(new RegExp(list.join('|'), 'g'), n => markName(n)) : text;
};

// A name the story's own post leaves out (a DM's name) stays out of every post; the card still shows it, marked.
const keepsOut = (story, text) => (story.card.names || []).some(n => text.includes(n) && !story.share.includes(n));

/**
 * The share context for one story: {text, question, headline, alt, sub, guess, columns?, bars?}. `guessResult` is
 * scoreGuess()'s result for the story's guess; a locked-in guess adds one line to the card and the post (unless it
 * names someone the post leaves out), a skip adds nothing. When the hero is a name and names are hidden, the card
 * shows the story's count (`alt`) instead.
 */
export function storyCard(story, guessResult) {
  const c = story.card, mark = t => markNames(t, c.names);
  const line = story.guess ? guessLine(story.guess, story.guess.type === 'pick' ? story.guess.answer : story.value, guessResult) : '';
  return {
    text: mark([story.share, !keepsOut(story, line) && line].filter(Boolean).join(' ')),
    question: story.question,
    headline: mark(c.hero),
    alt: Number(story.value).toLocaleString(),
    sub: mark(c.fact),
    guess: mark(line),
    ...c.chart && {columns: {items: c.chart.buckets, highlight: c.chart.top}},
    ...c.list && {bars: {items: c.list.map(([label, n]) => [mark(label), n]), highlight: 0}},
  };
}

/**
 * The share context for a reel's summary: `title` ("2025", "All time") as the hero under the summary's heading, one
 * line per story's answer, and the score when any guess was locked in. The post skips answers that name someone
 * their story's post leaves out.
 */
export function summaryCard(stories, {title, ending, score = ''}) {
  const names = stories.flatMap(s => s.card.names || []), mark = t => markNames(t, names);
  const said = stories.filter(s => !keepsOut(s, s.answer)).map(s => s.answer);
  return {
    text: mark(`${title} on Discord: ${said.join('. ')}.${score ? ' ' + score : ''}`),
    question: ending,
    headline: title,
    lines: stories.map(s => mark(s.answer)),
    guess: score,
  };
}
