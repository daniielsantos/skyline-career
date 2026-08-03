import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeMacPercent, normalizeSimPercent, resolveCgEnvelope } from './cg-mac.js';

describe('normalizeMacPercent', () => {
  it('converts Percent-over-100 fractions to %MAC points', () => {
    assert.equal(normalizeMacPercent(0.11), 11);
    assert.equal(normalizeMacPercent(0.4), 40);
    assert.equal(normalizeMacPercent(39), 39);
    assert.equal(normalizeMacPercent(-0.22), -22);
  });
});

describe('normalizeSimPercent', () => {
  it('maps flap/gear fractions to 0–100', () => {
    assert.equal(normalizeSimPercent(0), 0);
    assert.equal(normalizeSimPercent(0.33), 33);
    assert.equal(normalizeSimPercent(1), 100);
    assert.equal(normalizeSimPercent(25), 25);
  });
});

describe('resolveCgEnvelope', () => {
  it('prefers manual, then simvar, then cfg, then profile', () => {
    assert.deepEqual(
      resolveCgEnvelope({
        manual: { minMac: 10, maxMac: 35 },
        simvar: { minMac: 11, maxMac: 40 },
        cfg: { minMac: 5, maxMac: 45 },
        profile: { minMac: 3, maxMac: 50 },
      }),
      { minMac: 10, maxMac: 35, source: 'manual' },
    );
    assert.deepEqual(
      resolveCgEnvelope({
        simvar: { minMac: 11, maxMac: 40 },
        cfg: { minMac: 5, maxMac: 45 },
        profile: { minMac: 3, maxMac: 50 },
      }),
      { minMac: 11, maxMac: 40, source: 'simvar' },
    );
    assert.deepEqual(
      resolveCgEnvelope({
        cfg: { minMac: 5, maxMac: 45 },
        profile: { minMac: 3, maxMac: 50 },
      }),
      { minMac: 5, maxMac: 45, source: 'cfg' },
    );
    assert.deepEqual(
      resolveCgEnvelope({
        profile: { minMac: 3, maxMac: 50 },
      }),
      { minMac: 3, maxMac: 50, source: 'calibrated-live' },
    );
  });

  it('swaps inverted ranges', () => {
    assert.deepEqual(
      resolveCgEnvelope({
        simvar: { minMac: 40, maxMac: 11 },
      }),
      { minMac: 11, maxMac: 40, source: 'simvar' },
    );
  });
});
