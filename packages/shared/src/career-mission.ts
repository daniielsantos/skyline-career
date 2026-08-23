import {
  applyFreightDelivery,
  CAREER_HUB_COORDS,
  getCommodity,
  listMarketLots,
  routeDistanceNm,
  shrinkLotAfterDelivery,
  type CareerEconomyWorld,
  type MarketLotView,
} from './career-economy.js';
import { invalidateLaneInboundIndex } from './career-lane-index.js';
import { quoteContractPilotFeeUsd } from './career-contract-pilot-fee.js';
import { applyAircraftHoursAfterMission, estimateMissionBlockHours } from './career-aircraft-market.js';
import {
  applyPlayerDepartFuel,
  assignAircraftToMission,
  findPlayerAircraft,
  relocateAircraftOnSettle,
  releaseAircraftOnCancel,
} from './career-fleet.js';
import { deliverFuelUplift, quoteFuelUplift } from './career-fuel.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { depositCargoToWarehouse, recordWarehouseShipmentKg } from './career-warehouse-stock.js';
import { whOpsShippedMultForWarehouse } from './career-ground-staff.js';
import { syncPilotIcaoTo } from './career-pilot-travel.js';
import {
  evaluateMinAirborneElapsed,
  resolveExpectedRouteMs,
} from './career-flight-watch.js';
import type { FlightScoreSnapshot } from './career-flight-score.js';
import type { WeatherOpsSnapshot } from './career-weather-ops.js';
import { evaluateRunwayTouchdown } from './career-runways.js';
import type { RunwayTouchdownSnapshot } from './career-runways.js';
import {
  applyCargoOpsOnSettle,
  cargoOpsIsUnlocked,
  cargoOpsLatePenaltyMult,
  cargoOpsPayMult,
  cargoOpsValueScorePenaltyFraction,
  type CargoOpsDelta,
} from './career-cargo-ops.js';
import {
  applyClassOpsOnSettle,
  assertClassOpsUnlocked,
  type ClassOpsDelta,
} from './career-class-ops.js';
import { TICKS_PER_HOUR } from './career-clock.js';
import { assertBushLightGa, isOfflineNetworkHub } from './career-bush.js';
import {
  findCareerPlayerAirframe,
  listCareerPlayerAirframes,
  resolveAirframeFuelBurnKgPerNm,
  resolveAirframeMaxRangeNm,
  type CareerPlayerAirframe,
} from './career-player-airframes.js';
import type {
  CareerMissionsState,
  PlayerAircraft,
} from './types/career-economy.js';
import { KG_TO_LB } from './ofp-compliance.js';
import type {
  ComplianceFinding,
  ComplianceVerdict,
  OfpExpectation,
} from './types/ofp-compliance.js';
import type {
  AircraftClass,
  FreighterClassId,
  InboundPending,
  MissionIntent,
  MissionLotLine,
  MissionSettlement,
  MissionSettlementLine,
  ShipmentLot,
} from './types/career-economy.js';
import { MAX_MANIFEST_LOTS } from './types/career-economy.js';

export type {
  AircraftClass,
  FreighterClassId,
  MissionIntent,
  MissionLotLine,
  MissionSettlement,
  MissionSettlementLine,
  MissionStatus,
  CareerMissionsState,
  MissionFuelUplift,
} from './types/career-economy.js';
export { MAX_MANIFEST_LOTS } from './types/career-economy.js';
export {
  quoteFuelUplift,
  deliverFuelUplift,
  estimateUpliftKg,
  debitWalletForFuel,
  applyNpcFuelUplift,
  type FuelUpliftQuote,
} from './career-fuel.js';

export const CAREER_AIRCRAFT_CLASSES: readonly AircraftClass[] = [
  {
    id: 'narrow_freighter',
    name: 'Narrow freighter (B738 BCF class)',
    /** Fallback when SimBrief airframes.json is unreachable; live limit ≈ maxcargo. */
    maxCargoKg: 18_137,
    maxRangeNm: 2_500,
    rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Boeing Converted Freighter',
    fuelBurnKgPerNm: 5,
    fuelTaxiKg: 400,
    fuelCapacityKg: 20_894,
    oewKg: 42_264,
    mtowKg: 79_333,
    fuelRouteFactor: 1.2,
    fuelReserveKg: 1_500,
  },
  {
    id: 'wide_freighter',
    name: 'Wide freighter (MD-11F class)',
    /** Fallback; live limit prefers SimBrief mzfw−oew when maxcargo is 0. */
    maxCargoKg: 90_000,
    maxRangeNm: 6_000,
    rolesPackRelPath: 'profiles/ofp/tfdi-md11f.json',
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'MD1F',
    simbriefAirframeMatch: 'TFDi Design \\(MSFS\\) - MD-11F',
    fuelBurnKgPerNm: 12,
    fuelTaxiKg: 900,
    fuelCapacityKg: 117_400,
    oewKg: 112_748,
    mtowKg: 286_000,
    fuelRouteFactor: 1.15,
    fuelReserveKg: 5_000,
  },
  {
    id: 'light_turboprop',
    name: 'Light turboprop (C208 Caravan Cargo Pod)',
    /** Fallback; live prefer SimBrief C208 mzfw−oew (~1704 kg). */
    maxCargoKg: 1_704,
    maxRangeNm: 900,
    rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C208',
    simbriefAirframeMatch: 'Default',
    fuelBurnKgPerNm: 0.8,
    fuelTaxiKg: 40,
    /** SimBrief Default C208 maxfuel 2265 lb. */
    fuelCapacityKg: 1_027,
    /** Default C208 weights aligned with SimBrief OFP (SBCT→SBGL MTOW case). */
    oewKg: 2_152,
    mtowKg: 3_969,
    /**
     * Mild GC→airway + contingency pad. Was 1.8 (and reserve 200 kg), which
     * blocked KMIA→MMUN (~462 nm) at ~2410 lb vs SimBrief block ~1716 lb.
     */
    fuelRouteFactor: 1.15,
    /** Contingency / alternate-ish; taxi is separate. */
    fuelReserveKg: 120,
  },
  {
    id: 'light_jet',
    name: 'Light jet (Learjet 35A class)',
    /** Structural payload ≈ LJ35A max payload (~3190 lb). */
    maxCargoKg: 1_450,
    maxRangeNm: 2_000,
    rolesPackRelPath: 'profiles/ofp/light-jet-class.json',
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'LJ35',
    simbriefAirframeMatch: 'Default',
    fuelBurnKgPerNm: 1.4,
    fuelTaxiKg: 80,
    /** ~6198 lb usable Jet-A. */
    fuelCapacityKg: 2_810,
    oewKg: 4_680,
    mtowKg: 8_300,
    /** Mild GC→airway pad (was 1.5). */
    fuelRouteFactor: 1.15,
    fuelReserveKg: 280,
  },
  {
    id: 'medium_piston',
    name: 'Medium piston (DC-6 class)',
    /**
     * 4-engine radial freighter / classic airliner.
     * Between Caravan (~1.7 t) and B738 BCF (~18 t); DC-6A freighter payload ≈ 10 t.
     */
    maxCargoKg: 10_000,
    maxRangeNm: 2_200,
    rolesPackRelPath: 'profiles/ofp/pmdg-dc6.json',
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'DC6',
    simbriefAirframeMatch: 'Default',
    fuelBurnKgPerNm: 3.2,
    fuelTaxiKg: 180,
    /** ~19,400 lb avgas usable planning capacity. */
    fuelCapacityKg: 8_800,
    oewKg: 27_786,
    mtowKg: 46_628,
    fuelRouteFactor: 1.2,
    fuelReserveKg: 900,
  },
  {
    id: 'light_ga',
    name: 'Light GA (BE36 Bonanza Professional)',
    /**
     * Fallback structural payload for piston BE36 family (A36 / A36TC).
     * B36TP is light_turboprop with its own Market SKU.
     */
    maxCargoKg: 450,
    maxRangeNm: 800,
    rolesPackRelPath: 'profiles/ofp/blacksquare-bonanza-professional.json',
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'BE36',
    simbriefAirframeMatch: 'Default',
    fuelBurnKgPerNm: 0.35,
    fuelTaxiKg: 20,
    /** A36 mains+tips ~110 gal avgas ≈ 299 kg usable planning capacity. */
    fuelCapacityKg: 299,
    oewKg: 973,
    mtowKg: 1_656,
    /**
     * Same pad family as light_turboprop. Was 1.8 + 80 kg reserve — overstated
     * block fuel on short GA hops the same way the Caravan did.
     */
    fuelRouteFactor: 1.15,
    fuelReserveKg: 45,
  },
] as const;

const CLASS_BY_ID: Record<FreighterClassId, AircraftClass> = Object.fromEntries(
  CAREER_AIRCRAFT_CLASSES.map((c) => [c.id, c]),
) as Record<FreighterClassId, AircraftClass>;

export function getAircraftClass(id: FreighterClassId): AircraftClass {
  return CLASS_BY_ID[id];
}

/** Preferred load path for a mission's aircraft class (manual always allowed in UI). */
export function missionLoadPolicy(mission: {
  aircraftClassId: FreighterClassId | string;
  airframeTypeId?: string | null;
}): {
  loadMethod: AircraftClass['loadMethod'];
  injectCapable: boolean;
} {
  const aircraft = getAircraftClass(mission.aircraftClassId as FreighterClassId);
  const airframe = findCareerPlayerAirframe(mission.airframeTypeId);
  if (airframe?.injectCapable === false) {
    return { loadMethod: 'native-simbrief', injectCapable: false };
  }
  // Homologated SKUs may opt into Skyline inject via airframe.injectCapable
  // even when the class defaults to EFB-only (narrow/wide freighter).
  if (airframe?.injectCapable === true) {
    return { loadMethod: 'direct-injection', injectCapable: true };
  }
  return {
    loadMethod: aircraft.loadMethod,
    injectCapable: aircraft.injectCapable,
  };
}

export function withMissionLoadPolicy<T extends { aircraftClassId: FreighterClassId | string }>(
  mission: T,
): T & { loadMethod: AircraftClass['loadMethod']; injectCapable: boolean } {
  return { ...mission, ...missionLoadPolicy(mission) };
}

/** Server/API gate: only direct-injection + injectCapable may call load-ofp apply. */
export function careerAllowsDirectInject(policy: {
  loadMethod?: string;
  injectCapable?: boolean;
}): boolean {
  return policy.loadMethod === 'direct-injection' && policy.injectCapable === true;
}

/** Roles-pack gate used by ofp-load before writing SimVars. */
export function assertRolesPackAllowsDirectInjection(pack: {
  loadMethod?: string;
  injectCapable?: boolean;
}): void {
  if (pack.loadMethod && pack.loadMethod !== 'direct-injection') {
    throw new Error(
      `Roles pack loadMethod=${pack.loadMethod} — direct injection is not allowed for this aircraft`,
    );
  }
  if (pack.injectCapable === false) {
    throw new Error(
      'Roles pack is not injectCapable — use native SimBrief/EFB import + Validate',
    );
  }
}

/** Career Preflight Loaded vs Due: fuel+payload only; CG never blocks alone. */
export function careerPreflightReady(opts: {
  fuelFailed: boolean;
  payloadFailed: boolean;
}): boolean {
  return !opts.fuelFailed && !opts.payloadFailed;
}

/**
 * Numeric Loaded vs Due match. Prefer this over finding codes alone — freighter
 * OFPs can omit PAYLOAD_TOTAL (baggage-only sheet) while the UI still shows Due cargo.
 */
export function careerLoadWeightMatchOk(
  liveLb: number | undefined,
  plannedLb: number | undefined,
  toleranceLb: number,
): boolean {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) return true;
  if (liveLb === undefined || !Number.isFinite(liveLb)) return false;
  return Math.abs(liveLb - plannedLb) <= Math.max(0, toleranceLb);
}

/**
 * Extra Sim undershoot vs OFP block fuel allowed after a good inject (taxi / APU).
 * Overshoot stays on the tight `toleranceLb` band plus unusable-floor slack.
 */
export const DEFAULT_FUEL_TAXI_BURN_LB = 150;

/**
 * Heavy jets burn far more than 150 lb before takeoff. Keep at least this
 * fraction of Due as taxi/APU slack (still capped by FUEL_TAXI_BURN_MAX…).
 */
export const FUEL_TAXI_BURN_MIN_FRACTION_OF_PLANNED = 0.01;

/**
 * Taxi slack cannot exceed this fraction of Due — otherwise a short OFP
 * (e.g. 187 lb) stays READY after an EFB drain almost to empty.
 */
export const FUEL_TAXI_BURN_MAX_FRACTION_OF_PLANNED = 0.5;

/**
 * Ceiling for the Sim overshoot vs Due allowed for MSFS AUX/TIP unusable fuel
 * that inject cannot drain (King Air tip pair ~58 lb/side, Baron AUX floors, …).
 */
export const DEFAULT_FUEL_UNUSABLE_OVERSHOOT_LB = 200;

/**
 * Unusable floors scale with the aircraft, so a flat 200 lb would let a C172
 * depart with full tanks against a 200 lb OFP block. Keep the King Air-class
 * proportion (~6% of block) and cap it at the absolute ceiling.
 */
export function fuelUnusableOvershootLb(plannedLb: number): number {
  if (!Number.isFinite(plannedLb) || plannedLb <= 0) return 0;
  return Math.min(
    DEFAULT_FUEL_UNUSABLE_OVERSHOOT_LB,
    Math.max(50, plannedLb * 0.07),
  );
}

/** Effective taxi undershoot allowance for a given OFP block. */
export function fuelTaxiBurnAllowanceLb(
  plannedLb: number,
  taxiBurnLb: number = DEFAULT_FUEL_TAXI_BURN_LB,
): number {
  if (!Number.isFinite(plannedLb) || plannedLb <= 0) return 0;
  const scaled = Math.max(
    Math.max(0, taxiBurnLb),
    plannedLb * FUEL_TAXI_BURN_MIN_FRACTION_OF_PLANNED,
  );
  return Math.min(scaled, plannedLb * FUEL_TAXI_BURN_MAX_FRACTION_OF_PLANNED);
}

