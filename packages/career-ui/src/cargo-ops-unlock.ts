/**
 * Browser-safe mirror of @msfs-compat/shared career-cargo-ops unlock progress.
 * Do not import @msfs-compat/shared from Vite client — the package index pulls node:fs.
 */
import type { CareerCargoOps, CargoOpsCommodityId } from './api';

export type CargoOpsTierId = 'dry' | 'value' | 'time' | 'heavy';

/** Keep in sync with packages/shared/src/career-cargo-ops.ts */
export const CARGO_OPS_COMMODITY_IDS: readonly CargoOpsCommodityId[] = [
  'general',
  'supplies',
  'electronics',
  'perishables',
  'machinery',
];

export const CARGO_OPS_COMMODITY_LABELS: Record<CargoOpsCommodityId, string> = {
  general: 'General',
  supplies: 'Supplies',
  electronics: 'Electronics',
  perishables: 'Perishables',
  machinery: 'Machinery',
};

/** Full freight commodity list for Market filters (not just what's on the board). */
export const CARGO_OPS_FILTER_OPTIONS: readonly {
  id: CargoOpsCommodityId;
  name: string;
}[] = CARGO_OPS_COMMODITY_IDS.map((id) => ({
  id,
  name: CARGO_OPS_COMMODITY_LABELS[id],
}));

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

/** Keep in sync with packages/shared/src/career-cargo-ops.ts */
export const CARGO_OPS_VALUE_UNLOCK = {
  dryCleansRequired: 6,
  peakRepRequired: 70,
  minCleanPerDryCommodity: 1,
} as const;

export const CARGO_OPS_TIME_UNLOCK = {
  electronicsRepRequired: 70,
  electronicsCleansRequired: 5,
} as const;

export const CARGO_OPS_HEAVY_UNLOCK = {
  perishablesRepRequired: 70,
  perishablesCleansRequired: 4,
} as const;

export const CARGO_OPS_HEAVY_SHORTCUT = {
  electronicsRepRequired: 80,
  electronicsCleansRequired: 8,
} as const;

export type CargoOpsUnlockProgress = {
  tierId: CargoOpsTierId;
  unlocked: boolean;
  ready: boolean;
  summary: string;
};

function dryReady(ops: CareerCargoOps): boolean {
  const g = ops.commodities.general;
  const s = ops.commodities.supplies;
  if (!g || !s) return false;
  const { dryCleansRequired, peakRepRequired, minCleanPerDryCommodity } =
    CARGO_OPS_VALUE_UNLOCK;
  return (
    g.settlesOk + s.settlesOk >= dryCleansRequired &&
    Math.max(g.rep, s.rep) >= peakRepRequired &&
    g.settlesOk >= minCleanPerDryCommodity &&
    s.settlesOk >= minCleanPerDryCommodity
  );
}

function valueReady(ops: CareerCargoOps): boolean {
  const e = ops.commodities.electronics;
  if (!e) return false;
  return (
    e.unlocked &&
    e.rep >= CARGO_OPS_TIME_UNLOCK.electronicsRepRequired &&
    e.settlesOk >= CARGO_OPS_TIME_UNLOCK.electronicsCleansRequired
  );
}

function valueHeavyShortcut(ops: CareerCargoOps): boolean {
  const e = ops.commodities.electronics;
  if (!e) return false;
  return (
    e.unlocked &&
    e.rep >= CARGO_OPS_HEAVY_SHORTCUT.electronicsRepRequired &&
    e.settlesOk >= CARGO_OPS_HEAVY_SHORTCUT.electronicsCleansRequired
  );
}

function timeReady(ops: CareerCargoOps): boolean {
  const p = ops.commodities.perishables;
  if (!p) return false;
  return (
    p.unlocked &&
    p.rep >= CARGO_OPS_HEAVY_UNLOCK.perishablesRepRequired &&
    p.settlesOk >= CARGO_OPS_HEAVY_UNLOCK.perishablesCleansRequired
  );
}

