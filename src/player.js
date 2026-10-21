/* The story player: a 9:16 frame over the report that plays a reel of stories in a theme.
   The player owns timing, controls, progress bars, announcements and reduced motion. A theme's scenes only build
   elements and start Web Animations; the player times, skips and crossfades them through getAnimations() on the
   story's stage, so scenes never handle timers or input.

   A theme is {scenes: {[storyId]: scene}, fallback: scene, chrome?(i, phase) => CSS colour for the controls}.
   A scene is {ask(stage, story, ctx), reveal(stage, story, guessResult, ctx)}; ctx is {i, total, title, reduced,
   sticker(container, node, prefer)}. */

/**
 * Pure part of sticker placement: the top of the empty horizontal band of height `need` nearest `prefer` (a fraction
 * of `height`), given the [top, bottom] boxes already taken. Null when no band is tall enough.
 */
export function clearBand(taken, height, need, prefer = 0.6) {
  const top = height * 0.11, bottom = height * 0.97, gaps = [];
  let cur = top;
  for (const [a, b] of [...taken].sort((x, y) => x[0] - y[0])) { if (a > cur) gaps.push([cur, Math.min(a, bottom)]); cur = Math.max(cur, b); }
  if (cur < bottom) gaps.push([cur, bottom]);
  const dist = ([a, b]) => Math.abs((a + b) / 2 - height * prefer);
  const gap = gaps.filter(([a, b]) => b - a >= need).sort((x, y) => dist(x) - dist(y))[0];
  if (!gap) return null;
  return Math.min(Math.max((gap[0] + gap[1]) / 2, gap[0] + need / 2), gap[1] - need / 2) - need / 2;
}

/**
 * Stickers (guess verdicts and the like) never cover data: put `node` in the empty band of `container` nearest
 * `prefer`. With no room it shrinks up to three times, then docks into `dock` (the story's header label) instead.
 * Layout boxes are measured, so entrance transforms don't matter.
 */
export function placeClear(container, node, prefer = 0.6, dock = null) {
  const H = container.clientHeight;
  for (let shrink = 0; shrink <= 3; shrink++) {
    if (shrink) node.style.fontSize = parseFloat(getComputedStyle(node).fontSize) * 0.85 + 'px';
    const taken = [...container.children].filter(c => c !== node && c.offsetHeight && c.offsetHeight < H * 0.9).map(c => [c.offsetTop, c.offsetTop + c.offsetHeight]);
    const top = clearBand(taken, H, node.offsetHeight + 8, prefer);
    if (top != null) { node.style.top = `${top + 4}px`; node.style.bottom = 'auto'; return true; }
  }
  if (dock) { const d = document.createElement('span'); d.className = 'reel-docked'; d.textContent = node.textContent; dock.append(d); }
  node.remove();
  return false;
}

/**
 * Opens the player over the page and plays `stories` (from buildStories) in `theme`, from story `start`, or only
 * the stories of `section` (a section reel). Each story holds on its answer until Next; a summary ends the reel.
 * `title` names the period on screen ("2025", "All time"), `ending` heads the summary, `opener` gets focus back on close, and
 * `onShare(story, button, host)` handles "Share this", where `host` is an element inside the dialog for any
 * popover it opens. Returns {close}.
 */
