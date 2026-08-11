import { TICKS_PER_HOUR } from './career-clock.js';
import { CLASS_OPS_STARTER_IDS } from './career-class-ops.js';

/** Sortable Freights board columns (matches career-ui). */
export type MarketBoardSortKey =
  | 'distance'
  | 'cargo'
  | 'load'
  | 'expires'
  | 'pay'
  | 'net'
  | 'access'
  | 'starter';

export type MarketBoardSortDirection = 'asc' | 'desc';

export type MarketBoardSortLevel = {
  key: MarketBoardSortKey;
  direction: MarketBoardSortDirection;
};

/** Row shape needed to filter/sort the Freights board after listing lots. */
export type MarketBoardSortable = {
  distanceNm?: number;
  commodityId: string;
  commodityName: string;
  availableKg: number;
  expiresAtTick: number;
  payUsd: number;
  /** Estimated net (pay − Jet-A) for the board-selected aircraft. */
  estimatedNetUsd?: number | null;
  /** Kg the selected aircraft can lift from this lot (0 = unusable). */
  estimatedLiftKg?: number | null;
  /** False when distance exceeds selected airframe range. */
  estimatedInRange?: boolean | null;
  /** False when block fuel exceeds tank. */
  estimatedFuelFeasible?: boolean | null;
  /** True when Cargo Ops has this commodity locked for the player. */
  cargoLocked?: boolean;
  /** True when Class Ops cannot sit this crew offer (or lot is above ceiling). */
  classLocked?: boolean;
  /** Open Crew needed / ferry hold. */
  crewNeeded?: boolean;
  /** NPC class on a crew-needed hold. */
  crewClassId?: string;
  /** Last-mile Dry break-bulk from a metro/spoke. */
  lastMile?: boolean;
  /** Cross-country lane freight (from lot pressure). */
  international?: boolean;
  /** Soft-field Amazon bush OD. */
  bush?: boolean;
};

export type MarketBoardAccessFilter = 'open' | 'locked';

/** Freights route scope: international lanes vs domestic vs Amazon bush. */
export type MarketBoardLaneFilter = 'intl' | 'domestic' | 'bush';

/**
 * Kg to quote for board lift / viable filters.
 * Open Contracts are fully reserved (`availableKg` often 0) — use claim cargo.
 */
export function boardFreightKgForEstimates(opts: {
  availableKg: number;
  crewNeeded?: boolean;
  claimCargoKg?: number;
}): number {
  if (
    opts.crewNeeded === true &&
    typeof opts.claimCargoKg === 'number' &&
    Number.isFinite(opts.claimCargoKg) &&
    opts.claimCargoKg > 0
  ) {
    return Math.floor(opts.claimCargoKg);
  }
  return Math.max(0, Math.floor(opts.availableKg));
}

/**
 * Pay shown/sorted for a board row.
 * Contract/Ferry: pilot fee (what you earn) — not operator freight on the whole lot.
 * Normal freights: full lot payUsd.
 */
export function boardDisplayPayUsd(opts: {
  lotPayUsd: number;
  quantityKg: number;
  crewNeeded?: boolean;
  claimCargoKg?: number;
  /** Max contract-pilot fee; preferred when present. */
  pilotFeeUsd?: number;
}): number {
  if (
    opts.crewNeeded === true &&
    typeof opts.pilotFeeUsd === 'number' &&
    Number.isFinite(opts.pilotFeeUsd) &&
    opts.pilotFeeUsd > 0
  ) {
    return Math.round(opts.pilotFeeUsd);
  }
  const lotPay = Math.max(0, Math.round(opts.lotPayUsd));
  if (
    opts.crewNeeded === true &&
    typeof opts.claimCargoKg === 'number' &&
    Number.isFinite(opts.claimCargoKg) &&
    opts.claimCargoKg > 0 &&
    opts.quantityKg > 0
  ) {
    return Math.max(
      1,
      Math.round((opts.claimCargoKg / opts.quantityKg) * lotPay),
    );
  }
  return lotPay;
}


