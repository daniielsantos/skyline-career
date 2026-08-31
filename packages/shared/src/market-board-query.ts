import { TICKS_PER_HOUR } from './career-clock.js';
import { CLASS_OPS_STARTER_IDS } from './career-class-ops.js';
import { boardNetSortUsd } from './career-contract-pilot-fee.js';

/** Origin radius (nm) for Near me / empty-hangar Freights. Keep in lockstep with LAST_MILE_MAX_NM. */
export const BOARD_NEAR_MAX_NM = 600;

/** Sortable Freights board columns (matches career-ui). */
export type MarketBoardSortKey =
  | 'distance'
  | 'cargo'
  | 'load'
  | 'expires'
  | 'pay'
  | 'net'
  | 'access'
  | 'starter'
  | 'fromFocus'
  | 'idle'
  /** Crew board: Contract (freight) before Ferry (empty reposition). */
  | 'crewKind';

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
  /** Lot formation size (Load column). Filter/sort prefer this over availableKg. */
  quantityKg?: number;
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
  /** Empty deadhead — NET sort uses pilot fee only. */
  crewReposition?: boolean;
  /** Max contract-pilot fee on crew-needed rows. */
  pilotFeeUsd?: number;
  /** NPC class on a crew-needed hold. */
  crewClassId?: string;
  /** Last-mile Dry break-bulk from a metro/spoke. */
  lastMile?: boolean;
  /** Great-circle nm from the Near-me focus ICAO to this lot origin. */
  originFromFocusNm?: number;
  /** Idle age has raised freight above formation pay. */
  idleEscalated?: boolean;
  /** Cross-country lane freight (from lot pressure). */
  international?: boolean;
  /** Soft-field Amazon bush OD. */
  bush?: boolean;
};

export type MarketBoardAccessFilter = 'open' | 'locked';
/** Freights route scope: international lanes vs domestic vs Amazon bush. */
export type MarketBoardLaneFilter = 'intl' | 'domestic' | 'bush';
/** Split Freights: crew = fly NPC airframe; aircraft = haul with your plane. */
export type MarketBoardCrewFilter = 'crew' | 'aircraft';

/**
 * Kg shown in Freights Load column (lot total / formation size).
 * Matches career-ui `LotLoadCell`.
 */
export function boardLoadKg(row: {
  availableKg: number;
  quantityKg?: number;
}): number {
  if (
    typeof row.quantityKg === 'number' &&
    Number.isFinite(row.quantityKg) &&
    row.quantityKg > 0
  ) {
    return row.quantityKg;
  }
  return Math.max(0, row.availableKg);
}

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
  /** Exclude lots lighter than this available kg. */
  loadMinKg?: number;
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
   * Empty hangar (`hangarEmpty`): crew you can sit, plus last-mile Dry.
   */
  viableOnly?: boolean;
  /**
   * No player aircraft selected — Freights is a contract-pilot board.
   * Injects starter-class / last-mile / short-hop sort.
   */
  hangarEmpty?: boolean;
  /**
   * Light GA / turboprop is selected — same starter/last-mile/distance sort
   * as an empty hangar, but viable still uses aircraft lift/range/fuel.
   */
  starterSort?: boolean;
  /**
   * Keep lots whose origin is within this many nm of the focus ICAO
   * (`originFromFocusNm`). Near me / empty hangar default is BOARD_NEAR_MAX_NM.
   */
  nearMaxNm?: number;
  /** Cargo Ops lock filter: open = unlocked only, locked = locked only. */
  accessFilter?: MarketBoardAccessFilter;
  /** International vs domestic route filter. */
  laneFilter?: MarketBoardLaneFilter;
  /** Crew needed vs own-aircraft freights. */
  crewFilter?: MarketBoardCrewFilter;
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
  'fromFocus',
  'idle',
  'crewKind',
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
    | 'idleEscalated'
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
  const idle = row.idleEscalated === true;
  if (row.lastMile === true) return idle ? 1 : 2;
  const gaSized =
    typeof row.availableKg === 'number' &&
    row.availableKg > 0 &&
    row.availableKg <= 450;
  const shortHop =
    typeof row.distanceNm === 'number' && row.distanceNm <= 600;
  if (gaSized && shortHop) return idle ? 3 : 4;
  if (row.crewNeeded === true) return 30;
  return idle ? 8 : 10;
}

/** Default Freights sort: none from the client — server soft-ranks idle/starter. */
export const DEFAULT_MARKET_BOARD_SORTS: readonly MarketBoardSortLevel[] = [];

