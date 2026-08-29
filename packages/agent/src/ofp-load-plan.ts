/**
 * Build a LoadPlanRequest from a SimBrief OFP + aircraft profile + roles pack.
 * OFP only supplies totals (block fuel / cargo); this module distributes them.
 */
import {
  DEFAULT_AVGAS_LB_PER_GAL,
  DEFAULT_JET_A_LB_PER_GAL,
  KG_TO_LB,
  ofpCargoKg,
  sanitizeFuelDensityLbPerGal,
  toLb,
  type AircraftProfile,
  type LoadPlanRequest,
  type OfpExpectation,
  type OfpStationRoleMap,
} from '@msfs-compat/shared';

export type OfpLoadPlanErrorCode =
  | 'NO_BLOCK_FUEL'
  | 'NO_CARGO_STATIONS'
  | 'FUEL_OVER_CAPACITY'
  | 'CARGO_OVER_CAPACITY'
  | 'NO_TANKS'
  | 'NO_CARGO'
  | 'MTOW_NO_ROOM';

export class OfpLoadPlanError extends Error {
  readonly code: OfpLoadPlanErrorCode;

  constructor(code: OfpLoadPlanErrorCode, message: string) {
    super(message);
    this.name = 'OfpLoadPlanError';
    this.code = code;
  }
}

/** Operating crew seat weight (lb) on every mapped crew station. */
export const FREIGHTER_PILOT_LB = 170;
/**
 * Soft cap for human seats (crew + passengers) on GA cabins. Structural
 * maxLoad is often 500; we never treat that as a normal occupant dump target.
 */
export const SEAT_OCCUPANT_SOFT_MAX_LB = 300;
/**
 * Freighter (no pax seats): soft cap on crew stations for cargo spill / CG
 * shifts. Still clamped by profile maxLoad via {@link seatSoftMaxLb} — on a
 * typical 500 lb station this raises the usable ceiling from 300→500.
 */
export const FREIGHTER_CREW_STATION_SOFT_MAX_LB = 750;
/**
 * Soft cap per rear-baggage station on GA cabins (passenger seats present).
 * More than this usually drives CG past the aft limit on light singles.
 */
export const GA_BAGGAGE_SOFT_MAX_LB = 50;

/**
 * Market / staging cargo ceiling (lb) from sticky stations + roles.
 * Same rules as Career inject:
 * - Freighter (no passenger seats): sum of baggage station maxLoad
 * - GA cabin (passenger seats): soft-cap room on crew spare + pax + rear bags,
 *   never above each station's structural maxLoad when known
 */
export function careerOperationalCargoMaxLb(opts: {
  stations: Array<{ index: number; maxLoad?: number }>;
  stationRoles?: {
    crewStations?: number[];
    passengerStations?: number[];
    baggageStations?: number[];
  };
}): number {
  const roles = opts.stationRoles;
  const crew = roles?.crewStations ?? [];
  const pax = roles?.passengerStations ?? [];
  const bags = roles?.baggageStations ?? [];
  const FALLBACK_MAX_LOAD_LB = 500;
  const hardCap = (idx: number): number => {
    const st = opts.stations.find((s) => s.index === idx);
    return typeof st?.maxLoad === 'number' &&
      Number.isFinite(st.maxLoad) &&
      st.maxLoad > 0
      ? st.maxLoad
      : 0;
  };
  /** Prefer measured maxLoad (including 0 = sealed seat). Else draft placeholder. */
  const bagCap = (idx: number): number => {
    const st = opts.stations.find((s) => s.index === idx);
    if (typeof st?.maxLoad === 'number' && Number.isFinite(st.maxLoad)) {
      return Math.max(0, st.maxLoad);
    }
    return FALLBACK_MAX_LOAD_LB;
  };

  if (pax.length > 0) {
    const crewSpare = crew.reduce((sum, idx) => {
      const soft = Math.min(
        hardCap(idx) || SEAT_OCCUPANT_SOFT_MAX_LB,
        SEAT_OCCUPANT_SOFT_MAX_LB,
      );
      return sum + Math.max(0, soft - FREIGHTER_PILOT_LB);
    }, 0);
    const paxRoom = pax.reduce((sum, idx) => {
      const soft = Math.min(
        hardCap(idx) || SEAT_OCCUPANT_SOFT_MAX_LB,
        SEAT_OCCUPANT_SOFT_MAX_LB,
      );
      return sum + soft;
    }, 0);
    const bagRoom = bags.reduce((sum, idx) => {
      const soft = Math.min(
        hardCap(idx) || GA_BAGGAGE_SOFT_MAX_LB,
        GA_BAGGAGE_SOFT_MAX_LB,
      );
      return sum + soft;
    }, 0);
    return roundLb(crewSpare + paxRoom + bagRoom);
  }

  if (bags.length > 0) {
    return roundLb(bags.reduce((sum, idx) => sum + bagCap(idx), 0));
  }

  const crewSet = new Set(crew);
  return roundLb(
    opts.stations
      .filter((st) => !crewSet.has(st.index))
      .reduce((sum, st) => sum + bagCap(st.index), 0),
  );
}

export type BuildOfpLoadPlanInput = {
  ofp: OfpExpectation;
  profile: AircraftProfile;
  stationRoles?: OfpStationRoleMap;
  /** Live station weights (lb) — used for unknown/service stations only. */
  liveStationsLb?: Record<number, number>;
  /** Override Jet-A density (lb/gal). Defaults to DEFAULT_JET_A_LB_PER_GAL. */
  fuelLbPerGal?: number;
  /**
   * Explicit cargo kg (wins over OFP baggage). Use for `pax_and_cargo` so Due
   * is full SimBrief payload, not baggage-only when passengerCount &gt; 0.
   */
  cargoKg?: number;
  /** Fallback cargo kg when OFP has no baggage/payload (e.g. mission.cargoKg). */
  cargoKgFallback?: number;
  /** Optional MTOW cargo clamp (CLI/tooling). Career inject omits these. */
  emptyWeightLb?: number;
  /** Optional MTOW cargo clamp (CLI/tooling). Career inject omits these. */
  maxGrossWeightLb?: number;
  /**
   * Career inject: when OFP block fuel exceeds profile tanks, fill to capacity
   * instead of throwing FUEL_OVER_CAPACITY (Due is rewritten to the clamped amount).
   */
  clampFuelToCapacity?: boolean;
};

export type BuiltOfpLoadPlan = {
  plan: LoadPlanRequest;
  blockFuelLb: number;
  /**
   * Cargo actually placed on profile stations (may be << OFP when station
   * maxLoad is tiny — e.g. BCF placeholder 500 lb/zone).
   */
  cargoLb: number;
  /**
   * OFP cargo after optional MTOW room clamp, before station-capacity distribute.
   * Career freighter inject omits live EMPTY×MTOW — then this equals OFP freight.
   * CDU ZFW inject must use this (+ crew), not `cargoLb`.
   */
  requestedCargoLb: number;
  fuelUnit: 'gallons' | 'pounds' | 'liters' | 'kilograms';
  tankCapacityTotal: number;
  baggageCapacityLb: number;
  preservedStations: number[];
  baggageStations: number[];
  /** Crew seats — seeded at FREIGHTER_PILOT_LB. */
  crewStations: number[];
  /** Cabin passenger seats — filled before baggage. */
  passengerStations: number[];
  /** crewStations + passengerStations — soft-capped human seats. */
  seatStations: number[];
  /** seatStations + baggageStations — full CG / capacity pool. */
  movableStations: number[];
  /** True when OFP fuel was reduced to fit tanks. */
  fuelClamped?: boolean;
  /** Original OFP block fuel (lb) before clamp. */
  requestedBlockFuelLb?: number;
};

const SYMMETRIC_PAIRS: Array<[string, string]> = [
  ['LEFT_MAIN', 'RIGHT_MAIN'],
  ['LEFT_AUX', 'RIGHT_AUX'],
  ['LEFT_TIP', 'RIGHT_TIP'],
];

function roundFuel(value: number, unit: string): number {
  if (unit === 'gallons' || unit === 'liters') {
    return Math.round(value * 100) / 100;
  }
  return Math.round(value);
}

function roundLb(value: number): number {
  return Math.round(value);
}

/**
 * Pick fuel density for gallon↔lb.
 * Light piston tanks often report Jet-A density in MSFS; prefer avgas (~6.0).
 * Larger gallon tanks (turboprop/jet) sometimes flicker to ~6.0 — force Jet-A.
 */
