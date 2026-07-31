/**
 * Player hangar — owned aircraft parked at terminals, ferry, mission assignment.
 */

import {
  CAREER_HUB_COORDS,
  routeDistanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import {
  deliverFuelUplift,
  estimateUpliftKg,
  quoteFuelUplift,
  type FuelUpliftQuote,
} from './career-fuel.js';
import type {
  CareerMissionsState,
  CareerMissionsStateV1,
  FreighterClassId,
  MissionFuelUplift,
  MissionIntent,
  PlayerAircraft,
} from './types/career-economy.js';

/** Usable Jet-A capacity by class (career estimate, not MSFS tanks). */
export const PLAYER_FUEL_CAPACITY_KG: Record<FreighterClassId, number> = {
  light_turboprop: 1_010,
  light_ga: 380,
  narrow_freighter: 20_894,
  wide_freighter: 117_450,
};

/** Keep in sync with CAREER_AIRCRAFT_CLASSES.maxRangeNm. */
const MAX_RANGE_NM: Record<FreighterClassId, number> = {
  light_turboprop: 900,
  light_ga: 800,
  narrow_freighter: 2_500,
  wide_freighter: 6_000,
};

/** Ferry fee USD per nm before class multiplier. */
export const FERRY_FEE_USD_PER_NM = 2.5;

const FERRY_CLASS_MULT: Record<FreighterClassId, number> = {
  light_turboprop: 1,
  light_ga: 0.85,
  narrow_freighter: 2.2,
  wide_freighter: 4,
};

export function listCareerHubIcaos(): string[] {
  return Object.keys(CAREER_HUB_COORDS).sort();
}

export const PILOT_NAME_MIN_LEN = 2;
export const PILOT_NAME_MAX_LEN = 40;

export function emptyMissionsStateV2(): CareerMissionsState {
  return {
    version: 2,
    walletUsd: 0,
    missions: [],
    fleet: [],
    hubSelected: false,
    pilotName: '',
    homeHubIcao: '',
  };
}

export function normalizePilotName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, PILOT_NAME_MAX_LEN);
}

export function assertValidPilotName(name: string): string {
  const trimmed = normalizePilotName(name);
  if (trimmed.length < PILOT_NAME_MIN_LEN) {
    throw new Error(
      `Pilot name must be at least ${PILOT_NAME_MIN_LEN} characters`,
    );
  }
  return trimmed;
}

export function normalizeMissionsState(
  raw: CareerMissionsState | CareerMissionsStateV1 | Record<string, unknown>,
): CareerMissionsState {
  const walletUsd =
    typeof raw.walletUsd === 'number' && Number.isFinite(raw.walletUsd)
      ? raw.walletUsd
      : 0;
  const missions = Array.isArray(raw.missions) ? (raw.missions as MissionIntent[]) : [];
  const hubSelectedFlag = Boolean((raw as CareerMissionsState).hubSelected);
  const fleetRaw = Array.isArray((raw as CareerMissionsState).fleet)
    ? (raw as CareerMissionsState).fleet
    : [];
  const fleet = fleetRaw.map(normalizePlayerAircraft).filter(Boolean) as PlayerAircraft[];
  const hubSelected = hubSelectedFlag && fleet.length > 0;
  const pilotName = normalizePilotName((raw as CareerMissionsState).pilotName);
  let homeHubIcao =
    typeof (raw as CareerMissionsState).homeHubIcao === 'string'
      ? String((raw as CareerMissionsState).homeHubIcao).trim().toUpperCase()
      : '';
  if (hubSelected && !homeHubIcao && fleet[0]) {
    homeHubIcao = fleet[0].locationIcao;
  }
  return {
    version: 2,
    walletUsd,
    missions,
    fleet,
    hubSelected,
    pilotName,
    homeHubIcao,
  };
}

