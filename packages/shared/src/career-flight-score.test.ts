import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFlightScoreAccumulator,
  finalizeFlightScore,
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
    });
    acc = pushFlightScoreSample(acc, {
      onGround: false,
      sawAirborne: true,
      postTouchdown: true,
    });
    acc = pushFlightScoreSample(acc, {
      onGround: true,
      sawAirborne: true,
      postTouchdown: true,
    });
    assert.equal(acc.bounceCount, 1);
  });
});
