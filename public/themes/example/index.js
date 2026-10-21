/* Late edition: the example year theme. Every story is a newspaper front page: a masthead, the question as the
   headline, then a fresh sheet with the answer set as the lead, its chart or box score, and your guess as a red
   stamp. Used by the tests and the preview (?theme=example&story=messages), and not linked from the site.
   DM Serif Display is Google's Latin subset, unmodified, under the SIL Open Font License (OFL.txt). */
import {defineTheme} from '../define.js';

const front = () => import('./scenes.js').then(m => m.front);
const CORE = ['messages', 'active-days', 'loudest', 'streak', 'night-owl', 'biggest-day', 'fastest-minute', 'where', 'top-server', 'top-dm',
  'inner-circle', 'top-word', 'say-most', 'emoji', 'links', 'first-message', 'longest-message', 'longest-session'];
const num = n => Number(n).toLocaleString();

export default defineTheme({
  id: 'example',
  tokens: {
    light: {
      bg: '#f2ede3', surface: '#faf7f0', fg: '#16130f', muted: '#5c564c', border: '#d9d1c1', soft: '#e9e2d3', accent: '#b3122a', 'accent-fg': '#ffffff',
      c1: '#16130f', c2: '#b3122a', c3: '#2d5b86', c4: '#8a5d0c', c5: '#4a6536',
      'on-c1': '#faf7f0', 'on-c2': '#faf7f0', 'on-c3': '#faf7f0', 'on-c4': '#faf7f0', 'on-c5': '#faf7f0',
      display: '"DM Serif Display", Georgia, serif',
    },
    dark: {
      bg: '#14120f', surface: '#1c1915', fg: '#efe8da', muted: '#a39b8c', border: '#353029', soft: '#27231e', accent: '#ff6b5e', 'accent-fg': '#14120f',
      c1: '#efe8da', c2: '#ff6b5e', c3: '#7fb0e0', c4: '#e3a84a', c5: '#9cc27a',
      'on-c1': '#14120f', 'on-c2': '#14120f', 'on-c3': '#14120f', 'on-c4': '#14120f', 'on-c5': '#14120f',
    },
  },
  fonts: [{family: 'DM Serif Display', src: new URL('dm-serif-display.woff2', import.meta.url).href}],
  scenes: Object.fromEntries(CORE.map(id => [id, front])),
  questions: {messages: s => `Stop the presses. ${s.question}`},
  stories: [{
    // Compares with the year before, from that year's report.
    id: 'vs-last-year', section: 'overview', scene: front,
    async facts({report, period, reportOf}) {
      const year = +period.label, before = year - 1;
      const last = await reportOf({kind: 'year', anchor: `${before}-12-31`});
      // Without messages that year, the report is empty or (clamped to the data) another year.
      if (last.empty || !last.range.from.startsWith(String(before))) return null;
      const now = report.totals.messages, then = last.totals.messages, pct = Math.round(100 * Math.abs(now - then) / Math.max(1, then));
      const more = now >= then, change = `${pct}% ${more ? 'more' : 'fewer'}`;
      return {
        question: `Did you send more messages than in ${before}?`,
        answer: `${change} than in ${before}`,
        share: `I sent ${num(now)} messages on Discord in ${year}, ${change} than in ${before}.`,
        value: pct,
        card: {hero: `${more ? '+' : '−'}${pct}%`, fact: `${num(now)} messages in ${year}, ${num(then)} in ${before}.`, chart: {buckets: [[String(before), then], [String(year), now]], top: 1}},
      };
    },
  }],
  css: () => import('./style.js'),
  chrome: () => 'var(--fg)',
});
