import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld, hubTierOf } from './career-economy.js';
import {
  isHangarParkingBillable,
  quoteHangarParkingUsdPerDay,
  settleHangarParkingFees,
} from './career-hangar-fees.js';
import { emptyMissionsStateV2, PLAYER_FUEL_CAPACITY_KG } from './career-fleet.js';
import type { FreighterClassId, PlayerAircraft } from './types/career-economy.js';

function makeAircraft(
  partial: Partial<PlayerAircraft> &
    Pick<PlayerAircraft, 'id' | 'aircraftClassId' | 'locationIcao' | 'status'>,
): PlayerAircraft {
  const capacity = PLAYER_FUEL_CAPACITY_KG[partial.aircraftClassId];
  return {
    label: partial.label ?? partial.id,
    fuelKg: capacity * 0.5,
    fuelCapacityKg: capacity,
    ownership: 'owned',
    ...partial,
  };
}

describe('hangar parking fees', () => {
  it('prices spoke below major for the same class', () => {
    const classId: FreighterClassId = 'light_turboprop';
    const spoke = quoteHangarParkingUsdPerDay(classId, 'spoke');
    const regional = quoteHangarParkingUsdPerDay(classId, 'regional');
    const major = quoteHangarParkingUsdPerDay(classId, 'major');
    assert.ok(spoke < regional);
    assert.ok(regional < major);
  });

  it('scales base by class', () => {
    assert.ok(
      quoteHangarParkingUsdPerDay('light_ga', 'regional') <
        quoteHangarParkingUsdPerDay('light_turboprop', 'regional'),
    );
    assert.ok(
      quoteHangarParkingUsdPerDay('narrow_freighter', 'regional') <
        quoteHangarParkingUsdPerDay('wide_freighter', 'regional'),
    );
  });

  it('bills parked and maintenance; exempts assigned, leased_out, listed', () => {
    assert.equal(isHangarParkingBillable({ status: 'parked' }), true);
    assert.equal(isHangarParkingBillable({ status: 'maintenance' }), true);
    assert.equal(isHangarParkingBillable({ status: 'assigned' }), false);
    assert.equal(isHangarParkingBillable({ status: 'leased_out' }), false);
    assert.equal(isHangarParkingBillable({ status: 'listed' }), false);
  });

  it('debits parked airframes across crossed days; skips exempt', () => {
    const world = createSeedEconomyWorld({ seed: 'hangar-fee' });
    const majorIcao =
      world.airports.find((a) => hubTierOf(a) === 'major')?.icao ?? 'SBGR';
    const state = emptyMissionsStateV2();
    state.walletUsd = 10_000;
    state.fleet = [
      makeAircraft({
        id: 'parked-1',
        aircraftClassId: 'light_turboprop',
        locationIcao: majorIcao,
        status: 'parked',
      }),
      makeAircraft({
        id: 'assigned-1',
        aircraftClassId: 'light_turboprop',
        locationIcao: majorIcao,
        status: 'assigned',
        assignedMissionId: 'm1',
      }),
      makeAircraft({
        id: 'out-1',
        aircraftClassId: 'narrow_freighter',
        locationIcao: majorIcao,
        status: 'leased_out',
      }),
    ];

    const dayRate = quoteHangarParkingUsdPerDay(
      'light_turboprop',
      hubTierOf({ icao: majorIcao, hubTier: 'major' }),
    );
    const result = settleHangarParkingFees(state, world, {
      fromTick: 0,
      toTick: 48,
    });

    assert.equal(result.daysCharged, 2);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]?.aircraftId, 'parked-1');
    assert.equal(result.requestedUsd, Math.round(dayRate * 2 * 100) / 100);
    assert.equal(result.debitUsd, result.requestedUsd);
    assert.equal(result.shortfallUsd, 0);
    assert.equal(state.walletUsd, Math.round((10_000 - result.debitUsd) * 100) / 100);
  });

  it('clamps debit to wallet and reports shortfall', () => {
    const world = createSeedEconomyWorld({ seed: 'hangar-short' });
    const state = emptyMissionsStateV2();
    state.walletUsd = 50;
    state.fleet = [
      makeAircraft({
        id: 'parked-wide',
        aircraftClassId: 'wide_freighter',
        locationIcao: 'SBGR',
        status: 'parked',
      }),
    ];

    const result = settleHangarParkingFees(state, world, {
      fromTick: 0,
      toTick: 24,
    });

    assert.ok(result.requestedUsd > 50);
    assert.equal(result.debitUsd, 50);
    assert.ok(result.shortfallUsd > 0);
    assert.equal(state.walletUsd, 0);
  });

  it('charges nothing when ticks stay in the same economy day', () => {
    const world = createSeedEconomyWorld({ seed: 'hangar-same-day' });
    const state = emptyMissionsStateV2();
    state.walletUsd = 1_000;
    state.fleet = [
      makeAircraft({
        id: 'parked-1',
        aircraftClassId: 'light_ga',
        locationIcao: 'SBSP',
        status: 'parked',
      }),
    ];

    const result = settleHangarParkingFees(state, world, {
      fromTick: 10,
      toTick: 20,
    });
    assert.equal(result.daysCharged, 0);
    assert.equal(result.debitUsd, 0);
    assert.equal(state.walletUsd, 1_000);
  });
});
