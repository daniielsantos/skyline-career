/**
 * Skyline aircraft wear + inspection — calibrated to career freights / MSRP.
 */

import { resolveAircraftMsrpUsd } from './career-aircraft-pricing.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import { applyWalletDelta } from './career-ledger.js';
import type {
  AirframeCondition,
  CareerMissionsState,
  FreighterClassId,
  PlayerAircraft,
} from './types/career-economy.js';

function msrpForAircraft(aircraft: PlayerAircraft): number {
  return resolveAircraftMsrpUsd({
    aircraftClassId: aircraft.aircraftClassId,
    maxCargoKg: findCareerPlayerAirframe(aircraft.airframeTypeId)?.maxCargoKg,
  });
}

/** Hours between mandatory workshop inspections. */
export const INSPECTION_INTERVAL_HOURS: Record<FreighterClassId, number> = {
  light_ga: 80,
  light_turboprop: 100,
  light_jet: 140,
  medium_piston: 150,
  narrow_freighter: 160,
  wide_freighter: 200,
};

/** Total condition % lost per block hour (split ~70% AF / 30% eng). */
export const WEAR_PCT_PER_HOUR: Record<FreighterClassId, number> = {
  light_ga: 0.1,
  light_turboprop: 0.1,
  light_jet: 0.09,
  medium_piston: 0.085,
  narrow_freighter: 0.08,
  wide_freighter: 0.07,
};

/** Inspection / checkup cost as fraction of MSRP. */
export const INSPECTION_COST_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.008,
  light_turboprop: 0.007,
  light_jet: 0.006,
  medium_piston: 0.0055,
  narrow_freighter: 0.005,
  wide_freighter: 0.004,
};

/** Cost to restore 1 condition point as fraction of MSRP. */
export const REPAIR_PCT_COST_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.0004,
  light_turboprop: 0.00035,
  light_jet: 0.00032,
  medium_piston: 0.0003,
  narrow_freighter: 0.0003,
  wide_freighter: 0.00025,
};

/** Below this %, airframe forces AOG even before inspection is due. */
export const CRITICAL_CONDITION_PCT = 40;

const AF_WEAR_SHARE = 0.7;
const ENG_WEAR_SHARE = 0.3;

export function conditionBucketFromPct(pct: number): AirframeCondition {
  if (pct >= 90) return 'excellent';
  if (pct >= 75) return 'good';
  if (pct >= 55) return 'fair';
  return 'tired';
}

export function midPctForCondition(condition: AirframeCondition): number {
  switch (condition) {
    case 'excellent':
      return 95;
    case 'good':
      return 82;
    case 'fair':
      return 64;
    case 'tired':
      return 45;
  }
}

