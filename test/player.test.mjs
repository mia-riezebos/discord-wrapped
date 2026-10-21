import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clearBand} from '../src/player.js';

// A 1000 px story with the header band (top 11%) and bottom edge (last 3%) always reserved.
test('a sticker goes in the empty band nearest where it prefers to sit', () => {
  const taken = [[150, 400], [500, 560]];
  assert.equal(clearBand(taken, 1000, 60, 0.9), 735, "centred in the band below the second box");
  assert.equal(clearBand(taken, 1000, 60, 0.45), 420);
});

test('a sticker never overlaps a taken box', () => {
  const taken = [[110, 300], [380, 900]];
  const top = clearBand(taken, 1000, 70, 0.6);
  assert.ok(top >= 300 && top + 70 <= 380);
});

test('no band tall enough means no place, so the caller shrinks or docks it', () => {
  assert.equal(clearBand([[110, 500], [530, 970]], 1000, 60), null);
});
