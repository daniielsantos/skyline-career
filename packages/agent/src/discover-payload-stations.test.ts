import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  discoverWritablePayloadStations,
  isStationWriteAccepted,
  liveStationIndexes,
  probeStationMaxLoads,
  reprobeStickyPayloadStations,
  resolveHomologateStationMaxLoads,
  stationWriteTolerance,
  STATION_CLAMP_PROBE_LB,
  STATION_MAX_LOAD_PLACEHOLDER_LB,
} from './discover-payload-stations.js';

type StationState = Record<number, number>;

function stubStationBridge(opts: {
  count: number;
  /** Stations that ignore writes (ghost). */
  ghosts?: number[];
  /** Per-station structural clamp (lb). */
  clamps?: Record<number, number>;
  initial?: StationState;
}): NamedPipeSimBridge {
  const ghosts = new Set(opts.ghosts ?? []);
  const clamps = opts.clamps ?? {};
  const state: StationState = { ...(opts.initial ?? {}) };
  for (let i = 1; i <= opts.count; i++) {
    if (state[i] === undefined) state[i] = 0;
  }

  return {
    delay: async () => undefined,
    readSimVar: async ({ name }: { name: string }) => {
      if (name === 'PAYLOAD STATION COUNT') return opts.count;
      const m = /^PAYLOAD STATION WEIGHT:(\d+)$/i.exec(name);
      if (!m) throw new Error(`unexpected read ${name}`);
      return state[Number(m[1])] ?? 0;
    },
    writeSimVar: async ({
      name,
      value,
    }: {
      name: string;
      value: number;
    }) => {
      const m = /^PAYLOAD STATION WEIGHT:(\d+)$/i.exec(name);
      if (!m) throw new Error(`unexpected write ${name}`);
      const idx = Number(m[1]);
      if (ghosts.has(idx)) return;
      const cap = clamps[idx];
      state[idx] =
        typeof cap === 'number' && Number.isFinite(cap)
          ? Math.min(value, cap)
          : value;
    },
  } as unknown as NamedPipeSimBridge;
}

describe('isStationWriteAccepted', () => {
  it('accepts hits inside tolerance', () => {
    assert.equal(isStationWriteAccepted(0, 118, 120), true);
    assert.ok(stationWriteTolerance(120) >= 5);
  });

  it('rejects unchanged ghost writes', () => {
    assert.equal(isStationWriteAccepted(0, 0, 120), false);
  });

  it('rejects large miss', () => {
    assert.equal(isStationWriteAccepted(0, 40, 120), false);
  });
});

describe('discoverWritablePayloadStations', () => {
  it('marks sticky vs ghost stations', async () => {
    const bridge = stubStationBridge({ count: 10, ghosts: [8, 9, 10] });
    const probes = await discoverWritablePayloadStations(bridge, {
      settleMs: 0,
      writeGapMs: 0,
    });
    assert.equal(probes.length, 10);
    const live = liveStationIndexes(probes);
    assert.deepEqual(live, [1, 2, 3, 4, 5, 6, 7]);
    for (const p of probes.filter((x) => x.index >= 8)) {
      assert.equal(p.live, false);
      assert.equal(p.writable, false);
      assert.match(p.note ?? '', /ghost/i);
    }
  });

  it('restores station weight after probe', async () => {
    const bridge = stubStationBridge({
      count: 3,
      initial: { 1: 170, 2: 50, 3: 0 },
    });
    await discoverWritablePayloadStations(bridge, {
      settleMs: 0,
      writeGapMs: 0,
    });
    assert.equal(
      await bridge.readSimVar({
        name: 'PAYLOAD STATION WEIGHT:1',
        unit: 'pounds',
      }),
      170,
    );
    assert.equal(
      await bridge.readSimVar({
        name: 'PAYLOAD STATION WEIGHT:2',
        unit: 'pounds',
      }),
      50,
    );
    assert.equal(
      await bridge.readSimVar({
        name: 'PAYLOAD STATION WEIGHT:3',
        unit: 'pounds',
      }),
      0,
    );
  });
});