export function resolveFuelDensityLbPerGal(
  profile: AircraftProfile,
  liveLbPerGal?: number,
): number {
  const unit = profile.fuel.unit ?? 'gallons';
  const capacityTotal = profile.fuel.tanks.reduce(
    (sum, t) => sum + (t.capacity ?? 0),
    0,
  );
  const lightPistonGallons =
    unit === 'gallons' && capacityTotal > 0 && capacityTotal <= 120;
  if (lightPistonGallons) {
    if (
      liveLbPerGal !== undefined &&
      Number.isFinite(liveLbPerGal) &&
      liveLbPerGal > 4 &&
      liveLbPerGal < 6.45
    ) {
      return liveLbPerGal;
    }
    return DEFAULT_AVGAS_LB_PER_GAL;
  }
  return sanitizeFuelDensityLbPerGal(liveLbPerGal, {
    totalCapacityGal: unit === 'gallons' ? capacityTotal : undefined,
  });
}

/**
 * Convert OFP block fuel (weight) into profile fuel-unit quantities split across tanks.
 * Prefer symmetric L/R pairs; leftover tanks get remaining fuel in order.
 */
export function distributeFuelAcrossTanks(
  blockFuelLb: number,
  profile: AircraftProfile,
  lbPerGal = DEFAULT_JET_A_LB_PER_GAL,
  opts?: { clampToCapacity?: boolean },
): {
  tanks: Record<string, number>;
  unit: NonNullable<AircraftProfile['fuel']['unit']>;
  capacityTotal: number;
  /** True when OFP fuel was reduced to fit tanks. */
  clamped: boolean;
  /** Requested block fuel before clamp (lb). */
  requestedLb: number;
  /** Fuel weight actually placed (lb). */
  placedLb: number;
} {
  const tanks = profile.fuel.tanks;
  if (!tanks.length) {
    throw new OfpLoadPlanError('NO_TANKS', 'Aircraft profile has no fuel tanks');
  }
  const unit = profile.fuel.unit ?? 'gallons';
  const capacityTotal = tanks.reduce((sum, t) => sum + (t.capacity ?? 0), 0);
  if (!(capacityTotal > 0)) {
    throw new OfpLoadPlanError('NO_TANKS', 'Aircraft profile tanks have no capacity');
  }

  const qtyFromLb = (lb: number): number => {
    if (unit === 'gallons') return lb / lbPerGal;
    if (unit === 'pounds') return lb;
    if (unit === 'kilograms') return lb / KG_TO_LB;
    if (unit === 'liters') return lb / (lbPerGal / 3.785411784);
    return lb / lbPerGal;
  };
  const lbFromQty = (qty: number): number => {
    if (unit === 'gallons') return qty * lbPerGal;
    if (unit === 'pounds') return qty;
    if (unit === 'kilograms') return qty * KG_TO_LB;
    if (unit === 'liters') return qty * (lbPerGal / 3.785411784);
    return qty * lbPerGal;
  };

  const requestedLb = blockFuelLb;
  let remaining = qtyFromLb(blockFuelLb);
  let clamped = false;

  if (remaining > capacityTotal + 0.05) {
    if (opts?.clampToCapacity) {
      remaining = capacityTotal;
      clamped = true;
    } else {
      throw new OfpLoadPlanError(
        'FUEL_OVER_CAPACITY',
        `Block fuel ${roundFuel(qtyFromLb(blockFuelLb), unit)} ${unit} exceeds tank capacity ${roundFuel(capacityTotal, unit)} ${unit}`,
      );
    }
  }

  const tankIds = new Set(tanks.map((t) => t.id));
  const capacityById = new Map(tanks.map((t) => [t.id, t.capacity ?? 0]));
  const result: Record<string, number> = {};
  for (const t of tanks) {
    result[t.id] = 0;
  }

  const assigned = new Set<string>();

  for (const [leftId, rightId] of SYMMETRIC_PAIRS) {
    if (!tankIds.has(leftId) || !tankIds.has(rightId)) continue;
    const leftCap = capacityById.get(leftId) ?? 0;
    const rightCap = capacityById.get(rightId) ?? 0;
    const pairCap = leftCap + rightCap;
    if (pairCap <= 0) continue;

    // Prefer filling mains first when remaining fits; otherwise take as much as pair allows.
    const take = Math.min(remaining, pairCap);
    let left = take / 2;
    let right = take / 2;
    if (left > leftCap) {
      right += left - leftCap;
      left = leftCap;
    }
    if (right > rightCap) {
      left += right - rightCap;
      right = rightCap;
      left = Math.min(left, leftCap);
    }
    result[leftId] = roundFuel(left, unit);
    result[rightId] = roundFuel(right, unit);
    remaining -= result[leftId]! + result[rightId]!;
    assigned.add(leftId);
    assigned.add(rightId);
  }

  // Any remaining (CENTER, unpaired) — fill in profile order.
  if (remaining > 0.01) {
    for (const t of tanks) {
      if (assigned.has(t.id)) continue;
      const cap = t.capacity ?? 0;
      const take = Math.min(remaining, cap);
      result[t.id] = roundFuel(take, unit);
      remaining -= take;
      assigned.add(t.id);
      if (remaining <= 0.01) break;
    }
  }

  // Absorb tiny rounding leftovers into first assigned tank with spare capacity.
  if (remaining > 0.01) {
    throw new OfpLoadPlanError(
      'FUEL_OVER_CAPACITY',
      `Could not place remaining ${roundFuel(remaining, unit)} ${unit} into tanks`,
    );
  }

  const placedQty = Object.values(result).reduce((s, v) => s + v, 0);
  return {
    tanks: result,
    unit,
    capacityTotal,
    clamped,
    requestedLb,
    placedLb: roundLb(lbFromQty(placedQty)),
  };
}

/** Soft max for a seat index (never above structural maxLoad). */
export function seatSoftMaxLb(
  profile: AircraftProfile,
  index: number,
  softMax = SEAT_OCCUPANT_SOFT_MAX_LB,
): number {
  const station = profile.payload.stations.find((s) => s.index === index);
  const hard = station?.maxLoad ?? softMax;
  return Math.min(hard, softMax);
}

/**
 * Career Loaded vs Due helper: station-total planned payload after GA soft-caps.
 * Live UI should compare against `live.payload.total` (all stations), not ofpPayloadLb
 * (pax+bags only — that was showing Sim 550 while the tablet showed 1050).
 */
/** Sum of structural maxLoad on mapped baggage stations (freighter inject cap). */
export function freighterBaggageHardCapacityLb(
  profile: AircraftProfile,
  stationRoles?: OfpStationRoleMap,
): number {
  const baggageStations = (stationRoles?.baggageStations ?? []).filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  return baggageStations.reduce((sum, idx) => {
    const station = profile.payload.stations.find((s) => s.index === idx);
    return sum + (station?.maxLoad ?? 0);
  }, 0);
}

/** Preflight Due helper when only homologated stationMax is available (no live profile). */
export function freighterBaggageCapacityFromStationMax(
  stationMax: Record<number, number> | undefined,
  stationRoles?: OfpStationRoleMap,
): number | undefined {
  if (!stationMax) return undefined;
  const baggageStations = (stationRoles?.baggageStations ?? []).filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  if (baggageStations.length === 0) return undefined;
  const caps: number[] = [];
  for (const idx of baggageStations) {
    const cap = stationMax[idx];
    if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
      caps.push(cap);
    }
  }
  if (caps.length === 0) return undefined;
  // Discovery drafts stamp maxLoad 500 on every station (TFDi MD-11F → 10×500=5k
  // Due while EFB Sim is ~198 klb). That is not a real hold rating — skip clamp.
  if (caps.length >= 4 && caps.every((c) => c === 500)) {
    return undefined;
  }
  return caps.reduce((sum, c) => sum + c, 0);
}