export type MarketBoardQueryOpts = {
  /** Max great-circle distance (nm). */
  distanceMaxNm?: number;
  commodityId?: string;
  /** Exclude lots heavier than this available kg. */
  loadMaxKg?: number;
  /** Keep lots that expire within this many wall-clock hours. */
  expiresWithinHours?: number;
  /** Minimum contract pay (USD). */
  minPayUsd?: number;
  /** Keep lots with estimated net strictly above this (USD). */
  minNetUsd?: number;
  /** Shortcut: keep lots with estimatedNetUsd > 0. */
  profitableOnly?: boolean;
  /**
   * Keep lots the selected aircraft can actually fly now:
   * unlocked commodity, in range, lift &gt; 0, fuel-feasible.
   * Empty hangar (`hangarEmpty`): crew-needed holds the player can sit.
   */
  viableOnly?: boolean;
  /**
   * No player aircraft selected — Freights is a contract-pilot board.
   * Injects starter-class / last-mile / short-hop sort and viable = crew I can fly.
   */
  hangarEmpty?: boolean;
  /** Cargo Ops lock filter: open = unlocked only, locked = locked only. */
  accessFilter?: MarketBoardAccessFilter;
  /** International vs domestic route filter. */
  laneFilter?: MarketBoardLaneFilter;
  /** Current economy tick (integer batches). */
  currentTick: number;
  sorts?: MarketBoardSortLevel[];
  /** 1-based page. */
  page?: number;
  pageSize?: number;
};

const SORT_KEYS = new Set<MarketBoardSortKey>([
  'distance',
  'cargo',
  'load',
  'expires',
  'pay',
  'net',
  'access',
  'starter',
]);

const STARTER_CREW_CLASSES = new Set<string>(CLASS_OPS_STARTER_IDS);

/** Lower rank surfaces first on the empty-hangar board. */
export function starterBoardFitRank(
  row: Pick<
    MarketBoardSortable,
    | 'classLocked'
    | 'crewNeeded'
    | 'crewClassId'
    | 'lastMile'
    | 'availableKg'
    | 'distanceNm'
  >,
): number {
  if (row.classLocked) return 50;
  if (
    row.crewNeeded === true &&
    row.crewClassId != null &&
    STARTER_CREW_CLASSES.has(row.crewClassId)
  ) {
    return 0;
  }
  if (row.lastMile === true) return 1;
  const gaSized =
    typeof row.availableKg === 'number' &&
    row.availableKg > 0 &&
    row.availableKg <= 450;
  const shortHop =
    typeof row.distanceNm === 'number' && row.distanceNm <= 600;
  if (gaSized && shortHop) return 2;
  if (row.crewNeeded === true) return 30;
  return 10;
}

/** Default Freights sort: unlocked first (no secondary pay sort). */
export const DEFAULT_MARKET_BOARD_SORTS: readonly MarketBoardSortLevel[] = [
  { key: 'access', direction: 'asc' },
];

/**
 * Keep Cargo Ops access as the primary sort unless the client explicitly asks
 * for locked-first (`access:desc`). Prevents pay-only sorts from burying open lots.
 */
export function ensureAccessPrimarySort(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  const levels = sorts?.length ? [...sorts] : [...DEFAULT_MARKET_BOARD_SORTS];
  const access = levels.find((s) => s.key === 'access');
  const rest = levels.filter((s) => s.key !== 'access');
  return [
    access ?? { key: 'access', direction: 'asc' },
    ...rest,
  ];
}

/**
 * Empty-hangar Freights: after Cargo Ops access, surface starter crew holds
 * and last-mile Dry, then nearer hops — not Wide pay.
 */
export function ensureHangarEmptySorts(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  const levels = ensureAccessPrimarySort(sorts);
  if (levels.some((s) => s.key === 'starter')) return levels;
  const access = levels[0] ?? { key: 'access' as const, direction: 'asc' as const };
  const rest = levels.slice(1).filter((s) => s.key !== 'distance');
  return [
    access,
    { key: 'starter', direction: 'asc' },
    { key: 'distance', direction: 'asc' },
    ...rest,
  ];
}

