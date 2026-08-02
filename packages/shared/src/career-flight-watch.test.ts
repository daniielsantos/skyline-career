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
  parseBlockTimeToMs,
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
});
