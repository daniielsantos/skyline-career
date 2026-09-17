/**
 * Shared board money/distance formatters.
 * JSON turns NaN into null; calling `.toLocaleString()` on null crashes React.
 */

export function isFiniteMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Default `$1,234` formatter — safe for null/NaN/undefined. */
export function formatBoardMoney(value: unknown): string {
  if (!isFiniteMoney(value)) return '—';
  return `$${value.toLocaleString()}`;
}

/** Prefer the caller's formatter when the value is finite; otherwise `—`. */
export function boardMoneyLabel(
  value: unknown,
  formatMoney: (n: number) => string = formatBoardMoney,
): string {
  if (!isFiniteMoney(value)) return '—';
  return formatMoney(value);
}

/** CSS tone for Net cells (`net` / `net-pos` / `net-neg`). */
export function boardNetClassName(
  value: unknown,
  opts?: { inRange?: boolean | null },
): string {
  if (opts?.inRange === false) return 'net';
  if (!isFiniteMoney(value)) return 'net';
  if (value < 0) return 'net net-neg';
  if (value > 0) return 'net net-pos';
  return 'net';
}

/** `1,234 nm` or `—` when distance is missing/non-finite. */
export function formatBoardDistanceNm(value: unknown): string {
  if (!isFiniteMoney(value)) return '—';
  return `${Math.round(value).toLocaleString()} nm`;
}
