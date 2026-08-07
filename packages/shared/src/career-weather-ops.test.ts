import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createWeatherOpsAccumulator,
  finalizeWeatherOpsScore,
  headwindFactorScore,
  headwindKtFromWind,
  precipFactorScore,
  pushWeatherOpsTick,
  visibilityFactorScore,
  weatherOpsBonusFrac,
  weatherOpsTickScore,
} from './career-weather-ops.js';

describe('career-weather-ops', () => {
  it('computes headwind into the nose', () => {
    // Wind from north, heading north → full headwind
    assert.ok(Math.abs(headwindKtFromWind(20, 0, 0) - 20) < 0.01);
    // Wind from north, heading south → tailwind → 0
    assert.equal(headwindKtFromWind(20, 0, 180), 0);
    // Crosswind 90° → ~0
    assert.ok(headwindKtFromWind(20, 0, 90) < 0.01);
  });

  it('maps factor curves', () => {
    assert.equal(headwindFactorScore(0), 0);
    assert.equal(headwindFactorScore(25), 70);
    assert.equal(headwindFactorScore(50), 70);
    assert.equal(precipFactorScore(0), 0);
    assert.equal(precipFactorScore(0.5), 10);
    assert.equal(precipFactorScore(2), 18);
    assert.equal(precipFactorScore(8), 25);
    assert.equal(visibilityFactorScore(12_000), 0);
    assert.equal(visibilityFactorScore(1_500), 80);
    assert.ok(visibilityFactorScore(3_000) > 50);
    assert.ok(visibilityFactorScore(5_000) >= 34 && visibilityFactorScore(5_000) <= 36);
  });

  it('weights visibility higher on approach', () => {
    const base = {
      atMs: 1_000,
      onGround: false,
      windKt: 5,
      windFromDeg: 0,
      headingTrueDeg: 0,
      precipMm: 0,
      visibilityM: 1_500,
    };
    const enroute = weatherOpsTickScore({ ...base, phase: 'cruise' })!;
    const approach = weatherOpsTickScore({ ...base, phase: 'approach' })!;
    assert.ok(approach.score > enroute.score);
  });

  it('accumulates and gates eligibility / bonus tiers', () => {
    let acc = createWeatherOpsAccumulator();
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) {
      acc = pushWeatherOpsTick(acc, {
        atMs: t0 + i * 5_000,
        onGround: false,
        phase: i >= 8 ? 'approach' : 'cruise',
        windKt: 20,
        windFromDeg: 0,
        headingTrueDeg: 0,
        precipMm: 2,
        visibilityM: 2_500,
      });
    }
    // Only ~45s airborne — not eligible yet
    const early = finalizeWeatherOpsScore(acc, { expectedRouteMs: 3_600_000 });
    assert.equal(early.eligible, false);
    assert.equal(weatherOpsBonusFrac(early.avgScore, early.eligible), 0);

    // Stretch time by continuing with large gaps
    for (let i = 0; i < 20; i++) {
      acc = pushWeatherOpsTick(acc, {
        atMs: t0 + 60_000 + i * 20_000,
        onGround: false,
        phase: 'approach',
        windKt: 22,
        windFromDeg: 0,
        headingTrueDeg: 0,
        precipMm: 3,
        visibilityM: 2_000,
      });
    }
    const late = finalizeWeatherOpsScore(acc, { expectedRouteMs: 3_600_000 });
    assert.equal(late.eligible, true);
    assert.ok(late.avgScore >= 25);
    assert.ok(late.bonusFrac >= 0.05);
    assert.ok(late.approachSampleCount > 0);
    assert.ok(late.minApproachVisM != null && late.minApproachVisM <= 2500);
  });

  it('bonus tiers', () => {
    assert.equal(weatherOpsBonusFrac(10, true), 0);
    assert.equal(weatherOpsBonusFrac(30, true), 0.05);
    assert.equal(weatherOpsBonusFrac(60, true), 0.1);
    assert.equal(weatherOpsBonusFrac(80, true), 0.15);
    assert.equal(weatherOpsBonusFrac(80, false), 0);
  });

  it('skips ticks with no wind and no visibility', () => {
    let acc = createWeatherOpsAccumulator();
    acc = pushWeatherOpsTick(acc, {
      atMs: 1,
      onGround: false,
      precipMm: 5,
    });
    assert.equal(acc.sampleCount, 0);
  });
});
