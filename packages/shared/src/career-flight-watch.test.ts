import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAREER_HUB_COORDS,
  createMissionFlightWatchState,
  distanceNm,
  evaluateMinAirborneElapsed,
  evaluateMissionFlightTransition,
  flightPhaseFromSample,
  isNearAirport,
  mergeAirborneClockOntoMission,
  parseBlockTimeToMs,
  rebaseExpectedRouteMsFromCruise,
  resumeAirborneAtMs,
  pickActiveMission,
  resolveExpectedRouteMs,
  type MissionIntent,
} from './index.js';

function mission(status: MissionIntent['status']): MissionIntent {
  return {
    id: 'msn_watch',
    lots: [
      {
        shipmentLotId: 'lot_1',
        commodityId: 'general',
        cargoKg: 5_000,
        payUsd: 100,
        urgency: 'normal',
        reason: 'test',
        deadlineTick: 50,
      },
    ],
    shipmentLotId: 'lot_1',
    commodityId: 'general',
    originIcao: 'SBPA',
    destIcao: 'SBRF',
    cargoKg: 5_000,
    pax: 0,
    aircraftClassId: 'narrow_freighter',
    rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
    deadlineTick: 50,
    payUsd: 100,
    urgency: 'normal',
    reason: 'test',
    status,
    acceptedAtTick: 1,
  };
}

const SBRF = CAREER_HUB_COORDS.SBRF!;
const SBPA = CAREER_HUB_COORDS.SBPA!;

describe('distanceNm / isNearAirport', () => {
  it('measures SBPA→SBRF as a long domestic route', () => {
    const d = distanceNm(SBPA, SBRF);
    assert.ok(d > 1_500 && d < 2_000, `got ${d} nm`);
  });

  it('treats positions within airport radius as near', () => {
    const near = isNearAirport(
      { lat: SBRF.lat + 0.02, lon: SBRF.lon },
      SBRF,
      12,
    );
    assert.equal(near.near, true);
    const far = isNearAirport(SBPA, SBRF, 12);
    assert.equal(far.near, false);
  });
});