export function plannedStationPayloadLb(opts: {
  cargoLb: number;
  stationRoles?: OfpStationRoleMap;
  /** When set with maxGross, clamp cargo like buildOfpLoadPlan. */
  emptyWeightLb?: number;
  maxGrossWeightLb?: number;
  blockFuelLb?: number;
  /** Freighter: clamp Due to injectable baggage capacity (station maxLoad sum). */
  baggageCapacityLb?: number;
}): {
  /** OFP / mission payload — compare to live.payload.total */
  plannedTotalLb: number;
  /** cargo after soft-cap / MTOW clamps */
  cargoPlacedLb: number;
  crewLb: number;
  gaCabin: boolean;
} {
  const roles = opts.stationRoles;
  const crewN = roles?.crewStations?.length ?? 0;
  const paxN = roles?.passengerStations?.length ?? 0;
  const bagN = roles?.baggageStations?.length ?? 0;
  const gaCabin = paxN > 0;
  // Freighter / career cargo: Due is the OFP freight we sent to SimBrief.
  // Do not add a Skyline crew floor on top — inject seeds crew separately and
  // Loaded vs Due compares baggage(+pax) stations only for freighters.
  const crewLb = gaCabin ? crewN * FREIGHTER_PILOT_LB : 0;
  // Inject always seeds crewStations @ 170 lb; reserve them under MTOW so Due
  // matches what can actually be placed (Duke: 733 OFP → ~503 with 2 crew).
  const crewRoomLb = crewN * FREIGHTER_PILOT_LB;
  let cargoLb = Math.max(0, opts.cargoLb);

  if (
    opts.emptyWeightLb !== undefined &&
    opts.maxGrossWeightLb !== undefined &&
    opts.blockFuelLb !== undefined &&
    opts.emptyWeightLb > 0 &&
    opts.maxGrossWeightLb > 0
  ) {
    const room =
      opts.maxGrossWeightLb -
      opts.emptyWeightLb -
      opts.blockFuelLb -
      crewRoomLb -
      25;
    if (room >= 0) cargoLb = Math.min(cargoLb, room);
  }

  if (gaCabin) {
    const seatCargoRoom =
      crewN * Math.max(0, SEAT_OCCUPANT_SOFT_MAX_LB - FREIGHTER_PILOT_LB) +
      paxN * SEAT_OCCUPANT_SOFT_MAX_LB;
    const bagRoom = bagN * GA_BAGGAGE_SOFT_MAX_LB;
    cargoLb = Math.min(cargoLb, seatCargoRoom + bagRoom);
  } else if (
    typeof opts.baggageCapacityLb === 'number' &&
    Number.isFinite(opts.baggageCapacityLb) &&
    opts.baggageCapacityLb >= 0
  ) {
    cargoLb = Math.min(cargoLb, opts.baggageCapacityLb);
  }

  return {
    plannedTotalLb: roundLb(crewLb + cargoLb),
    cargoPlacedLb: roundLb(cargoLb),
    crewLb: roundLb(crewLb),
    gaCabin,
  };
}

/**
 * EFB / SimBrief imports often leave pilot+copilot stations at 0 (crew folded
 * into BEW/ZFW). If live crew stations are empty, drop the crew floor from Due
 * so Loaded vs Due matches cargo-only.
 *
 * When seats have *some* weight but less than the planned floor (common after
 * EFB import with a single pilot / pax=1), Due tracks the live crew sum — do
 * not demand the missing second seat. Near-full crew (Skyline inject) still
 * uses the planned floor.
 */
export function adjustPlannedPayloadForLiveCrewStations(opts: {
  cargoPlacedLb: number;
  crewLb: number;
  crewStations?: number[];
  liveStations?: Record<number, number> | null;
  /** Sum on crew stations at/above this → crew is present (default 50 lb). */
  emptyThresholdLb?: number;
}): {
  plannedTotalLb: number;
  cargoPlacedLb: number;
  crewLb: number;
  crewOnStations: boolean;
} {
  const cargo = Math.max(0, opts.cargoPlacedLb);
  const crewFloor = Math.max(0, opts.crewLb);
  const cargoR = roundLb(cargo);
  const floorR = roundLb(crewFloor);

  if (crewFloor <= 0) {
    return {
      plannedTotalLb: cargoR,
      cargoPlacedLb: cargoR,
      crewLb: 0,
      crewOnStations: false,
    };
  }

  // No station map yet — keep full Due (don't drop crew without evidence).
  if (!opts.liveStations) {
    return {
      plannedTotalLb: roundLb(cargo + crewFloor),
      cargoPlacedLb: cargoR,
      crewLb: floorR,
      crewOnStations: true,
    };
  }

  let stations = (opts.crewStations ?? []).filter(
    (idx) => Number.isFinite(idx) && idx > 0,
  );
  if (stations.length === 0) {
    const n = Math.max(1, Math.round(crewFloor / FREIGHTER_PILOT_LB));
    stations = Array.from({ length: n }, (_, i) => i + 1);
  }

  const threshold = opts.emptyThresholdLb ?? 50;
  const crewLive = stations.reduce((sum, idx) => {
    const lb = opts.liveStations![idx];
    return sum + (typeof lb === 'number' && Number.isFinite(lb) ? lb : 0);
  }, 0);
  const crewOnStations = crewLive >= threshold;
  let crewLb = 0;
  if (crewOnStations) {
    const nearFull = crewLive + threshold >= floorR;
    crewLb = nearFull ? floorR : roundLb(crewLive);
  }

  // ATR HighLine EFB (and similar): SimBrief Payload already includes the
  // single pax/crew on S1. Adding the crew floor on top of that OFP figure
  // made Due = Sim + 220 lb after import.
  const liveSum = Object.values(opts.liveStations).reduce((sum, lb) => {
    return sum + (typeof lb === 'number' && Number.isFinite(lb) ? lb : 0);
  }, 0);
  if (
    crewOnStations &&
    crewLb > 0 &&
    Number.isFinite(liveSum) &&
    Math.abs(liveSum - cargo) <= 80
  ) {
    return {
      plannedTotalLb: cargoR,
      cargoPlacedLb: roundLb(Math.max(0, cargo - crewLb)),
      crewLb,
      crewOnStations,
    };
  }

  return {
    plannedTotalLb: roundLb(cargo + crewLb),
    cargoPlacedLb: cargoR,
    crewLb,
    crewOnStations,
  };
}

/**
 * Distribute cargo lb across stations.
 * Priority: passenger seats → crew spare (soft-capped) → baggage last.
 * Freighter packs with no passenger seats keep crew at 170 and put cargo on baggage.
 */
