/**
 * Offline fee cap + soft lease catch-up.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TICKS_PER_DAY } from './career-clock.js';
import {
  OFFLINE_FEE_CAP_DAYS,
  buildOfflineFeeSummary,
  effectiveFeeTickRange,
} from './career-offline-fees.js';
import {
  settleHangarParkingFees,
  quoteHangarParkingUsdPerDay,
} from './career-hangar-fees.js';
import { settleAircraftMarketOps } from './career-aircraft-market.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import type { PlayerAircraft } from './types/career-economy.js';

const TICKS_PER_MONTH = TICKS_PER_DAY * 30;

describe('effectiveFeeTickRange', () => {
  it('leaves short gaps uncapped', () => {
    const from = 0;
    const to = 3 * TICKS_PER_DAY;
    const range = effectiveFeeTickRange(from, to);
    assert.equal(range.capped, false);
    assert.equal(range.daysCrossed, 3);
    assert.equal(range.daysBilled, 3);
    assert.equal(range.fromTick, from);
    assert.equal(range.toTick, to);
  });

  it('caps long gaps at OFFLINE_FEE_CAP_DAYS', () => {
    const from = 10;
    const to = from + 30 * TICKS_PER_DAY;
    const range = effectiveFeeTickRange(from, to);
    assert.equal(range.capped, true);
    assert.equal(range.daysCrossed, 30);
    assert.equal(range.daysBilled, OFFLINE_FEE_CAP_DAYS);
    assert.equal(range.daysBilled, 7);
    const hangarDays =
      // settlers use economy day index delta
      Math.floor(range.toTick / TICKS_PER_DAY) -
      Math.floor(range.fromTick / TICKS_PER_DAY);
    assert.equal(hangarDays, 7);
  });

  it('buildOfflineFeeSummary only when capped or soft lease term', () => {
    const short = effectiveFeeTickRange(0, 2 * TICKS_PER_DAY);
    assert.equal(
      buildOfflineFeeSummary({ feeRange: short, passiveDebitUsd: 10 }),
      null,
    );
    const long = effectiveFeeTickRange(0, 20 * TICKS_PER_DAY);
    const summary = buildOfflineFeeSummary({
      feeRange: long,
      passiveDebitUsd: 99,
    });
    assert.ok(summary);
    assert.equal(summary!.capped, true);
    assert.equal(summary!.daysBilled, 7);
    assert.equal(summary!.passiveDebitUsd, 99);
  });
});

describe('offline fee cap hangar settle', () => {
  it('30d absence via capped range bills ~7 days not 30', () => {
    const world = createSeedEconomyWorld({ seed: 'offline-hangar' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Offline',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    const acf = state.fleet[0]!;
    acf.status = 'parked';
    acf.locationIcao = 'SBGR';
    const usdPerDay = quoteHangarParkingUsdPerDay(
      acf.aircraftClassId,
      'major',
    );
    assert.ok(usdPerDay > 0);

    const from = world.tick;
    const to = world.tick + 30 * TICKS_PER_DAY;
    const feeRange = effectiveFeeTickRange(from, to);
    const result = settleHangarParkingFees(state, world, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    assert.equal(result.daysCharged, 7);
    assert.ok(
      Math.abs(result.requestedUsd - usdPerDay * 7) < 1,
      `expected ~${usdPerDay * 7}, got ${result.requestedUsd}`,
    );
  });
});

describe('soft lease catch-up', () => {
  function leasedAircraft(opts: {
    termEndsTick: number;
    nextDueTick: number;
    monthlyUsd?: number;
  }): PlayerAircraft {
    return {
      id: 'acf_lease_soft',
      aircraftClassId: 'light_ga',
      label: 'Lease Soft',
      locationIcao: 'SBGR',
      fuelKg: 100,
      fuelCapacityKg: 200,
      status: 'parked',
      ownership: 'leased',
      lease: {
        monthlyUsd: opts.monthlyUsd ?? 5_000,
        nextDueTick: opts.nextDueTick,
        termEndsTick: opts.termEndsTick,
        buyoutUsd: 80_000,
      },
    };
  }

  it('caps installments at 1 when soft opts set', () => {
    const world = createSeedEconomyWorld({ seed: 'lease-install' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'LeaseCap',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const start = world.tick;
    state.fleet = [
      leasedAircraft({
        nextDueTick: start,
        termEndsTick: start + 6 * TICKS_PER_MONTH,
        monthlyUsd: 4_000,
      }),
    ];
    // Advance past 3 due months but still inside term.
    world.tick = start + 3 * TICKS_PER_MONTH + 10;
    const before = state.walletUsd;
    const ops = settleAircraftMarketOps(state, world.tick, world, {
      maxInstallments: 1,
      deferTermRepossess: true,
    });
    assert.equal(ops.installmentsPaid, 1);
    assert.equal(state.walletUsd, before - 4_000);
    assert.equal(ops.repossessed.length, 0);
    assert.ok(state.fleet.some((a) => a.id === 'acf_lease_soft'));
    assert.equal(state.fleet[0]!.leaseOverdue, true);
  });

  it('defers term repossess and marks termEndedSoft', () => {
    const world = createSeedEconomyWorld({ seed: 'lease-term' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'LeaseTerm',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const start = world.tick;
    state.fleet = [
      leasedAircraft({
        nextDueTick: start + TICKS_PER_MONTH,
        termEndsTick: start + TICKS_PER_MONTH,
      }),
    ];
    world.tick = start + TICKS_PER_MONTH + 50;
    const ops = settleAircraftMarketOps(state, world.tick, world, {
      maxInstallments: 1,
      deferTermRepossess: true,
    });
    assert.deepEqual(ops.repossessed, []);
    assert.deepEqual(ops.termEndedSoft, ['acf_lease_soft']);
    const acf = state.fleet.find((a) => a.id === 'acf_lease_soft');
    assert.ok(acf);
    assert.equal(acf!.lease?.termEndedSoft, true);
    assert.equal(acf!.leaseOverdue, true);
  });

  it('repossesses on term end without soft opts', () => {
    const world = createSeedEconomyWorld({ seed: 'lease-hard' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'LeaseHard',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const start = world.tick;
    state.fleet = [
      leasedAircraft({
        nextDueTick: start + TICKS_PER_MONTH,
        termEndsTick: start + TICKS_PER_MONTH,
      }),
    ];
    world.tick = start + TICKS_PER_MONTH + 50;
    const ops = settleAircraftMarketOps(state, world.tick, world);
    assert.deepEqual(ops.repossessed, ['acf_lease_soft']);
    assert.equal(state.fleet.some((a) => a.id === 'acf_lease_soft'), false);
  });
});
