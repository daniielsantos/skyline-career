import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advanceFlightPhase,
  formatFlightPhaseLabel,
  watchIntervalMsForPhase,
  type CareerFlightPhase,
  type FlightPhaseSample,
} from './career-flight-phase.js';

function sample(
  partial: Partial<FlightPhaseSample> &
    Pick<FlightPhaseSample, 'onGround' | 'enginesRunning' | 'sawAirborne' | 'postTouchdown'>,
): FlightPhaseSample {
  return { ...partial };
}

describe('advanceFlightPhase', () => {
  it('walks a full departure → arrival path', () => {
    let phase: CareerFlightPhase | null = null;
    const t0 = 1_000_000;

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: true,
        enginesRunning: false,
        sawAirborne: false,
        postTouchdown: false,
      }),
      { nowMs: t0 },
    );
    assert.equal(phase, 'ground');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: true,
        enginesRunning: true,
        groundSpeedKt: 12,
        sawAirborne: false,
        postTouchdown: false,
      }),
      { nowMs: t0 + 1_000 },
    );
    assert.equal(phase, 'taxi_out');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: true,
        enginesRunning: true,
        groundSpeedKt: 70,
        sawAirborne: false,
        postTouchdown: false,
      }),
      { nowMs: t0 + 2_000 },
    );
    assert.equal(phase, 'takeoff');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 800,
        aglFt: 400,
        distanceToDestNm: 120,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 5_000, airborneAtMs: t0 + 3_000 },
    );
    assert.equal(phase, 'takeoff');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 900,
        aglFt: 2_500,
        distanceToDestNm: 110,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 90_000, airborneAtMs: t0 + 3_000 },
    );
    assert.equal(phase, 'climb');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 50,
        aglFt: 8_000,
        distanceToDestNm: 80,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 200_000, airborneAtMs: t0 + 3_000 },
    );
    assert.equal(phase, 'cruise');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: -600,
        aglFt: 6_000,
        distanceToDestNm: 40,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 400_000, airborneAtMs: t0 + 3_000 },
    );
    assert.equal(phase, 'descent');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: -500,
        aglFt: 2_000,
        distanceToDestNm: 10,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 500_000, airborneAtMs: t0 + 3_000 },
    );
    assert.equal(phase, 'approach');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: -400,
        aglFt: 300,
        distanceToDestNm: 1.5,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 560_000, airborneAtMs: t0 + 3_000 },
    );
    assert.equal(phase, 'landing');

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: true,
        enginesRunning: true,
        groundSpeedKt: 40,
        sawAirborne: true,
        postTouchdown: true,
      }),
      { nowMs: t0 + 570_000, airborneAtMs: t0 + 3_000, touchdownAtMs: t0 + 565_000 },
    );
    assert.equal(phase, 'landing'); // hold briefly

    phase = advanceFlightPhase(
      phase,
      sample({
        onGround: true,
        enginesRunning: true,
        groundSpeedKt: 18,
        sawAirborne: true,
        postTouchdown: true,
      }),
      { nowMs: t0 + 580_000, airborneAtMs: t0 + 3_000, touchdownAtMs: t0 + 565_000 },
    );
    assert.equal(phase, 'taxi_in');
  });

  it('keeps climb sticky through mild VS dips', () => {
    const climbed = advanceFlightPhase(
      'climb',
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 250,
        distanceToDestNm: 50,
        sawAirborne: true,
        postTouchdown: false,
      }),
    );
    assert.equal(climbed, 'climb');
  });

  it('does not skip climb when leaving takeoff with soft VS', () => {
    const t0 = 2_000_000;
    const airborneAtMs = t0;
    // Takeoff window expired, soft VS — previously jumped to cruise.
    const phase = advanceFlightPhase(
      'takeoff',
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 80,
        aglFt: 1_800,
        distanceToDestNm: 90,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 70_000, airborneAtMs },
    );
    assert.equal(phase, 'climb');
  });

  it('holds climb after takeoff until min time or AGL release', () => {
    const t0 = 3_000_000;
    const airborneAtMs = t0;
    const stillLow = advanceFlightPhase(
      'climb',
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 40,
        aglFt: 1_200,
        distanceToDestNm: 85,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 30_000, airborneAtMs },
    );
    assert.equal(stillLow, 'climb');

    const released = advanceFlightPhase(
      'climb',
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 40,
        aglFt: 4_000,
        distanceToDestNm: 70,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 120_000, airborneAtMs },
    );
    assert.equal(released, 'cruise');
  });

  it('treats bounce (air after touchdown) as landing', () => {
    assert.equal(
      advanceFlightPhase(
        'landing',
        sample({
          onGround: false,
          enginesRunning: true,
          verticalSpeedFpm: -200,
          aglFt: 80,
          sawAirborne: true,
          postTouchdown: true,
        }),
      ),
      'landing',
    );
  });

  it('does not mark landing on short-hop rotate with low AGL near dest', () => {
    const t0 = 4_000_000;
    const phase = advanceFlightPhase(
      'takeoff',
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 700,
        aglFt: 300,
        distanceToDestNm: 12,
        sawAirborne: true,
        postTouchdown: false,
      }),
      { nowMs: t0 + 5_000, airborneAtMs: t0 },
    );
    assert.equal(phase, 'takeoff');
  });

  it('leaves false landing while climbing after premature touchdown', () => {
    const t0 = 5_000_000;
    const phase = advanceFlightPhase(
      'landing',
      sample({
        onGround: false,
        enginesRunning: true,
        verticalSpeedFpm: 800,
        aglFt: 900,
        distanceToDestNm: 10,
        sawAirborne: true,
        postTouchdown: true,
      }),
      { nowMs: t0 + 20_000, airborneAtMs: t0, touchdownAtMs: t0 + 8_000 },
    );
    assert.ok(phase === 'climb' || phase === 'takeoff');
    assert.notEqual(phase, 'landing');
  });
});

describe('watchIntervalMsForPhase', () => {
  it('polls landing/takeoff fast and cruise at cap', () => {
    assert.equal(watchIntervalMsForPhase('landing'), 200);
    assert.equal(watchIntervalMsForPhase('takeoff'), 200);
    assert.equal(watchIntervalMsForPhase('approach'), 500);
    assert.equal(watchIntervalMsForPhase('cruise', { cruiseCapMs: 5_000 }), 5_000);
    assert.equal(watchIntervalMsForPhase('cruise', { cruiseCapMs: 4_000 }), 4_000);
    assert.equal(watchIntervalMsForPhase('taxi_out'), 2_000);
    assert.equal(watchIntervalMsForPhase('ground'), 2_000);
  });
});

describe('formatFlightPhaseLabel', () => {
  it('labels known phases', () => {
    assert.equal(formatFlightPhaseLabel('approach'), 'Approach');
    assert.equal(formatFlightPhaseLabel('taxi'), 'Taxi');
  });
});
