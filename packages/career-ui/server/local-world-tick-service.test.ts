import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOCAL_WORLD_ID } from '@msfs-compat/shared';
import {
  isHeadlessPulseEnabled,
  emptyPulseChunkTiming,
  LocalWorldTickService,
} from './local-world-tick-service.ts';

describe('isHeadlessPulseEnabled', () => {
  it('defaults to on', () => {
    assert.equal(isHeadlessPulseEnabled({}), true);
    assert.equal(isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: '1' }), true);
  });

  it('respects opt-out flags', () => {
    assert.equal(isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: '0' }), false);
    assert.equal(
      isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: 'false' }),
      false,
    );
    assert.equal(isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: 'off' }), false);
  });
});

describe('emptyPulseChunkTiming', () => {
  it('zeros all phases', () => {
    assert.deepEqual(emptyPulseChunkTiming(), {
      lockWaitMs: 0,
      tickMs: 0,
      saveMs: 0,
      settleMs: 0,
      lots: 0,
      realAdvancedTicks: 0,
      settledFlights: 0,
      economyDirty: false,
      needsFullPersist: false,
    });
  });
});

describe('LocalWorldTickService pulse save', () => {
  function harness(opts?: {
    dirtyChunk?: number;
    failSave?: boolean;
  }) {
    const snapshots: boolean[] = [];
    let saves = 0;
    const svc = new LocalWorldTickService({
      requireStore: () => {
        throw new Error('unused');
      },
      loadMissions: async () => {
        throw new Error('unused');
      },
      peekWorld: () => undefined,
      applyCompanySessionSettlement: async () => undefined,
      runCatchUpWrite: async ({ persistPulseSnapshot }) => {
        snapshots.push(persistPulseSnapshot === false);
        const timing = emptyPulseChunkTiming();
        timing.economyDirty = snapshots.length === opts?.dirtyChunk;
        timing.realAdvancedTicks = timing.economyDirty ? 1 : 0;
        return timing;
      },
      persistPulseSnapshot: async () => {
        saves += 1;
        if (opts?.failSave) throw new Error('save failed');
        const timing = emptyPulseChunkTiming();
        timing.saveMs = 12;
        return timing;
      },
    });
    return {
      svc,
      snapshots: () => snapshots,
      saves: () => saves,
    };
  }

  it('skips the planet save when no chunk dirtied the economy', async () => {
    const h = harness();
    const result = await h.svc.advance(LOCAL_WORLD_ID, { n: 8 });
    assert.equal(h.snapshots().length, 4);
    assert.ok(h.snapshots().every(Boolean));
    assert.equal(h.saves(), 0);
    assert.equal(result.advancedTicks, 8);
    assert.equal(result.settledFlights, 0);
  });

  it('saves the planet once after the chunks when one chunk is dirty', async () => {
    const h = harness({ dirtyChunk: 2 });
    const result = await h.svc.advance(LOCAL_WORLD_ID, { n: 8 });
    assert.equal(h.snapshots().length, 4);
    assert.equal(h.saves(), 1);
    assert.equal(result.wallMs >= 0, true);
    assert.equal(result.settledFlights, 0);
  });

  it('retries the planet save on the next quiet pulse after a failed save', async () => {
    let failSave = true;
    let saves = 0;
    let chunks = 0;
    const svc = new LocalWorldTickService({
      requireStore: () => {
        throw new Error('unused');
      },
      loadMissions: async () => {
        throw new Error('unused');
      },
      peekWorld: () => undefined,
      applyCompanySessionSettlement: async () => undefined,
      runCatchUpWrite: async ({ persistPulseSnapshot }) => {
        assert.equal(persistPulseSnapshot, false);
        chunks += 1;
        const timing = emptyPulseChunkTiming();
        timing.economyDirty = chunks === 1;
        return timing;
      },
      persistPulseSnapshot: async () => {
        saves += 1;
        if (failSave) throw new Error('save failed');
        return emptyPulseChunkTiming();
      },
    });
    await svc.advance(LOCAL_WORLD_ID, { n: 8 });
    assert.equal(saves, 1);
    failSave = false;
    await svc.advance(LOCAL_WORLD_ID, { n: 8 });
    assert.equal(saves, 2);
    await svc.advance(LOCAL_WORLD_ID, { n: 8 });
    assert.equal(saves, 2);
  });

  it('uses the landing slice when a quiet chunk only settled flights', async () => {
    const modes: Array<boolean | undefined> = [];
    const svc = new LocalWorldTickService({
      requireStore: () => {
        throw new Error('unused');
      },
      loadMissions: async () => {
        throw new Error('unused');
      },
      peekWorld: () => undefined,
      applyCompanySessionSettlement: async () => undefined,
      runCatchUpWrite: async () => {
        const timing = emptyPulseChunkTiming();
        timing.economyDirty = true;
        timing.settledFlights = 2;
        return timing;
      },
      persistPulseSnapshot: async (opts) => {
        modes.push(opts?.arrivalOnly);
        return emptyPulseChunkTiming();
      },
    });
    await svc.advance(LOCAL_WORLD_ID, { n: 2 });
    assert.deepEqual(modes, [true]);
  });

  it('keeps a full planet save when a chunk simulated a tick', async () => {
    const modes: Array<boolean | undefined> = [];
    const svc = new LocalWorldTickService({
      requireStore: () => {
        throw new Error('unused');
      },
      loadMissions: async () => {
        throw new Error('unused');
      },
      peekWorld: () => undefined,
      applyCompanySessionSettlement: async () => undefined,
      runCatchUpWrite: async () => {
        const timing = emptyPulseChunkTiming();
        timing.economyDirty = true;
        timing.realAdvancedTicks = 1;
        return timing;
      },
      persistPulseSnapshot: async (opts) => {
        modes.push(opts?.arrivalOnly);
        return emptyPulseChunkTiming();
      },
    });
    await svc.advance(LOCAL_WORLD_ID, { n: 2 });
    assert.deepEqual(modes, [false]);
  });
});
