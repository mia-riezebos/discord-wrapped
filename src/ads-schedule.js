/* Sidebar rotation rules. Pure, so the tests can import it. */
export const SIDES = ['left', 'right'];

/**
 * One rotation per placement. Each turn the next ad goes on a random side; a mirrored ad
 * (the sponsor bought the campaign twice) goes on both. The other side keeps what it shows,
 * and the same ad never shows on both sides at once unless it's mirrored.
 */
export function createRotation(ads, rand) {
  const start = ads.length ? Math.floor(rand() * ads.length) : 0;
  const queue = [...ads.slice(start), ...ads.slice(0, start)];
  const showing = {left: null, right: null};
  let i = 0;
  const take = () => queue[i++ % queue.length];
  const set = (sides, ad) => { for (const s of sides) showing[s] = ad; return {sides, ad}; };

  /** The first ad on each side. With one ordinary ad, the second side stays empty and shows the invitation. */
  function initial() {
    if (!queue.length) return [];
    const first = take();
    if (first.mirrored) return [set(SIDES, first)];
    const side = SIDES[rand() < 0.5 ? 0 : 1], other = side === 'left' ? 'right' : 'left';
    const turns = [set([side], first)];
    if (queue.length > 1) turns.push(set([other], take()));
    return turns;
  }

  /** The turns to paint next. Empty when nothing changes. */
  function next() {
    // A lone ad, mirrored or not, stays where it is.
    if (queue.length < 2) return [];
    const mirroredTurnEnded = showing.left && showing.left === showing.right;
    let ad = take();
    if (ad.mirrored && !mirroredTurnEnded) return [set(SIDES, ad)];
    const side = SIDES[rand() < 0.5 ? 0 : 1], other = side === 'left' ? 'right' : 'left';
    if (mirroredTurnEnded) {
      // After a mirrored turn both sides move on, so the mirrored sponsor gets no extra time.
      if (ad === showing.left) ad = take();
      const turns = [set([side], ad)];
      const second = take();
      if (second !== ad && second !== showing.left) turns.push(set([other], second)); else showing[other] = null;
      return turns;
    }
    // Skip an ad the other side is already showing.
    for (let tries = 0; tries < queue.length && showing[other] === ad; tries++) ad = take();
    if (showing[other] === ad) return [];
    return [set(ad.mirrored ? SIDES : [side], ad)];
  }

  return {initial, next, showing};
}
