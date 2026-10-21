/* Redaction: what a share hides, on the card and in the post. Pure, so the tests can import it. All page scripts
   share one scope, so only the exports below are top-level names. */
// Share copy marks every name and quote it inserts with private-use characters, so they stay findable after clipping:
//   markName('Cozy Corner') and markQuote('hello there'). Names are servers, channels, DMs and group DMs; quotes are
// quoted messages, ranked words and search terms. Everything else is plain words, hidden one word at a time.
const OPEN = {name: '', quote: ''}, CLOSE = '', KIND = {'': 'name', '': 'quote'};
export const markName = t => OPEN.name + t + CLOSE;
export const markQuote = t => OPEN.quote + t + CLOSE;
/** The text with its marks removed, for anything shown as is (alt text, file names, the selection). */
export const unmark = s => String(s ?? '').replace(/[-]/g, '');
/** The first n characters of marked text, not counting marks, then an ellipsis; a mark cut short still closes. */
export function clipMarked(text, n) {
  let out = '', open = false;
  for (let i = 0; i < text.length && n > 0; i++) {
    const ch = text[i];
    if (KIND[ch]) open = true; else if (ch === CLOSE) open = false; else n--;
    out += ch;
  }
  return open ? out + '…' + CLOSE : out + '…';
}
// Hidden words become this in the post and in alt text. It has the same width whatever it covers.
export const HIDDEN = '████';

/**
 * One redaction state per share sheet. names and quotes are the two toggles; words are single words hidden by a tap;
 * hidden and shown are names or quotes hidden by a tap, or brought back while their toggle is on.
 * Nothing starts hidden.
 */
export const newRedaction = () => ({names: false, quotes: false, words: [], hidden: [], shown: []});

// A name or quote is matched by its text, so a clipped copy ("Programming Ser…") matches the whole one.
const entity = (kind, text) => {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim(), clipped = t.endsWith('…');
  return {kind, text: clipped ? t.slice(0, -1).trimEnd() : t, clipped};
};
const same = (a, b) => a.kind === b.kind && (a.text === b.text || a.clipped && b.text.startsWith(a.text) || b.clipped && a.text.startsWith(b.text));
const wordKey = core => core.toLowerCase();

/**
 * Splits marked text into words: {pre, core, post, punct, ent}. pre and post are the punctuation around a plain word
 * (or outside a mark); punct words sit outside marks, have no letters or digits and never hide. ent is the name or quote a word sits in.
 */
export function tokenize(text) {
  const out = [];
  let kind = null, ent = null, chars = [];
  const flush = () => {
    if (!chars.length) return;
    const s = cs => cs.map(c => c[0]).join(''), inside = chars.map(c => !!c[1]);
    let a = inside.indexOf(true), b = inside.lastIndexOf(true) + 1;
    if (a < 0) {
      const m = s(chars).match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
      const n = x => [...x].length;
      [a, b] = m[2] ? [n(m[1]), n(m[1]) + n(m[2])] : [0, chars.length];
    }
    const core = s(chars.slice(a, b)), e = chars[a][1];
    out.push({pre: s(chars.slice(0, a)), core, post: s(chars.slice(b)), punct: !e && !/[\p{L}\p{N}]/u.test(core), ent: e});
    chars = [];
  };
  for (const ch of String(text ?? '')) {
    if (KIND[ch]) { kind = KIND[ch]; ent = {kind, raw: ''}; continue; }
    if (ch === CLOSE) { if (ent) Object.assign(ent, entity(kind, ent.raw)); kind = ent = null; continue; }
    if (ent) ent.raw += ch;
    if (/\s/.test(ch)) flush(); else chars.push([ch, ent]);
  }
  flush();
  if (ent) Object.assign(ent, entity(kind, ent.raw));
  return out;
}

const entHidden = (e, s) => !s.shown.some(x => same(x, e)) && (s.hidden.some(x => same(x, e)) || s[e.kind === 'name' ? 'names' : 'quotes']);
/** Whether a word is hidden: its name or quote is, or the word itself was tapped. */
export const isHidden = (t, s) => !t.punct && (t.ent && entHidden(t.ent, s) || s.words.includes(wordKey(t.core)));

