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
  resolveDealerLeaseWeeklyUsd,
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

  it('prices 404 Titan well above light-GA floor (anti-snowball)', () => {
    const c172 = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 371,
    });
    const titan = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 1_563,
    });
    assert.ok(titan > c172 * 2);
    assert.ok(titan >= 300_000, `Titan MSRP ${titan}`);

    const leaseC172 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 371,
    });
    const leaseTitan = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: 1_563,
    });
    assert.ok(leaseTitan > leaseC172);
    assert.ok(leaseTitan >= 6_000, `Titan lease ${leaseTitan}`);

    const tiredAged = Math.round(
      titan *
        CONDITION_PRICE_MULT.tired *
        hoursValueMult({
          aircraftClassId: 'light_ga',
          hoursAirframe: ECONOMIC_LIFE_HOURS.light_ga,
          hoursEngine: ECONOMIC_LIFE_HOURS.light_ga,
        }),
    );
    assert.ok(tiredAged >= 120_000, `Titan tired+aged ${tiredAged}`);
  });

  it('prices Learjet above light-jet floor (anti-snowball)', () => {
    const hondaFloor = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_jet',
      maxCargoKg: 540,
    });
    const lear = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_jet',
      maxCargoKg: 1_423,
    });
    assert.ok(lear > hondaFloor);
    assert.ok(lear >= 950_000, `Lear MSRP ${lear}`);

    const leaseFloor = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_jet',
      maxCargoKg: 540,
    });
    const leaseLear = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'light_jet',
      maxCargoKg: 1_423,
    });
    assert.ok(leaseLear > leaseFloor);
    assert.ok(leaseLear >= 18_000, `Lear lease ${leaseLear}`);

    const tiredAged = Math.round(
      lear *
        CONDITION_PRICE_MULT.tired *
        hoursValueMult({
          aircraftClassId: 'light_jet',
          hoursAirframe: ECONOMIC_LIFE_HOURS.light_jet,
          hoursEngine: ECONOMIC_LIFE_HOURS.light_jet,
        }),
    );
    assert.ok(tiredAged >= 400_000, `Lear tired+aged ${tiredAged}`);
  });

  it('prices medium piston DC-6 class above jet floor (anti-snowball)', () => {
    const lean = resolveAircraftMsrpUsd({
      aircraftClassId: 'medium_piston',
      maxCargoKg: 7_000,
    });
    const dc6 = resolveAircraftMsrpUsd({
      aircraftClassId: 'medium_piston',
      maxCargoKg: 10_000,
    });
    assert.ok(dc6 > lean);
    assert.ok(dc6 >= 1_700_000, `DC-6 MSRP ${dc6}`);
    assert.ok(lean >= 1_300_000, `medium lean MSRP ${lean}`);

    const leaseLean = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'medium_piston',
      maxCargoKg: 7_000,
    });
    const leaseDc6 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'medium_piston',
      maxCargoKg: 10_000,
    });
    assert.ok(leaseDc6 > leaseLean);
    assert.ok(leaseDc6 >= 34_000, `DC-6 lease ${leaseDc6}`);

    const fairMid = resolveDealerLeaseWeeklyUsd({
      aircraftClassId: 'medium_piston',
      maxCargoKg: 10_000,
      condition: 'fair',
      hoursAirframe: 4_000,
      hoursEngine: 3_500,
    });
    assert.ok(fairMid >= 28_000, `DC-6 fair/mid lease ${fairMid}`);

    const tiredAged = Math.round(
      dc6 *
        CONDITION_PRICE_MULT.tired *
        hoursValueMult({
          aircraftClassId: 'medium_piston',
          hoursAirframe: ECONOMIC_LIFE_HOURS.medium_piston,
          hoursEngine: ECONOMIC_LIFE_HOURS.medium_piston,
        }),
    );
    assert.ok(tiredAged >= 700_000, `DC-6 tired+aged ${tiredAged}`);
  });

  it('prices narrow freighters above class floor (anti-snowball)', () => {
    const baeFloor = resolveAircraftMsrpUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 9_800,
    });
    const b737 = resolveAircraftMsrpUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 18_137,
    });
    const a320 = resolveAircraftMsrpUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 19_958,
    });
    assert.ok(b737 > baeFloor);
    assert.ok(a320 > b737);
    assert.ok(b737 >= 2_500_000, `737 MSRP ${b737}`);
    assert.ok(baeFloor >= 1_900_000, `BAE floor MSRP ${baeFloor}`);

    const leaseFloor = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 9_800,
    });
    const lease737 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 18_137,
    });
    const leaseA320 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 19_958,
    });
    assert.ok(lease737 > leaseFloor);
    assert.ok(leaseA320 > lease737);
    assert.ok(lease737 >= 60_000, `737 lease ${lease737}`);
    assert.ok(leaseFloor >= 45_000, `BAE floor lease ${leaseFloor}`);

    const tiredAged = Math.round(
      b737 *
        CONDITION_PRICE_MULT.tired *
        hoursValueMult({
          aircraftClassId: 'narrow_freighter',
          hoursAirframe: ECONOMIC_LIFE_HOURS.narrow_freighter,
          hoursEngine: ECONOMIC_LIFE_HOURS.narrow_freighter,
        }),
    );
    assert.ok(tiredAged >= 1_000_000, `737 tired+aged ${tiredAged}`);
  });

  it('discounts dealer lease weekly by condition and hours', () => {
    const catalog = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 18_137,
    });
    const freshGood = resolveDealerLeaseWeeklyUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 18_137,
      condition: 'good',
      hoursAirframe: 1_500,
      hoursEngine: 1_200,
    });
    const tiredHigh = resolveDealerLeaseWeeklyUsd({
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 18_137,
      condition: 'tired',
      hoursAirframe: 9_500,
      hoursEngine: 8_000,
    });
    assert.ok(freshGood < catalog);
    assert.ok(tiredHigh < freshGood);
    assert.ok(tiredHigh <= Math.round(catalog * 0.85 * 0.88));
  });

  it('prices wide freighters above class floor (anti-snowball)', () => {
    const a332 = resolveAircraftMsrpUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 52_000,
    });
    const md11 = resolveAircraftMsrpUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 90_000,
    });
    const b777f = resolveAircraftMsrpUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 104_115,
    });
    assert.ok(md11 > a332);
    assert.ok(b777f > md11);
    assert.ok(md11 >= 12_500_000, `MD-11 MSRP ${md11}`);
    assert.ok(a332 >= 10_000_000, `A332 floor MSRP ${a332}`);

    const leaseFloor = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 52_000,
    });
    const leaseMd11 = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 90_000,
    });
    const lease777f = resolveAircraftLeaseWeeklyUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 104_115,
    });
    assert.ok(leaseMd11 > leaseFloor);
    assert.ok(lease777f > leaseMd11);
    assert.ok(leaseMd11 >= 200_000, `MD-11 lease ${leaseMd11}`);

    const fairMid = resolveDealerLeaseWeeklyUsd({
      aircraftClassId: 'wide_freighter',
      maxCargoKg: 90_000,
      condition: 'fair',
      hoursAirframe: 4_000,
      hoursEngine: 3_500,
    });
    assert.ok(fairMid >= 170_000, `MD-11 fair/mid lease ${fairMid}`);

    const tiredAged = Math.round(
      md11 *
        CONDITION_PRICE_MULT.tired *
        hoursValueMult({
          aircraftClassId: 'wide_freighter',
          hoursAirframe: ECONOMIC_LIFE_HOURS.wide_freighter,
          hoursEngine: ECONOMIC_LIFE_HOURS.wide_freighter,
        }),
    );
    assert.ok(tiredAged >= 5_500_000, `MD-11 tired+aged ${tiredAged}`);
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
