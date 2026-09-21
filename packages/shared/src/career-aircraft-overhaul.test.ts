import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  finalizeAircraftOverhaulsDue,
  OH_ENG_MSRP_RATE,
  overhaulDowntimeDays,
  overhaulMinHoursRequired,
  quoteAircraftOverhaul,
  startAircraftOverhaul,
} from './career-aircraft-overhaul.js';
import {
  AIRCRAFT_MSRP_USD,
  ECONOMIC_LIFE_HOURS,
  hoursMxCostMult,
  resolveAircraftMsrpUsd,
} from './career-aircraft-pricing.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { TICKS_PER_DAY } from './career-clock.js';

describe('aircraft engine / airframe overhaul', () => {
  it('gates engine OH at 0.45 life and prices by MSRP × rate × lifeFrac', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'OhPrice',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.ownership = 'owned';
    acf.status = 'parked';
    const life = ECONOMIC_LIFE_HOURS.light_ga;
    const min = overhaulMinHoursRequired('light_ga', 'engine');
    assert.equal(min, Math.ceil(life * 0.45));

    acf.hoursEngine = min - 1;
    const blocked = quoteAircraftOverhaul(acf, 'engine', { atTick: 0 });
    assert.equal(blocked.eligible, false);

    acf.hoursEngine = life;
    const msrp = resolveAircraftMsrpUsd({
      aircraftClassId: acf.aircraftClassId,
      maxCargoKg: findCareerPlayerAirframe(acf.airframeTypeId)?.maxCargoKg,
    });
    const full = quoteAircraftOverhaul(acf, 'engine', { atTick: 0 });
    assert.equal(full.eligible, true);
    assert.equal(
      full.debitUsd,
      Math.round(msrp * OH_ENG_MSRP_RATE.light_ga * 1),
    );

    acf.hoursEngine = life * 0.5;
    const mid = quoteAircraftOverhaul(acf, 'engine', { atTick: 0 });
    assert.ok(mid.eligible);
    assert.ok(mid.debitUsd < full.debitUsd);
    assert.ok(mid.debitUsd > 0);
    assert.ok(msrp <= AIRCRAFT_MSRP_USD.light_ga);
  });

  it('airframe OH uses higher gate, higher rate, and 2× downtime', () => {
    assert.equal(
      overhaulDowntimeDays('light_ga', 'airframe'),
      overhaulDowntimeDays('light_ga', 'engine') * 2,
    );
    assert.ok(
      overhaulMinHoursRequired('light_ga', 'airframe') >
        overhaulMinHoursRequired('light_ga', 'engine'),
    );

    const state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      pilotName: 'OhAf',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.ownership = 'owned';
    acf.status = 'parked';
    acf.hoursAirframe = ECONOMIC_LIFE_HOURS.light_ga;
    acf.hoursEngine = 0;
    const q = quoteAircraftOverhaul(acf, 'airframe', { atTick: 10 });
    assert.equal(q.eligible, true);
    assert.equal(q.downtimeDays, 2);
    assert.equal(q.readyAtTick, 10 + 2 * TICKS_PER_DAY);
  });

  it('blocks leased hulls', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'OhLease',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.ownership = 'leased';
    acf.status = 'parked';
    acf.hoursEngine = ECONOMIC_LIFE_HOURS.light_ga;
    const q = quoteAircraftOverhaul(acf, 'engine', { atTick: 0 });
    assert.equal(q.eligible, false);
    assert.match(q.reason ?? '', /Leased/i);
    state.walletUsd = 1_000_000;
    assert.throws(() => startAircraftOverhaul(state, acf.id, 'engine', { atTick: 0 }));
  });

  it('start + finalize resets engine hours and drops MX mult; leaves AF hours', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGL', {
      pilotName: 'OhReset',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.ownership = 'owned';
    acf.status = 'parked';
    const life = ECONOMIC_LIFE_HOURS.light_ga;
    acf.hoursEngine = life;
    acf.hoursAirframe = life * 0.8;
    const mxBefore = hoursMxCostMult(acf);
    state.walletUsd = 500_000;
    const { debitUsd, quote } = startAircraftOverhaul(state, acf.id, 'engine', {
      atTick: 100,
    });
    assert.ok(debitUsd > 0);
    assert.equal(acf.status, 'maintenance');
    assert.equal(acf.overhaulKind, 'engine');
    assert.equal(acf.overhaulReadyAtTick, quote.readyAtTick);
    assert.equal(acf.hoursEngine, life);

    finalizeAircraftOverhaulsDue(state, quote.readyAtTick - 1);
    assert.equal(acf.overhaulKind, 'engine');

    finalizeAircraftOverhaulsDue(state, quote.readyAtTick);
    assert.equal(acf.hoursEngine, 0);
    assert.equal(acf.hoursAirframe, life * 0.8);
    assert.equal(acf.hoursSinceInspection, 0);
    assert.equal(acf.overhaulKind, undefined);
    const mxAfter = hoursMxCostMult(acf);
    assert.ok(mxAfter < mxBefore);
  });

  it('airframe finalize resets only AF hours', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBRJ', {
      pilotName: 'OhAfReset',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.ownership = 'owned';
    acf.status = 'parked';
    const life = ECONOMIC_LIFE_HOURS.light_ga;
    acf.hoursAirframe = life;
    acf.hoursEngine = life * 0.7;
    state.walletUsd = 500_000;
    const { quote } = startAircraftOverhaul(state, acf.id, 'airframe', {
      atTick: 0,
    });
    finalizeAircraftOverhaulsDue(state, quote.readyAtTick);
    assert.equal(acf.hoursAirframe, 0);
    assert.equal(acf.hoursEngine, life * 0.7);
  });
});
