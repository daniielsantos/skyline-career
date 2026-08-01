/**
 * Terminal MRO parts stock — consumed by inspection / repair (not freight lots).
 */

import {
  ensureAirportMroInventory,
  localUnitPriceUsd,
} from './career-economy.js';
import {
  clampConditionPct,
  CRITICAL_CONDITION_PCT,
  ensureAircraftConditionPcts,
  INSPECTION_INTERVAL_HOURS,
  inspectionCostUsd,
  repairPointCostUsd,
  syncConditionBucket,
  syncMaintenanceDueAtHours,
} from './career-aircraft-maintenance.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  FreighterClassId,
  PlayerAircraft,
  StockPile,
} from './types/career-economy.js';

/** Kg of parts per condition point restored. */
export const MRO_KG_PER_REPAIR_POINT: Record<FreighterClassId, number> = {
  light_ga: 12,
  light_turboprop: 18,
  narrow_freighter: 45,
  wide_freighter: 80,
};

/** Flat kg drawn for a workshop inspection. */
export const MRO_KG_PER_INSPECTION: Record<FreighterClassId, number> = {
  light_ga: 40,
  light_turboprop: 60,
  narrow_freighter: 200,
  wide_freighter: 400,
};

const PARTIAL_SURCHARGE = 1.35;
const DRY_SURCHARGE = 2.4;

export type MroScarcity = 'ok' | 'partial' | 'dry';

export interface MroPartsQuote {
  icao: string;
  requestedKg: number;
  fromTerminalKg: number;
  shortfallKg: number;
  unitPriceUsd: number;
  /** Parts bill (stock used × price); labor is separate. */
  partsCostUsd: number;
  /** Multiplier applied to labor/shop fees when parts are scarce. */
  laborSurcharge: number;
  scarcity: MroScarcity;
  stockKg: number;
  capacityKg: number;
}

function mroPile(terminal: { inventory: { mro_parts?: StockPile } }): StockPile {
  const existing = terminal.inventory.mro_parts;
  if (!existing) {
    throw new Error('MRO inventory missing — call ensureAirportMroInventory first');
  }
  return existing;
}

export function quoteMroParts(
  world: CareerEconomyWorld,
  opts: { icao: string; requestedKg: number },
): MroPartsQuote {
  const icao = opts.icao.trim().toUpperCase();
  const ap = world.airports.find((a) => a.icao === icao);
  if (!ap) {
    throw new Error(`Unknown airport for MRO parts: ${icao}`);
  }
  ensureAirportMroInventory(ap);
  const stock = mroPile(ap);
  const requestedKg = Math.max(0, Math.round(opts.requestedKg));
  const availableKg = Math.max(0, Math.floor(stock.stockKg));
  const fromTerminalKg = Math.min(requestedKg, availableKg);
  const shortfallKg = requestedKg - fromTerminalKg;
  const unitPriceUsd =
    Math.round(localUnitPriceUsd('mro_parts', stock) * 1000) / 1000;
  const partsCostUsd = Math.round(fromTerminalKg * unitPriceUsd * 100) / 100;
  let scarcity: MroScarcity = 'ok';
  let laborSurcharge = 1;
  if (requestedKg > 0 && fromTerminalKg === 0) {
    scarcity = 'dry';
    laborSurcharge = DRY_SURCHARGE;
  } else if (shortfallKg > 0) {
    scarcity = 'partial';
    laborSurcharge = PARTIAL_SURCHARGE;
  }
  return {
    icao,
    requestedKg,
    fromTerminalKg,
    shortfallKg,
    unitPriceUsd,
    partsCostUsd,
    laborSurcharge,
    scarcity,
    stockKg: stock.stockKg,
    capacityKg: stock.capacityKg,
  };
}

