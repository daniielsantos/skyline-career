/**
 * Browser-safe mirror of packages/shared/src/career-contract-pilot-fee.ts
 * (career-ui client must not import @msfs-compat/shared — node:fs in index).
 */

export const CONTRACT_PILOT_FEE_FRAC = 0.3;

export const CONTRACT_PILOT_FEE_MIN_USD = 50;

export function operatorFreightFromPilotFeeUsd(feeUsd: number): number {
  const fee = Math.max(0, feeUsd);
  if (!(CONTRACT_PILOT_FEE_FRAC > 0)) return fee;
  return Math.max(1, Math.round(fee / CONTRACT_PILOT_FEE_FRAC));
}

export function boardNetSortUsd(
  row: {
    estimatedNetUsd?: number | null;
    npcClaim?: {
      crewNeeded?: boolean;
      crewReposition?: boolean;
      pilotFeeUsd?: number;
    } | null;
  },
  opts: { hangarEmpty: boolean },
): number {
  const claim = row.npcClaim;
  if (claim?.crewNeeded && typeof claim.pilotFeeUsd === 'number') {
    if (claim.crewReposition) return claim.pilotFeeUsd;
    if (opts.hangarEmpty) {
      return operatorFreightFromPilotFeeUsd(claim.pilotFeeUsd);
    }
    return claim.pilotFeeUsd;
  }
  if (
    typeof row.estimatedNetUsd === 'number' &&
    Number.isFinite(row.estimatedNetUsd)
  ) {
    return row.estimatedNetUsd;
  }
  return Number.NEGATIVE_INFINITY;
}

export function contractPilotFeePctLabel(): string {
  return `${Math.round(CONTRACT_PILOT_FEE_FRAC * 100)}%`;
}