/** Symmetric |Sim−Due| band used with taxi undershoot (Career OFP defaults). */
export function fuelMatchToleranceLb(
  plannedLb: number | undefined,
  absLb = 50,
  pct = 0.03,
): number {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) {
    return Math.max(0, absLb);
  }
  return Math.max(Math.max(0, absLb), Math.abs(plannedLb) * Math.max(0, pct));
}

/**
 * EFB station rounding on jet sheets is often a few hundred lb off the OFP
 * (Just Flight paxwgt vs SimBrief 175+55). GA / light twins stay on a 75 lb
 * floor below {@link LARGE_PAYLOAD_TOL_PLANNED_LB}.
 */
export const DEFAULT_PAYLOAD_TOL_FRACTION = 0.002;
/** Above this Due, allow a wider band (Cargo Level % / EFB sheet rounding). */
export const LARGE_PAYLOAD_TOL_PLANNED_LB = 4_000;
export const LARGE_PAYLOAD_TOL_FRACTION = 0.005;
export const LARGE_PAYLOAD_TOL_ABS_LB = 800;

export function payloadMatchToleranceLb(
  plannedLb: number | undefined,
  absLb = 75,
  pct = DEFAULT_PAYLOAD_TOL_FRACTION,
): number {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) {
    return Math.max(0, absLb);
  }
  const large = Math.abs(plannedLb) >= LARGE_PAYLOAD_TOL_PLANNED_LB;
  const useAbs = large ? Math.max(absLb, LARGE_PAYLOAD_TOL_ABS_LB) : absLb;
  const usePct = large ? Math.max(pct, LARGE_PAYLOAD_TOL_FRACTION) : pct;
  return Math.max(Math.max(0, useAbs), Math.abs(plannedLb) * Math.max(0, usePct));
}

/**
 * Fuel Loaded vs Due: allow Sim below Due by tol + taxi burn, and slightly
 * above Due for unusable tank floors inject cannot clear.
 */
export function careerFuelMatchOk(
  liveLb: number | undefined,
  plannedLb: number | undefined,
  toleranceLb: number,
  taxiBurnLb: number = DEFAULT_FUEL_TAXI_BURN_LB,
  unusableOvershootLb?: number,
): boolean {
  if (plannedLb === undefined || !Number.isFinite(plannedLb)) return true;
  if (liveLb === undefined || !Number.isFinite(liveLb)) return false;
  const tol = Math.max(0, toleranceLb);
  const taxi = fuelTaxiBurnAllowanceLb(plannedLb, taxiBurnLb);
  const unusable = Math.max(
    0,
    unusableOvershootLb ?? fuelUnusableOvershootLb(plannedLb),
  );
  const delta = liveLb - plannedLb;
  if (delta > 0) return delta <= tol + unusable;
  return -delta <= tol + taxi;
}

export function softenCareerPreflightVerdict(
  ready: boolean,
  snapshotVerdict: 'pass' | 'warn' | 'fail',
): 'pass' | 'warn' | 'fail' {
  if (!ready) return 'fail';
  if (snapshotVerdict === 'fail') return 'warn';
  return snapshotVerdict;
}

export function softenCgFindingSeverity(code: string, severity: string): string {
  const isCg = code.startsWith('CG_') || code.includes('CG');
  if (isCg && severity === 'fail') return 'warn';
  // Career Loaded vs Due gates on block-fuel total; per-tank splits are advisory
  // (classic L/R often glitch to 0 while FUEL TOTAL still matches).
  if (
    severity === 'fail' &&
    (code === 'FUEL_LEFT' || code === 'FUEL_RIGHT' || code === 'FUEL_CENTER')
  ) {
    return 'warn';
  }
  return severity;
}

/**
 * Station crew reserved under MTOW before freight (2×170 lb). SimBrief BOW
 * often folds crew into OEW; MSFS empty usually does not — Skyline inject
 * still seeds crew seats, so offline ops must leave that room.
 */
export const FREIGHTER_DISPATCH_CREW_KG = (2 * 170) / KG_TO_LB;

/**
 * Prefer heavier empty / lighter MTOW between a SimBrief (or class) sample and
 * the catalog row — offline stand-in for “what MSFS will actually weigh.”
 */
export function resolveConservativeOpsWeights(weights: {
  oewKg?: number;
  mtowKg?: number;
  catalogOewKg?: number;
  catalogMtowKg?: number;
  crewKg?: number;
}): { oewKg?: number; mtowKg?: number; crewKg: number } {
  let oewKg = weights.oewKg;
  let mtowKg = weights.mtowKg;
  if (
    typeof weights.catalogOewKg === 'number' &&
    Number.isFinite(weights.catalogOewKg) &&
    weights.catalogOewKg > 0
  ) {
    oewKg =
      typeof oewKg === 'number' && Number.isFinite(oewKg) && oewKg > 0
        ? Math.max(oewKg, weights.catalogOewKg)
        : weights.catalogOewKg;
  }
  if (
    typeof weights.catalogMtowKg === 'number' &&
    Number.isFinite(weights.catalogMtowKg) &&
    weights.catalogMtowKg > 0
  ) {
    mtowKg =
      typeof mtowKg === 'number' && Number.isFinite(mtowKg) && mtowKg > 0
        ? Math.min(mtowKg, weights.catalogMtowKg)
        : weights.catalogMtowKg;
  }
  const crewKg =
    typeof weights.crewKg === 'number' &&
    Number.isFinite(weights.crewKg) &&
    weights.crewKg >= 0
      ? weights.crewKg
      : FREIGHTER_DISPATCH_CREW_KG;
  return { oewKg, mtowKg, crewKg };
}

/**
 * Route operational cargo cap for Staging / Dispatch prefill.
 * Uses homologated class weights (or live SimBrief OEW/MTOW override):
 * min(structuralMaxCargo, MTOW − OEW − takeoffFuel − margin − crew).
 * New aircraft homologations must fill oewKg/mtowKg/fuel* on AircraftClass.
 *
 * Prefer per-airframe fuel burn / tank when provided — class light_ga burn is
 * Bonanza-sized and will falsely fail Commander / C172 tank checks on short hops.
 */
export function estimateRouteCargoLimit(
  aircraftClassId: FreighterClassId,
  distanceNm: number,
  structuralMaxCargoKg: number,
  weights: {
    oewKg?: number;
    mtowKg?: number;
    fuelCapacityKg?: number;
    /** Prefer catalog airframe burn when known. */
    fuelBurnKgPerNm?: number;
    fuelTaxiKg?: number;
    fuelReserveKg?: number;
    fuelRouteFactor?: number;
    airframeTypeId?: string;
    /**
     * MX / condition burn multiplier (≥1). Scales cruise burn term only
     * (taxi + reserve unchanged).
     */
    fuelBurnMult?: number;
    /**
     * Station crew mass (kg) reserved under MTOW before freight — Skyline
     * inject seeds ~170 lb/seat on freighter crew stations (SimBrief BOW
     * often already includes crew; MSFS empty often does not).
     */
    crewKg?: number;
  } = {},
): {
  operationalMaxCargoKg: number;
  estimatedBlockFuelKg: number;
  fuelCapacityKg: number;
  fuelDeficitKg: number;
  fuelFeasible: boolean;
  structuralMaxCargoKg: number;
  oewKg: number;
  mtowKg: number;
  /** Effective burn mult applied (1 when healthy / omitted). */
  fuelBurnMult: number;
} {
  const aircraft = getAircraftClass(aircraftClassId);
  const oewKg = weights.oewKg ?? aircraft.oewKg;
  const mtowKg = weights.mtowKg ?? aircraft.mtowKg;
  const fuelCapacityKg =
    weights.fuelCapacityKg ?? aircraft.fuelCapacityKg;
  const burnKgPerNm =
    (typeof weights.fuelBurnKgPerNm === 'number' &&
    weights.fuelBurnKgPerNm > 0
      ? weights.fuelBurnKgPerNm
      : undefined) ??
    (weights.airframeTypeId
      ? resolveAirframeFuelBurnKgPerNm(weights.airframeTypeId, aircraftClassId)
      : aircraft.fuelBurnKgPerNm);
  const fuelBurnMult =
    typeof weights.fuelBurnMult === 'number' &&
    Number.isFinite(weights.fuelBurnMult) &&
    weights.fuelBurnMult >= 1
      ? weights.fuelBurnMult
      : 1;
  // Scale taxi/reserve when the airframe tank is smaller than the class template
  // (e.g. Commander 190 kg vs Bonanza-class 380 kg planning defaults).
  const capacityRatio =
    aircraft.fuelCapacityKg > 0
      ? Math.min(1, fuelCapacityKg / aircraft.fuelCapacityKg)
      : 1;
  const fuelTaxiKg =
    typeof weights.fuelTaxiKg === 'number' && weights.fuelTaxiKg >= 0
      ? weights.fuelTaxiKg
      : Math.max(5, Math.round(aircraft.fuelTaxiKg * capacityRatio));
  const fuelReserveKg =
    typeof weights.fuelReserveKg === 'number' && weights.fuelReserveKg >= 0
      ? weights.fuelReserveKg
      : Math.max(20, Math.round(aircraft.fuelReserveKg * capacityRatio));
  const fuelRouteFactor =
    typeof weights.fuelRouteFactor === 'number' && weights.fuelRouteFactor > 0
      ? weights.fuelRouteFactor
      : aircraft.fuelRouteFactor;
  const nm = Math.max(0, Number.isFinite(distanceNm) ? distanceNm : 0);
  const structural = Math.max(0, Math.floor(structuralMaxCargoKg));
  const estimatedBlockFuelKg = Math.round(
    fuelTaxiKg +
      burnKgPerNm * nm * fuelRouteFactor * fuelBurnMult +
      fuelReserveKg,
  );
  const takeoffFuelKg = Math.max(0, estimatedBlockFuelKg - fuelTaxiKg);
  // Extra margin vs SimBrief's often-heavier OEW / contingency so staging
  // overbooks less often (Accept OFP cargo covers residual cuts).
  const marginKg = Math.max(50, Math.round(structural * 0.05));
  const crewKg =
    typeof weights.crewKg === 'number' &&
    Number.isFinite(weights.crewKg) &&
    weights.crewKg > 0
      ? weights.crewKg
      : 0;
  const mtowPayloadKg = Math.max(
    0,
    Math.floor(mtowKg - oewKg - takeoffFuelKg - marginKg - crewKg),
  );
  // Allow 1 kg float/round slack so equal display values don't hard-block.
  const fuelFeasible = estimatedBlockFuelKg <= fuelCapacityKg + 1;
  return {
    // No ops cargo when the planned block does not fit the tanks — otherwise
    // MTOW math can still show leftover payload on an impossible fuel plan.
    operationalMaxCargoKg: fuelFeasible
      ? Math.min(structural, mtowPayloadKg)
      : 0,
    estimatedBlockFuelKg,
    fuelCapacityKg,
    fuelDeficitKg: Math.max(0, estimatedBlockFuelKg - fuelCapacityKg),
    fuelFeasible,
    structuralMaxCargoKg: structural,
    oewKg,
    mtowKg,
    fuelBurnMult,
  };
}

/** Board / Freights estimate: lift + Jet-A cost for a chosen class/airframe. */
export type BoardLotEconomics = {
  liftKg: number;
  /** Pro-rated contract pay for `liftKg`. */
  payUsd: number;
  fuelCostUsd: number;
  netUsd: number;
  marginPct: number;
  estimatedBlockFuelKg: number;
  fuelFeasible: boolean;
  inRange: boolean;
};

/**
 * Estimate net (pay − Jet-A) for one market lot on a specific aircraft.
 * Uses the same route fuel planning as staging (`estimateRouteCargoLimit` + `quoteFuelUplift`).
 */
export function estimateBoardLotEconomics(
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    distanceNm: number;
    availableKg: number;
    quantityKg: number;
    lotPayUsd: number;
    aircraftClassId: FreighterClassId;
    structuralMaxCargoKg: number;
    weights?: {
      oewKg?: number;
      mtowKg?: number;
      fuelCapacityKg?: number;
      fuelBurnKgPerNm?: number;
      fuelTaxiKg?: number;
      fuelReserveKg?: number;
      fuelRouteFactor?: number;
      airframeTypeId?: string;
    };
    maxRangeNm?: number;
    costMult?: number;
  },
): BoardLotEconomics | null {
  const distanceNm = opts.distanceNm;
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) return null;
  const aircraft = getAircraftClass(opts.aircraftClassId);
  const maxRangeNm =
    typeof opts.maxRangeNm === 'number' &&
    Number.isFinite(opts.maxRangeNm) &&
    opts.maxRangeNm > 0
      ? opts.maxRangeNm
      : aircraft.maxRangeNm;
  const inRange = distanceNm <= maxRangeNm;
  const route = estimateRouteCargoLimit(
    opts.aircraftClassId,
    distanceNm,
    opts.structuralMaxCargoKg,
    opts.weights ?? {},
  );
  const liftKg = Math.max(
    0,
    Math.min(Math.floor(opts.availableKg), route.operationalMaxCargoKg),
  );
  let fuelCostUsd: number;
  try {
    fuelCostUsd = quoteFuelUplift(world, {
      originIcao: opts.originIcao,
      destIcao: opts.destIcao,
      aircraftClassId: opts.aircraftClassId,
      distanceNm,
      requestedKg: route.estimatedBlockFuelKg,
      costMult: opts.costMult,
    }).costUsd;
  } catch {
    return null;
  }
  const qty =
    opts.quantityKg > 0
      ? opts.quantityKg
      : Math.max(opts.availableKg, 1);
  const payUsd =
    liftKg > 0
      ? Math.max(0, Math.round((liftKg / qty) * opts.lotPayUsd))
      : 0;
  const netUsd = payUsd - fuelCostUsd;
  const marginPct =
    payUsd > 0 ? netUsd / payUsd : netUsd < 0 ? -1 : 0;
  return {
    liftKg,
    payUsd,
    fuelCostUsd,
    netUsd,
    marginPct,
    estimatedBlockFuelKg: route.estimatedBlockFuelKg,
    fuelFeasible: route.fuelFeasible,
    inRange,
  };
}

