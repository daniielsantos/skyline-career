import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

export type PayloadStationProbe = {
  index: number;
  varName: string;
  before: number | null;
  after: number | null;
  target: number | null;
  /** write stuck near target */
  writable: boolean;
  /** value moved after write (even if not fully to target) */
  changed: boolean;
  /** usable in a payload writePlan: write stuck */
  live: boolean;
  note?: string;
};

/** Draft placeholder when cfg/clamp do not yield a structural ceiling. */
export const STATION_MAX_LOAD_PLACEHOLDER_LB = 500;

/** High write used to detect SimConnect clamp on sticky stations. */
export const STATION_CLAMP_PROBE_LB = 4000;

/** Soft re-probe / freighter writability style batch weight (lb). */
export const STATION_SOFT_REPROBE_LB = 150;

/** Crew ballast headroom when raising bag maxLoads from a cargo ceiling. */
export const HOMOLOGATE_CREW_MAX_LOAD_FLOOR_LB = 750;

/** Host / Watch can read beyond the classic first batch of 16. */
export const PAYLOAD_STATION_DISCOVERY_MAX = 32;

export type StationMaxLoadSource = 'clamp' | 'cfg' | 'cargo-split' | 'placeholder';

export type ResolvedStationMaxLoads = {
  maxLoads: Record<number, number>;
  sourceByIndex: Record<number, StationMaxLoadSource>;
  /** Human summary for wizard log / promote notes. */
  summary: string;
  cargoSplitLb?: number;
};

/**
 * Cascade station maxLoad for homologate draft:
 * clamp → cfg (>placeholder) → split cargo ceiling across bag stations → 500.
 */
export function resolveHomologateStationMaxLoads(opts: {
  stickyIndexes: number[];
  clampByIndex?: Record<number, number>;
  cfgMaxByIndex?: Record<number, number>;
  /** Total injectable cargo (lb) for bag stations — SimBrief or useful-load. */
  cargoCeilingLb?: number;
  crewIndexes?: number[];
  crewFloorLb?: number;
  placeholderLb?: number;
}): ResolvedStationMaxLoads {
  const placeholder = opts.placeholderLb ?? STATION_MAX_LOAD_PLACEHOLDER_LB;
  const crewFloor = opts.crewFloorLb ?? HOMOLOGATE_CREW_MAX_LOAD_FLOOR_LB;
  const sticky = [
    ...new Set(
      opts.stickyIndexes.filter((i) => Number.isFinite(i) && i >= 1).map((i) => Math.round(i)),
    ),
  ].sort((a, b) => a - b);
  const crewSet = new Set(
    (opts.crewIndexes ?? [1, 2]).filter((i) => sticky.includes(i)),
  );
  const clamp = opts.clampByIndex ?? {};
  const cfg = opts.cfgMaxByIndex ?? {};

  const maxLoads: Record<number, number> = {};
  const sourceByIndex: Record<number, StationMaxLoadSource> = {};
  const needSplit: number[] = [];

  for (const idx of sticky) {
    const c = clamp[idx];
    if (typeof c === 'number' && Number.isFinite(c) && c >= 1) {
      maxLoads[idx] = Math.round(c);
      sourceByIndex[idx] = 'clamp';
      continue;
    }
    const cfgMax = cfg[idx];
    if (
      typeof cfgMax === 'number' &&
      Number.isFinite(cfgMax) &&
      cfgMax > placeholder
    ) {
      maxLoads[idx] = Math.round(cfgMax);
      sourceByIndex[idx] = 'cfg';
      continue;
    }
    needSplit.push(idx);
  }

  const ceiling =
    typeof opts.cargoCeilingLb === 'number' &&
    Number.isFinite(opts.cargoCeilingLb) &&
    opts.cargoCeilingLb > 0
      ? opts.cargoCeilingLb
      : 0;

  let cargoSplitLb: number | undefined;
  if (needSplit.length > 0 && ceiling > 0) {
    const bagIndexes =
      sticky.length <= 2
        ? needSplit
        : needSplit.filter((idx) => !crewSet.has(idx));
    const splitTargets = bagIndexes.length > 0 ? bagIndexes : needSplit;
    cargoSplitLb = Math.max(
      placeholder,
      Math.floor(ceiling / splitTargets.length),
    );
    for (const idx of needSplit) {
      if (splitTargets.includes(idx)) {
        maxLoads[idx] = cargoSplitLb;
        sourceByIndex[idx] = 'cargo-split';
      } else if (crewSet.has(idx)) {
        maxLoads[idx] = Math.max(crewFloor, placeholder);
        sourceByIndex[idx] = 'cargo-split';
      } else {
        maxLoads[idx] = placeholder;
        sourceByIndex[idx] = 'placeholder';
      }
    }
    for (const idx of sticky) {
      if (crewSet.has(idx) && sourceByIndex[idx] !== 'clamp' && sourceByIndex[idx] !== 'cfg') {
        maxLoads[idx] = Math.max(maxLoads[idx] ?? 0, crewFloor);
        if (sourceByIndex[idx] === 'placeholder') {
          sourceByIndex[idx] = 'cargo-split';
        }
      }
    }
  } else {
    for (const idx of needSplit) {
      maxLoads[idx] = placeholder;
      sourceByIndex[idx] = 'placeholder';
    }
  }

  const parts: string[] = [];
  const bySource: Record<StationMaxLoadSource, number[]> = {
    clamp: [],
    cfg: [],
    'cargo-split': [],
    placeholder: [],
  };
  for (const idx of sticky) {
    bySource[sourceByIndex[idx]!]?.push(idx);
  }
  if (bySource.clamp.length) {
    parts.push(
      `clamp ${bySource.clamp.map((i) => `S${i}=${maxLoads[i]}`).join(',')}`,
    );
  }
  if (bySource.cfg.length) {
    parts.push(
      `cfg ${bySource.cfg.map((i) => `S${i}=${maxLoads[i]}`).join(',')}`,
    );
  }
  if (bySource['cargo-split'].length) {
    parts.push(
      `cargo-split ${bySource['cargo-split'].map((i) => `S${i}=${maxLoads[i]}`).join(',')}` +
        (cargoSplitLb != null ? ` (ceiling ${Math.round(ceiling)} lb)` : ''),
    );
  }
  if (bySource.placeholder.length) {
    parts.push(
      `placeholder ${bySource.placeholder.map((i) => `S${i}`).join(',')}=${placeholder}`,
    );
  }

  return {
    maxLoads,
    sourceByIndex,
    summary: parts.join(' · ') || `placeholder ${placeholder}`,
    ...(cargoSplitLb != null ? { cargoSplitLb } : {}),
  };
}

