import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFlightScoreAccumulator,
  clearFlightScoreLanding,
  finalizeFlightScore,
  patchFlightScoreLandingVs,
  pushFlightScoreSample,
  scoreLandingGPoints,
  scoreLandingVsPoints,
} from './career-flight-score.js';

describe('scoreLandingVsPoints', () => {
  it('awards full points for soft landings', () => {
    assert.equal(scoreLandingVsPoints(-120, 12), 12);
    assert.equal(scoreLandingVsPoints(-200, 12), 12);
  });

  it('drops toward zero for hard landings', () => {
    assert.ok(scoreLandingVsPoints(-400, 12) < 12);
    assert.equal(scoreLandingVsPoints(-800, 12), 0);
  });
});

describe('scoreLandingGPoints', () => {
  it('scores near 1 G highest', () => {
    assert.equal(scoreLandingGPoints(1.05, 10), 10);
    assert.ok(scoreLandingGPoints(1.8, 10) < 5);
  });
});

describe('pushFlightScoreSample + finalizeFlightScore', () => {
  it('tracks envelope peaks and taxi speeds', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: false,
      postTouchdown: false,
      groundSpeedKt: 22,
      bankDeg: 10,
      pitchDeg: 5,
      gForce: 1.1,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: false,
      sawAirborne: true,
      postTouchdown: false,
      bankDeg: -40,
      pitchDeg: -10,
      gForce: 1.4,
      overspeedWarning: true,
      indicatedAirspeedKt: 260,
      altitudeFt: 8000,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      groundSpeedKt: 35,
      landingVsFpm: -210,
      gForce: 1.15,
      gearDown: true,
      flapsPct: 30,
    });

    const score = finalizeFlightScore(acc);
    assert.ok(score.max > 0);
    assert.ok(score.pct >= 0 && score.pct <= 100);
    const bank = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'bank');
    assert.equal(bank?.points, 0);
    const overspeed = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'overspeed');
    assert.equal(overspeed?.points, 0);
    const landingVs = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_vs');
    assert.ok((landingVs?.points ?? 0) > 0);
    const depTaxi = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'dep_taxi');
    assert.equal(depTaxi?.points, 1);
  });

  it('counts a bounce after first touchdown', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -150,
      gForce: 1.1,
      gearDown: true,
      flapsPct: 20,
      aglFt: 8,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: false,
      sawAirborne: true,
      postTouchdown: true,
      aglFt: 20,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      aglFt: 8,
    });
    assert.equal(acc.bounceCount, 1);
    // First-contact VS must stay locked across the bounce.
    assert.equal(acc.landing?.vsFpm, -150);
  });

  it('counts a bounce when SIM ON GROUND stays sticky but AGL lifts', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -220,
      gForce: 1.2,
      gearDown: true,
      flapsPct: 25,
      aglFt: 7,
    });
    // Sticky SIM ON GROUND — only radio alt shows the hop.
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      aglFt: 10,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      aglFt: 7,
      gForce: 1.5,
    });
    assert.equal(acc.bounceCount, 1);
    assert.equal(acc.touchdownAglFt, 7);
  });

  it('counts multiple bounces while postTouchdown stays sticky', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -400,
      gForce: 1.6,
      gearDown: true,
      flapsPct: 25,
    });
    for (let i = 0; i < 2; i++) {
      acc = pushFlightScoreSample(acc, {
        onGround: false,
        sawAirborne: true,
        postTouchdown: true,
      });
      acc = pushFlightScoreSample(acc, {
        onGround: true,
        sawAirborne: true,
        postTouchdown: true,
        landingVsFpm: -100,
        gForce: 1.1,
      });
    }
    assert.equal(acc.bounceCount, 2);
    assert.equal(acc.landing?.vsFpm, -400);
  });

  it('auto-passes landing gear for fixed-gear aircraft', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -180,
      gForce: 1.1,
      gearDown: false,
      gearRetractable: false,
      flapsPct: 25,
    });
    const score = finalizeFlightScore(acc);
    const gear = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_gear');
    assert.equal(gear?.points, 1);
    assert.equal(gear?.detail, 'fixed gear');
  });

  it('auto-passes landing gear when retractable flag is unknown', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -180,
      gForce: 1.1,
      flapsPct: 20,
    });
    const score = finalizeFlightScore(acc);
    const gear = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_gear');
    assert.equal(gear?.points, 1);
    assert.equal(gear?.detail, 'n/a');
  });

  it('ignores takeoff-roll ground speed when scoring departure taxi', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: false,
      postTouchdown: false,
      phase: 'taxi_out',
      groundSpeedKt: 28,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: false,
      postTouchdown: false,
      phase: 'takeoff',
      groundSpeedKt: 92,
    });
    assert.equal(acc.maxDepTaxiGsKt, 28);
  });

  it('awards flaps and gear when percent is in 0–100 points', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -120,
      gForce: 1.05,
      gearDown: true,
      gearRetractable: true,
      flapsPct: 33,
    });
    const score = finalizeFlightScore(acc);
    const flaps = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_flaps');
    const gear = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_gear');
    assert.equal(flaps?.points, 1);
    assert.equal(flaps?.detail, '33%');
    assert.equal(gear?.points, 1);
    assert.equal(gear?.detail, 'down');
  });

  it('clears a premature landing stamp so a later touchdown can re-score', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -750,
      gForce: 1.4,
      gearDown: false,
      gearRetractable: true,
      flapsPct: 0,
    });
    assert.ok(acc.landing);
    acc = clearFlightScoreLanding(acc);
    assert.equal(acc.landing, undefined);
    assert.equal(acc.bounceCount, 0);

    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -180,
      gForce: 1.05,
      gearDown: true,
      gearRetractable: true,
      flapsPct: 25,
    });
    const score = finalizeFlightScore(acc);
    const landingVs = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_vs');
    const gear = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_gear');
    assert.ok((landingVs?.points ?? 0) > 0);
    assert.match(landingVs?.detail ?? '', /-180/);
    assert.equal(gear?.points, 1);
  });

  it('prefers settle override VS over a stale accumulator stamp', () => {
    let acc = createFlightScoreAccumulator();
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
      landingVsFpm: -758,
      gForce: 1.0,
      gearDown: true,
      flapsPct: 20,
    });
    acc = patchFlightScoreLandingVs(acc, 81);
    const score = finalizeFlightScore(acc, { landingVsFpm: 81 });
    const landingVs = score.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.id === 'landing_vs');
    assert.equal(landingVs?.points, 12);
    assert.match(landingVs?.detail ?? '', /\+81/);
  });
});
