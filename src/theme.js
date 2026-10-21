/* Theme loading: a year theme resolved over Kinetic, with fallbacks so a reel always plays. Pure apart from the
   import() it's given, so the tests run it on stub themes. STORY_SECTIONS comes from the page's shared scope. */

const STEPS = ['ask', 'reveal'];
const isScene = s => STEPS.every(k => typeof s?.[k] === 'function');
// A scene that throws hands the story to `safe` (Kinetic's scene for it), after removing whatever it had built.
const guard = (scene, safe) => Object.fromEntries(STEPS.map(step => [step, async (stage, ...args) => {
  const before = new Set(stage.children);
  try { await scene[step](stage, ...args); }
  catch (e) {
    console.error(e);
    [...stage.children].filter(n => !before.has(n)).forEach(n => n.remove());
    await safe[step](stage, ...args);
  }
}]));
// A scene given as () => import(): the module's default export, or the scene it resolves to.
async function sceneOf(v) {
  const m = typeof v === 'function' ? await v() : v, s = m?.default ?? m;
  if (!isScene(s)) throw new Error('Not a scene: it needs ask and reveal');
  return s;
}

/**
 * Loads theme `id` over `base` (Kinetic, a defineTheme result with scenes as objects). `load(id)` imports its entry
 * file. Resolves with a theme for openReel and themeCss: {id, scenes, fallback, chrome(i, phase, story), tokens,
 * fonts, css, questions, stories}. Never rejects:
 * - a scene that is missing, fails to load or throws plays base's scene for that story;
 * - an entry file (or its stylesheet) that fails gives base itself with `failed: true`, so the reel plays all-Kinetic;
 * - a year story whose scene fails to load is left out.
 */
export async function loadTheme(id, base, load = id => import(`/themes/${id}/index.js`)) {
  let def, css;
  try {
    def = (await load(id))?.default;
    if (def?.id !== String(id)) throw new Error(`/themes/${id}/ doesn't define theme ${id}`);
    css = def.css ? String((await def.css()).default) : '';
  } catch (e) {
    console.error(e);
    return {...base, failed: true};
  }
  const own = {}, safe = sid => base.scenes[sid] || base.fallback;
  await Promise.all(Object.entries(def.scenes).map(async ([sid, v]) => {
    try { own[sid] = guard(await sceneOf(v), safe(sid)); } catch (e) { console.error(e); }
  }));
  const stories = (await Promise.all(def.stories.map(async s => {
    try {
      if (s.scene) own[s.id] = guard(await sceneOf(s.scene), base.fallback);
      return s;
    } catch (e) { console.error(e); return null; }
  }))).filter(Boolean);
  // The controls follow the theme's own scenes and its summary, and Kinetic's wherever a story fell back to it.
  const chrome = (i, phase, story) => ((story ? own[story.id] : true) && def.chrome || base.chrome)?.(i, phase);
  return {id: def.id, scenes: {...base.scenes, ...own}, fallback: base.fallback, chrome, tokens: def.tokens, fonts: def.fonts, css, questions: def.questions, stories};
}

/**
 * The reel's stories in `theme`: the core `stories` (from buildStories) with any question the theme rewords, and each
 * year story after the last story of the section it names. ctx is {report, period, reportOf} for year-story facts.
 * A year story whose facts throw or leave out its question, answer, share text or card hero is skipped, as is one
 * whose facts return null (not enough data).
 */
export async function themeStories(theme, stories, ctx) {
  const reword = s => {
    try { return theme.questions[s.id] ? {...s, question: String(theme.questions[s.id](s))} : s; }
    catch (e) { console.error(e); return s; }
  };
  const extra = await Promise.all(theme.stories.map(async ({id, section, facts}) => {
    try {
      const f = await facts(ctx);
      if (!f) return null;
      if (!f.question || !f.answer || !f.share || !f.card?.hero) throw new Error(`Year story ${id} needs a question, answer, share text and card hero`);
      return {value: null, data: {}, ...f, id, section, enough: true};
    } catch (e) { console.error(e); return null; }
  }));
  // A stable sort keeps core stories in their order and puts year stories last in their section.
  const order = STORY_SECTIONS.map(s => s.id);
  return [...stories.map(reword), ...extra.filter(Boolean)].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

/** The stylesheet a theme adds to the page while its year is selected: its tokens on html[data-theme], fonts and css. */
export function themeCss(theme) {
  const sel = `html[data-theme="${theme.id}"]`, vars = o => Object.entries(o || {}).map(([k, v]) => `--${k}: ${v};`).join(' ');
  return [
    `${sel} { ${vars(theme.tokens.light)} }`,
    `@media (prefers-color-scheme: dark) { ${sel} { ${vars(theme.tokens.dark)} } }`,
    ...theme.fonts.map(f => `@font-face { font-family: "${f.family}"; src: url("${f.src}") format("woff2"); font-weight: ${f.weight || 400}; font-display: swap; }`),
    theme.css,
  ].join('\n');
}

/**
 * The year-theme files to save ahead of time for a package whose messages span `bounds` ({first, last} dates):
 * every file of each themed year inside it, once. `files` is {year: [url]}; `connection` is navigator.connection,
 * and with data saver on nothing is saved.
 */
export function themePrefetch(bounds, files, connection) {
  if (connection?.saveData) return [];
  const from = +bounds.first.slice(0, 4), to = +bounds.last.slice(0, 4);
  return [...new Set(Object.entries(files).filter(([year]) => +year >= from && +year <= to).flatMap(([, f]) => f))];
}