describe('evaluateMissionFlightTransition', () => {
  it('does not fire on first sample (bootstrap)', () => {
    let state = createMissionFlightWatchState();
    const first = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: true, enginesRunning: true },
      state,
      { requireDestProximity: false },
    );
    assert.equal(first.event.type, 'none');
    state = first.nextState;

    const stillGround = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: true, enginesRunning: true },
      state,
      { requireDestProximity: false },
    );
    assert.equal(stillGround.event.type, 'none');
  });

  it('emits depart on wheels-up from dispatched', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: true, enginesRunning: true },
      state,
    ).nextState;

    const up = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: false, enginesRunning: true },
      state,
    );
    assert.equal(up.event.type, 'depart');
    assert.equal(up.nextState.sawAirborne, true);
  });

  it('does not depart on engines-running while still on ground', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('accepted'),
      { onGround: true, enginesRunning: false },
      state,
    ).nextState;

    const spool = evaluateMissionFlightTransition(
      mission('accepted'),
      { onGround: true, enginesRunning: true },
      state,
    );
    assert.equal(spool.event.type, 'none');
  });

  it('settles when near dest after airborne + engines off', () => {
    const plannedMs = 3_600_000;
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: Date.now() - plannedMs,
      expectedRouteMs: plannedMs,
    });

    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { destCoords: SBRF, nowMs: Date.now() },
    );
    assert.equal(down.event.type, 'settle');
  });

  it('blocks settle when landed far from destination', () => {
    const plannedMs = 3_600_000;
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: Date.now() - plannedMs,
      expectedRouteMs: plannedMs,
    });

    const wrongAirport = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBPA.lat, lon: SBPA.lon },
      },
      state,
      { destCoords: SBRF, nowMs: Date.now() },
    );
    assert.equal(wrongAirport.event.type, 'settle_blocked');
    if (wrongAirport.event.type === 'settle_blocked') {
      assert.ok((wrongAirport.event.distanceNm ?? 0) > 100);
    }
  });

  it('blocks settle when position is missing', () => {
    const plannedMs = 3_600_000;
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: Date.now() - plannedMs,
      expectedRouteMs: plannedMs,
    });

    const noPos = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: true, enginesRunning: false },
      state,
      { destCoords: SBRF, nowMs: Date.now() },
    );
    assert.equal(noPos.event.type, 'settle_blocked');
  });

  it('waits for engines off after touchdown by default', () => {
    const plannedMs = 3_600_000;
    const nowMs = Date.now();
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: nowMs - plannedMs,
      expectedRouteMs: plannedMs,
    });

    const taxi = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { destCoords: SBRF, nowMs },
    );
    assert.equal(taxi.event.type, 'none');
    state = taxi.nextState;

    const shutdown = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { destCoords: SBRF, nowMs },
    );
    assert.equal(shutdown.event.type, 'settle');
  });

  it('can settle on touchdown without engines when near dest', () => {
    const plannedMs = 3_600_000;
    const nowMs = Date.now();
    const state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: nowMs - plannedMs,
      expectedRouteMs: plannedMs,
    });

    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { requireEnginesOffToSettle: false, destCoords: SBRF, nowMs },
    );
    assert.equal(down.event.type, 'settle');
  });

  it('stamps airborne clock on wheels-up and blocks early settle', () => {
    const plannedMs = 60 * 60_000;
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: true, enginesRunning: true },
      state,
      { expectedRouteMs: plannedMs, nowMs: 1_000_000 },
    ).nextState;

    const up = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: false, enginesRunning: true },
      state,
      { expectedRouteMs: plannedMs, nowMs: 1_000_000 },
    );
    assert.equal(up.event.type, 'depart');
    assert.equal(up.nextState.airborneAtMs, 1_000_000);
    assert.equal(up.nextState.expectedRouteMs, plannedMs);
    state = up.nextState;

    const early = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      {
        destCoords: SBRF,
        expectedRouteMs: plannedMs,
        nowMs: 1_000_000 + 30 * 60_000,
      },
    );
    assert.equal(early.event.type, 'settle_blocked');
    if (early.event.type === 'settle_blocked') {
      assert.match(early.event.reason, /70%/);
    }

    const lateEnough = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      {
        destCoords: SBRF,
        expectedRouteMs: plannedMs,
        nowMs: 1_000_000 + 42 * 60_000,
      },
    );
    assert.equal(lateEnough.event.type, 'settle');
  });

  it('uses OFP air time when resolving expected route ms', () => {
    const msn = mission('dispatched');
    msn.aircraftClassId = 'light_ga';
    msn.lastOfpCheck = {
      verdict: 'pass',
      summary: 'ok',
      checkedAtIso: new Date().toISOString(),
      findings: [],
      briefing: { blockTime: '0:59', airTime: '0:31', distanceNm: 86 },
    };
    assert.equal(resolveExpectedRouteMs(msn), 31 * 60_000);
  });

  it('uses OFP block time when air time and distance are missing', () => {
    assert.equal(parseBlockTimeToMs('1:30'), 90 * 60_000);
    const msn = mission('dispatched');
    msn.lastOfpCheck = {
      verdict: 'pass',
      summary: 'ok',
      checkedAtIso: new Date().toISOString(),
      findings: [],
      briefing: { blockTime: '2:00' },
    };
    assert.equal(resolveExpectedRouteMs(msn), 2 * 3_600_000);
  });

  it('rebases expected air time from cruise TAS without dropping the 70% gate basis below 55% OFP', () => {
    const plannedMs = 2 * 60 * 60_000; // padded OFP air
    const distanceNm = 400;
    const fast = rebaseExpectedRouteMsFromCruise({
      plannedExpectedRouteMs: plannedMs,
      distanceNm,
      cruiseSpeedKt: 450,
    });
    assert.ok(fast.estimatedMs != null && fast.estimatedMs < plannedMs);
    assert.equal(fast.changed, true);
    assert.ok(fast.expectedRouteMs < plannedMs);
    assert.ok(fast.expectedRouteMs >= Math.round(plannedMs * 0.55));

    const slow = rebaseExpectedRouteMsFromCruise({
      plannedExpectedRouteMs: plannedMs,
      currentExpectedRouteMs: plannedMs,
      distanceNm,
      cruiseSpeedKt: 200,
    });
    // Slow cruise must not lengthen the settle wait.
    assert.equal(slow.changed, false);
    assert.equal(slow.expectedRouteMs, plannedMs);

    const floor = rebaseExpectedRouteMsFromCruise({
      plannedExpectedRouteMs: plannedMs,
      distanceNm: 100,
      cruiseSpeedKt: 900,
    });
    assert.equal(floor.expectedRouteMs, Math.round(plannedMs * 0.55));
    assert.equal(floor.changed, true);
  });

  it('freezes airborne elapsed after touchdown', () => {
    const plannedMs = 31 * 60_000;
    const airborneAt = 1_000_000;
    const touchdownAt = airborneAt + 20 * 60_000;
    const state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: airborneAt,
      expectedRouteMs: plannedMs,
    });
    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { destCoords: SBRF, nowMs: touchdownAt },
    );
    assert.equal(down.nextState.airborneEndedAtMs, touchdownAt);
    const later = evaluateMinAirborneElapsed({
      airborneAtMs: airborneAt,
      expectedRouteMs: plannedMs,
      nowMs: touchdownAt + 30 * 60_000,
      airborneEndedAtMs: down.nextState.airborneEndedAtMs,
    });
    assert.equal(later.elapsedMs, 20 * 60_000);
  });

  it('uses 50% airborne gate for routes under 100 nm', () => {
    const plannedMs = 40 * 60_000;
    const airborneAt = 1_000_000;
    const shortOk = evaluateMinAirborneElapsed({
      airborneAtMs: airborneAt,
      expectedRouteMs: plannedMs,
      nowMs: airborneAt + 20 * 60_000,
      distanceNm: 80,
    });
    assert.equal(shortOk.ok, true);
    assert.equal(shortOk.ratioRequired, 0.5);
    assert.equal(shortOk.requiredMs, 20 * 60_000);

    const shortBlocked = evaluateMinAirborneElapsed({
      airborneAtMs: airborneAt,
      expectedRouteMs: plannedMs,
      nowMs: airborneAt + 19 * 60_000,
      distanceNm: 80,
    });
    assert.equal(shortBlocked.ok, false);

    const longBlocked = evaluateMinAirborneElapsed({
      airborneAtMs: airborneAt,
      expectedRouteMs: plannedMs,
      nowMs: airborneAt + 20 * 60_000,
      distanceNm: 150,
    });
    assert.equal(longBlocked.ok, false);
    assert.equal(longBlocked.ratioRequired, 0.7);
  });

  it('captures landing FPM from last airborne vertical speed', () => {
    const plannedMs = 3_600_000;
    const nowMs = Date.now();
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: nowMs - plannedMs,
      expectedRouteMs: plannedMs,
      lastAirborneVsFpm: -212.4,
    });
    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: SBRF.lat, lon: SBRF.lon },
        verticalSpeedFpm: 0,
      },
      state,
      { destCoords: SBRF, nowMs },
    );
    assert.equal(down.nextState.landingFpm, -212);
    state = down.nextState;

    // Later taxi sample must not overwrite the captured touchdown rate.
    const taxi = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBRF.lat, lon: SBRF.lon },
        verticalSpeedFpm: 0,
      },
      state,
      { destCoords: SBRF, nowMs },
    );
    assert.equal(taxi.nextState.landingFpm, -212);
    assert.equal(taxi.event.type, 'settle');
  });

  it('clears premature touchdown stamp on go-around climb', () => {
    const nowMs = Date.now();
    const plannedMs = 3_600_000;
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: nowMs - 60_000,
      expectedRouteMs: plannedMs,
    });

    const bounce = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        verticalSpeedFpm: -50,
      },
      state,
      { nowMs },
    );
    assert.ok(typeof bounce.nextState.airborneEndedAtMs === 'number');
    state = bounce.nextState;

    const climbOut = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 700,
      },
      state,
      { nowMs: nowMs + 2_000 },
    );
    assert.equal(climbOut.nextState.airborneEndedAtMs, undefined);
    assert.equal(climbOut.nextState.landingFpm, undefined);
  });

  it('keeps first-contact stamp across a short landing bounce', () => {
    const nowMs = Date.now();
    let state = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: nowMs - 60_000,
      expectedRouteMs: 3_600_000,
      lastAirborneVsFpm: -420,
    });

    const first = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        verticalSpeedFpm: -50,
      },
      state,
      { nowMs },
    );
    assert.equal(first.nextState.landingFpm, -420);
    assert.ok(typeof first.nextState.airborneEndedAtMs === 'number');
    state = first.nextState;

    const hop = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 180,
        aglFt: 12,
      },
      state,
      { nowMs: nowMs + 1_000 },
    );
    assert.equal(hop.nextState.landingFpm, -420);
    assert.equal(hop.nextState.airborneEndedAtMs, first.nextState.airborneEndedAtMs);
    state = hop.nextState;

    const second = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        verticalSpeedFpm: 40,
      },
      state,
      { nowMs: nowMs + 2_000 },
    );
    assert.equal(second.nextState.landingFpm, -420);
    assert.equal(
      second.nextState.airborneEndedAtMs,
      first.nextState.airborneEndedAtMs,
    );
  });

  it('does not clear first-contact on a ~3 m bounce hop', () => {
    const nowMs = Date.now();
    const hop = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 350,
        aglFt: 18,
      },
      createMissionFlightWatchState({
        sawAirborne: true,
        lastOnGround: true,
        airborneAtMs: nowMs - 60_000,
        airborneEndedAtMs: nowMs,
        expectedRouteMs: 3_600_000,
        landingFpm: -500,
        lastAirborneVsFpm: -500,
      }),
      { nowMs: nowMs + 500 },
    );
    assert.equal(hop.nextState.landingFpm, -500);
    assert.equal(hop.nextState.airborneEndedAtMs, nowMs);
  });
});

