import {
  ensureAirportFuelInventory,
  getCommodity,
  localUnitPriceUsd,
  routeDistanceNm,
} from './career-economy.js';
import type {
  CareerEconomyWorld,
  FreighterClassId,
  MissionFuelUplift,
  StockPile,
} from './types/career-economy.js';

/** Keep in sync with CAREER_AIRCRAFT_CLASSES fuel fields. */
const FUEL_PLAN: Record<
  FreighterClassId,
  { fuelBurnKgPerNm: number; fuelTaxiKg: number }
> = {
  narrow_freighter: { fuelBurnKgPerNm: 5, fuelTaxiKg: 400 },
  wide_freighter: { fuelBurnKgPerNm: 12, fuelTaxiKg: 900 },
  light_turboprop: { fuelBurnKgPerNm: 0.8, fuelTaxiKg: 40 },
};

const PARTIAL_SURCHARGE = 1.25;
const DRY_SURCHARGE = 2;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function fuelPile(terminal: { inventory: { fuel?: StockPile } }): StockPile {
  const existing = terminal.inventory.fuel;
  if (!existing) {
    throw new Error('Fuel inventory missing — call ensureAirportFuelInventory first');
  }
  return existing;
}

export function estimateUpliftKg(
  aircraftClassId: FreighterClassId,
  distanceNm: number,
  requestedKg?: number,
): number {
  if (requestedKg !== undefined && Number.isFinite(requestedKg) && requestedKg > 0) {
    return Math.round(requestedKg);
  }
  const plan = FUEL_PLAN[aircraftClassId];
  const nm = Math.max(0, distanceNm);
  return Math.max(
    plan.fuelTaxiKg,
    Math.round(plan.fuelTaxiKg + plan.fuelBurnKgPerNm * nm),
  );
}

export interface FuelUpliftQuote {
  originIcao: string;
  requestedKg: number;
  availableKg: number;
  unitPriceUsd: number;
  /** Full bill including tanker surcharge on shortfall. */
  costUsd: number;
  scarcity: MissionFuelUplift['scarcity'];
  distanceNm: number;
}

export function quoteFuelUplift(
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    aircraftClassId: FreighterClassId;
    destIcao?: string;
    distanceNm?: number;
    requestedKg?: number;
  },
): FuelUpliftQuote {
  const originIcao = opts.originIcao.trim().toUpperCase();
  const ap = world.airports.find((a) => a.icao === originIcao);
  if (!ap) {
    throw new Error(`Unknown airport for fuel uplift: ${originIcao}`);
  }
  ensureAirportFuelInventory(ap);
  const stock = fuelPile(ap);
  const distance =
    opts.distanceNm ??
    (opts.destIcao ? routeDistanceNm(world, originIcao, opts.destIcao) : undefined) ??
    0;
  const requestedKg = estimateUpliftKg(
    opts.aircraftClassId,
    distance,
    opts.requestedKg,
  );
  const availableKg = Math.max(0, Math.floor(stock.stockKg));
  const unitPriceUsd =
    Math.round(localUnitPriceUsd('fuel', stock) * 1000) / 1000;
  const fromTerminal = Math.min(requestedKg, availableKg);
  const shortfall = requestedKg - fromTerminal;
  let costUsd = fromTerminal * unitPriceUsd;
  let scarcity: MissionFuelUplift['scarcity'] = 'ok';
  if (shortfall > 0) {
    scarcity = availableKg <= 0 ? 'dry' : 'partial';
    const mult = scarcity === 'dry' ? DRY_SURCHARGE : PARTIAL_SURCHARGE;
    costUsd += shortfall * unitPriceUsd * mult;
  }
  costUsd = Math.max(0, Math.round(costUsd));
  return {
    originIcao,
    requestedKg,
    availableKg,
    unitPriceUsd,
    costUsd,
    scarcity,
    distanceNm: distance,
  };
}

/** Drain local stock; tanker supply covers any quoted shortfall at its surcharge. */
export function deliverFuelUplift(
  world: CareerEconomyWorld,
  quote: FuelUpliftQuote,
): MissionFuelUplift {
  const ap = world.airports.find((a) => a.icao === quote.originIcao);
  if (!ap) {
    throw new Error(`Unknown airport for fuel uplift: ${quote.originIcao}`);
  }
  ensureAirportFuelInventory(ap);
  const stock = fuelPile(ap);
  const fromTerminalKg = Math.min(
    quote.requestedKg,
    Math.max(0, Math.floor(stock.stockKg)),
  );
  stock.stockKg = clamp(stock.stockKg - fromTerminalKg, 0, stock.capacityKg);
  return {
    originIcao: quote.originIcao,
    requestedKg: quote.requestedKg,
    deliveredKg: quote.requestedKg,
    unitPriceUsd: quote.unitPriceUsd,
    costUsd: quote.costUsd,
    scarcity: quote.scarcity,
    upliftedAtTick: world.tick,
  };
}

export function applyNpcFuelUplift(
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    aircraftClassId: FreighterClassId;
  },
): Pick<
  MissionFuelUplift,
  'deliveredKg' | 'costUsd' | 'scarcity' | 'requestedKg'
> {
  const quote = quoteFuelUplift(world, opts);
  const uplift = deliverFuelUplift(world, quote);
  return {
    requestedKg: uplift.requestedKg,
    deliveredKg: uplift.deliveredKg,
    costUsd: uplift.costUsd,
    scarcity: uplift.scarcity,
  };
}

/** Wallet helper after depart / auto-depart settle. */
export function debitWalletForFuel(walletUsd: number, fuelDebitUsd: number): number {
  if (!(fuelDebitUsd > 0)) return walletUsd;
  return Math.round((walletUsd - fuelDebitUsd) * 100) / 100;
}

export function fuelCommodityName(): string {
  return getCommodity('fuel').name;
}