export function clampConditionPct(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

/** Seed / migrate AF+eng % from bucket (or existing %). */
export function ensureAircraftConditionPcts(aircraft: PlayerAircraft): void {
  const bucket = aircraft.condition ?? 'good';
  if (
    typeof aircraft.airframeConditionPct !== 'number' ||
    !Number.isFinite(aircraft.airframeConditionPct)
  ) {
    aircraft.airframeConditionPct = midPctForCondition(bucket);
  } else {
    aircraft.airframeConditionPct = clampConditionPct(aircraft.airframeConditionPct);
  }
  if (
    typeof aircraft.engineConditionPct !== 'number' ||
    !Number.isFinite(aircraft.engineConditionPct)
  ) {
    aircraft.engineConditionPct = clampConditionPct(
      aircraft.airframeConditionPct + 3,
    );
  } else {
    aircraft.engineConditionPct = clampConditionPct(aircraft.engineConditionPct);
  }
  if (
    typeof aircraft.hoursSinceInspection !== 'number' ||
    !Number.isFinite(aircraft.hoursSinceInspection)
  ) {
    const interval = INSPECTION_INTERVAL_HOURS[aircraft.aircraftClassId];
    const hours = aircraft.hoursAirframe ?? 0;
    if (typeof aircraft.maintenanceDueAtHours === 'number') {
      aircraft.hoursSinceInspection = Math.max(
        0,
        Math.min(interval, interval - (aircraft.maintenanceDueAtHours - hours)),
      );
    } else {
      aircraft.hoursSinceInspection = Math.min(interval * 0.35, hours);
    }
  }
  const worst = Math.min(
    aircraft.airframeConditionPct,
    aircraft.engineConditionPct,
  );
  aircraft.condition = conditionBucketFromPct(worst);
  syncMaintenanceDueAtHours(aircraft);
}

export function syncConditionBucket(aircraft: PlayerAircraft): void {
  const af = clampConditionPct(aircraft.airframeConditionPct ?? 100);
  const eng = clampConditionPct(aircraft.engineConditionPct ?? 100);
  aircraft.airframeConditionPct = af;
  aircraft.engineConditionPct = eng;
  aircraft.condition = conditionBucketFromPct(Math.min(af, eng));
}

export function syncMaintenanceDueAtHours(aircraft: PlayerAircraft): void {
  const interval = INSPECTION_INTERVAL_HOURS[aircraft.aircraftClassId];
  const since = aircraft.hoursSinceInspection ?? 0;
  const hours = aircraft.hoursAirframe ?? 0;
  aircraft.maintenanceDueAtHours = Math.round((hours + (interval - since)) * 10) / 10;
}

export function hoursUntilInspection(aircraft: PlayerAircraft): number {
  ensureAircraftConditionPcts(aircraft);
  const interval = INSPECTION_INTERVAL_HOURS[aircraft.aircraftClassId];
  return Math.max(0, Math.round((interval - (aircraft.hoursSinceInspection ?? 0)) * 10) / 10);
}

export function inspectionCostUsd(aircraft: PlayerAircraft): number {
  return Math.round(
    msrpForAircraft(aircraft) * INSPECTION_COST_RATE[aircraft.aircraftClassId],
  );
}

/** @deprecated alias — inspection cost. */
export function maintenanceCostUsd(aircraft: PlayerAircraft): number {
  return inspectionCostUsd(aircraft);
}

export function repairPointCostUsd(
  aircraft: PlayerAircraft,
  which: 'airframe' | 'engine',
): number {
  const rate = REPAIR_PCT_COST_RATE[aircraft.aircraftClassId];
  // Engine repair slightly cheaper per point than airframe.
  const mult = which === 'engine' ? 0.85 : 1;
  return Math.max(
    1,
    Math.round(msrpForAircraft(aircraft) * rate * mult),
  );
}

function canEnterMaintenance(aircraft: PlayerAircraft): boolean {
  return (
    aircraft.status !== 'assigned' &&
    aircraft.status !== 'listed' &&
    aircraft.status !== 'leased_out'
  );
}

function maybeForceMaintenance(aircraft: PlayerAircraft): void {
  if (!canEnterMaintenance(aircraft)) return;
  ensureAircraftConditionPcts(aircraft);
  const interval = INSPECTION_INTERVAL_HOURS[aircraft.aircraftClassId];
  const inspectionDue = (aircraft.hoursSinceInspection ?? 0) >= interval;
  const critical =
    (aircraft.airframeConditionPct ?? 100) < CRITICAL_CONDITION_PCT ||
    (aircraft.engineConditionPct ?? 100) < CRITICAL_CONDITION_PCT;
  if (inspectionDue || critical) {
    aircraft.status = 'maintenance';
  }
}

/** Add block hours after a settled mission; applies wear and may flip to maintenance. */
export function applyAircraftHoursAfterMission(
  aircraft: PlayerAircraft,
  blockHours: number,
  opts?: { deferMaintenanceGate?: boolean },
): void {
  if (!(blockHours > 0)) return;
  ensureAircraftConditionPcts(aircraft);
  aircraft.hoursAirframe =
    Math.round(((aircraft.hoursAirframe ?? 0) + blockHours) * 10) / 10;
  aircraft.hoursEngine =
    Math.round(((aircraft.hoursEngine ?? 0) + blockHours) * 10) / 10;
  aircraft.hoursSinceInspection =
    Math.round(((aircraft.hoursSinceInspection ?? 0) + blockHours) * 10) / 10;

  const wear = WEAR_PCT_PER_HOUR[aircraft.aircraftClassId] * blockHours;
  aircraft.airframeConditionPct = clampConditionPct(
    (aircraft.airframeConditionPct ?? 100) - wear * AF_WEAR_SHARE,
  );
  aircraft.engineConditionPct = clampConditionPct(
    (aircraft.engineConditionPct ?? 100) - wear * ENG_WEAR_SHARE,
  );
  syncConditionBucket(aircraft);
  syncMaintenanceDueAtHours(aircraft);
  if (!opts?.deferMaintenanceGate) {
    maybeForceMaintenance(aircraft);
  }
}

/** Flip to AOG when inspection/critical thresholds are past (e.g. after lease-out return). */
export function evaluateAircraftMaintenanceGate(aircraft: PlayerAircraft): void {
  ensureAircraftConditionPcts(aircraft);
  maybeForceMaintenance(aircraft);
}

/**
 * Pay workshop inspection; resets hours-since-inspection. Does not restore %.
 * Labor/shop fee only — callers that consume terminal parts should use
 * `clearAircraftMaintenanceWithParts` in career-mro.
 * If still below critical %, stays in maintenance (no throw) so the player can repair.
 */
export function clearAircraftMaintenance(
  state: CareerMissionsState,
  aircraftId: string,
  opts: { atTick?: number } = {},
): {
  state: CareerMissionsState;
  debitUsd: number;
  needsRepair: boolean;
} {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.status !== 'maintenance') {
    throw new Error('Aircraft is not in maintenance');
  }
  ensureAircraftConditionPcts(aircraft);
  const debit = inspectionCostUsd(aircraft);
  if (state.walletUsd < debit) {
    throw new Error(
      `Inspection $${debit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -debit,
    kind: 'inspection',
    atTick: opts.atTick ?? 0,
    aircraftId: aircraft.id,
    icao: aircraft.locationIcao,
    note: aircraft.label,
  });
  aircraft.hoursSinceInspection = 0;
  syncMaintenanceDueAtHours(aircraft);
  const stillCritical =
    (aircraft.airframeConditionPct ?? 100) < CRITICAL_CONDITION_PCT ||
    (aircraft.engineConditionPct ?? 100) < CRITICAL_CONDITION_PCT;
  aircraft.status = stillCritical ? 'maintenance' : 'parked';
  return { state, debitUsd: debit, needsRepair: stillCritical };
}

/**
 * Restore condition points. Aircraft may be parked or in maintenance.
 * Labor only — use `repairAircraftConditionWithParts` for terminal MRO stock.
 */
export function repairAircraftCondition(
  state: CareerMissionsState,
  aircraftId: string,
  opts: { airframePts?: number; enginePts?: number; atTick?: number },
): {
  state: CareerMissionsState;
  debitUsd: number;
  aircraft: PlayerAircraft;
} {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.status === 'assigned' || aircraft.status === 'listed' || aircraft.status === 'leased_out') {
    throw new Error(`Cannot repair aircraft while ${aircraft.status} — park at a terminal`);
  }
  ensureAircraftConditionPcts(aircraft);
  const afPts = Math.max(0, Math.floor(opts.airframePts ?? 0));
  const engPts = Math.max(0, Math.floor(opts.enginePts ?? 0));
  if (afPts === 0 && engPts === 0) {
    throw new Error('Specify airframePts and/or enginePts to repair');
  }
  const afRoom = Math.max(0, 100 - (aircraft.airframeConditionPct ?? 100));
  const engRoom = Math.max(0, 100 - (aircraft.engineConditionPct ?? 100));
  const afApply = Math.min(afPts, Math.ceil(afRoom));
  const engApply = Math.min(engPts, Math.ceil(engRoom));
  if (afApply === 0 && engApply === 0) {
    throw new Error('Aircraft condition is already at 100%');
  }
  const debit =
    afApply * repairPointCostUsd(aircraft, 'airframe') +
    engApply * repairPointCostUsd(aircraft, 'engine');
  if (state.walletUsd < debit) {
    throw new Error(
      `Repair $${debit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -debit,
    kind: 'repair',
    atTick: opts.atTick ?? 0,
    aircraftId: aircraft.id,
    icao: aircraft.locationIcao,
    note: aircraft.label,
  });
  aircraft.airframeConditionPct = clampConditionPct(
    (aircraft.airframeConditionPct ?? 100) + afApply,
  );
  aircraft.engineConditionPct = clampConditionPct(
    (aircraft.engineConditionPct ?? 100) + engApply,
  );
  syncConditionBucket(aircraft);

  const interval = INSPECTION_INTERVAL_HOURS[aircraft.aircraftClassId];
  const inspectionOk = (aircraft.hoursSinceInspection ?? 0) < interval;
  const critical =
    (aircraft.airframeConditionPct ?? 100) < CRITICAL_CONDITION_PCT ||
    (aircraft.engineConditionPct ?? 100) < CRITICAL_CONDITION_PCT;
  if (aircraft.status === 'maintenance' && inspectionOk && !critical) {
    aircraft.status = 'parked';
  }
  return { state, debitUsd: debit, aircraft };
}

/** Build pct pair for a market listing from its condition bucket. */
export function conditionPctsForListing(
  condition: AirframeCondition,
  kind: 'new' | 'used' | 'lease',
): { airframeConditionPct: number; engineConditionPct: number } {
  if (kind === 'new') {
    return { airframeConditionPct: 99, engineConditionPct: 100 };
  }
  const mid = midPctForCondition(condition);
  return {
    airframeConditionPct: mid,
    engineConditionPct: clampConditionPct(mid + (condition === 'tired' ? 2 : 4)),
  };
}
