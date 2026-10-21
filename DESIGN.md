# Design

Discord Wrapped is a report people read once, then mine for things to share. The design serves two moments:
scanning a period at a glance, and lifting one number, word or quote out of it.

## Composition

- One content column, 1040 px wide. Sponsor rails sit outside it on screens at least 1480 px wide and never enter
  share images.
- The header is always visible. The report adds a period bar that sticks under it: period length (Week, Month,
  Year, All time, Custom), then Previous and Next buttons labelled with the period they open. Year is the default,
  on the year of the newest message.
- Each section is a card: heading, then charts, each followed by the highlights it supports. Highlights are plain
  sentences, the claim in full colour and the detail muted. There are no stripes, badges or tinted boxes.
- Charts adapt to the period. Bars use the largest bucket that gives 4 to 24 bars (years, months, weeks or days),
  and the line chart uses the next size down. Choosing a year, month or week bar opens that period.
- Overview numbers sit in one row of six on wide screens, three by two below 900 px, two columns below 520 px.

## Type

System UI sans at 15 px body, 1.55 line height. Headings are 600 weight. Big numbers are 650 weight with tabular
figures and slight negative tracking, so columns of numbers line up. Highlights are 16 px for reading at a glance.

## Color

Tokens in `src/style.css`, with light and dark values that follow the system setting:

| Token | Role |
| --- | --- |
| `--bg`, `--surface` | Page and card backgrounds |
| `--fg`, `--muted` | Text and secondary text, both at least 4.5:1 on either background |
| `--border`, `--soft` | Lines and quiet fills (empty calendar days, rank tracks, hover) |
| `--accent` | Focus rings, primary buttons, the shared row on a card |
| `--c1` to `--c5` | Chart series in a fixed order: servers, DMs, group DMs, then topics |

The selected period length is the one inverted control (foreground on background), so the current period reads first.

## Shape and depth

Radius 8 px for controls, 14 px for cards. Depth comes from borders. Only the share popover, the data menu and the
"New version ready" notice cast shadows, because they float over content.

## Charts

- Every bar and line chart has a collapsed "Show the numbers" table with the exact values.
- Hover and keyboard focus show the same tooltip.
- The weekday-hour heatmap stretches its shading over the actual range, using a square-root scale.
- In the bump chart, words that recur get palette colours and one-off words stay muted. Words are focusable buttons
  that open the share popover.

## Share cards

One builder (`src/card.js`) draws every card in the current theme, in two shapes: 16:9 (1200 × 675) for posts and
9:16 (1080 × 1920) for stories. The share popover offers both and starts on 9:16 on phones. The headline shrinks to
fit two lines, the subline is one fact, and the graphic is the section's chart or, for ranked lists, the list as bars
with the shared row in the accent colour. A shared bump-chart word keeps its colour while the other words fade. The
9:16 card centres its content and keeps it clear of the bottom of the screen. The footer is the site host alone,
bottom left.

Every word on the card preview and in the post is a button: a tap hides it in both, and another tap brings it back.
A hidden word is a felt-tip scribble on the card and ████ in the post, one fixed width whatever it covers, and
neighbouring hidden words merge into one mark. Nothing starts hidden. "Hide names" covers server, channel and DM names
everywhere, bar labels included; "Hide quotes" covers quoted messages, ranked words and search terms, on the bump
chart too. When the headline is a hidden name, the card shows the count instead. On phones, "Zoom in" shows the card
at 2.5× in a pannable frame, so its small text is tappable. "Edit text" turns the post into a text box; later
redactions still black out newly hidden terms in it.

## Motion

Only opacity and colour transitions under 150 ms. Smooth scrolling and transitions turn off under
`prefers-reduced-motion`.

## Stories

"Play" in the period bar opens a reel for a year or All time: a 9:16 frame, full screen on phones and centred over
the dimmed report elsewhere. Reels are the one place with bold motion. The default theme, Kinetic, sets each story
on a full-frame palette colour with heavy type; text on a colour uses its `--on-c1` to `--on-c5` token. Under
`prefers-reduced-motion` the player turns every scene animation into a short crossfade to its end state.