export function distributeCargoAcrossStations(
  cargoLb: number,
  profile: AircraftProfile,
  stationRoles: OfpStationRoleMap | undefined,
  liveStationsLb: Record<number, number> = {},
): {
  stations: Record<number, number>;
  total: number;
  preservedStations: number[];
  baggageStations: number[];
  crewStations: number[];
  passengerStations: number[];
  seatStations: number[];
  movableStations: number[];
  baggageCapacityLb: number;
  /** Cargo actually placed (may be less than requested when GA soft-caps clamp). */
  cargoPlacedLb: number;
  crewLb: number;
} {
  const crewStations = [...(stationRoles?.crewStations ?? [])].filter((idx) =>
    profile.payload.stations.some((s) => s.index === idx),
  );
  const passengerStations = [...(stationRoles?.passengerStations ?? [])].filter(
    (idx) => profile.payload.stations.some((s) => s.index === idx),
  );
  const baggageStations = [...(stationRoles?.baggageStations ?? [])].filter((idx) =>
    profile.payload.stations.some((s) => s.index === idx),
  );
  const gaCabin = passengerStations.length > 0;
  if (
    baggageStations.length === 0 &&
    crewStations.length === 0 &&
    passengerStations.length === 0
  ) {
    throw new OfpLoadPlanError(
      'NO_CARGO_STATIONS',
      'No baggage/crew/passenger stations mapped for this aircraft — cannot load OFP cargo safely',
    );
  }

  const preserveSet = new Set<number>([...(stationRoles?.serviceStations ?? [])]);
  const seatStations = [...new Set([...crewStations, ...passengerStations])];
  const movableStations = [...new Set([...seatStations, ...baggageStations])];

  const stations: Record<number, number> = {};
  const preservedStations: number[] = [];
  let crewLb = 0;

  for (const station of profile.payload.stations) {
    if (crewStations.includes(station.index)) {
      const value = Math.min(FREIGHTER_PILOT_LB, station.maxLoad);
      stations[station.index] = value;
      crewLb += value;
    } else if (passengerStations.includes(station.index)) {
      stations[station.index] = 0;
    } else if (preserveSet.has(station.index)) {
      const live = liveStationsLb[station.index];
      stations[station.index] = roundLb(
        Number.isFinite(live) ? Math.min(Math.max(0, live!), station.maxLoad) : 0,
      );
      preservedStations.push(station.index);
    } else if (baggageStations.includes(station.index)) {
      stations[station.index] = 0;
    } else {
      const live = liveStationsLb[station.index];
      stations[station.index] = roundLb(
        Number.isFinite(live) ? Math.min(Math.max(0, live!), station.maxLoad) : 0,
      );
      if (Number.isFinite(live)) preservedStations.push(station.index);
    }
  }

  const seatOccupantSoft = gaCabin
    ? SEAT_OCCUPANT_SOFT_MAX_LB
    : FREIGHTER_CREW_STATION_SOFT_MAX_LB;
  const seatSoftMax = Object.fromEntries(
    seatStations.map((idx) => [
      idx,
      seatSoftMaxLb(profile, idx, seatOccupantSoft),
    ]),
  );
  const seatRoomLb = seatStations.reduce((sum, idx) => {
    const cap = seatSoftMax[idx] ?? seatOccupantSoft;
    return sum + Math.max(0, cap - (stations[idx] ?? 0));
  }, 0);
  const baggageHardCapacityLb = freighterBaggageHardCapacityLb(
    profile,
    stationRoles,
  );
  const baggageSoftMax = Object.fromEntries(
    baggageStations.map((idx) => {
      const hard =
        profile.payload.stations.find((s) => s.index === idx)?.maxLoad ?? 0;
      const soft = gaCabin ? Math.min(hard, GA_BAGGAGE_SOFT_MAX_LB) : hard;
      return [idx, soft] as const;
    }),
  );
  const baggageFillCapacityLb = baggageStations.reduce(
    (sum, idx) => sum + (baggageSoftMax[idx] ?? 0),
    0,
  );
  // Freighter: fill baggage first; spill/CG may use crew seats up to the
  // freighter soft-max (min with structural). GA: seats soft-cap + ~50 lb/bag.
  const fillCapacityLb = gaCabin
    ? seatRoomLb + baggageFillCapacityLb
    : baggageStations.length > 0
      ? baggageHardCapacityLb
      : seatRoomLb;
  const baggageCapacityLb = gaCabin ? baggageFillCapacityLb : baggageHardCapacityLb;

  let requestedCargo = roundLb(cargoLb);
  // Clamp to station capacity (GA and freighter). Hard-failing blocked inject on
  // airframes whose ghost stations inflated capacity in the roles pack.
  if (requestedCargo > fillCapacityLb) {
    requestedCargo = roundLb(fillCapacityLb);
  }

  let remainingCargo = requestedCargo;
  const crewRetain = Object.fromEntries(
    crewStations.map((idx) => [idx, Math.min(FREIGHTER_PILOT_LB, stations[idx] ?? 0)]),
  );
  const beforeAll = { ...stations };

  if (gaCabin) {
    // GA / pax cabin: fill seats (soft-capped) before touching rear baggage.
    const beforeSeats = { ...stations };
    const afterSeats = equalizeMovableStations(
      stations,
      profile,
      seatStations,
      remainingCargo,
      {
        minRetainByIndex: {
          ...crewRetain,
          ...Object.fromEntries(passengerStations.map((idx) => [idx, 0])),
        },
        softMaxByIndex: seatSoftMax,
      },
    );
    const placedOnSeats = seatStations.reduce(
      (sum, idx) =>
        sum + Math.max(0, (afterSeats[idx] ?? 0) - (beforeSeats[idx] ?? 0)),
      0,
    );
    Object.assign(stations, afterSeats);
    Object.assign(
      stations,
      equalizeLateralStationPairs(stations, profile, seatStations, {
        softMaxByIndex: seatSoftMax,
      }),
    );
    remainingCargo = Math.max(0, remainingCargo - placedOnSeats);
  }

  if (remainingCargo > 0 && baggageStations.length > 0) {
    // Freighter (no pax) or leftover after seats: cargo on baggage (GA soft-capped).
    const afterBags = equalizeMovableStations(
      stations,
      profile,
      baggageStations,
      remainingCargo,
      {
        minRetainByIndex: Object.fromEntries(baggageStations.map((idx) => [idx, 0])),
        softMaxByIndex: gaCabin ? baggageSoftMax : undefined,
      },
    );
    Object.assign(stations, afterBags);
    Object.assign(
      stations,
      equalizeLateralStationPairs(stations, profile, baggageStations, {
        softMaxByIndex: gaCabin ? baggageSoftMax : undefined,
      }),
    );
    remainingCargo = 0;
  } else if (remainingCargo > 0 && seatStations.length > 0) {
    // No baggage mapped — last resort onto seats (GA 300 / freighter 750 soft).
    const afterSeats = equalizeMovableStations(
      stations,
      profile,
      seatStations,
      remainingCargo,
      { minRetainByIndex: crewRetain, softMaxByIndex: seatSoftMax },
    );
    Object.assign(stations, afterSeats);
  }

  const cargoPlacedLb = movableStations.reduce(
    (sum, idx) => sum + Math.max(0, (stations[idx] ?? 0) - (beforeAll[idx] ?? 0)),
    0,
  );
  const total = Object.values(stations).reduce((a, b) => a + b, 0);
  return {
    stations,
    total,
    preservedStations,
    baggageStations,
    crewStations,
    passengerStations,
    seatStations,
    movableStations,
    baggageCapacityLb,
    cargoPlacedLb: roundLb(cargoPlacedLb),
    crewLb,
  };
}

/**
 * Split `cargoLb` evenly across movable seats on top of current weights.
 * Uses water-filling so caps/floors still yield a near-equal layout.
 */
export function equalizeMovableStations(
  stations: Record<number, number>,
  profile: AircraftProfile,
  movableIndexes: number[],
  cargoLb: number,
  opts?: {
    minRetainByIndex?: Record<number, number>;
    softMaxByIndex?: Record<number, number>;
  },
): Record<number, number> {
  const next: Record<number, number> = { ...stations };
  const minRetain = opts?.minRetainByIndex ?? {};
  const softMax = opts?.softMaxByIndex ?? {};
  const caps = movableIndexes.map((idx) => {
    const station = profile.payload.stations.find((s) => s.index === idx);
    const hard = station?.maxLoad ?? 0;
    const max = Math.min(hard, softMax[idx] ?? hard);
    const floor = Math.min(max, Math.max(0, minRetain[idx] ?? next[idx] ?? 0));
    // Keep existing weight when above floor (do not wipe already-placed cargo).
    next[idx] = Math.max(floor, Math.min(max, next[idx] ?? 0));
    return { idx, max, floor };
  });
  let remaining = Math.max(0, roundLb(cargoLb));
  while (remaining > 0) {
    const open = caps
      .map((c) => ({ ...c, room: c.max - (next[c.idx] ?? 0) }))
      .filter((c) => c.room > 0)
      .sort((a, b) => (next[a.idx] ?? 0) - (next[b.idx] ?? 0) || a.idx - b.idx);
    if (open.length === 0) break;
    const take = Math.min(1, remaining, open[0]!.room);
    next[open[0]!.idx] = (next[open[0]!.idx] ?? 0) + take;
    remaining -= take;
  }
  return next;
}

/** Progressive-load / CG nudge step per seat (lb). */
export const CG_BALANCE_STEP_LB = 50;
/**
 * Per-round add on huge freighter cargo holds (e.g. C408 S5 @ 2500 lb).
 * Caravan / Baron cargo cabins stay on 50 lb/station (v0.3.9) so weight
 * spreads across zones instead of dumping 400 lb onto S3/S4 in one round.
 */
export const FREIGHTER_BAGGAGE_STEP_LB = 400;
/** Single-hold maxLoad at/above this → fat freighter steps. */
export const FREIGHTER_LARGE_HOLD_MAX_LB = 1500;

/** Step size for one inject cargo round. */
export function cargoPlaceStepLb(opts: {
  placingOnBaggage: boolean;
  gaCabin: boolean;
  perSeatLb: number;
  remainingLb: number;
  /** Highest maxLoad among stations filled this round. */
  holdMaxLoadLb?: number;
}): number {
  const perSeat = Math.max(0, opts.perSeatLb);
  const remaining = Math.max(0, opts.remainingLb);
  if (!opts.placingOnBaggage) return perSeat;
  if (opts.gaCabin) return Math.min(perSeat, GA_BAGGAGE_SOFT_MAX_LB);
  if ((opts.holdMaxLoadLb ?? 0) >= FREIGHTER_LARGE_HOLD_MAX_LB) {
    return Math.max(perSeat, Math.min(FREIGHTER_BAGGAGE_STEP_LB, remaining));
  }
  return perSeat;
}

/**
 * Pick load bias from live CG (v0.3.9).
 * - Too aft → load forward.
 * - Too forward → load aft.
 * - Inside envelope → equal (all cargo stations fill together).
 */
export function resolveCgCounterweightBias(opts: {
  liveMac: number;
  lo: number;
  hi: number;
  prevMac?: number;
}): 'equal' | 'forward' | 'aft' {
  const { liveMac, lo, hi } = opts;
  if (liveMac >= lo && liveMac <= hi) return 'equal';
  if (liveMac > hi) return 'forward';
  if (liveMac < lo) return 'aft';
  return 'equal';
}

/**
 * Hybrid cargo fill (not post-fill counterweight, not C408 toward-center):
 * Spread equally across all cargo stations first (Kodiak / Caravan), even when
 * empty CG already sits aft of envelope midpoint. Only leave equal when the
 * live MAC is at a limit (shift, keep Due) or after that limit fired
 * (`aftLimited` / `fwdLimited`) so leftover cargo stays on the helping side.
 */
export type CgFillAction = 'equal' | 'forward' | 'shift-forward' | 'shift-aft';