describe('probeStationMaxLoads', () => {
  it('records clamp ceilings and skips uncapped sticky stations', async () => {
    const bridge = stubStationBridge({
      count: 3,
      clamps: { 1: 340, 2: 500 },
      initial: { 1: 170, 2: 0, 3: 0 },
    });
    const maxLoads = await probeStationMaxLoads(bridge, [1, 2, 3], {
      settleMs: 0,
      writeGapMs: 0,
      probeLb: STATION_CLAMP_PROBE_LB,
    });
    assert.equal(maxLoads[1], 340);
    assert.equal(maxLoads[2], 500);
    assert.equal(maxLoads[3], undefined);
    assert.equal(
      await bridge.readSimVar({
        name: 'PAYLOAD STATION WEIGHT:1',
        unit: 'pounds',
      }),
      170,
    );
  });
});

describe('reprobeStickyPayloadStations', () => {
  it('drops indexes that ignore the mid-weight batch write', async () => {
    const bridge = stubStationBridge({
      count: 5,
      ghosts: [4, 5],
      initial: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    const { sticky, dropped } = await reprobeStickyPayloadStations(
      bridge,
      [1, 2, 3, 4, 5],
      { settleMs: 0, writeGapMs: 0 },
    );
    assert.deepEqual(sticky, [1, 2, 3]);
    assert.deepEqual(dropped, [4, 5]);
  });
});

describe('resolveHomologateStationMaxLoads', () => {
  it('prefers clamp then cfg then cargo split', () => {
    const r = resolveHomologateStationMaxLoads({
      stickyIndexes: [1, 2, 3, 4, 5, 6],
      clampByIndex: { 3: 900 },
      cfgMaxByIndex: { 4: 1200 },
      cargoCeilingLb: 8000,
      crewIndexes: [1, 2],
    });
    assert.equal(r.maxLoads[3], 900);
    assert.equal(r.sourceByIndex[3], 'clamp');
    assert.equal(r.maxLoads[4], 1200);
    assert.equal(r.sourceByIndex[4], 'cfg');
    // bags 5,6 split 8000/2 (3 and 4 already set — wait, needSplit is 1,2,5,6)
    // bagIndexes among needSplit excluding crew = 5,6 → 4000 each
    assert.equal(r.maxLoads[5], 4000);
    assert.equal(r.maxLoads[6], 4000);
    assert.equal(r.sourceByIndex[5], 'cargo-split');
    assert.ok((r.maxLoads[1] ?? 0) >= 750);
    assert.ok((r.maxLoads[2] ?? 0) >= 750);
  });

  it('YS-11 style: six placeholders + SimBrief ceiling raises bags', () => {
    const r = resolveHomologateStationMaxLoads({
      stickyIndexes: [1, 2, 3, 4, 5, 6],
      cargoCeilingLb: 7400,
      crewIndexes: [1, 2],
    });
    assert.equal(r.maxLoads[3], 1850);
    assert.equal(r.maxLoads[4], 1850);
    assert.equal(r.maxLoads[5], 1850);
    assert.equal(r.maxLoads[6], 1850);
    assert.equal(r.maxLoads[1], 750);
    assert.equal(r.maxLoads[2], 750);
    assert.ok(!Object.values(r.maxLoads).every((v) => v === STATION_MAX_LOAD_PLACEHOLDER_LB));
  });

  it('keeps placeholder when no ceiling', () => {
    const r = resolveHomologateStationMaxLoads({
      stickyIndexes: [1, 2, 3],
    });
    assert.equal(r.maxLoads[3], STATION_MAX_LOAD_PLACEHOLDER_LB);
    assert.equal(r.sourceByIndex[3], 'placeholder');
  });
});
