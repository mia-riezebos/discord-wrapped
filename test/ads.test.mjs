import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TIERS, toAd} from '../worker/ads.js';
import {schedule} from '../src/ads-schedule.js';

const row = (o = {}) => ({id: 1, sponsor: 'someone', tier: 'tower', placement: 'left', alt: 'An ad', link_url: 'https://example.com', image_url: 'https://example.com/a.png', ...o});

test('tiers decide the slot, size, rails and screen time', () => {
  assert.deepEqual(toAd(row()).rails, ['left']);
  assert.deepEqual(toAd(row({tier: 'twin'})).rails, ['left', 'right']);
  assert.equal(toAd(row({tier: 'square'})).slot, 'square');
  assert.equal(toAd(row({tier: 'square'})).seconds, TIERS.square.seconds);
  assert.equal(toAd(row({placement: 'nonsense'})).rails[0], 'right');
});

test('unsafe or unknown campaigns are dropped', () => {
  assert.equal(toAd(row({tier: 'billboard'})), null);
  assert.equal(toAd(row({link_url: 'http://example.com'})), null);
  assert.equal(toAd(row({image_url: 'javascript:alert(1)'})), null);
});

test('each rail slot gets its own rotation, and empty slots get none', () => {
  const ads = [toAd(row({id: 1})), toAd(row({id: 2, tier: 'twin'})), toAd(row({id: 3, tier: 'square', placement: 'right'}))];
  const s = schedule(ads, () => 0);
  assert.deepEqual(s['left:tower'].map(a => a.id), [1, 2]);
  assert.deepEqual(s['right:tower'].map(a => a.id), [2]);
  assert.deepEqual(s['right:square'].map(a => a.id), [3]);
  assert.deepEqual(s['left:square'], []);
});
