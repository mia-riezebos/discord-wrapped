import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {kinetic, themeIn, themeProblems} from '../scripts/theme-guard.mjs';

const GUARD = fileURLToPath(new URL('../scripts/theme-guard.mjs', import.meta.url));
const THEMES = new URL('../src/themes/', import.meta.url);

test('Kinetic and every theme in src/themes pass', async () => {
  const base = kinetic(), dirs = readdirSync(THEMES, {withFileTypes: true}).filter(d => d.isDirectory());
  assert.ok(dirs.some(d => d.name === 'example'));
  for (const theme of [base, ...await Promise.all(dirs.map(d => themeIn(fileURLToPath(new URL(d.name, THEMES)))))])
    assert.deepEqual(themeProblems(theme, base.tokens), [], theme.id);
});

test('a theme fails for each rule it breaks', () => {
  const base = kinetic().tokens;
  const stub = (over = {}) => ({id: 'stub', tokens: {light: {}, dark: {}}, css: '', source: '', ...over});
  for (const [why, theme, problem] of [
    ['a token outside the set', stub({tokens: {light: {font: 'serif'}}}), /--font isn't a token/],
    ['a stylesheet setting its own custom property', stub({css: '.x { --gap: 4px; }'}), /sets --gap/],
    ['a colour the guard can’t measure', stub({tokens: {light: {fg: 'rebeccapurple'}}}), /--fg in light is rebeccapurple/],
    ['body text too faint', stub({tokens: {light: {muted: '#aaaaaa'}}}), /text --muted on --bg in light is/],
    // Dark mode keeps the theme's light tokens it doesn't override, so a light palette colour can fail on a dark bg.
    ['a chart colour lost on the dark background', stub({tokens: {light: {c3: '#2d5b86', 'on-c3': '#ffffff'}}}), /chart mark --c3 on --bg in dark is/],
    ['a hidden focus ring', stub({css: 'button:focus-visible { outline: 0; }'}), /hides an outline/],
    ['a CSS transition', stub({css: '.n-lead { transition: opacity .2s; }'}), /stylesheet animates/],
    ['a timer in a scene', stub({source: 'setTimeout(() => n.remove(), 400)'}), /animate with CSS or timers/],
  ]) assert.match(themeProblems(theme, base).join('\n'), problem, why);
});

test('the guard exits with an error on a bad theme, failing pnpm check', () => {
  const run = spawnSync(process.execPath, [GUARD, fileURLToPath(new URL('fixtures/bad-theme', import.meta.url))], {encoding: 'utf8'});
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^bad: text --fg on --bg in light/m);
  assert.match(run.stderr, /^bad: its stylesheet hides an outline/m);
  assert.match(run.stderr, /^bad: its stylesheet animates/m);
});
