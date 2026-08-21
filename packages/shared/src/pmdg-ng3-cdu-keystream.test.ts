/**
 * Unit tests for shared PMDG NG3 CDU keystream builders (career inject + CLI).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bcfFuelInjectOptions,
  bcfZfwInjectOptions,
  buildBcfFuelKeySequence,
  buildBcfZfwKeySequence,
  computePmdgCduZfwTargetLb,
  floorPmdgCduZfwToEmpty,
  fuelLbToDisplay,
  resolvePmdgLiveCargoLb,
} from './pmdg-ng3-cdu-keystream.js';

describe('pmdg-ng3-cdu-keystream (shared)', () => {
  it('buildBcfFuelKeySequence TOTAL uses L1 and FO defaults', () => {
    const opts = bcfFuelInjectOptions('16.8');
    const steps = buildBcfFuelKeySequence(opts);
    assert.equal(opts.cdu, 'right');
    assert.equal(opts.totalLsk, 'L1');
    assert.ok(steps.some((s) => s.key === 'MENU'));
    assert.ok(steps.some((s) => s.label.includes('TOTAL=16.8')));
    assert.equal(fuelLbToDisplay(16800), '16.8');
  });

  it('buildBcfZfwKeySequence flushes scratchpad with paced event CLR taps (no hold)', () => {
    const opts = bcfZfwInjectOptions('89.3');
    const steps = buildBcfZfwKeySequence(opts);
    assert.equal(opts.scratchpadClearHoldMs, 0);
    assert.equal(opts.scratchpadClearTaps, 10);
    const flush = steps.filter((s) => s.label.includes('flush'));
    assert.equal(flush.length, 10);
    assert.equal(flush[0]?.method, 'event');
    assert.equal(flush[0]?.parameter, 0);
    assert.equal(flush[0]?.release, true);
    assert.equal(flush[0]?.holdMs, 80);
    assert.equal(flush[0]?.delayAfterMs, 150);
    assert.equal(flush[9]?.delayAfterMs, 350);
    assert.equal(steps[10]?.key, 'MENU');
    assert.ok(steps.some((s) => s.key === 'R2'));
  });

  it('buildBcfZfwKeySequence can skip initial scratchpad flush after fuel', () => {
    const opts = bcfZfwInjectOptions('89.3', { skipScratchpadClear: true });
    const steps = buildBcfZfwKeySequence(opts);
    assert.equal(opts.skipScratchpadClear, true);
    assert.equal(opts.scratchpadClearTaps, 0);
    assert.equal(opts.fieldClrCount, 0);
    assert.equal(
      steps.filter((s) => s.key === 'CLR').length,
      0,
    );
    assert.equal(steps[0]?.key, 'MENU');
    assert.ok(steps.some((s) => s.key === 'R2'));
  });

  it('buildBcfFuelKeySequence flush CLR taps use event method', () => {
    const opts = bcfFuelInjectOptions('16.8');
    const steps = buildBcfFuelKeySequence(opts);
    const flush = steps.filter((s) => s.label.includes('flush'));
    assert.ok(flush.length >= 10);
    assert.equal(flush[0]?.method, 'event');
    assert.equal(flush[0]?.key, 'CLR');
  });

  it('computePmdgCduZfwTargetLb replaces live cargo with OFP cargo', () => {
    assert.equal(
      computePmdgCduZfwTargetLb({
        liveZfwLb: 115_700,
        liveCargoLb: 28_325,
        requestedCargoLb: 29_694,
      }),
      117_069,
    );
  });

  it('resolvePmdgLiveCargoLb ignores ghost stations when CDU ZFW is near empty', () => {
    const ghost = resolvePmdgLiveCargoLb({
      liveZfwLb: 87_400,
      emptyLb: 87_400,
      stationCargoLb: 70_300,
    });
    assert.equal(ghost.liveCargoLb, 0);
    assert.ok(ghost.source === 'zfw-residual' || ghost.source === 'zfw-assume-empty');
    // Ghost stations previously produced 17.1 display (87400 - 70300 + 0).
    assert.equal(
      computePmdgCduZfwTargetLb({
        liveZfwLb: 87_400,
        liveCargoLb: ghost.liveCargoLb,
        requestedCargoLb: 4_130,
      }),
      91_530,
    );
  });

  it('resolvePmdgLiveCargoLb residual excludes crew/galley fixed weight', () => {
    const r = resolvePmdgLiveCargoLb({
      liveZfwLb: 110_000,
      emptyLb: 87_400,
      stationCargoLb: 50_000, // ghost vs residual
      fixedNonCargoLb: 380 + 1_495,
    });
    assert.equal(r.source, 'zfw-residual');
    // 110000 - 87400 - 1875 = 20725 (not 22600)
    assert.equal(r.liveCargoLb, 20_725);
  });

  it('floorPmdgCduZfwToEmpty lifts Dual Class OFP below BBJ2 empty', () => {
    const r = floorPmdgCduZfwToEmpty({
      ofpZfwLb: 101_993,
      emptyLb: 102_200,
      requestedCargoLb: 8_818,
    });
    assert.equal(r.floored, true);
    assert.equal(r.zfwLb, 111_018);
    assert.equal(
      floorPmdgCduZfwToEmpty({
        ofpZfwLb: 110_000,
        emptyLb: 102_200,
        requestedCargoLb: 8_818,
      }).floored,
      false,
    );
  });
});
