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

/**
 * Whole-USD amount for typed money fields (Credit draw/repay, etc.).
 * Digits → `22,593` grouping; empty → `''`. Paste of `$1,200.50` → `1,200`.
 */
export function maskUsdAmountInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\$/g, '').replace(/,/g, '');
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return formatUsdAmountInput(Number(normalized));
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return formatUsdAmountInput(Number(digits));
}

/** Inverse of {@link maskUsdAmountInput}; `0` when empty/invalid. */
export function parseUsdAmountInput(masked: string): number {
  const digits = masked.replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/** Placeholder / Max fill — same grouping as the mask. */
export function formatUsdAmountInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return Math.floor(n).toLocaleString('en-US');
}