/** Parse `distance:asc,pay:desc` (or repeated `sort=` values joined). */
export function parseMarketBoardSorts(
  raw: string | null | undefined,
): MarketBoardSortLevel[] {
  if (!raw?.trim()) return [];
  const levels: MarketBoardSortLevel[] = [];
  const seen = new Set<MarketBoardSortKey>();
  for (const part of raw.split(',')) {
    const token = part.trim().toLowerCase();
    if (!token) continue;
    const [keyRaw, dirRaw] = token.split(':');
    const key = keyRaw as MarketBoardSortKey;
    if (!SORT_KEYS.has(key) || seen.has(key)) continue;
    const direction: MarketBoardSortDirection =
      dirRaw === 'desc' ? 'desc' : 'asc';
    seen.add(key);
    levels.push({ key, direction });
  }
  return levels;
}

export function formatMarketBoardSorts(sorts: MarketBoardSortLevel[]): string {
  return sorts.map((s) => `${s.key}:${s.direction}`).join(',');
}

export function parseMarketBoardAccessFilter(
  raw: string | null | undefined,
): MarketBoardAccessFilter | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'open' || v === 'locked') return v;
  return undefined;
}

export function parseMarketBoardLaneFilter(
  raw: string | null | undefined,
): MarketBoardLaneFilter | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'intl' || v === 'domestic' || v === 'bush') return v;
  return undefined;
}

function compareBoardRow<T extends MarketBoardSortable>(
  a: T,
  b: T,
  key: MarketBoardSortKey,
): number {
  switch (key) {
    case 'distance':
      return (
        (a.distanceNm ?? Number.POSITIVE_INFINITY) -
        (b.distanceNm ?? Number.POSITIVE_INFINITY)
      );
    case 'cargo':
      return a.commodityName.localeCompare(b.commodityName);
    case 'load':
      return a.availableKg - b.availableKg;
    case 'expires':
      return a.expiresAtTick - b.expiresAtTick;
    case 'pay':
      return a.payUsd - b.payUsd;
    case 'net': {
      const aNet =
        typeof a.estimatedNetUsd === 'number' && Number.isFinite(a.estimatedNetUsd)
          ? a.estimatedNetUsd
          : Number.NEGATIVE_INFINITY;
      const bNet =
        typeof b.estimatedNetUsd === 'number' && Number.isFinite(b.estimatedNetUsd)
          ? b.estimatedNetUsd
          : Number.NEGATIVE_INFINITY;
      return aNet - bNet;
    }
    case 'access':
      // Unlocked (false) before locked (true) when ascending.
      return Number(Boolean(a.cargoLocked)) - Number(Boolean(b.cargoLocked));
    case 'starter':
      return starterBoardFitRank(a) - starterBoardFitRank(b);
  }
}

