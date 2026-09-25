/**
 * IH-3 — VA desk auto-haul (Fase 3).
 *
 * Owner opts in; on economy day settle the desk posts Internal Haul bridges
 * from the same Scout WH→WH list a human would confirm. Does not fly.
 * Caps stay tighter than manual Scout so a human dispatcher stays useful.
 */

import { economyDayIndex } from './career-weather.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import {
  listPortScoutBridgeSuggestions,
  PORT_SCOUT_MIN_KG,
} from './career-port-scout.js';
import {
  clampInternalHaulPayUsd,
  holdWarehouseBridge,
  quoteInternalHaulPayUsd,
} from './career-warehouse-bridge.js';
import { listDemandHolds } from './career-demand.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  VaAutoHaulState,
} from './types/career-economy.js';

/** AI desk daily posts — well under Scout's suggest list (8). */
export const VA_AUTO_HAUL_MAX_PER_DAY_DEFAULT = 2;
export const VA_AUTO_HAUL_MAX_PER_DAY_MIN = 1;
export const VA_AUTO_HAUL_MAX_PER_DAY_MAX = 3;

/** Concurrent open bridge holds (manual + auto) before desk stops. */
export const VA_AUTO_HAUL_MAX_OPEN_HOLDS = 3;

/** Need a second seat on the roster — solo owner uses Scout confirm. */
export const VA_AUTO_HAUL_MIN_MEMBERS = 2;

export const VA_AUTO_HAUL_PAY_MULT_DEFAULT = 1;
export const VA_AUTO_HAUL_PAY_MULT_MIN = 0.8;
export const VA_AUTO_HAUL_PAY_MULT_MAX = 1.5;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function defaultVaAutoHaulState(): VaAutoHaulState {
  return {
    enabled: false,
    maxHaulsPerDay: VA_AUTO_HAUL_MAX_PER_DAY_DEFAULT,
    payMult: VA_AUTO_HAUL_PAY_MULT_DEFAULT,
    walletFloorUsd: 0,
    postedToday: 0,
    postedDayIndex: 0,
  };
}

export function normalizeVaAutoHaulState(
  raw: unknown,
): VaAutoHaulState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const maxHaulsPerDay = clampMaxHaulsPerDay(
    typeof o.maxHaulsPerDay === 'number' ? o.maxHaulsPerDay : undefined,
  );
  const payMult = clampPayMult(
    typeof o.payMult === 'number' ? o.payMult : undefined,
  );
  const walletFloorUsd = money(
    Math.max(
      0,
      typeof o.walletFloorUsd === 'number' && Number.isFinite(o.walletFloorUsd)
        ? o.walletFloorUsd
        : 0,
    ),
  );
  const postedToday =
    typeof o.postedToday === 'number' && Number.isFinite(o.postedToday)
      ? Math.max(0, Math.floor(o.postedToday))
      : 0;
  const postedDayIndex =
    typeof o.postedDayIndex === 'number' && Number.isFinite(o.postedDayIndex)
      ? Math.floor(o.postedDayIndex)
      : 0;
  return {
    enabled: o.enabled === true,
    maxHaulsPerDay,
    payMult,
    walletFloorUsd,
    postedToday,
    postedDayIndex,
  };
}

export function ensureVaAutoHaul(
  state: CareerMissionsState,
): VaAutoHaulState {
  if (!state.vaAutoHaul) {
    state.vaAutoHaul = defaultVaAutoHaulState();
  }
  return state.vaAutoHaul;
}

export function clampMaxHaulsPerDay(raw?: number): number {
  if (raw == null || !Number.isFinite(raw)) {
    return VA_AUTO_HAUL_MAX_PER_DAY_DEFAULT;
  }
  return Math.max(
    VA_AUTO_HAUL_MAX_PER_DAY_MIN,
    Math.min(VA_AUTO_HAUL_MAX_PER_DAY_MAX, Math.round(raw)),
  );
}

export function clampPayMult(raw?: number): number {
  if (raw == null || !Number.isFinite(raw)) {
    return VA_AUTO_HAUL_PAY_MULT_DEFAULT;
  }
  return money(
    Math.max(
      VA_AUTO_HAUL_PAY_MULT_MIN,
      Math.min(VA_AUTO_HAUL_PAY_MULT_MAX, raw),
    ),
  );
}

