import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CRASH_DEAD_TICKS,
  emptyCrashDetectState,
  stepCrashDetect,
  type CrashSample,
} from './career-flight-crash.js';

function base(over: Partial<CrashSample> & { atMs: number }): CrashSample {
  return {
    onGround: false,
    sawAirborne: true,
    groundSpeedKt: 180,
    verticalSpeedFpm: -200,
    aglFt: 8000,
    gForce: 1.05,
    frozen: false,
    lat: -23.4,
    lon: -46.4,
    ...over,
  };
}

describe('stepCrashDetect', () => {
  it('does not fire on hard landing near destination', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: true, simAlive: true };
    // Build prior AGL/GS then slam near dest.
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 400, groundSpeedKt: 120, gForce: 1.1 }),
      ctx,
    );
    state = step.state;
    step = stepCrashDetect(
      state,
      base({
        atMs: 1400,
        onGround: true,
        aglFt: 5,
        groundSpeedKt: 40,
        gForce: 2.4,
        verticalSpeedFpm: -600,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
    for (let i = 0; i < CRASH_DEAD_TICKS + 2; i++) {
      step = stepCrashDetect(
        step.state,
        base({
          atMs: 1800 + i * 200,
          onGround: true,
          aglFt: 2,
          groundSpeedKt: 2,
          gForce: 1.0,
          verticalSpeedFpm: 0,
        }),
        ctx,
      );
      assert.equal(step.verdict, null);
    }
  });

  it('fires high confidence on mid-route AGL slam + GS collapse + dead', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 2500, groundSpeedKt: 160, gForce: 1.0 }),
      ctx,
    );
    state = step.state;
    // Slam: AGL + GS collapse (+ optional G).
    step = stepCrashDetect(
      state,
      base({
        atMs: 1400,
        aglFt: 8,
        groundSpeedKt: 3,
        gForce: 5.2,
        verticalSpeedFpm: -5200,
        onGround: true,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
    assert.ok(step.boostPoll);
    state = step.state;
    let verdict = null;
    for (let i = 0; i < CRASH_DEAD_TICKS + 2; i++) {
      step = stepCrashDetect(
        state,
        base({
          atMs: 1800 + i * 200,
          onGround: true,
          aglFt: 4,
          groundSpeedKt: 1,
          gForce: 1.0,
          verticalSpeedFpm: 0,
        }),
        ctx,
      );
      state = step.state;
      if (step.verdict) {
        verdict = step.verdict;
        break;
      }
    }
    assert.ok(verdict);
    assert.equal(verdict!.confidence, 'high');
    assert.ok(verdict!.reasonBits.length >= 2);
  });

  it('ignores slew jumps', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, lat: -23.4, lon: -46.4, aglFt: 3000 }),
      ctx,
    );
    state = step.state;
    step = stepCrashDetect(
      state,
      base({
        atMs: 1400,
        lat: -22.0,
        lon: -45.0,
        aglFt: 5,
        groundSpeedKt: 0,
        gForce: 6,
        onGround: true,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
    assert.equal(step.state.episodeAtMs, null);
  });

  it('fires when a fast flight stops on the ground under sticky pause', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 600, groundSpeedKt: 220, gForce: 1.1 }),
      ctx,
    );
    state = step.state;
    let verdict = null;
    for (let i = 0; i < CRASH_DEAD_TICKS + 1; i++) {
      step = stepCrashDetect(
        state,
        base({
          atMs: 1600 + i * 500,
          frozen: true,
          motionStopped: true,
          onGround: true,
          aglFt: 400,
          groundSpeedKt: 289,
          gForce: 1.0,
          verticalSpeedFpm: 0,
        }),
        ctx,
      );
      state = step.state;
      if (step.verdict) {
        verdict = step.verdict;
        break;
      }
    }
    assert.ok(verdict);
    assert.equal(verdict!.confidence, 'high');
    assert.ok(verdict!.reasonBits.includes('gs_collapse'));
    assert.ok(verdict!.reasonBits.includes('agl_slam'));
  });

  it('does not fail an altitude pause with a stuck groundspeed', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 8000, groundSpeedKt: 250 }),
      ctx,
    );
    for (let i = 0; i < 6; i++) {
      step = stepCrashDetect(
        step.state,
        base({
          atMs: 2000 + i * 500,
          frozen: true,
          motionStopped: true,
          aglFt: 8000,
          groundSpeedKt: 250,
          verticalSpeedFpm: 0,
        }),
        ctx,
      );
      assert.equal(step.verdict, null);
    }
  });

  it('fails when the player repositions after a stop-class impact', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 2500, groundSpeedKt: 160, gForce: 1.0 }),
      ctx,
    );
    step = stepCrashDetect(
      step.state,
      base({
        atMs: 1400,
        aglFt: 8,
        groundSpeedKt: 3,
        gForce: 5.2,
        verticalSpeedFpm: -5200,
        onGround: true,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
    step = stepCrashDetect(
      step.state,
      base({
        atMs: 1800,
        lat: -22.0,
        lon: -45.0,
        aglFt: 40,
        groundSpeedKt: 0,
        onGround: true,
      }),
      ctx,
    );
    assert.ok(step.verdict);
    assert.equal(step.verdict!.confidence, 'high');
  });

  it('fails when the menu opens after a stop-class impact', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 900, groundSpeedKt: 180 }),
      ctx,
    );
    step = stepCrashDetect(
      step.state,
      base({
        atMs: 1400,
        aglFt: 6,
        groundSpeedKt: 2,
        gForce: 6,
        verticalSpeedFpm: -6000,
        onGround: true,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
    step = stepCrashDetect(
      step.state,
      base({
        atMs: 1700,
        frozen: true,
        aglFt: 6,
        groundSpeedKt: 2,
        onGround: true,
      }),
      ctx,
    );
    assert.ok(step.verdict);
  });

  it('does not fail a steep maneuver that is paused before any stop', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    let step = stepCrashDetect(
      state,
      base({ atMs: 1000, aglFt: 8000, groundSpeedKt: 220, gForce: 1 }),
      ctx,
    );
    step = stepCrashDetect(
      step.state,
      base({
        atMs: 1400,
        aglFt: 7000,
        groundSpeedKt: 200,
        gForce: 5.4,
        verticalSpeedFpm: -5000,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
    step = stepCrashDetect(
      step.state,
      base({
        atMs: 1800,
        frozen: true,
        aglFt: 7000,
        groundSpeedKt: 200,
        gForce: 1,
        verticalSpeedFpm: 0,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
  });

  it('stays silent while frozen', () => {
    let state = emptyCrashDetectState();
    const ctx = { nearDest: false, simAlive: true };
    const step = stepCrashDetect(
      state,
      base({
        atMs: 1000,
        frozen: true,
        aglFt: 5,
        groundSpeedKt: 0,
        gForce: 6,
        onGround: true,
      }),
      ctx,
    );
    assert.equal(step.verdict, null);
  });
});