export function marketBoardRowMatchesFilters<T extends MarketBoardSortable>(
  row: T,
  opts: Pick<
    MarketBoardQueryOpts,
    | 'distanceMaxNm'
    | 'commodityId'
    | 'loadMaxKg'
    | 'expiresWithinHours'
    | 'minPayUsd'
    | 'minNetUsd'
    | 'profitableOnly'
    | 'viableOnly'
    | 'hangarEmpty'
    | 'accessFilter'
    | 'laneFilter'
    | 'currentTick'
  >,
): boolean {
  if (
    opts.distanceMaxNm !== undefined &&
    Number.isFinite(opts.distanceMaxNm) &&
    opts.distanceMaxNm > 0
  ) {
    if (row.distanceNm === undefined || row.distanceNm > opts.distanceMaxNm) {
      return false;
    }
  }
  if (opts.commodityId && row.commodityId !== opts.commodityId) {
    return false;
  }
  if (
    opts.loadMaxKg !== undefined &&
    Number.isFinite(opts.loadMaxKg) &&
    opts.loadMaxKg > 0 &&
    row.availableKg > opts.loadMaxKg
  ) {
    return false;
  }
  if (
    opts.expiresWithinHours !== undefined &&
    Number.isFinite(opts.expiresWithinHours) &&
    opts.expiresWithinHours > 0
  ) {
    const remainingTicks = Math.max(0, row.expiresAtTick - opts.currentTick);
    const remainingHours = remainingTicks / TICKS_PER_HOUR;
    if (remainingHours > opts.expiresWithinHours) return false;
  }
  if (
    opts.minPayUsd !== undefined &&
    Number.isFinite(opts.minPayUsd) &&
    opts.minPayUsd > 0 &&
    row.payUsd < opts.minPayUsd
  ) {
    return false;
  }
  if (opts.profitableOnly) {
    if (
      typeof row.estimatedNetUsd !== 'number' ||
      !Number.isFinite(row.estimatedNetUsd) ||
      row.estimatedNetUsd <= 0
    ) {
      return false;
    }
  }
  if (opts.viableOnly) {
    if (row.cargoLocked) return false;
    if (row.classLocked) return false;
    if (opts.hangarEmpty) {
      // Empty hangar can only fly Crew needed on an unlocked class.
      if (row.crewNeeded !== true) return false;
      if (row.estimatedInRange === false) return false;
    } else {
      if (row.estimatedInRange === false) return false;
      if (row.estimatedFuelFeasible === false) return false;
      if (
        typeof row.estimatedLiftKg === 'number' &&
        Number.isFinite(row.estimatedLiftKg) &&
        row.estimatedLiftKg <= 0
      ) {
        return false;
      }
      // Estimates missing (no aircraft / failed quote) → not "viable".
      if (
        row.estimatedLiftKg === null ||
        row.estimatedLiftKg === undefined ||
        row.estimatedInRange === null ||
        row.estimatedInRange === undefined
      ) {
        return false;
      }
    }
  }
  if (
    opts.minNetUsd !== undefined &&
    Number.isFinite(opts.minNetUsd)
  ) {
    if (
      typeof row.estimatedNetUsd !== 'number' ||
      !Number.isFinite(row.estimatedNetUsd) ||
      row.estimatedNetUsd < opts.minNetUsd
    ) {
      return false;
    }
  }
  if (opts.accessFilter === 'open' && row.cargoLocked) return false;
  if (opts.accessFilter === 'locked' && !row.cargoLocked) return false;
  if (opts.laneFilter === 'intl' && !row.international) return false;
  if (opts.laneFilter === 'domestic' && row.international) return false;
  if (opts.laneFilter === 'bush' && !row.bush) return false;
  return true;
}

/**
 * Filter → multi-sort → paginate a market board.
 * Default sort: unlocked first (stable within access).
 */
export function queryMarketBoardPage<T extends MarketBoardSortable>(
  rows: readonly T[],
  opts: MarketBoardQueryOpts,
): {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
} {
  const filtered = rows.filter((row) => marketBoardRowMatchesFilters(row, opts));
  const requested = opts.sorts && opts.sorts.length > 0 ? opts.sorts : undefined;
  const sorts = opts.hangarEmpty
    ? ensureHangarEmptySorts(requested)
    : ensureAccessPrimarySort(requested);

  const sorted = filtered
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const level of sorts) {
        const comparison = compareBoardRow(a.row, b.row, level.key);
        if (comparison !== 0) {
          return comparison * (level.direction === 'asc' ? 1 : -1);
        }
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);

  const pageSizeRaw =
    opts.pageSize !== undefined && Number.isFinite(opts.pageSize)
      ? Math.floor(opts.pageSize)
      : Math.max(sorted.length, 1);
  const pageSize = Math.max(1, Math.min(10_000, pageSizeRaw));
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const pageRaw = opts.page ?? 1;
  const page = Math.min(
    pageCount,
    Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1),
  );
  const start = (page - 1) * pageSize;

  return {
    rows: sorted.slice(start, start + pageSize),
    total: sorted.length,
    page,
    pageSize,
    pageCount,
  };
}

export function parsePositiveNumberParam(
  raw: string | null | undefined,
): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}
