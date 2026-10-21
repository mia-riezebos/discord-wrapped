/* Theme guard: fails `pnpm check` when a theme could make the site unusable. Checks Kinetic (style.css and kinetic.js)
   and every folder in src/themes/, or the theme folders given as arguments:
   - tokens: only the colour tokens and --display, set as hex colours so they can be measured;
   - contrast, in light and dark, over Kinetic's tokens the way the page cascades them: text 4.5:1, chart marks and
     the focus ring 3:1;
   - focus ring: no stylesheet rule that hides an outline;
   - motion: Web Animations only (element.animate), so the player's timing and reduced-motion handling apply. No CSS
     animations or transitions, and no timers.
   `node scripts/theme-guard.mjs [theme folder…]` prints each problem and exits 1 if there are any. */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const PALETTE = ['c1', 'c2', 'c3', 'c4', 'c5'];
const COLOURS = ['bg', 'surface', 'fg', 'muted', 'border', 'soft', 'accent', 'accent-fg', ...PALETTE, ...PALETTE.map(c => `on-${c}`)];
const TOKENS = [...COLOURS, 'display'];
// [foreground, background, minimum ratio, what it is]. Borders are decoration and need no contrast.
const PAIRS = [
  ...['fg', 'muted', 'accent'].flatMap(t => ['bg', 'surface', 'soft'].map(b => [t, b, 4.5, 'text'])),
  ['accent-fg', 'accent', 4.5, 'text'],
  ...PALETTE.map(c => [`on-${c}`, c, 4.5, 'text']),
  ...PALETTE.flatMap(c => ['bg', 'surface'].map(b => [c, b, 3, 'chart mark'])),
  ...['bg', 'surface'].map(b => ['accent', b, 3, 'focus ring']),
];
const HIDDEN_OUTLINE = /\boutline(-style|-width|-color)?\s*:\s*(none|0|transparent)\b/;
const CSS_MOTION = /@keyframes|\b(animation|transition)(-[a-z-]+)?\s*:/;
const JS_MOTION = /\.style\.(animation|transition)|\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/;

const luminance = hex => {
  const h = hex.length === 4 ? [...hex.slice(1)].map(c => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two hex colours. */
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Problems with one theme, as sentences; none means it passes. theme is {id, tokens: {light, dark}, css, source}: css
 * is every stylesheet it adds and source its scene code. base is Kinetic's {light, dark} tokens, which the theme's
 * extend: in dark mode the page uses Kinetic's light and dark tokens, then the theme's light and dark ones.
 */
export function themeProblems(theme, base) {
  const out = [], say = text => out.push(`${theme.id}: ${text}`);
  const {light = {}, dark = {}} = theme.tokens;
  for (const [mode, set] of [['light', light], ['dark', dark]]) for (const [k, v] of Object.entries(set)) {
    if (!TOKENS.includes(k)) say(`--${k} isn't a token a theme may set (${TOKENS.map(t => `--${t}`).join(', ')}).`);
    else if (COLOURS.includes(k) && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) say(`--${k} in ${mode} is ${v}; set colours as #rgb or #rrggbb.`);
  }
  for (const [, name] of theme.css.matchAll(/(?<![\w-])--([\w-]+)\s*:/g)) if (!TOKENS.includes(name)) say(`its stylesheet sets --${name}, which isn't a theme token.`);
  if (out.length) return out;
  const modes = {light: {...base.light, ...light}, dark: {...base.light, ...base.dark, ...light, ...dark}};
  for (const [mode, t] of Object.entries(modes)) for (const [fg, bg, min, what] of PAIRS) {
    const r = contrast(t[fg], t[bg]);
    if (r < min) say(`${what} --${fg} on --${bg} in ${mode} is ${r.toFixed(2)}:1, below ${min}:1.`);
  }
  if (HIDDEN_OUTLINE.test(theme.css)) say('its stylesheet hides an outline, so the focus ring may not show.');
  if (CSS_MOTION.test(theme.css)) say('its stylesheet animates; use element.animate() so reduced motion applies.');
  if (JS_MOTION.test(theme.source)) say('its scenes animate with CSS or timers; use element.animate() so the player can time them.');
  return out;
}

// Custom properties in a CSS block, as {name: value}.
const vars = block => Object.fromEntries([...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const filesIn = dir => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? filesIn(join(dir, f)) : [join(dir, f)]);

/** Kinetic as themeProblems takes it: its tokens from style.css's :root, its k- rules and kinetic.js. */
export function kinetic() {
  const style = readFileSync(join(SRC, 'style.css'), 'utf8');
  const light = vars(style.match(/^:root \{([^}]*)\}/m)[1]), dark = vars(style.match(/prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)[1]);
  const pick = set => Object.fromEntries(Object.entries(set).filter(([k]) => COLOURS.includes(k)));
  return {
    id: 'kinetic',
    tokens: {light: pick(light), dark: pick(dark)},
    css: style.split('\n').filter(l => l.startsWith('.k-')).join('\n'),
    source: readFileSync(join(SRC, 'kinetic.js'), 'utf8'),
  };
}

/** A year theme folder as themeProblems takes it: its defineTheme tokens and stylesheet, and all its scripts. */
export async function themeIn(dir) {
  const def = (await import(pathToFileURL(join(dir, 'index.js')).href)).default;
  const scripts = filesIn(dir).filter(f => f.endsWith('.js'));
  return {
    id: def.id,
    tokens: def.tokens,
    css: def.css ? String((await def.css()).default) : '',
    source: scripts.map(f => readFileSync(f, 'utf8')).join('\n'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const themesDir = join(SRC, 'themes');
  const dirs = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(themesDir).map(f => join(themesDir, f)).filter(d => statSync(d).isDirectory());
  const base = kinetic();
  const themes = [base, ...await Promise.all(dirs.map(themeIn))];
  const problems = themes.flatMap(t => themeProblems(t, base.tokens));
  problems.forEach(p => console.error(p));
  console.log(problems.length ? `Theme guard: ${problems.length} problems.` : `Theme guard: ${themes.map(t => t.id).join(', ')} pass.`);
  process.exitCode = problems.length ? 1 : 0;
}
