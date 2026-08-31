/**
 * Contract-pilot crew cut — kept in a leaf module so career-mission and
 * career-npc can share it without import cycles.
 */

import type { FreighterClassId } from './types/career-economy.js';

/** Share of reserved operator freight pay offered to a contract pilot. */
export const CONTRACT_PILOT_FEE_FRAC = 0.3;

export const CONTRACT_PILOT_FEE_MIN_USD = 75;

/**
 * Soft $/nm floor for starter classes — long thin Dry/GA freights were paying
 * less crew fee than a shorter empty ferry (frac×soft freight pay).
 * Kept below Hangar/reposition ferry $/nm (~2.13 GA / 2.5 TP) so empty
 * reposition still pays more per nm.
 */
export const CONTRACT_PILOT_FEE_USD_PER_NM: Readonly<
  Partial<Record<FreighterClassId, number>>
> = {
  light_ga: 1.85,
  light_turboprop: 2.05,
};

export type QuoteContractPilotFeeOpts = {
  distanceNm?: number;
  aircraftClassId?: FreighterClassId;
};

export function quoteContractPilotFeeUsd(
  payUsd: number,
  opts?: QuoteContractPilotFeeOpts,
): number {
  const pay = Math.max(0, payUsd);
  const fromPay = Math.round(pay * CONTRACT_PILOT_FEE_FRAC);
  const nm = opts?.distanceNm;
  const cls = opts?.aircraftClassId;
  const rate = cls ? CONTRACT_PILOT_FEE_USD_PER_NM[cls] : undefined;
  const fromNm =
    typeof nm === 'number' &&
    Number.isFinite(nm) &&
    nm > 0 &&
    typeof rate === 'number'
      ? Math.round(nm * rate)
      : 0;
  return Math.max(CONTRACT_PILOT_FEE_MIN_USD, fromPay, fromNm);
}

/** Operator lot pay implied by a quoted crew fee (display only; ignores nm floor). */
export function operatorFreightFromPilotFeeUsd(feeUsd: number): number {
  const fee = Math.max(0, feeUsd);
  if (!(CONTRACT_PILOT_FEE_FRAC > 0)) return fee;
  return Math.max(1, Math.round(fee / CONTRACT_PILOT_FEE_FRAC));
}

/** Value used when sorting the board NET column (aircraft net, or crew fee). */
export function boardNetSortUsd(
  row: {
    estimatedNetUsd?: number | null;
    crewNeeded?: boolean;
    crewReposition?: boolean;
    pilotFeeUsd?: number;
  },
  _opts?: { hangarEmpty?: boolean },
): number {
  // Crew offers: sort by pilot fee. Never fee÷frac — nm floors desync that from the lot.
  if (row.crewNeeded && typeof row.pilotFeeUsd === 'number') {
    return row.pilotFeeUsd;
  }
  if (
    typeof row.estimatedNetUsd === 'number' &&
    Number.isFinite(row.estimatedNetUsd)
  ) {
    return row.estimatedNetUsd;
  }
  return Number.NEGATIVE_INFINITY;
}