/**
 * Second pass after sticky writetest: batch-write a mid weight, settle, drop
 * indexes that fall back near empty (C408-style sticky-then-ghost).
 */
export async function reprobeStickyPayloadStations(
  bridge: NamedPipeSimBridge,
  indexes: number[],
  opts: {
    settleMs?: number;
    writeGapMs?: number;
    probeLb?: number;
    keepMinLb?: number;
  } = {},
): Promise<{ sticky: number[]; dropped: number[] }> {
  const settleMs = opts.settleMs ?? 700;
  const writeGapMs = opts.writeGapMs ?? 50;
  const probeLb = opts.probeLb ?? STATION_SOFT_REPROBE_LB;
  const keepMinLb = opts.keepMinLb ?? 20;
  const unique = [
    ...new Set(
      indexes.filter((i) => Number.isFinite(i) && i >= 1).map((i) => Math.round(i)),
    ),
  ].sort((a, b) => a - b);
  if (unique.length === 0) {
    return { sticky: [], dropped: [] };
  }

  const before: Record<number, number> = {};
  for (const index of unique) {
    const varName = `PAYLOAD STATION WEIGHT:${index}`;
    const lb = await readLb(bridge, varName);
    before[index] = lb ?? 0;
    try {
      await bridge.writeSimVar({
        name: varName,
        unit: 'pounds',
        value: probeLb,
      });
      if (writeGapMs > 0) await localDelay(writeGapMs);
    } catch {
      /* try remaining */
    }
  }

  await localDelay(settleMs);

  const sticky: number[] = [];
  const dropped: number[] = [];
  for (const index of unique) {
    const got = await readLb(bridge, `PAYLOAD STATION WEIGHT:${index}`);
    if (got !== null && got >= keepMinLb) sticky.push(index);
    else dropped.push(index);
  }

  for (const index of unique) {
    try {
      await bridge.writeSimVar({
        name: `PAYLOAD STATION WEIGHT:${index}`,
        unit: 'pounds',
        value: before[index] ?? 0,
      });
      if (writeGapMs > 0) await localDelay(writeGapMs);
    } catch {
      /* best-effort restore */
    }
  }
  if (settleMs > 0 || writeGapMs > 0) {
    await localDelay(Math.max(150, writeGapMs));
  }

  return { sticky, dropped };
}

/**
 * Write a high payload on each sticky station and read the clamp (if any).
 * Stations that accept the full probe (no clamp) are omitted — keep placeholder.
 */
