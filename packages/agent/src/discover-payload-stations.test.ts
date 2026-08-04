import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  discoverWritablePayloadStations,
  isStationWriteAccepted,
  liveStationIndexes,
  probeStationMaxLoads,
  stationWriteTolerance,
  STATION_CLAMP_PROBE_LB,
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
