import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAREER_HUB_COORDS,
  createMissionFlightWatchState,
  distanceNm,
  evaluateMissionFlightTransition,
  isNearAirport,
  pickActiveMission,
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
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true, position: { lat: -10, lon: -45 } },
      state,
      { destCoords: SBRF },
    ).nextState;

    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { destCoords: SBRF },
    );
    assert.equal(down.event.type, 'settle');
  });

  it('blocks settle when landed far from destination', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
      { destCoords: SBRF },
    ).nextState;

    const wrongAirport = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: SBPA.lat, lon: SBPA.lon },
      },
      state,
      { destCoords: SBRF },
    );
    assert.equal(wrongAirport.event.type, 'settle_blocked');
    if (wrongAirport.event.type === 'settle_blocked') {
      assert.ok((wrongAirport.event.distanceNm ?? 0) > 100);
    }
  });

  it('blocks settle when position is missing', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
      { destCoords: SBRF },
    ).nextState;

    const noPos = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: true, enginesRunning: false },
      state,
      { destCoords: SBRF },
    );
    assert.equal(noPos.event.type, 'settle_blocked');
  });

  it('waits for engines off after touchdown by default', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
      { destCoords: SBRF },
    ).nextState;

    const taxi = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { destCoords: SBRF },
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
      { destCoords: SBRF },
    );
    assert.equal(shutdown.event.type, 'settle');
  });

  it('can settle on touchdown without engines when near dest', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
      { destCoords: SBRF },
    ).nextState;

    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: SBRF.lat, lon: SBRF.lon },
      },
      state,
      { requireEnginesOffToSettle: false, destCoords: SBRF },
    );
    assert.equal(down.event.type, 'settle');
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