/**
 * Groups words for display: each visible word is a unit, and neighbouring hidden words merge into one, so a mark
 * never tells how many words it covers. text is what the post shows for the unit.
 */
export function units(tokens, s) {
  const out = [];
  for (const t of tokens) {
    const hidden = isHidden(t, s), prev = out.at(-1);
    if (hidden && prev?.hidden && !prev.post && !t.pre) { prev.tokens.push(t); prev.post = t.post; }
    else out.push({tokens: [t], hidden, pre: t.pre, post: t.post});
  }
  for (const u of out) u.text = u.pre + (u.hidden ? HIDDEN : u.tokens.map(t => t.core).join(' ')) + u.post;
  return out;
}
/** Marked text as plain text with every hidden unit as ████. */
export const redactText = (text, s) => units(tokenize(text), s).map(u => u.text).join(' ');
/** The words a unit covers, as they read unhidden. */
export const unitWords = u => u.tokens.map(t => t.core).join(' ');

/**
 * Tapping a unit flips it. A hidden unit comes back, overriding its toggle; a visible name hides as a whole, and any
 * other word hides wherever it appears. Returns a new state.
 */
export function tap(s, u) {
  const n = {...s, words: [...s.words], hidden: [...s.hidden], shown: [...s.shown]};
  if (u.hidden) for (const t of u.tokens) {
    n.words = n.words.filter(w => w !== wordKey(t.core));
    if (t.ent && entHidden(t.ent, n)) {
      n.hidden = n.hidden.filter(x => !same(x, t.ent));
      if (n[t.ent.kind === 'name' ? 'names' : 'quotes']) n.shown.push(t.ent);
    }
  } else {
    const t = u.tokens.find(t => !t.punct);
    if (!t) return s;
    if (t.ent?.kind === 'name') { n.shown = n.shown.filter(x => !same(x, t.ent)); n.hidden.push(t.ent); }
    else n.words.push(wordKey(t.core));
  }
  return n;
}
/** Turns a toggle on or off for every name (or quote) in the share, dropping taps that disagree with it. */
export function setToggle(s, kind, on) {
  const other = x => x.kind !== kind;
  return {...s, [kind === 'name' ? 'names' : 'quotes']: on, hidden: s.hidden.filter(other), shown: s.shown.filter(other)};
}
/** Which of 'name' and 'quote' occur in these marked texts, so the sheet only offers toggles that do something. */
export const kindsIn = (...texts) => new Set(texts.flatMap(t => tokenize(t).map(w => w.ent?.kind)).filter(Boolean));

/**
 * A card model with redaction applied: every text field becomes a list of card words {text, hidden, pre, post, ref},
 * one per unit, with ref the unit itself so a tap on the card can flip it. A hero that is wholly a hidden name falls
 * back to model.heroAlt (the count), so the card is never just a mark.
 */
export function redactCard(model, s) {
  const field = text => text && units(tokenize(text), s).map(u => ({text: u.text, hidden: u.hidden, pre: u.pre, post: u.post, ref: u}));
  const hero = tokenize(model.hero).filter(t => !t.punct);
  const heroHidden = model.heroAlt && hero.length && hero.every(t => t.ent?.kind === 'name' && isHidden(t, s));
  return {...model, question: field(model.question), hero: field(heroHidden ? model.heroAlt : model.hero), fact: field(model.fact), guess: field(model.guess),
    bars: model.bars && {...model.bars, items: model.bars.items.map(([label, ...rest]) => [field(label), ...rest])}};
}

/**
 * Blacks out terms in text someone typed or edited, where marks are gone: each term, matched case-insensitively at
 * word edges, becomes ████. Used to keep later redactions applying to an edited post.
 */
export function blackOut(text, terms) {
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const list = [...new Set(terms.map(t => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return text;
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu'), HIDDEN);
}