/** Profile-pinned envelopes must not be replaced by CG FWD/AFT LIMIT (Accu-Sim 0–100 vs live MAC −5). */
const PINNED_CG_ENVELOPE_SOURCES = new Set([
  'cfg',
  'manual',
  'calibrated-live',
  'live-sweep',
]);

export function resolveInjectCgEnvelope(opts: {
  envelopeSource?: string;
  profileMinMac?: number;
  profileMaxMac?: number;
  liveMinMac?: number;
  liveMaxMac?: number;
}): { minMac?: number; maxMac?: number } {
  if (PINNED_CG_ENVELOPE_SOURCES.has(opts.envelopeSource ?? '')) {
    return {
      minMac: opts.profileMinMac,
      maxMac: opts.profileMaxMac,
    };
  }
  return {
    minMac: opts.liveMinMac ?? opts.profileMinMac,
    maxMac: opts.liveMaxMac ?? opts.profileMaxMac,
  };
}

/**
 * Post-inject payload gate. Accu-Sim classic stations / mass-balance under-read;
 * prefer tablet Character* sum when available and never fake success from the
 * in-memory working plan alone.
 */
export function resolvePostInjectPayloadLive(opts: {
  plannedLb: number;
  workingLb: number;
  classicLb: number;
  massBalanceLb?: number;
  /** Accu-Sim tablet sum (Character* + baggage), when liveSources say a2a-lvars. */
  a2aLb?: number;
}): {
  liveLb: number;
  stuck: boolean;
  /** Paint afterLive from working stations (classic under-read with MB confirm). */
  paintWorking: boolean;
  source: 'a2a' | 'mass-balance-trust' | 'classic' | 'working-plan';
} {
  const planned = opts.plannedLb;
  const working = opts.workingLb;
  if (opts.a2aLb !== undefined && Number.isFinite(opts.a2aLb)) {
    const liveLb = Math.max(0, opts.a2aLb);
    return {
      liveLb,
      stuck: planned > 75 && liveLb + 75 < planned * 0.5,
      paintWorking: false,
      source: 'a2a',
    };
  }
  let liveLb = opts.classicLb;
  const massConfirmsWorking =
    opts.massBalanceLb !== undefined &&
    opts.massBalanceLb + 100 >= working * 0.7;
  let paintWorking = false;
  let source: 'mass-balance-trust' | 'classic' | 'working-plan' = 'classic';
  if (
    liveLb + 75 < planned * 0.5 &&
    working >= planned * 0.5 &&
    massConfirmsWorking
  ) {
    liveLb = working;
    paintWorking = true;
    source = 'mass-balance-trust';
  } else if (liveLb + 75 < planned * 0.5 && working >= planned * 0.5) {
    source = 'working-plan';
  }
  return {
    liveLb,
    stuck: planned > 75 && liveLb + 75 < planned * 0.5,
    paintWorking,
    source,
  };
}

export function resolveCgFillAction(opts: {
  liveMac: number;
  lo: number;
  hi: number;
  aftLimited?: boolean;
  fwdLimited?: boolean;
}): CgFillAction {
  const { liveMac, lo, hi } = opts;
  if (!(hi > lo)) return 'equal';
  if (liveMac >= hi) return 'shift-forward';
  if (liveMac <= lo) return 'shift-aft';
  if (opts.aftLimited) return 'forward';
  if (opts.fwdLimited) return 'equal';
  return 'equal';
}

/** @deprecated Prefer resolveCgFillAction — maps shift-forward/forward → forward. */
export function resolveCgFillBias(opts: {
  liveMac: number;
  lo: number;
  hi: number;
}): 'equal' | 'forward' {
  const action = resolveCgFillAction(opts);
  return action === 'forward' || action === 'shift-forward' ? 'forward' : 'equal';
}

/**
 * Per-seat step size: larger when CG is still drifting the wrong way,
 * smaller when it is already correcting (avoid overshoot).
 */
export function cgCounterweightPerSeatLb(opts: {
  liveMac: number;
  lo: number;
  hi: number;
  prevMac?: number;
  baseLb?: number;
}): number {
  const base = opts.baseLb ?? CG_BALANCE_STEP_LB;
  if (opts.prevMac === undefined) return base;
  const delta = opts.liveMac - opts.prevMac;
  // Still moving wrong way → stronger counterweight.
  if (opts.liveMac > opts.hi && delta > 0.05) return Math.min(100, base * 2);
  if (opts.liveMac < opts.lo && delta < -0.05) return Math.min(100, base * 2);
  // Already correcting → ease off.
  if (opts.liveMac > opts.hi && delta < -0.1) return Math.max(25, Math.round(base / 2));
  if (opts.liveMac < opts.lo && delta > 0.1) return Math.max(25, Math.round(base / 2));
  return base;
}

/**
 * One load round: add up to `perSeatLb` on **each** eligible seat (not a global 50 lb).
 * - equal: every movable seat gets up to perSeatLb
 * - forward / aft: only the forward or aft half (by arm) get up to perSeatLb each
 * `cargoBudgetLb` caps how much total mass may still be placed this round.
 * Optional softMaxByIndex caps human seats below structural maxLoad.
 */
export function allocateCargoRoundPerSeat(
  stations: Record<number, number>,
  profile: AircraftProfile,
  movableIndexes: number[],
  perSeatLb: number,
  bias: 'equal' | 'forward' | 'aft',
  cargoBudgetLb: number,
  opts?: { softMaxByIndex?: Record<number, number> },
): ShiftCargoForCgResult {
  const next: Record<number, number> = { ...stations };
  let budget = Math.max(0, roundLb(cargoBudgetLb));
  const perSeat = Math.max(0, roundLb(perSeatLb));
  if (budget <= 0 || perSeat <= 0 || movableIndexes.length === 0) {
    return { stations: next, movedLb: 0 };
  }

  const { indexes: forwardFirst } = orderStationsLongitudinal(profile, movableIndexes);
  const half = Math.max(1, Math.ceil(forwardFirst.length / 2));
  let targets =
    bias === 'forward'
      ? forwardFirst.slice(0, half)
      : bias === 'aft'
        ? forwardFirst.slice(-half)
        : [...forwardFirst];
  // Forward/aft half by arm can pick only the left of a L/R row (same arm,
  // lower index sorts first). Expand so both sides of any selected row get cargo.
  if (bias === 'forward' || bias === 'aft') {
    const selected = new Set(targets);
    for (const group of findLateralStationGroups(profile, movableIndexes)) {
      if (group.some((idx) => selected.has(idx))) {
        for (const idx of group) selected.add(idx);
      }
    }
    targets = forwardFirst.filter((idx) => selected.has(idx));
  }

  const softMax = opts?.softMaxByIndex ?? {};
  const maxByIndex = new Map(
    profile.payload.stations.map((s) => {
      const soft = softMax[s.index];
      const max = soft !== undefined ? Math.min(s.maxLoad, soft) : s.maxLoad;
      return [s.index, max] as const;
    }),
  );
  let movedLb = 0;
  // Prefer lighter seats so we do not pile one side while emptying another.
  const orderedTargets = [...targets].sort(
    (a, b) => (next[a] ?? 0) - (next[b] ?? 0) || a - b,
  );
  for (const idx of orderedTargets) {
    if (budget <= 0) break;
    const maxLoad = maxByIndex.get(idx) ?? 0;
    const room = Math.max(0, maxLoad - (next[idx] ?? 0));
    const take = Math.min(perSeat, room, budget);
    if (take <= 0) continue;
    next[idx] = (next[idx] ?? 0) + take;
    budget -= take;
    movedLb += take;
  }
  // Keep L/R (same-arm) pairs even after budget-limited rounds.
  const balanced = equalizeLateralStationPairs(next, profile, movableIndexes, {
    softMaxByIndex: softMax,
  });
  return { stations: balanced, movedLb };
}

/** @deprecated Use allocateCargoRoundPerSeat — kept as alias for older call sites. */
export function allocateCargoStep(
  stations: Record<number, number>,
  profile: AircraftProfile,
  movableIndexes: number[],
  stepLb: number,
  bias: 'equal' | 'forward' | 'aft',
): ShiftCargoForCgResult {
  // Legacy callers treated stepLb as a global budget; approximate with one round.
  return allocateCargoRoundPerSeat(
    stations,
    profile,
    movableIndexes,
    CG_BALANCE_STEP_LB,
    bias,
    stepLb,
  );
}

/**
 * Forward-most lateral group that still has room (Bonanza S3/S4 before S5/S6
 * before S7). Cabin-as-baggage must not equal-fill the tail.
 */