/** Board columns the player can click — when leading, honor over idle/near. */
const EXPLICIT_METRIC_SORT_KEYS: ReadonlySet<MarketBoardSortKey> = new Set([
  'distance',
  'cargo',
  'load',
  'expires',
  'pay',
  'net',
]);

/**
 * True when the client put a metric column first (Pay / Net / Load / …).
 * In that case we must not force Idle / Near-focus ahead of it.
 */
export function hasExplicitMetricPrimarySort(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): boolean {
  const first = sorts?.[0];
  return first != null && EXPLICIT_METRIC_SORT_KEYS.has(first.key);
}

/**
 * Pass-through for requested sorts (Access is optional — only when the player
 * clicks the column). Empty → DEFAULT_MARKET_BOARD_SORTS.
 */
export function ensureAccessPrimarySort(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  return sorts?.length ? [...sorts] : [...DEFAULT_MARKET_BOARD_SORTS];
}

/**
 * Starter Freights (empty hangar or GA/TP selected): surface starter crew
 * holds and last-mile Dry, then nearer hops — not Wide pay.
 */
export function ensureHangarEmptySorts(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  const levels = sorts?.length ? [...sorts] : [...DEFAULT_MARKET_BOARD_SORTS];
  if (levels.some((s) => s.key === 'starter')) return levels;
  const rest = levels.filter(
    (s) => s.key !== 'distance' && s.key !== 'starter',
  );
  return [
    { key: 'starter', direction: 'asc' },
    { key: 'distance', direction: 'asc' },
    ...rest,
  ];
}

/**
 * Prefer origins closer to the Near-me focus so SBKP crew beats a last-mile
 * 550 nm away.
 */
export function ensureNearFocusSorts(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  const levels = sorts?.length ? [...sorts] : [...DEFAULT_MARKET_BOARD_SORTS];
  if (levels.some((s) => s.key === 'fromFocus')) return levels;
  const starterIdx = levels.findIndex((s) => s.key === 'starter');
  const insertAt =
    starterIdx >= 0
      ? starterIdx + 1
      : levels[0]?.key === 'access'
        ? 1
        : 0;
  const next = [...levels];
  next.splice(insertAt, 0, { key: 'fromFocus', direction: 'asc' });
  return next;
}

/**
 * Crew needed Freights: surface Contract (cargo) holds before Ferry
 * (empty reposition). Long ferry fees otherwise own page 1.
 */
export function ensureCrewContractBeforeFerrySorts(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  const levels = sorts?.length ? [...sorts] : [...DEFAULT_MARKET_BOARD_SORTS];
  if (levels.some((s) => s.key === 'crewKind')) return levels;
  return [{ key: 'crewKind', direction: 'asc' }, ...levels];
}

/**
 * Non-starter Freights (jet / heavy selected): surface idle-escalated lots so
 * lingering freight is not buried under fresh Wide pay.
 * Starter / empty-hangar boards already fold idle into `starter` rank.
 */
export function ensureIdleEscalatedSorts(
  sorts: readonly MarketBoardSortLevel[] | null | undefined,
): MarketBoardSortLevel[] {
  const levels = sorts?.length ? [...sorts] : [...DEFAULT_MARKET_BOARD_SORTS];
  if (levels.some((s) => s.key === 'idle' || s.key === 'starter')) {
    return levels;
  }
  const accessIdx = levels.findIndex((s) => s.key === 'access');
  const insertAt = accessIdx >= 0 ? accessIdx + 1 : 0;
  const next = [...levels];
  next.splice(insertAt, 0, { key: 'idle', direction: 'asc' });
  return next;
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

export function parseMarketBoardCrewFilter(
  raw: string | null | undefined,
): MarketBoardCrewFilter | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'crew' || v === 'aircraft') return v;
  return undefined;
}

