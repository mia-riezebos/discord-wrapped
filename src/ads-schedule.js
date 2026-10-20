/* Splits active ads into one carousel per rail slot. Pure, so the tests can import it. */
export const RAIL_SLOTS = [['left', 'tower'], ['left', 'square'], ['right', 'tower'], ['right', 'square']];
export function schedule(ads, rand) {
  const plan = {};
  for (const [rail, slot] of RAIL_SLOTS) {
    const list = ads.filter(a => a.slot === slot && a.rails.includes(rail));
    // Start each carousel at a random ad so every sponsor gets first views, keeping the order fair after that.
    const k = list.length ? Math.floor(rand() * list.length) : 0;
    plan[`${rail}:${slot}`] = [...list.slice(k), ...list.slice(0, k)];
  }
  return plan;
}
