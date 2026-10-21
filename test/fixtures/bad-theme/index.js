/* A theme the guard must refuse: grey text on grey, a hidden focus ring and a CSS animation. Never shipped. */
import {defineTheme} from '../../../src/themes/define.js';

export default defineTheme({
  id: 'bad',
  tokens: {light: {fg: '#999999', bg: '#bbbbbb'}, dark: {}},
  css: async () => ({default: ':focus-visible { outline: none; } .b-lead { animation: spin 1s; }'}),
});
