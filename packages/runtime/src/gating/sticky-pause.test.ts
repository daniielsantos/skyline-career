import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clearStickyPausedForGating } from './sticky-pause.js';
import type { SimBridge, SimSnapshot } from '../types.js';

function baseSnap(over: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    onGround: true,
    enginesRunning: false,
    parkingBrake: true,
    paused: true,
    slewActive: false,
    simRate: 1,
    vars: {},
    ...over,
  };
}

function mockBridge(opts: {
  times: number[];
  delayMs?: number[];
}): SimBridge {
  let i = 0;
  return {
    async readSimVar() {
      throw new Error('unused');
    },
    async readSimVars() {
      const t = opts.times[i++] ?? opts.times[opts.times.length - 1]!;
      return [t];
    },
    async writeSimVar() {},
    async readLVar() {
      return 0;
    },
    async writeLVar() {},
    async triggerHVar() {},
    async triggerEvent() {},
    async snapshot() {
      return baseSnap();
    },
    async delay(ms: number) {
      opts.delayMs?.push(ms);
    },
  };
}

describe('clearStickyPausedForGating', () => {
  it('leaves live snapshot unchanged', async () => {
    const snap = baseSnap({ paused: false });
    const bridge = mockBridge({ times: [100, 101] });
    const result = await clearStickyPausedForGating(bridge, snap);
    assert.equal(result.stickyCleared, false);
    assert.equal(result.snapshot.paused, false);
  });

  it('clears sticky pause when Absolute Time advances', async () => {
    const delays: number[] = [];
    const bridge = mockBridge({ times: [1000, 1000.5], delayMs: delays });
    const result = await clearStickyPausedForGating(bridge, baseSnap(), {
      probeMs: 400,
      minDtSec: 0.2,
    });
    assert.equal(result.stickyCleared, true);
    assert.equal(result.snapshot.paused, false);
    assert.deepEqual(delays, [400]);
  });

  it('keeps true pause when Absolute Time is still', async () => {
    const bridge = mockBridge({ times: [50, 50.05] });
    const result = await clearStickyPausedForGating(bridge, baseSnap(), {
      minDtSec: 0.2,
    });
    assert.equal(result.stickyCleared, false);
    assert.equal(result.snapshot.paused, true);
  });
});