export function parseFreighterClassId(raw: string | undefined): FreighterClassId | undefined {
  if (!raw) return undefined;
  if (
    raw === 'narrow_freighter' ||
    raw === 'wide_freighter' ||
    raw === 'medium_piston' ||
    raw === 'light_jet' ||
    raw === 'light_turboprop' ||
    raw === 'light_ga'
  ) {
    return raw;
  }
  if (raw === 'narrow' || raw === 'bcf' || raw === '738') return 'narrow_freighter';
  if (raw === 'wide' || raw === 'md11' || raw === 'md-11f') return 'wide_freighter';
  if (
    raw === 'medium' ||
    raw === 'piston' ||
    raw === 'dc6' ||
    raw === 'dc-6' ||
    raw === 'douglas'
  ) {
    return 'medium_piston';
  }
  if (
    raw === 'jet' ||
    raw === 'lightjet' ||
    raw === 'light_jet' ||
    raw === 'lj35' ||
    raw === 'learjet' ||
    raw === 'citation' ||
    raw === 'cj'
  ) {
    return 'light_jet';
  }
  if (raw === 'caravan' || raw === 'c208' || raw === 'light' || raw === 'turboprop' || raw === 'b36tp') {
    return 'light_turboprop';
  }
  if (raw === 'bonanza' || raw === 'be36' || raw === 'ga' || raw === 'a36') {
    return 'light_ga';
  }
  return undefined;
}

function lotAvailableKg(lot: ShipmentLot): number {
  if (lot.status !== 'available' && lot.status !== 'reserved') {
    return 0;
  }
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function findLot(world: CareerEconomyWorld, lotId: string): ShipmentLot {
  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot) {
    throw new Error(`Unknown shipment lot: ${lotId}`);
  }
  return lot;
}

function missionLines(mission: MissionIntent): MissionLotLine[] {
  if (Array.isArray(mission.lots) && mission.lots.length > 0) {
    return mission.lots;
  }
  // Empty legs keep shipmentLotId for bookkeeping — do not invent a 0 kg freight
  // line (that made Ferry Dispatch look like "0.0 klb general · $fee · urgent").
  if (
    mission.crewDeadhead === true ||
    mission.contractPilotReposition === true ||
    mission.emptyFlight === true
  ) {
    return [];
  }
  // Legacy single-lot saves / test fixtures without `lots`.
  if (mission.shipmentLotId) {
    return [
      {
        shipmentLotId: mission.shipmentLotId,
        commodityId: mission.commodityId,
        cargoKg: mission.cargoKg,
        payUsd: mission.payUsd,
        urgency: mission.urgency,
        reason: mission.reason,
        deadlineTick: mission.deadlineTick,
      },
    ];
  }
  return [];
}

/** True when the mission carries no freight (crew return, CP reposition, or player empty). */
export function isEmptyLegMission(mission: MissionIntent): boolean {
  return (
    mission.crewDeadhead === true ||
    mission.contractPilotReposition === true ||
    mission.emptyFlight === true
  );
}

/** Recompute top-level mirrors from `lots` (or legacy single-lot fields). */
export function recomputeMissionTotals(mission: MissionIntent): MissionIntent {
  // Empty legs first — ignore any phantom 0 kg lot left by older missionLines.
  if (mission.crewDeadhead) {
    return {
      ...mission,
      lots: [],
      shipmentLotId: mission.shipmentLotId || `deadhead_${mission.id}`,
      commodityId: mission.commodityId || 'general',
      cargoKg: 0,
      payUsd: 0,
      deadlineTick: mission.deadlineTick,
      urgency: 'normal',
      reason: mission.reason || 'Crew return',
    };
  }
  if (mission.contractPilotReposition) {
    return {
      ...mission,
      lots: [],
      shipmentLotId: mission.shipmentLotId || `deadhead_${mission.id}`,
      commodityId: mission.commodityId || 'general',
      cargoKg: 0,
      payUsd: Math.max(0, mission.payUsd ?? mission.contractPilotFeeUsd ?? 0),
      deadlineTick: mission.deadlineTick,
      urgency: 'normal',
      reason: mission.reason || 'Reposition',
    };
  }
  if (mission.emptyFlight) {
    return {
      ...mission,
      lots: [],
      shipmentLotId: mission.shipmentLotId || `empty_${mission.id}`,
      commodityId: mission.commodityId || 'general',
      cargoKg: 0,
      payUsd: 0,
      deadlineTick: mission.deadlineTick,
      urgency: 'normal',
      reason: mission.reason || 'Empty flight',
      emptyFlight: true,
    };
  }

  const lots = missionLines(mission);
  if (lots.length === 0) {
    throw new Error(`Mission ${mission.id} has no lot lines`);
  }
  const cargoKg = lots.reduce((sum, line) => sum + line.cargoKg, 0);
  const payUsd = lots.reduce((sum, line) => sum + line.payUsd, 0);
  const deadlineTick = Math.min(...lots.map((line) => line.deadlineTick));
  const urgency = lots.some((line) => line.urgency === 'urgent') ? 'urgent' : 'normal';
  const primary = lots.reduce((best, line) =>
    line.cargoKg > best.cargoKg ? line : best,
  );
  const reason =
    lots.length === 1
      ? primary.reason
      : `${lots.length} lots · ${(cargoKg / 1000).toFixed(1)} t · primary ${getCommodity(primary.commodityId).name}`;
  return {
    ...mission,
    lots,
    shipmentLotId: lots[0]!.shipmentLotId,
    commodityId: primary.commodityId,
    cargoKg,
    payUsd,
    deadlineTick,
    urgency,
    reason,
  };
}

/** Soft-migrate legacy MissionIntent / dirty saves into canonical `lots[]`. */
export function normalizeMissionIntent(
  raw: MissionIntent | (Omit<MissionIntent, 'lots'> & { lots?: MissionLotLine[] }),
): MissionIntent {
  return recomputeMissionTotals(raw as MissionIntent);
}

export function normalizeMissionsList(missions: MissionIntent[]): MissionIntent[] {
  return missions.map((m) => normalizeMissionIntent(m));
}

/** Remaining payload capacity on an open flight (kg). */
export function missionRemainingCapacityKg(
  mission: MissionIntent,
  maxCargoKg: number,
): number {
  const normalized = normalizeMissionIntent(mission);
  return Math.max(0, Math.floor(maxCargoKg) - normalized.cargoKg);
}

/**
 * Find the single open same-OD+aircraft flight to auto-append into.
 * Returns undefined if zero or more than one match (caller creates a new flight).
 */
export function findOpenManifestForRoute(
  missions: readonly MissionIntent[],
  opts: {
    originIcao: string;
    destIcao: string;
    aircraftClassId: FreighterClassId;
    /** When set, do not bind a flight already assigned to another tail. */
    aircraftId?: string;
  },
): MissionIntent | undefined {
  const matches = missions
    .map((m) => normalizeMissionIntent(m))
    .filter(
      (m) =>
        (m.status === 'accepted' || m.status === 'dispatched') &&
        !isEmptyLegMission(m) &&
        m.aircraftClassId === opts.aircraftClassId &&
        m.originIcao === opts.originIcao &&
        m.destIcao === opts.destIcao &&
        (!opts.aircraftId ||
          !m.aircraftId ||
          m.aircraftId === opts.aircraftId),
    );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Drop leftover accepted/dispatched flights whose hangar tail is no longer assigned. */
export function cancelOrphanPlayerMissions(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  opts?: { nowMs?: number },
): MissionIntent[] {
  const cancelled: MissionIntent[] = [];
  for (const raw of [...state.missions]) {
    const mission = normalizeMissionIntent(raw);
    if (mission.crewOperated) continue;
    if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
      continue;
    }
    const aircraft = mission.aircraftId
      ? findPlayerAircraft(state, mission.aircraftId)
      : undefined;
    const bound =
      Boolean(aircraft) &&
      aircraft!.status === 'assigned' &&
      (aircraft!.assignedMissionId === mission.id ||
        !aircraft!.assignedMissionId);
    if (bound) continue;
    const next = cancelMission(world, mission, {
      fleet: state,
      nowMs: opts?.nowMs,
    });
    const idx = state.missions.findIndex((row) => row.id === mission.id);
    if (idx >= 0) state.missions[idx] = next;
    cancelled.push(next);
  }
  return cancelled;
}

const ACTIVE_MISSION_STATUSES = new Set(['accepted', 'dispatched', 'in_flight']);

export function isActiveMissionStatus(status: string): boolean {
  return ACTIVE_MISSION_STATUSES.has(status);
}

/** Drop all player inbound rows for one mission. */
export function clearPlayerInbound(
  world: CareerEconomyWorld,
  missionId: string,
): void {
  if (!Array.isArray(world.inboundPending) || world.inboundPending.length === 0) {
    return;
  }
  const before = world.inboundPending.length;
  world.inboundPending = world.inboundPending.filter(
    (pending) => pending.missionId !== missionId,
  );
  if (world.inboundPending.length !== before) {
    invalidateLaneInboundIndex(world);
  }
}

/**
 * Publish (or refresh) destination-notified inbound for an active player flight.
 * Soft fill / lane saturation read these rows alongside NPC airborne cargo.
 */
export function syncPlayerInbound(
  world: CareerEconomyWorld,
  mission: MissionIntent,
): void {
  const normalized = normalizeMissionIntent(mission);
  clearPlayerInbound(world, normalized.id);
  if (!isActiveMissionStatus(normalized.status)) {
    return;
  }
  // Demand Board hauls are company inventory → terminal fill, not market soft-fill.
  if (normalized.demandOrderId || normalized.portPickupId) {
    return;
  }
  if (!Array.isArray(world.inboundPending)) {
    world.inboundPending = [];
  }
  const rows: InboundPending[] = normalized.lots.map((line) => ({
    id: `${normalized.id}:${line.shipmentLotId}`,
    missionId: normalized.id,
    originIcao: normalized.originIcao,
    destIcao: normalized.destIcao,
    commodityId: line.commodityId,
    cargoKg: line.cargoKg,
    expiresAtTick: line.deadlineTick,
    source: 'player' as const,
  }));
  world.inboundPending.push(...rows);
  invalidateLaneInboundIndex(world);
}

/** Rebuild player inbound from the missions file (source of truth). */
export function reconcilePlayerInbound(
  world: CareerEconomyWorld,
  missions: readonly MissionIntent[],
): void {
  world.inboundPending = (world.inboundPending ?? []).filter(
    (pending) => pending.source !== 'player',
  );
  invalidateLaneInboundIndex(world);
  for (const mission of missions) {
    syncPlayerInbound(world, mission);
  }
}

/** Player missions that are still operational (not settled/cancelled). */
export function listActivePlayerMissions(
  missions: readonly MissionIntent[],
): MissionIntent[] {
  return missions
    .map((m) => normalizeMissionIntent(m))
    .filter((m) => isActiveMissionStatus(m.status));
}

/**
 * Accept an empty player reposition (no freight). Flown via Dispatch/Watch.
 * Allowed from bush / trip-only strips — instant ferry stays blocked on soft-field bush.
 */
