import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  isFuelWriteAccepted,
  readAfterWriteSettles,
  writeTolerance,
} from './discover-fuel-tanks.js';

/** Minimal bridge stub: delay is instant, reads walk a scripted series. */
function stubBridge(samples: number[]): NamedPipeSimBridge {
  let index = 0;
  return {
    delay: async () => undefined,
    readSimVar: async () => samples[Math.min(index++, samples.length - 1)]!,
  } as unknown as NamedPipeSimBridge;
}

describe('readAfterWriteSettles', () => {
  it('accepts a tank that ramps toward the target across polls', async () => {
    // Vendor fuel systems fill gradually; a single fast read would see 30.
    const bridge = stubBridge([30, 42, 51.8]);
    const value = await readAfterWriteSettles(bridge, 'FUEL TANK LEFT MAIN QUANTITY', 52);
    assert.ok(value !== null);
    assert.ok(Math.abs(value! - 52) <= writeTolerance(52));
  });

  it('gives up once the value stops moving short of the target', async () => {
    const bridge = stubBridge([13, 13, 13, 13, 13]);
    const value = await readAfterWriteSettles(bridge, 'FUELSYSTEM TANK QUANTITY:3', 22);
    assert.equal(value, 13);
  });

  it('returns early on a stable near-miss inside the offset band', async () => {
    // AUX-style: settles 0.8 gal short (typical fuelOffset), not exact.
    const bridge = stubBridge([12, 8.2, 8.2, 8.2]);
    const value = await readAfterWriteSettles(bridge, 'FUEL TANK LEFT AUX QUANTITY', 9);
    assert.equal(value, 8.2);
  });
});

describe('isFuelWriteAccepted', () => {
  it('accepts exact hits inside writeTolerance', () => {
    assert.equal(isFuelWriteAccepted(15, 22.1, 22), true);
  });

  it('accepts BN2 AUX near-miss (26.7 → 8.2 wanted 9)', () => {
    assert.equal(isFuelWriteAccepted(26.7, 8.2, 9), true);
  });

  it('accepts BN2 FUELSYSTEM near-miss (11.8 → 36.5 wanted 40)', () => {
    assert.equal(isFuelWriteAccepted(11.8, 36.5, 40), true);
  });

  it('rejects weak classic MAIN crawl (15.3 → 18.5 wanted 22)', () => {
    assert.equal(isFuelWriteAccepted(15.3, 18.5, 22), false);
  });

  it('rejects writes that do not move', () => {
    assert.equal(isFuelWriteAccepted(15.3, 15.3, 22), false);
  });
});