export function forwardMostOpenStationGroup(
  stations: Record<number, number>,
  profile: AircraftProfile,
  indexes: number[],
  opts?: { softMaxByIndex?: Record<number, number> },
): number[] {
  if (indexes.length === 0) return [];
  const { indexes: forwardFirst } = orderStationsLongitudinal(profile, indexes);
  const laterals = findLateralStationGroups(profile, indexes);
  const softMax = opts?.softMaxByIndex ?? {};
  const maxOf = (idx: number): number => {
    const hard =
      profile.payload.stations.find((s) => s.index === idx)?.maxLoad ?? 0;
    const soft = softMax[idx];
    return soft !== undefined ? Math.min(hard, soft) : hard;
  };
  const assigned = new Set<number>();
  for (const idx of forwardFirst) {
    if (assigned.has(idx)) continue;
    const pair = laterals.find((g) => g.includes(idx));
    const group = pair
      ? forwardFirst.filter((i) => pair.includes(i))
      : [idx];
    for (const g of group) assigned.add(g);
    const room = group.reduce(
      (sum, i) => sum + Math.max(0, maxOf(i) - (stations[i] ?? 0)),
      0,
    );
    if (room > 0.5) return group;
  }
  return [];
}

/**
 * Forward or aft half of stations (by arm), expanding L/R pairs so a row
 * is never split. Used when hybrid fill has left the calm/mid band.
 */
export function longitudinalHalfIndexes(
  profile: AircraftProfile,
  indexes: number[],
  side: 'forward' | 'aft',
): number[] {
  if (indexes.length === 0) return [];
  const { indexes: forwardFirst } = orderStationsLongitudinal(profile, indexes);
  const half = Math.max(1, Math.ceil(forwardFirst.length / 2));
  const raw =
    side === 'forward'
      ? forwardFirst.slice(0, half)
      : forwardFirst.slice(-half);
  const selected = new Set(raw);
  for (const group of findLateralStationGroups(profile, indexes)) {
    if (group.some((idx) => selected.has(idx))) {
      for (const idx of group) selected.add(idx);
    }
  }
  return forwardFirst.filter((idx) => selected.has(idx));
}

/**
 * Order baggage stations forward→aft.
 * Prefer station.arm (MSFS: higher longitudinal arm = more forward); else station index.
 */
export function orderStationsLongitudinal(
  profile: AircraftProfile,
  baggageIndexes: number[],
): { indexes: number[]; usedArms: boolean } {
  const stations = baggageIndexes
    .map((idx) => profile.payload.stations.find((s) => s.index === idx))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const usedArms = stations.length > 0 && stations.every(
    (s) => typeof s.arm === 'number' && Number.isFinite(s.arm),
  );
  if (usedArms) {
    const ordered = [...stations].sort((a, b) => (b.arm as number) - (a.arm as number));
    return { indexes: ordered.map((s) => s.index), usedArms: true };
  }
  return {
    indexes: [...baggageIndexes].sort((a, b) => a - b),
    usedArms: false,
  };
}

function stationSideFromName(name: string | undefined): 'left' | 'right' | null {
  const n = String(name ?? '').toUpperCase();
  if (!n) return null;
  if (/\bCOPILOT\b/.test(n)) return 'right';
  if (/\bPILOT\b/.test(n)) return 'left';
  if (/\bLEFT\b|\bPORT\b/.test(n)) return 'left';
  if (/\bRIGHT\b|\bSTBD\b|\bSTARBOARD\b/.test(n)) return 'right';
  return null;
}

function stationHasArm<T extends { arm?: number }>(
  station: T,
): station is T & { arm: number } {
  return typeof station.arm === 'number' && Number.isFinite(station.arm);
}

/** Belly pods / aft holds — do not treat as a cabin L/R row. */
function looksLikeCenterlineHold(name: string | undefined): boolean {
  const n = String(name ?? '').toUpperCase();
  if (/\b(PASSENGER|PAX|SEAT|PILOT|COPILOT)\b/.test(n)) return false;
  return /\b(CARGO|POD|HOLD|BAGGAGE|BELLY|ZONE)\b/.test(n);
}

/**
 * Caravan cabin L/R seats are staggered in cfg (~1.2–1.4 ft), not the same
 * arm. Pair consecutive unmatched stations within this delta so leftover
 * cargo splits across the row instead of piling on the forward-most seat.
 * Cargo pods / next row are farther apart and stay unpaired.
 */
export const LATERAL_PAIR_MAX_ARM_DELTA_FT = 2;

/**
 * Group movable stations into L/R rows:
 * 1. Same longitudinal arm (Bonanza)
 * 2. Nearby arms (Caravan staggered cabin)
 * 3. LEFT/RIGHT (or pilot/copilot) in the station name
 * 4. Consecutive indexes when there is no arm (S3+S4, S5+S6…) — skips pods/holds
 */
export function findLateralStationGroups(
  profile: AircraftProfile,
  movableIndexes: number[],
): number[][] {
  const stations = movableIndexes
    .map((idx) => profile.payload.stations.find((s) => s.index === idx))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (stations.length < 2) return [];

  const pairs: number[][] = [];
  const paired = new Set<number>();
  const addPair = (a: number, b: number) => {
    if (a === b || paired.has(a) || paired.has(b)) return;
    pairs.push([a, b].sort((x, y) => x - y));
    paired.add(a);
    paired.add(b);
  };

  const withArm = stations.filter(stationHasArm);
  if (withArm.length >= 2) {
    const byArm = new Map<string, number[]>();
    for (const s of withArm) {
      const key = (Math.round(s.arm * 100) / 100).toFixed(2);
      const list = byArm.get(key) ?? [];
      list.push(s.index);
      byArm.set(key, list);
    }
    for (const group of byArm.values()) {
      if (group.length === 2) addPair(group[0]!, group[1]!);
    }
    const leftoverArm = withArm
      .filter((s) => !paired.has(s.index))
      .sort((a, b) => b.arm - a.arm);
    for (let i = 0; i < leftoverArm.length - 1; ) {
      const a = leftoverArm[i]!;
      const b = leftoverArm[i + 1]!;
      const delta = Math.abs(a.arm - b.arm);
      if (delta > 0.05 && delta <= LATERAL_PAIR_MAX_ARM_DELTA_FT) {
        addPair(a.index, b.index);
        i += 2;
        continue;
      }
      i += 1;
    }
  }

  const lefts: number[] = [];
  const rights: number[] = [];
  for (const s of stations) {
    if (paired.has(s.index)) continue;
    const side = stationSideFromName(s.name);
    if (side === 'left') lefts.push(s.index);
    else if (side === 'right') rights.push(s.index);
  }
  lefts.sort((a, b) => a - b);
  rights.sort((a, b) => a - b);
  const named = Math.min(lefts.length, rights.length);
  for (let i = 0; i < named; i++) addPair(lefts[i]!, rights[i]!);

  const consecutive = stations
    .filter((s) => !paired.has(s.index) && !looksLikeCenterlineHold(s.name))
    .sort((a, b) => a.index - b.index);
  for (let i = 0; i < consecutive.length - 1; ) {
    const a = consecutive[i]!;
    const b = consecutive[i + 1]!;
    if (b.index === a.index + 1) {
      addPair(a.index, b.index);
      i += 2;
      continue;
    }
    i += 1;
  }

  return pairs;
}

/**
 * Equalize weight across lateral (same-arm / L-R) groups without changing totals
 * in each group — longitudinal CG stays put.
 */
export function equalizeLateralStationPairs(
  stations: Record<number, number>,
  profile: AircraftProfile,
  movableIndexes: number[],
  opts?: { softMaxByIndex?: Record<number, number> },
): Record<number, number> {
  const next: Record<number, number> = { ...stations };
  const softMax = opts?.softMaxByIndex ?? {};
  const maxOf = (idx: number) => {
    const hard =
      profile.payload.stations.find((s) => s.index === idx)?.maxLoad ?? 0;
    const soft = softMax[idx];
    return soft !== undefined ? Math.min(hard, soft) : hard;
  };

  for (const group of findLateralStationGroups(profile, movableIndexes)) {
    // Water-fill the group total across members (lightest / most room first).
    let total = 0;
    for (const idx of group) total += Math.max(0, next[idx] ?? 0);
    total = roundLb(total);
    for (const idx of group) next[idx] = 0;
    let remaining = total;
    while (remaining > 0) {
      const open = group
        .map((idx) => ({
          idx,
          room: Math.max(0, maxOf(idx) - (next[idx] ?? 0)),
          cur: next[idx] ?? 0,
        }))
        .filter((c) => c.room > 0)
        .sort((a, b) => a.cur - b.cur || a.idx - b.idx);
      if (open.length === 0) break;
      const take = Math.min(1, remaining, open[0]!.room);
      next[open[0]!.idx] = (next[open[0]!.idx] ?? 0) + take;
      remaining -= take;
    }
  }
  return next;
}

export type ShiftCargoForCgResult = {
  stations: Record<number, number>;
  movedLb: number;
};

