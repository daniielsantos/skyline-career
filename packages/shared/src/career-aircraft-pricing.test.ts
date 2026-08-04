/**
 * Cargo-scaled aircraft MSRP (buy / lease / sell-back).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AIRCRAFT_MSRP_USD,
  CARGO_MSRP_MULT_MAX,
  CARGO_MSRP_MULT_MIN,
  cargoMsrpMultiplier,
  resolveAircraftLeaseMonthlyUsd,
  resolveAircraftMsrpUsd,
} from './career-aircraft-pricing.js';

describe('cargo-scaled aircraft MSRP', () => {
  it('returns 1 when cargo is missing or invalid', () => {
    assert.equal(
      cargoMsrpMultiplier({ aircraftClassId: 'light_ga' }),
      1,
    );
    assert.equal(
      cargoMsrpMultiplier({ aircraftClassId: 'light_ga', maxCargoKg: 0 }),
      1,
    );
  });

  it('scales with cargo and clamps soft outliers', () => {
    assert.equal(
      cargoMsrpMultiplier({ aircraftClassId: 'light_ga', maxCargoKg: 450 }),
      1,
    );
    assert.ok(
      cargoMsrpMultiplier({ aircraftClassId: 'light_ga', maxCargoKg: 250 }) < 1,
    );
    assert.equal(
      cargoMsrpMultiplier({ aircraftClassId: 'light_ga', maxCargoKg: 50 }),
      CARGO_MSRP_MULT_MIN,
    );
    assert.equal(
      cargoMsrpMultiplier({ aircraftClassId: 'light_ga', maxCargoKg: 5_000 }),
      CARGO_MSRP_MULT_MAX,
    );
    const aerostar = cargoMsrpMultiplier({
      aircraftClassId: 'light_ga',
      maxCargoKg: 726,
    });
    const c172 = cargoMsrpMultiplier({
      aircraftClassId: 'light_ga',
      maxCargoKg: 907,
    });
    assert.ok(c172 > aerostar);
    assert.ok(aerostar > 1);
    assert.ok(c172 < CARGO_MSRP_MULT_MAX);
  });

  it('raises MSRP and lease for higher-capacity GA', () => {
    const baseline = resolveAircraftMsrpUsd({ aircraftClassId: 'light_ga' });
    assert.equal(baseline, AIRCRAFT_MSRP_USD.light_ga);

    const fat = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 726,
    });
    assert.ok(fat > baseline);
    assert.ok(fat <= Math.round(AIRCRAFT_MSRP_USD.light_ga * CARGO_MSRP_MULT_MAX));

    const lean = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 300,
    });
    assert.ok(lean < baseline);

    const leaseFat = resolveAircraftLeaseMonthlyUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 726,
    });
    const leaseBase = resolveAircraftLeaseMonthlyUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 450,
    });
    assert.ok(leaseFat > leaseBase);
  });
});
