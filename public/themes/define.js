/* defineTheme: every theme's one entry. Inlined into the page for Kinetic, and served as /themes/define.js for year
   themes to import, so both declare themselves the same way. Pure, so the tests can import it. */

/**
 * Declares a theme. Year themes live in src/themes/<id>/index.js and `export default defineTheme({...})`.
 * - id: 'kinetic', or the theme's folder under /themes/: a year ('2025'), or 'example'.
 * - tokens: {light, dark}, custom properties without their dashes ({bg: '#fff', display: '"Face", serif'}). They apply
 *   to the whole page while the year is selected, so its reel, report and share cards all take them.
 * - fonts: [{family, src, weight?}], one display face, src an absolute URL (new URL('x.woff2', import.meta.url)).
 * - scenes: {[storyId]: scene, or () => import() resolving to one}. A story without one plays Kinetic's scene.
 * - questions: {[storyId]: story => text}, rewording a core story's question. Answers and numbers never change.
 * - stories: one to three year stories, [{id, section, facts(ctx), scene?}]. facts gets {report, period, reportOf} and
 *   returns {question, answer, share, value, data, card, guess?} like buildStories' stories, or null without enough
 *   data; reportOf(period) resolves with another period's report. section is the STORY_SECTIONS id it plays after.
 * - css: () => import() resolving to {default: css}: scene styles and the report restyle, within DESIGN.md's limits.
 * - chrome(i, phase): CSS colour for the player's controls over the theme's own scenes.
 * - fallback: the scene for any story without one. Only Kinetic, the theme every other falls back to, sets it.
 */
export function defineTheme({id, tokens = {}, fonts = [], scenes = {}, questions = {}, stories = [], css = null, chrome = null, fallback = null}) {
  if (!id) throw new Error('A theme needs an id');
  return Object.freeze({id: String(id), tokens, fonts, scenes, questions, stories, css, chrome, fallback});
}