function normalizePlayerAircraft(raw: PlayerAircraft): PlayerAircraft | null {
  if (!raw || typeof raw.id !== 'string' || !raw.locationIcao) return null;
  const aircraftClassId = raw.aircraftClassId;
  if (
    aircraftClassId !== 'light_turboprop' &&
    aircraftClassId !== 'light_ga' &&
    aircraftClassId !== 'narrow_freighter' &&
    aircraftClassId !== 'wide_freighter'
  ) {
    return null;
  }
  const capacity =
    typeof raw.fuelCapacityKg === 'number' && raw.fuelCapacityKg > 0
      ? raw.fuelCapacityKg
      : PLAYER_FUEL_CAPACITY_KG[aircraftClassId];
  const fuelKg = Math.max(
    0,
    Math.min(
      capacity,
      typeof raw.fuelKg === 'number' && Number.isFinite(raw.fuelKg) ? raw.fuelKg : 0,
    ),
  );
  return {
    id: raw.id,
    aircraftClassId,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : defaultLabel(aircraftClassId),
    locationIcao: String(raw.locationIcao).trim().toUpperCase(),
    fuelKg,
    fuelCapacityKg: capacity,
    status: raw.status === 'assigned' ? 'assigned' : 'parked',
    assignedMissionId:
      raw.status === 'assigned' && typeof raw.assignedMissionId === 'string'
        ? raw.assignedMissionId
        : undefined,
  };
}

function defaultLabel(aircraftClassId: FreighterClassId): string {
  if (aircraftClassId === 'light_turboprop') return 'Company Caravan';
  if (aircraftClassId === 'light_ga') return 'Company Bonanza';
  if (aircraftClassId === 'narrow_freighter') return 'Company Narrow';
  return 'Company Wide';
}

function defaultAircraftId(aircraftClassId: FreighterClassId): string {
  if (aircraftClassId === 'light_turboprop') return 'acf_caravan_1';
  if (aircraftClassId === 'light_ga') return 'acf_bonanza_1';
  if (aircraftClassId === 'narrow_freighter') return 'acf_narrow_1';
  return 'acf_wide_1';
}

export function findPlayerAircraft(
  state: CareerMissionsState,
  aircraftId: string,
): PlayerAircraft | undefined {
  return state.fleet.find((a) => a.id === aircraftId);
}

export function listParkedAt(
  state: CareerMissionsState,
  icao: string,
): PlayerAircraft[] {
  const hub = icao.trim().toUpperCase();
  return state.fleet.filter(
    (a) => a.status === 'parked' && a.locationIcao === hub,
  );
}

export function primaryParkedAircraft(
  state: CareerMissionsState,
): PlayerAircraft | undefined {
  return state.fleet.find((a) => a.status === 'parked') ?? state.fleet[0];
}

/**
 * First-open: register pilot name and park a starter Caravan at the chosen hub.
 */
export function selectStarterHub(
  state: CareerMissionsState,
  icao: string,
  opts: { pilotName: string },
): CareerMissionsState {
  if (state.hubSelected && state.fleet.length > 0) {
    throw new Error('Starter hub already selected');
  }
  const pilotName = assertValidPilotName(opts.pilotName);
  const hub = icao.trim().toUpperCase();
  if (!CAREER_HUB_COORDS[hub]) {
    throw new Error(`Unknown career hub: ${hub}`);
  }
  const capacity = PLAYER_FUEL_CAPACITY_KG.light_turboprop;
  const starter: PlayerAircraft = {
    id: 'acf_caravan_1',
    aircraftClassId: 'light_turboprop',
    label: 'Company Caravan',
    locationIcao: hub,
    fuelKg: Math.round(capacity * 0.45),
    fuelCapacityKg: capacity,
    status: 'parked',
  };
  return {
    ...state,
    version: 2,
    pilotName,
    homeHubIcao: hub,
    hubSelected: true,
    fleet: [starter],
  };
}

/**
 * Park an additional company aircraft at home hub (or a chosen ICAO).
 * One airframe per class for now — acquiring again is a no-op that returns the existing one.
 */
