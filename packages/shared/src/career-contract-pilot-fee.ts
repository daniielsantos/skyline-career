/**
 * Contract-pilot crew cut — kept in a leaf module so career-mission and
 * career-npc can share it without import cycles.
 */

/** Share of reserved operator freight pay offered to a contract pilot. */
export const CONTRACT_PILOT_FEE_FRAC = 0.3;

export const CONTRACT_PILOT_FEE_MIN_USD = 50;

export function quoteContractPilotFeeUsd(payUsd: number): number {
  const pay = Math.max(0, payUsd);
  return Math.max(
    CONTRACT_PILOT_FEE_MIN_USD,
    Math.round(pay * CONTRACT_PILOT_FEE_FRAC),
  );
}

/** Operator lot pay implied by a quoted crew fee (display only). */
export function operatorFreightFromPilotFeeUsd(feeUsd: number): number {
  const fee = Math.max(0, feeUsd);
  if (!(CONTRACT_PILOT_FEE_FRAC > 0)) return fee;
  return Math.max(1, Math.round(fee / CONTRACT_PILOT_FEE_FRAC));
}

/** Value used when sorting the board NET / Freight column. */
export function boardNetSortUsd(
  row: {
    estimatedNetUsd?: number | null;
    crewNeeded?: boolean;
    crewReposition?: boolean;
    pilotFeeUsd?: number;
  },
  opts: { hangarEmpty: boolean },
): number {
  if (row.crewNeeded && typeof row.pilotFeeUsd === 'number') {
    if (row.crewReposition) return row.pilotFeeUsd;
    if (opts.hangarEmpty) {
      return operatorFreightFromPilotFeeUsd(row.pilotFeeUsd);
    }
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
