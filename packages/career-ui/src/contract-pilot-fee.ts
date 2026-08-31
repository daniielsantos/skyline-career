/**
 * Browser-safe mirror of packages/shared/src/career-contract-pilot-fee.ts
 * (career-ui client must not import @msfs-compat/shared — node:fs in index).
 */

export const CONTRACT_PILOT_FEE_FRAC = 0.3;

export const CONTRACT_PILOT_FEE_MIN_USD = 50;

/** Soft $/nm floor — keep in sync with shared career-contract-pilot-fee.ts */
export const CONTRACT_PILOT_FEE_USD_PER_NM: Readonly<
  Partial<Record<string, number>>
> = {
  light_ga: 1.4,
  light_turboprop: 1.65,
};

export function quoteContractPilotFeeUsd(
  payUsd: number,
  opts?: { distanceNm?: number; aircraftClassId?: string },
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
  _opts?: { hangarEmpty?: boolean },
): number {
  const claim = row.npcClaim;
  // Crew: sort by your fee (Pay). Do not invent operator freight from fee/frac —
  // nm floors desync that from the lot and the Freight column stays blank for crew.
  if (claim?.crewNeeded && typeof claim.pilotFeeUsd === 'number') {
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
