/** Sortable charter board columns (matches career-ui CharterBoard). */
export type CharterBoardSortKey =
  | 'distance'
  | 'pax'
  | 'baggage'
  | 'expires'
  | 'pay'
  | 'net'
  | 'fit';

export type CharterBoardSortDirection = 'asc' | 'desc';

export type CharterBoardSortLevel = {
  key: CharterBoardSortKey;
  direction: CharterBoardSortDirection;
};

export type CharterBoardSortable = {
  id: string;
  distanceNm: number;
  paxCount: number;
  baggageKg: number;
  expiresAtTick: number;
  payUsd: number;
  /** Estimated net after ferry (when aircraft selected). */
  netUsd?: number | null;
  /** True when the selected aircraft can take the offer. */
  fitCompatible?: boolean | null;
};

const SORT_KEYS = new Set<CharterBoardSortKey>([
  'distance',
  'pax',
  'baggage',
  'expires',
  'pay',
  'net',
  'fit',
]);

/** Default board order when the player has not clicked a sort header. */
export const DEFAULT_CHARTER_BOARD_SORTS: CharterBoardSortLevel[] = [
  { key: 'expires', direction: 'asc' },
  { key: 'pay', direction: 'desc' },
];

/** Parse `distance:asc,pay:desc` (or repeated `sort=` values joined). */
export function parseCharterBoardSorts(
  raw: string | null | undefined,
): CharterBoardSortLevel[] {
  if (!raw?.trim()) return [];
  const levels: CharterBoardSortLevel[] = [];
  const seen = new Set<CharterBoardSortKey>();
  for (const part of raw.split(',')) {
    const token = part.trim().toLowerCase();
    if (!token) continue;
    const [keyRaw, dirRaw] = token.split(':');
    const key = keyRaw as CharterBoardSortKey;
    if (!SORT_KEYS.has(key) || seen.has(key)) continue;
    const direction: CharterBoardSortDirection =
      dirRaw === 'desc' ? 'desc' : 'asc';
    seen.add(key);
    levels.push({ key, direction });
  }
  return levels;
}

export function formatCharterBoardSorts(
  sorts: readonly CharterBoardSortLevel[],
): string {
  return sorts.map((s) => `${s.key}:${s.direction}`).join(',');
}

/** Money / pax / baggage: highest first. Distance / expiry / fit: natural asc. */
export function preferredCharterSortDirection(
  key: CharterBoardSortKey,
): CharterBoardSortDirection {
  return key === 'pay' || key === 'net' || key === 'pax' || key === 'baggage'
    ? 'desc'
    : 'asc';
}

/** Promote a metric column to primary; third click clears it. */
export function withCharterMetricPrimarySort(
  current: readonly CharterBoardSortLevel[],
  key: CharterBoardSortKey,
): CharterBoardSortLevel[] {
  const preferred = preferredCharterSortDirection(key);
  const flipped: CharterBoardSortDirection =
    preferred === 'asc' ? 'desc' : 'asc';
  const existing = current.find((level) => level.key === key);
  const others = current.filter((level) => level.key !== key);
  if (!existing) {
    return [{ key, direction: preferred }, ...others];
  }
  if (existing.direction === preferred) {
    return [{ key, direction: flipped }, ...others];
  }
  return others;
}

/** Fit column: compatible-first → incompatible-first → clear. */
export function withCharterFitSort(
  current: readonly CharterBoardSortLevel[],
): CharterBoardSortLevel[] {
  const existing = current.find((level) => level.key === 'fit');
  const rest = current.filter((level) => level.key !== 'fit');
  if (!existing) {
    return [{ key: 'fit', direction: 'asc' }, ...rest];
  }
  if (existing.direction === 'asc') {
    return [{ key: 'fit', direction: 'desc' }, ...rest];
  }
  return rest;
}

