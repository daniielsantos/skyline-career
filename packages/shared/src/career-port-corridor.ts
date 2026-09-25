/**
 * Port Demand desk — per-port board reach + Accept gate.
 * Level = WH tier at port pickups; active operator uses concession P1–P3.
 * Keep ladder in sync with packages/career-ui demand-accept-preview.ts.
 */

import {
  CAREER_HUB_COORDS,
  distanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import { ensurePlayerWarehouses } from './career-warehouse.js';
import type { CareerMissionsState } from './types/career-economy.js';

export type PortCorridorLevel = 1 | 2 | 3;

export type PortDeskDef = {
  id: string;
  pickupHubs: readonly string[];
};

/** T1/P1 regional · T2/P2 continental · T3/P3 open (port pickup origin only). */
export const DEMAND_CORRIDOR_NM_BY_LEVEL: Record<
  PortCorridorLevel,
  number | null
> = {
  1: 500,
  2: 1800,
  3: null,
};

/**
 * Soft-spawn / vacant-desk default (= T1).
 * Prefer {@link corridorNmForLevel} for Accept / UI.
 */
export const DEMAND_PORT_CORRIDOR_NM = DEMAND_CORRIDOR_NM_BY_LEVEL[1]!;

/** Open Demand rows per port desk (vacant / P1). */
export const DEMAND_ORDERS_PER_PORT_BASE = 6;
/** Extra open slots when world operator is P2+. */
export const DEMAND_ORDERS_PER_PORT_OPERATOR_EXTRA = 1;

/** Regional ring upper (nm) — P1 corridor + near band for P2/P3. */
export const DEMAND_SPAWN_BAND_NEAR_NM = DEMAND_CORRIDOR_NM_BY_LEVEL[1]!;
/** Continental ring upper (nm) — P2 corridor + mid band for P3. */
export const DEMAND_SPAWN_BAND_MID_NM = DEMAND_CORRIDOR_NM_BY_LEVEL[2]!;

/**
 * Exclusive distance ring for Demand desk spawn mix.
 * Dest matches when `nm > minNmExclusive` and (`maxNm == null` or `nm <= maxNm`).
 */
export type DemandSpawnBand = {
  minNmExclusive: number;
  maxNm: number | null;
  targetSlots: number;
};

export function clampPortCorridorLevel(n: number): PortCorridorLevel {
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

/** `null` = open (no distance cap). */
export function corridorNmForLevel(level: PortCorridorLevel): number | null {
  return DEMAND_CORRIDOR_NM_BY_LEVEL[clampPortCorridorLevel(level)];
}

/**
 * Per-desk spawn mix targets. Accept reach stays open at P3; only the shelf
 * composition is banded. Sum of `targetSlots` === `portCap`.
 *
 * - P1: all ≤500
 * - P2: ~half ≤500, rest (500, 1800]
 * - P3: 2 / 2 / rest → ≤500 / (500, 1800] / >1800
 */
export function demandSpawnBandTargets(
  level: PortCorridorLevel,
  portCap: number,
): DemandSpawnBand[] {
  const cap = Math.max(0, Math.floor(portCap));
  const lv = clampPortCorridorLevel(level);
  if (cap <= 0) return [];

  if (lv === 1) {
    return [
      {
        minNmExclusive: -1,
        maxNm: DEMAND_SPAWN_BAND_NEAR_NM,
        targetSlots: cap,
      },
    ];
  }

  if (lv === 2) {
    const near = Math.ceil(cap / 2);
    const mid = Math.max(0, cap - near);
    return [
      {
        minNmExclusive: -1,
        maxNm: DEMAND_SPAWN_BAND_NEAR_NM,
        targetSlots: near,
      },
      {
        minNmExclusive: DEMAND_SPAWN_BAND_NEAR_NM,
        maxNm: DEMAND_SPAWN_BAND_MID_NM,
        targetSlots: mid,
      },
    ];
  }

  const near = Math.min(2, cap);
  const mid = Math.min(2, Math.max(0, cap - near));
  const far = Math.max(0, cap - near - mid);
  return [
    {
      minNmExclusive: -1,
      maxNm: DEMAND_SPAWN_BAND_NEAR_NM,
      targetSlots: near,
    },
    {
      minNmExclusive: DEMAND_SPAWN_BAND_NEAR_NM,
      maxNm: DEMAND_SPAWN_BAND_MID_NM,
      targetSlots: mid,
    },
    {
      minNmExclusive: DEMAND_SPAWN_BAND_MID_NM,
      maxNm: null,
      targetSlots: far,
    },
  ];
}

export function nmInDemandSpawnBand(
  nm: number,
  band: Pick<DemandSpawnBand, 'minNmExclusive' | 'maxNm'>,
): boolean {
  if (!(nm > band.minNmExclusive)) return false;
  if (band.maxNm != null && nm > band.maxNm) return false;
  return true;
}

/** Classify dest into a spawn band index, or -1 if no coords / no match. */
export function demandSpawnBandIndexForDest(
  destIcao: string,
  hubs: readonly string[],
  bands: readonly DemandSpawnBand[],
): number {
  const nm = minNmToHubs(destIcao, hubs);
  if (nm == null) return -1;
  for (let i = 0; i < bands.length; i++) {
    if (nmInDemandSpawnBand(nm, bands[i]!)) return i;
  }
  return -1;
}

export function formatPortCorridorReachLabel(
  level: PortCorridorLevel,
  opts?: { source?: 'wh' | 'concession' | 'vacant' },
): string {
  const nm = corridorNmForLevel(level);
  const src =
    opts?.source === 'concession'
      ? `P${level}`
      : opts?.source === 'vacant'
        ? 'Vacant'
        : `WH T${level}`;
  if (nm == null) return `Corridor · open · ${src}`;
  return `Corridor · ${nm} nm · ${src}`;
}

type PortPickupsFn = (portId: string) => readonly string[] | undefined;
type PortIdForHubFn = (icao: string) => string | undefined;
type ListPortsFn = () => readonly PortDeskDef[];

let portPickupsFn: PortPickupsFn | null = null;
let portIdForHubFn: PortIdForHubFn | null = null;
let listPortsFn: ListPortsFn | null = null;

/** Called from career-ports after CAREER_PORTS is defined (breaks import cycle). */
export function bindPortCorridorLookups(opts: {
  portPickups: PortPickupsFn;
  portIdForHub: PortIdForHubFn;
  listPorts: ListPortsFn;
}): void {
  portPickupsFn = opts.portPickups;
  portIdForHubFn = opts.portIdForHub;
  listPortsFn = opts.listPorts;
}

export function listBoundCareerPorts(): readonly PortDeskDef[] {
  return listPortsFn?.() ?? [];
}

export function portIdForPickupHubBound(icao: string): string | undefined {
  return portIdForHubFn?.(icao.trim().toUpperCase());
}

export function portPickupHubsBound(portId: string): readonly string[] {
  return portPickupsFn?.(portId.trim().toUpperCase()) ?? [];
}

export function distanceHubsNm(a: string, b: string): number | null {
  const ca = CAREER_HUB_COORDS[a.trim().toUpperCase()];
  const cb = CAREER_HUB_COORDS[b.trim().toUpperCase()];
  if (!ca || !cb) return null;
  return distanceNm(ca, cb);
}

/** Min great-circle nm from dest to any hub; null if no coords. */
export function minNmToHubs(
  destIcao: string,
  hubs: readonly string[],
): number | null {
  const dest = destIcao.trim().toUpperCase();
  let best: number | null = null;
  for (const hub of hubs) {
    const nm = distanceHubsNm(dest, hub);
    if (nm == null) continue;
    if (best == null || nm < best) best = nm;
  }
  return best;
}

/**
 * True if dest is within corridor of the given hubs.
 * `maxNm == null` → open (always true when hubs non-empty).
 */
export function destWithinCorridorNm(
  destIcao: string,
  hubs: readonly string[],
  maxNm: number | null,
): boolean {
  if (hubs.length === 0) return false;
  if (maxNm == null) return true;
  const min = minNmToHubs(destIcao, hubs);
  return min != null && min <= maxNm;
}

export function destNearAnyHub(
  destIcao: string,
  hubs: readonly string[],
  maxNm: number = DEMAND_PORT_CORRIDOR_NM,
): boolean {
  return destWithinCorridorNm(destIcao, hubs, maxNm);
}

/** World spawn reach for a port desk (operator P, else vacant T1). */
export function worldPortDeskCorridorLevel(
  world: CareerEconomyWorld,
  portId: string,
): { level: PortCorridorLevel; source: 'concession' | 'vacant' } {
  const id = portId.trim().toUpperCase();
  const row = (world.portConcessions ?? []).find(
    (c) =>
      c.portId.trim().toUpperCase() === id &&
      c.leasePaidThroughTick > world.tick,
  );
  if (row) {
    return {
      level: clampPortCorridorLevel(row.level ?? 1),
      source: 'concession',
    };
  }
  return { level: 1, source: 'vacant' };
}

export function demandOrdersCapForPortDesk(
  world: CareerEconomyWorld,
  portId: string,
): number {
  const { level, source } = worldPortDeskCorridorLevel(world, portId);
  return (
    DEMAND_ORDERS_PER_PORT_BASE +
    (source === 'concession' && level >= 2
      ? DEMAND_ORDERS_PER_PORT_OPERATOR_EXTRA
      : 0)
  );
}

/**
 * Player corridor level at a port: concession P if operator, else max WH tier
 * on that port’s pickup hubs (default T1).
 */
export function resolvePlayerPortCorridorLevel(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  portId: string,
): { level: PortCorridorLevel; source: 'wh' | 'concession' } {
  const id = portId.trim().toUpperCase();
  const conc = (state.playerPortConcessions ?? []).find(
    (c) =>
      c.portId.trim().toUpperCase() === id &&
      c.leasePaidThroughTick > world.tick,
  );
  if (conc) {
    return {
      level: clampPortCorridorLevel(conc.level ?? 1),
      source: 'concession',
    };
  }

  const hubs = new Set(
    portPickupHubsBound(id).map((h) => h.trim().toUpperCase()).filter(Boolean),
  );
  let maxTier = 1;
  if (hubs.size > 0) {
    for (const w of ensurePlayerWarehouses(state).warehouses) {
      if (!hubs.has(w.icao.trim().toUpperCase())) continue;
      maxTier = Math.max(maxTier, w.tier ?? 1);
    }
  }
  return { level: clampPortCorridorLevel(maxTier), source: 'wh' };
}

/**
 * Soft-spawn nm for an operator catchment hub (concession level), else T1.
 * @deprecated Prefer per-port desk spawn; kept for transitional callers.
 */
export function softSpawnCorridorNmForHub(
  world: CareerEconomyWorld,
  hubIcao: string,
): number {
  const portId = portIdForPickupHubBound(hubIcao);
  if (portId) {
    const { level } = worldPortDeskCorridorLevel(world, portId);
    const nm = corridorNmForLevel(level);
    return nm ?? DEMAND_CORRIDOR_NM_BY_LEVEL[2]!;
  }
  return DEMAND_PORT_CORRIDOR_NM;
}

/**
 * Gate Accept/Hold for a port-desk Demand order.
 */
export function assertDemandPortCorridorReach(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
  opts?: { portId?: string | null },
): void {
  const origin = originIcao.trim().toUpperCase();
  const dest = destIcao.trim().toUpperCase();
  const portId = (
    opts?.portId?.trim() ||
    portIdForPickupHubBound(origin) ||
    ''
  ).toUpperCase();
  if (!portId) {
    throw new Error(
      `Warehouse ${origin} is not a port pickup hub — Demand fulfills from a port desk WH`,
    );
  }

  const pickups = new Set(
    portPickupHubsBound(portId).map((h) => h.trim().toUpperCase()),
  );
  if (pickups.size > 0 && !pickups.has(origin)) {
    throw new Error(
      `Warehouse ${origin} is not a pickup hub for port ${portId}`,
    );
  }

  const { level, source } = resolvePlayerPortCorridorLevel(state, world, portId);
  const maxNm = corridorNmForLevel(level);
  const checkHubs = pickups.size > 0 ? [...pickups] : [origin];
  if (destWithinCorridorNm(dest, checkHubs, maxNm)) return;

  const label = formatPortCorridorReachLabel(level, { source });
  const nextHint =
    level < 3
      ? source === 'concession'
        ? 'Upgrade concession to extend corridor.'
        : 'Upgrade warehouse or claim concession to extend corridor.'
      : '';
  throw new Error(
    `Destination ${dest} is outside ${label} from ${portId}. ${nextHint}`.trim(),
  );
}
