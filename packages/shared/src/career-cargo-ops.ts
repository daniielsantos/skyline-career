/**
 * Cargo Ops ladder — unlock freights by commodity reputation.
 * Dry (general + supplies) → Value (electronics) → Time (perishables) → Heavy (machinery).
 */

import type {
  CargoOpsCommodityId,
  CargoOpsCommodityState,
  CareerCargoOps,
  CommodityId,
  MissionIntent,
} from './types/career-economy.js';
import type { FlightScoreSnapshot } from './career-flight-score.js';

export const CARGO_OPS_COMMODITY_IDS: readonly CargoOpsCommodityId[] = [
  'general',
  'supplies',
  'electronics',
  'perishables',
  'machinery',
] as const;

export const CARGO_OPS_DRY_IDS: readonly CargoOpsCommodityId[] = [
  'general',
  'supplies',
] as const;

/** Score % required for a "clean" settle that counts toward unlock. */
export const CARGO_OPS_CLEAN_SCORE: Record<CargoOpsCommodityId, number> = {
  general: 70,
  supplies: 70,
  electronics: 80,
  perishables: 75,
  machinery: 75,
};

export type CargoOpsTierId = 'dry' | 'value' | 'time' | 'heavy';

export const CARGO_OPS_TIERS: readonly {
  id: CargoOpsTierId;
  label: string;
  commodityIds: readonly CargoOpsCommodityId[];
}[] = [
  { id: 'dry', label: 'Dry', commodityIds: ['general', 'supplies'] },
  { id: 'value', label: 'Value', commodityIds: ['electronics'] },
  { id: 'time', label: 'Time', commodityIds: ['perishables'] },
  { id: 'heavy', label: 'Heavy', commodityIds: ['machinery'] },
];

/** Dry → Value unlock thresholds. */
export const CARGO_OPS_VALUE_UNLOCK = {
  dryCleansRequired: 6,
  peakRepRequired: 70,
  /** Each Dry commodity must contribute at least this many cleans. */
  minCleanPerDryCommodity: 1,
} as const;

/** Value → Time unlock thresholds (electronics progress). */
export const CARGO_OPS_TIME_UNLOCK = {
  electronicsRepRequired: 70,
  electronicsCleansRequired: 5,
} as const;

/** Time → Heavy unlock thresholds (perishables path). */
export const CARGO_OPS_HEAVY_UNLOCK = {
  perishablesRepRequired: 70,
  perishablesCleansRequired: 4,
} as const;

/** Value → Heavy shortcut (skip Time). */
export const CARGO_OPS_HEAVY_SHORTCUT = {
  electronicsRepRequired: 80,
  electronicsCleansRequired: 8,
} as const;