/** Debit terminal stock for a quote; returns updated quote with actual draw. */
export function deliverMroParts(
  world: CareerEconomyWorld,
  quote: MroPartsQuote,
): MroPartsQuote {
  const ap = world.airports.find((a) => a.icao === quote.icao);
  if (!ap) {
    throw new Error(`Unknown airport for MRO delivery: ${quote.icao}`);
  }
  ensureAirportMroInventory(ap);
  const stock = mroPile(ap);
  const take = Math.min(quote.fromTerminalKg, Math.max(0, Math.floor(stock.stockKg)));
  stock.stockKg = Math.max(0, stock.stockKg - take);
  return {
    ...quote,
    fromTerminalKg: take,
    shortfallKg: Math.max(0, quote.requestedKg - take),
    partsCostUsd: Math.round(take * quote.unitPriceUsd * 100) / 100,
    stockKg: stock.stockKg,
  };
}

export function mroKgForRepair(
  aircraftClassId: FreighterClassId,
  airframePts: number,
  enginePts: number,
): number {
  const per = MRO_KG_PER_REPAIR_POINT[aircraftClassId];
  // Engine points use ~70% of AF parts mass.
  return Math.round(per * airframePts + per * 0.7 * enginePts);
}

export function mroKgForInspection(aircraftClassId: FreighterClassId): number {
  return MRO_KG_PER_INSPECTION[aircraftClassId];
}

/**
 * Workshop inspection at the aircraft's terminal — labor + local MRO parts.
 * Dry/partial stock raises labor surcharge (mirrors Jet-A scarcity).
 */
export function clearAircraftMaintenanceWithParts(
  state: CareerMissionsState,
  aircraftId: string,
  world: CareerEconomyWorld,
): {
  state: CareerMissionsState;
  debitUsd: number;
  needsRepair: boolean;
  mro: MroPartsQuote;
} {
  const aircraft = state.fleet.find((a) => a.id === aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.status !== 'maintenance') {
    throw new Error('Aircraft is not in maintenance');
  }
  ensureAircraftConditionPcts(aircraft);
  const labor = inspectionCostUsd(aircraft);
  let mro = quoteMroParts(world, {
    icao: aircraft.locationIcao,
    requestedKg: mroKgForInspection(aircraft.aircraftClassId),
  });
  const debit = Math.round((labor * mro.laborSurcharge + mro.partsCostUsd) * 100) / 100;
  if (state.walletUsd < debit) {
    throw new Error(
      `Inspection $${debit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}` +
        (mro.scarcity !== 'ok' ? ` (${mro.scarcity} parts at ${mro.icao})` : ''),
    );
  }
  mro = deliverMroParts(world, mro);
  state.walletUsd = Math.round((state.walletUsd - debit) * 100) / 100;
  aircraft.hoursSinceInspection = 0;
  syncMaintenanceDueAtHours(aircraft);
  const stillCritical =
    (aircraft.airframeConditionPct ?? 100) < CRITICAL_CONDITION_PCT ||
    (aircraft.engineConditionPct ?? 100) < CRITICAL_CONDITION_PCT;
  aircraft.status = stillCritical ? 'maintenance' : 'parked';
  return { state, debitUsd: debit, needsRepair: stillCritical, mro };
}

/**
 * Repair condition at the aircraft's terminal — labor + local MRO parts.
 */
export function repairAircraftConditionWithParts(
  state: CareerMissionsState,
  aircraftId: string,
  world: CareerEconomyWorld,
  opts: { airframePts?: number; enginePts?: number },
): {
  state: CareerMissionsState;
  debitUsd: number;
  aircraft: PlayerAircraft;
  mro: MroPartsQuote;
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
  const labor =
    afApply * repairPointCostUsd(aircraft, 'airframe') +
    engApply * repairPointCostUsd(aircraft, 'engine');
  let mro = quoteMroParts(world, {
    icao: aircraft.locationIcao,
    requestedKg: mroKgForRepair(aircraft.aircraftClassId, afApply, engApply),
  });
  const debit = Math.round((labor * mro.laborSurcharge + mro.partsCostUsd) * 100) / 100;
  if (state.walletUsd < debit) {
    throw new Error(
      `Repair $${debit.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}` +
        (mro.scarcity !== 'ok' ? ` (${mro.scarcity} parts at ${mro.icao})` : ''),
    );
  }
  mro = deliverMroParts(world, mro);
  state.walletUsd = Math.round((state.walletUsd - debit) * 100) / 100;
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
  return { state, debitUsd: debit, aircraft, mro };
}