export type UpsertVaAutoHaulOpts = {
  enabled?: boolean;
  maxHaulsPerDay?: number;
  payMult?: number;
  walletFloorUsd?: number;
};

/** Owner Config — mutate desk rules (does not post). */
export function upsertVaAutoHaul(
  state: CareerMissionsState,
  opts: UpsertVaAutoHaulOpts,
): VaAutoHaulState {
  const cur = ensureVaAutoHaul(state);
  if (opts.enabled !== undefined) cur.enabled = opts.enabled === true;
  if (opts.maxHaulsPerDay !== undefined) {
    cur.maxHaulsPerDay = clampMaxHaulsPerDay(opts.maxHaulsPerDay);
  }
  if (opts.payMult !== undefined) cur.payMult = clampPayMult(opts.payMult);
  if (opts.walletFloorUsd !== undefined) {
    cur.walletFloorUsd = money(Math.max(0, opts.walletFloorUsd));
  }
  return cur;
}

function alignPostedDay(cfg: VaAutoHaulState, day: number): void {
  if (cfg.postedDayIndex !== day) {
    cfg.postedDayIndex = day;
    cfg.postedToday = 0;
  }
}

function openBridgeHoldCount(state: CareerMissionsState): number {
  return listDemandHolds(state).filter((h) => (h.kind ?? 'demand') === 'bridge')
    .length;
}

export type TickVaAutoHaulOpts = {
  companyId?: string;
  /** Company must be va_listed. */
  vaListed?: boolean;
  /** Roster size including owner. */
  memberCount?: number;
};

export type TickVaAutoHaulResult = {
  posted: number;
  skipped: string | null;
};

/**
 * Post up to remaining daily Internal Haul bridges from Scout suggestions.
 * Call on the same day-boundary as Port auto-buy.
 */
export function tickVaAutoHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: TickVaAutoHaulOpts = {},
): TickVaAutoHaulResult {
  const cfg = ensureVaAutoHaul(state);
  const day = economyDayIndex(world.tick);
  alignPostedDay(cfg, day);

  if (!cfg.enabled) {
    return { posted: 0, skipped: 'disabled' };
  }
  if (opts.vaListed === false) {
    return { posted: 0, skipped: 'not_listed' };
  }
  const members = opts.memberCount ?? 0;
  if (members < VA_AUTO_HAUL_MIN_MEMBERS) {
    return { posted: 0, skipped: 'need_members' };
  }

  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  let remaining = cfg.maxHaulsPerDay - cfg.postedToday;
  if (remaining <= 0) {
    return { posted: 0, skipped: 'daily_cap' };
  }

  const open = openBridgeHoldCount(state);
  if (open >= VA_AUTO_HAUL_MAX_OPEN_HOLDS) {
    return { posted: 0, skipped: 'open_holds' };
  }

  const suggestions = listPortScoutBridgeSuggestions(state, world, {
    max: 8,
    companyId,
  }).filter((s) => s.kg >= PORT_SCOUT_MIN_KG);

  if (suggestions.length === 0) {
    return { posted: 0, skipped: 'no_routes' };
  }

  let posted = 0;
  for (const s of suggestions) {
    if (remaining <= 0) break;
    if (openBridgeHoldCount(state) >= VA_AUTO_HAUL_MAX_OPEN_HOLDS) break;

    const suggested = quoteInternalHaulPayUsd(world, {
      originIcao: s.originIcao,
      destIcao: s.destIcao,
      commodityId: s.commodityId,
      kg: s.kg,
      distanceNm: s.distanceNm,
    });
    const pilotPayUsd = clampInternalHaulPayUsd(
      suggested,
      money(suggested * cfg.payMult),
    );
    if (state.walletUsd - pilotPayUsd < cfg.walletFloorUsd) {
      continue;
    }
    if (state.walletUsd < pilotPayUsd) {
      continue;
    }

    try {
      holdWarehouseBridge(state, world, {
        originIcao: s.originIcao,
        destIcao: s.destIcao,
        commodityId: s.commodityId,
        kg: s.kg,
        pilotPayUsd,
        heldByAuto: true,
      });
      cfg.postedToday += 1;
      remaining -= 1;
      posted += 1;
    } catch {
      // Duplicate hold / stock race — try next suggestion.
      continue;
    }
  }

  return {
    posted,
    skipped: posted > 0 ? null : 'no_affordable_route',
  };
}
