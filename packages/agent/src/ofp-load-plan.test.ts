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
  adjustPlannedPayloadForLiveCrewStations,
  buildOfpLoadPlan,
  buildRollbackPlan,
  careerOperationalCargoMaxLb,
  cgCounterweightPerSeatLb,
  cgRebalanceStepLb,
  equalizeLateralStationPairs,
  findLateralStationGroups,
  fuelTankTargetsForRound,
  FUEL_INJECT_ROUNDS,
  liveFuelMatchesTarget,
  absorbFuelResidualFloors,
  redistributeAroundResidualFloors,
  resolveCgCounterweightBias,
  distributeCargoAcrossStations,
  distributeFuelAcrossTanks,
  orderStationsLongitudinal,
  plannedStationPayloadLb,
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

describe('careerOperationalCargoMaxLb', () => {
  const commanderStations = [
    { index: 1, maxLoad: 500 },
    { index: 2, maxLoad: 500 },
    { index: 3, maxLoad: 500 },
    { index: 4, maxLoad: 500 },
    { index: 5, maxLoad: 500 },
  ];

  it('uses GA soft-cap room when passenger seats exist', () => {
    // crew spare 2×130 + pax 2×300 + bag 50 = 910
    assert.equal(
      careerOperationalCargoMaxLb({
        stations: commanderStations,
        stationRoles: {
          crewStations: [1, 2],
          passengerStations: [3, 4],
          baggageStations: [5],
        },
      }),
      910,
    );
  });

  it('uses full baggage maxLoad for freighter (no pax seats)', () => {
    assert.equal(
      careerOperationalCargoMaxLb({
        stations: [
          { index: 1, maxLoad: 500 },
          { index: 2, maxLoad: 500 },
          { index: 3, maxLoad: 500 },
          { index: 7, maxLoad: 500 },
        ],
        stationRoles: {
          crewStations: [1, 2],
          passengerStations: [],
          baggageStations: [3, 7],
        },
      }),
      1000,
    );
  });

  it('honors measured clamp maxLoads below the soft-cap / placeholder', () => {
    assert.equal(
      careerOperationalCargoMaxLb({
        stations: [
          { index: 1, maxLoad: 340 },
          { index: 2, maxLoad: 340 },
          { index: 3, maxLoad: 200 },
          { index: 4, maxLoad: 200 },
          { index: 5, maxLoad: 40 },
        ],
        stationRoles: {
          crewStations: [1, 2],
          passengerStations: [3, 4],
          baggageStations: [5],
        },
      }),
      // crew spare 2×(300-170)=260 but hard 340→soft 300; pax 2×200; bag min(40,50)=40
      260 + 400 + 40,
    );
    assert.equal(
      careerOperationalCargoMaxLb({
        stations: [
          { index: 1, maxLoad: 170 },
          { index: 2, maxLoad: 170 },
          { index: 3, maxLoad: 340 },
          { index: 4, maxLoad: 340 },
        ],
        stationRoles: {
          crewStations: [1, 2],
          passengerStations: [],
          baggageStations: [3, 4],
        },
      }),
      680,
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

  it('freighter: uses raised bag maxLoad when a station is service/ghost', () => {
    const profile = {
      payload: {
        stations: [
          { index: 1, name: 'Pilot', maxLoad: 500, arm: 12 },
          { index: 2, name: 'Copilot', maxLoad: 500, arm: 12 },
          { index: 3, name: 'Bag A', maxLoad: 750, arm: 0 },
          { index: 4, name: 'Bag B', maxLoad: 750, arm: 0 },
          { index: 5, name: 'Ghost', maxLoad: 500, arm: 17 },
          { index: 6, name: 'Bag C', maxLoad: 750, arm: -10 },
        ],
      },
    } as AircraftProfile;
    const roles = {
      crewStations: [1, 2],
      passengerStations: [],
      baggageStations: [3, 4, 6],
      serviceStations: [5],
    };
    const result = distributeCargoAcrossStations(2000, profile, roles);
    assert.equal(result.cargoPlacedLb, 2000);
    assert.equal(result.stations[1], 170);
    assert.equal(result.stations[2], 170);
    assert.equal(result.stations[5], 0);
    const bags =
      (result.stations[3] ?? 0) +
      (result.stations[4] ?? 0) +
      (result.stations[6] ?? 0);
    assert.equal(bags, 2000);
    assert.equal(result.total, 2340);
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

  it('clamps cargo over baggage capacity', async () => {
    const profile = await loadCaravanProfile();
    const result = distributeCargoAcrossStations(50_000, profile, CARAVAN_ROLES);
    assert.ok(result.cargoPlacedLb <= result.baggageCapacityLb + 0.5);
    assert.equal(result.cargoPlacedLb, result.baggageCapacityLb);
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

  it('falls back to station index without arms', () => {
    const profile = {
      payload: {
        stations: [
          { index: 15, maxLoad: 500 },
          { index: 3, maxLoad: 500 },
          { index: 10, maxLoad: 500 },
        ],
      },
    } as AircraftProfile;
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
    const { indexes: forwardFirst } = orderStationsLongitudinal(
      profile,
      CARAVAN_ROLES.baggageStations,
    );
    const forwardMost = forwardFirst[0]!;
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
    assert.ok((shifted.stations[forwardMost] ?? 0) > 0);
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
    const { indexes: forwardFirst } = orderStationsLongitudinal(
      profile,
      CARAVAN_ROLES.baggageStations,
    );
    const forwardMost = forwardFirst[0]!;
    stations[forwardMost] = 500;
    const shifted = shiftCargoForCg(
      stations,
      profile,
      CARAVAN_ROLES.baggageStations,
      'forward',
      100,
    );
    assert.equal(shifted.movedLb, 0);
    assert.equal(shifted.stations[forwardMost], 500);
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

  it('equalizes left/right pairs at the same arm after a budget-limited round', () => {
    const profile = {
      payload: {
        stations: [
          { index: 5, name: 'REAR PAX LEFT', maxLoad: 500, arm: -5.7 },
          { index: 6, name: 'REAR PAX RIGHT', maxLoad: 500, arm: -5.7 },
          { index: 7, name: 'BAGGAGE', maxLoad: 500, arm: -7.8 },
        ],
      },
    } as AircraftProfile;
    const groups = findLateralStationGroups(profile, [5, 6, 7]);
    assert.deepEqual(groups, [[5, 6]]);

    // Budget only enough for one seat — without lateral equalize, left would get all.
    const placed = allocateCargoRoundPerSeat(
      { 5: 0, 6: 0, 7: 0 },
      profile,
      [5, 6, 7],
      100,
      'aft',
      100,
    );
    assert.equal(placed.movedLb, 100);
    assert.ok(Math.abs((placed.stations[5] ?? 0) - (placed.stations[6] ?? 0)) <= 1);
    assert.equal((placed.stations[5] ?? 0) + (placed.stations[6] ?? 0), 100);

    const skewed = equalizeLateralStationPairs(
      { 5: 390, 6: 129, 7: 80 },
      profile,
      [5, 6, 7],
    );
    assert.ok(Math.abs((skewed[5] ?? 0) - (skewed[6] ?? 0)) <= 1);
    assert.equal((skewed[5] ?? 0) + (skewed[6] ?? 0), 390 + 129);
    assert.equal(skewed[7], 80);
  });

  it('does not drain right→left at the same arm when shifting CG forward', () => {
    // Bonanza-like: L/R pairs share arm; index order alone would treat R as "aft".
    const profile = {
      payload: {
        stations: [
          { index: 3, name: 'FRONT PAX LEFT', maxLoad: 500, arm: -2.3 },
          { index: 4, name: 'FRONT PAX RIGHT', maxLoad: 500, arm: -2.3 },
          { index: 5, name: 'REAR PAX LEFT', maxLoad: 500, arm: -5.7 },
          { index: 6, name: 'REAR PAX RIGHT', maxLoad: 500, arm: -5.7 },
          { index: 7, name: 'BAGGAGE', maxLoad: 500, arm: -7.8 },
        ],
      },
    } as AircraftProfile;
    const start = { 3: 100, 4: 100, 5: 250, 6: 250, 7: 100 };
    const shifted = shiftCargoForCg(
      start,
      profile,
      [3, 4, 5, 6, 7],
      'forward',
      150,
    );
    assert.ok(shifted.movedLb > 0);
    assert.ok(
      Math.abs((shifted.stations[3] ?? 0) - (shifted.stations[4] ?? 0)) <= 1,
      `front L/R drifted: ${shifted.stations[3]} vs ${shifted.stations[4]}`,
    );
    assert.ok(
      Math.abs((shifted.stations[5] ?? 0) - (shifted.stations[6] ?? 0)) <= 1,
      `rear L/R drifted: ${shifted.stations[5]} vs ${shifted.stations[6]}`,
    );
    const before =
      (start[3] ?? 0) +
      (start[4] ?? 0) +
      (start[5] ?? 0) +
      (start[6] ?? 0) +
      (start[7] ?? 0);
    const after =
      (shifted.stations[3] ?? 0) +
      (shifted.stations[4] ?? 0) +
      (shifted.stations[5] ?? 0) +
      (shifted.stations[6] ?? 0) +
      (shifted.stations[7] ?? 0);
    assert.equal(after, before);
    // Mass should have left the aft baggage toward the nose row.
    assert.ok((shifted.stations[7] ?? 0) < (start[7] ?? 0));
    assert.ok(
      (shifted.stations[3] ?? 0) + (shifted.stations[4] ?? 0) >
        (start[3] ?? 0) + (start[4] ?? 0),
    );
  });

  it('can shift cargo onto crew seats while retaining minimum crew weight', async () => {
    const profile = await loadCaravanProfile();
    const stations: Record<number, number> = { 1: 170, 2: 170 };
    // Cabin-only movable set: cargo pods sit forward of the pilots on this
    // airframe's arms, so including them would prefer the pod over seats.
    const cabinBaggage = [3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const idx of CARAVAN_ROLES.baggageStations) stations[idx] = 0;
    stations[11] = 400;
    const movable = [...CARAVAN_ROLES.crewStations, ...cabinBaggage];
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
    assert.ok((shifted.stations[11] ?? 0) < 400);
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
    // Inside envelope but already nose-ish → keep loading aft (C408 cabin).
    assert.equal(
      resolveCgCounterweightBias({ liveMac: 16.4, lo: 8.5, hi: 30 }),
      'aft',
    );
    assert.equal(
      resolveCgCounterweightBias({ liveMac: 28, lo: 8.5, hi: 30 }),
      'forward',
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

  it('ramps fuel tanks across FUEL_INJECT_ROUNDS and snaps on the last', () => {
    const from = { LEFT_MAIN: 0, RIGHT_MAIN: 10 };
    const to = { LEFT_MAIN: 40, RIGHT_MAIN: 50 };
    assert.equal(FUEL_INJECT_ROUNDS, 4);
    assert.deepEqual(fuelTankTargetsForRound(from, to, 1), {
      LEFT_MAIN: 10,
      RIGHT_MAIN: 20,
    });
    assert.deepEqual(fuelTankTargetsForRound(from, to, 2), {
      LEFT_MAIN: 20,
      RIGHT_MAIN: 30,
    });
    assert.deepEqual(fuelTankTargetsForRound(from, to, 3), {
      LEFT_MAIN: 30,
      RIGHT_MAIN: 40,
    });
    assert.deepEqual(fuelTankTargetsForRound(from, to, 4), to);
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

describe('adjustPlannedPayloadForLiveCrewStations', () => {
  it('drops crew floor when S1/S2 are empty (EFB cargo-only)', () => {
    const base = plannedStationPayloadLb({
      cargoLb: 2000,
      stationRoles: { crewStations: [1, 2], baggageStations: [12] },
    });
    assert.equal(base.crewLb, 340);
    assert.equal(base.plannedTotalLb, 2340);

    const adj = adjustPlannedPayloadForLiveCrewStations({
      cargoPlacedLb: base.cargoPlacedLb,
      crewLb: base.crewLb,
      crewStations: [1, 2],
      liveStations: { 1: 0, 2: 0, 12: 2000 },
    });
    assert.equal(adj.crewOnStations, false);
    assert.equal(adj.crewLb, 0);
    assert.equal(adj.plannedTotalLb, 2000);
  });

  it('keeps crew floor when pilot/copilot stations have weight', () => {
    const adj = adjustPlannedPayloadForLiveCrewStations({
      cargoPlacedLb: 2000,
      crewLb: 340,
      crewStations: [1, 2],
      liveStations: { 1: 170, 2: 170, 12: 2000 },
    });
    assert.equal(adj.crewOnStations, true);
    assert.equal(adj.crewLb, 340);
    assert.equal(adj.plannedTotalLb, 2340);
  });

  it('keeps full Due when live stations are unknown', () => {
    const adj = adjustPlannedPayloadForLiveCrewStations({
      cargoPlacedLb: 2000,
      crewLb: 340,
      crewStations: [1, 2],
      liveStations: null,
    });
    assert.equal(adj.plannedTotalLb, 2340);
    assert.equal(adj.crewLb, 340);
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

describe('absorbFuelResidualFloors', () => {
  it('raises empty outer tanks to the live unusable residual', () => {
    const { tanks, added } = absorbFuelResidualFloors(
      { LEFT_MAIN: 100, RIGHT_MAIN: 100, LEFT_AUX: 0, RIGHT_AUX: 0 },
      { LEFT_MAIN: 100, RIGHT_MAIN: 100, LEFT_AUX: 8.7, RIGHT_AUX: 8.7 },
    );
    assert.equal(tanks.LEFT_AUX, 8.7);
    assert.equal(tanks.RIGHT_AUX, 8.7);
    assert.ok(added > 17);
  });

  it('does not treat a still-full tank as an unusable floor', () => {
    const { tanks, added } = absorbFuelResidualFloors(
      { LEFT_MAIN: 50, RIGHT_MAIN: 50 },
      { LEFT_MAIN: 100, RIGHT_MAIN: 100 },
    );
    assert.equal(tanks.LEFT_MAIN, 50);
    assert.equal(added, 0);
  });
});

describe('redistributeAroundResidualFloors', () => {
  it('keeps OFP total by pulling tip residual out of the mains', () => {
    const planned = {
      LEFT_MAIN: 140,
      RIGHT_MAIN: 140,
      LEFT_AUX: 0,
      RIGHT_AUX: 0,
    };
    const live = {
      LEFT_MAIN: 140,
      RIGHT_MAIN: 140,
      LEFT_AUX: 11.8,
      RIGHT_AUX: 11.9,
    };
    const { tanks, added, reduced } = redistributeAroundResidualFloors(
      planned,
      live,
    );
    assert.ok(added > 23);
    assert.ok(reduced > 23);
    const plannedTotal =
      planned.LEFT_MAIN + planned.RIGHT_MAIN + planned.LEFT_AUX + planned.RIGHT_AUX;
    const nextTotal =
      tanks.LEFT_MAIN! + tanks.RIGHT_MAIN! + tanks.LEFT_AUX! + tanks.RIGHT_AUX!;
    assert.ok(Math.abs(nextTotal - plannedTotal) < 0.15);
    assert.equal(tanks.LEFT_AUX, 11.8);
    assert.equal(tanks.RIGHT_AUX, 11.9);
    assert.ok(tanks.LEFT_MAIN! < planned.LEFT_MAIN);
    assert.ok(tanks.RIGHT_MAIN! < planned.RIGHT_MAIN);
  });
});
