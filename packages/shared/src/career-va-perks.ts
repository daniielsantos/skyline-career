/**
 * VA org perks from Flight quality (rolling settle score).
 * Scoped to listed VAs — not Base ICAO perks, not Port concession.
 * No global Jet-A discount (Base / Port already cover location fuel).
 */

import type { VaFlightQualitySnapshot } from './career-va.js';

export type VaOrgPerkTierId = 0 | 1 | 2 | 3;

export type VaOrgPerks = {
  tier: VaOrgPerkTierId;
  /** Short label for chips. */
  tierName: string;
  qualityScore: number | null;
  flightCount: number;
  /** True when qualityScore is live (≥ min flights). */
  unlocked: boolean;
  /** Multiplies inspection/repair labor+parts (stacks with Base FBO service mult). */
  mxCostMult: number;
  /** Multiplies Line-crew overflow ferry charged to pilot home. */
  ferryOverflowCostMult: number;
  /** One-line effects for UI. */
  labels: string[];
  /** How to reach the next tier, or null at Elite / locked. */
  nextTierHint: string | null;
};

const TIER_TABLE: ReadonlyArray<{
  tier: VaOrgPerkTierId;
  tierName: string;
  minQuality: number;
  minFlights: number;
  mxCostMult: number;
  ferryOverflowCostMult: number;
  labels: string[];
}> = [
  {
    tier: 0,
    tierName: 'Building',
    minQuality: 0,
    minFlights: 0,
    mxCostMult: 1,
    ferryOverflowCostMult: 1,
    labels: [],
  },
  {
    tier: 1,
    tierName: 'Proven',
    minQuality: 55,
    minFlights: 3,
    mxCostMult: 0.95,
    ferryOverflowCostMult: 0.9,
    labels: ['−5% VA MX', '−10% overflow ferry'],
  },
  {
    tier: 2,
    tierName: 'Reliable',
    minQuality: 70,
    minFlights: 8,
    mxCostMult: 0.9,
    ferryOverflowCostMult: 0.8,
    labels: ['−10% VA MX', '−20% overflow ferry'],
  },
  {
    tier: 3,
    tierName: 'Elite',
    minQuality: 85,
    minFlights: 15,
    mxCostMult: 0.85,
    ferryOverflowCostMult: 0.7,
    labels: ['−15% VA MX', '−30% overflow ferry'],
  },
];

function tierAtOrBelow(qualityScore: number, flightCount: number): (typeof TIER_TABLE)[number] {
  let best = TIER_TABLE[0]!;
  for (const row of TIER_TABLE) {
    if (row.tier === 0) continue;
    if (flightCount >= row.minFlights && qualityScore >= row.minQuality) {
      best = row;
    }
  }
  return best;
}

/**
 * Resolve org perks from a quality snapshot.
 * When score is null (building), tier stays 0 even if flights &gt; 0.
 */
export function resolveVaOrgPerks(
  quality: VaFlightQualitySnapshot | null | undefined,
): VaOrgPerks {
  const flightCount = Math.max(0, Math.floor(quality?.flightCount ?? 0));
  const qualityScore =
    quality?.qualityScore != null && Number.isFinite(quality.qualityScore)
      ? quality.qualityScore
      : null;
  const unlocked = qualityScore != null;

  if (!unlocked) {
    const building = TIER_TABLE[0]!;
    const first = TIER_TABLE[1]!;
    return {
      tier: 0,
      tierName: building.tierName,
      qualityScore: null,
      flightCount,
      unlocked: false,
      mxCostMult: 1,
      ferryOverflowCostMult: 1,
      labels: [],
      nextTierHint: `Reach ${first.minFlights}+ scored flights and quality ≥${first.minQuality} for ${first.tierName}`,
    };
  }

  const row = tierAtOrBelow(qualityScore, flightCount);
  const next = TIER_TABLE.find((t) => t.tier === row.tier + 1) ?? null;
  return {
    tier: row.tier,
    tierName: row.tierName,
    qualityScore,
    flightCount,
    unlocked: true,
    mxCostMult: row.mxCostMult,
    ferryOverflowCostMult: row.ferryOverflowCostMult,
    labels: [...row.labels],
    nextTierHint: next
      ? `Quality ≥${next.minQuality} and ${next.minFlights}+ flights → ${next.tierName}`
      : null,
  };
}

/** Apply mult to a USD amount (cents-safe). */
export function applyVaOrgCostMult(amountUsd: number, mult: number): number {
  if (!(amountUsd > 0) || !(mult > 0) || mult === 1) {
    return Math.max(0, Math.round(amountUsd * 100) / 100);
  }
  return Math.max(0, Math.round(amountUsd * mult * 100) / 100);
}
