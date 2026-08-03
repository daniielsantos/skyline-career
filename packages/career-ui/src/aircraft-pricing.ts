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

const CONDITION_PRICE_MULT: Record<AirframeCondition, number> = {
  excellent: 0.92,
  good: 0.78,
  fair: 0.62,
  tired: 0.48,
};

/** Dealer buy-back ≈ 70% of fair value (MSRP × condition). */
export function estimateSellBackUsd(aircraft: {
  aircraftClassId: FreighterClassId;
  condition?: AirframeCondition | null;
}): number {
  const condition = aircraft.condition ?? 'good';
  const fair = Math.round(
    AIRCRAFT_MSRP_USD[aircraft.aircraftClassId] * CONDITION_PRICE_MULT[condition],
  );
  return Math.round(fair * 0.7);
}
