/**
 * Optional override of SimBrief block fuel with a career target (kg).
 * Prefer leaving unset so Due / inject match the OFP.
 */
import { KG_TO_LB, type OfpExpectation } from '@msfs-compat/shared';
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';

export function applyTargetBlockFuelKg(
  ofp: OfpExpectation,
  targetBlockFuelKg: number | undefined,
): OfpExpectation {
  if (
    typeof targetBlockFuelKg !== 'number' ||
    !Number.isFinite(targetBlockFuelKg) ||
    targetBlockFuelKg <= 0
  ) {
    return ofp;
  }
  const unit = ofp.loadSheet?.unit ?? ofp.fuel.unit ?? 'kg';
  const value =
    unit === 'lb' ? targetBlockFuelKg * KG_TO_LB : targetBlockFuelKg;
  return applyOfpOverrides(ofp, {
    blockFuel: value,
    fuelTotal: value,
  });
}