/**
 * Move payload lb toward the nose (`forward`) or tail (`aft`) among movable stations
 * (typically crew + baggage). Preserves non-movable weights; keeps movable mass constant.
 * Optional minRetainByIndex keeps a floor on seats (e.g. 170 lb crew) when sourcing.
 */
export function shiftCargoForCg(
  stations: Record<number, number>,
  profile: AircraftProfile,
  movableIndexes: number[],
  direction: 'forward' | 'aft',
  amountLb: number,
  opts?: {
    minRetainByIndex?: Record<number, number>;
    softMaxByIndex?: Record<number, number>;
    /**
     * Prefer other destinations first when shifting forward (freighter crew
     * seats). Fill forward baggage (S3/S4) before dumping onto crew (S1/S2).
     */
    deferTargetIndexes?: number[];
  },
): ShiftCargoForCgResult {
  const next: Record<number, number> = { ...stations };
  let remaining = Math.max(0, roundLb(amountLb));
  if (remaining <= 0 || movableIndexes.length < 2) {
    return { stations: next, movedLb: 0 };
  }

  const { indexes: forwardFirst } = orderStationsLongitudinal(profile, movableIndexes);
  const softMax = opts?.softMaxByIndex ?? {};
  const maxByIndex = new Map(
    profile.payload.stations.map((s) => {
      const soft = softMax[s.index];
      const max = soft !== undefined ? Math.min(s.maxLoad, soft) : s.maxLoad;
      return [s.index, max] as const;
    }),
  );
  const armByIndex = new Map(
    profile.payload.stations.map((s) => [
      s.index,
      typeof s.arm === 'number' && Number.isFinite(s.arm) ? s.arm : undefined,
    ]),
  );
  const movableSet = new Set(forwardFirst);
  const minRetain = opts?.minRetainByIndex ?? {};
  // Without arms, consecutive indexes (S1/S2, S3/S4…) are L/R pairs — moving
  // between them is lateral. Equalize would undo it but leave a fake movedLb.
  const lateralMate = new Map<number, number>();
  for (const group of findLateralStationGroups(profile, movableIndexes)) {
    if (group.length !== 2) continue;
    lateralMate.set(group[0]!, group[1]!);
    lateralMate.set(group[1]!, group[0]!);
  }

  const deferredTargets = new Set(opts?.deferTargetIndexes ?? []);
  // Sources / targets stay longitudinal; among equal options we still respect floors/soft max.
  const sources =
    direction === 'forward' ? [...forwardFirst].reverse() : [...forwardFirst];
  const targetsBase =
    direction === 'forward' ? [...forwardFirst] : [...forwardFirst].reverse();
  // Forward: baggage/nose holds before deferred crew seats (same longitudinal order).
  const targets =
    direction === 'forward' && deferredTargets.size > 0
      ? [
          ...targetsBase.filter((idx) => !deferredTargets.has(idx)),
          ...targetsBase.filter((idx) => deferredTargets.has(idx)),
        ]
      : targetsBase;

  let movedLb = 0;
  for (const src of sources) {
    if (remaining <= 0) break;
    if (!movableSet.has(src)) continue;
    const floor = Math.max(0, minRetain[src] ?? 0);
    let available = Math.max(0, (next[src] ?? 0) - floor);
    if (available <= 0) continue;
    const srcPos = forwardFirst.indexOf(src);
    const srcArm = armByIndex.get(src);

    for (const dst of targets) {
      if (remaining <= 0 || available <= 0) break;
      if (src === dst || !movableSet.has(dst)) continue;
      const dstPos = forwardFirst.indexOf(dst);
      if (direction === 'forward' && dstPos >= srcPos) continue;
      if (direction === 'aft' && dstPos <= srcPos) continue;
      if (lateralMate.get(src) === dst) continue;

      // Same longitudinal arm = L/R pair. Moving between them is lateral, not CG.
      const dstArm = armByIndex.get(dst);
      if (
        srcArm !== undefined &&
        dstArm !== undefined &&
        Math.abs(srcArm - dstArm) < 0.05
      ) {
        continue;
      }

      const maxLoad = maxByIndex.get(dst) ?? 0;
      const room = Math.max(0, maxLoad - (next[dst] ?? 0));
      if (room <= 0) continue;

      const move = Math.min(remaining, available, room);
      if (move <= 0) continue;
      next[src] = (next[src] ?? 0) - move;
      next[dst] = (next[dst] ?? 0) + move;
      available -= move;
      remaining -= move;
      movedLb += move;
    }
  }

  // Re-balance any L/R pairs that drifted during earlier placement rounds.
  const balanced = equalizeLateralStationPairs(next, profile, movableIndexes, {
    softMaxByIndex: softMax,
  });
  return { stations: balanced, movedLb };
}

/** Step size for iterative CG rebalance (lb) — fixed 50 lb nudges. */
export function cgRebalanceStepLb(_opts?: {
  excessMac?: number;
  cargoLb?: number;
}): number {
  return CG_BALANCE_STEP_LB;
}

/**
 * True when live fuel already matches the planned quantity (total), so we can
 * skip a fuel rewrite. Tank split may differ (vendor systems rebalance); total
 * is what OFP / preflight care about.
 */
export function liveFuelMatchesTarget(
  liveTanks: Record<string, number>,
  targetTanks: Record<string, number>,
  opts?: { absTol?: number; pctTol?: number },
): boolean {
  const absTol = opts?.absTol ?? 1.5;
  const pctTol = opts?.pctTol ?? 2;
  let liveTotal = 0;
  let targetTotal = 0;
  for (const v of Object.values(liveTanks)) {
    if (Number.isFinite(v)) liveTotal += v;
  }
  for (const v of Object.values(targetTanks)) {
    if (Number.isFinite(v)) targetTotal += v;
  }
  const tol = Math.max(Math.abs(targetTotal) * (pctTol / 100), absTol, 0.01);
  return Math.abs(liveTotal - targetTotal) <= tol;
}

/**
 * Max residual (profile fuel units) treated as an unusable floor when draining.
 * ~15 gal ≈ 100 lb Jet-A — covers King Air tip/AUX stuck quantity with density slack.
 */
export const FUEL_RESIDUAL_FLOOR_MAX = 15;

/**
 * When inject targets empty outer tanks but MSFS keeps an unusable residual,
 * raise the plan to that floor so we stop fighting the sim.
 */
export function absorbFuelResidualFloors(
  planned: Record<string, number>,
  live: Record<string, number>,
  opts?: { maxFloor?: number },
): { tanks: Record<string, number>; added: number } {
  const maxFloor = opts?.maxFloor ?? FUEL_RESIDUAL_FLOOR_MAX;
  const tanks = { ...planned };
  let added = 0;
  for (const [id, liveQty] of Object.entries(live)) {
    if (!Number.isFinite(liveQty)) continue;
    const want = Number.isFinite(tanks[id]) ? tanks[id]! : 0;
    if (liveQty <= want + 0.05) continue;
    if (want <= 0.5 && liveQty > 0.5 && liveQty <= maxFloor) {
      added += liveQty - want;
      tanks[id] = liveQty;
    }
  }
  return { tanks, added };
}

const RESIDUAL_DRAIN_PAIRS: Array<[string, string]> = [
  ['LEFT_MAIN', 'RIGHT_MAIN'],
  ['CENTER', 'CENTER2'],
];

