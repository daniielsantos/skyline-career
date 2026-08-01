import { TICKS_PER_HOUR } from './career-clock.js';

/** Sortable Freights board columns (matches career-ui). */
export type MarketBoardSortKey =
  | 'distance'
  | 'cargo'
  | 'load'
  | 'expires'
  | 'pay';

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
};

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
]);

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
  return true;
}

/**
 * Filter → multi-sort → paginate a market board. Default sort is pay desc
 * (same as listMarketLots) when no sorts are provided.
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
  const sorts =
    opts.sorts && opts.sorts.length > 0
      ? opts.sorts
      : ([{ key: 'pay', direction: 'desc' }] as MarketBoardSortLevel[]);

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
