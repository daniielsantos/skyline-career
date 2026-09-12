/**
 * Browser-safe Charter board sort helpers.
 * Keep in sync with `@msfs-compat/shared` charter-board-query.ts.
 * Do not import @msfs-compat/shared from Vite client — the package index pulls node:fs.
 */

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

export function formatCharterBoardSorts(
  sorts: readonly CharterBoardSortLevel[],
): string {
  return sorts.map((s) => `${s.key}:${s.direction}`).join(',');
}

function preferredDirection(
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
  const preferred = preferredDirection(key);
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
