/**
 * Engine / airframe overhaul — CAPEX sink that resets hours (MX age mult / resale).
 * Does not restore condition % (repair stays separate).
 */

import { TICKS_PER_DAY } from './career-clock.js';
import {
  ECONOMIC_LIFE_HOURS,
  hoursMxCostMult,
  resolveAircraftMsrpUsd,
} from './career-aircraft-pricing.js';
import {
  ensureAircraftConditionPcts,
  evaluateAircraftMaintenanceGate,
  syncMaintenanceDueAtHours,
} from './career-aircraft-maintenance.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import { applyWalletDelta } from './career-ledger.js';
import type {
  CareerMissionsState,
  FreighterClassId,
  PlayerAircraft,
} from './types/career-economy.js';

export type AircraftOverhaulKind = 'engine' | 'airframe';

/** Min fraction of class economic life on that counter before OH is offered. */
export const OH_ENGINE_MIN_LIFE_FRAC = 0.45;
export const OH_AIRFRAME_MIN_LIFE_FRAC = 0.55;

/** MSRP × rate × lifeFrac (capped at 1) = shop debit at that wear level. */
export const OH_ENG_MSRP_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.22,
  light_turboprop: 0.2,
  light_jet: 0.18,
  medium_piston: 0.16,
  narrow_freighter: 0.14,
  wide_freighter: 0.12,
};

export const OH_AF_MSRP_RATE: Record<FreighterClassId, number> = {
  light_ga: 0.38,
  light_turboprop: 0.35,
  light_jet: 0.32,
  medium_piston: 0.3,
  narrow_freighter: 0.28,
  wide_freighter: 0.25,
};

export type AircraftOverhaulQuote = {
  which: AircraftOverhaulKind;
  eligible: boolean;
  reason?: string;
  debitUsd: number;
  downtimeDays: number;
  readyAtTick: number;
  hoursBefore: number;
  hoursAfter: number;
  mxMultBefore: number;
  mxMultAfter: number;
  minHoursRequired: number;
};

function msrpForAircraft(aircraft: PlayerAircraft): number {
  return resolveAircraftMsrpUsd({
    aircraftClassId: aircraft.aircraftClassId,
    maxCargoKg: findCareerPlayerAirframe(aircraft.airframeTypeId)?.maxCargoKg,
  });
}

function lifeHours(classId: FreighterClassId): number {
  return ECONOMIC_LIFE_HOURS[classId] ?? 4_000;
}

function counterHours(
  aircraft: PlayerAircraft,
  which: AircraftOverhaulKind,
): number {
  const raw =
    which === 'engine' ? aircraft.hoursEngine : aircraft.hoursAirframe;
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.max(0, raw)
    : 0;
}

function lifeFracForCounter(
  aircraft: PlayerAircraft,
  which: AircraftOverhaulKind,
): number {
  const life = lifeHours(aircraft.aircraftClassId);
  if (!(life > 0)) return 0;
  return Math.min(1, Math.max(0, counterHours(aircraft, which) / life));
}

/** Economy days AOG while the shop runs. */
export function overhaulDowntimeDays(
  classId: FreighterClassId,
  which: AircraftOverhaulKind,
): number {
  const band =
    classId === 'light_ga' || classId === 'light_turboprop'
      ? 1
      : classId === 'light_jet' || classId === 'medium_piston'
        ? 2
        : 3;
  return which === 'airframe' ? band * 2 : band;
}

export function overhaulMinHoursRequired(
  classId: FreighterClassId,
  which: AircraftOverhaulKind,
): number {
  const life = lifeHours(classId);
  const frac =
    which === 'engine' ? OH_ENGINE_MIN_LIFE_FRAC : OH_AIRFRAME_MIN_LIFE_FRAC;
  return Math.ceil(life * frac);
}

function canStartOverhaulStatus(aircraft: PlayerAircraft): boolean {
  return aircraft.status === 'parked' || aircraft.status === 'maintenance';
}