export async function probeStationMaxLoads(
  bridge: NamedPipeSimBridge,
  indexes: number[],
  opts: {
    settleMs?: number;
    writeGapMs?: number;
    probeLb?: number;
  } = {},
): Promise<Record<number, number>> {
  const settleMs = opts.settleMs ?? 400;
  const writeGapMs = opts.writeGapMs ?? 50;
  const probeLb = opts.probeLb ?? STATION_CLAMP_PROBE_LB;
  const afterProbeMs = Math.max(settleMs, writeGapMs);
  const afterRestoreMs =
    settleMs > 0 || writeGapMs > 0 ? Math.max(150, writeGapMs) : 0;
  const out: Record<number, number> = {};

  for (const index of indexes) {
    if (!Number.isFinite(index) || index < 1) continue;
    const varName = `PAYLOAD STATION WEIGHT:${index}`;
    const before = await readLb(bridge, varName);
    if (before === null) continue;

    try {
      await bridge.writeSimVar({
        name: varName,
        unit: 'pounds',
        value: probeLb,
      });
      await localDelay(afterProbeMs);
      const after = await readLb(bridge, varName);
      await bridge.writeSimVar({
        name: varName,
        unit: 'pounds',
        value: before,
      });
      await localDelay(afterRestoreMs);

      if (after === null || !Number.isFinite(after)) continue;
      // Clear clamp: settled well below the probe target.
      if (after < probeLb - Math.max(50, probeLb * 0.05) && after >= 1) {
        out[index] = Math.round(after);
      }
    } catch {
      try {
        await bridge.writeSimVar({
          name: varName,
          unit: 'pounds',
          value: before,
        });
      } catch {
        /* best-effort restore */
      }
    }
  }

  return out;
}

export function stationWriteTolerance(target: number): number {
  return Math.max(Math.abs(target) * 0.05, 5);
}

export function isStationWriteAccepted(
  before: number,
  after: number,
  target: number,
): boolean {
  const residual = Math.abs(after - target);
  if (residual <= stationWriteTolerance(target)) return true;
  // Already near target before write — treat as sticky if still near.
  if (Math.abs(before - target) <= stationWriteTolerance(target)) {
    return residual <= stationWriteTolerance(target);
  }
  return false;
}

async function readLb(
  bridge: NamedPipeSimBridge,
  name: string,
): Promise<number | null> {
  try {
    const v = await bridge.readSimVar({ name, unit: 'pounds' });
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function readStationCount(bridge: NamedPipeSimBridge): Promise<number> {
  try {
    const raw = await bridge.readSimVar({
      name: 'PAYLOAD STATION COUNT',
      unit: 'number',
    });
    if (Number.isFinite(raw) && raw > 0) {
      return Math.max(1, Math.min(PAYLOAD_STATION_DISCOVERY_MAX, Math.round(raw)));
    }
  } catch {
    /* fall through */
  }
  return 16;
}

/** Local pause — avoid bridge.delay IPC during writetest bursts. */
function localDelay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Probe PAYLOAD STATION WEIGHT:1..N — write a distinct probe, settle, restore.
 * Ghost stations (SimConnect accepts write but live stays unchanged) are not `live`.
 */
export async function discoverWritablePayloadStations(
  bridge: NamedPipeSimBridge,
  opts: {
    maxStations?: number;
    /** Settle after probe write before readback (default 400). */
    settleMs?: number;
    /** Gap after every SimVar write — probe and restore (default 50). */
    writeGapMs?: number;
  } = {},
): Promise<PayloadStationProbe[]> {
  const count = Math.min(
    opts.maxStations ?? PAYLOAD_STATION_DISCOVERY_MAX,
    await readStationCount(bridge),
  );
  const settleMs = opts.settleMs ?? 400;
  const writeGapMs = opts.writeGapMs ?? 50;
  const afterProbeMs = Math.max(settleMs, writeGapMs);
  // When both settle/gap are explicitly 0 (unit tests), skip restore pause too.
  const afterRestoreMs =
    settleMs > 0 || writeGapMs > 0 ? Math.max(150, writeGapMs) : 0;
  const results: PayloadStationProbe[] = [];

  for (let index = 1; index <= count; index++) {
    const varName = `PAYLOAD STATION WEIGHT:${index}`;
    const before = await readLb(bridge, varName);
    if (before === null) {
      results.push({
        index,
        varName,
        before: null,
        after: null,
        target: null,
        writable: false,
        changed: false,
        live: false,
        note: 'unreadable',
      });
      continue;
    }

    // Distinct probe: prefer ~120 lb, or before+80 when already near 120.
    let target = 120;
    if (Math.abs(before - target) < 15) {
      target = Math.min(400, Math.round(before + 80));
    }

    let after: number | null = null;
    let writable = false;
    let changed = false;
    let note: string | undefined;

    try {
      await bridge.writeSimVar({ name: varName, unit: 'pounds', value: target });
      await localDelay(afterProbeMs);
      after = await readLb(bridge, varName);
      if (after !== null) {
        changed = Math.abs(after - before) > 0.5;
        writable = isStationWriteAccepted(before, after, target);
      }
      await bridge.writeSimVar({ name: varName, unit: 'pounds', value: before });
      await localDelay(afterRestoreMs);
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      after = null;
    }

    if (!writable && after !== null && !changed) {
      note = note ?? 'ghost write (live unchanged)';
    } else if (!writable && changed) {
      note =
        note ??
        `moved ${before.toFixed(0)} → ${after?.toFixed(0) ?? '?'} lb (wanted ${target})`;
    }

    results.push({
      index,
      varName,
      before,
      after,
      target,
      writable,
      changed,
      live: writable,
      note,
    });
  }

  return results;
}

export function liveStationIndexes(probes: PayloadStationProbe[]): number[] {
  return probes.filter((p) => p.live).map((p) => p.index);
}
