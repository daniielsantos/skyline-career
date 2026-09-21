import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyVaOrgCostMult,
  resolveVaOrgPerks,
} from './career-va-perks.js';

describe('resolveVaOrgPerks', () => {
  it('stays Building until qualityScore unlocks', () => {
    const p = resolveVaOrgPerks({
      windowDays: 7,
      flightCount: 5,
      avgFlightScorePct: 80,
      onTimePct: 80,
      qualityScore: null,
    });
    assert.equal(p.tier, 0);
    assert.equal(p.tierName, 'Building');
    assert.equal(p.mxCostMult, 1);
    assert.ok(p.nextTierHint?.includes('Proven'));
  });

  it('unlocks Proven at 55 / 3 flights', () => {
    const p = resolveVaOrgPerks({
      windowDays: 7,
      flightCount: 3,
      avgFlightScorePct: 60,
      onTimePct: 50,
      qualityScore: 55,
    });
    assert.equal(p.tier, 1);
    assert.equal(p.mxCostMult, 0.95);
    assert.equal(p.ferryOverflowCostMult, 0.9);
    assert.deepEqual(p.labels, ['−5% VA MX', '−10% overflow ferry']);
    assert.ok(p.nextTierHint?.includes('Reliable'));
    assert.equal(p.ladder.length, 3);
    assert.equal(p.ladder[0]?.tierName, 'Proven');
    assert.equal(p.ladder[2]?.tierName, 'Elite');
  });

  it('reaches Elite at 85 / 15', () => {
    const p = resolveVaOrgPerks({
      windowDays: 7,
      flightCount: 20,
      avgFlightScorePct: 90,
      onTimePct: 90,
      qualityScore: 88,
    });
    assert.equal(p.tier, 3);
    assert.equal(p.mxCostMult, 0.85);
    assert.equal(p.ferryOverflowCostMult, 0.7);
    assert.equal(p.nextTierHint, null);
    assert.equal(p.ladder.length, 3);
  });

  it('applyVaOrgCostMult rounds cents', () => {
    assert.equal(applyVaOrgCostMult(1000, 0.9), 900);
    assert.equal(applyVaOrgCostMult(333.33, 0.85), 283.33);
  });
});