export function openReel({stories, theme, start = 0, section, title, ending = `That was your ${title}`, opener, onShare, onClose}) {
  const list = section ? stories.filter(s => s.section === section) : stories;
  const ASK_MIN = 1500;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sectionName = id => STORY_SECTIONS.find(s => s.id === id)?.name || '';
  const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  const dialog = document.createElement('dialog');
  dialog.className = 'reel';
  dialog.setAttribute('aria-label', `Your ${title} reel`);
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = `<div class="reel-frame">
      <div class="reel-stages"></div>
      <div class="reel-zone reel-zone-prev" aria-hidden="true"></div><div class="reel-zone reel-zone-next" aria-hidden="true"></div>
      <div class="reel-chrome">
        <div class="reel-bars" aria-hidden="true">${list.map(() => '<span><i></i></span>').join('')}</div>
        <div class="reel-ctl"><span class="reel-label"></span>
          <button type="button" class="reel-prev" aria-label="Previous story">${icon('M15 5l-7 7 7 7')}</button>
          <button type="button" class="reel-next" aria-label="Next story">${icon('M9 5l7 7-7 7')}</button>
          <button type="button" class="reel-close" aria-label="Close reel">${icon('M6 6l12 12M18 6 6 18')}</button></div>
      </div>
      <div class="reel-after" hidden><button type="button" class="reel-share">Share this</button><button type="button" class="reel-go">Next <span aria-hidden="true">→</span></button></div>
      <div class="reel-summary" hidden><h2></h2><ol></ol><div><button type="button" class="reel-again">Play again</button><button type="button" class="reel-done">Close</button></div></div>
      <p class="sr-only" aria-live="polite"></p>
    </div>`;
  const q = s => dialog.querySelector(s);
  const frame = q('.reel-frame'), stages = q('.reel-stages'), label = q('.reel-label'), after = q('.reel-after'), summary = q('.reel-summary'), live = q('[aria-live]');
  const bars = [...q('.reel-bars').children].map(s => s.firstChild);
  const state = {i: 0, phase: 'ask', token: 0, skip: null, closed: false};

  const say = text => { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 50); };
  const settle = anims => Promise.allSettled(anims.map(a => a.finished));
  const finish = anims => anims.forEach(a => { try { a.finish(); } catch { a.cancel(); } });
  const endOf = anims => anims.reduce((m, a) => { const e = a.effect?.getComputedTiming().endTime; return Number.isFinite(e) ? Math.max(m, e) : m; }, 0);
  const setPhase = phase => {
    state.phase = phase; frame.dataset.phase = phase;
    frame.style.setProperty('--reel-chrome', theme.chrome?.(state.i, phase) || '');
    q('.reel-next').setAttribute('aria-label', phase === 'hold' && state.i + 1 >= list.length ? 'Summary' : 'Next story');
  };
  // Reduced motion: every scene animation becomes a short crossfade into its own end state, at its own start time.
  function crossfade(anims) {
    const skip = new Set(['offset', 'easing', 'composite', 'computedOffset', 'opacity']);
    for (const a of anims) {
      const k = a.effect.getKeyframes(); if (!k.length) continue;
      const first = k[0], last = k.at(-1), hold = {};
      for (const [p, v] of Object.entries(last)) if (!skip.has(p)) hold[p] = v;
      // Without its own opacity keyframes, an element fades up to its styled opacity.
      const rest = a.effect.target ? getComputedStyle(a.effect.target).opacity : 1;
      a.effect.setKeyframes([{...hold, opacity: first.opacity ?? 0}, {...hold, opacity: last.opacity ?? rest}]);
      a.effect.updateTiming({duration: 300, easing: 'linear', iterations: 1, fill: 'both'});
    }
  }
  // The progress bar of the current story fills over each phase and doubles as the question beat's clock.
  function fill(to, duration) {
    const bar = bars[state.i], from = getComputedStyle(bar).transform === 'none' ? 0 : new DOMMatrix(getComputedStyle(bar).transform).a;
    bar.getAnimations().forEach(a => a.cancel());
    bar.style.transform = `scaleX(${to})`;
    return bar.animate([{transform: `scaleX(${from})`}, {transform: `scaleX(${to})`}], {duration, easing: 'linear'});
  }
  // Scenes that throw fall back to the theme's plain scene, so a story always shows its question and answer.
  async function run(stage, step, args) {
    const story = list[state.i], scene = theme.scenes[story.id] || theme.fallback;
    try { await scene[step](stage, ...args); }
    catch (e) { console.error(e); if (scene === theme.fallback) throw e; if (step === 'ask') stage.replaceChildren(); await theme.fallback[step](stage, ...args); }
  }

  async function play(i) {
    const my = ++state.token, story = list[i];
    state.i = i; state.skip = null;
    if (summary.contains(document.activeElement)) q('.reel-next').focus({preventScroll: true});
    summary.hidden = true; hideAfter();
    bars.forEach((b, k) => { b.getAnimations().forEach(a => a.cancel()); b.style.transform = `scaleX(${k < i ? 1 : 0})`; });
    label.textContent = `${title} · ${sectionName(story.section)}`;
    frame.dataset.story = story.id;
    setPhase('ask');
    // The last story stays underneath, at its end state, until the new question has entered over it.
    const old = [...stages.children];
    old.forEach(o => { o.inert = true; finish(o.getAnimations({subtree: true})); });
    const stage = document.createElement('div');
    stage.className = 'reel-stage';
    stages.append(stage);
    const ctx = {i, total: list.length, title, reduced, sticker: (box, node, prefer) => placeClear(box, node, prefer, label)};
    say(story.question);
    await run(stage, 'ask', [story, ctx]);
    if (my !== state.token) return;
    const askAnims = stage.getAnimations({subtree: true});
    if (reduced) crossfade(askAnims);
    // No guesses yet, so every story holds its question for 1.5 s, or until its entrance ends if that's longer.
    const beat = fill(0.3, Math.max(ASK_MIN, endOf(askAnims)));
    state.skip = () => { finish(askAnims); beat.finish(); };
    await settle([beat]);
    if (my !== state.token) return;
    old.forEach(o => o.remove());
    finish(askAnims);

    setPhase('reveal');
    const before = new Set(stage.getAnimations({subtree: true}));
    await run(stage, 'reveal', [story, {skipped: true}, ctx]);
    if (my !== state.token) return;
    const revealAnims = stage.getAnimations({subtree: true}).filter(a => !before.has(a));
    if (reduced) crossfade(revealAnims);
    say(story.answer);
    const bar = fill(1, endOf(revealAnims));
    // The first Next during a reveal jumps to its end state; the next one moves on.
    state.skip = () => { finish(revealAnims); bar.finish(); };
    await settle([bar, ...revealAnims]);
    if (my !== state.token) return;
    setPhase('hold');
    q('.reel-go').firstChild.textContent = i + 1 < list.length ? 'Next ' : 'Summary ';
    after.hidden = false;
    // Keyboard users who were stepping with Next keep going from the same place.
    if ([dialog, frame, q('.reel-next')].includes(document.activeElement)) q('.reel-go').focus({preventScroll: true});
  }
  function hideAfter() {
    if (after.contains(document.activeElement)) q('.reel-next').focus({preventScroll: true});
    after.hidden = true;
  }
  function end() {
    state.token++; state.i = list.length;
    hideAfter(); bars.forEach(b => { b.getAnimations().forEach(a => a.cancel()); b.style.transform = 'scaleX(1)'; });
    stages.replaceChildren();
    frame.dataset.story = 'summary'; setPhase('summary');
    label.textContent = title;
    summary.querySelector('h2').textContent = ending;
    summary.querySelector('ol').replaceChildren(...list.map(s => Object.assign(document.createElement('li'), {textContent: s.answer})));
    summary.hidden = false;
    q('.reel-again').focus({preventScroll: true});
    say(`${ending}. ${list.map(s => s.answer).join('. ')}.`);
  }
  function next() {
    if (state.phase === 'ask' || state.phase === 'reveal') return state.skip?.();
    if (state.phase === 'hold') return state.i + 1 < list.length ? play(state.i + 1) : end();
  }
  function prev() { play(state.phase === 'summary' ? list.length - 1 : Math.max(0, state.i - 1)); }
  function close() {
    if (state.closed) return;
    state.closed = true; state.token++;
    if (dialog.open) dialog.close();
    dialog.remove();
    opener?.focus({preventScroll: true});
    onClose?.();
  }

  q('.reel-prev').onclick = prev;
  q('.reel-next').onclick = next;
  q('.reel-go').onclick = next;
  q('.reel-close').onclick = q('.reel-done').onclick = close;
  q('.reel-again').onclick = () => play(0);
  q('.reel-share').onclick = e => onShare?.(list[state.i], e.currentTarget, dialog);
  q('.reel-zone-prev').onclick = prev;
  q('.reel-zone-next').onclick = next;
  // Escape closes the reel, unless it is closing a popover opened from it (focus is then outside the frame).
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    const a = document.activeElement;
    if (!dialog.contains(a) || a === dialog || frame.contains(a)) return close();
    // The popover hides itself; bring focus back to the button that opened it.
    setTimeout(() => { if (!dialog.contains(document.activeElement) && !after.hidden) q('.reel-share').focus(); }, 50);
  });
  // The browser may close a modal dialog itself after repeated Escapes; clean up the same way.
  dialog.addEventListener('close', close);
  dialog.addEventListener('keydown', e => {
    // Tab wraps around inside the player instead of leaving for the browser's own controls.
    if (e.key === 'Tab') {
      const stops = [...dialog.querySelectorAll('button, input, textarea, select, a[href]')].filter(n => n.getClientRects().length && !n.closest('[inert]') && !n.disabled);
      const k = stops.indexOf(document.activeElement), to = e.shiftKey ? (k <= 0 ? stops.at(-1) : null) : (k === stops.length - 1 ? stops[0] : null);
      if (to) { e.preventDefault(); to.focus(); }
    }
    // Keys typed into anything the player doesn't own (a share popover) are left to it.
    if (e.target !== dialog && !frame.contains(e.target)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  });

  document.body.append(dialog);
  dialog.showModal();
  q('.reel-next').focus({preventScroll: true});
  play(Math.min(Math.max(0, start), list.length - 1));
  return {close};
}