function compareCharterRow(
  a: CharterBoardSortable,
  b: CharterBoardSortable,
  key: CharterBoardSortKey,
): number {
  switch (key) {
    case 'distance':
      return a.distanceNm - b.distanceNm;
    case 'pax':
      return a.paxCount - b.paxCount;
    case 'baggage':
      return a.baggageKg - b.baggageKg;
    case 'expires':
      return a.expiresAtTick - b.expiresAtTick;
    case 'pay':
      return a.payUsd - b.payUsd;
    case 'net': {
      const netA = a.netUsd ?? Number.NEGATIVE_INFINITY;
      const netB = b.netUsd ?? Number.NEGATIVE_INFINITY;
      return netA - netB;
    }
    case 'fit': {
      const fitA = a.fitCompatible === true ? 0 : a.fitCompatible === false ? 1 : 2;
      const fitB = b.fitCompatible === true ? 0 : b.fitCompatible === false ? 1 : 2;
      return fitA - fitB;
    }
  }
}

export function sortCharterBoardRows<T extends CharterBoardSortable>(
  rows: readonly T[],
  sorts: readonly CharterBoardSortLevel[] | null | undefined,
): T[] {
  const levels =
    sorts?.length ? sorts : DEFAULT_CHARTER_BOARD_SORTS;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const level of levels) {
        const comparison = compareCharterRow(a.row, b.row, level.key);
        if (comparison !== 0) {
          return comparison * (level.direction === 'asc' ? 1 : -1);
        }
      }
      const byId = a.row.id.localeCompare(b.row.id);
      return byId !== 0 ? byId : a.index - b.index;
    })
    .map(({ row }) => row);
}

export function charterBoardNeedsFitSort(
  sorts: readonly CharterBoardSortLevel[] | null | undefined,
): boolean {
  return (sorts ?? []).some(
    (level) => level.key === 'net' || level.key === 'fit',
  );
}

export type CharterBoardLaneFilter =
  | 'intl'
  | 'domestic'
  | 'pilot-domestic'
  | 'pilot-intl';
export type CharterBoardFitFilter = 'open' | 'locked';

/** Group-size bands — aligned with `pickCharterGroupSize` formation bands. */
export type CharterBoardPaxFilter = 'light' | 'med' | 'narrow';

export function parseCharterBoardLaneFilter(
  raw: string | null | undefined,
): CharterBoardLaneFilter | undefined {
  const v = raw?.trim().toLowerCase();
  if (
    v === 'intl' ||
    v === 'domestic' ||
    v === 'pilot-domestic' ||
    v === 'pilot-intl'
  ) {
    return v;
  }
  return undefined;
}

export function parseCharterBoardFitFilter(
  raw: string | null | undefined,
): CharterBoardFitFilter | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'open' || v === 'locked') return v;
  return undefined;
}

export function parseCharterBoardPaxFilter(
  raw: string | null | undefined,
): CharterBoardPaxFilter | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'light' || v === 'med' || v === 'narrow') return v;
  return undefined;
}

/** True when `groupSize` falls in the selected Pax band. */
export function charterOfferMatchesPaxFilter(
  groupSize: number,
  filter: CharterBoardPaxFilter | null | undefined,
): boolean {
  if (!filter) return true;
  const n = Math.floor(Number(groupSize) || 0);
  if (filter === 'light') return n >= 1 && n <= 12;
  if (filter === 'med') return n >= 13 && n <= 48;
  return n >= 49;
}

/** True when haul ≤ `distanceMaxNm` (same ceiling mold as Freights `distanceMaxNm`). */
export function charterOfferMatchesDistanceMax(
  distanceNm: number,
  distanceMaxNm: number | null | undefined,
): boolean {
  if (
    distanceMaxNm == null ||
    !Number.isFinite(distanceMaxNm) ||
    distanceMaxNm <= 0
  ) {
    return true;
  }
  const nm = Number(distanceNm);
  if (!Number.isFinite(nm)) return false;
  return nm <= distanceMaxNm;
}

/** Fit filter or net/fit sort needs per-offer aircraft fit before paging. */
export function charterBoardNeedsFitCompute(
  sorts: readonly CharterBoardSortLevel[] | null | undefined,
  fitFilter?: CharterBoardFitFilter | null,
): boolean {
  return (
    charterBoardNeedsFitSort(sorts) ||
    fitFilter === 'open' ||
    fitFilter === 'locked'
  );
}
