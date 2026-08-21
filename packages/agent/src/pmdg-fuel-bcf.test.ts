import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BCF_FUEL_DEFAULTS,
  buildBcfFuelKeySequence,
  buildMenuSmokeSequence,
  formatBcfFuelPlan,
  fuelLbToDisplay,
  parseBcfFuelCliArgs,
  parseFuelDisplay,
} from './pmdg-fuel-bcf.js';

const baseOpts = {
  ...BCF_FUEL_DEFAULTS,
  totalDisplay: '16.8',
  release: false,
  cdu: 'right' as const,
};

describe('pmdg-fuel-bcf', () => {
  it('builds MENU → FS ACTIONS → FUEL → TOTAL display keystream', () => {
    const steps = buildBcfFuelKeySequence(baseOpts);
    const labels = steps.map((s) => s.label);

    assert.ok(labels.includes('MENU'));
    assert.ok(labels.some((l) => l.includes('FS ACTIONS')));
    assert.ok(labels.some((l) => l.includes('FUEL')));
    assert.ok(labels.some((l) => l.includes('TOTAL=16.8')));

    const totalIdx = labels.findIndex((l) => l.includes('TOTAL=16.8'));
    assert.equal(steps[totalIdx]?.key, 'L1');
    assert.deepEqual(
      steps.slice(totalIdx - 4, totalIdx).map((s) => s.key),
      ['1', '6', 'DOT', '8'],
    );
    assert.equal(steps[totalIdx - 1]?.delayAfterMs, BCF_FUEL_DEFAULTS.commitDelayMs);
  });

  it('builds preset SET FULL keystream', () => {
    const opts = { ...BCF_FUEL_DEFAULTS, preset: 'full' as const, release: false };
    const steps = buildBcfFuelKeySequence(opts);
    assert.ok(steps.some((s) => s.label.includes('SET FULL')));
    assert.ok(!steps.some((s) => s.key === 'DOT'));
    const preset = steps.find((s) => s.label.includes('SET FULL'));
    assert.equal(preset?.key, 'L3');
  });

  it('fuelLbToDisplay formats thousands', () => {
    assert.equal(fuelLbToDisplay(25_000), '25.0');
    assert.equal(fuelLbToDisplay(16_839), '16.8');
  });

  it('parseFuelDisplay accepts decimals', () => {
    assert.equal(parseFuelDisplay('25.0'), '25.0');
    assert.throws(() => parseFuelDisplay('abc'));
  });

  it('parse --total and --total-lb', () => {
    assert.equal(parseBcfFuelCliArgs(['--total', '16.8']).totalDisplay, '16.8');
    assert.equal(parseBcfFuelCliArgs(['--total-lb', '16839']).totalDisplay, '16.8');
  });

  it('defaults to method=control parameter=1, totalLsk L1, cdu=right', () => {
    const parsed = parseBcfFuelCliArgs(['--total', '25.0']);
    assert.equal(parsed.method, 'control');
    assert.equal(parsed.parameter, 1);
    assert.equal(parsed.release, false);
    assert.equal(parsed.totalLsk, 'L1');
    assert.equal(parsed.fuelPageLsk, 'L1');
    assert.equal(parsed.cdu, 'right');
  });

  it('rejects missing target', () => {
    assert.throws(() => parseBcfFuelCliArgs([]), /Provide --total/);
  });

  it('rejects combining preset and total', () => {
    assert.throws(
      () => parseBcfFuelCliArgs(['--total', '25.0', '--preset', 'full']),
      /cannot be combined/,
    );
  });

  it('smoke-menu is CLR + MENU only', () => {
    const steps = buildMenuSmokeSequence();
    assert.deepEqual(
      steps.map((s) => s.key),
      ['CLR', 'MENU'],
    );
  });

  it('formatBcfFuelPlan mentions display scale and LSK tip', () => {
    const text = formatBcfFuelPlan(
      baseOpts,
      buildBcfFuelKeySequence(baseOpts),
      'total',
    );
    assert.match(text, /25\.0 ≈ 25000|display scale/i);
    assert.match(text, /L2 is LEVEL/i);
    assert.match(text, /method=control/);
  });

  it('--slow restores conservative timings', () => {
    const fast = parseBcfFuelCliArgs(['--total', '25.0']);
    const slow = parseBcfFuelCliArgs(['--total', '25.0', '--slow']);
    assert.equal(fast.delayMs, 200);
    assert.equal(slow.delayMs, 400);
    assert.equal(slow.commitDelayMs, 1200);
  });
});
