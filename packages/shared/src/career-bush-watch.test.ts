import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptBushTrip,
  createMissionFlightWatchState,
  departBushTripLeg,
  evaluateBushTripLegTransition,
  isBushTripActive,
  settleBushTripLeg,
} from './career-bush-mission.js';
import { CAREER_HUB_COORDS } from './career-economy.js';
import {
  emptyMissionsStateV2,
  selectStarterHub,
} from './career-fleet.js';
import { listStarterCareerPlayerAirframes } from './career-player-airframes.js';

function startBrTrip() {
  const starter = listStarterCareerPlayerAirframes()[0]!;
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBEG', {
    pilotName: 'Bush Watch',
    airframeTypeId: starter.typeId,
  });
  const accepted = acceptBushTrip(state, {
    tripId: 'br-rio-negro-tapuruquara',
    aircraftId: state.fleet[0]!.id,
    tick: 1,
  });
  return { state, active: accepted.active };
}

describe('bush trip leg progress', () => {
  it('depart marks leg departed and trip in_progress', () => {
    const { state } = startBrTrip();
    const before = state.walletUsd;
    const departed = departBushTripLeg(state, { nowMs: 1_000 });
    assert.equal(departed.active.legStatus, 'departed');
    assert.equal(departed.active.status, 'in_progress');
    assert.equal(departed.active.departedAtMs, 1_000);
    assert.equal(state.walletUsd, before);
    assert.ok(isBushTripActive(state));
  });

  it('settle mid-trip advances legIndex and parks at dest hub', () => {
    const { state } = startBrTrip();
    departBushTripLeg(state, { nowMs: 1_000 });
    const mid = settleBushTripLeg(state, { tick: 5 });
    assert.equal(mid.completed, false);
    assert.equal(mid.active.legIndex, 1);
    assert.equal(mid.active.legStatus, 'ready');
    assert.equal(state.fleet[0]!.locationIcao, 'SWTP');
    assert.equal(mid.payoutUsd, 0);
  });

  it('settle last leg pays out and completes', () => {
    const { state } = startBrTrip();
    departBushTripLeg(state, { nowMs: 1_000 });
    settleBushTripLeg(state, { tick: 5 });
    departBushTripLeg(state, { nowMs: 2_000 });
    const walletBefore = state.walletUsd;
    const done = settleBushTripLeg(state, { tick: 10 });
    assert.equal(done.completed, true);
    assert.equal(done.active.status, 'completed');
    assert.ok(done.payoutUsd > 0);
    assert.equal(state.walletUsd, walletBefore + done.payoutUsd);
    assert.equal(state.fleet[0]!.status, 'parked');
    assert.equal(state.fleet[0]!.locationIcao, 'SBEG');
    assert.equal(isBushTripActive(state), undefined);
  });
});

describe('evaluateBushTripLegTransition', () => {
  it('fires depart on wheels-up when leg is ready', () => {
    const { active } = startBrTrip();
    let watch = createMissionFlightWatchState();
    const ground = evaluateBushTripLegTransition(
      active,
      { onGround: true, enginesRunning: true, groundSpeedKt: 0 },
      watch,
      { nowMs: 1_000 },
    );
    watch = ground.nextState;
    const air = evaluateBushTripLegTransition(
      { ...active, legStatus: 'ready' },
      {
        onGround: false,
        enginesRunning: true,
        groundSpeedKt: 78,
        aglFt: 120,
      },
      watch,
      { nowMs: 1_100 },
    );
    assert.equal(air.event.type, 'depart');
  });

  it('ignores a lone onGround flicker at 0 kt on the ramp', () => {
    const { active } = startBrTrip();
    let watch = createMissionFlightWatchState();
    watch = evaluateBushTripLegTransition(
      active,
      { onGround: true, enginesRunning: true, groundSpeedKt: 0 },
      watch,
      { nowMs: 1_000 },
    ).nextState;
    const blip = evaluateBushTripLegTransition(
      { ...active, legStatus: 'ready' },
      { onGround: false, enginesRunning: true, groundSpeedKt: 0 },
      watch,
      { nowMs: 1_100 },
    );
    assert.equal(blip.event.type, 'none');
    // Sustained airborne without GS/AGL still departs after the confirm ticks.
    const sustained = evaluateBushTripLegTransition(
      { ...active, legStatus: 'ready' },
      { onGround: false, enginesRunning: true, groundSpeedKt: 0 },
      blip.nextState,
      { nowMs: 1_200 },
    );
    assert.equal(sustained.event.type, 'depart');
  });

  it('settles on touchdown near dest with engines still running', () => {
    const { active } = startBrTrip();
    const dest = CAREER_HUB_COORDS.SWTP;
    assert.ok(dest);
    const departed = {
      ...active,
      status: 'in_progress' as const,
      legStatus: 'departed' as const,
      departedAtMs: 0,
    };
    const watch = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: 0,
      expectedRouteMs: 60_000,
      routeDistanceNm: 50,
    });
    const touch = evaluateBushTripLegTransition(
      departed,
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: dest.lat, lon: dest.lon },
      },
      watch,
      { nowMs: 50_000 },
    );
    assert.equal(touch.event.type, 'settle');
  });

  it('still requires engines off when explicitly requested', () => {
    const { active } = startBrTrip();
    const dest = CAREER_HUB_COORDS.SWTP;
    assert.ok(dest);
    const departed = {
      ...active,
      status: 'in_progress' as const,
      legStatus: 'departed' as const,
      departedAtMs: 0,
    };
    const watch = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: 0,
      expectedRouteMs: 60_000,
      routeDistanceNm: 50,
    });
    const waiting = evaluateBushTripLegTransition(
      departed,
      {
        onGround: true,
        enginesRunning: true,
        position: { lat: dest.lat, lon: dest.lon },
      },
      watch,
      { nowMs: 50_000, requireEnginesOff: true },
    );
    // Touchdown with engines running: wait for shutdown (not settle yet).
    assert.equal(waiting.event.type, 'none');
    const touch = evaluateBushTripLegTransition(
      departed,
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: dest.lat, lon: dest.lon },
      },
      waiting.nextState,
      { nowMs: 50_000, requireEnginesOff: true },
    );
    assert.equal(touch.event.type, 'settle');
  });

  it('blocks settle when far from dest hub', () => {
    const { active } = startBrTrip();
    const departed = {
      ...active,
      status: 'in_progress' as const,
      legStatus: 'departed' as const,
      departedAtMs: 0,
    };
    const watch = createMissionFlightWatchState({
      sawAirborne: true,
      lastOnGround: false,
      airborneAtMs: 0,
      expectedRouteMs: 60_000,
      routeDistanceNm: 50,
    });
    const far = evaluateBushTripLegTransition(
      departed,
      {
        onGround: true,
        enginesRunning: false,
        position: { lat: 0, lon: 0 },
      },
      watch,
      { nowMs: 50_000 },
    );
    assert.equal(far.event.type, 'settle_blocked');
  });
});
