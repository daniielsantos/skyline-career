/**
 * Cargo-scaled aircraft MSRP (buy / lease / sell-back).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AIRCRAFT_MSRP_USD,
  CARGO_MSRP_MULT_MAX,
  CARGO_MSRP_MULT_MIN,
  CONDITION_LEASE_WEEKLY_MULT,
  CONDITION_PRICE_MULT,
  cargoMsrpMultiplier,
  ECONOMIC_LIFE_HOURS,
  hoursMxCostMult,
  hoursValueMult,
  resolveAircraftLeaseMonthlyUsd,
  resolveAircraftLeaseWeeklyUsd,
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

  it('prices ATR regionals well above light-TP floor (anti-snowball)', () => {
    const kingFloor = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 556,
    });
    const atr42 = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 5_000,
    });
    const atr72 = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 7_500,
    });
    assert.ok(atr42 > kingFloor * 2);
    assert.ok(atr72 > atr42);
    assert.ok(atr72 >= 1_100_000, `ATR72 MSRP ${atr72}`);

    const leaseFloor = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 556,
    });
    const lease42 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 5_000,
    });
    const lease72 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 7_500,
    });
    assert.ok(lease42 > leaseFloor);
    assert.ok(lease72 > lease42);
    assert.ok(lease72 >= 20_000, `ATR72 lease ${lease72}`);

    const tiredAged = Math.round(
      atr72 *
        CONDITION_PRICE_MULT.tired *
        hoursValueMult({
          aircraftClassId: 'light_turboprop',
          hoursAirframe: ECONOMIC_LIFE_HOURS.light_turboprop,
          hoursEngine: ECONOMIC_LIFE_HOURS.light_turboprop,
        }),
    );
    assert.ok(tiredAged >= 450_000, `ATR72 tired+aged ${tiredAged}`);
    assert.ok(
      CONDITION_LEASE_WEEKLY_MULT.excellent >
        CONDITION_LEASE_WEEKLY_MULT.fair,
    );
  });
});

describe('hours life multipliers', () => {
  it('is 1× at zero hours and caps at full economic life', () => {
    const zero = {
      aircraftClassId: 'light_turboprop' as const,
      hoursAirframe: 0,
      hoursEngine: 0,
    };
    assert.equal(hoursMxCostMult(zero), 1);
    assert.equal(hoursValueMult(zero), 1);

    const life = ECONOMIC_LIFE_HOURS.light_turboprop;
    const full = {
      aircraftClassId: 'light_turboprop' as const,
      hoursAirframe: life,
      hoursEngine: life,
    };
    assert.equal(hoursMxCostMult(full), 1.6);
    assert.equal(hoursValueMult(full), 0.8);
  });

  it('weights engine hours less than airframe for MX', () => {
    const classId = 'light_turboprop' as const;
    const highAf = hoursMxCostMult({
      aircraftClassId: classId,
      hoursAirframe: 4_000,
      hoursEngine: 0,
    });
    const highEng = hoursMxCostMult({
      aircraftClassId: classId,
      hoursAirframe: 0,
      hoursEngine: 4_000,
    });
    assert.ok(highAf > highEng);
    assert.ok(highAf > 1);
    assert.ok(highEng > 1);
  });
});