export function acceptEmptyFlight(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  opts: { aircraftId: string; destIcao: string; missionId?: string },
): { mission: MissionIntent; aircraft: PlayerAircraft } {
  const bush = state.activeBushTrip;
  if (bush && (bush.status === 'accepted' || bush.status === 'in_progress')) {
    throw new Error('Finish or abandon the active bush trip first');
  }
  const open = listActivePlayerMissions(state.missions ?? []);
  if (open.length > 0) {
    throw new Error(
      `Finish or cancel ${open[0]!.id} before planning an empty flight`,
    );
  }

  const aircraft = findPlayerAircraft(state, opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  if (aircraft.status !== 'parked') {
    throw new Error(`Aircraft ${aircraft.id} is not parked`);
  }

  const origin = aircraft.locationIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  if (!CAREER_HUB_COORDS[origin]) {
    throw new Error(`Unknown origin hub: ${origin}`);
  }
  if (!CAREER_HUB_COORDS[dest]) {
    throw new Error(`Unknown destination hub: ${dest}`);
  }
  if (origin === dest) {
    throw new Error(`Aircraft is already at ${dest}`);
  }

  assertBushLightGa(origin, dest, aircraft.aircraftClassId);

  const distanceNm =
    hubDistanceNm(origin, dest) ?? routeDistanceNm(world, origin, dest);
  if (distanceNm === undefined) {
    throw new Error(`No route distance for ${origin}→${dest}`);
  }
  const maxRangeNm = resolveAirframeMaxRangeNm(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId,
  );
  if (distanceNm > maxRangeNm) {
    throw new Error(
      `Empty flight ${origin}→${dest} is ${Math.round(distanceNm)} nm; max range is ${maxRangeNm} nm — pick a closer hub`,
    );
  }

  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const missionId =
    opts.missionId?.trim() ||
    `msn_empty_${world.tick}_${origin}_${dest}_${Math.floor(Math.random() * 1e6)}`;

  const mission = recomputeMissionTotals({
    id: missionId,
    lots: [],
    shipmentLotId: `empty_${missionId}`,
    commodityId: 'general',
    originIcao: origin,
    destIcao: dest,
    cargoKg: 0,
    pax: 0,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick: world.tick + TICKS_PER_HOUR * 48,
    payUsd: 0,
    urgency: 'normal',
    reason: isOfflineNetworkHub(origin)
      ? `Empty recovery · ${origin}→${dest}`
      : `Empty flight · ${origin}→${dest}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: aircraft.id,
    emptyFlight: true,
  });

  assignAircraftToMission(state, aircraft.id, mission.id, origin);
  state.missions = [...(state.missions ?? []), mission];
  syncPlayerInbound(world, mission);

  return { mission, aircraft };
}

/**
 * Prefer the most recently accepted active mission when recovering UI state.
 * With the single-active gate there should be at most one.
 */
export function findActivePlayerMission(
  missions: readonly MissionIntent[],
): MissionIntent | undefined {
  const active = listActivePlayerMissions(missions);
  if (active.length === 0) return undefined;
  return active.reduce((best, mission) =>
    (mission.acceptedAtTick ?? 0) >= (best.acceptedAtTick ?? 0) ? mission : best,
  );
}

/**
 * Reserve cargoKg from a market lot. Mutates the lot; returns pay pro-rata.
 */
export function reserveShipmentLot(
  world: CareerEconomyWorld,
  lotId: string,
  cargoKg: number,
): { lot: ShipmentLot; reservedKg: number; payUsd: number } {
  const lot = findLot(world, lotId);
  if (lot.status === 'in_transit' || lot.status === 'delivered' || lot.status === 'expired') {
    throw new Error(`Lot ${lotId} is not bookable (status=${lot.status})`);
  }
  const avail = lotAvailableKg(lot);
  if (avail <= 0) {
    throw new Error(`Lot ${lotId} has no remaining cargo`);
  }
  const qty = Math.floor(cargoKg);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`cargoKg must be a positive number (got ${cargoKg})`);
  }
  if (qty > avail) {
    throw new Error(`Requested ${qty} kg but lot only has ${avail} kg available`);
  }

  lot.reservedKg += qty;
  if (lot.reservedKg >= lot.quantityKg) {
    lot.status = 'reserved';
  }

  const payUsd = Math.max(1, Math.round((qty / lot.quantityKg) * lot.payUsd));
  return { lot, reservedKg: qty, payUsd };
}

/**
 * How much of a market lot the player can still put on an in-edit manifest.
 * Reserved lots drop off the airport board, so `availableKg` alone collapses
 * to the last booked slice — restore quantity + currently held kg.
 */
export function manifestEditAvailableKg(opts: {
  bookedKg: number;
  lotQuantityKg?: number;
  marketAvailableKg?: number;
  demandMaxKg?: number;
}): number {
  const booked = Math.max(0, Math.floor(opts.bookedKg));
  const quantity = Math.max(0, Math.floor(opts.lotQuantityKg ?? 0));
  const fromBoard = Math.max(0, Math.floor(opts.marketAvailableKg ?? 0)) + booked;
  const demand = Math.max(0, Math.floor(opts.demandMaxKg ?? 0));
  return Math.max(booked, quantity, fromBoard, demand);
}

/** Release a prior reservation (cancel before settle — including mid-flight). */
export function releaseShipmentReservation(
  world: CareerEconomyWorld,
  lotId: string,
  cargoKg: number,
): void {
  const lot = findLot(world, lotId);
  const release = Math.min(Math.max(0, Math.floor(cargoKg)), lot.reservedKg);
  lot.reservedKg -= release;
  if (
    (lot.status === 'reserved' || lot.status === 'in_transit') &&
    lot.reservedKg < lot.quantityKg
  ) {
    lot.status = lot.reservedKg > 0 ? 'reserved' : 'available';
  }
}

export function acceptMission(
  world: CareerEconomyWorld,
  opts: {
    lotId: string;
    cargoKg?: number;
    aircraftClassId?: FreighterClassId;
    /** Id for a brand-new flight (ignored when appending). */
    missionId?: string;
    /** Override class max (e.g. live SimBrief maxcargo). */
    maxCargoKg?: number;
    /** Append cargo onto this open flight (same OD + aircraft). */
    intoMission?: MissionIntent;
    /** Player cargo ladder — gates unlock + pay mult. */
    cargoOps?: CareerMissionsState['cargoOps'];
    /** Aircraft class ladder — gates which freighter classes may accept. */
    classOps?: CareerMissionsState['classOps'];
  },
): MissionIntent {
  const aircraft = getAircraftClass(opts.aircraftClassId ?? 'narrow_freighter');
  assertClassOpsUnlocked(opts.classOps, aircraft.id);
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;
  const lot = findLot(world, opts.lotId);
  if (!cargoOpsIsUnlocked(opts.cargoOps, lot.commodityId)) {
    const name = getCommodity(lot.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — fly Dry freights (General / Supplies) to unlock`,
    );
  }
  assertBushLightGa(lot.originIcao, lot.destIcao, aircraft.id);
  const avail = lotAvailableKg(lot);
  if (avail <= 0) {
    throw new Error(`Lot ${opts.lotId} has no remaining cargo`);
  }

  const into = opts.intoMission
    ? normalizeMissionIntent(opts.intoMission)
    : undefined;

  if (into) {
    if (into.status !== 'accepted' && into.status !== 'dispatched') {
      throw new Error(`Cannot add cargo to mission in status=${into.status}`);
    }
    if (into.aircraftClassId !== aircraft.id) {
      throw new Error(
        `Aircraft class mismatch: flight is ${into.aircraftClassId}, accept requested ${aircraft.id}`,
      );
    }
    if (into.originIcao !== lot.originIcao || into.destIcao !== lot.destIcao) {
      throw new Error(
        `Route mismatch: flight is ${into.originIcao}→${into.destIcao}, lot is ${lot.originIcao}→${lot.destIcao}`,
      );
    }
    if (into.lots.length >= MAX_MANIFEST_LOTS) {
      throw new Error(
        `Manifest full (${MAX_MANIFEST_LOTS} lots) — dispatch this flight or start a new one`,
      );
    }
  }

  const remainingCap = into
    ? missionRemainingCapacityKg(into, maxCargoKg)
    : maxCargoKg;
  if (remainingCap <= 0) {
    throw new Error(
      `No remaining capacity on flight ${into?.id ?? '(new)'} (max ${maxCargoKg} kg)`,
    );
  }

  const requested =
    opts.cargoKg !== undefined
      ? Math.floor(opts.cargoKg)
      : Math.min(avail, remainingCap);
  const cargoKg = Math.min(requested, avail, remainingCap);
  if (cargoKg <= 0) {
    throw new Error(
      `Nothing to accept: requested=${requested} avail=${avail} remainingCap=${remainingCap}`,
    );
  }

  const { payUsd: reservedPay } = reserveShipmentLot(world, opts.lotId, cargoKg);
  const payMult = cargoOpsPayMult(opts.cargoOps, lot.commodityId);
  const payUsd = Math.max(1, Math.round(reservedPay * payMult));
  const line: MissionLotLine = {
    shipmentLotId: lot.id,
    commodityId: lot.commodityId,
    cargoKg,
    payUsd,
    urgency: lot.urgency,
    reason: lot.reason,
    deadlineTick: lot.expiresAtTick,
  };

  if (into) {
    const appended = recomputeMissionTotals({
      ...into,
      lots: [...into.lots, line],
    });
    syncPlayerInbound(world, appended);
    return appended;
  }

  const id =
    opts.missionId?.trim() ||
    `msn_${world.tick}_${lot.originIcao}_${lot.destIcao}_${Math.floor(Math.random() * 1e6)}`;

  const created = recomputeMissionTotals({
    id,
    lots: [line],
    shipmentLotId: lot.id,
    commodityId: lot.commodityId,
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    cargoKg,
    pax: 0,
    aircraftClassId: aircraft.id,
    rolesPackRelPath: aircraft.rolesPackRelPath,
    deadlineTick: lot.expiresAtTick,
    payUsd,
    urgency: lot.urgency,
    reason: lot.reason,
    status: 'accepted',
    acceptedAtTick: world.tick,
  });
  syncPlayerInbound(world, created);
  return created;
}

export type StagedManifestLine = {
  lotId: string;
  cargoKg: number;
};

/**
 * Atomically reserve one or more staged lots onto a new or existing same-OD flight.
 * Validates first; on mid-apply failure restores lot reservations from a snapshot.
 */
export function commitStagedManifest(
  world: CareerEconomyWorld,
  opts: {
    lines: StagedManifestLine[];
    aircraftClassId?: FreighterClassId;
    maxCargoKg?: number;
    intoMission?: MissionIntent;
    /** Id for a brand-new flight (ignored when appending). */
    missionId?: string;
    /** Concrete Market SKU — preferred for range gate when set. */
    airframeTypeId?: string;
    /** Player cargo ladder — gates unlock + pay mult. */
    cargoOps?: CareerMissionsState['cargoOps'];
    /** Aircraft class ladder — gates which freighter classes may accept. */
    classOps?: CareerMissionsState['classOps'];
  },
): { mission: MissionIntent; appended: boolean; lineCount: number } {
  const aircraft = getAircraftClass(opts.aircraftClassId ?? 'narrow_freighter');
  assertClassOpsUnlocked(opts.classOps, aircraft.id);
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;

  if (!Array.isArray(opts.lines) || opts.lines.length === 0) {
    throw new Error('Staging requires at least one cargo line');
  }
  if (opts.lines.length > MAX_MANIFEST_LOTS) {
    throw new Error(`Staging allows at most ${MAX_MANIFEST_LOTS} lots`);
  }

  const seen = new Set<string>();
  const normalizedLines: StagedManifestLine[] = [];
  for (const raw of opts.lines) {
    const lotId = raw.lotId?.trim();
    const cargoKg = Math.floor(raw.cargoKg);
    if (!lotId) throw new Error('Each staging line needs a lotId');
    if (seen.has(lotId)) throw new Error(`Duplicate lot in staging: ${lotId}`);
    seen.add(lotId);
    if (!Number.isFinite(cargoKg) || cargoKg <= 0) {
      throw new Error(`Invalid cargoKg for ${lotId}`);
    }
    normalizedLines.push({ lotId, cargoKg });
  }

  const into = opts.intoMission
    ? normalizeMissionIntent(opts.intoMission)
    : undefined;
  if (into) {
    if (into.status !== 'accepted' && into.status !== 'dispatched') {
      throw new Error(`Cannot stage onto mission in status=${into.status}`);
    }
    if (into.aircraftClassId !== aircraft.id) {
      throw new Error(
        `Aircraft class mismatch: flight is ${into.aircraftClassId}, staging requested ${aircraft.id}`,
      );
    }
    if (into.lots.length + normalizedLines.length > MAX_MANIFEST_LOTS) {
      throw new Error(
        `Manifest would exceed ${MAX_MANIFEST_LOTS} lots (${into.lots.length} existing + ${normalizedLines.length} staged)`,
      );
    }
  }

  let originIcao: string | undefined;
  let destIcao: string | undefined;
  let totalNewKg = 0;
  for (const line of normalizedLines) {
    const lot = findLot(world, line.lotId);
    const avail = lotAvailableKg(lot);
    if (line.cargoKg > avail) {
      throw new Error(
        `Lot ${line.lotId} only has ${avail} kg available (requested ${line.cargoKg})`,
      );
    }
    if (!originIcao) {
      originIcao = lot.originIcao;
      destIcao = lot.destIcao;
      assertBushLightGa(originIcao, destIcao!, aircraft.id);
    } else if (lot.originIcao !== originIcao || lot.destIcao !== destIcao) {
      throw new Error(
        `Staging lots must share one route (expected ${originIcao}→${destIcao}, got ${lot.originIcao}→${lot.destIcao})`,
      );
    }
    if (into && (into.originIcao !== lot.originIcao || into.destIcao !== lot.destIcao)) {
      throw new Error(
        `Route mismatch: flight is ${into.originIcao}→${into.destIcao}, lot is ${lot.originIcao}→${lot.destIcao}`,
      );
    }
    totalNewKg += line.cargoKg;
  }

  const distanceNm = routeDistanceNm(world, originIcao!, destIcao!);
  if (distanceNm === undefined) {
    throw new Error(`Unknown route distance for ${originIcao}→${destIcao}`);
  }
  const maxRangeNm = resolveAirframeMaxRangeNm(
    opts.airframeTypeId ?? opts.intoMission?.airframeTypeId,
    aircraft.id,
  );
  if (distanceNm > maxRangeNm) {
    throw new Error(
      `Route ${originIcao}→${destIcao} is ${Math.round(distanceNm)} nm; max range is ${maxRangeNm} nm`,
    );
  }

  const remainingCap = into
    ? missionRemainingCapacityKg(into, maxCargoKg)
    : maxCargoKg;
  if (totalNewKg > remainingCap) {
    throw new Error(
      `Staged cargo ${totalNewKg} kg exceeds remaining capacity ${remainingCap} kg`,
    );
  }

  const snapshot = world.lots.map((lot) => ({
    id: lot.id,
    reservedKg: lot.reservedKg,
    status: lot.status,
  }));

  let mission: MissionIntent | undefined = into;
  try {
    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i]!;
      mission = acceptMission(world, {
        lotId: line.lotId,
        cargoKg: line.cargoKg,
        aircraftClassId: aircraft.id,
        maxCargoKg,
        intoMission: mission,
        missionId: i === 0 && !into ? opts.missionId : undefined,
        cargoOps: opts.cargoOps,
        classOps: opts.classOps,
      });
    }
    if (!mission) {
      throw new Error('Staging commit produced no mission');
    }
    return {
      mission,
      appended: Boolean(into),
      lineCount: normalizedLines.length,
    };
  } catch (error) {
    for (const snap of snapshot) {
      const lot = world.lots.find((candidate) => candidate.id === snap.id);
      if (!lot) continue;
      lot.reservedKg = snap.reservedKg;
      lot.status = snap.status;
    }
    if (into) {
      syncPlayerInbound(world, into);
    } else if (mission) {
      clearPlayerInbound(world, mission.id);
    }
    throw error;
  }
}

/**
 * Replace an accepted/dispatched mission's cargo lines in place.
 * Releases current reservations, reserves the new lines, keeps mission id /
 * aircraft assignment / staticId, and clears OFP/preflight so the pilot can
 * regenerate the plan after payload changes.
 */
