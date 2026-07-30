/**
 * Build a LoadPlanRequest from a SimBrief OFP + aircraft profile + roles pack.
 * OFP only supplies totals (block fuel / cargo); this module distributes them.
 */
import {
  DEFAULT_JET_A_LB_PER_GAL,
  KG_TO_LB,
  ofpCargoKg,
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
  | 'NO_CARGO';

export class OfpLoadPlanError extends Error {
  readonly code: OfpLoadPlanErrorCode;

  constructor(code: OfpLoadPlanErrorCode, message: string) {
    super(message);
    this.name = 'OfpLoadPlanError';
    this.code = code;
  }
}

export type BuildOfpLoadPlanInput = {
  ofp: OfpExpectation;
  profile: AircraftProfile;
  stationRoles?: OfpStationRoleMap;
  /** Live station weights (lb) — used to preserve crew/service/pax stations. */
  liveStationsLb?: Record<number, number>;
  /** Override Jet-A density (lb/gal). Defaults to DEFAULT_JET_A_LB_PER_GAL. */
  fuelLbPerGal?: number;
  /** Fallback cargo kg when OFP has no baggage/payload (e.g. mission.cargoKg). */
  cargoKgFallback?: number;
};

export type BuiltOfpLoadPlan = {
  plan: LoadPlanRequest;
  blockFuelLb: number;
  cargoLb: number;
  fuelUnit: 'gallons' | 'pounds' | 'liters' | 'kilograms';
  tankCapacityTotal: number;
  baggageCapacityLb: number;
  preservedStations: number[];
  baggageStations: number[];
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
 * Convert OFP block fuel (weight) into profile fuel-unit quantities split across tanks.
 * Prefer symmetric L/R pairs; leftover tanks get remaining fuel in order.
 */
export function distributeFuelAcrossTanks(
  blockFuelLb: number,
  profile: AircraftProfile,
  lbPerGal = DEFAULT_JET_A_LB_PER_GAL,
): { tanks: Record<string, number>; unit: NonNullable<AircraftProfile['fuel']['unit']>; capacityTotal: number } {
  const tanks = profile.fuel.tanks;
  if (!tanks.length) {
    throw new OfpLoadPlanError('NO_TANKS', 'Aircraft profile has no fuel tanks');
  }
  const unit = profile.fuel.unit ?? 'gallons';
  const capacityTotal = tanks.reduce((sum, t) => sum + (t.capacity ?? 0), 0);
  if (!(capacityTotal > 0)) {
    throw new OfpLoadPlanError('NO_TANKS', 'Aircraft profile tanks have no capacity');
  }

  let remaining: number;
  if (unit === 'gallons') {
    remaining = blockFuelLb / lbPerGal;
  } else if (unit === 'pounds') {
    remaining = blockFuelLb;
  } else if (unit === 'kilograms') {
    remaining = blockFuelLb / KG_TO_LB;
  } else if (unit === 'liters') {
    // Approx Jet-A: 6.7 lb/gal ÷ 3.785 ≈ 1.77 lb/L
    remaining = blockFuelLb / (lbPerGal / 3.785411784);
  } else {
    remaining = blockFuelLb / lbPerGal;
  }

  if (remaining > capacityTotal + 0.05) {
    throw new OfpLoadPlanError(
      'FUEL_OVER_CAPACITY',
      `Block fuel ${roundFuel(remaining, unit)} ${unit} exceeds tank capacity ${roundFuel(capacityTotal, unit)} ${unit}`,
    );
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

  return { tanks: result, unit, capacityTotal };
}

/**
 * Distribute cargo lb across baggage stations proportional to maxLoad.
 * Preserves crew/service/passenger stations from liveStationsLb (or 0).
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
  baggageCapacityLb: number;
} {
  const baggageStations = [...(stationRoles?.baggageStations ?? [])].filter((idx) =>
    profile.payload.stations.some((s) => s.index === idx),
  );
  if (baggageStations.length === 0) {
    throw new OfpLoadPlanError(
      'NO_CARGO_STATIONS',
      'No baggage stations mapped for this aircraft — cannot load OFP cargo safely',
    );
  }

  const preserveSet = new Set<number>([
    ...(stationRoles?.crewStations ?? []),
    ...(stationRoles?.serviceStations ?? []),
    ...(stationRoles?.passengerStations ?? []),
  ]);

  const stations: Record<number, number> = {};
  const preservedStations: number[] = [];

  for (const station of profile.payload.stations) {
    if (preserveSet.has(station.index)) {
      const live = liveStationsLb[station.index];
      stations[station.index] = roundLb(
        Number.isFinite(live) ? Math.min(Math.max(0, live!), station.maxLoad) : 0,
      );
      preservedStations.push(station.index);
    } else if (baggageStations.includes(station.index)) {
      stations[station.index] = 0;
    } else {
      // Unknown role: preserve live if present, else zero.
      const live = liveStationsLb[station.index];
      stations[station.index] = roundLb(
        Number.isFinite(live) ? Math.min(Math.max(0, live!), station.maxLoad) : 0,
      );
      if (Number.isFinite(live)) preservedStations.push(station.index);
    }
  }

  const caps = baggageStations.map((idx) => {
    const station = profile.payload.stations.find((s) => s.index === idx)!;
    return { idx, max: station.maxLoad };
  });
  const baggageCapacityLb = caps.reduce((sum, c) => sum + c.max, 0);
  if (cargoLb > baggageCapacityLb + 0.5) {
    throw new OfpLoadPlanError(
      'CARGO_OVER_CAPACITY',
      `Cargo ${roundLb(cargoLb)} lb exceeds baggage station capacity ${roundLb(baggageCapacityLb)} lb`,
    );
  }

  // Proportional fill by maxLoad; largest remainder method for integer lb.
  let assigned = 0;
  const rawShares = caps.map((c) => ({
    idx: c.idx,
    exact: baggageCapacityLb > 0 ? (cargoLb * c.max) / baggageCapacityLb : 0,
  }));
  for (const share of rawShares) {
    const floor = Math.floor(share.exact);
    stations[share.idx] = floor;
    assigned += floor;
  }
  let leftover = roundLb(cargoLb) - assigned;
  const byFrac = rawShares
    .map((s) => ({ idx: s.idx, frac: s.exact - Math.floor(s.exact) }))
    .sort((a, b) => b.frac - a.frac);
  for (const item of byFrac) {
    if (leftover <= 0) break;
    const cap = caps.find((c) => c.idx === item.idx)!.max;
    const cur = stations[item.idx] ?? 0;
    if (cur < cap) {
      stations[item.idx] = cur + 1;
      leftover -= 1;
    }
  }

  const total = Object.values(stations).reduce((a, b) => a + b, 0);
  return { stations, total, preservedStations, baggageStations, baggageCapacityLb };
}

export function buildOfpLoadPlan(input: BuildOfpLoadPlanInput): BuiltOfpLoadPlan {
  const { ofp, profile, stationRoles, liveStationsLb, fuelLbPerGal, cargoKgFallback } = input;

  const sheet = ofp.loadSheet;
  const blockRaw = sheet?.blockFuel ?? ofp.fuel.total;
  if (blockRaw === undefined || !Number.isFinite(blockRaw) || blockRaw < 0) {
    throw new OfpLoadPlanError('NO_BLOCK_FUEL', 'OFP has no block fuel (plan_ramp)');
  }
  const fuelUnitOfp = sheet?.unit ?? ofp.fuel.unit ?? 'kg';
  const blockFuelLb = toLb(blockRaw, fuelUnitOfp);

  const cargoKg = ofpCargoKg(ofp) ?? cargoKgFallback;
  if (cargoKg === undefined || !Number.isFinite(cargoKg) || cargoKg < 0) {
    throw new OfpLoadPlanError('NO_CARGO', 'OFP has no cargo/baggage weight to load');
  }
  const cargoLb = cargoKg * KG_TO_LB;

  const fuel = distributeFuelAcrossTanks(blockFuelLb, profile, fuelLbPerGal);
  const payload = distributeCargoAcrossStations(
    cargoLb,
    profile,
    stationRoles ?? ofp.payload?.stationRoles,
    liveStationsLb,
  );

  return {
    plan: {
      fuel: { tanks: fuel.tanks },
      payload: { stations: payload.stations, total: payload.total },
    },
    blockFuelLb,
    cargoLb,
    fuelUnit: fuel.unit,
    tankCapacityTotal: fuel.capacityTotal,
    baggageCapacityLb: payload.baggageCapacityLb,
    preservedStations: payload.preservedStations,
    baggageStations: payload.baggageStations,
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
