/**
 * Browser-safe mirror of @msfs-compat/shared fuelBurnMultFromCondition.
 * Do not import shared from Vite client code.
 */

import type { PlayerAircraft } from './api';

const CRITICAL_CONDITION_PCT = 40;
const MX_FUEL_BURN_MULT_MAX = 1.2;
const MX_FUEL_BURN_HEALTHY_PCT = 90;

function clampConditionPct(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, n));
}

export type MxFuelBurnAlert = {
  excessPct: number;
  conditionPct: number;
};

export function mxFuelBurnFromAircraft(
  aircraft: Pick<
    PlayerAircraft,
    'airframeConditionPct' | 'engineConditionPct'
  > | null | undefined,
): MxFuelBurnAlert | null {
  if (!aircraft) return null;
  const af = clampConditionPct(
    typeof aircraft.airframeConditionPct === 'number'
      ? aircraft.airframeConditionPct
      : 100,
  );
  const eng = clampConditionPct(
    typeof aircraft.engineConditionPct === 'number'
      ? aircraft.engineConditionPct
      : 100,
  );
  const conditionPct = Math.round((af * 0.4 + eng * 0.6) * 10) / 10;
  if (conditionPct >= MX_FUEL_BURN_HEALTHY_PCT) return null;
  const span = MX_FUEL_BURN_HEALTHY_PCT - CRITICAL_CONDITION_PCT;
  const wear = Math.min(
    1,
    Math.max(0, (MX_FUEL_BURN_HEALTHY_PCT - conditionPct) / Math.max(1, span)),
  );
  const mult =
    Math.round((1 + (MX_FUEL_BURN_MULT_MAX - 1) * wear) * 1000) / 1000;
  const excessPct = Math.round((mult - 1) * 100);
  if (excessPct < 1) return null;
  return { excessPct, conditionPct };
}

/** Short pilot-facing copy for fuel load / preflight banners. */
export function mxFuelBurnAlertText(alert: MxFuelBurnAlert): string {
  return (
    `This airframe burns about +${alert.excessPct}% more fuel than healthy ` +
    `(condition ${Math.round(alert.conditionPct)}%). ` +
    `Due still matches SimBrief — repair or you may run short in flight.`
  );
}
