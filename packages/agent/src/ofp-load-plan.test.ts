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
  distributeCargoAcrossStations,
  distributeFuelAcrossTanks,
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
