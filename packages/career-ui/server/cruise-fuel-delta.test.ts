import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fuelFlowKgPerHourFromTotalWeightDelta } from './watch-helpers.ts';

describe('fuelFlowKgPerHourFromTotalWeightDelta', () => {
  it('derives burn from FUEL TOTAL drop across a Watch tick', () => {
    // 100 lb/h over 5s → ~0.139 lb burned → ~45.4 kg/h
    const kgPerHour = fuelFlowKgPerHourFromTotalWeightDelta({
      prevLb: 1_000,
      nextLb: 1_000 - 100 * (5 / 3_600),
      dtMs: 5_000,
    });
    assert.ok(kgPerHour != null);
    assert.ok(Math.abs(kgPerHour! - 45.4) < 0.5);
  });

  it('rejects refuel / noise / tiny windows', () => {
    assert.equal(
      fuelFlowKgPerHourFromTotalWeightDelta({
        prevLb: 1_000,
        nextLb: 1_010,
        dtMs: 5_000,
      }),
      undefined,
    );
    assert.equal(
      fuelFlowKgPerHourFromTotalWeightDelta({
        prevLb: 1_000,
        nextLb: 999.99,
        dtMs: 1_000,
      }),
      undefined,
    );
  });
});
