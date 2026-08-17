/**
 * Browser-safe mirror of @msfs-compat/shared career-aircraft-pricing /
 * sellBackValueUsd. Do not import shared from Vite client code.
 */

import type { PlayerAircraft } from './api';

type FreighterClassId = PlayerAircraft['aircraftClassId'];
type AirframeCondition = NonNullable<PlayerAircraft['condition']>;

const AIRCRAFT_MSRP_USD: Record<FreighterClassId, number> = {
  light_ga: 85_000,
  light_turboprop: 280_000,
  light_jet: 750_000,
  medium_piston: 1_200_000,
  narrow_freighter: 1_800_000,
  wide_freighter: 6_500_000,
};

const CLASS_BASELINE_CARGO_KG: Record<FreighterClassId, number> = {
  light_ga: 450,
  light_turboprop: 1_704,
  light_jet: 1_450,
  medium_piston: 10_000,
  narrow_freighter: 18_137,
  wide_freighter: 90_000,
};

const CARGO_MSRP_MULT_MIN = 0.8;
const CARGO_MSRP_MULT_MAX = 1.6;
const CARGO_MSRP_CURVE_EXP = 0.65;

const CONDITION_PRICE_MULT: Record<AirframeCondition, number> = {
  excellent: 0.92,
  good: 0.78,
  fair: 0.62,
  tired: 0.48,
};

function cargoMsrpMultiplier(
  aircraftClassId: FreighterClassId,
  maxCargoKg?: number | null,
): number {
  const baseline = CLASS_BASELINE_CARGO_KG[aircraftClassId];
  if (
    typeof maxCargoKg !== 'number' ||
    !Number.isFinite(maxCargoKg) ||
    maxCargoKg <= 0 ||
    !(baseline > 0)
  ) {
    return 1;
  }
  const raw = Math.pow(maxCargoKg / baseline, CARGO_MSRP_CURVE_EXP);
  return Math.min(CARGO_MSRP_MULT_MAX, Math.max(CARGO_MSRP_MULT_MIN, raw));
}

function resolveMsrpUsd(
  aircraftClassId: FreighterClassId,
  maxCargoKg?: number | null,
): number {
  return Math.round(
    AIRCRAFT_MSRP_USD[aircraftClassId] *
      cargoMsrpMultiplier(aircraftClassId, maxCargoKg),
  );
}

/** Dealer buy-back ≈ 70% of fair value (MSRP × condition × cargo mult). */
export function estimateSellBackUsd(
  aircraft: {
    aircraftClassId: FreighterClassId;
    condition?: AirframeCondition | null;
  },
  opts?: { maxCargoKg?: number | null },
): number {
  const condition = aircraft.condition ?? 'good';
  const fair = Math.round(
    resolveMsrpUsd(aircraft.aircraftClassId, opts?.maxCargoKg) *
      CONDITION_PRICE_MULT[condition],
  );
  return Math.round(fair * 0.7);
}

/** Career clock: 96 ticks/day × 30 days. */
const TICKS_PER_MONTH = 96 * 30;

/**
 * Early-return penalty mirror of quoteLeaseEarlyReturnUsd in shared.
 * Half the remaining months of rent, clamped to 1–3 months.
 */
export function estimateLeaseEarlyReturnUsd(
  lease: {
    monthlyUsd: number;
    termEndsTick: number;
    termEndedSoft?: boolean;
  },
  economyTick: number,
): { penaltyUsd: number; remainingMonths: number } {
  if (lease.termEndedSoft === true || economyTick >= lease.termEndsTick) {
    return { penaltyUsd: 0, remainingMonths: 0 };
  }
  const ticksLeft = lease.termEndsTick - economyTick;
  const remainingMonths =
    ticksLeft <= 0 ? 0 : Math.max(1, Math.ceil(ticksLeft / TICKS_PER_MONTH));
  if (remainingMonths <= 0) {
    return { penaltyUsd: 0, remainingMonths: 0 };
  }
  const monthsBilled = Math.min(3, Math.max(1, Math.ceil(remainingMonths * 0.5)));
  return {
    penaltyUsd: Math.round(lease.monthlyUsd * monthsBilled),
    remainingMonths,
  };
}
