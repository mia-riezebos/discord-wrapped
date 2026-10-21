/* The story player: a 9:16 frame over the report that plays a reel of stories in a theme.
   The player owns timing, controls, progress bars, announcements and reduced motion. A theme's scenes only build
   elements and start Web Animations; the player times, skips and crossfades them through getAnimations() on the
   story's stage, so scenes never handle timers or input.

   A theme is {scenes: {[storyId]: scene}, fallback: scene, chrome?(i, phase, story) => CSS colour for the controls}:
   Kinetic, or a year theme from loadTheme (theme.js).
   A scene is {ask(stage, story, ctx), reveal(stage, story, guessResult, ctx)}; ctx is {i, total, title, reduced,
   sticker(container, node, prefer)}. guessResult is scoreGuess()'s result for a story with a guess, null without one.
   Guess inputs belong to the player too, so every theme gets the same keyboard, touch and screen-reader behaviour;
   themes restyle them through CSS only. */

/**
 * Pure part of sticker placement: the top of the empty horizontal band of height `need` nearest `prefer` (a fraction
 * of `height`), given the [top, bottom] boxes already taken. Null when no band is tall enough.
 */
export function clearBand(taken, height, need, prefer = 0.6) {
  // The header sits in the top 11%, and Next (or a guess's controls) in the bottom 10%.
  const top = height * 0.11, bottom = height * 0.9, gaps = [];
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
 * `onShare(ctx, button, host)` handles "Share this" and the summary's Share, where `ctx` is the share context from
 * storyCard (with the story's guess, and `snapshot()`, a frozen copy of the frame for the share image) or summaryCard, and `host` is an element inside the dialog for any popover it
 * opens; without onShare neither button shows. `note` is one line shown over the first story (why a year's theme
 * isn't playing). Returns {close}.
 */
export function openReel({stories, theme, start = 0, section, title, ending = `That was your ${title}`, opener, onShare, onClose, note}) {
  const list = section ? stories.filter(s => s.section === section) : stories;
  const ASK_HOLD = 1500;
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
        <div class="reel-ctl"><span class="reel-label"></span><span class="reel-wait" aria-hidden="true">Waiting for you</span>
          <button type="button" class="reel-prev" aria-label="Previous story">${icon('M15 5l-7 7 7 7')}</button>
          <button type="button" class="reel-next" aria-label="Next story">${icon('M9 5l7 7-7 7')}</button>
          <button type="button" class="reel-close" aria-label="Close reel">${icon('M6 6l12 12M18 6 6 18')}</button></div>
        <p class="reel-note"${note ? '' : ' hidden'}></p>
      </div>
      <form class="reel-guess" hidden><div></div><div class="reel-guess-acts"><button type="button" class="reel-skip">Skip</button><button type="submit" class="reel-lock">Lock it in</button></div></form>
      <div class="reel-after" hidden><button type="button" class="reel-share"${onShare ? '' : ' hidden'}>Share this</button><button type="button" class="reel-go">Next <span aria-hidden="true">→</span></button></div>
      <div class="reel-summary" hidden><h2></h2><p class="reel-score"></p><ol></ol><div>${onShare ? '<button type="button" class="reel-share-all">Share</button>' : ''}<button type="button" class="reel-again">Play again</button><button type="button" class="reel-done">Close</button></div></div>
      <p class="sr-only" aria-live="polite"></p>
    </div>`;
  const q = s => dialog.querySelector(s);
  const frame = q('.reel-frame'), stages = q('.reel-stages'), label = q('.reel-label'), after = q('.reel-after'), summary = q('.reel-summary'), live = q('[aria-live]');
  const form = q('.reel-guess'), lock = q('.reel-lock');
  // Screen readers hear the note with the dialog's name as it opens.
  if (note) { q('.reel-note').textContent = note; q('.reel-note').id = 'reel-note'; dialog.setAttribute('aria-describedby', 'reel-note'); }
  const bars = [...q('.reel-bars').children].map(s => s.firstChild);
  // guesses: story id => scoreGuess() result, skips included, kept for the summary and for sharing.
  const state = {i: 0, phase: 'ask', token: 0, skip: null, closed: false, guesses: {}};

  const say = text => { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 50); };
  const settle = anims => Promise.allSettled(anims.map(a => a.finished));
  const finish = anims => anims.forEach(a => { try { a.finish(); } catch { a.cancel(); } });
  // Milliseconds until the last of `anims` ends.
  const endOf = anims => anims.reduce((m, a) => { const e = a.effect?.getComputedTiming().endTime - (a.currentTime ?? 0); return Number.isFinite(e) ? Math.max(m, e) : m; }, 0);
  const setPhase = phase => {
    state.phase = phase; frame.dataset.phase = phase;
    frame.style.setProperty('--reel-chrome', theme.chrome?.(state.i, phase, list[state.i]) || '');
    q('.reel-next').setAttribute('aria-label', phase === 'guess' ? 'Skip guess' : phase === 'hold' && state.i + 1 >= list.length ? 'Summary' : 'Next story');
    bars.forEach((b, k) => b.parentNode.classList.toggle('reel-waiting', phase === 'guess' && k === state.i));
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

  // The open guess: a slider with − and + or pick-one cards, then Lock it in (or Enter) or Skip. Nothing counts
  // until one of those. Resolves with the scored guess.
  function ask(story) {
    const spec = story.guess, answer = spec.type === 'pick' ? spec.answer : story.value, box = form.firstChild;
    let value = null;
    if (spec.type === 'slider') {
      const scale = sliderScale(spec, answer);
      box.className = 'reel-dial';
      box.innerHTML = `<button type="button" aria-label="Lower">−</button><output aria-hidden="true"><b></b><span></span></output><button type="button" aria-label="Higher">+</button>
        <input type="range" min="0" max="${scale.steps}" step="1" value="${scale.start}" aria-label="Your guess">`;
      const [less, read, more, range] = box.children, set = () => {
        value = scale.toValue(+range.value);
        const text = guessText(spec, value);
        read.firstChild.textContent = text.slice(0, text.lastIndexOf(' '));
        read.lastChild.textContent = text.slice(text.lastIndexOf(' ') + 1);
        range.setAttribute('aria-valuetext', text);
      };
      // − and + move one nice value, so a log slider never sticks on a step that rounds to the same number.
      const step = d => { const was = value; let p = +range.value; do p += d; while (p > 0 && p < scale.steps && scale.toValue(p) === was); range.value = Math.max(0, Math.min(scale.steps, p)); set(); };
      range.oninput = set;
      less.onclick = () => step(-1);
      more.onclick = () => step(1);
      set();
      lock.disabled = false;
    } else {
      box.className = 'reel-picks';
      box.innerHTML = `<fieldset><legend class="sr-only">Your guess</legend>${spec.options.map(() => '<label><input type="radio" name="reel-pick"><i aria-hidden="true"></i><span></span></label>').join('')}</fieldset>`;
      box.querySelectorAll('label').forEach((l, k) => {
        const o = spec.options[k], input = l.firstChild, text = l.lastChild;
        text.textContent = o.label;
        if (o.sub) text.append(Object.assign(document.createElement('small'), {textContent: o.sub}));
        input.value = o.key;
        input.onchange = () => { value = o.key; lock.disabled = false; };
      });
      lock.disabled = true;
    }
    form.hidden = false;
    if ([null, document.body, dialog, frame, q('.reel-next')].includes(document.activeElement)) box.querySelector('input').focus({preventScroll: true});
    return new Promise(resolve => {
      const done = guess => { hideGuess(); resolve(scoreGuess(spec, answer, guess)); };
      form.onsubmit = e => { e.preventDefault(); if (value != null) done(value); };
      q('.reel-skip').onclick = state.skip = () => done(null);
    });
  }
  function hideGuess() {
    if (form.contains(document.activeElement)) q('.reel-next').focus({preventScroll: true});
    form.hidden = true; form.onsubmit = e => e.preventDefault(); form.firstChild.replaceChildren();
  }

  async function play(i) {
    const my = ++state.token, story = list[i];
    state.i = i; state.skip = null;
    if (my > 1) q('.reel-note').hidden = true;
    if (summary.contains(document.activeElement)) q('.reel-next').focus({preventScroll: true});
    summary.hidden = true; hideAfter(); hideGuess();
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
    // A guess already answered in this reel isn't asked again; its story replays with the same result.
    const guessing = story.guess && !(story.id in state.guesses);
    say(guessing ? `${story.question} The story waits for your answer.` : story.question);
    await run(stage, 'ask', [story, ctx]);
    if (my !== state.token) return;
    const askAnims = stage.getAnimations({subtree: true});
    if (reduced) crossfade(askAnims);
    if (guessing) {
      // A guess opens at once, and the bar stops until it is locked in or skipped.
      setPhase('guess');
      fill(0.3, 300);
      const result = await ask(story);
      if (my !== state.token) return;
      state.guesses[story.id] = result;
    } else {
      // Otherwise the question stays readable for 1.5 s after its entrance lands.
      const beat = fill(0.3, endOf(askAnims) + ASK_HOLD);
      state.skip = () => { finish(askAnims); beat.finish(); };
      await settle([beat]);
      if (my !== state.token) return;
    }
    old.forEach(o => o.remove());
    finish(askAnims);

    setPhase('reveal');
    const before = new Set(stage.getAnimations({subtree: true}));
    const result = story.guess ? state.guesses[story.id] : null;
    await run(stage, 'reveal', [story, result, ctx]);
    if (my !== state.token) return;
    const revealAnims = stage.getAnimations({subtree: true}).filter(a => !before.has(a));
    if (reduced) crossfade(revealAnims);
    say(result && !result.skipped ? `You guessed ${guessText(story.guess, result.guess)}. ${story.answer}. ${result.line}` : story.answer);
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
    // Skipped guesses come off the total, the way a skip leaves no trace anywhere else.
    const played = list.filter(s => state.guesses[s.id] && !state.guesses[s.id].skipped), right = played.filter(s => state.guesses[s.id].right).length;
    const got = who => played.length ? `${who} got ${right} of ${played.length} ${played.length === 1 ? 'guess' : 'guesses'} right.` : '';
    const score = got('You');
    state.share = summaryCard(list, {title, ending, score: got('I')});
    summary.querySelector('.reel-score').textContent = score;
    summary.querySelector('ol').replaceChildren(...list.map(s => Object.assign(document.createElement('li'), {textContent: s.answer})));
    summary.hidden = false;
    q('.reel-again').focus({preventScroll: true});
    say(`${ending}. ${score ? score + ' ' : ''}${list.map(s => s.answer).join('. ')}.`);
  }
  function next() {
    if (state.phase === 'ask' || state.phase === 'guess' || state.phase === 'reveal') return state.skip?.();
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
  q('.reel-again').onclick = () => { state.guesses = {}; play(0); };
  // The story as it stands, for its share image: the frame with only its label and the current stage, every animated
  // box held at its end state, mounted out of sight in the dialog so the share sheet can redact and measure it.
  const snapshot = () => {
    const live = stages.lastElementChild, stage = live.cloneNode(true), copy = frame.cloneNode(false), {width, height} = frame.getBoundingClientRect();
    const to = [stage, ...stage.querySelectorAll('*')];
    [live, ...live.querySelectorAll('*')].forEach((n, k) => {
      if (!n.getAnimations().length) return;
      const s = getComputedStyle(n);
      for (const p of ['transform', 'opacity', 'clip-path', 'translate', 'rotate', 'scale']) to[k].style.setProperty(p, s.getPropertyValue(p));
    });
    const chrome = document.createElement('div');
    chrome.className = 'reel-chrome';
    chrome.innerHTML = '<div class="reel-ctl"></div>';
    chrome.firstChild.append(label.cloneNode(true));
    const stagesCopy = stages.cloneNode(false);
    stagesCopy.append(stage);
    copy.append(stagesCopy, chrome);
    Object.assign(copy.style, {position: 'fixed', left: '-200vw', top: '0', width: width + 'px', height: height + 'px', aspectRatio: 'auto', borderRadius: '0'});
    dialog.append(copy);
    return copy;
  };
  q('.reel-share').onclick = e => onShare?.({...storyCard(list[state.i], state.guesses[list[state.i].id]), snapshot}, e.currentTarget, dialog);
  if (onShare) q('.reel-share-all').onclick = e => onShare(state.share, e.currentTarget, dialog);
  q('.reel-zone-prev').onclick = prev;
  // Tapping the frame never skips an open guess; Skip, Next and → do.
  q('.reel-zone-next').onclick = () => state.phase !== 'guess' && next();
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
    // The slider and the pick-one cards own their arrow keys; Enter in them locks the guess in.
    if (e.target.matches('.reel-guess input')) {
      if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  });

  document.body.append(dialog);
  dialog.showModal();
  q('.reel-next').focus({preventScroll: true});
  play(Math.min(Math.max(0, start), list.length - 1));
  return {close};
}