export function quoteAircraftOverhaul(
  aircraft: PlayerAircraft,
  which: AircraftOverhaulKind,
  opts: {
    atTick: number;
    /** Org perk / Base FBO stack — same mold as inspect. */
    extraServiceMult?: number;
  },
): AircraftOverhaulQuote {
  const atTick = Math.max(0, Math.floor(opts.atTick));
  const hoursBefore = counterHours(aircraft, which);
  const minHours = overhaulMinHoursRequired(aircraft.aircraftClassId, which);
  const downtimeDays = overhaulDowntimeDays(aircraft.aircraftClassId, which);
  const readyAtTick = atTick + downtimeDays * TICKS_PER_DAY;
  const mxMultBefore = hoursMxCostMult({
    aircraftClassId: aircraft.aircraftClassId,
    hoursAirframe: aircraft.hoursAirframe,
    hoursEngine: aircraft.hoursEngine,
  });
  const mxMultAfter = hoursMxCostMult({
    aircraftClassId: aircraft.aircraftClassId,
    hoursAirframe: which === 'airframe' ? 0 : aircraft.hoursAirframe,
    hoursEngine: which === 'engine' ? 0 : aircraft.hoursEngine,
  });

  const base: Omit<AircraftOverhaulQuote, 'eligible' | 'reason' | 'debitUsd'> & {
    debitUsd: number;
  } = {
    which,
    debitUsd: 0,
    downtimeDays,
    readyAtTick,
    hoursBefore,
    hoursAfter: 0,
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
  if (!canStartOverhaulStatus(aircraft)) {
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

  const rate =
    which === 'engine'
      ? OH_ENG_MSRP_RATE[aircraft.aircraftClassId]
      : OH_AF_MSRP_RATE[aircraft.aircraftClassId];
  const frac = lifeFracForCounter(aircraft, which);
  const serviceMult =
    typeof opts.extraServiceMult === 'number' &&
    Number.isFinite(opts.extraServiceMult) &&
    opts.extraServiceMult > 0
      ? opts.extraServiceMult
      : 1;
  const debitUsd = Math.max(
    1,
    Math.round(msrpForAircraft(aircraft) * rate * frac * serviceMult),
  );

  return {
    ...base,
    eligible: true,
    debitUsd,
  };
}

/**
 * Pay and schedule an overhaul. Hours reset when {@link finalizeAircraftOverhaulsDue} runs.
 */
export function startAircraftOverhaul(
  state: CareerMissionsState,
  aircraftId: string,
  which: AircraftOverhaulKind,
  opts: {
    atTick: number;
    extraServiceMult?: number;
    icao?: string;
  },
): {
  aircraft: PlayerAircraft;
  quote: AircraftOverhaulQuote;
  debitUsd: number;
} {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  const quote = quoteAircraftOverhaul(aircraft, which, {
    atTick: opts.atTick,
    extraServiceMult: opts.extraServiceMult,
  });
  if (!quote.eligible) {
    throw new Error(quote.reason ?? 'Overhaul not available');
  }
  if (state.walletUsd < quote.debitUsd) {
    throw new Error(
      `Overhaul $${quote.debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -quote.debitUsd,
    kind: which === 'engine' ? 'engine_overhaul' : 'airframe_overhaul',
    atTick: Math.max(0, Math.floor(opts.atTick)),
    note:
      which === 'engine'
        ? `Engine overhaul · ${quote.downtimeDays}d`
        : `Airframe overhaul · ${quote.downtimeDays}d`,
    aircraftId: aircraft.id,
    icao: (opts.icao ?? aircraft.locationIcao)?.toUpperCase(),
  });
  aircraft.status = 'maintenance';
  aircraft.overhaulKind = which;
  aircraft.overhaulReadyAtTick = quote.readyAtTick;
  return { aircraft, quote, debitUsd: quote.debitUsd };
}

function completeOneOverhaul(aircraft: PlayerAircraft): void {
  const which = aircraft.overhaulKind;
  if (!which) return;
  if (which === 'engine') {
    aircraft.hoursEngine = 0;
  } else {
    aircraft.hoursAirframe = 0;
  }
  aircraft.hoursSinceInspection = 0;
  delete aircraft.overhaulKind;
  delete aircraft.overhaulReadyAtTick;
  ensureAircraftConditionPcts(aircraft);
  syncMaintenanceDueAtHours(aircraft);
  // Leave maintenance if still critical / inspection due; else park.
  aircraft.status = 'parked';
  evaluateAircraftMaintenanceGate(aircraft);
}

/** Complete any shop jobs whose ready tick has passed. */
export function finalizeAircraftOverhaulsDue(
  state: CareerMissionsState,
  atTick: number,
): string[] {
  const tick = Math.max(0, Math.floor(atTick));
  const done: string[] = [];
  for (const aircraft of state.fleet) {
    if (!aircraft.overhaulKind) continue;
    const ready =
      typeof aircraft.overhaulReadyAtTick === 'number'
        ? aircraft.overhaulReadyAtTick
        : 0;
    if (tick < ready) continue;
    completeOneOverhaul(aircraft);
    done.push(aircraft.id);
  }
  return done;
}

export function assertNotInOverhaul(aircraft: PlayerAircraft): void {
  if (aircraft.overhaulKind) {
    throw new Error('Overhaul in progress — wait for the shop to finish');
  }
}
