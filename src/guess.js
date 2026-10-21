/* Guess maths: slider scales, pick-one choice sets and scoring. Pure, so the tests can import it; the player draws
   the inputs and the scenes draw the reveal. A guess spec is one of
     {type: 'slider', scale: 'log' | 'linear', max, tolerance, unit}   the answer is the story's value
     {type: 'pick', options: [{key, label, sub?, count}], answer}       the answer is an option key */

/** Positions on a log slider; enough that every nice value below the top is in reach. */
const LOG_STEPS = 1000;

/**
 * The slider for `spec`: integer positions 0..steps, the value at a position and back, and where the thumb starts.
 * Messages use a log scale (rounded to two significant figures, which is well inside the tolerance); days are linear.
 * The thumb starts mid-range, unless that would already count as right, so leaving it alone never gives the answer.
 */
export function sliderScale(spec, answer) {
  const log = spec.scale === 'log', steps = log ? LOG_STEPS : spec.max, k = Math.log1p(spec.max) / LOG_STEPS;
  const nice = v => v < 100 ? Math.round(v) : (m => Math.round(v / m) * m)(10 ** (Math.floor(Math.log10(v)) - 1));
  const toValue = p => !log ? p : p >= steps ? spec.max : Math.min(spec.max, nice(Math.expm1(p * k)));
  const toPos = v => Math.max(0, Math.min(steps, Math.round(log ? Math.log1p(v) / k : v)));
  const mid = Math.round(steps / 2), at = toPos(answer);
  const start = !scoreGuess(spec, answer, toValue(mid)).right && mid !== at ? mid : at < mid ? Math.round(steps * 0.8) : Math.round(steps * 0.2);
  return {steps, start, toValue, toPos};
}

/**
 * The choices for a pick-one guess: `ranked[0]` (the real #1) plus two distinct random picks from #2 to #10, shuffled.
 * `seed` is any string; the same seed always gives the same set and order, so a replay asks the same question.
 */
export function pickSet(ranked, seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  // mulberry32
  const rand = () => { h = h + 0x6D2B79F5 | 0; let t = Math.imul(h ^ h >>> 15, 1 | h); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return shuffle([ranked[0], ...shuffle(ranked.slice(1, 10)).slice(0, 2)].filter(Boolean));
}

/**
 * Scores `guess` (a number or option key; null when skipped) against `answer`. Returns {guess, skipped, right, ratio,
 * line}: a slider guess is right within the spec's tolerance of the answer, boundary included; `ratio` is guess over
 * answer; `line` is the verdict shown on the reveal, empty for a skip.
 */
export function scoreGuess(spec, answer, guess) {
  if (guess == null) return {guess: null, skipped: true, right: false, ratio: null, line: ''};
  if (spec.type === 'pick') { const right = guess === answer; return {guess, skipped: false, right, ratio: null, line: right ? 'You knew it.' : 'Not this time.'}; }
  // Whole percent, so 15% is exactly 15% and float error can't move a guess across the boundary.
  const tol = Math.round(spec.tolerance * 100), diff = Math.abs(guess - answer);
  const right = diff * 100 <= tol * answer, ratio = answer ? guess / answer : guess ? Infinity : 1;
  // Rounded for the line, but never shown as inside the tolerance when it isn't, or outside when it is.
  const pct = right ? Math.min(tol, Math.round(100 * diff / answer) || 0) : Math.max(tol + 1, Math.round(100 * diff / answer));
  const dir = guess < answer ? 'under' : 'over';
  let line;
  if (diff === 0) line = 'Exactly right.';
  else if (right) line = pct ? `Spot on. Only ${pct}% ${dir}.` : `Spot on. Less than 1% ${dir}.`;
  else if (pct <= 2 * tol) line = `Close. ${pct}% ${dir}.`;
  else if (ratio >= 0.5 && ratio <= 2) line = `Not quite. ${pct}% ${dir}.`;
  else if (!guess || !answer) line = 'Way off.';
  else line = guess < answer ? `Way off. It was ${(1 / ratio).toFixed(1)}× your guess.` : `Way off. That's ${ratio.toFixed(1)}× too high.`;
  return {guess, skipped: false, right, ratio, line};
}

/** A guess as words: "20,000 messages", or the picked option's label. */
export function guessText(spec, guess) {
  if (spec.type === 'pick') return spec.options.find(o => o.key === guess)?.label ?? String(guess);
  return `${Number(guess).toLocaleString()} ${guess === 1 ? spec.unit.replace(/s$/, '') : spec.unit}`;
}

/** The plain line for a share card and post ("I guessed 20,000. It was 55,474."); empty when the guess was skipped. */
export function guessLine(spec, answer, result) {
  if (!result || result.skipped) return '';
  const say = v => spec.type === 'pick' ? guessText(spec, v) : Number(v).toLocaleString();
  return `I guessed ${say(result.guess)}. It was ${say(answer)}.`;
}
