/**
 * Browser-safe mirror of @msfs-compat/shared career-aircraft-pricing /
 * sellBackValueUsd. Do not import shared from Vite client code.
 */

import type { PlayerAircraft } from './api';

type FreighterClassId = PlayerAircraft['aircraftClassId'];
type AirframeCondition = NonNullable<PlayerAircraft['condition']>;

const AIRCRAFT_MSRP_USD: Record<FreighterClassId, number> = {
  light_ga: 140_000,
  light_turboprop: 450_000,
  light_jet: 750_000,
  medium_piston: 1_800_000,
  narrow_freighter: 2_800_000,
  wide_freighter: 14_000_000,
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

const ECONOMIC_LIFE_HOURS: Record<FreighterClassId, number> = {
  light_ga: 4_000,
  light_turboprop: 8_000,
  light_jet: 10_000,
  medium_piston: 8_000,
  narrow_freighter: 12_000,
  wide_freighter: 20_000,
};

const HOURS_AF_BLEND = 0.6;
const HOURS_ENG_BLEND = 0.4;
const HOURS_MX_AGE_GAIN = 0.6;
const HOURS_VALUE_HAIRCUT = 0.3;

function finiteHours(n?: number | null): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

function hoursLifeFrac(opts: {
  aircraftClassId: FreighterClassId;
  hoursAirframe?: number | null;
  hoursEngine?: number | null;
}): number {
  const life = ECONOMIC_LIFE_HOURS[opts.aircraftClassId];
  if (!(life > 0)) return 0;
  const blended =
    finiteHours(opts.hoursAirframe) * HOURS_AF_BLEND +
    finiteHours(opts.hoursEngine) * HOURS_ENG_BLEND;
  return Math.min(1, Math.max(0, blended / life));
}

export function estimateHoursMxCostMult(aircraft: {
  aircraftClassId: FreighterClassId;
  hoursAirframe?: number | null;
  hoursEngine?: number | null;
}): number {
  return (
    Math.round((1 + HOURS_MX_AGE_GAIN * hoursLifeFrac(aircraft)) * 1000) / 1000
  );
}

function hoursValueMult(aircraft: {
  aircraftClassId: FreighterClassId;
  hoursAirframe?: number | null;
  hoursEngine?: number | null;
}): number {
  return (
    Math.round((1 - HOURS_VALUE_HAIRCUT * hoursLifeFrac(aircraft)) * 1000) / 1000
  );
}

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

/** Dealer buy-back = 50% of fair value (MSRP × condition × cargo × hours). */
export function estimateFairUsd(
  aircraft: {
    aircraftClassId: FreighterClassId;
    condition?: AirframeCondition | null;
    hoursAirframe?: number | null;
    hoursEngine?: number | null;
  },
  opts?: { maxCargoKg?: number | null },
): number {
  const condition = aircraft.condition ?? 'good';
  return Math.round(
    resolveMsrpUsd(aircraft.aircraftClassId, opts?.maxCargoKg) *
      CONDITION_PRICE_MULT[condition] *
      hoursValueMult(aircraft),
  );
}

const AIRCRAFT_LEASE_WEEKLY_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.02,
  light_turboprop: 0.022,
  light_jet: 0.023,
  medium_piston: 0.02,
  narrow_freighter: 0.024,
  wide_freighter: 0.015,
};

export function estimateLeaseMonthlyUsd(
  aircraft: {
    aircraftClassId: FreighterClassId;
  },
  opts?: { maxCargoKg?: number | null },
): number {
  return Math.round(
    resolveMsrpUsd(aircraft.aircraftClassId, opts?.maxCargoKg) *
      AIRCRAFT_LEASE_WEEKLY_RATE[aircraft.aircraftClassId],
  );
}

export function estimateSellBackUsd(
  aircraft: {
    aircraftClassId: FreighterClassId;
    condition?: AirframeCondition | null;
    hoursAirframe?: number | null;
    hoursEngine?: number | null;
  },
  opts?: { maxCargoKg?: number | null },
): number {
  return Math.round(estimateFairUsd(aircraft, opts) * 0.5);
}

/** Career clock: 96 ticks/day × 7 days. */
const TICKS_PER_WEEK = 96 * 7;

/**
 * Early-return penalty mirror of quoteLeaseEarlyReturnUsd in shared.
 * Half the remaining weeks of rent, clamped to 1–4 weeks.
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
  const remainingWeeks =
    ticksLeft <= 0 ? 0 : Math.max(1, Math.ceil(ticksLeft / TICKS_PER_WEEK));
  if (remainingWeeks <= 0) {
    return { penaltyUsd: 0, remainingMonths: 0 };
  }
  const weeksBilled = Math.min(4, Math.max(1, Math.ceil(remainingWeeks * 0.5)));
  return {
    penaltyUsd: Math.round(lease.monthlyUsd * weeksBilled),
    remainingMonths: Math.max(1, Math.ceil(remainingWeeks / 4)),
  };
}