function clampRep(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function defaultCommodityState(
  id: CargoOpsCommodityId,
): CargoOpsCommodityState {
  const dry = id === 'general' || id === 'supplies';
  return {
    unlocked: dry,
    rep: dry ? 55 : 0,
    settlesOk: 0,
  };
}

export function emptyCareerCargoOps(): CareerCargoOps {
  const commodities = {} as Record<
    CargoOpsCommodityId,
    CargoOpsCommodityState
  >;
  for (const id of CARGO_OPS_COMMODITY_IDS) {
    commodities[id] = defaultCommodityState(id);
  }
  return { commodities };
}

export function isCargoOpsCommodityId(
  id: string,
): id is CargoOpsCommodityId {
  return (CARGO_OPS_COMMODITY_IDS as readonly string[]).includes(id);
}

export function normalizeCareerCargoOps(raw: unknown): CareerCargoOps {
  const base = emptyCareerCargoOps();
  if (!raw || typeof raw !== 'object') return base;
  const src = (raw as CareerCargoOps).commodities;
  if (!src || typeof src !== 'object') return base;
  for (const id of CARGO_OPS_COMMODITY_IDS) {
    const row = src[id];
    if (!row || typeof row !== 'object') continue;
    base.commodities[id] = {
      unlocked: Boolean(row.unlocked) || id === 'general' || id === 'supplies',
      rep: clampRep(typeof row.rep === 'number' ? row.rep : base.commodities[id].rep),
      settlesOk:
        typeof row.settlesOk === 'number' && Number.isFinite(row.settlesOk)
          ? Math.max(0, Math.floor(row.settlesOk))
          : 0,
    };
  }
  // Sticky unlocks once earned; Dry always open.
  refreshCargoOpsUnlocks(base);
  return base;
}

export function dryReady(ops: CareerCargoOps): boolean {
  const g = ops.commodities.general;
  const s = ops.commodities.supplies;
  const { dryCleansRequired, peakRepRequired, minCleanPerDryCommodity } =
    CARGO_OPS_VALUE_UNLOCK;
  const settles = g.settlesOk + s.settlesOk;
  const peakRep = Math.max(g.rep, s.rep);
  return (
    settles >= dryCleansRequired &&
    peakRep >= peakRepRequired &&
    g.settlesOk >= minCleanPerDryCommodity &&
    s.settlesOk >= minCleanPerDryCommodity
  );
}

export function valueReady(ops: CareerCargoOps): boolean {
  const e = ops.commodities.electronics;
  return (
    e.unlocked &&
    e.rep >= CARGO_OPS_TIME_UNLOCK.electronicsRepRequired &&
    e.settlesOk >= CARGO_OPS_TIME_UNLOCK.electronicsCleansRequired
  );
}

export function valueHeavyShortcut(ops: CareerCargoOps): boolean {
  const e = ops.commodities.electronics;
  return (
    e.unlocked &&
    e.rep >= CARGO_OPS_HEAVY_SHORTCUT.electronicsRepRequired &&
    e.settlesOk >= CARGO_OPS_HEAVY_SHORTCUT.electronicsCleansRequired
  );
}

export function timeReady(ops: CareerCargoOps): boolean {
  const p = ops.commodities.perishables;
  return (
    p.unlocked &&
    p.rep >= CARGO_OPS_HEAVY_UNLOCK.perishablesRepRequired &&
    p.settlesOk >= CARGO_OPS_HEAVY_UNLOCK.perishablesCleansRequired
  );
}

/** Recompute sticky unlocks from current rep / settlesOk. */
export function refreshCargoOpsUnlocks(ops: CareerCargoOps): CareerCargoOps {
  ops.commodities.general.unlocked = true;
  ops.commodities.supplies.unlocked = true;
  if (dryReady(ops)) ops.commodities.electronics.unlocked = true;
  if (valueReady(ops)) ops.commodities.perishables.unlocked = true;
  if (timeReady(ops) || valueHeavyShortcut(ops)) {
    ops.commodities.machinery.unlocked = true;
  }
  return ops;
}

export type CargoOpsUnlockProgress = {
  tierId: CargoOpsTierId;
  /** Tier commodity already unlocked (sticky). */
  unlocked: boolean;
  /** Gate met right now (independent of sticky flag). */
  ready: boolean;
  /** Short progress line for Hangar UI. */
  summary: string;
};

/**
 * Human-readable progress toward unlocking a locked tier (or status when open).
 * `dry` is always unlocked — summary is empty.
 */
export function cargoOpsUnlockProgress(
  ops: CareerCargoOps,
  tierId: CargoOpsTierId,
): CargoOpsUnlockProgress {
  const normalized = normalizeCareerCargoOps(ops);
  if (tierId === 'dry') {
    return {
      tierId,
      unlocked: true,
      ready: true,
      summary: '',
    };
  }

  if (tierId === 'value') {
    const g = normalized.commodities.general;
    const s = normalized.commodities.supplies;
    const unlocked = normalized.commodities.electronics.unlocked;
    const ready = dryReady(normalized);
    const {
      dryCleansRequired,
      peakRepRequired,
      minCleanPerDryCommodity,
    } = CARGO_OPS_VALUE_UNLOCK;
    const cleans = g.settlesOk + s.settlesOk;
    const peak = Math.max(g.rep, s.rep);
    const bothTypes =
      g.settlesOk >= minCleanPerDryCommodity &&
      s.settlesOk >= minCleanPerDryCommodity;
    if (unlocked) {
      const elecRep = normalized.commodities.electronics.rep;
      return {
        tierId,
        unlocked: true,
        ready,
        summary:
          elecRep < 30
            ? 'board open · build Electronics rep for better pay'
            : '',
      };
    }
    const parts = [
      `${cleans}/${dryCleansRequired} Dry cleans`,
      bothTypes ? 'both Dry types' : 'need both Dry types',
      `peak rep ${peak}/${peakRepRequired}`,
    ];
    return {
      tierId,
      unlocked: false,
      ready,
      summary: parts.join(' · '),
    };
  }

  if (tierId === 'time') {
    const e = normalized.commodities.electronics;
    const unlocked = normalized.commodities.perishables.unlocked;
    const ready = valueReady(normalized);
    const { electronicsRepRequired, electronicsCleansRequired } =
      CARGO_OPS_TIME_UNLOCK;
    if (unlocked) {
      return {
        tierId,
        unlocked: true,
        ready,
        summary:
          e.rep < 30
            ? 'board open · build Perishables rep for better pay'
            : '',
      };
    }
    if (!e.unlocked) {
      return {
        tierId,
        unlocked: false,
        ready: false,
        summary: 'Unlock Value first',
      };
    }
    return {
      tierId,
      unlocked: false,
      ready,
      summary: `${e.settlesOk}/${electronicsCleansRequired} Electronics cleans · rep ${e.rep}/${electronicsRepRequired}`,
    };
  }

  // heavy
  {
    const p = normalized.commodities.perishables;
    const e = normalized.commodities.electronics;
    const unlocked = normalized.commodities.machinery.unlocked;
    const ready = timeReady(normalized) || valueHeavyShortcut(normalized);
    if (unlocked) {
      return {
        tierId,
        unlocked: true,
        ready,
        summary:
          normalized.commodities.machinery.rep < 30
            ? 'board open · build Machinery rep for better pay'
            : '',
      };
    }
    if (!p.unlocked && !e.unlocked) {
      return {
        tierId,
        unlocked: false,
        ready: false,
        summary: 'Unlock Time (or Value shortcut) first',
      };
    }
    const viaTime = p.unlocked
      ? `${p.settlesOk}/${CARGO_OPS_HEAVY_UNLOCK.perishablesCleansRequired} Perishables cleans · rep ${p.rep}/${CARGO_OPS_HEAVY_UNLOCK.perishablesRepRequired}`
      : null;
    const viaShortcut = e.unlocked
      ? `or Electronics ${e.settlesOk}/${CARGO_OPS_HEAVY_SHORTCUT.electronicsCleansRequired} cleans · rep ${e.rep}/${CARGO_OPS_HEAVY_SHORTCUT.electronicsRepRequired}`
      : null;
    const summary = [viaTime, viaShortcut].filter(Boolean).join(' · ');
    return {
      tierId,
      unlocked: false,
      ready,
      summary: summary || 'Unlock Time first',
    };
  }
}

export function cargoOpsIsUnlocked(
  ops: CareerCargoOps | undefined,
  commodityId: CommodityId,
): boolean {
  // No ladder state → do not gate (legacy callers / unit tests).
  if (ops == null) return true;
  if (!isCargoOpsCommodityId(commodityId)) return true;
  const state = normalizeCareerCargoOps(ops).commodities[commodityId];
  return state.unlocked;
}

/**
 * Dev / cheat: every cargo commodity unlocked (does not bump rep/cleans).
 * Returns a fresh normalized copy — safe to use for gates without persisting.
 */
export function unlockAllCareerCargoOps(
  ops?: CareerCargoOps | null,
): CareerCargoOps {
  const next = normalizeCareerCargoOps(ops ?? undefined);
  for (const id of CARGO_OPS_COMMODITY_IDS) {
    next.commodities[id].unlocked = true;
  }
  return next;
}

/** Pay multiplier from reputation (1.0 at mid rep). */
export function cargoOpsPayMult(
  ops: CareerCargoOps | undefined,
  commodityId: CommodityId,
): number {
  if (ops == null || !isCargoOpsCommodityId(commodityId)) return 1;
  const rep = normalizeCareerCargoOps(ops).commodities[commodityId].rep;
  if (rep < 30) return 0.85;
  if (rep < 50) return 0.95;
  if (rep < 70) return 1.0;
  if (rep < 85) return 1.08;
  return 1.15;
}

export type CargoOpsSettleInput = {
  commodityId: CommodityId;
  onTime: boolean;
  lateTicks: number;
  cancelled?: boolean;
  failed?: boolean;
  flightScorePct?: number | null;
};

export type CargoOpsDelta = {
  commodityId: CargoOpsCommodityId;
  deltaRep: number;
  repBefore: number;
  repAfter: number;
  settlesOkAfter: number;
  unlockedNow: boolean;
  clean: boolean;
};

function scorePctOf(
  score: FlightScoreSnapshot | null | undefined,
): number | undefined {
  if (!score || typeof score.pct !== 'number' || !Number.isFinite(score.pct)) {
    return undefined;
  }
  return score.pct;
}

/**
 * Reputation delta for one commodity line after settle.
 * Dry without Watch score: on-time still counts as clean.
 * Higher tiers need a score sample to advance settlesOk.
 */
export function computeCargoOpsRepDelta(
  commodityId: CargoOpsCommodityId,
  input: {
    onTime: boolean;
    lateTicks: number;
    cancelled?: boolean;
    failed?: boolean;
    flightScorePct?: number | null;
  },
): { deltaRep: number; clean: boolean } {
  if (input.cancelled || input.failed) {
    const cancel =
      commodityId === 'electronics'
        ? -8
        : commodityId === 'perishables'
          ? -10
          : commodityId === 'machinery'
            ? -8
            : -5;
    return { deltaRep: cancel, clean: false };
  }

  const threshold = CARGO_OPS_CLEAN_SCORE[commodityId];
  const score = input.flightScorePct;
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const dry = commodityId === 'general' || commodityId === 'supplies';
  const scoreOk = hasScore ? score! >= threshold : dry;
  const clean = Boolean(input.onTime && scoreOk);

  if (input.lateTicks >= 2) {
    const d =
      commodityId === 'perishables'
        ? -14
        : commodityId === 'electronics'
          ? -8
          : commodityId === 'machinery'
            ? -7
            : -6;
    return { deltaRep: d, clean: false };
  }
  if (input.lateTicks === 1) {
    const d =
      commodityId === 'perishables'
        ? -8
        : commodityId === 'electronics'
          ? -4
          : commodityId === 'machinery'
            ? -4
            : -3;
    return { deltaRep: d, clean: false };
  }

  // On-time
  if (hasScore && score! < 50) {
    const d =
      commodityId === 'electronics'
        ? -6
        : commodityId === 'perishables'
          ? -4
          : commodityId === 'machinery'
            ? -3
            : -2;
    return { deltaRep: d, clean: false };
  }

  if (clean) {
    const d =
      commodityId === 'perishables'
        ? 6
        : commodityId === 'electronics' || commodityId === 'machinery'
          ? 5
          : 4;
    return { deltaRep: d, clean: true };
  }

  // On-time but weak score (or higher tier without score)
  if (input.onTime && hasScore && score! < threshold) {
    if (commodityId === 'perishables') return { deltaRep: -2, clean: false };
    if (commodityId === 'electronics') return { deltaRep: 0, clean: false };
    if (commodityId === 'machinery') return { deltaRep: -1, clean: false };
    return { deltaRep: 1, clean: false };
  }

  if (input.onTime && !hasScore && !dry) {
    return { deltaRep: 1, clean: false };
  }

  return { deltaRep: 0, clean: false };
}

export function applyCargoOpsOnSettle(
  ops: CareerCargoOps | undefined,
  mission: Pick<MissionIntent, 'commodityId' | 'lots' | 'status'>,
  settlement: {
    onTime: boolean;
    lateTicks: number;
    flightScore?: FlightScoreSnapshot | null;
  },
): { cargoOps: CareerCargoOps; deltas: CargoOpsDelta[] } {
  const next = normalizeCareerCargoOps(ops);
  const scorePct = scorePctOf(settlement.flightScore ?? undefined);
  const lines =
    Array.isArray(mission.lots) && mission.lots.length > 0
      ? mission.lots.map((l) => l.commodityId)
      : [mission.commodityId];
  const seen = new Set<CargoOpsCommodityId>();
  const deltas: CargoOpsDelta[] = [];

  for (const rawId of lines) {
    if (!isCargoOpsCommodityId(rawId) || seen.has(rawId)) continue;
    seen.add(rawId);
    const before = next.commodities[rawId];
    const unlockedBefore = before.unlocked;
    const { deltaRep, clean } = computeCargoOpsRepDelta(rawId, {
      onTime: settlement.onTime,
      lateTicks: settlement.lateTicks,
      flightScorePct: scorePct,
    });
    const repAfter = clampRep(before.rep + deltaRep);
    const settlesOkAfter = clean ? before.settlesOk + 1 : before.settlesOk;
    next.commodities[rawId] = {
      ...before,
      rep: repAfter,
      settlesOk: settlesOkAfter,
    };
    refreshCargoOpsUnlocks(next);
    deltas.push({
      commodityId: rawId,
      deltaRep,
      repBefore: before.rep,
      repAfter,
      settlesOkAfter,
      unlockedNow: !unlockedBefore && next.commodities[rawId].unlocked,
      clean,
    });
  }

  // Flag commodities newly unlocked as a side-effect (e.g. Dry unlocks Value).
  for (const id of CARGO_OPS_COMMODITY_IDS) {
    const was =
      ops != null
        ? normalizeCareerCargoOps(ops).commodities[id].unlocked
        : id === 'general' || id === 'supplies';
    const now = next.commodities[id].unlocked;
    if (!was && now) {
      const existing = deltas.find((d) => d.commodityId === id);
      if (existing) existing.unlockedNow = true;
      else {
        deltas.push({
          commodityId: id,
          deltaRep: 0,
          repBefore: next.commodities[id].rep,
          repAfter: next.commodities[id].rep,
          settlesOkAfter: next.commodities[id].settlesOk,
          unlockedNow: true,
          clean: false,
        });
      }
    }
  }

  return { cargoOps: next, deltas };
}

/** Extra Value-tier payout haircut when score is soft (fraction of contract pay). */
export function cargoOpsValueScorePenaltyFraction(
  commodityId: CommodityId,
  flightScorePct: number | null | undefined,
): number {
  if (commodityId !== 'electronics') return 0;
  if (typeof flightScorePct !== 'number' || !Number.isFinite(flightScorePct)) {
    return 0;
  }
  return flightScorePct < 70 ? 0.05 : 0;
}

/** Perishables late penalty multiplier vs normal rate. */
export function cargoOpsLatePenaltyMult(commodityId: CommodityId): number {
  return commodityId === 'perishables' ? 1.5 : 1;
}

export function formatCargoOpsDeltas(deltas: CargoOpsDelta[]): string {
  if (deltas.length === 0) return '';
  return deltas
    .map((d) => {
      const sign = d.deltaRep > 0 ? '+' : '';
      const unlock = d.unlockedNow ? ' · unlocked' : '';
      return `${d.commodityId} ${sign}${d.deltaRep}→${d.repAfter}${unlock}`;
    })
    .join(' · ');
}
