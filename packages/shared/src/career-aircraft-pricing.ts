/**
 * Shared Skyline aircraft price baselines (market + maintenance).
 *
 * Class MSRP is the tier baseline. Concrete Market SKUs scale gently with
 * homologated maxCargoKg so higher-earning airframes cost more to buy/lease.
 */

import type { AirframeCondition, FreighterClassId } from './types/career-economy.js';

export const AIRCRAFT_MSRP_USD: Record<FreighterClassId, number> = {
  light_ga: 85_000,
  light_turboprop: 280_000,
  light_jet: 750_000,
  medium_piston: 1_200_000,
  narrow_freighter: 1_800_000,
  wide_freighter: 6_500_000,
};

/** Class cargo baselines — same numbers as CAREER_AIRCRAFT_CLASSES.maxCargoKg. */
export const CLASS_BASELINE_CARGO_KG: Record<FreighterClassId, number> = {
  light_ga: 450,
  light_turboprop: 1_704,
  light_jet: 1_450,
  medium_piston: 10_000,
  narrow_freighter: 18_137,
  wide_freighter: 90_000,
};

/** Soft clamp so outliers (tiny trainers / fat pods) do not break the ladder. */
export const CARGO_MSRP_MULT_MIN = 0.8;
export const CARGO_MSRP_MULT_MAX = 1.6;

/**
 * Sub-linear cargo response — capacity earns more, but not 1:1 with kg
 * (fuel/time still matter). Exponent keeps mid-class SKUs distinguishable
 * when catalog cargos sit well above the class baseline.
 */
export const CARGO_MSRP_CURVE_EXP = 0.65;

/**
 * Baseline weekly lease ≈ MSRP × rate.
 * Charged every economy week; short terms (≤3 mo) so leasing is expensive
 * temporary access — not a cheap ladder skip vs buy.
 * (~1.2–1.65%/wk ≈ ~5–6.5%/mo equivalent, above the old monthly table.)
 */
export const AIRCRAFT_LEASE_WEEKLY_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.0165,
  light_turboprop: 0.015,
  light_jet: 0.014,
  medium_piston: 0.0135,
  narrow_freighter: 0.013,
  wide_freighter: 0.012,
};

/** @deprecated Use AIRCRAFT_LEASE_WEEKLY_RATE (installments are weekly). */
export const AIRCRAFT_LEASE_MONTHLY_RATE = AIRCRAFT_LEASE_WEEKLY_RATE;

export const CONDITION_PRICE_MULT: Record<AirframeCondition, number> = {
  excellent: 0.92,
  good: 0.78,
  fair: 0.62,
  tired: 0.48,
};

export function cargoMsrpMultiplier(opts: {
  aircraftClassId: FreighterClassId;
  maxCargoKg?: number | null;
}): number {
  const baseline = CLASS_BASELINE_CARGO_KG[opts.aircraftClassId];
  const cargo = opts.maxCargoKg;
  if (
    typeof cargo !== 'number' ||
    !Number.isFinite(cargo) ||
    cargo <= 0 ||
    !(baseline > 0)
  ) {
    return 1;
  }
  const raw = Math.pow(cargo / baseline, CARGO_MSRP_CURVE_EXP);
  return Math.min(CARGO_MSRP_MULT_MAX, Math.max(CARGO_MSRP_MULT_MIN, raw));
}

/** Class MSRP scaled by airframe cargo capacity (when known). */
export function resolveAircraftMsrpUsd(opts: {
  aircraftClassId: FreighterClassId;
  maxCargoKg?: number | null;
}): number {
  return Math.round(
    AIRCRAFT_MSRP_USD[opts.aircraftClassId] * cargoMsrpMultiplier(opts),
  );
}

export function resolveAircraftLeaseWeeklyUsd(opts: {
  aircraftClassId: FreighterClassId;
  maxCargoKg?: number | null;
}): number {
  return Math.round(
    resolveAircraftMsrpUsd(opts) *
      AIRCRAFT_LEASE_WEEKLY_RATE[opts.aircraftClassId],
  );
}

/** @deprecated Alias — values are weekly installments. */
export function resolveAircraftLeaseMonthlyUsd(opts: {
  aircraftClassId: FreighterClassId;
  maxCargoKg?: number | null;
}): number {
  return resolveAircraftLeaseWeeklyUsd(opts);
}
