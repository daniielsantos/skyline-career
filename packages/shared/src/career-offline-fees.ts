/**
 * Cap passive company fees charged during long wall-clock catch-up
 * so casual returners are not drained for a full month offline.
 */

import { TICKS_PER_DAY } from './career-clock.js';
import { economyDayIndex } from './career-weather.js';

/** Max economy days of hangar / storage / salary billed per catch-up. */
export const OFFLINE_FEE_CAP_DAYS = 7;
export const OFFLINE_FEE_CAP_TICKS = OFFLINE_FEE_CAP_DAYS * TICKS_PER_DAY;

export type EffectiveFeeTickRange = {
  fromTick: number;
  toTick: number;
  daysCrossed: number;
  daysBilled: number;
  capped: boolean;
};

export type OfflineFeeLeaseSoft = {
  installmentsPaid: number;
  overdueIds: string[];
  termEndedSoftIds: string[];
  repossessedIds: string[];
};

export type OfflineFeeSummary = {
  daysAway: number;
  daysBilled: number;
  capped: boolean;
  /** Sum of passive company fee debits in this catch-up (capped window). */
  passiveDebitUsd: number;
  debitUsdByKind?: Partial<{
    hangar: number;
    warehouse: number;
    yard: number;
    fboStorage: number;
    crewSalary: number;
    groundStaffSalary: number;
  }>;
  lease?: OfflineFeeLeaseSoft;
};

/**
 * Shrink [fromTick, toTick) so economy-day settlers charge at most
 * OFFLINE_FEE_CAP_DAYS when the gap is larger.
 */
export function effectiveFeeTickRange(
  fromTick: number,
  toTick: number,
): EffectiveFeeTickRange {
  const from = Math.max(0, Math.floor(fromTick));
  const to = Math.max(from, Math.floor(toTick));
  const daysCrossed = Math.max(
    0,
    economyDayIndex(to) - economyDayIndex(from),
  );
  const daysBilled = Math.min(daysCrossed, OFFLINE_FEE_CAP_DAYS);
  const capped = daysCrossed > OFFLINE_FEE_CAP_DAYS;
  if (!capped) {
    return {
      fromTick: from,
      toTick: to,
      daysCrossed,
      daysBilled,
      capped: false,
    };
  }
  const toCapped =
    (economyDayIndex(from) + daysBilled) * TICKS_PER_DAY;
  return {
    fromTick: from,
    toTick: Math.max(from, toCapped),
    daysCrossed,
    daysBilled,
    capped: true,
  };
}

export function buildOfflineFeeSummary(opts: {
  feeRange: EffectiveFeeTickRange;
  passiveDebitUsd: number;
  debitUsdByKind?: OfflineFeeSummary['debitUsdByKind'];
  lease?: OfflineFeeLeaseSoft;
}): OfflineFeeSummary | null {
  const { feeRange, passiveDebitUsd, debitUsdByKind, lease } = opts;
  const termSoft = lease?.termEndedSoftIds?.length ?? 0;
  if (!feeRange.capped && termSoft === 0) return null;
  return {
    daysAway: feeRange.daysCrossed,
    daysBilled: feeRange.daysBilled,
    capped: feeRange.capped,
    passiveDebitUsd: Math.round(passiveDebitUsd * 100) / 100,
    ...(debitUsdByKind ? { debitUsdByKind } : {}),
    ...(lease ? { lease } : {}),
  };
}
