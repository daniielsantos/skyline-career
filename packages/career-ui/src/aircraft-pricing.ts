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
const TICKS_PER_DAY = 96;
const TICKS_PER_WEEK = TICKS_PER_DAY * 7;

/** Min life-frac before Hangar offers engine / airframe overhaul. */
const OH_ENGINE_MIN_LIFE_FRAC = 0.45;
const OH_AIRFRAME_MIN_LIFE_FRAC = 0.55;

const OH_ENG_MSRP_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.22,
  light_turboprop: 0.2,
  light_jet: 0.18,
  medium_piston: 0.16,
  narrow_freighter: 0.14,
  wide_freighter: 0.12,
};

const OH_AF_MSRP_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.38,
  light_turboprop: 0.35,
  light_jet: 0.32,
  medium_piston: 0.3,
  narrow_freighter: 0.28,
  wide_freighter: 0.25,
};

export type OverhaulKind = 'engine' | 'airframe';

export type OverhaulQuoteEstimate = {
  which: OverhaulKind;
  eligible: boolean;
  reason?: string;
  debitUsd: number;
  downtimeDays: number;
  hoursBefore: number;
  mxMultBefore: number;
  mxMultAfter: number;
  minHoursRequired: number;
};

function overhaulDowntimeDays(
  classId: FreighterClassId,
  which: OverhaulKind,
): number {
  const band =
    classId === 'light_ga' || classId === 'light_turboprop'
      ? 1
      : classId === 'light_jet' || classId === 'medium_piston'
        ? 2
        : 3;
  return which === 'airframe' ? band * 2 : band;
}

function overhaulMinHours(
  classId: FreighterClassId,
  which: OverhaulKind,
): number {
  const life = ECONOMIC_LIFE_HOURS[classId];
  const frac =
    which === 'engine' ? OH_ENGINE_MIN_LIFE_FRAC : OH_AIRFRAME_MIN_LIFE_FRAC;
  return Math.ceil(life * frac);
}

/** Browser-side quote mirror of shared `quoteAircraftOverhaul` (labor-only). */
export function estimateOverhaulQuote(
  aircraft: {
    aircraftClassId: FreighterClassId;
    ownership?: 'owned' | 'leased' | null;
    status?: string | null;
    overhaulKind?: OverhaulKind | null;
    hoursAirframe?: number | null;
    hoursEngine?: number | null;
  },
  which: OverhaulKind,
  opts?: { maxCargoKg?: number | null; extraServiceMult?: number },
): OverhaulQuoteEstimate {
  const hoursBefore = finiteHours(
    which === 'engine' ? aircraft.hoursEngine : aircraft.hoursAirframe,
  );
  const minHours = overhaulMinHours(aircraft.aircraftClassId, which);
  const downtimeDays = overhaulDowntimeDays(aircraft.aircraftClassId, which);
  const mxMultBefore = estimateHoursMxCostMult(aircraft);
  const mxMultAfter = estimateHoursMxCostMult({
    aircraftClassId: aircraft.aircraftClassId,
    hoursAirframe: which === 'airframe' ? 0 : aircraft.hoursAirframe,
    hoursEngine: which === 'engine' ? 0 : aircraft.hoursEngine,
  });
  const base = {
    which,
    debitUsd: 0,
    downtimeDays,
    hoursBefore,
    mxMultBefore,
    mxMultAfter,
    minHoursRequired: minHours,
  };
  if ((aircraft.ownership ?? 'owned') !== 'owned') {
    return {
      ...base,
      eligible: false,
      reason: 'Leased aircraft — buy out before overhaul',
    };
  }
  if (aircraft.overhaulKind) {
    return {
      ...base,
      eligible: false,
      reason: 'Overhaul already in progress',
    };
  }
  if (aircraft.status !== 'parked' && aircraft.status !== 'maintenance') {
    return {
      ...base,
      eligible: false,
      reason: 'Aircraft must be parked (or in maintenance)',
    };
  }
  if (hoursBefore < minHours) {
    return {
      ...base,
      eligible: false,
      reason: `Need ≥${minHours.toLocaleString()} ${which === 'engine' ? 'engine' : 'airframe'} hours`,
    };
  }
  const life = ECONOMIC_LIFE_HOURS[aircraft.aircraftClassId];
  const frac = Math.min(1, Math.max(0, hoursBefore / Math.max(1, life)));
  const rate =
    which === 'engine'
      ? OH_ENG_MSRP_RATE[aircraft.aircraftClassId]
      : OH_AF_MSRP_RATE[aircraft.aircraftClassId];
  const serviceMult =
    typeof opts?.extraServiceMult === 'number' &&
    Number.isFinite(opts.extraServiceMult) &&
    opts.extraServiceMult > 0
      ? opts.extraServiceMult
      : 1;
  const debitUsd = Math.max(
    1,
    Math.round(
      resolveMsrpUsd(aircraft.aircraftClassId, opts?.maxCargoKg) *
        rate *
        frac *
        serviceMult,
    ),
  );
  return { ...base, eligible: true, debitUsd };
}

/** Weekly installments past due while `leaseOverdue` is set. */
export function estimateLeaseOverdueWeeks(
  aircraft: {
    leaseOverdue?: boolean;
    lease?: {
      nextDueTick: number;
      termEndsTick: number;
      termEndedSoft?: boolean;
    } | null;
  },
  economyTick: number,
): number {
  const lease = aircraft.lease;
  if (!aircraft.leaseOverdue || !lease) return 0;
  if (lease.termEndedSoft === true) return 0;
  if (economyTick < lease.nextDueTick) return 1;
  const end = Math.min(
    economyTick,
    Math.max(lease.nextDueTick, lease.termEndsTick - 1),
  );
  return Math.max(
    1,
    Math.floor((end - lease.nextDueTick) / TICKS_PER_WEEK) + 1,
  );
}

export function estimateLeaseOverdueAmountUsd(
  aircraft: {
    leaseOverdue?: boolean;
    lease?: {
      monthlyUsd: number;
      nextDueTick: number;
      termEndsTick: number;
      termEndedSoft?: boolean;
    } | null;
  },
  economyTick: number,
): number {
  const lease = aircraft.lease;
  if (!lease) return 0;
  return estimateLeaseOverdueWeeks(aircraft, economyTick) * lease.monthlyUsd;
}

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