export function acquireCompanyAircraft(
  state: CareerMissionsState,
  aircraftClassId: FreighterClassId,
  opts?: { locationIcao?: string },
): CareerMissionsState {
  if (!state.hubSelected || state.fleet.length === 0) {
    throw new Error('Select a starter hub before acquiring another aircraft');
  }
  const existing = state.fleet.find((a) => a.aircraftClassId === aircraftClassId);
  if (existing) {
    return state;
  }
  const hub = (
    opts?.locationIcao ??
    state.homeHubIcao ??
    state.fleet.find((a) => a.status === 'parked')?.locationIcao ??
    state.fleet[0]?.locationIcao ??
    ''
  )
    .trim()
    .toUpperCase();
  if (!hub || !CAREER_HUB_COORDS[hub]) {
    throw new Error(`Unknown career hub: ${hub || '(empty)'}`);
  }
  const capacity = PLAYER_FUEL_CAPACITY_KG[aircraftClassId];
  const next: PlayerAircraft = {
    id: defaultAircraftId(aircraftClassId),
    aircraftClassId,
    label: defaultLabel(aircraftClassId),
    locationIcao: hub,
    fuelKg: Math.round(capacity * 0.45),
    fuelCapacityKg: capacity,
    status: 'parked',
  };
  return {
    ...state,
    version: 2,
    fleet: [...state.fleet, next],
  };
}

export function assertAircraftAtOrigin(
  aircraft: PlayerAircraft,
  originIcao: string,
): void {
  const origin = originIcao.trim().toUpperCase();
  if (aircraft.status !== 'parked') {
    throw new Error(
      `Aircraft ${aircraft.id} is assigned to ${aircraft.assignedMissionId ?? 'a mission'}`,
    );
  }
  if (aircraft.locationIcao !== origin) {
    throw new Error(
      `Aircraft ${aircraft.id} is at ${aircraft.locationIcao}, not ${origin} — ferry first`,
    );
  }
}

