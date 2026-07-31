import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  DEFAULT_JET_A_LB_PER_GAL,
  KG_TO_LB,
  normalizeOfpExpectation,
  type AircraftProfile,
} from '@msfs-compat/shared';
import {
  OfpLoadPlanError,
  buildOfpLoadPlan,
  buildRollbackPlan,
  cgRebalanceStepLb,
  distributeCargoAcrossStations,
  distributeFuelAcrossTanks,
  orderStationsLongitudinal,
  shiftCargoForCg,
} from './ofp-load-plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

async function loadCaravanProfile(): Promise<AircraftProfile> {
  const raw = await readFile(
    join(repoRoot, 'profiles', 'examples', 'blacksquare-caravan-professional-cargo-pod.json'),
    'utf8',
  );
  return JSON.parse(raw) as AircraftProfile;
}

const CARAVAN_ROLES = {
  passengerStations: [] as number[],
  baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  crewStations: [1, 2],
};

describe('distributeFuelAcrossTanks', () => {
  it('splits block fuel 50/50 across Caravan mains in gallons', async () => {
    const profile = await loadCaravanProfile();
    const blockLb = 670; // 100 gal @ 6.7
    const { tanks, unit, capacityTotal } = distributeFuelAcrossTanks(blockLb, profile);
    assert.equal(unit, 'gallons');
    assert.equal(capacityTotal, 335.6);
    assert.equal(tanks.LEFT_MAIN, 50);
    assert.equal(tanks.RIGHT_MAIN, 50);
  });

  it('rejects fuel over tank capacity', async () => {
    const profile = await loadCaravanProfile();
    const overLb = 335.6 * DEFAULT_JET_A_LB_PER_GAL + 50;
    assert.throws(
      () => distributeFuelAcrossTanks(overLb, profile),
      (err: unknown) => err instanceof OfpLoadPlanError && err.code === 'FUEL_OVER_CAPACITY',
    );
  });
});

describe('distributeCargoAcrossStations', () => {
  it('preserves crew and fills baggage proportionally', async () => {
    const profile = await loadCaravanProfile();
    const result = distributeCargoAcrossStations(1300, profile, CARAVAN_ROLES, {
      1: 170,
      2: 0,
    });
    assert.equal(result.stations[1], 170);
    assert.equal(result.stations[2], 0);
    assert.deepEqual(result.preservedStations.sort((a, b) => a - b), [1, 2]);
    const baggageTotal = result.baggageStations.reduce(
      (sum, idx) => sum + (result.stations[idx] ?? 0),
      0,
    );
    assert.equal(baggageTotal, 1300);
    assert.equal(result.total, 1470);
  });

  it('rejects cargo over baggage capacity', async () => {
    const profile = await loadCaravanProfile();
    assert.throws(
      () => distributeCargoAcrossStations(50_000, profile, CARAVAN_ROLES),
      (err: unknown) => err instanceof OfpLoadPlanError && err.code === 'CARGO_OVER_CAPACITY',
    );
  });

  it('rejects missing baggage stations', async () => {
    const profile = await loadCaravanProfile();
    assert.throws(
      () =>
        distributeCargoAcrossStations(100, profile, {
          passengerStations: [1],
          baggageStations: [],
          crewStations: [2],
        }),
      (err: unknown) => err instanceof OfpLoadPlanError && err.code === 'NO_CARGO_STATIONS',
    );
  });
});