function compareBoardRow<T extends MarketBoardSortable>(
  a: T,
  b: T,
  key: MarketBoardSortKey,
  hangarEmpty: boolean,
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
      return boardLoadKg(a) - boardLoadKg(b);
    case 'expires':
      return a.expiresAtTick - b.expiresAtTick;
    case 'pay':
      return (
        boardDisplayPayUsd({
          lotPayUsd: a.payUsd,
          quantityKg: a.quantityKg ?? a.availableKg,
          crewNeeded: a.crewNeeded,
          pilotFeeUsd: a.pilotFeeUsd,
        }) -
        boardDisplayPayUsd({
          lotPayUsd: b.payUsd,
          quantityKg: b.quantityKg ?? b.availableKg,
          crewNeeded: b.crewNeeded,
          pilotFeeUsd: b.pilotFeeUsd,
        })
      );
    case 'net':
      return (
        boardNetSortUsd(a, { hangarEmpty }) - boardNetSortUsd(b, { hangarEmpty })
      );
    case 'access':
      // Unlocked (false) before locked (true) when ascending.
      return Number(Boolean(a.cargoLocked)) - Number(Boolean(b.cargoLocked));
    case 'starter':
      return starterBoardFitRank(a) - starterBoardFitRank(b);
    case 'fromFocus':
      return (
        (a.originFromFocusNm ?? Number.POSITIVE_INFINITY) -
        (b.originFromFocusNm ?? Number.POSITIVE_INFINITY)
      );
    case 'idle':
      return (
        Number(a.idleEscalated !== true) - Number(b.idleEscalated !== true)
      );
    case 'crewKind':
      // Contract (false) before Ferry reposition (true).
      return (
        Number(Boolean(a.crewReposition)) - Number(Boolean(b.crewReposition))
      );
  }
}

export function marketBoardRowMatchesFilters<T extends MarketBoardSortable>(
  row: T,
  opts: Pick<
    MarketBoardQueryOpts,
    | 'distanceMaxNm'
    | 'commodityId'
    | 'loadMinKg'
    | 'loadMaxKg'
    | 'expiresWithinHours'
    | 'minPayUsd'
    | 'minNetUsd'
    | 'profitableOnly'
    | 'viableOnly'
    | 'hangarEmpty'
    | 'accessFilter'
    | 'laneFilter'
    | 'crewFilter'
    | 'nearMaxNm'
    | 'currentTick'
  >,
): boolean {
  if (
    opts.nearMaxNm !== undefined &&
    Number.isFinite(opts.nearMaxNm) &&
    opts.nearMaxNm > 0
  ) {
    if (
      row.originFromFocusNm === undefined ||
      row.originFromFocusNm > opts.nearMaxNm
    ) {
      return false;
    }
  }
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
    opts.loadMinKg !== undefined &&
    Number.isFinite(opts.loadMinKg) &&
    opts.loadMinKg > 0 &&
    boardLoadKg(row) < opts.loadMinKg
  ) {
    return false;
  }
  if (
    opts.loadMaxKg !== undefined &&
    Number.isFinite(opts.loadMaxKg) &&
    opts.loadMaxKg > 0 &&
    boardLoadKg(row) > opts.loadMaxKg
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
      // Crew board: sit unlocked crew holds. Aircraft board: last-mile Dry only
      // (full freights need a plane). Mixed board: either starter job.
      if (opts.crewFilter === 'crew') {
        if (row.crewNeeded !== true) return false;
      } else if (opts.crewFilter === 'aircraft') {
        if (row.lastMile !== true) return false;
      } else {
        const starterJob =
          row.crewNeeded === true || row.lastMile === true;
        if (!starterJob) return false;
      }
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
  if (opts.crewFilter === 'crew' && row.crewNeeded !== true) return false;
  if (opts.crewFilter === 'aircraft' && row.crewNeeded === true) return false;
  return true;
}

/**
 * Filter → multi-sort → paginate a market board.
 * Default (no client sorts): idle soft-rank — Access only when explicitly requested.
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
  // Player clicked Pay/Net/Load/… first — honor that; do not bury under Idle/Near.
  const honorMetricPrimary = hasExplicitMetricPrimarySort(requested);
  let baseSorts = honorMetricPrimary
    ? [...requested!]
    : opts.hangarEmpty || opts.starterSort
      ? ensureHangarEmptySorts(requested)
      : ensureIdleEscalatedSorts(ensureAccessPrimarySort(requested));
  if (!honorMetricPrimary && opts.crewFilter === 'crew') {
    baseSorts = ensureCrewContractBeforeFerrySorts(baseSorts);
  }
  const sorts =
    !honorMetricPrimary &&
    opts.nearMaxNm !== undefined &&
    Number.isFinite(opts.nearMaxNm) &&
    opts.nearMaxNm > 0
      ? ensureNearFocusSorts(baseSorts)
      : baseSorts;

  const sorted = filtered
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const level of sorts) {
        const comparison = compareBoardRow(
          a.row,
          b.row,
          level.key,
          Boolean(opts.hangarEmpty),
        );
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