export function assignAircraftToMission(
  state: CareerMissionsState,
  aircraftId: string,
  missionId: string,
  originIcao: string,
): PlayerAircraft {
  const aircraft = findPlayerAircraft(state, aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  assertAircraftAtOrigin(aircraft, originIcao);
  aircraft.status = 'assigned';
  aircraft.assignedMissionId = missionId;
  return aircraft;
}

export function releaseAircraftOnCancel(
  state: CareerMissionsState,
  mission: MissionIntent,
): PlayerAircraft | undefined {
  const aircraft = mission.aircraftId
    ? findPlayerAircraft(state, mission.aircraftId)
    : state.fleet.find((a) => a.assignedMissionId === mission.id);
  if (!aircraft) return undefined;
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;
  // Stay at origin (never left).
  aircraft.locationIcao = mission.originIcao.toUpperCase();
  return aircraft;
}

export function relocateAircraftOnSettle(
  state: CareerMissionsState,
  mission: MissionIntent,
  world?: CareerEconomyWorld,
  residualFuelKg?: number,
): PlayerAircraft | undefined {
  const aircraft = mission.aircraftId
    ? findPlayerAircraft(state, mission.aircraftId)
    : state.fleet.find((a) => a.assignedMissionId === mission.id);
  if (!aircraft) return undefined;

  if (typeof residualFuelKg === 'number' && Number.isFinite(residualFuelKg)) {
    aircraft.fuelKg = Math.round(
      Math.max(0, Math.min(aircraft.fuelCapacityKg, residualFuelKg)),
    );
  } else {
    let appliedBurn = mission.tripFuelBurnKg;
    if (!(typeof appliedBurn === 'number' && appliedBurn > 0) && world) {
      const distanceNm =
        routeDistanceNm(world, mission.originIcao, mission.destIcao) ?? 0;
      appliedBurn = estimateUpliftKg(aircraft.aircraftClassId, distanceNm);
    }
    if (typeof appliedBurn === 'number' && appliedBurn > 0) {
      aircraft.fuelKg = Math.max(
        0,
        Math.min(aircraft.fuelCapacityKg, aircraft.fuelKg - appliedBurn),
      );
    }
  }

  aircraft.locationIcao = mission.destIcao.toUpperCase();
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;
  return aircraft;
}

/**
 * Player depart uplift: buy only the shortfall vs tank; update tank; record trip burn.
 */
export function applyPlayerDepartFuel(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  mission: MissionIntent,
): {
  mission: MissionIntent;
  fuelDebitUsd: number;
  aircraft?: PlayerAircraft;
} {
  const aircraft = mission.aircraftId
    ? findPlayerAircraft(state, mission.aircraftId)
    : undefined;

  if (!aircraft) {
    // Legacy missions without fleet: full terminal uplift (pre-hangar behaviour).
    return { mission, fuelDebitUsd: 0 };
  }

  if (mission.fuelUplift) {
    return { mission, fuelDebitUsd: 0, aircraft };
  }

  const distanceNm =
    routeDistanceNm(world, mission.originIcao, mission.destIcao) ?? 0;
  const neededKg = estimateUpliftKg(aircraft.aircraftClassId, distanceNm);
  const shortfall = Math.max(0, neededKg - Math.floor(aircraft.fuelKg));

  let fuelDebitUsd = 0;
  let fuelUplift: MissionFuelUplift;
  if (shortfall > 0) {
    const quote = quoteFuelUplift(world, {
      originIcao: mission.originIcao,
      destIcao: mission.destIcao,
      aircraftClassId: aircraft.aircraftClassId,
      requestedKg: shortfall,
      distanceNm,
    });
    fuelUplift = deliverFuelUplift(world, quote);
    fuelDebitUsd = fuelUplift.costUsd;
    aircraft.fuelKg = Math.min(
      aircraft.fuelCapacityKg,
      aircraft.fuelKg + fuelUplift.deliveredKg,
    );
  } else {
    fuelUplift = {
      originIcao: mission.originIcao.toUpperCase(),
      requestedKg: 0,
      deliveredKg: 0,
      unitPriceUsd: 0,
      costUsd: 0,
      scarcity: 'ok',
      upliftedAtTick: world.tick,
    };
  }

  return {
    mission: {
      ...mission,
      fuelUplift,
      tripFuelBurnKg: neededKg,
    },
    fuelDebitUsd,
    aircraft,
  };
}

export interface PlayerMissionOfpFuelQuote {
  aircraftId: string;
  originIcao: string;
  ofpId: string;
  requiredBlockFuelKg: number;
  currentFuelKg: number;
  fuelCapacityKg: number;
  shortfallKg: number;
  authorized: boolean;
  uplift: FuelUpliftQuote;
}

/** Quote the exact tank shortfall against a confirmed SimBrief block-fuel target. */
export function quotePlayerMissionOfpFuel(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  mission: MissionIntent,
  opts: { ofpId: string; requiredBlockFuelKg: number },
): PlayerMissionOfpFuelQuote {
  const aircraft = mission.aircraftId
    ? findPlayerAircraft(state, mission.aircraftId)
    : undefined;
  if (!aircraft) {
    throw new Error(`Mission ${mission.id} has no assigned player aircraft`);
  }
  if (aircraft.locationIcao.toUpperCase() !== mission.originIcao.toUpperCase()) {
    throw new Error(
      `Aircraft ${aircraft.label} is at ${aircraft.locationIcao}, not ${mission.originIcao}`,
    );
  }

  const requiredBlockFuelKg = Math.max(0, Math.ceil(opts.requiredBlockFuelKg));
  if (requiredBlockFuelKg > aircraft.fuelCapacityKg) {
    throw new Error(
      `OFP block fuel ${requiredBlockFuelKg} kg exceeds ${aircraft.label} capacity ${aircraft.fuelCapacityKg} kg`,
    );
  }
  const currentFuelKg = Math.max(
    0,
    Math.min(aircraft.fuelCapacityKg, aircraft.fuelKg),
  );
  const shortfallKg = Math.max(0, requiredBlockFuelKg - Math.floor(currentFuelKg));
  const priced = quoteFuelUplift(world, {
    originIcao: mission.originIcao,
    destIcao: mission.destIcao,
    aircraftClassId: aircraft.aircraftClassId,
    requestedKg: Math.max(1, shortfallKg),
  });
  const uplift: FuelUpliftQuote =
    shortfallKg > 0
      ? priced
      : {
          ...priced,
          requestedKg: 0,
          costUsd: 0,
          scarcity: 'ok',
        };

  return {
    aircraftId: aircraft.id,
    originIcao: mission.originIcao.toUpperCase(),
    ofpId: opts.ofpId,
    requiredBlockFuelKg,
    currentFuelKg,
    fuelCapacityKg: aircraft.fuelCapacityKg,
    shortfallKg,
    authorized: mission.fuelAuthorizedOfpId === opts.ofpId,
    uplift,
  };
}

function mergeFuelUplifts(
  previous: MissionFuelUplift | undefined,
  next: MissionFuelUplift,
): MissionFuelUplift {
  if (!previous) return next;
  const scarcityRank = { ok: 0, partial: 1, dry: 2 } as const;
  return {
    originIcao: next.originIcao,
    requestedKg: previous.requestedKg + next.requestedKg,
    deliveredKg: previous.deliveredKg + next.deliveredKg,
    unitPriceUsd: next.requestedKg > 0 ? next.unitPriceUsd : previous.unitPriceUsd,
    costUsd: previous.costUsd + next.costUsd,
    scarcity:
      scarcityRank[next.scarcity] > scarcityRank[previous.scarcity]
        ? next.scarcity
        : previous.scarcity,
    upliftedAtTick: next.upliftedAtTick,
  };
}

/** Purchase/record OFP fuel once; Depart sees fuelUplift and will not charge again. */
export function purchasePlayerMissionOfpFuel(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  mission: MissionIntent,
  opts: { ofpId: string; requiredBlockFuelKg: number },
): {
  mission: MissionIntent;
  quote: PlayerMissionOfpFuelQuote;
  fuelDebitUsd: number;
  aircraft: PlayerAircraft;
} {
  const quote = quotePlayerMissionOfpFuel(world, state, mission, opts);
  const aircraft = findPlayerAircraft(state, quote.aircraftId);
  if (!aircraft) throw new Error(`Unknown player aircraft ${quote.aircraftId}`);
  if (quote.authorized) {
    return { mission, quote, fuelDebitUsd: 0, aircraft };
  }

  const purchased =
    quote.shortfallKg > 0
      ? deliverFuelUplift(world, quote.uplift)
      : {
          originIcao: quote.originIcao,
          requestedKg: 0,
          deliveredKg: 0,
          unitPriceUsd: quote.uplift.unitPriceUsd,
          costUsd: 0,
          scarcity: 'ok' as const,
          upliftedAtTick: world.tick,
        };
  aircraft.fuelKg = Math.min(
    aircraft.fuelCapacityKg,
    aircraft.fuelKg + purchased.deliveredKg,
  );
  const distanceNm =
    routeDistanceNm(world, mission.originIcao, mission.destIcao) ?? 0;
  const nextMission: MissionIntent = {
    ...mission,
    fuelUplift: mergeFuelUplifts(mission.fuelUplift, purchased),
    fuelAuthorizedOfpId: opts.ofpId,
    tripFuelBurnKg: estimateUpliftKg(aircraft.aircraftClassId, distanceNm),
  };
  return {
    mission: nextMission,
    quote,
    fuelDebitUsd: purchased.costUsd,
    aircraft,
  };
}

export interface FerryQuote {
  aircraftId: string;
  originIcao: string;
  destIcao: string;
  distanceNm: number;
  ferryFeeUsd: number;
  fuelNeededKg: number;
  fuelUpliftKg: number;
  fuelCostUsd: number;
  fuelScarcity: 'ok' | 'partial' | 'dry';
  totalCostUsd: number;
}

export function quoteFerry(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  opts: { aircraftId: string; destIcao: string },
): FerryQuote {
  const aircraft = findPlayerAircraft(state, opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  if (aircraft.status !== 'parked') {
    throw new Error(`Aircraft ${aircraft.id} is not parked`);
  }
  const dest = opts.destIcao.trim().toUpperCase();
  if (!CAREER_HUB_COORDS[dest]) {
    throw new Error(`Unknown career hub: ${dest}`);
  }
  if (dest === aircraft.locationIcao) {
    throw new Error(`Aircraft is already at ${dest}`);
  }
  const distanceNm = routeDistanceNm(world, aircraft.locationIcao, dest);
  if (distanceNm === undefined) {
    throw new Error(`No route distance for ${aircraft.locationIcao}→${dest}`);
  }
  const aircraftClassMax = MAX_RANGE_NM[aircraft.aircraftClassId];
  if (distanceNm > aircraftClassMax) {
    throw new Error(
      `Ferry ${aircraft.locationIcao}→${dest} is ${Math.round(distanceNm)} nm; max range is ${aircraftClassMax} nm`,
    );
  }

  const fuelNeededKg = estimateUpliftKg(aircraft.aircraftClassId, distanceNm);
  const fuelUpliftKg = Math.max(0, fuelNeededKg - Math.floor(aircraft.fuelKg));
  let fuelCostUsd = 0;
  let fuelScarcity: FerryQuote['fuelScarcity'] = 'ok';
  if (fuelUpliftKg > 0) {
    const quote = quoteFuelUplift(world, {
      originIcao: aircraft.locationIcao,
      destIcao: dest,
      aircraftClassId: aircraft.aircraftClassId,
      requestedKg: fuelUpliftKg,
      distanceNm,
    });
    fuelCostUsd = quote.costUsd;
    fuelScarcity = quote.scarcity;
  }

  const ferryFeeUsd = Math.max(
    50,
    Math.round(distanceNm * FERRY_FEE_USD_PER_NM * FERRY_CLASS_MULT[aircraft.aircraftClassId]),
  );
  return {
    aircraftId: aircraft.id,
    originIcao: aircraft.locationIcao,
    destIcao: dest,
    distanceNm,
    ferryFeeUsd,
    fuelNeededKg,
    fuelUpliftKg,
    fuelCostUsd,
    fuelScarcity,
    totalCostUsd: ferryFeeUsd + fuelCostUsd,
  };
}

export function executeFerry(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  opts: { aircraftId: string; destIcao: string },
): {
  aircraft: PlayerAircraft;
  quote: FerryQuote;
  walletDebitUsd: number;
} {
  const quote = quoteFerry(world, state, opts);
  if (state.walletUsd < quote.totalCostUsd) {
    throw new Error(
      `Ferry costs $${quote.totalCostUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  const aircraft = findPlayerAircraft(state, opts.aircraftId)!;

  if (quote.fuelUpliftKg > 0) {
    const fuelQuote = quoteFuelUplift(world, {
      originIcao: aircraft.locationIcao,
      destIcao: quote.destIcao,
      aircraftClassId: aircraft.aircraftClassId,
      requestedKg: quote.fuelUpliftKg,
      distanceNm: quote.distanceNm,
    });
    const uplift = deliverFuelUplift(world, fuelQuote);
    aircraft.fuelKg = Math.min(
      aircraft.fuelCapacityKg,
      aircraft.fuelKg + uplift.deliveredKg,
    );
  }

  aircraft.fuelKg = Math.max(
    0,
    Math.min(aircraft.fuelCapacityKg, aircraft.fuelKg - quote.fuelNeededKg),
  );
  aircraft.locationIcao = quote.destIcao;
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;

  state.walletUsd = Math.round((state.walletUsd - quote.totalCostUsd) * 100) / 100;

  return {
    aircraft,
    quote,
    walletDebitUsd: quote.totalCostUsd,
  };
}
