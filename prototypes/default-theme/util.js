// PROTOTYPE (issue #13). Tiny DOM helpers shared by the scenes. No layout or styling lives here.
export function el(tag, cls, text, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (parent) parent.append(n);
  return n;
}
// Font size (in cqw) that makes `str` roughly fill `width` cqw of the frame. `k` is the glyph width per em.
export const fit = (str, width = 88, k = 0.6, max = 60) => `${Math.min(max, width / (String(str).length * k)).toFixed(2)}cqw`;
// Palette colour field: returns [background var, text var].
export const field = c => [`var(--${c})`, `var(--on-${c})`];
export const ease = {
  snap: 'cubic-bezier(.2,1.4,.4,1)',   // overshoot
  out: 'cubic-bezier(.16,1,.3,1)',
  in: 'cubic-bezier(.7,0,.84,0)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
};

// Guess verdicts and other stickers never cover data: put the sticker in the tallest empty horizontal band of its
// container, nearest `prefer` (a fraction of the height). Layout boxes are used, so entrance transforms don't matter.
export function placeClear(container, node, prefer = 0.6) {
  node.style.top = node.style.bottom = 'auto';
  const H = container.clientHeight, top = H * 0.11, bottom = H * 0.97;
  const slack = node.offsetWidth * 0.1 + 8, need = node.offsetHeight + slack;
  const taken = [...container.children].filter(c => c !== node && c.offsetHeight && c.offsetHeight < H * 0.9)
    .map(c => [c.offsetTop, c.offsetTop + c.offsetHeight]).sort((a, b) => a[0] - b[0]);
  const gaps = []; let cur = top;
  for (const [a, b] of taken) { if (a > cur) gaps.push([cur, Math.min(a, bottom)]); cur = Math.max(cur, b); }
  if (cur < bottom) gaps.push([cur, bottom]);
  const fits = gaps.filter(([a, b]) => b - a >= need);
  const dist = ([a, b]) => Math.abs((a + b) / 2 - H * prefer);
  const gap = fits.sort((x, y) => dist(x) - dist(y))[0] || gaps.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  // No empty band: shrink the sticker a few times, then dock it in the story's header label instead.
  if (!fits.length) {
    const size = parseFloat(getComputedStyle(node).fontSize);
    if ((node.dataset.shrink = +(node.dataset.shrink || 0) + 1) <= 3) { node.style.fontSize = size * 0.85 + 'px'; return placeClear(container, node, prefer); }
    const label = document.querySelector('.ctl-label');
    if (label) { const d = document.createElement('span'); d.className = 'docked' + (node.classList.contains('is-right') ? ' is-right' : ''); d.textContent = node.textContent; label.append(d); node.remove(); return; }
  }
  if (!gap) return;
  const mid = Math.min(Math.max((gap[0] + gap[1]) / 2, gap[0] + need / 2), gap[1] - need / 2);
  node.style.top = `${mid - node.offsetHeight / 2}px`;
  if (!fits.length) node.dataset.cramped = '';
}
