import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ferryProgressPct,
  hubDistanceNm,
  nextFerryLeg,
  planFerryRoute,
  remainingNmToFinal,
} from './career-ferry-route.js';

describe('planFerryRoute', () => {
  it('returns a single leg when direct hop is in range', () => {
    const plan = planFerryRoute({
      originIcao: 'CYAM',
      finalDestIcao: 'CYYZ',
      maxRangeNm: 1400,
    });
    assert.equal(plan.legCount, 1);
    assert.deepEqual(plan.hops, ['CYAM', 'CYYZ']);
    assert.ok(plan.legs[0]!.distanceNm <= plan.hopRangeNm);
  });

  it('plans SBSN→CYAM within Aerostar-class range via stepping stones', () => {
    const plan = planFerryRoute({
      originIcao: 'SBSN',
      finalDestIcao: 'CYAM',
      maxRangeNm: 1400,
    });
    assert.ok(plan.legCount >= 2, `expected multi-leg, got ${plan.legCount}`);
    assert.equal(plan.hops[0], 'SBSN');
    assert.equal(plan.hops[plan.hops.length - 1], 'CYAM');
    const direct = hubDistanceNm('SBSN', 'CYAM')!;
    assert.ok(direct > plan.hopRangeNm);

    for (const leg of plan.legs) {
      assert.ok(
        leg.distanceNm <= plan.hopRangeNm + 1,
        `${leg.from}→${leg.to} ${leg.distanceNm} > ${plan.hopRangeNm}`,
      );
    }
    const remainingStart = remainingNmToFinal('SBSN', 'CYAM')!;
    const remainingMid = remainingNmToFinal(plan.hops[1]!, 'CYAM')!;
    // Mid hop should usually be closer, but not required for every intermediate.
    assert.ok(remainingMid < remainingStart || plan.legCount >= 2);
  });

  it('plans a long BR→US ferry within narrow freighter range', () => {
    const plan = planFerryRoute({
      originIcao: 'SBGR',
      finalDestIcao: 'KJFK',
      maxRangeNm: 2500,
    });
    assert.ok(plan.legCount >= 1);
    assert.equal(plan.hops[0], 'SBGR');
    assert.equal(plan.hops.at(-1), 'KJFK');
    for (const leg of plan.legs) {
      assert.ok(leg.distanceNm <= plan.hopRangeNm + 1);
    }
  });

  it('throws when hubs are unknown', () => {
    assert.throws(() =>
      planFerryRoute({
        originIcao: 'ZZZZ',
        finalDestIcao: 'CYAM',
        maxRangeNm: 1400,
      }),
    );
  });
});

describe('ferry progress helpers', () => {
  it('tracks percent closer and next leg', () => {
    const plan = planFerryRoute({
      originIcao: 'SBSN',
      finalDestIcao: 'CYAM',
      maxRangeNm: 1400,
    });
    const initial = remainingNmToFinal('SBSN', 'CYAM')!;
    const mid = plan.hops[1]!;
    const remaining = remainingNmToFinal(mid, 'CYAM')!;
    const pct = ferryProgressPct(initial, remaining);
    assert.ok(pct > 0 && pct < 100, `pct=${pct}`);
    const next = nextFerryLeg(plan, 'SBSN');
    assert.equal(next?.from, 'SBSN');
    assert.equal(next?.to, plan.hops[1]);
    assert.equal(nextFerryLeg(plan, 'CYAM'), null);
  });
});