function sumTankQty(tanks: Record<string, number>): number {
  let sum = 0;
  for (const v of Object.values(tanks)) {
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

/**
 * Keep OFP total fuel: accept unusable floors on tanks planned empty (wing
 * mains on Twin Otter, AUX/TIP on King Air), then pull the same quantity out of
 * tanks that carried OFP fuel — never undo the floors by draining them first.
 */
export function redistributeAroundResidualFloors(
  planned: Record<string, number>,
  live: Record<string, number>,
  opts?: { maxFloor?: number },
): { tanks: Record<string, number>; added: number; reduced: number } {
  const originalPlanned = { ...planned };
  const targetTotal = sumTankQty(planned);
  const absorbed = absorbFuelResidualFloors(planned, live, opts);
  if (absorbed.added <= 0.05) {
    return { tanks: { ...planned }, added: 0, reduced: 0 };
  }
  const tanks = { ...absorbed.tanks };
  let excess = sumTankQty(tanks) - targetTotal;
  let reduced = 0;
  if (excess <= 0.05) {
    return { tanks, added: absorbed.added, reduced: 0 };
  }

  /** Prefer draining tanks that had OFP fuel so residual floors stay put. */
  const canDrain = (id: string): boolean =>
    (Number.isFinite(originalPlanned[id]) ? originalPlanned[id]! : 0) > 0.5;

  for (const [leftId, rightId] of RESIDUAL_DRAIN_PAIRS) {
    if (excess <= 0.05) break;
    if (!canDrain(leftId) && !canDrain(rightId)) continue;
    const left = Number.isFinite(tanks[leftId]) ? tanks[leftId]! : 0;
    const right = Number.isFinite(tanks[rightId]) ? tanks[rightId]! : 0;
    if (left <= 0 && right <= 0 && !(leftId in tanks) && !(rightId in tanks)) {
      continue;
    }
    const drainLeft = canDrain(leftId) ? left : 0;
    const drainRight = canDrain(rightId) ? right : 0;
    const pair = drainLeft + drainRight;
    if (pair <= 0.05) continue;
    const take = Math.min(excess, pair);
    let nextLeft = canDrain(leftId) ? Math.max(0, left - take / 2) : left;
    let nextRight = canDrain(rightId) ? Math.max(0, right - take / 2) : right;
    let leftover = take - (left - nextLeft + (right - nextRight));
    if (leftover > 0.01 && canDrain(leftId) && nextLeft >= leftover) {
      nextLeft -= leftover;
      leftover = 0;
    }
    if (leftover > 0.01 && canDrain(rightId) && nextRight >= leftover) {
      nextRight -= leftover;
      leftover = 0;
    }
    const removed = left - nextLeft + (right - nextRight);
    tanks[leftId] = Math.round(nextLeft * 100) / 100;
    tanks[rightId] = Math.round(nextRight * 100) / 100;
    excess -= removed;
    reduced += removed;
  }

  if (excess > 0.05) {
    for (const id of Object.keys(tanks)) {
      if (excess <= 0.05) break;
      if (!canDrain(id)) continue;
      if (/aux|tip/i.test(id)) continue;
      const cur = tanks[id]!;
      if (!(cur > 0.05)) continue;
      const take = Math.min(excess, cur);
      tanks[id] = Math.round((cur - take) * 100) / 100;
      excess -= take;
      reduced += take;
    }
  }

  return { tanks, added: absorbed.added, reduced };
}

/** Default Career OFP fuel inject passes (ramp current → planned). */
export const FUEL_INJECT_ROUNDS = 4;

/** True for AUX / TIP tanks that are often unused and expensive to poke. */
export function isOuterFuelTankId(tankId: string): boolean {
  return /AUX|TIP/i.test(tankId);
}

/**
 * Outer tanks that are empty both live and in the write target — safe to skip
 * writing (and reading) so idle Baron/King Air AUX does not stall SimConnect.
 */
export function idleOuterFuelTankIds(
  liveOrStart: Record<string, number>,
  target: Record<string, number>,
  opts?: { emptyQty?: number },
): string[] {
  const emptyQty = opts?.emptyQty ?? 0.05;
  const ids = new Set([
    ...Object.keys(liveOrStart),
    ...Object.keys(target),
  ]);
  const out: string[] = [];
  for (const id of ids) {
    if (!isOuterFuelTankId(id)) continue;
    const live = Number.isFinite(liveOrStart[id]) ? liveOrStart[id]! : 0;
    const want = Number.isFinite(target[id]) ? target[id]! : 0;
    if (live <= emptyQty && want <= emptyQty) out.push(id);
  }
  return out;
}

/**
 * Interpolate tank quantities from `from` toward `to` for round `round`
 * (1-based). The final round snaps exactly to `to`.
 */
export function fuelTankTargetsForRound(
  from: Record<string, number>,
  to: Record<string, number>,
  round: number,
  totalRounds: number = FUEL_INJECT_ROUNDS,
): Record<string, number> {
  const rounds = Math.max(1, Math.floor(totalRounds));
  const step = Math.min(rounds, Math.max(1, Math.floor(round)));
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const out: Record<string, number> = {};
  const t = step / rounds;
  for (const id of keys) {
    const a = Number.isFinite(from[id]) ? from[id]! : 0;
    const b = Number.isFinite(to[id]) ? to[id]! : 0;
    out[id] = step >= rounds ? b : a + (b - a) * t;
  }
  return out;
}

export function buildOfpLoadPlan(input: BuildOfpLoadPlanInput): BuiltOfpLoadPlan {
  const {
    ofp,
    profile,
    stationRoles,
    liveStationsLb,
    fuelLbPerGal,
    cargoKg: cargoKgOverride,
    cargoKgFallback,
    emptyWeightLb,
    maxGrossWeightLb,
    clampFuelToCapacity,
  } = input;

  const sheet = ofp.loadSheet;
  const blockRaw = sheet?.blockFuel ?? ofp.fuel.total;
  if (blockRaw === undefined || !Number.isFinite(blockRaw) || blockRaw < 0) {
    throw new OfpLoadPlanError('NO_BLOCK_FUEL', 'OFP has no block fuel (plan_ramp)');
  }
  const fuelUnitOfp = sheet?.unit ?? ofp.fuel.unit ?? 'kg';
  const requestedBlockFuelLb = toLb(blockRaw, fuelUnitOfp);
  const density = resolveFuelDensityLbPerGal(profile, fuelLbPerGal);

  const fuel = distributeFuelAcrossTanks(
    requestedBlockFuelLb,
    profile,
    density,
    { clampToCapacity: clampFuelToCapacity === true },
  );
  const blockFuelLb = fuel.placedLb;

  const cargoKg = cargoKgOverride ?? ofpCargoKg(ofp) ?? cargoKgFallback;
  if (cargoKg === undefined || !Number.isFinite(cargoKg) || cargoKg < 0) {
    throw new OfpLoadPlanError('NO_CARGO', 'OFP has no cargo/baggage weight to load');
  }
  let cargoLb = cargoKg * KG_TO_LB;

  const crewStations = stationRoles?.crewStations ?? ofp.payload?.stationRoles?.crewStations ?? [];
  let plannedCrewLb = 0;
  for (const idx of crewStations) {
    const st = profile.payload.stations.find((s) => s.index === idx);
    plannedCrewLb += st
      ? Math.min(FREIGHTER_PILOT_LB, st.maxLoad)
      : FREIGHTER_PILOT_LB;
  }

  if (
    Number.isFinite(emptyWeightLb) &&
    emptyWeightLb! > 0 &&
    Number.isFinite(maxGrossWeightLb) &&
    maxGrossWeightLb! > 0
  ) {
    const marginLb = 25;
    const roomLb =
      maxGrossWeightLb! - emptyWeightLb! - blockFuelLb - plannedCrewLb - marginLb;
    if (roomLb < 0.5) {
      throw new OfpLoadPlanError(
        'MTOW_NO_ROOM',
        `No payload room under MTOW ${roundLb(maxGrossWeightLb!)} lb ` +
          `(empty ${roundLb(emptyWeightLb!)} + fuel ${roundLb(blockFuelLb)} + crew ${roundLb(plannedCrewLb)})`,
      );
    }
    if (cargoLb > roomLb) {
      cargoLb = roundLb(roomLb);
    }
  }

  /** OFP/MTOW cargo target — keep before station maxLoad clamps. */
  const requestedCargoLb = roundLb(cargoLb);

  const payload = distributeCargoAcrossStations(
    cargoLb,
    profile,
    stationRoles ?? ofp.payload?.stationRoles,
    liveStationsLb,
  );
  // GA soft-caps / tiny station maxLoad may place less than OFP asks for.
  cargoLb = payload.cargoPlacedLb;

  return {
    plan: {
      fuel: { tanks: fuel.tanks },
      payload: { stations: payload.stations, total: payload.total },
    },
    blockFuelLb,
    cargoLb,
    requestedCargoLb,
    fuelUnit: fuel.unit,
    tankCapacityTotal: fuel.capacityTotal,
    baggageCapacityLb: payload.baggageCapacityLb,
    preservedStations: payload.preservedStations,
    baggageStations: payload.baggageStations,
    crewStations: payload.crewStations,
    passengerStations: payload.passengerStations,
    seatStations: payload.seatStations,
    movableStations: payload.movableStations,
    ...(fuel.clamped
      ? {
          fuelClamped: true,
          requestedBlockFuelLb: fuel.requestedLb,
        }
      : {}),
  };
}

/** Snapshot current tanks+stations into a LoadPlanRequest suitable for rollback. */
export function buildRollbackPlan(
  profile: AircraftProfile,
  live: {
    tanks?: Record<string, number>;
    stations?: Record<number, number>;
  },
): LoadPlanRequest {
  const tanks: Record<string, number> = {};
  for (const t of profile.fuel.tanks) {
    tanks[t.id] = live.tanks?.[t.id] ?? 0;
  }
  const stations: Record<number, number> = {};
  for (const s of profile.payload.stations) {
    stations[s.index] = live.stations?.[s.index] ?? 0;
  }
  const total = Object.values(stations).reduce((a, b) => a + b, 0);
  return {
    fuel: { tanks },
    payload: { stations, total },
  };
}
