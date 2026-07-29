import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createMissionFlightWatchState,
  evaluateMissionFlightTransition,
  pickActiveMission,
  type MissionIntent,
} from './index.js';

function mission(status: MissionIntent['status']): MissionIntent {
  return {
    id: 'msn_watch',
    shipmentLotId: 'lot_1',
    commodityId: 'general',
    originIcao: 'KMIA',
    destIcao: 'SBBR',
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

describe('evaluateMissionFlightTransition', () => {
  it('does not fire on first sample (bootstrap)', () => {
    let state = createMissionFlightWatchState();
    const first = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: true, enginesRunning: true },
      state,
    );
    assert.equal(first.event.type, 'none');
    state = first.nextState;

    const stillGround = evaluateMissionFlightTransition(
      mission('dispatched'),
      { onGround: true, enginesRunning: true },
      state,
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

  it('settles on touchdown after airborne when engines off', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
    ).nextState;
    assert.equal(state.sawAirborne, true);

    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: true, enginesRunning: false },
      state,
    );
    assert.equal(down.event.type, 'settle');
  });

  it('waits for engines off after touchdown by default', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
    ).nextState;

    const taxi = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: true, enginesRunning: true },
      state,
    );
    assert.equal(taxi.event.type, 'none');
    state = taxi.nextState;

    const shutdown = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: true, enginesRunning: false },
      state,
    );
    assert.equal(shutdown.event.type, 'settle');
    if (shutdown.event.type === 'settle') {
      assert.match(shutdown.event.reason, /engines off/i);
    }
  });

  it('can settle on touchdown without waiting for engines when configured', () => {
    let state = createMissionFlightWatchState();
    state = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: false, enginesRunning: true },
      state,
    ).nextState;

    const down = evaluateMissionFlightTransition(
      mission('in_flight'),
      { onGround: true, enginesRunning: true },
      state,
      { requireEnginesOffToSettle: false },
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
