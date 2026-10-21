/* Late edition's stylesheet, injected while its year is selected: the scenes (n- classes), then the report restyle.
   The report keeps its section order, headings, column width, controls and "Show the numbers" tables; this changes
   only type, shape, rules and chart marks. */
const T = 'html[data-theme="example"]';
export default `
/* scenes */
.n-sheet { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 3cqw; padding: 12cqh 7cqw 14cqh; background: var(--bg); color: var(--fg); }
.n-answer { background: var(--surface); box-shadow: -2cqw 0 4cqw rgb(0 0 0 / .18); }
.n-mast { display: grid; gap: 1.2cqw; padding: 2.4cqw 0 1.6cqw; text-align: center;
  background: linear-gradient(var(--fg), var(--fg)) left top / 100% 3px no-repeat, linear-gradient(var(--fg), var(--fg)) left bottom / 100% 1px no-repeat; }
.n-name { margin: 0; font: 400 10cqw/1 var(--display); letter-spacing: -.01em; }
.n-meta { display: flex; justify-content: space-between; margin: 0; font-size: 3.4cqw; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.n-head { margin: 4cqw 0 0; font: 400 11.5cqw/1.02 var(--display); letter-spacing: -.015em; }
.n-head span { display: inline-block; }
.n-kicker { margin: 2cqw 0 0; color: var(--accent); font-size: 4.2cqw; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; line-height: 1.3; }
.n-lead { margin: 0; font: 400 20cqw/1 var(--display); letter-spacing: -.02em; overflow-wrap: break-word; font-variant-numeric: lining-nums; transform-origin: 0 60%; }
.n-rule { flex: none; height: 1px; background: var(--fg); transform-origin: left; }
.n-dek { margin: 0; color: var(--muted); font-size: 5.2cqw; font-weight: 550; line-height: 1.3; }
.n-cols { flex: none; height: 26cqh; margin: auto 0 5cqw; padding-top: 8cqw; display: flex; align-items: flex-end; gap: 1cqw; border-bottom: 2px solid var(--fg); }
.n-cols div { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; }
.n-cols i { position: relative; flex: 1; background: repeating-linear-gradient(-45deg, var(--fg) 0 1px, transparent 1px 4px); box-shadow: inset 0 0 0 1px var(--fg); transform-origin: bottom; }
.n-cols .on i { background: var(--accent); box-shadow: none; }
.n-cols b { position: absolute; left: 50%; bottom: calc(100% + 1cqw); translate: -50%; font: 400 6cqw/1 var(--display); color: var(--accent); white-space: nowrap; }
.n-cols span { position: absolute; top: calc(100% + 1.4cqw); left: 50%; translate: -50%; font-size: 3.4cqw; font-weight: 650; white-space: nowrap; color: var(--muted); }
.n-cols div:first-child span { left: 0; translate: none; }
.n-cols div:last-child span { left: auto; right: 0; translate: none; }
.n-cols .on span { color: var(--accent); }
.n-table { margin: auto 0 0; padding: 0; list-style: none; display: grid; border-top: 2px solid var(--fg); }
.n-table li { display: flex; align-items: baseline; gap: 2cqw; padding: 2cqw 0; border-bottom: 1px solid var(--border); font-size: 4.6cqw; font-weight: 600; }
.n-table span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.n-table li::after { content: ""; order: 1; flex: 1; min-width: 4cqw; border-bottom: 1.5px dotted var(--muted); }
.n-table b { order: 2; font-variant-numeric: tabular-nums; }
.n-table .on { color: var(--accent); font-weight: 800; }
.n-stamp { position: absolute; right: 7cqw; max-width: 74cqw; margin: 0; display: grid; gap: .2em; padding: 2.4cqw 4cqw; border: .8cqw double var(--accent); border-radius: 1.5cqw;
  background: var(--surface); color: var(--accent); font-size: 5cqw; font-weight: 800; line-height: 1.15; rotate: -6deg; }
.n-stamp span { font-size: .72em; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
/* The summary is the back page: the player's own layout in the paper's colours. */
${T} .reel-summary { background: var(--bg); color: var(--fg); border-top: 3px double var(--fg); }
${T} .reel-summary h2 { font-weight: 400; font-size: 13cqw; letter-spacing: -.015em; }
${T} .reel-summary button { border-radius: 2px; }

/* report */
${T} h1, ${T} h2, ${T} .metric strong, ${T} .fame .big { font-weight: 400; letter-spacing: -.01em; }
${T} h1 { font-size: clamp(34px, 6vw, 56px); line-height: 1.02; }
${T} .hero { padding-top: 20px; }
${T} .hero::before { content: "The Wrapped · Late edition"; display: block; margin-bottom: 18px; padding: 8px 0 6px; border-block: 3px double var(--fg); font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; text-align: center; }
${T} section.card { border: 0; border-top: 3px double var(--fg); border-radius: 0; box-shadow: none; }
${T} section.card h2 { font-size: 26px; }
${T} .metric strong { font-size: 32px; }
${T} .findings li, ${T} .detail, ${T} .ai-box, ${T} .msg, ${T} .fame article, ${T} .quote { border-radius: 0; }
${T} button, ${T} .button, ${T} select, ${T} input, ${T} textarea, ${T} .seg, ${T} .seg span, ${T} .menu summary, ${T} .chip { border-radius: 2px; }
${T} .chart rect:not(.hit) { rx: 0; }
${T} .chart .grid { stroke-dasharray: 1 3; stroke: var(--muted); }
${T} .track, ${T} .track span { border-radius: 0; }
${T} .track { height: 4px; }
${T} blockquote { border-left-color: var(--accent); }
`;
