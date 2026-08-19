import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allocateAircraftRegistration,
  collectUsedAircraftRegistrations,
  ensureAircraftRegistrations,
  normalizeAircraftRegistration,
} from './career-aircraft-registration.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import type { PlayerAircraft } from './types/career-economy.js';

describe('career-aircraft-registration', () => {
  it('normalizes and allocates unique registrations', () => {
    assert.equal(normalizeAircraftRegistration(' pr-sky '), 'PR-SKY');
    const used = new Set<string>();
    const a = allocateAircraftRegistration({ countryId: 'BR', used, seedHint: 'a' });
    const b = allocateAircraftRegistration({ countryId: 'BR', used, seedHint: 'b' });
    assert.notEqual(a, b);
    assert.ok(used.has(a));
    assert.ok(used.has(b));
  });

  it('backfills fleet and market without collisions', () => {
    const acf: PlayerAircraft = {
      id: 'acf_test_1',
      aircraftClassId: 'light_ga',
      label: 'Test GA',
      locationIcao: 'SBGR',
      fuelKg: 100,
      fuelCapacityKg: 200,
      status: 'parked',
    };
    const state = emptyMissionsStateV2();
    state.fleet = [acf, { ...acf, id: 'acf_test_2' }];
    state.aircraftMarket = [
      {
        id: 'acfl_1',
        kind: 'used',
        aircraftClassId: 'light_ga',
        label: 'Market GA',
        basedIcao: 'SBSP',
        askingUsd: 40_000,
        condition: 'tired',
        hoursAirframe: 100,
        hoursEngine: 90,
        expiresAtTick: 999,
        status: 'available',
      },
    ];
    ensureAircraftRegistrations(state);
    const regs = collectUsedAircraftRegistrations(state);
    assert.equal(regs.size, 3);
    assert.ok(state.fleet.every((row) => row.registration));
    assert.ok(state.aircraftMarket?.[0]?.registration);
  });
});
