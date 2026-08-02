/**
 * Shared Skyline aircraft price baselines (market + maintenance).
 */

import type { AirframeCondition, FreighterClassId } from './types/career-economy.js';

export const AIRCRAFT_MSRP_USD: Record<FreighterClassId, number> = {
  light_ga: 85_000,
  light_turboprop: 280_000,
  light_jet: 750_000,
  narrow_freighter: 1_800_000,
  wide_freighter: 6_500_000,
};

/** Baseline monthly lease ≈ MSRP × rate. */
export const AIRCRAFT_LEASE_MONTHLY_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.026,
  light_turboprop: 0.023,
  light_jet: 0.022,
  narrow_freighter: 0.021,
  wide_freighter: 0.0185,
};

export const CONDITION_PRICE_MULT: Record<AirframeCondition, number> = {
  excellent: 0.92,
  good: 0.78,
  fair: 0.62,
  tired: 0.48,
};