export function replaceMissionManifest(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: {
    lines: StagedManifestLine[];
    aircraftClassId?: FreighterClassId;
    maxCargoKg?: number;
    cargoOps?: CareerMissionsState['cargoOps'];
    classOps?: CareerMissionsState['classOps'];
  },
): MissionIntent {
  const normalized = normalizeMissionIntent(mission);
  assertClassOpsUnlocked(
    opts.classOps,
    opts.aircraftClassId ?? normalized.aircraftClassId,
  );
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot edit mission in status=${normalized.status}`);
  }
  if (normalized.demandOrderId) {
    throw new Error(
      'Demand Board flights use replaceDemandMissionCargo, not market replace',
    );
  }
  if (!Array.isArray(opts.lines) || opts.lines.length === 0) {
    throw new Error('Edited manifest requires at least one cargo line');
  }
  if (opts.lines.length > MAX_MANIFEST_LOTS) {
    throw new Error(`Staging allows at most ${MAX_MANIFEST_LOTS} lots`);
  }

  const aircraft = getAircraftClass(
    opts.aircraftClassId ?? normalized.aircraftClassId,
  );
  if (aircraft.id !== normalized.aircraftClassId) {
    throw new Error(
      `Aircraft class mismatch: flight is ${normalized.aircraftClassId}, edit requested ${aircraft.id}`,
    );
  }
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;

  const seen = new Set<string>();
  const normalizedLines: StagedManifestLine[] = [];
  for (const raw of opts.lines) {
    const lotId = raw.lotId?.trim();
    const cargoKg = Math.floor(raw.cargoKg);
    if (!lotId) throw new Error('Each staging line needs a lotId');
    if (seen.has(lotId)) throw new Error(`Duplicate lot in staging: ${lotId}`);
    seen.add(lotId);
    if (!Number.isFinite(cargoKg) || cargoKg <= 0) {
      throw new Error(`Invalid cargoKg for ${lotId}`);
    }
    normalizedLines.push({ lotId, cargoKg });
  }

  const snapshot = world.lots.map((lot) => ({
    id: lot.id,
    reservedKg: lot.reservedKg,
    status: lot.status,
  }));

  try {
    for (const line of normalized.lots) {
      if (world.lots.some((lot) => lot.id === line.shipmentLotId)) {
        releaseShipmentReservation(world, line.shipmentLotId, line.cargoKg);
      }
    }

    let totalKg = 0;
    for (const line of normalizedLines) {
      const lot = findLot(world, line.lotId);
      const avail = lotAvailableKg(lot);
      if (line.cargoKg > avail) {
        throw new Error(
          `Lot ${line.lotId} only has ${avail} kg available (requested ${line.cargoKg})`,
        );
      }
      if (
        lot.originIcao !== normalized.originIcao ||
        lot.destIcao !== normalized.destIcao
      ) {
        throw new Error(
          `Route mismatch: flight is ${normalized.originIcao}→${normalized.destIcao}, lot is ${lot.originIcao}→${lot.destIcao}`,
        );
      }
      totalKg += line.cargoKg;
    }
    if (totalKg > maxCargoKg) {
      throw new Error(
        `Edited cargo ${totalKg} kg exceeds aircraft capacity ${maxCargoKg} kg`,
      );
    }

    const distanceNm = routeDistanceNm(
      world,
      normalized.originIcao,
      normalized.destIcao,
    );
    if (distanceNm === undefined) {
      throw new Error(
        `Unknown route distance for ${normalized.originIcao}→${normalized.destIcao}`,
      );
    }
    if (distanceNm > aircraft.maxRangeNm) {
      throw new Error(
        `Route ${normalized.originIcao}→${normalized.destIcao} is ${Math.round(distanceNm)} nm; ${aircraft.name} max range is ${aircraft.maxRangeNm} nm`,
      );
    }

    let next: MissionIntent | undefined;
    for (let index = 0; index < normalizedLines.length; index++) {
      const line = normalizedLines[index]!;
      next = acceptMission(world, {
        lotId: line.lotId,
        cargoKg: line.cargoKg,
        aircraftClassId: aircraft.id,
        maxCargoKg,
        intoMission: next,
        missionId: index === 0 ? normalized.id : undefined,
        cargoOps: opts.cargoOps,
        classOps: opts.classOps,
      });
    }
    if (!next) {
      throw new Error('Edited manifest produced no mission');
    }

    const replaced: MissionIntent = {
      ...normalized,
      ...recomputeMissionTotals(next),
      id: normalized.id,
      aircraftId: normalized.aircraftId,
      staticId: normalized.staticId,
      acceptedAtTick: normalized.acceptedAtTick ?? world.tick,
      status: 'accepted',
      lastOfpCheck: undefined,
      lastPreflightCheck: undefined,
      // Purchased fuel remains in the aircraft and its expense remains in the logbook.
      fuelUplift: normalized.fuelUplift,
      fuelAuthorizedOfpId: undefined,
      tripFuelBurnKg: undefined,
      dispatchedAtTick: undefined,
    };
    syncPlayerInbound(world, replaced);
    return replaced;
  } catch (error) {
    for (const snap of snapshot) {
      const lot = world.lots.find((candidate) => candidate.id === snap.id);
      if (!lot) continue;
      lot.reservedKg = snap.reservedKg;
      lot.status = snap.status;
    }
    syncPlayerInbound(world, normalized);
    throw error;
  }
}

export function cancelMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: { fleet?: CareerMissionsState; nowMs?: number } = {},
): MissionIntent {
  const normalized = normalizeMissionIntent(mission);
  if (
    normalized.status !== 'accepted' &&
    normalized.status !== 'dispatched' &&
    normalized.status !== 'in_flight'
  ) {
    throw new Error(`Cannot cancel mission in status=${normalized.status}`);
  }
  // A mission can outlive its shipment lots: expired lots are pruned after a
  // short retention window, and a world reset can leave orphan missions behind.
  const nowMs = opts.nowMs ?? Date.now();
  for (const line of normalized.lots) {
    if (!world.lots.some((lot) => lot.id === line.shipmentLotId)) {
      continue;
    }
    // Contract freight: return the slice to the open player-exclusive pool
    // when the offer window is still live (do not dump kg onto the open market).
    if (
      normalized.contractPilot &&
      !normalized.contractPilotReposition &&
      returnContractSliceToOpenOffer(world, normalized, line, nowMs)
    ) {
      continue;
    }
    releaseShipmentReservation(world, line.shipmentLotId, line.cargoKg);
  }
  if (opts.fleet) {
    releaseAircraftOnCancel(opts.fleet, normalized);
    if (normalized.demandOrderId) {
      const line = normalized.lots[0];
      const kg = line?.cargoKg ?? normalized.cargoKg ?? 0;
      if (kg > 0) {
        try {
          depositCargoToWarehouse(opts.fleet, {
            icao: normalized.originIcao,
            commodityId: line?.commodityId ?? normalized.commodityId,
            kg,
            avgCostUsdPerKg: normalized.warehouseAvgCostUsdPerKg ?? 0,
            tick: normalized.acceptedAtTick ?? world.tick,
          });
        } catch {
          // Warehouse may be gone — cancel still succeeds.
        }
        if (!Array.isArray(world.demandOrders)) {
          world.demandOrders = [];
        }
        const order = world.demandOrders.find(
          (o) => o.id === normalized.demandOrderId,
        );
        if (order) {
          order.remainingKg = Math.min(
            order.wantedKg,
            order.remainingKg + kg,
          );
          if (order.status === 'filled') {
            order.status = 'open';
          }
        }
      }
    } else if (normalized.portPickupId) {
      const pickups = Array.isArray(opts.fleet.portPickups)
        ? opts.fleet.portPickups
        : (opts.fleet.portPickups = []);
      if (!pickups.some((p) => p.id === normalized.portPickupId)) {
        const line = normalized.lots[0];
        const kg = line?.cargoKg ?? normalized.cargoKg ?? 0;
        if (kg > 0) {
          pickups.push({
            id: normalized.portPickupId,
            portId: (normalized.portId ?? 'UNKNOWN').trim().toUpperCase(),
            hubIcao: normalized.originIcao.trim().toUpperCase(),
            commodityId: line?.commodityId ?? normalized.commodityId,
            kg,
            avgCostUsdPerKg: normalized.portAvgCostUsdPerKg ?? 0,
            purchasedAtTick: normalized.acceptedAtTick ?? 0,
          });
        }
      }
    }
  }
  const cancelled = { ...normalized, status: 'cancelled' as const };
  clearPlayerInbound(world, cancelled.id);
  return cancelled;
}

/**
 * If a Contract offer is still awaiting_pilot on this lot, fold the cancelled
 * slice back into that pool. Returns true when handled (skip market release).
 */
function returnContractSliceToOpenOffer(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  line: { shipmentLotId: string; cargoKg: number; payUsd: number },
  nowMs: number,
): boolean {
  const flight = world.npcFlights.find(
    (f) =>
      f.lotId === line.shipmentLotId &&
      f.status === 'awaiting_pilot' &&
      f.kind !== 'reposition',
  );
  if (!flight) return false;
  const until = flight.awaitingPilotUntilMs ?? 0;
  if (until > 0 && nowMs >= until) return false;

  const addKg = Math.max(0, Math.floor(line.cargoKg));
  if (addKg <= 0) return true;

  const addPay =
    mission.lots.length <= 1
      ? Math.max(1, Math.round(mission.contractGrossPayUsd ?? mission.payUsd))
      : Math.max(
          1,
          Math.round(
            (mission.contractGrossPayUsd ?? mission.payUsd) *
              (addKg / Math.max(1, mission.cargoKg)),
          ),
        );

  flight.cargoKg += addKg;
  flight.payUsd = Math.max(1, flight.payUsd + addPay);
  flight.pilotFeeUsd = quoteContractPilotFeeUsd(flight.payUsd);

  const lot = world.lots.find((l) => l.id === line.shipmentLotId);
  if (lot && (lot.status === 'in_transit' || lot.status === 'available')) {
    lot.status = 'reserved';
  }
  return true;
}

/**
 * Undo a false auto-depart (SIM ON GROUND flicker / catch-up at origin).
 * Restores `dispatched` and clears airborne settle-gate stamps. Does not
 * refund fuel already charged — prevention is the primary fix.
 * Soft-reopens lots that were flipped to `in_transit` on the false depart.
 */
export function revertFalseDepartMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
): MissionIntent {
  const normalized = normalizeMissionIntent(mission);
  if (normalized.status !== 'in_flight') {
    throw new Error(
      `Cannot revert false depart in status=${normalized.status}`,
    );
  }
  if (!isEmptyLegMission(normalized)) {
    for (const line of normalized.lots) {
      if (
        line.shipmentLotId.startsWith('deadhead_') ||
        line.shipmentLotId.startsWith('empty_') ||
        line.shipmentLotId.startsWith('portpk_') ||
        line.shipmentLotId.startsWith('demand_')
      ) {
        continue;
      }
      const lot = world.lots.find((l) => l.id === line.shipmentLotId);
      if (lot && lot.status === 'in_transit' && lot.reservedKg > 0) {
        lot.status = 'reserved';
      }
    }
  }
  const reverted: MissionIntent = {
    ...normalized,
    status: 'dispatched',
  };
  delete reverted.airborneAtMs;
  delete reverted.airborneElapsedMs;
  delete reverted.expectedRouteMs;
  delete reverted.departedAtTick;
  return reverted;
}

/**
 * Mark cargo airborne. Allowed from accepted or dispatched.
 * Fully-reserved lots flip to in_transit so the market stops offering them.
 * Applies origin Jet-A uplift once (stock drain + mission.fuelUplift).
 * When `fleet` is provided with mission.aircraftId, only the tank shortfall is purchased.
 */
export function departMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: {
    fleet?: CareerMissionsState;
    /** Wall-clock now for airborne stamp. */
    nowMs?: number;
    /** Route distance override for expected airborne duration. */
    distanceNm?: number;
    /** Precomputed expected route duration (ms). */
    expectedRouteMs?: number;
  } = {},
): DepartMissionResult {
  const normalized = normalizeMissionIntent(mission);
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot depart mission in status=${normalized.status}`);
  }
  if (!isEmptyLegMission(normalized)) {
    for (const line of normalized.lots) {
      // Synthetic deadhead / empty ids are never real market lots.
      if (
        line.shipmentLotId.startsWith('deadhead_') ||
        line.shipmentLotId.startsWith('empty_') ||
        line.shipmentLotId.startsWith('portpk_') ||
        line.shipmentLotId.startsWith('demand_')
      ) {
        continue;
      }
      const lot = findLot(world, line.shipmentLotId);
      if (lot.reservedKg >= lot.quantityKg && lot.quantityKg > 0) {
        // Keep Contract remainder visible on the board (awaiting_pilot).
        const openContract = world.npcFlights.some(
          (f) =>
            f.lotId === lot.id &&
            f.status === 'awaiting_pilot' &&
            f.kind !== 'reposition',
        );
        if (!openContract) {
          lot.status = 'in_transit';
        } else if (lot.status === 'in_transit') {
          lot.status = 'reserved';
        }
      }
    }
  }

  const nowMs = opts.nowMs ?? Date.now();
  const distanceNm =
    opts.distanceNm ??
    routeDistanceNm(world, normalized.originIcao, normalized.destIcao);
  const expectedRouteMs =
    opts.expectedRouteMs ??
    resolveExpectedRouteMs(normalized, {
      distanceNm,
      fallbackHours: estimateMissionBlockHours(
        world,
        normalized.originIcao,
        normalized.destIcao,
        normalized.aircraftClassId as FreighterClassId,
      ),
    });
  const airborneStamp = {
    airborneAtMs: normalized.airborneAtMs ?? nowMs,
    expectedRouteMs: normalized.expectedRouteMs ?? expectedRouteMs,
  };

  let fuelDebitUsd = 0;
  let nextMission: MissionIntent = {
    ...normalized,
    status: 'in_flight',
    departedAtTick: world.tick,
    ...airborneStamp,
  };

  if (opts.fleet && normalized.aircraftId) {
    const playerFuel = applyPlayerDepartFuel(world, opts.fleet, nextMission);
    nextMission = {
      ...playerFuel.mission,
      status: 'in_flight',
      departedAtTick: world.tick,
      ...airborneStamp,
    };
    fuelDebitUsd = playerFuel.fuelDebitUsd;
  } else if (normalized.contractPilot) {
    // Operator covers Jet-A — drain terminal stock, no player wallet debit.
    if (!normalized.fuelUplift) {
      const quote = quoteFuelUplift(world, {
        originIcao: normalized.originIcao,
        destIcao: normalized.destIcao,
        aircraftClassId: normalized.aircraftClassId as FreighterClassId,
      });
      const fuelUplift = deliverFuelUplift(world, quote);
      nextMission = {
        ...nextMission,
        fuelUplift: { ...fuelUplift, costUsd: 0 },
      };
    }
    fuelDebitUsd = 0;
  } else if (!normalized.fuelUplift) {
    const quote = quoteFuelUplift(world, {
      originIcao: normalized.originIcao,
      destIcao: normalized.destIcao,
      aircraftClassId: normalized.aircraftClassId as FreighterClassId,
    });
    const fuelUplift = deliverFuelUplift(world, quote);
    fuelDebitUsd = fuelUplift.costUsd;
    nextMission = { ...nextMission, fuelUplift };
  }

  syncPlayerInbound(world, nextMission);
  return {
    mission: nextMission,
    fuelDebitUsd,
  };
}

export interface DepartMissionResult {
  mission: MissionIntent;
  /** Wallet debit for fuel purchased on this call (0 if already uplifted). */
  fuelDebitUsd: number;
}