describe('orderStationsLongitudinal / shiftCargoForCg', () => {
  it('orders by arm when present (higher arm = more forward)', () => {
    const profile = {
      payload: {
        stations: [
          { index: 3, maxLoad: 500, arm: 10 },
          { index: 4, maxLoad: 500, arm: 40 },
          { index: 5, maxLoad: 500, arm: 20 },
        ],
      },
    } as AircraftProfile;
    const ordered = orderStationsLongitudinal(profile, [3, 4, 5]);
    assert.equal(ordered.usedArms, true);
    assert.deepEqual(ordered.indexes, [4, 5, 3]);
  });

  it('falls back to station index without arms', async () => {
    const profile = await loadCaravanProfile();
    const ordered = orderStationsLongitudinal(profile, [15, 3, 10]);
    assert.equal(ordered.usedArms, false);
    assert.deepEqual(ordered.indexes, [3, 10, 15]);
  });

  it('shifts cargo forward without changing total or exceeding maxLoad', async () => {
    const profile = await loadCaravanProfile();
    const initial = distributeCargoAcrossStations(1300, profile, CARAVAN_ROLES, {
      1: 170,
      2: 0,
    });
    // Put cargo on the aft-most stations to force a forward shift.
    const aftHeavy: Record<number, number> = { ...initial.stations };
    for (const idx of CARAVAN_ROLES.baggageStations) aftHeavy[idx] = 0;
    aftHeavy[14] = 500;
    aftHeavy[15] = 500;
    const beforeBag = CARAVAN_ROLES.baggageStations.reduce(
      (sum, idx) => sum + (aftHeavy[idx] ?? 0),
      0,
    );
    const shifted = shiftCargoForCg(
      aftHeavy,
      profile,
      CARAVAN_ROLES.baggageStations,
      'forward',
      200,
    );
    assert.ok(shifted.movedLb > 0);
    assert.ok(shifted.movedLb <= 200);
    const afterBag = CARAVAN_ROLES.baggageStations.reduce(
      (sum, idx) => sum + (shifted.stations[idx] ?? 0),
      0,
    );
    assert.equal(afterBag, beforeBag);
    assert.equal(shifted.stations[1], 170);
    assert.ok((shifted.stations[3] ?? 0) > 0);
    assert.ok((shifted.stations[15] ?? 0) < 500);
    for (const station of profile.payload.stations) {
      assert.ok(
        (shifted.stations[station.index] ?? 0) <= station.maxLoad,
        `station ${station.index} over maxLoad`,
      );
    }
  });

  it('reports movedLb=0 when no capacity in the requested direction', async () => {
    const profile = await loadCaravanProfile();
    const stations: Record<number, number> = { 1: 170, 2: 0 };
    // All cargo already on the forward-most baggage station.
    for (const idx of CARAVAN_ROLES.baggageStations) stations[idx] = 0;
    stations[3] = 500;
    const shifted = shiftCargoForCg(
      stations,
      profile,
      CARAVAN_ROLES.baggageStations,
      'forward',
      100,
    );
    assert.equal(shifted.movedLb, 0);
    assert.equal(shifted.stations[3], 500);
  });

  it('sizes rebalance steps between 25 and 200 lb', () => {
    assert.equal(cgRebalanceStepLb({ excessMac: 0.1, cargoLb: 100 }), 25);
    assert.equal(cgRebalanceStepLb({ excessMac: 10, cargoLb: 5000 }), 200);
  });
});

describe('buildOfpLoadPlan', () => {
  it('builds fuel+payload plan from OFP kg totals', async () => {
    const profile = await loadCaravanProfile();
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg', total: 500 },
      loadSheet: {
        unit: 'kg',
        blockFuel: 500,
        baggage: 400,
        payload: 400,
        passengerCount: 0,
      },
      payload: {
        unit: 'kg',
        total: 400,
        stationRoles: CARAVAN_ROLES,
      },
    });

    const built = buildOfpLoadPlan({
      ofp,
      profile,
      stationRoles: CARAVAN_ROLES,
      liveStationsLb: { 1: 170, 2: 0 },
    });

    const expectedGal = (500 * KG_TO_LB) / DEFAULT_JET_A_LB_PER_GAL;
    const half = Math.round((expectedGal / 2) * 100) / 100;
    assert.equal(built.plan.fuel?.tanks?.LEFT_MAIN, half);
    assert.equal(built.plan.fuel?.tanks?.RIGHT_MAIN, half);
    assert.equal(built.plan.payload?.stations?.[1], 170);
    const baggage = CARAVAN_ROLES.baggageStations.reduce(
      (sum, idx) => sum + (built.plan.payload?.stations?.[idx] ?? 0),
      0,
    );
    assert.equal(baggage, Math.round(400 * KG_TO_LB));
  });

  it('uses cargoKgFallback when OFP has no baggage', async () => {
    const profile = await loadCaravanProfile();
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'lb', total: 670 },
      loadSheet: {
        unit: 'lb',
        blockFuel: 670,
        passengerCount: 2,
        payload: 500,
      },
    });
    const built = buildOfpLoadPlan({
      ofp,
      profile,
      stationRoles: CARAVAN_ROLES,
      cargoKgFallback: 200,
      liveStationsLb: { 1: 170, 2: 170 },
    });
    const baggage = CARAVAN_ROLES.baggageStations.reduce(
      (sum, idx) => sum + (built.plan.payload?.stations?.[idx] ?? 0),
      0,
    );
    assert.equal(baggage, Math.round(200 * KG_TO_LB));
  });
});

describe('buildRollbackPlan', () => {
  it('captures all tanks and stations from live snapshot', async () => {
    const profile = await loadCaravanProfile();
    const plan = buildRollbackPlan(profile, {
      tanks: { LEFT_MAIN: 40, RIGHT_MAIN: 41 },
      stations: { 1: 170, 3: 50 },
    });
    assert.equal(plan.fuel?.tanks?.LEFT_MAIN, 40);
    assert.equal(plan.fuel?.tanks?.RIGHT_MAIN, 41);
    assert.equal(plan.payload?.stations?.[1], 170);
    assert.equal(plan.payload?.stations?.[3], 50);
    assert.equal(plan.payload?.stations?.[2], 0);
  });
});
