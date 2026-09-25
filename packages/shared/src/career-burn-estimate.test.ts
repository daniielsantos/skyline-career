import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateCareerBurnUsdPerDay } from './career-burn-estimate.js';
import type { CareerEconomyWorld } from './career-economy.js';
import type { CareerMissionsState, PlayerAircraft } from './types/career-economy.js';

function emptyState(over: Partial<CareerMissionsState> = {}): CareerMissionsState {
  return {
    walletUsd: 10_000,
    fleet: [],
    ledger: [],
    ...over,
  } as CareerMissionsState;
}

function worldStub(
  tick = 1000,
): Pick<CareerEconomyWorld, 'tick' | 'airports'> {
  return {
    tick,
    airports: [
      {
        icao: 'SBSP',
        name: 'Congonhas',
        lat: -23.6,
        lon: -46.6,
        hubTier: 'major',
        countryId: 'BR',
        region: 'BR',
      } as unknown as CareerEconomyWorld['airports'][number],
    ],
  };
}

describe('estimateCareerBurnUsdPerDay', () => {
  it('returns zero burn for an empty company', () => {
    const est = estimateCareerBurnUsdPerDay(emptyState(), worldStub());
    assert.equal(est.totalUsdPerDay, 0);
    assert.equal(est.runwayDays, null);
    assert.equal(est.lines.length, 0);
  });

  it('amortizes weekly aircraft lease and quotes hangar parking', () => {
    const fleet = [
      {
        id: 'acf_lease',
        label: 'Lease bird',
        ownership: 'leased',
        status: 'assigned',
        locationIcao: 'SBSP',
        aircraftClassId: 'light_ga',
        fuelKg: 100,
        fuelCapacityKg: 400,
        lease: {
          monthlyUsd: 700,
          nextDueTick: 2000,
          termEndsTick: 50_000,
          startedAtTick: 0,
          depositUsd: 0,
        },
      },
      {
        id: 'acf_park',
        label: 'Parked GA',
        ownership: 'owned',
        status: 'parked',
        locationIcao: 'SBSP',
        aircraftClassId: 'light_ga',
        fuelKg: 50,
        fuelCapacityKg: 400,
      },
    ] as unknown as PlayerAircraft[];
    const state = emptyState({
      walletUsd: 14_000,
      homeHubIcao: 'SBGR',
      fleet,
    });
    const est = estimateCareerBurnUsdPerDay(state, worldStub());
    const lease = est.lines.find((l) => l.id === 'aircraft_leases');
    const parking = est.lines.find((l) => l.id === 'hangar_parking');
    assert.ok(lease);
    assert.equal(lease!.usdPerDay, 100);
    assert.ok(parking);
    assert.ok(parking!.usdPerDay > 0);
    assert.equal(est.totalUsdPerDay, moneySum(lease!.usdPerDay, parking!.usdPerDay));
    assert.equal(
      est.runwayDays,
      Math.floor(14_000 / est.totalUsdPerDay),
    );
  });

  it('includes daily credit interest on outstanding principal', () => {
    const state = emptyState({
      walletUsd: 50_000,
      companyCredit: {
        principalUsd: 651_000,
        overdueDays: 0,
        lastSettledDayIndex: 0,
      },
    });
    const est = estimateCareerBurnUsdPerDay(state, worldStub());
    const interest = est.lines.find((l) => l.id === 'credit_interest');
    assert.ok(interest);
    assert.equal(interest!.usdPerDay, 520.8);
    assert.equal(est.totalUsdPerDay, 520.8);
    assert.equal(est.runwayDays, Math.floor(50_000 / 520.8));
  });
});

function moneySum(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100;
}