export interface SettleMissionOpts {
  /** Override world.tick for late calculation (tests). */
  tick?: number;
  /** Player fleet — relocates aircraft and applies tank fuel on depart/settle. */
  fleet?: CareerMissionsState;
  /** Actual fuel remaining in MSFS; falls back to estimated burn when unavailable. */
  residualFuelKg?: number;
  /**
   * Touchdown vertical speed (fpm). Typically negative.
   * Captured by Flight Watch at first wheels-down.
   */
  landingFpm?: number;
  /**
   * Wall-clock when airborne ended (touchdown). Used with airborneAtMs for
   * settled flight duration.
   */
  airborneEndedAtMs?: number;
  /** Finalized Watch flight scorecard (envelope / taxi / landing). */
  flightScore?: FlightScoreSnapshot;
  /** Live weather-ops score from Watch ambient samples. */
  weatherOps?: WeatherOpsSnapshot;
  /** Touchdown WGS84 latitude (degrees). */
  touchdownLat?: number;
  /** Touchdown WGS84 longitude (degrees). */
  touchdownLon?: number;
  /** Aircraft true heading at touchdown (degrees) — picks runway approach end. */
  touchdownHeadingTrueDeg?: number;
  /** Precomputed runway projection (optional; settle recomputes when coords given). */
  runwayTouch?: RunwayTouchdownSnapshot;
  /** Wall-clock now for minimum airborne duration gate. */
  nowMs?: number;
  /**
   * When true, skip the 70% airborne-duration gate (tests only).
   * Live Watch / UI settle keep the gate on.
   */
  skipMinAirborneGate?: boolean;
  /** Multiply airframe/engine hours applied on settle (crew wear perk). */
  hoursMult?: number;
}

export interface SettleMissionResult {
  mission: MissionIntent;
  settlement: MissionSettlement;
  /** Wallet delta to apply (payoutUsd). */
  walletCreditUsd: number;
  /** Fuel debit if this settle auto-departed (else 0). */
  fuelDebitUsd: number;
  /** Cargo Ops ladder deltas from this settle (when fleet provided). */
  cargoOpsDeltas?: CargoOpsDelta[];
  /** Class Ops ladder deltas from this settle (when fleet provided). */
  classOpsDeltas?: ClassOpsDelta[];
}

/** Late penalty as a fraction of pay per overdue wall-clock hour. */
function latePenaltyRate(
  urgency: MissionIntent['urgency'],
  commodityId: MissionIntent['commodityId'],
): number {
  const base = urgency === 'urgent' ? 0.12 : 0.06;
  return base * cargoOpsLatePenaltyMult(commodityId);
}

function computeSettlementPay(
  mission: MissionIntent,
  settleTick: number,
  flightScorePct?: number | null,
  weatherBonusFrac = 0,
): {
  lateTicks: number;
  penaltyUsd: number;
  payoutUsd: number;
  onTime: boolean;
  weatherBonusUsd: number;
} {
  const lateTicks = Math.max(0, settleTick - mission.deadlineTick);
  const onTime = lateTicks === 0;
  // Economy ticks are 15 min — scale so the old "12%/h urgent" rate still applies.
  const lateHours = lateTicks / TICKS_PER_HOUR;
  const rate = latePenaltyRate(mission.urgency, mission.commodityId);
  let penaltyUsd = onTime
    ? 0
    : Math.min(mission.payUsd, Math.round(mission.payUsd * lateHours * rate));
  const valueCut = cargoOpsValueScorePenaltyFraction(
    mission.commodityId,
    flightScorePct,
  );
  if (valueCut > 0) {
    penaltyUsd = Math.min(
      mission.payUsd,
      penaltyUsd + Math.round(mission.payUsd * valueCut),
    );
  }
  const weatherBonusUsd =
    weatherBonusFrac > 0
      ? Math.max(0, Math.round(mission.payUsd * weatherBonusFrac))
      : 0;
  const payoutUsd = Math.max(0, mission.payUsd - penaltyUsd) + weatherBonusUsd;
  return { lateTicks, penaltyUsd, payoutUsd, onTime, weatherBonusUsd };
}

/**
 * Deliver cargo into the destination terminal, shrink each lot, pay freight (minus late penalty).
 * Accepts dispatched or in_flight (auto-departs if still dispatched).
 */
