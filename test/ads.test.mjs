import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRotation} from '../src/ads-schedule.js';

const ad = (id, mirrored = false) => ({id, mirrored});
const seq = values => { let i = 0; return () => values[i++ % values.length]; };
const ids = turns => turns.map(t => [t.ad.id, t.sides.join('+')]);

test('no ads: both sides show the invitation', () => {
  const r = createRotation([], Math.random);
  assert.deepEqual(r.initial(), []);
  assert.deepEqual(r.next(), []);
});

test('one ordinary ad stays on one side; the other side shows the invitation', () => {
  const r = createRotation([ad(1)], seq([0, 0.2]));
  assert.deepEqual(ids(r.initial()), [[1, 'left']]);
  assert.deepEqual(r.next(), []);
  assert.equal(r.showing.right, null);
});

test('ads fill both sides, and the same ordinary ad never shows twice at once', () => {
  const r = createRotation([ad(1), ad(2), ad(3)], seq([0, 0.2, 0.7, 0.2, 0.2, 0.7]));
  r.initial();
  for (let i = 0; i < 30; i++) {
    r.next();
    if (r.showing.left && r.showing.right) assert.notEqual(r.showing.left, r.showing.right);
  }
});

test('a mirrored ad takes both sides, then both sides move on', () => {
  const r = createRotation([ad(1, true), ad(2), ad(3)], seq([0, 0.2, 0.7]));
  assert.deepEqual(ids(r.initial()), [[1, 'left+right']]);
  const after = r.next();
  assert.equal(after.length, 2);
  assert.notEqual(r.showing.left, r.showing.right);
  assert.ok(![r.showing.left.id, r.showing.right.id].includes(1));
});

test('every ad gets turns', () => {
  const r = createRotation([ad(1), ad(2), ad(3), ad(4, true)], seq([0.1, 0.6, 0.3, 0.9]));
  const seen = new Set(r.initial().map(t => t.ad.id));
  for (let i = 0; i < 40; i++) for (const t of r.next()) seen.add(t.ad.id);
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('a lone mirrored ad stays on both sides', () => {
  const r = createRotation([ad(1, true)], Math.random);
  r.initial();
  for (let i = 0; i < 5; i++) assert.deepEqual(r.next(), []);
  assert.equal(r.showing.left, r.showing.right);
});
