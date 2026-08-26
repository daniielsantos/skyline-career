/**
 * Unit tests for shared PMDG 777 CDU keystream builders.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bcf777FuelInjectOptions,
  bcf777ZfwInjectOptions,
  buildPmdg777FuelKeySequence,
  buildPmdg777ZfwKeySequence,
  fuelLbToDisplay777,
} from './pmdg-777-cdu-keystream.js';

describe('pmdg-777-cdu-keystream (shared)', () => {
  it('buildPmdg777FuelKeySequence uses 8 fast CLR, R6, L1 TOTAL, FO CDU, rotor, whole-lb', () => {
    const opts = bcf777FuelInjectOptions(fuelLbToDisplay777(44190));
    const steps = buildPmdg777FuelKeySequence(opts);
    assert.equal(opts.fsActionsLsk, 'R6');
    assert.equal(opts.totalLsk, 'L1');
    assert.equal(opts.cdu, 'right');
    assert.equal(opts.method, 'rotor');
    assert.equal(opts.scratchpadClearTaps, 8);
    assert.equal(opts.scratchpadClearTapDelayMs, 70);
    assert.equal(opts.totalDisplay, '44190');
    const clr = steps.filter((s) => s.key === 'CLR');
    assert.equal(clr.length, 8);
    assert.equal(clr[0]?.delayAfterMs, 70);
    assert.equal(clr[7]?.delayAfterMs, 250);
    assert.ok(steps.every((s, i) => s.key !== 'CLR' || i < 8));
    assert.deepEqual(
      steps.map((s) => s.key),
      [
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'MENU',
        'R6',
        'L1',
        '4',
        '4',
        '1',
        '9',
        '0',
        'L1',
      ],
    );
  });

  it('buildPmdg777ZfwKeySequence uses 8 CLR, R6, PREV, SET EMPTY, R2 ZFW, FO CDU, rotor', () => {
    const opts = bcf777ZfwInjectOptions('364.7');
    const steps = buildPmdg777ZfwKeySequence(opts);
    assert.equal(opts.fsActionsLsk, 'R6');
    assert.equal(opts.zfwLsk, 'R2');
    assert.equal(opts.cdu, 'right');
    assert.equal(opts.emptyFirst, true);
    assert.equal(opts.method, 'rotor');
    assert.equal(opts.fieldClrCount, 0);
    assert.equal(opts.emptyClrCount, 0);
    assert.equal(opts.scratchpadClearTaps, 8);
    assert.equal(steps.filter((s) => s.key === 'CLR').length, 8);
    assert.deepEqual(
      steps.map((s) => s.key),
      [
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'CLR',
        'MENU',
        'R6',
        'L2',
        'PREV',
        'R5',
        '3',
        '6',
        '4',
        'DOT',
        '7',
        'R2',
      ],
    );
    assert.ok(steps.some((s) => s.key === 'R5' && s.label.includes('EMPTY')));
    assert.ok(steps.some((s) => s.key === 'R2' && s.label.includes('ZFW')));
    const digit = steps.find((s) => s.key === '3');
    assert.ok((digit?.delayAfterMs ?? 0) >= 700);
  });

  it('buildPmdg777ZfwKeySequence skips CLR when skipScratchpadClear', () => {
    const opts = bcf777ZfwInjectOptions('364.7', { skipScratchpadClear: true });
    const steps = buildPmdg777ZfwKeySequence(opts);
    assert.equal(opts.skipScratchpadClear, true);
    assert.equal(steps.filter((s) => s.key === 'CLR').length, 0);
    assert.equal(steps[0]?.key, 'MENU');
  });
});
