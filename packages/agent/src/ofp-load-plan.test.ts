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
  allocateCargoRoundPerSeat,
  buildOfpLoadPlan,
  buildRollbackPlan,
  cgCounterweightPerSeatLb,
  cgRebalanceStepLb,
  liveFuelMatchesTarget,
  resolveCgCounterweightBias,
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
  it('freighter: keeps crew at 170 and equalizes cargo on baggage only', async () => {
    const profile = await loadCaravanProfile();
    const result = distributeCargoAcrossStations(1300, profile, CARAVAN_ROLES, {
      1: 180,
      2: 90,
    });
    assert.equal(result.stations[1], 170);
    assert.equal(result.stations[2], 170);
    assert.equal(result.crewLb, 340);
    assert.deepEqual(result.preservedStations, []);
    assert.deepEqual(result.crewStations, [1, 2]);
    assert.deepEqual(result.passengerStations, []);
    const crewSpare =
      (result.stations[1]! - 170) + (result.stations[2]! - 170);
    const baggageTotal = result.baggageStations.reduce(
      (sum, idx) => sum + (result.stations[idx] ?? 0),
      0,
    );
    assert.equal(crewSpare, 0);
    assert.equal(baggageTotal, 1300);
    assert.equal(result.total, 1640);
    for (const idx of result.baggageStations) {
      assert.ok((result.stations[idx] ?? 0) > 0);
    }
    const bagWeights = result.baggageStations.map((idx) => result.stations[idx] ?? 0);
    const maxBag = Math.max(...bagWeights);
    const minBag = Math.min(...bagWeights);
    assert.ok(maxBag - minBag <= 1, 'baggage should be nearly equal');
  });

  it('GA cabin: fills pax/crew soft-caps before rear baggage', async () => {
    const profile = {
      payload: {
        stations: [
          { index: 1, name: 'Pilot', maxLoad: 500, arm: 1 },
          { index: 2, name: 'Copilot', maxLoad: 500, arm: 1 },
          { index: 3, name: 'Left Pax', maxLoad: 500, arm: -1 },
          { index: 4, name: 'Right Pax', maxLoad: 500, arm: -1 },
          { index: 5, name: 'Rear Baggage', maxLoad: 500, arm: -3.2 },
        ],
      },
    } as AircraftProfile;
    const roles = {
      crewStations: [1, 2],
      passengerStations: [3, 4],
      baggageStations: [5],
    };
    const result = distributeCargoAcrossStations(992, profile, roles);
    assert.equal(result.stations[1], 300);
    assert.equal(result.stations[2], 300);
    assert.equal(result.stations[3], 300);
    assert.equal(result.stations[4], 300);
    // Seats took 860 lb cargo; GA baggage soft-cap is 50 lb — rest of OFP cargo is clamped.
    assert.equal(result.stations[5], 50);
    assert.equal(result.cargoPlacedLb, 910);
    assert.equal(result.total, 300 * 4 + 50);
  });

  it('rejects cargo over baggage capacity', async () => {
    const profile = await loadCaravanProfile();
    assert.throws(
      () => distributeCargoAcrossStations(50_000, profile, CARAVAN_ROLES),
      (err: unknown) => err instanceof OfpLoadPlanError && err.code === 'CARGO_OVER_CAPACITY',
    );
  });

  it('rejects when no crew, passenger, or baggage stations are mapped', async () => {
    const profile = await loadCaravanProfile();
    assert.throws(
      () =>
        distributeCargoAcrossStations(100, profile, {
          passengerStations: [],
          baggageStations: [],
          crewStations: [],
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
    const aftHeavy: Record<number, number> = { 1: 170, 2: 170 };
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

  it('allocateCargoRoundPerSeat adds up to 50 lb on each eligible seat', () => {
    const profile = {
      payload: {
        stations: [
          { index: 1, maxLoad: 500, arm: 10 },
          { index: 2, maxLoad: 500, arm: 10 },
          { index: 3, maxLoad: 500, arm: -1 },
          { index: 4, maxLoad: 500, arm: -3 },
        ],
      },
    } as AircraftProfile;
    const start = { 1: 170, 2: 170, 3: 0, 4: 0 };
    const equal = allocateCargoRoundPerSeat(
      start,
      profile,
      [1, 2, 3, 4],
      50,
      'equal',
      10_000,
    );
    // 4 seats × 50 lb = 200 lb this round
    assert.equal(equal.movedLb, 200);
    assert.equal(equal.stations[1], 220);
    assert.equal(equal.stations[2], 220);
    assert.equal(equal.stations[3], 50);
    assert.equal(equal.stations[4], 50);

    const forward = allocateCargoRoundPerSeat(
      start,
      profile,
      [1, 2, 3, 4],
      50,
      'forward',
      10_000,
    );
    // Forward half = seats 1,2 → 100 lb
    assert.equal(forward.movedLb, 100);
    assert.equal(forward.stations[1], 220);
    assert.equal(forward.stations[2], 220);
    assert.equal(forward.stations[3], 0);
  });

  it('can shift cargo onto crew seats while retaining minimum crew weight', async () => {
    const profile = await loadCaravanProfile();
    const stations: Record<number, number> = { 1: 170, 2: 170 };
    for (const idx of CARAVAN_ROLES.baggageStations) stations[idx] = 0;
    stations[15] = 400;
    const movable = [...CARAVAN_ROLES.crewStations, ...CARAVAN_ROLES.baggageStations];
    const shifted = shiftCargoForCg(
      stations,
      profile,
      movable,
      'forward',
      200,
      { minRetainByIndex: { 1: 170, 2: 170 } },
    );
    assert.ok(shifted.movedLb > 0);
    assert.ok((shifted.stations[1] ?? 0) >= 170);
    assert.ok((shifted.stations[2] ?? 0) >= 170);
    assert.ok(
      (shifted.stations[1]! > 170 || shifted.stations[2]! > 170),
      'expected cargo onto at least one crew seat',
    );
    assert.ok((shifted.stations[15] ?? 0) < 400);
  });

  it('uses a fixed 50 lb CG balance step', () => {
    assert.equal(cgRebalanceStepLb({ excessMac: 0.1, cargoLb: 100 }), 50);
    assert.equal(cgRebalanceStepLb({ excessMac: 10, cargoLb: 5000 }), 50);
  });

  it('counterweights CG based on position and drift', () => {
    assert.equal(
      resolveCgCounterweightBias({ liveMac: 35, lo: 25, hi: 30 }),
      'forward',
    );
    assert.equal(
      resolveCgCounterweightBias({ liveMac: 22, lo: 25, hi: 30 }),
      'aft',
    );
    assert.equal(
      resolveCgCounterweightBias({ liveMac: 27, lo: 25, hi: 30 }),
      'equal',
    );
    // Still drifting aft past limit → stronger forward step.
    assert.equal(
      cgCounterweightPerSeatLb({
        liveMac: 36,
        lo: 25,
        hi: 30,
        prevMac: 34,
        baseLb: 50,
      }),
      100,
    );
    // Already correcting forward → ease off.
    assert.equal(
      cgCounterweightPerSeatLb({
        liveMac: 33,
        lo: 25,
        hi: 30,
        prevMac: 36,
        baseLb: 50,
      }),
      25,
    );
  });

  it('matches live fuel by total, not tank split', () => {
    assert.equal(
      liveFuelMatchesTarget(
        { LEFT_MAIN: 20, RIGHT_MAIN: 20 },
        { LEFT_MAIN: 25, RIGHT_MAIN: 15 },
      ),
      true,
    );
    assert.equal(
      liveFuelMatchesTarget(
        { LEFT_MAIN: 10, RIGHT_MAIN: 10 },
        { LEFT_MAIN: 25, RIGHT_MAIN: 15 },
      ),
      false,
    );
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
    assert.equal(built.plan.payload?.stations?.[2], 170);
    const cargoLb = Math.round(400 * KG_TO_LB);
    const crewSpare =
      ((built.plan.payload?.stations?.[1] ?? 0) - 170) +
      ((built.plan.payload?.stations?.[2] ?? 0) - 170);
    const baggage = CARAVAN_ROLES.baggageStations.reduce(
      (sum, idx) => sum + (built.plan.payload?.stations?.[idx] ?? 0),
      0,
    );
    assert.equal(crewSpare + baggage, cargoLb);
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
    const cargoLb = Math.round(200 * KG_TO_LB);
    const crewSpare =
      ((built.plan.payload?.stations?.[1] ?? 0) - 170) +
      ((built.plan.payload?.stations?.[2] ?? 0) - 170);
    const baggage = CARAVAN_ROLES.baggageStations.reduce(
      (sum, idx) => sum + (built.plan.payload?.stations?.[idx] ?? 0),
      0,
    );
    assert.equal(crewSpare + baggage, cargoLb);
    // Equalize fills lighter baggage before piling onto crew above 170.
    assert.ok(baggage > 0);
    assert.equal(built.plan.payload?.stations?.[1], 170);
  });

  it('clamps cargo under live MTOW after fuel + freighter crew', async () => {
    const profile = await loadCaravanProfile();
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      icao: 'C208',
      fuel: { unit: 'lb', total: 175 },
      loadSheet: {
        unit: 'lb',
        blockFuel: 175,
        baggage: 992,
        passengerCount: 0,
      },
      payload: {
        unit: 'lb',
        stationRoles: CARAVAN_ROLES,
      },
    });
    const built = buildOfpLoadPlan({
      ofp,
      profile,
      stationRoles: CARAVAN_ROLES,
      emptyWeightLb: 1885,
      maxGrossWeightLb: 3140,
    });
    // room = 3140 - 1885 - 175 - 340 - 25 = 715 (two crew @ 170)
    assert.equal(built.cargoLb, 715);
    assert.ok(built.cargoLb < 992);
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
