import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BCF_PAYLOAD_DEFAULTS,
  buildBcfPayloadKeySequence,
  buildBcfZfwKeySequence,
  buildMenuSmokeSequence,
  formatBcfPayloadPlan,
  parseBcfPayloadCliArgs,
  scratchpadToKeys,
  zfwLbToDisplay,
} from './pmdg-payload-bcf.js';

const baseOpts = {
  ...BCF_PAYLOAD_DEFAULTS,
  emptyFirst: false,
  release: false,
  cdu: 'right' as const,
};

describe('pmdg-payload-bcf', () => {
  it('builds MENU → FS ACTIONS → PAYLOAD → MAIN/FWD/AFT keystream', () => {
    const steps = buildBcfPayloadKeySequence({ ...baseOpts, emptyFirst: true });
    const labels = steps.map((s) => s.label);

    assert.ok(labels.includes('MENU'));
    assert.ok(labels.some((l) => l.includes('FS ACTIONS')));
    assert.ok(labels.some((l) => l.includes('PAYLOAD')));
    assert.ok(labels.some((l) => l.includes('SET EMPTY')));
    assert.ok(labels.some((l) => l.includes('MAIN CARGO=2797')));
    assert.ok(labels.some((l) => l.includes('FWD CARGO=332')));
    assert.ok(labels.some((l) => l.includes('AFT CARGO=415')));

    const mainIdx = labels.findIndex((l) => l.includes('MAIN CARGO'));
    assert.equal(steps[mainIdx - 4]?.key, '2');
    assert.equal(steps[mainIdx - 3]?.key, '7');
    assert.equal(steps[mainIdx - 2]?.key, '9');
    assert.equal(steps[mainIdx - 1]?.key, '7');
    assert.equal(steps[mainIdx - 1]?.delayAfterMs, BCF_PAYLOAD_DEFAULTS.commitDelayMs);
    assert.equal(steps[mainIdx]?.key, 'L2');
  });

  it('builds ZFW keystream with decimal scratchpad → R2', () => {
    const opts = { ...baseOpts, zfwDisplay: '89.3', emptyFirst: true };
    const steps = buildBcfZfwKeySequence(opts);
    const labels = steps.map((s) => s.label);
    assert.ok(labels.some((l) => l.includes('SET EMPTY')));
    assert.ok(labels.some((l) => l.includes('ZFW=89.3')));
    assert.ok(!labels.some((l) => l.includes('MAIN CARGO')));
    const zfwIdx = labels.findIndex((l) => l.includes('ZFW=89.3'));
    assert.equal(steps[zfwIdx]?.key, 'R2');
    assert.deepEqual(
      steps.slice(zfwIdx - 4, zfwIdx).map((s) => s.key),
      ['8', '9', 'DOT', '3'],
    );
  });

  it('zfwLbToDisplay formats thousands', () => {
    assert.equal(zfwLbToDisplay(89_300), '89.3');
    assert.equal(zfwLbToDisplay(87_400), '87.4');
  });

  it('scratchpadToKeys supports decimals', () => {
    assert.deepEqual(
      scratchpadToKeys('89.3').map((s) => s.key),
      ['8', '9', 'DOT', '3'],
    );
  });

  it('parse --zfw and --zfw-lb', () => {
    assert.equal(parseBcfPayloadCliArgs(['--zfw', '89.3']).zfwDisplay, '89.3');
    assert.equal(parseBcfPayloadCliArgs(['--zfw-lb', '89300']).zfwDisplay, '89.3');
  });

  it('defaults emptyFirst=false; --empty-first opts in', () => {
    assert.equal(parseBcfPayloadCliArgs([]).emptyFirst, false);
    assert.equal(parseBcfPayloadCliArgs(['--empty-first']).emptyFirst, true);
  });

  it('skips SET EMPTY when emptyFirst is false', () => {
    const steps = buildBcfPayloadKeySequence({
      ...baseOpts,
      emptyFirst: false,
    });
    assert.ok(!steps.some((s) => s.label.includes('SET EMPTY')));
  });

  it('uses R4 for SET EMPTY and afterFieldDelayMs on cargo LSKs', () => {
    const steps = buildBcfPayloadKeySequence({ ...baseOpts, emptyFirst: true });
    const empty = steps.find((s) => s.label.includes('SET EMPTY'));
    assert.equal(empty?.key, 'R4');
    assert.equal(empty?.delayAfterMs, BCF_PAYLOAD_DEFAULTS.afterEmptyDelayMs);
    const mainLsk = steps.find((s) => s.label.includes('MAIN CARGO'));
    assert.equal(mainLsk?.delayAfterMs, BCF_PAYLOAD_DEFAULTS.afterFieldDelayMs);
  });

  it('defaults cargo LSKs to L2/L3/L4 (BCF SDK +1 vs screen)', () => {
    const parsed = parseBcfPayloadCliArgs([]);
    assert.equal(parsed.mainLsk, 'L2');
    assert.equal(parsed.fwdLsk, 'L3');
    assert.equal(parsed.aftLsk, 'L4');
  });

  it('--only main builds a single field keystream', () => {
    const steps = buildBcfPayloadKeySequence({
      ...baseOpts,
      onlyField: 'main',
      emptyFirst: false,
    });
    assert.ok(steps.some((s) => s.label.includes('MAIN CARGO')));
    assert.ok(!steps.some((s) => s.label.includes('FWD CARGO')));
    assert.ok(!steps.some((s) => s.label.includes('AFT CARGO')));
  });

  it('smoke-menu is CLR + MENU only', () => {
    const steps = buildMenuSmokeSequence();
    assert.deepEqual(
      steps.map((s) => s.key),
      ['CLR', 'MENU'],
    );
  });

  it('defaults to method=control parameter=1 and cdu=right', () => {
    const parsed = parseBcfPayloadCliArgs([]);
    assert.equal(parsed.method, 'control');
    assert.equal(parsed.parameter, 1);
    assert.equal(parsed.release, false);
    assert.equal(parsed.fieldClrCount, 2);
    assert.equal(parsed.cdu, 'right');
  });

  it('--tiny uses smaller cargo defaults', () => {
    const parsed = parseBcfPayloadCliArgs(['--tiny']);
    assert.equal(parsed.main, 1000);
    assert.equal(parsed.fwd, 200);
    assert.equal(parsed.aft, 200);
  });

  it('parses CLI flags', () => {
    const parsed = parseBcfPayloadCliArgs([
      '--main',
      '1000',
      '--fwd',
      '200',
      '--aft',
      '300',
      '--units',
      'kg',
      '--method',
      'event',
      '--dry-run',
      '--empty-first',
      '--smoke-menu',
      '--payload-page-lsk',
      'l3',
    ]);
    assert.equal(parsed.main, 1000);
    assert.equal(parsed.fwd, 200);
    assert.equal(parsed.aft, 300);
    assert.equal(parsed.units, 'kg');
    assert.equal(parsed.method, 'event');
    assert.equal(parsed.parameter, 0);
    assert.equal(parsed.release, true);
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.emptyFirst, true);
    assert.equal(parsed.smokeMenu, true);
    assert.equal(parsed.payloadPageLsk, 'L3');
  });

  it('--slow restores conservative timings', () => {
    const fast = parseBcfPayloadCliArgs([]);
    const slow = parseBcfPayloadCliArgs(['--slow']);
    assert.equal(fast.delayMs, 200);
    assert.equal(slow.delayMs, 400);
    assert.equal(slow.commitDelayMs, 1200);
  });

  it('formatBcfPayloadPlan mentions validation checklist', () => {
    const text = formatBcfPayloadPlan(
      baseOpts,
      buildBcfPayloadKeySequence(baseOpts),
    );
    assert.match(text, /not career inject/i);
    assert.match(text, /MAIN=2797/);
    assert.match(text, /method=control/);
    assert.match(text, /INVALID ENTRY/);
  });

  it('formatBcfPayloadPlan for zfw mentions auto-fill', () => {
    const opts = { ...baseOpts, zfwDisplay: '89.3' };
    const text = formatBcfPayloadPlan(opts, buildBcfZfwKeySequence(opts), 'zfw');
    assert.match(text, /ZFW/);
    assert.match(text, /auto-fill|MAIN\/FWD\/AFT/i);
  });
});