export function settleMission(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: SettleMissionOpts = {},
): SettleMissionResult {
  let working = normalizeMissionIntent(mission);
  if (
    working.status !== 'dispatched' &&
    working.status !== 'in_flight' &&
    working.status !== 'accepted'
  ) {
    throw new Error(`Cannot settle mission in status=${working.status}`);
  }

  const priorAirborneAtMs = working.airborneAtMs;
  const priorExpectedRouteMs = working.expectedRouteMs;

  let fuelDebitUsd = 0;
  if (working.status === 'accepted' || working.status === 'dispatched') {
    const departed = departMission(world, working, {
      fleet: opts.fleet,
      nowMs: opts.nowMs,
    });
    working = departed.mission;
    fuelDebitUsd = departed.fuelDebitUsd;
  }

  // Enforce min airborne only when the flight already left the ground earlier.
  // Same-call auto-depart+settle (offline Advanced) is not a live flight.
  if (
    !opts.skipMinAirborneGate &&
    typeof priorAirborneAtMs === 'number' &&
    Number.isFinite(priorAirborneAtMs) &&
    typeof priorExpectedRouteMs === 'number' &&
    Number.isFinite(priorExpectedRouteMs) &&
    priorExpectedRouteMs > 0
  ) {
    const check = evaluateMinAirborneElapsed({
      airborneAtMs: priorAirborneAtMs,
      expectedRouteMs: priorExpectedRouteMs,
      nowMs: opts.nowMs ?? Date.now(),
      airborneEndedAtMs: opts.airborneEndedAtMs,
      distanceNm: routeDistanceNm(
        world,
        working.originIcao,
        working.destIcao,
      ),
    });
    if (!check.ok) {
      throw new Error(
        `Cannot settle yet — ${check.message}. Keep flying until at least ${Math.round(check.ratioRequired * 100)}% of the planned route time has elapsed.`,
      );
    }
  }

  const residualFuelKg =
    typeof opts.residualFuelKg === 'number' && Number.isFinite(opts.residualFuelKg)
      ? Math.max(0, Math.round(opts.residualFuelKg))
      : undefined;
  if (opts.fleet) {
    const aircraft = relocateAircraftOnSettle(
      opts.fleet,
      working,
      world,
      residualFuelKg,
    );
    if (aircraft) {
      const blockHours = estimateMissionBlockHours(
        world,
        working.originIcao,
        working.destIcao,
        aircraft.aircraftClassId,
      );
      const hoursMult =
        typeof opts.hoursMult === 'number' &&
        Number.isFinite(opts.hoursMult) &&
        opts.hoursMult > 0
          ? opts.hoursMult
          : 1;
      applyAircraftHoursAfterMission(aircraft, blockHours * hoursMult);
    } else if (working.contractPilot) {
      // No owned airframe — still ride the leg to dest.
      syncPilotIcaoTo(opts.fleet, working.destIcao);
    } else if (working.aircraftId) {
      // Owned mission must move its airframe — do not credit a ghost flight.
      throw new Error(
        `Cannot settle ${working.id}: aircraft ${working.aircraftId} is not in the hangar`,
      );
    }
  }

  const settleTick = opts.tick ?? world.tick;
  let lastOriginStock = 0;
  let lastDestStock = 0;
  const settlementLines: MissionSettlementLine[] = [];

  const scorePct = opts.flightScore?.pct;
  const weatherOps = opts.weatherOps ?? working.settledWeatherOps;
  const weatherBonusFrac =
    weatherOps && weatherOps.eligible ? weatherOps.bonusFrac : 0;
  const pay =
    working.crewDeadhead || working.emptyFlight
      ? {
          lateTicks: 0,
          penaltyUsd: 0,
          payoutUsd: 0,
          onTime: true,
          weatherBonusUsd: 0,
        }
      : computeSettlementPay(working, settleTick, scorePct, weatherBonusFrac);
  // Allocate penalty across lines proportional to payUsd.
  let penaltyLeft = pay.penaltyUsd;

  if (!isEmptyLegMission(working)) {
    for (let i = 0; i < working.lots.length; i++) {
      const line = working.lots[i]!;
      // Empty / CP reposition legs have no freight to deliver.
      if (
        line.shipmentLotId.startsWith('deadhead_') ||
        line.shipmentLotId.startsWith('empty_')
      ) {
        continue;
      }
      // Demand Board: company warehouse cargo — fill dest only (no origin debit).
      if (
        working.demandOrderId ||
        line.shipmentLotId.startsWith('demand_')
      ) {
        const byIcao = new Map(
          world.airports.map((a) => [a.icao.toUpperCase(), a] as const),
        );
        const dest = byIcao.get(working.destIcao.trim().toUpperCase());
        if (!dest) {
          throw new Error(`Unknown destination ${working.destIcao}`);
        }
        let pile = dest.inventory[line.commodityId];
        if (!pile) {
          pile = { stockKg: 0, capacityKg: 80_000 };
          dest.inventory[line.commodityId] = pile;
        }
        const room = Math.max(0, pile.capacityKg - pile.stockKg);
        const added = Math.min(line.cargoKg, room);
        pile.stockKg += added;
        lastDestStock = pile.stockKg;

        const isLast = i === working.lots.length - 1;
        const linePenalty = isLast
          ? penaltyLeft
          : Math.min(
              line.payUsd,
              Math.round(
                pay.penaltyUsd * (line.payUsd / Math.max(1, working.payUsd)),
              ),
            );
        penaltyLeft = Math.max(0, penaltyLeft - linePenalty);
        const linePayout = Math.max(0, line.payUsd - linePenalty);
        settlementLines.push({
          shipmentLotId: line.shipmentLotId,
          commodityId: line.commodityId,
          deliveredKg: line.cargoKg,
          payUsd: line.payUsd,
          penaltyUsd: linePenalty,
          payoutUsd: linePayout,
        });
        if (opts.fleet) {
          const creditMult = working.warehouseId
            ? whOpsShippedMultForWarehouse(opts.fleet, working.warehouseId)
            : 1;
          recordWarehouseShipmentKg(opts.fleet, {
            warehouseId: working.warehouseId,
            icao: working.originIcao,
            kg: line.cargoKg,
            creditMult,
          });
        }
        continue;
      }
      if (
        (working.portPickupId || line.shipmentLotId.startsWith('portpk_')) &&
        !working.demandOrderId
      ) {
        if (opts.fleet) {
          try {
            depositCargoToWarehouse(opts.fleet, {
              icao: working.destIcao,
              commodityId: line.commodityId,
              kg: line.cargoKg,
              avgCostUsdPerKg: working.portAvgCostUsdPerKg ?? 0,
              tick: settleTick,
            });
          } catch (err) {
            throw new Error(
              `Port cargo settle failed at ${working.destIcao}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        settlementLines.push({
          shipmentLotId: line.shipmentLotId,
          commodityId: line.commodityId,
          deliveredKg: line.cargoKg,
          payUsd: 0,
          penaltyUsd: 0,
          payoutUsd: 0,
        });
        continue;
      }
      // Demand Board + normal freight: fill destination terminal stock.
      const delivery = applyFreightDelivery(world, {
        commodityId: line.commodityId,
        originIcao: working.originIcao,
        destIcao: working.destIcao,
        kg: line.cargoKg,
      });
      lastOriginStock = delivery.originStockKg;
      lastDestStock = delivery.destStockKg;

      const lot = world.lots.find((l) => l.id === line.shipmentLotId);
      if (lot) {
        shrinkLotAfterDelivery(lot, line.cargoKg);
      }

      const isLast = i === working.lots.length - 1;
      const linePenalty = isLast
        ? penaltyLeft
        : Math.min(
            line.payUsd,
            Math.round(
              pay.penaltyUsd * (line.payUsd / Math.max(1, working.payUsd)),
            ),
          );
      penaltyLeft = Math.max(0, penaltyLeft - linePenalty);
      const linePayout = Math.max(0, line.payUsd - linePenalty);
      settlementLines.push({
        shipmentLotId: line.shipmentLotId,
        commodityId: line.commodityId,
        deliveredKg: line.cargoKg,
        payUsd: line.payUsd,
        penaltyUsd: linePenalty,
        payoutUsd: linePayout,
      });
    }
  }

  const settledFlightDurationMs = (() => {
    const start = working.airborneAtMs;
    if (typeof start !== 'number' || !Number.isFinite(start)) {
      return working.settledFlightDurationMs;
    }
    const end =
      typeof opts.airborneEndedAtMs === 'number' &&
      Number.isFinite(opts.airborneEndedAtMs)
        ? opts.airborneEndedAtMs
        : typeof opts.nowMs === 'number' && Number.isFinite(opts.nowMs)
          ? opts.nowMs
          : Date.now();
    return Math.max(0, Math.round(end - start));
  })();

  const settled: MissionIntent = {
    ...working,
    status: 'settled',
    settledAtTick: settleTick,
    settledFuelKg: residualFuelKg,
    settledLandingFpm:
      typeof opts.landingFpm === 'number' && Number.isFinite(opts.landingFpm)
        ? Math.round(opts.landingFpm)
        : working.settledLandingFpm,
    settledFlightDurationMs,
    settledFlightScore: opts.flightScore ?? working.settledFlightScore,
    settledWeatherOps: weatherOps ?? working.settledWeatherOps,
    settledWeatherBonusUsd: pay.weatherBonusUsd > 0 ? pay.weatherBonusUsd : undefined,
    settledTouchdownLat:
      typeof opts.touchdownLat === 'number' && Number.isFinite(opts.touchdownLat)
        ? opts.touchdownLat
        : working.settledTouchdownLat,
    settledTouchdownLon:
      typeof opts.touchdownLon === 'number' && Number.isFinite(opts.touchdownLon)
        ? opts.touchdownLon
        : working.settledTouchdownLon,
    settledRunwayTouch: (() => {
      if (opts.runwayTouch) return opts.runwayTouch;
      const lat =
        typeof opts.touchdownLat === 'number' && Number.isFinite(opts.touchdownLat)
          ? opts.touchdownLat
          : working.settledTouchdownLat;
      const lon =
        typeof opts.touchdownLon === 'number' && Number.isFinite(opts.touchdownLon)
          ? opts.touchdownLon
          : working.settledTouchdownLon;
      if (lat == null || lon == null) return working.settledRunwayTouch;
      const hdg =
        typeof opts.touchdownHeadingTrueDeg === 'number' &&
        Number.isFinite(opts.touchdownHeadingTrueDeg)
          ? opts.touchdownHeadingTrueDeg
          : undefined;
      return (
        evaluateRunwayTouchdown(working.destIcao, lat, lon, hdg) ??
        working.settledRunwayTouch
      );
    })(),
    payoutUsd: pay.payoutUsd,
    penaltyUsd: pay.penaltyUsd,
    lateTicks: pay.lateTicks,
  };
  clearPlayerInbound(world, settled.id);

  let cargoOpsDeltas: CargoOpsDelta[] | undefined;
  let classOpsDeltas: ClassOpsDelta[] | undefined;
  if (
    opts.fleet &&
    !working.crewDeadhead &&
    !working.contractPilotReposition &&
    !working.emptyFlight
  ) {
    const applied = applyCargoOpsOnSettle(opts.fleet.cargoOps, settled, {
      onTime: pay.onTime,
      lateTicks: pay.lateTicks,
      flightScore: opts.flightScore ?? settled.settledFlightScore,
    });
    opts.fleet.cargoOps = applied.cargoOps;
    cargoOpsDeltas = applied.deltas;

    const blockHours = estimateMissionBlockHours(
      world,
      working.originIcao,
      working.destIcao,
      working.aircraftClassId,
    );
    const hoursMult =
      typeof opts.hoursMult === 'number' &&
      Number.isFinite(opts.hoursMult) &&
      opts.hoursMult > 0
        ? opts.hoursMult
        : 1;
    const classApplied = applyClassOpsOnSettle(opts.fleet.classOps, settled, {
      onTime: pay.onTime,
      blockHours: blockHours * hoursMult,
      flightScore: opts.flightScore ?? settled.settledFlightScore,
    });
    opts.fleet.classOps = classApplied.classOps;
    classOpsDeltas = classApplied.deltas;
  }

  return {
    mission: settled,
    walletCreditUsd: pay.payoutUsd,
    fuelDebitUsd,
    cargoOpsDeltas,
    classOpsDeltas,
    settlement: {
      missionId: settled.id,
      deliveredKg: working.cargoKg,
      payoutUsd: pay.payoutUsd,
      penaltyUsd: pay.penaltyUsd,
      lateTicks: pay.lateTicks,
      onTime: pay.onTime,
      originStockAfterKg: lastOriginStock,
      destStockAfterKg: lastDestStock,
      lines: settlementLines,
      ...(pay.weatherBonusUsd > 0
        ? { weatherBonusUsd: pay.weatherBonusUsd }
        : {}),
      ...(settled.settledRunwayTouch
        ? { runwayTouch: settled.settledRunwayTouch }
        : {}),
    },
  };
}

export function formatSettlementSummary(
  settlement: MissionSettlement,
  walletUsd: number,
): string {
  const late =
    settlement.lateTicks > 0
      ? ` LATE +${settlement.lateTicks} tick(s) penalty=$${settlement.penaltyUsd.toLocaleString()}`
      : ' on-time';
  return (
    `Settled ${settlement.missionId}: delivered ${(settlement.deliveredKg / 1000).toFixed(1)}t` +
    `  payout=$${settlement.payoutUsd.toLocaleString()}${late}  wallet=$${walletUsd.toLocaleString()}`
  );
}

/** Market rows that have cargo and fit the aircraft class range. */
export function listViableMarketLots(
  world: CareerEconomyWorld,
  aircraftClassId: FreighterClassId,
  opts: {
    originIcao?: string;
    destIcao?: string;
    commodityId?: MarketLotView['lot']['commodityId'];
    /** Free-text ICAO/city search applied before any caller-side row cap. */
    query?: string;
    /** Override class max (e.g. live SimBrief maxcargo). */
    maxCargoKg?: number;
    /** Override class max range (e.g. catalog airframe). */
    maxRangeNm?: number;
    nowMs?: number;
  } = {},
): MarketLotView[] {
  const aircraft = getAircraftClass(aircraftClassId);
  const maxCargoKg =
    opts.maxCargoKg !== undefined && Number.isFinite(opts.maxCargoKg) && opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;
  const maxRangeNm =
    opts.maxRangeNm !== undefined &&
    Number.isFinite(opts.maxRangeNm) &&
    opts.maxRangeNm > 0
      ? opts.maxRangeNm
      : aircraft.maxRangeNm;
  return listMarketLots(world, opts).filter((row) => {
    // Crew-needed holds are fully reserved (`availableKg` often 0). The player
    // sits the NPC airframe, so do not gate them on this aircraft's payload/range.
    if (row.npcClaim?.crewNeeded) return true;
    const distance = routeDistanceNm(world, row.lot.originIcao, row.lot.destIcao);
    return (
      row.availableKg >= 1 &&
      maxCargoKg >= 1 &&
      distance !== undefined &&
      distance <= maxRangeNm
    );
  });
}

export function formatMissionSummary(mission: MissionIntent): string {
  const normalized = normalizeMissionIntent(mission);
  const commodity = getCommodity(normalized.commodityId);
  const aircraft = getAircraftClass(normalized.aircraftClassId);
  const urgent = normalized.urgency === 'urgent' ? ' URGENT' : '';
  const lotsLabel =
    normalized.lots.length > 1 ? `  ${normalized.lots.length}lots` : '';
  const payout =
    normalized.status === 'settled' && normalized.payoutUsd !== undefined
      ? `  paid=$${normalized.payoutUsd.toLocaleString()}`
      : '';
  return (
    `${normalized.id}  [${normalized.status}]  ${normalized.originIcao}→${normalized.destIcao}  ` +
    `${commodity.name}  ${(normalized.cargoKg / 1000).toFixed(1)}t${lotsLabel}  pay=$${normalized.payUsd.toLocaleString()}` +
    `${urgent}  via ${aircraft.id}  due@tick ${normalized.deadlineTick}${payout}`
  );
}

export interface IntentOfpTolerances {
  /** Absolute cargo tolerance when OFP ≥ mission (kg). Default 500. */
  cargoAbsKg: number;
  /** Relative cargo tolerance vs intent when OFP ≥ mission. Default 0.03. */
  cargoPct: number;
  /**
   * Absolute tolerance when OFP cargo is below mission (kg).
   * Tighter than over — SimBrief MTOW cuts must not silently pass.
   */
  cargoUnderAbsKg: number;
  /** Relative under-tolerance vs intent. Default 0.05. */
  cargoUnderPct: number;
  /** Max allowed OFP passenger count above mission.pax. Default 1 (EFB pilot). */
  maxExtraPax: number;
}

export const DEFAULT_INTENT_OFP_TOLERANCES: IntentOfpTolerances = {
  cargoAbsKg: 500,
  cargoPct: 0.03,
  cargoUnderAbsKg: 100,
  cargoUnderPct: 0.05,
  // Navigraph SimBrief EFB weight import requires ≥1 pax (counts as pilot)
  // even on freighters — see dispatch redirect pax=1.
  maxExtraPax: 1,
};

export interface IntentOfpCheck {
  verdict: ComplianceVerdict;
  findings: ComplianceFinding[];
}

/** ICAO codes that count as the same airframe family for Intent→OFP. */
const AIRFRAME_ICAO_ALIASES: Record<string, readonly string[]> = {
  B738: ['B738', 'B38M'],
  MD1F: ['MD1F', 'MD11'],
  MD11: ['MD11', 'MD1F'],
  /**
   * Kodiak 100: SimBrief UI/API type is KODI; OFP/ATC field prints official ICAO K100.
   * @see https://forum.navigraph.com/t/incorrect-icao-type-designator-for-kodiak-100/19414
   */
  KODI: ['KODI', 'K100'],
  K100: ['K100', 'KODI'],
  /**
   * Light GA: SimBrief proxies overlap (Commander→C182, C152→C172, Bonanza→BE36).
   * Class-level fallback accepts any of these; prefer mission.airframeTypeId when set.
   */
  AC11: ['AC11', 'C182', 'BE36', 'C172', 'C152'],
  C182: ['C182', 'AC11', 'BE36', 'C172', 'C152'],
  BE36: ['BE36', 'AC11', 'C182', 'C172', 'C152'],
  C152: ['C152', 'C172', 'C182', 'BE36', 'AC11'],
  C172: ['C172', 'C152', 'C182', 'BE36', 'AC11'],
};

function normalizeIcao(code: string | undefined): string | undefined {
  const c = code?.trim().toUpperCase();
  return c || undefined;
}

function airframesCompatible(expectedIcao: string, actualIcao: string | undefined): boolean {
  const actual = normalizeIcao(actualIcao);
  if (!actual) return false;
  const expected = expectedIcao.toUpperCase();
  if (actual === expected) return true;
  const fromExpected = AIRFRAME_ICAO_ALIASES[expected] ?? [expected];
  if (fromExpected.includes(actual)) return true;
  const fromActual = AIRFRAME_ICAO_ALIASES[actual] ?? [actual];
  return fromActual.includes(expected);
}

/** Expected SimBrief ICAO for Intent→OFP: owned airframe first, else class default. */
function expectedOfpIcaoForMission(mission: MissionIntent): string {
  const airframe = findCareerPlayerAirframe(mission.airframeTypeId);
  if (airframe?.simbriefIcao) return airframe.simbriefIcao.toUpperCase();
  return getAircraftClass(mission.aircraftClassId).simbriefIcao.toUpperCase();
}

/**
 * True when OFP ICAO matches the mission airframe, or (without airframeTypeId)
 * any catalog SimBrief ICAO for the mission class / class default aliases.
 */
function ofpAirframeMatchesMission(
  mission: MissionIntent,
  ofpIcao: string | undefined,
): boolean {
  const actual = normalizeIcao(ofpIcao);
  if (!actual) return false;

  const airframe = findCareerPlayerAirframe(mission.airframeTypeId);
  if (airframe) {
    return airframesCompatible(airframe.simbriefIcao, actual);
  }

  const classPeers = listCareerPlayerAirframes(mission.aircraftClassId, {
    includeDisabled: true,
  });
  if (classPeers.some((peer) => airframesCompatible(peer.simbriefIcao, actual))) {
    return true;
  }
  return airframesCompatible(
    getAircraftClass(mission.aircraftClassId).simbriefIcao,
    actual,
  );
}

function cargoToleranceKg(
  intentCargoKg: number,
  tolerances: IntentOfpTolerances,
  direction: 'over' | 'under' = 'over',
): number {
  if (direction === 'under') {
    return Math.max(
      tolerances.cargoUnderAbsKg,
      Math.abs(intentCargoKg) * tolerances.cargoUnderPct,
    );
  }
  return Math.max(tolerances.cargoAbsKg, Math.abs(intentCargoKg) * tolerances.cargoPct);
}

/**
 * Fold CG ballast (lb) into the OFP load sheet.
 *
 * An empty/ferry cabin can sit aft of the CG envelope with nothing to shift
 * (crew seats are fixed at their floor), so inject places the minimum weight
 * that walks CG back in. Loaded vs Due has to expect that weight, otherwise
 * preflight fails on the very load Skyline just applied.
 */
export function applyOfpBallastLb(
  ofp: OfpExpectation,
  ballastLb: number,
): OfpExpectation {
  if (!Number.isFinite(ballastLb) || ballastLb <= 0) return ofp;
  const sheet = ofp.loadSheet;
  if (!sheet) return ofp;
  const unit = sheet.unit ?? ofp.fuel.unit ?? 'kg';
  const ballast = unit === 'kg' ? ballastLb / KG_TO_LB : ballastLb;
  return {
    ...ofp,
    loadSheet: {
      ...sheet,
      baggage: (sheet.baggage ?? 0) + ballast,
      ...(sheet.payload !== undefined
        ? { payload: sheet.payload + ballast }
        : {}),
    },
  };
}

/** Prefer SimBrief payload (cabin+freight) over the Freight/baggage line. */
export function ofpCargoKg(ofp: OfpExpectation): number | undefined {
  const sheet = ofp.loadSheet;
  if (!sheet) return undefined;
  const unit = sheet.unit ?? ofp.fuel.unit ?? 'kg';
  const baggage = sheet.baggage;
  const payload = sheet.payload ?? ofp.payload?.total;

  let value: number | undefined;
  if (baggage !== undefined && payload !== undefined) {
    // pax_and_cargo OFPs: Freight= is leftover after seats; career cargo is Payload.
    // EFB pax=1: Freight may be a tiny maxcargo cap while Payload holds the load.
    value = Math.max(baggage, payload);
  } else {
    value = baggage ?? payload;
  }

  if (value === undefined) return undefined;

  // Intent cargo is always kg.
  return unit === 'kg' ? value : value / KG_TO_LB;
}

/** SimBrief default passenger mass (lb) — `paxwgt` / Dispatch Redirect `pax`. */
export const SIMBRIEF_STANDARD_PAX_LB = 175;
/**
 * SimBrief default checked-bag mass per passenger (lb) — `bagwgt`.
 * Dispatch still adds this on top of `cargo=` when `pax` &gt; 0.
 */
export const SIMBRIEF_STANDARD_BAG_PER_PAX_LB = 55;
/** Payload reserved per seat in SimBrief: body + bag (175+55). */
export const SIMBRIEF_STANDARD_PAX_WITH_BAG_LB =
  SIMBRIEF_STANDARD_PAX_LB + SIMBRIEF_STANDARD_BAG_PER_PAX_LB;

/**
 * JF EFB fills cargo holds up to {@link CareerPlayerAirframe.simconnectCargoHoldMaxLb}.
 * SimBrief bag/cargo can exceed that; Loaded vs Due drops the overflow from Due.
 */
export function clampPaxAndCargoDueToHoldsLb(
  plannedPayloadLb: number,
  airframe: CareerPlayerAirframe | undefined,
): number {
  if (
    !Number.isFinite(plannedPayloadLb) ||
    !airframe ||
    airframe.loadLayout !== 'pax_and_cargo'
  ) {
    return plannedPayloadLb;
  }
  const holdMax = airframe.simconnectCargoHoldMaxLb;
  const pax = airframe.maxPaxSeats;
  if (
    typeof holdMax !== 'number' ||
    typeof pax !== 'number' ||
    !Number.isFinite(holdMax) ||
    !Number.isFinite(pax) ||
    holdMax <= 0 ||
    pax <= 0
  ) {
    return plannedPayloadLb;
  }
  const bodyLb = pax * SIMBRIEF_STANDARD_PAX_LB;
  if (plannedPayloadLb <= bodyLb + 1) return plannedPayloadLb;
  const ofpCargoLb = plannedPayloadLb - bodyLb;
  if (ofpCargoLb <= holdMax) return plannedPayloadLb;
  return plannedPayloadLb - (ofpCargoLb - holdMax);
}

/**
 * Split career freight into SimBrief `pax` + `cargo` for `pax_and_cargo` airframes.
 *
 * SimBrief payload = (pax × paxwgt) + (pax × bagwgt) + cargo.
 * We must reserve {@link SIMBRIEF_STANDARD_PAX_WITH_BAG_LB} per seat before the
 * leftover becomes the `cargo=` freight field — otherwise MZFW fills and OFP
 * overshoots the mission.
 */
export function planPaxAndCargoSimBriefLoad(opts: {
  cargoKg: number;
  maxPax: number;
  /** Default {@link SIMBRIEF_STANDARD_PAX_LB}. */
  paxWeightLb?: number;
  /** Default {@link SIMBRIEF_STANDARD_BAG_PER_PAX_LB}. */
  bagPerPaxLb?: number;
}): { pax: number; cargoKg: number; paxKg: number; bagKg: number } {
  const paxLb = opts.paxWeightLb ?? SIMBRIEF_STANDARD_PAX_LB;
  const bagLb = opts.bagPerPaxLb ?? SIMBRIEF_STANDARD_BAG_PER_PAX_LB;
  const perSeatLb = paxLb + bagLb;
  const maxPax = Math.max(0, Math.floor(opts.maxPax));
  const totalLb = Math.max(0, opts.cargoKg) * KG_TO_LB;
  let pax = Math.min(maxPax, Math.floor(totalLb / perSeatLb));
  // Navigraph MSFS EFB import still needs ≥1 passenger (pilot) when any load exists.
  if (pax < 1 && totalLb > 0 && maxPax >= 1) {
    pax = 1;
  }
  const reservedLb = pax * perSeatLb;
  const cargoLb = Math.max(0, totalLb - reservedLb);
  return {
    pax,
    paxKg: (pax * paxLb) / KG_TO_LB,
    bagKg: (pax * bagLb) / KG_TO_LB,
    cargoKg: cargoLb / KG_TO_LB,
  };
}

export function isPaxAndCargoLoadLayout(
  airframe: { loadLayout?: string; maxPaxSeats?: number } | null | undefined,
): boolean {
  return airframe?.loadLayout === 'pax_and_cargo';
}

/**
 * Freight the OFP contributes toward mission.cargoKg.
 * `pax_and_cargo`: prefer SimBrief payload (already pax×paxwgt + bags + cargo);
 * fallback baggage + pax×175 when payload is missing.
 */
export function ofpFreightTowardMissionKg(
  ofp: OfpExpectation,
  airframe?: { loadLayout?: string; maxPaxSeats?: number } | null,
): number | undefined {
  if (!isPaxAndCargoLoadLayout(airframe)) {
    return ofpCargoKg(ofp);
  }
  const sheet = ofp.loadSheet;
  const unit = sheet?.unit ?? ofp.fuel.unit ?? 'kg';
  const payload = sheet?.payload ?? ofp.payload?.total;
  if (payload !== undefined && Number.isFinite(payload)) {
    return unit === 'kg' ? payload : payload / KG_TO_LB;
  }
  const bag = ofpCargoKg(ofp);
  const pax = sheet?.passengerCount ?? 0;
  const paxKg = (pax * SIMBRIEF_STANDARD_PAX_LB) / KG_TO_LB;
  if (bag === undefined && pax <= 0) return undefined;
  // Baggage line already includes SimBrief per-pax bagwgt + freight.
  return (bag ?? 0) + paxKg;
}

function worstVerdict(findings: ComplianceFinding[]): ComplianceVerdict {
  if (findings.some((f) => f.severity === 'fail')) return 'fail';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  return 'pass';
}

/**
 * Validate MissionIntent against a fetched OFP (Slice 3).
 * Catches SimBrief edits to orig/dest/cargo/pax/airframe after dispatch prefill.
 */
export function compareMissionIntentToOfp(
  mission: MissionIntent,
  ofp: OfpExpectation,
  opts: { tolerances?: Partial<IntentOfpTolerances> } = {},
): IntentOfpCheck {
  const tolerances: IntentOfpTolerances = {
    ...DEFAULT_INTENT_OFP_TOLERANCES,
    ...(opts.tolerances ?? {}),
  };
  const findings: ComplianceFinding[] = [];

  const ofpOrig = normalizeIcao(ofp.originIcao);
  const ofpDest = normalizeIcao(ofp.destIcao);
  const intentOrig = mission.originIcao.toUpperCase();
  const intentDest = mission.destIcao.toUpperCase();

  if (!ofpOrig) {
    findings.push({
      code: 'INTENT_ORIGIN_MISSING',
      severity: 'warn',
      message: 'OFP has no origin ICAO — cannot verify departure airport',
    });
  } else if (ofpOrig !== intentOrig) {
    findings.push({
      code: 'INTENT_ORIGIN_MISMATCH',
      severity: 'fail',
      message: `OFP origin ${ofpOrig} does not match mission ${intentOrig}`,
    });
  }

  if (!ofpDest) {
    findings.push({
      code: 'INTENT_DEST_MISSING',
      severity: 'warn',
      message: 'OFP has no destination ICAO — cannot verify arrival airport',
    });
  } else if (ofpDest !== intentDest) {
    findings.push({
      code: 'INTENT_DEST_MISMATCH',
      severity: 'fail',
      message: `OFP destination ${ofpDest} does not match mission ${intentDest}`,
    });
  }

  const airframe = findCareerPlayerAirframe(mission.airframeTypeId);
  const ofpPax = ofp.loadSheet?.passengerCount;
  const maxAllowedOfpPax = isPaxAndCargoLoadLayout(airframe)
    ? typeof airframe?.maxPaxSeats === 'number' && airframe.maxPaxSeats > 0
      ? Math.max(airframe.maxPaxSeats, mission.pax + tolerances.maxExtraPax)
      : // Live max comes from SimBrief at Dispatch; without a catalog cache,
        // freight-total check is the real gate — do not fail on cabin count alone.
        Number.POSITIVE_INFINITY
    : mission.pax + tolerances.maxExtraPax;
  if (ofpPax === undefined) {
    findings.push({
      code: 'INTENT_PAX_MISSING',
      severity: 'warn',
      message:
        'OFP has no passenger count — freighter missions allow 0–1 (pilot for EFB)',
    });
  } else if (ofpPax > maxAllowedOfpPax) {
    findings.push({
      code: 'INTENT_PAX_MISMATCH',
      severity: 'fail',
      message: `OFP pax=${ofpPax} but mission expects pax≤${maxAllowedOfpPax}`,
      expected: maxAllowedOfpPax,
      actual: ofpPax,
      delta: ofpPax - maxAllowedOfpPax,
    });
  }

  const ofpCargo = ofpFreightTowardMissionKg(ofp, airframe);
  if (ofpCargo === undefined) {
    findings.push({
      code: 'INTENT_CARGO_MISSING',
      severity: 'warn',
      message: 'OFP has no cargo/baggage weight — cannot verify freight load',
    });
  } else {
    const delta = ofpCargo - mission.cargoKg;
    const direction = delta < 0 ? 'under' : 'over';
    const tol = cargoToleranceKg(mission.cargoKg, tolerances, direction);
    if (Math.abs(delta) > tol) {
      findings.push({
        code: 'INTENT_CARGO_MISMATCH',
        severity: 'fail',
        message:
          direction === 'under'
            ? `OFP cargo ${ofpCargo.toFixed(0)} kg below mission ${mission.cargoKg} kg (tol −${tol.toFixed(0)} kg) — often MTOW/fuel limited on this leg`
            : `OFP cargo ${ofpCargo.toFixed(0)} kg vs mission ${mission.cargoKg} kg (tol ±${tol.toFixed(0)} kg)`,
        expected: mission.cargoKg,
        actual: ofpCargo,
        delta,
      });
    }
  }

  if (!ofp.icao) {
    findings.push({
      code: 'INTENT_AIRFRAME_MISSING',
      severity: 'warn',
      message: 'OFP has no aircraft ICAO — cannot verify freighter type',
    });
  } else if (!ofpAirframeMatchesMission(mission, ofp.icao)) {
    const expected = expectedOfpIcaoForMission(mission);
    findings.push({
      code: 'INTENT_AIRFRAME_MISMATCH',
      severity: 'fail',
      message: `OFP airframe ${ofp.icao} is not compatible with mission ${
        mission.airframeTypeId
          ? `airframe ${mission.airframeTypeId} (${expected})`
          : `class ${mission.aircraftClassId} (${expected})`
      }`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: 'INTENT_OFP_OK',
      severity: 'info',
      message: `Intent matches OFP: ${intentOrig}→${intentDest} cargo≈${mission.cargoKg} kg pax=${mission.pax}`,
    });
  }

  return { verdict: worstVerdict(findings), findings };
}

export function formatIntentOfpCheck(check: IntentOfpCheck): string {
  const lines = [`Intent→OFP: ${check.verdict.toUpperCase()}`];
  for (const f of check.findings) {
    lines.push(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  return lines.join('\n');
}

/** Monotonic OFP-check generation on a mission (0 if never stamped). */
export function missionOfpCheckSeq(mission: {
  ofpCheckSeq?: number;
}): number {
  const n = mission.ofpCheckSeq;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Mark that OFP state is mutating so in-flight confirm-ofp must not clobber it. */
export function bumpMissionOfpCheckSeq(mission: MissionIntent): number {
  const next = missionOfpCheckSeq(mission) + 1;
  mission.ofpCheckSeq = next;
  return next;
}

/**
 * True when OFP confirm failed solely because SimBrief cargo is below the
 * mission (MTOW/fuel cut / airframe maxcargo) — safe to offer "Accept OFP cargo".
 */
export function isOfpCargoUnderOnlyFailure(check: IntentOfpCheck): boolean {
  if (check.verdict !== 'fail') return false;
  const fails = check.findings.filter((f) => f.severity === 'fail');
  if (fails.length !== 1) return false;
  const f = fails[0]!;
  if (f.code !== 'INTENT_CARGO_MISMATCH') return false;
  const expected =
    typeof f.expected === 'number' && Number.isFinite(f.expected)
      ? f.expected
      : undefined;
  const actual =
    typeof f.actual === 'number' && Number.isFinite(f.actual)
      ? f.actual
      : undefined;
  if (expected === undefined || actual === undefined) {
    return typeof f.delta === 'number' && f.delta < 0;
  }
  return actual < expected;
}

export type TrimMissionCargoResult = {
  mission: MissionIntent;
  releasedKg: number;
  payBeforeUsd: number;
  payAfterUsd: number;
};

/**
 * Shrink an open mission's cargo down to `targetCargoKg` (floor).
 * Releases excess reservations back to the board and scales line pay pro-rata.
 * Used when SimBrief MTOW/fuel-limits the OFP below the staged manifest.
 */
export function trimMissionCargoToKg(
  world: CareerEconomyWorld,
  mission: MissionIntent,
  targetCargoKg: number,
): TrimMissionCargoResult {
  const normalized = normalizeMissionIntent(mission);
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot trim mission in status=${normalized.status}`);
  }
  const target = Math.floor(targetCargoKg);
  if (!Number.isFinite(target) || target < 1) {
    throw new Error(`targetCargoKg must be ≥ 1 (got ${targetCargoKg})`);
  }
  const payBeforeUsd = normalized.payUsd;
  if (normalized.cargoKg <= target) {
    return {
      mission: normalized,
      releasedKg: 0,
      payBeforeUsd,
      payAfterUsd: payBeforeUsd,
    };
  }

  // Trim from the last lot first so earlier lots stay intact when possible.
  let excess = normalized.cargoKg - target;
  const working = normalized.lots.map((line) => ({ ...line }));
  for (let i = working.length - 1; i >= 0 && excess > 0; i--) {
    const line = working[i]!;
    const maxDrop =
      i === 0 && working.filter((l) => l.cargoKg > 0).length <= 1
        ? Math.max(0, line.cargoKg - 1)
        : line.cargoKg;
    const dropKg = Math.min(excess, maxDrop);
    if (dropKg <= 0) continue;
    if (world.lots.some((lot) => lot.id === line.shipmentLotId)) {
      releaseShipmentReservation(world, line.shipmentLotId, dropKg);
    }
    const keepKg = line.cargoKg - dropKg;
    const payUsd =
      keepKg > 0
        ? Math.max(1, Math.round((line.payUsd * keepKg) / line.cargoKg))
        : 0;
    working[i] = { ...line, cargoKg: keepKg, payUsd };
    excess -= dropKg;
  }

  const nextLots = working.filter((line) => line.cargoKg > 0);
  if (nextLots.length === 0) {
    throw new Error('Trim would remove all cargo lines');
  }

  const next = recomputeMissionTotals({
    ...normalized,
    lots: nextLots,
  });
  if (next.cargoKg > target) {
    throw new Error(
      `Trim failed to reach ${target} kg (still ${next.cargoKg} kg)`,
    );
  }
  // Contract-pilot fee tracks the trimmed line pay; gross scales with cargo.
  if (normalized.contractPilot) {
    next.contractPilotFeeUsd = next.payUsd;
    if (
      typeof normalized.contractGrossPayUsd === 'number' &&
      Number.isFinite(normalized.contractGrossPayUsd) &&
      normalized.cargoKg > 0
    ) {
      next.contractGrossPayUsd = Math.max(
        1,
        Math.round(
          (normalized.contractGrossPayUsd * next.cargoKg) / normalized.cargoKg,
        ),
      );
    }
  }
  syncPlayerInbound(world, next);
  return {
    mission: next,
    releasedKg: normalized.cargoKg - next.cargoKg,
    payBeforeUsd,
    payAfterUsd: next.payUsd,
  };
}
