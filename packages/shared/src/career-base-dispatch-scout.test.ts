/**
 * Base Dispatcher scout — Market freights for parked fleet (human confirms).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASE_DISPATCH_SCOUT_MAX,
  confirmBaseDispatchScout,
  listBaseDispatchScoutSuggestions,
} from './career-base-dispatch-scout.js';
import {
  hireBaseDispatcherCandidate,
  refreshBaseDispatcherHirePool,
  resolveBaseDispatchScoutPolicy,
} from './career-base-dispatcher.js';
import { buyFboTier1 } from './career-fbo.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import type { CareerEconomyWorld, ShipmentLot } from './types/career-economy.js';

function primeLot(
  world: CareerEconomyWorld,
  overrides: Partial<ShipmentLot> = {},
): ShipmentLot {
  const lot: ShipmentLot = {
    id: `lot_dispatch_scout_${world.lots.length}`,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 2_000,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 200,
    payUsd: 8_000,
    basePayUsd: 8_000,
    urgency: 'normal',
    reason: 'test trunk',
    status: 'available',
    ...overrides,
  };
  world.lots.push(lot);
  return lot;
}

describe('base dispatch scout', () => {
  it('requires a company Base', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-scout-gate' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutGate',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    assert.throws(
      () => listBaseDispatchScoutSuggestions(state, world),
      /company Base/i,
    );
  });

  it('manual desk only lists lots where aircraft is already at origin', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-scout-manual' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutManual',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    buyFboTier1(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBSP';

    primeLot(world, {
      id: 'lot_needs_ferry',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'test trunk',
    });

    const policy = resolveBaseDispatchScoutPolicy(state);
    assert.equal(policy.mode, 'manual');
    assert.equal(policy.requireAtOrigin, true);

    const rows = listBaseDispatchScoutSuggestions(state, world, {
      aircraftId: aircraft.id,
      max: BASE_DISPATCH_SCOUT_MAX,
    });
    assert.equal(rows.length, 0);
  });

  it('hired Dispatcher unlocks fleet scout with ferry hint', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-scout-fleet' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutFleet',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    const { fbo } = buyFboTier1(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBSP';

    refreshBaseDispatcherHirePool(state, world, {
      hubIcao: 'SBGR',
      force: true,
    });
    const pool =
      state.playerFbos?.dispatcherHirePoolByHub?.SBGR ?? [];
    assert.ok(pool.length >= 1);
    hireBaseDispatcherCandidate(state, world, {
      fboId: fbo.id,
      candidateId: pool[0]!.id,
    });

    const policy = resolveBaseDispatchScoutPolicy(state);
    assert.equal(policy.mode, 'fleet');
    assert.equal(policy.requireAtOrigin, false);

    primeLot(world, {
      id: 'lot_ferry_ok',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'test trunk',
    });

    const rows = listBaseDispatchScoutSuggestions(state, world, {
      aircraftId: aircraft.id,
      max: BASE_DISPATCH_SCOUT_MAX,
    });
    assert.ok(rows.length >= 1);
    assert.ok(rows.some((r) => r.ferryNm > 0));
    assert.ok(rows.some((r) => /ferry/i.test(r.reason)));
  });

  it('lists positive-net trunk lots and skips last-mile for non-GA by default', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-scout-list' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutList',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    buyFboTier1(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'lot_trunk_ok',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'test trunk',
    });
    primeLot(world, {
      id: 'lot_last_mile',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'last-mile vitality',
      destIcao: 'SBSP',
    });

    const gaRows = listBaseDispatchScoutSuggestions(state, world, {
      aircraftId: aircraft.id,
      max: BASE_DISPATCH_SCOUT_MAX,
    });
    assert.ok(gaRows.length >= 1);
    assert.ok(gaRows.every((r) => r.netUsd > 0));

    aircraft.aircraftClassId = 'light_jet';
    const jetRows = listBaseDispatchScoutSuggestions(state, world, {
      aircraftId: aircraft.id,
      excludeLastMile: true,
      minNm: 100,
      minKg: 180,
    });
    assert.ok(!jetRows.some((r) => r.lotId === 'lot_last_mile'));
  });

  it('confirm accepts the lot onto a mission', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-scout-confirm' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutConfirm',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    buyFboTier1(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const lot = primeLot(world, {
      quantityKg: 350,
      payUsd: 4_500,
      reason: 'confirm trunk',
    });

    const result = confirmBaseDispatchScout(state, world, {
      lotId: lot.id,
      aircraftId: aircraft.id,
    });
    assert.equal(result.mission.originIcao, 'SBGR');
    assert.equal(result.mission.destIcao, 'SBGL');
    assert.ok(result.kg > 0);
    assert.ok(state.missions.some((m) => m.id === result.mission.id));
  });

  it('desk hubIcao lenses to the Base region (not worldwide)', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-scout-region' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutRegion',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    buyFboTier1(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    const brRegion =
      world.airports.find((a) => a.icao === 'SBGR')?.region ?? '';
    assert.ok(brRegion);

    primeLot(world, {
      id: 'lot_local_region',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'local trunk',
    });

    // Foreign origin outside BR-S (use a known US hub if present).
    const usHub =
      world.airports.find((a) => (a.region ?? '').startsWith('US'))?.icao ??
      null;
    if (usHub) {
      primeLot(world, {
        id: 'lot_foreign_region',
        originIcao: usHub,
        destIcao: 'KJFK',
        quantityKg: 400,
        payUsd: 8_000,
        reason: 'foreign trunk',
      });
    }

    const rows = listBaseDispatchScoutSuggestions(state, world, {
      aircraftId: aircraft.id,
      hubIcao: 'SBGR',
      max: BASE_DISPATCH_SCOUT_MAX,
    });
    assert.ok(rows.some((r) => r.lotId === 'lot_local_region'));
    assert.ok(!rows.some((r) => r.lotId === 'lot_foreign_region'));
  });
});