/** Human-readable progress toward unlocking a tier (Hangar). */
export function cargoOpsUnlockProgress(
  ops: CareerCargoOps,
  tierId: CargoOpsTierId,
): CargoOpsUnlockProgress {
  if (tierId === 'dry') {
    return { tierId, unlocked: true, ready: true, summary: '' };
  }

  if (tierId === 'value') {
    const g = ops.commodities.general;
    const s = ops.commodities.supplies;
    const e = ops.commodities.electronics;
    const unlocked = Boolean(e?.unlocked);
    const ready = dryReady(ops);
    const {
      dryCleansRequired,
      peakRepRequired,
      minCleanPerDryCommodity,
    } = CARGO_OPS_VALUE_UNLOCK;
    if (unlocked) {
      return {
        tierId,
        unlocked: true,
        ready,
        summary:
          (e?.rep ?? 0) < 30
            ? 'board open · build Electronics rep for better pay'
            : '',
      };
    }
    const cleans = (g?.settlesOk ?? 0) + (s?.settlesOk ?? 0);
    const peak = Math.max(g?.rep ?? 0, s?.rep ?? 0);
    const bothTypes =
      (g?.settlesOk ?? 0) >= minCleanPerDryCommodity &&
      (s?.settlesOk ?? 0) >= minCleanPerDryCommodity;
    return {
      tierId,
      unlocked: false,
      ready,
      summary: [
        `${cleans}/${dryCleansRequired} Dry cleans`,
        bothTypes ? 'both Dry types' : 'need both Dry types',
        `peak rep ${peak}/${peakRepRequired}`,
      ].join(' · '),
    };
  }

  if (tierId === 'time') {
    const e = ops.commodities.electronics;
    const p = ops.commodities.perishables;
    const unlocked = Boolean(p?.unlocked);
    const ready = valueReady(ops);
    if (unlocked) {
      return {
        tierId,
        unlocked: true,
        ready,
        summary:
          (p?.rep ?? 0) < 30
            ? 'board open · build Perishables rep for better pay'
            : '',
      };
    }
    if (!e?.unlocked) {
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
      summary: `${e.settlesOk}/${CARGO_OPS_TIME_UNLOCK.electronicsCleansRequired} Electronics cleans · rep ${e.rep}/${CARGO_OPS_TIME_UNLOCK.electronicsRepRequired}`,
    };
  }

  // heavy
  const p = ops.commodities.perishables;
  const e = ops.commodities.electronics;
  const m = ops.commodities.machinery;
  const unlocked = Boolean(m?.unlocked);
  const ready = timeReady(ops) || valueHeavyShortcut(ops);
  if (unlocked) {
    return {
      tierId,
      unlocked: true,
      ready,
      summary:
        (m?.rep ?? 0) < 30
          ? 'board open · build Machinery rep for better pay'
          : '',
    };
  }
  if (!p?.unlocked && !e?.unlocked) {
    return {
      tierId,
      unlocked: false,
      ready: false,
      summary: 'Unlock Time (or Value shortcut) first',
    };
  }
  const viaTime = p?.unlocked
    ? `${p.settlesOk}/${CARGO_OPS_HEAVY_UNLOCK.perishablesCleansRequired} Perishables cleans · rep ${p.rep}/${CARGO_OPS_HEAVY_UNLOCK.perishablesRepRequired}`
    : null;
  const viaShortcut = e?.unlocked
    ? `or Electronics ${e.settlesOk}/${CARGO_OPS_HEAVY_SHORTCUT.electronicsCleansRequired} cleans · rep ${e.rep}/${CARGO_OPS_HEAVY_SHORTCUT.electronicsRepRequired}`
    : null;
  return {
    tierId,
    unlocked: false,
    ready,
    summary: [viaTime, viaShortcut].filter(Boolean).join(' · ') || 'Unlock Time first',
  };
}