describe('pickActiveMission', () => {
  it('picks by id or last active', () => {
    const a = mission('settled');
    a.id = 'a';
    const b = mission('dispatched');
    b.id = 'b';
    const c = mission('in_flight');
    c.id = 'c';
    assert.equal(pickActiveMission([a, b, c], 'b')?.id, 'b');
    assert.equal(pickActiveMission([a, b, c])?.id, 'c');
  });
});

describe('flightPhaseFromSample', () => {
  it('reports taxi when moving on ground with engines', () => {
    assert.equal(
      flightPhaseFromSample({
        onGround: true,
        enginesRunning: true,
        groundSpeedKt: 12,
      }),
      'taxi',
    );
    assert.equal(
      flightPhaseFromSample({
        onGround: true,
        enginesRunning: true,
        groundSpeedKt: 2,
      }),
      'ground+engines',
    );
    assert.equal(
      flightPhaseFromSample({ onGround: false, enginesRunning: true }),
      'airborne',
    );
  });

  it('keeps taxi sticky across brief ground-speed dips', () => {
    assert.equal(
      flightPhaseFromSample(
        {
          onGround: true,
          enginesRunning: true,
          groundSpeedKt: 3,
        },
        'taxi',
      ),
      'taxi',
    );
    assert.equal(
      flightPhaseFromSample(
        {
          onGround: true,
          enginesRunning: true,
          groundSpeedKt: 1,
        },
        'taxi',
      ),
      'ground+engines',
    );
  });

  it('mergeAirborneClockOntoMission only stamps in_flight legs', () => {
    assert.equal(
      mergeAirborneClockOntoMission(mission('dispatched'), {
        airborneAtMs: 1_000_000,
        airborneElapsedMs: 120_000,
        expectedRouteMs: 3_600_000,
      }),
      null,
    );

    const stamped = mergeAirborneClockOntoMission(mission('in_flight'), {
      airborneAtMs: 1_000_000,
      airborneElapsedMs: 120_000,
      expectedRouteMs: 3_600_000,
    });
    assert.ok(stamped);
    assert.equal(stamped!.airborneElapsedMs, 120_000);
    assert.equal(stamped!.expectedRouteMs, 3_600_000);

    const advanced = mergeAirborneClockOntoMission(stamped!, {
      airborneAtMs: 2_000_000,
      airborneElapsedMs: 180_000,
      expectedRouteMs: 9_999_999,
    });
    assert.ok(advanced);
    assert.equal(advanced!.airborneElapsedMs, 180_000);
    assert.equal(advanced!.expectedRouteMs, 3_600_000);

    // Cruise rebase may tighten a padded OFP plan (shorter wins).
    const tightened = mergeAirborneClockOntoMission(advanced!, {
      airborneElapsedMs: 180_000,
      expectedRouteMs: 2_400_000,
    });
    assert.ok(tightened);
    assert.equal(tightened!.expectedRouteMs, 2_400_000);

    // Smaller elapsed must not rewind progress.
    assert.equal(
      mergeAirborneClockOntoMission(tightened!, {
        airborneElapsedMs: 90_000,
        expectedRouteMs: 2_400_000,
      }),
      null,
    );
  });

  it('resumeAirborneAtMs skips offline gap using saved elapsed', () => {
    const nowMs = 10_000_000;
    const resumed = resumeAirborneAtMs({
      nowMs,
      airborneAtMs: 1_000_000,
      airborneElapsedMs: 120_000,
    });
    assert.equal(resumed, nowMs - 120_000);
    const check = evaluateMinAirborneElapsed({
      airborneAtMs: resumed!,
      expectedRouteMs: 3_600_000,
      nowMs,
    });
    assert.equal(check.elapsedMs, 120_000);
  });
});
