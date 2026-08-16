/**
 * Player hangar — owned aircraft parked at terminals, ferry, mission assignment.
 */

import {
  CAREER_HUB_COORDS,
  routeDistanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import { assertFerryNotBush, isBushHub, isBushTripOnlyHub } from './career-bush.js';
import { normalizeActiveBushTrip } from './career-bush-mission.js';
import {
  deliverFuelUplift,
  estimateUpliftKg,
  quoteFuelUplift,
  type FuelUpliftQuote,
} from './career-fuel.js';
import {
  hubDistanceNm,
  isFerryRouteWaypoint,
} from './career-ferry-route.js';
import { fboServiceCostMult } from './career-fbo-perks.js';
import {
  ensureAircraftConditionPcts,
  INSPECTION_INTERVAL_HOURS,
} from './career-aircraft-maintenance.js';
import { applyWalletDelta, normalizeCareerLedger } from './career-ledger.js';
import { normalizeCareerCargoOps } from './career-cargo-ops.js';
import { normalizeGroundStaffState } from './career-ground-staff.js';
import { normalizePlayerWarehouseState } from './career-warehouse-stock.js';
import {
  normalizeCareerClassOps,
  syncClassOpsFromFleet,
} from './career-class-ops.js';
import { normalizeCompanyCredit } from './career-company-credit.js';
import {
  assertPilotAtIcao,
  resolvePilotIcao,
  syncPilotIcaoTo,
} from './career-pilot-travel.js';
import {
  defaultCareerPlayerAirframe,
  findCareerPlayerAirframe,
  isStarterAirframeCondition,
  listStarterCareerPlayerAirframes,
  resolveAirframeMaxRangeNm,
  type StarterAirframeCondition,
} from './career-player-airframes.js';
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
  light_jet: 2_810,
  medium_piston: 8_800,
  narrow_freighter: 20_894,
  wide_freighter: 117_450,
};

/** Prefer airframe catalog tank when present; else class planning capacity. */
export function resolvePlayerFuelCapacityKg(
  airframeTypeId: string | null | undefined,
  aircraftClassId: FreighterClassId,
): number {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  if (
    typeof airframe?.fuelCapacityKg === 'number' &&
    Number.isFinite(airframe.fuelCapacityKg) &&
    airframe.fuelCapacityKg > 0
  ) {
    return Math.round(airframe.fuelCapacityKg);
  }
  return PLAYER_FUEL_CAPACITY_KG[aircraftClassId];
}

/** Ferry fee USD per nm before class multiplier. */
export const FERRY_FEE_USD_PER_NM = 2.5;

/**
 * First this many career ferry nm pay a reduced fee (early soft landing).
 * After the budget is used, full FERRY_FEE_USD_PER_NM applies.
 */
export const FERRY_SOFT_NM_BUDGET = 3_000;

/** Multiplier on the soft-budget portion of ferry fees (0.3 = 70% off). */
export const FERRY_SOFT_FEE_MULT = 0.3;

export const FERRY_CLASS_MULT: Record<FreighterClassId, number> = {
  light_turboprop: 1,
  light_ga: 0.85,
  light_jet: 1.5,
  medium_piston: 1.9,
  narrow_freighter: 2.2,
  wide_freighter: 4,
};

/** Dealer delivery vs self-ferry: $/nm × class mult, capped for early buys. */
export const AIRCRAFT_DELIVERY_USD_PER_NM = 0.55;
export const AIRCRAFT_DELIVERY_MIN_USD = 200;
export const AIRCRAFT_DELIVERY_MAX_USD = 2_500;

export function listCareerHubIcaos(): string[] {
  return Object.keys(CAREER_HUB_COORDS).sort();
}

export const PILOT_NAME_MIN_LEN = 2;
export const PILOT_NAME_MAX_LEN = 40;

/** Wallet credited when a new pilot registers (tight — early contract fees matter). */
export const STARTER_WALLET_USD = 1_000;

/** Registered with empty hangar — fly crew offers until first buy/lease. */
export function isContractPilotCareer(state: CareerMissionsState): boolean {
  return state.hubSelected === true && state.fleet.length === 0;
}

export function emptyMissionsStateV2(): CareerMissionsState {
  return {
    version: 2,
    walletUsd: 0,
    missions: [],
    fleet: [],
    hubSelected: false,
    pilotName: '',
    homeHubIcao: '',
    pilotIcao: '',
    aircraftMarket: [],
    aircraftMarketDay: undefined,
    aircraftMarketDemandDay: undefined,
    ledger: [],
    cargoOps: normalizeCareerCargoOps(undefined),
    classOps: normalizeCareerClassOps(undefined),
    companyCredit: normalizeCompanyCredit(undefined),
    playerFbos: { fbos: [], holds: [], stock: [] },
    companyCrew: { members: [] },
    groundStaff: { members: [] },
    portPickups: [],
    playerWarehouses: { warehouses: [], stock: [], inboundTransfers: [] },
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
  const pilotName = normalizePilotName((raw as CareerMissionsState).pilotName);
  let homeHubIcao =
    typeof (raw as CareerMissionsState).homeHubIcao === 'string'
      ? String((raw as CareerMissionsState).homeHubIcao).trim().toUpperCase()
      : '';
  if (hubSelectedFlag && !homeHubIcao && fleet[0]) {
    homeHubIcao = fleet[0].locationIcao;
  }
  // Contract pilots register with an empty hangar; owners keep fleet.
  const hubSelected =
    hubSelectedFlag &&
    (fleet.length > 0 || (Boolean(pilotName) && Boolean(homeHubIcao)));
  const pilotIcao = resolvePilotIcao(
    (raw as CareerMissionsState).pilotIcao,
    homeHubIcao,
    fleet,
  );
  const aircraftMarket = Array.isArray(
    (raw as CareerMissionsState).aircraftMarket,
  )
    ? (raw as CareerMissionsState).aircraftMarket
    : [];
  const aircraftMarketDay =
    typeof (raw as CareerMissionsState).aircraftMarketDay === 'number'
      ? (raw as CareerMissionsState).aircraftMarketDay
      : undefined;
  const aircraftMarketDemandDay =
    typeof (raw as CareerMissionsState).aircraftMarketDemandDay === 'number'
      ? (raw as CareerMissionsState).aircraftMarketDemandDay
      : undefined;
  const ledger = normalizeCareerLedger((raw as CareerMissionsState).ledger);
  const airframePerfOverrides = normalizeAirframePerfOverrides(
    (raw as CareerMissionsState).airframePerfOverrides,
  );
  const cargoOps = normalizeCareerCargoOps(
    (raw as CareerMissionsState).cargoOps,
  );
  const classOps = syncClassOpsFromFleet(
    normalizeCareerClassOps((raw as CareerMissionsState).classOps),
    fleet,
  );
  const companyCredit = normalizeCompanyCredit(
    (raw as CareerMissionsState).companyCredit,
  );
  // Full sanitize happens in ensurePlayerFbos / career-fbo ops (avoids fleet↔mission cycle).
  const playerFbosRaw = (raw as CareerMissionsState).playerFbos;
  const playerFbos =
    playerFbosRaw &&
    typeof playerFbosRaw === 'object' &&
    Array.isArray(playerFbosRaw.fbos) &&
    Array.isArray(playerFbosRaw.holds)
      ? {
          fbos: playerFbosRaw.fbos,
          holds: playerFbosRaw.holds,
          // Spot inventory removed — always wipe on load (plan 1B).
          stock: [],
        }
      : { fbos: [], holds: [], stock: [] };
  const playerWarehousesRaw = (raw as CareerMissionsState).playerWarehouses;
  const playerWarehouses = normalizePlayerWarehouseState(playerWarehousesRaw);
  // Full sanitize in ensureCompanyCrew / career-crew ops.
  const companyCrewRaw = (raw as CareerMissionsState).companyCrew;
  const companyCrew =
    companyCrewRaw &&
    typeof companyCrewRaw === 'object' &&
    Array.isArray(companyCrewRaw.members)
      ? {
          members: companyCrewRaw.members,
          ...(Array.isArray(companyCrewRaw.hirePool)
            ? { hirePool: companyCrewRaw.hirePool }
            : {}),
          ...(typeof companyCrewRaw.hirePoolDay === 'number'
            ? { hirePoolDay: companyCrewRaw.hirePoolDay }
            : {}),
          ...(typeof companyCrewRaw.hirePoolIcao === 'string'
            ? { hirePoolIcao: companyCrewRaw.hirePoolIcao }
            : {}),
        }
      : { members: [] };
  const groundStaff = normalizeGroundStaffState(
    (raw as CareerMissionsState).groundStaff,
  );
  const ferrySoftRaw = (raw as CareerMissionsState).ferrySoftNmUsed;
  const ferrySoftNmUsed =
    typeof ferrySoftRaw === 'number' && Number.isFinite(ferrySoftRaw)
      ? Math.max(0, Math.round(ferrySoftRaw))
      : 0;
  const activeBushTrip = normalizeActiveBushTripField(
    (raw as CareerMissionsState).activeBushTrip,
  );
  return {
    version: 2,
    walletUsd,
    missions,
    fleet,
    hubSelected,
    pilotName,
    homeHubIcao,
    pilotIcao,
    aircraftMarket,
    aircraftMarketDay,
    aircraftMarketDemandDay,
    ledger,
    cargoOps,
    classOps,
    companyCredit,
    playerFbos,
    companyCrew,
    groundStaff,
    ferrySoftNmUsed,
    portPickups: Array.isArray((raw as CareerMissionsState).portPickups)
      ? (raw as CareerMissionsState).portPickups
      : [],
    playerWarehouses,
    ...(activeBushTrip ? { activeBushTrip } : {}),
    ...(airframePerfOverrides
      ? { airframePerfOverrides }
      : {}),
  };
}

function normalizeActiveBushTripField(
  raw: CareerMissionsState['activeBushTrip'] | unknown,
): CareerMissionsState['activeBushTrip'] {
  return normalizeActiveBushTrip(raw);
}

function normalizeAirframePerfOverrides(
  raw: CareerMissionsState['airframePerfOverrides'],
): CareerMissionsState['airframePerfOverrides'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<CareerMissionsState['airframePerfOverrides']> = {};
  for (const [typeId, row] of Object.entries(raw)) {
    if (!typeId.trim() || !row || typeof row !== 'object') continue;
    const next: NonNullable<CareerMissionsState['airframePerfOverrides']>[string] =
      {};
    if (
      typeof row.cruiseFuelFlowKgPerHour === 'number' &&
      Number.isFinite(row.cruiseFuelFlowKgPerHour) &&
      row.cruiseFuelFlowKgPerHour > 0
    ) {
      next.cruiseFuelFlowKgPerHour =
        Math.round(row.cruiseFuelFlowKgPerHour * 10) / 10;
    }
    if (
      typeof row.cruiseSpeedKt === 'number' &&
      Number.isFinite(row.cruiseSpeedKt) &&
      row.cruiseSpeedKt > 0
    ) {
      next.cruiseSpeedKt = Math.round(row.cruiseSpeedKt);
    }
    if (
      typeof row.fuelBurnKgPerNm === 'number' &&
      Number.isFinite(row.fuelBurnKgPerNm) &&
      row.fuelBurnKgPerNm > 0
    ) {
      next.fuelBurnKgPerNm = Math.round(row.fuelBurnKgPerNm * 1000) / 1000;
    }
    if (typeof row.updatedAtIso === 'string' && row.updatedAtIso.trim()) {
      next.updatedAtIso = row.updatedAtIso.trim();
    }
    if (
      typeof row.sampleCount === 'number' &&
      Number.isFinite(row.sampleCount) &&
      row.sampleCount > 0
    ) {
      next.sampleCount = Math.floor(row.sampleCount);
    }
    if (
      next.cruiseFuelFlowKgPerHour != null ||
      next.cruiseSpeedKt != null ||
      next.fuelBurnKgPerNm != null
    ) {
      out[typeId] = next;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizePlayerAircraft(raw: PlayerAircraft): PlayerAircraft | null {
  if (!raw || typeof raw.id !== 'string' || !raw.locationIcao) return null;
  const aircraftClassId = raw.aircraftClassId;
  if (
    aircraftClassId !== 'light_turboprop' &&
    aircraftClassId !== 'light_ga' &&
    aircraftClassId !== 'light_jet' &&
    aircraftClassId !== 'medium_piston' &&
    aircraftClassId !== 'narrow_freighter' &&
    aircraftClassId !== 'wide_freighter'
  ) {
    return null;
  }
  const airframe =
    findCareerPlayerAirframe(raw.airframeTypeId) ??
    defaultCareerPlayerAirframe(aircraftClassId);
  const catalogCap = resolvePlayerFuelCapacityKg(
    airframe?.typeId ?? raw.airframeTypeId,
    aircraftClassId,
  );
  // Catalog is SoT for known airframes (wing-tank restores, homologation bumps).
  const capacity = catalogCap;
  const fuelKg = Math.max(
    0,
    Math.min(
      capacity,
      typeof raw.fuelKg === 'number' && Number.isFinite(raw.fuelKg) ? raw.fuelKg : 0,
    ),
  );
  const status =
    raw.status === 'assigned'
      ? 'assigned'
      : raw.status === 'maintenance'
        ? 'maintenance'
        : raw.status === 'listed'
          ? 'listed'
          : raw.status === 'leased_out'
            ? 'leased_out'
            : 'parked';
  const ownership =
    raw.ownership === 'leased' || raw.ownership === 'owned'
      ? raw.ownership
      : 'owned';
  const condition =
    raw.condition === 'excellent' ||
    raw.condition === 'good' ||
    raw.condition === 'fair' ||
    raw.condition === 'tired'
      ? raw.condition
      : 'good';
  const normalized: PlayerAircraft = {
    id: raw.id,
    aircraftClassId,
    airframeTypeId: airframe?.typeId,
    label:
      airframe?.label ??
      (typeof raw.label === 'string' && raw.label.trim()
        ? raw.label
        : defaultLabel(aircraftClassId)),
    locationIcao: String(raw.locationIcao).trim().toUpperCase(),
    fuelKg,
    fuelCapacityKg: capacity,
    status,
    assignedMissionId:
      status === 'assigned' && typeof raw.assignedMissionId === 'string'
        ? raw.assignedMissionId
        : undefined,
    ownership,
    condition,
    hoursAirframe:
      typeof raw.hoursAirframe === 'number' && Number.isFinite(raw.hoursAirframe)
        ? Math.max(0, raw.hoursAirframe)
        : 0,
    hoursEngine:
      typeof raw.hoursEngine === 'number' && Number.isFinite(raw.hoursEngine)
        ? Math.max(0, raw.hoursEngine)
        : 0,
    maintenanceDueAtHours:
      typeof raw.maintenanceDueAtHours === 'number' &&
      Number.isFinite(raw.maintenanceDueAtHours)
        ? raw.maintenanceDueAtHours
        : undefined,
    lease:
      raw.lease &&
      typeof raw.lease.monthlyUsd === 'number' &&
      typeof raw.lease.nextDueTick === 'number' &&
      typeof raw.lease.termEndsTick === 'number'
        ? {
            monthlyUsd: raw.lease.monthlyUsd,
            nextDueTick: raw.lease.nextDueTick,
            termEndsTick: raw.lease.termEndsTick,
            buyoutUsd:
              typeof raw.lease.buyoutUsd === 'number'
                ? raw.lease.buyoutUsd
                : undefined,
            listingId:
              typeof raw.lease.listingId === 'string'
                ? raw.lease.listingId
                : undefined,
          }
        : undefined,
    leaseOverdue: Boolean(raw.leaseOverdue),
    listedListingId:
      status === 'listed' && typeof raw.listedListingId === 'string'
        ? raw.listedListingId
        : undefined,
    leaseOut:
      raw.leaseOut &&
      typeof raw.leaseOut.monthlyUsd === 'number' &&
      typeof raw.leaseOut.termEndsTick === 'number' &&
      typeof raw.leaseOut.nextDueTick === 'number' &&
      typeof raw.leaseOut.depositUsd === 'number'
        ? {
            monthlyUsd: raw.leaseOut.monthlyUsd,
            nextDueTick: raw.leaseOut.nextDueTick,
            termEndsTick: raw.leaseOut.termEndsTick,
            depositUsd: raw.leaseOut.depositUsd,
            listingId:
              typeof raw.leaseOut.listingId === 'string'
                ? raw.leaseOut.listingId
                : undefined,
            lesseeNpcId:
              typeof raw.leaseOut.lesseeNpcId === 'string'
                ? raw.leaseOut.lesseeNpcId
                : undefined,
            lesseeName:
              typeof raw.leaseOut.lesseeName === 'string'
                ? raw.leaseOut.lesseeName
                : undefined,
            startedAtTick:
              typeof raw.leaseOut.startedAtTick === 'number'
                ? raw.leaseOut.startedAtTick
                : raw.leaseOut.nextDueTick - 96 * 30,
            lastWearTick:
              typeof raw.leaseOut.lastWearTick === 'number'
                ? raw.leaseOut.lastWearTick
                : typeof raw.leaseOut.startedAtTick === 'number'
                  ? raw.leaseOut.startedAtTick
                  : raw.leaseOut.nextDueTick - 96 * 30,
          }
        : undefined,
    airframeConditionPct:
      typeof raw.airframeConditionPct === 'number' &&
      Number.isFinite(raw.airframeConditionPct)
        ? raw.airframeConditionPct
        : undefined,
    engineConditionPct:
      typeof raw.engineConditionPct === 'number' &&
      Number.isFinite(raw.engineConditionPct)
        ? raw.engineConditionPct
        : undefined,
    hoursSinceInspection:
      typeof raw.hoursSinceInspection === 'number' &&
      Number.isFinite(raw.hoursSinceInspection)
        ? Math.max(0, raw.hoursSinceInspection)
        : undefined,
  };
  ensureAircraftConditionPcts(normalized);
  return normalized;
}

function defaultLabel(aircraftClassId: FreighterClassId): string {
  if (aircraftClassId === 'light_turboprop') return 'Company Caravan';
  if (aircraftClassId === 'light_ga') return 'Company Bonanza';
  if (aircraftClassId === 'light_jet') return 'Company Light Jet';
  if (aircraftClassId === 'medium_piston') return 'Company DC-6';
  if (aircraftClassId === 'narrow_freighter') return 'Company Narrow';
  return 'Company Wide';
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
 * First-open: register pilot name + home hub.
 * Starts as contract pilot with an empty hangar — buy/lease from the Aircraft
 * Market later. Optional `airframeTypeId` parks a light starter (tests / legacy).
 */
export function selectStarterHub(
  state: CareerMissionsState,
  icao: string,
  opts: {
    pilotName: string;
    /** When set, park this light starter (tests / legacy signup). */
    airframeTypeId?: string;
    /** Test override only — production always rolls good/excellent. */
    condition?: StarterAirframeCondition;
  },
): CareerMissionsState {
  if (state.hubSelected) {
    throw new Error('Starter hub already selected');
  }
  const pilotName = assertValidPilotName(opts.pilotName);
  const hub = icao.trim().toUpperCase();
  if (!CAREER_HUB_COORDS[hub]) {
    throw new Error(`Unknown career hub: ${hub}`);
  }
  if (isBushHub(hub) || isBushTripOnlyHub(hub)) {
    throw new Error(
      `Bush strip ${hub} cannot be a home hub — pick a network airport`,
    );
  }

  const requested = opts.airframeTypeId?.trim();
  if (!requested) {
    return {
      ...state,
      version: 2,
      walletUsd: STARTER_WALLET_USD,
      pilotName,
      homeHubIcao: hub,
      pilotIcao: hub,
      hubSelected: true,
      fleet: [],
    };
  }

  const starters = listStarterCareerPlayerAirframes();
  const starterAirframe = findCareerPlayerAirframe(requested);
  if (
    !starterAirframe ||
    !starters.some((row) => row.typeId === starterAirframe.typeId)
  ) {
    throw new Error(
      `Starter aircraft must be C152, C172, or Commander 114 (got ${requested})`,
    );
  }

  const condition: StarterAirframeCondition = isStarterAirframeCondition(
    opts.condition,
  )
    ? opts.condition
    : Math.random() < 0.5
      ? 'good'
      : 'excellent';
  const wear =
    condition === 'excellent'
      ? {
          hoursAirframe: 12,
          hoursEngine: 10,
          airframeConditionPct: 94,
          engineConditionPct: 96,
          hoursSinceInspection: 12,
        }
      : {
          hoursAirframe: 40,
          hoursEngine: 35,
          airframeConditionPct: 88,
          engineConditionPct: 92,
          hoursSinceInspection: 40,
        };

  const capacity = resolvePlayerFuelCapacityKg(
    starterAirframe.typeId,
    starterAirframe.aircraftClassId,
  );
  const interval = INSPECTION_INTERVAL_HOURS[starterAirframe.aircraftClassId];
  const stem = starterAirframe.typeId.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const starter: PlayerAircraft = {
    id: `acf_${stem}_1`,
    aircraftClassId: starterAirframe.aircraftClassId,
    airframeTypeId: starterAirframe.typeId,
    label: starterAirframe.label,
    locationIcao: hub,
    fuelKg: Math.round(capacity * 0.45),
    fuelCapacityKg: capacity,
    status: 'parked',
    ownership: 'owned',
    condition,
    hoursAirframe: wear.hoursAirframe,
    hoursEngine: wear.hoursEngine,
    airframeConditionPct: wear.airframeConditionPct,
    engineConditionPct: wear.engineConditionPct,
    hoursSinceInspection: wear.hoursSinceInspection,
    maintenanceDueAtHours: interval,
  };
  ensureAircraftConditionPcts(starter);
  return {
    ...state,
    version: 2,
    walletUsd: STARTER_WALLET_USD,
    pilotName,
    homeHubIcao: hub,
    pilotIcao: hub,
    hubSelected: true,
    fleet: [starter],
  };
}

/**
 * @deprecated Free acquire removed — use the Aircraft Market
 * (`purchaseAircraftListing` / `signAircraftLease`).
 */
export function acquireCompanyAircraft(
  _state: CareerMissionsState,
  _aircraftClassId: FreighterClassId,
  _opts?: { locationIcao?: string },
): CareerMissionsState {
  throw new Error(
    'Free aircraft acquire is disabled — buy or lease from the Aircraft Market',
  );
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

/** Aircraft parked at origin and pilot co-located for dispatch. */
export function assertPilotWithAircraftAtOrigin(
  state: CareerMissionsState,
  aircraft: PlayerAircraft,
  originIcao: string,
): void {
  assertAircraftAtOrigin(aircraft, originIcao);
  assertPilotAtIcao(state, originIcao);
}

export function assignAircraftToMission(
  state: CareerMissionsState,
  aircraftId: string,
  missionId: string,
  originIcao: string,
  opts: { requirePilotAtOrigin?: boolean } = {},
): PlayerAircraft {
  const aircraft = findPlayerAircraft(state, aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (aircraft.status === 'maintenance') {
    throw new Error(
      `Aircraft ${aircraft.id} is in maintenance — clear the shop visit first`,
    );
  }
  if (aircraft.status === 'listed') {
    throw new Error(
      `Aircraft ${aircraft.id} is listed on the Aircraft Market — unlist first`,
    );
  }
  if (aircraft.status === 'leased_out') {
    throw new Error(
      `Aircraft ${aircraft.id} is leased out to the market`,
    );
  }
  if (aircraft.leaseOverdue) {
    throw new Error(`Aircraft ${aircraft.id} has an overdue lease payment`);
  }
  const requirePilot = opts.requirePilotAtOrigin !== false;
  if (requirePilot) {
    assertPilotWithAircraftAtOrigin(state, aircraft, originIcao);
  } else {
    assertAircraftAtOrigin(aircraft, originIcao);
  }
  aircraft.status = 'assigned';
  aircraft.assignedMissionId = missionId;
  return aircraft;
}

/** Resolve the hangar airframe for a mission — by id, then by assignment. */
export function findMissionAircraft(
  state: CareerMissionsState,
  mission: Pick<MissionIntent, 'id' | 'aircraftId'>,
): PlayerAircraft | undefined {
  if (mission.aircraftId) {
    const byId = findPlayerAircraft(state, mission.aircraftId);
    if (byId) return byId;
  }
  return state.fleet.find((a) => a.assignedMissionId === mission.id);
}

export function releaseAircraftOnCancel(
  state: CareerMissionsState,
  mission: MissionIntent,
): PlayerAircraft | undefined {
  const aircraft = findMissionAircraft(state, mission);
  if (!aircraft) return undefined;
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;
  // Stay at origin (never left).
  aircraft.locationIcao = mission.originIcao.toUpperCase();
  if (mission.crewOperated !== true) {
    syncPilotIcaoTo(state, aircraft.locationIcao);
  }
  return aircraft;
}

export function relocateAircraftOnSettle(
  state: CareerMissionsState,
  mission: MissionIntent,
  world?: CareerEconomyWorld,
  residualFuelKg?: number,
): PlayerAircraft | undefined {
  const aircraft = findMissionAircraft(state, mission);
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
  aircraft.assignedMissionId = undefined;
  // Company crew flies the airframe; the player's hub position stays put.
  if (mission.crewOperated !== true) {
    syncPilotIcaoTo(state, aircraft.locationIcao);
  }
  const due =
    aircraft.maintenanceDueAtHours ??
    INSPECTION_INTERVAL_HOURS[aircraft.aircraftClassId];
  if ((aircraft.hoursAirframe ?? 0) >= due) {
    aircraft.status = 'maintenance';
  } else {
    aircraft.status = 'parked';
  }
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
      costMult: fboServiceCostMult(state, mission.originIcao),
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
  aircraftId?: string;
  originIcao: string;
  ofpId: string;
  requiredBlockFuelKg: number;
  currentFuelKg: number;
  fuelCapacityKg: number;
  shortfallKg: number;
  authorized: boolean;
  uplift: FuelUpliftQuote;
  /** Operator covers Jet-A — no player tank / wallet. */
  contractPilot?: boolean;
}

/** Quote the exact tank shortfall against a confirmed SimBrief block-fuel target. */
export function quotePlayerMissionOfpFuel(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  mission: MissionIntent,
  opts: { ofpId: string; requiredBlockFuelKg: number },
): PlayerMissionOfpFuelQuote {
  if (mission.contractPilot) {
    const requiredBlockFuelKg = Math.max(0, Math.ceil(opts.requiredBlockFuelKg));
    const priced = quoteFuelUplift(world, {
      originIcao: mission.originIcao,
      destIcao: mission.destIcao,
      aircraftClassId: mission.aircraftClassId as FreighterClassId,
      requestedKg: Math.max(1, requiredBlockFuelKg),
    });
    return {
      originIcao: mission.originIcao.toUpperCase(),
      ofpId: opts.ofpId,
      requiredBlockFuelKg,
      currentFuelKg: requiredBlockFuelKg,
      fuelCapacityKg: requiredBlockFuelKg,
      shortfallKg: 0,
      authorized: mission.fuelAuthorizedOfpId === opts.ofpId,
      contractPilot: true,
      uplift: {
        ...priced,
        requestedKg: 0,
        costUsd: 0,
        scarcity: 'ok',
      },
    };
  }
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
  assertPilotAtIcao(state, mission.originIcao);

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
    costMult: fboServiceCostMult(state, mission.originIcao),
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
  aircraft?: PlayerAircraft;
} {
  const quote = quotePlayerMissionOfpFuel(world, state, mission, opts);
  if (quote.contractPilot || mission.contractPilot) {
    if (quote.authorized) {
      return { mission, quote, fuelDebitUsd: 0 };
    }
    return {
      mission: {
        ...mission,
        fuelAuthorizedOfpId: opts.ofpId,
      },
      quote: { ...quote, authorized: true },
      fuelDebitUsd: 0,
    };
  }
  const aircraft = quote.aircraftId
    ? findPlayerAircraft(state, quote.aircraftId)
    : undefined;
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
  /** nm of this leg charged at the early soft rate. */
  softNmApplied: number;
  /** Soft-budget nm still available after this quote (if executed). */
  softNmRemaining: number;
  /** Full-rate fee without soft discount (for UI comparison). */
  fullRateFeeUsd: number;
  fuelNeededKg: number;
  fuelUpliftKg: number;
  fuelCostUsd: number;
  fuelScarcity: 'ok' | 'partial' | 'dry';
  totalCostUsd: number;
}

/** Split a ferry distance across the early soft-fee budget. */
export function computeFerryFeeUsd(opts: {
  distanceNm: number;
  aircraftClassId: FreighterClassId;
  ferrySoftNmUsed?: number;
}): {
  ferryFeeUsd: number;
  softNmApplied: number;
  softNmRemaining: number;
  fullRateFeeUsd: number;
} {
  const distanceNm = Math.max(0, opts.distanceNm);
  const used = Math.max(0, opts.ferrySoftNmUsed ?? 0);
  const softLeft = Math.max(0, FERRY_SOFT_NM_BUDGET - used);
  const softNmApplied = Math.min(distanceNm, softLeft);
  const hardNm = Math.max(0, distanceNm - softNmApplied);
  const rate =
    FERRY_FEE_USD_PER_NM * FERRY_CLASS_MULT[opts.aircraftClassId];
  const softPart = softNmApplied * rate * FERRY_SOFT_FEE_MULT;
  const hardPart = hardNm * rate;
  const minFee = softNmApplied > 0 && hardNm <= 0 ? 25 : 50;
  const ferryFeeUsd = Math.max(minFee, Math.round(softPart + hardPart));
  const fullRateFeeUsd = Math.max(50, Math.round(distanceNm * rate));
  return {
    ferryFeeUsd,
    softNmApplied,
    softNmRemaining: Math.max(0, softLeft - softNmApplied),
    fullRateFeeUsd,
  };
}

/** Jet-A $/kg when ferrying from a stepping-stone (no terminal inventory). */
const FERRY_WAYPOINT_FUEL_USD_PER_KG = 1.35;

function isKnownFerryPoint(icao: string): boolean {
  const code = icao.trim().toUpperCase();
  return Boolean(CAREER_HUB_COORDS[code]) || isFerryRouteWaypoint(code);
}

export function isCareerHubIcao(icao: string | null | undefined): boolean {
  if (!icao) return false;
  return Boolean(CAREER_HUB_COORDS[icao.trim().toUpperCase()]);
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
  if (!isKnownFerryPoint(dest)) {
    throw new Error(`Unknown career hub: ${dest}`);
  }
  if (dest === aircraft.locationIcao) {
    throw new Error(`Aircraft is already at ${dest}`);
  }
  const origin = aircraft.locationIcao.trim().toUpperCase();
  assertFerryNotBush(origin, dest);
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
      `Ferry ${origin}→${dest} is ${Math.round(distanceNm)} nm; max range is ${maxRangeNm} nm`,
    );
  }

  const fuelNeededKg = estimateUpliftKg(aircraft.aircraftClassId, distanceNm);
  const fuelUpliftKg = Math.max(0, fuelNeededKg - Math.floor(aircraft.fuelKg));
  let fuelCostUsd = 0;
  let fuelScarcity: FerryQuote['fuelScarcity'] = 'ok';
  if (fuelUpliftKg > 0) {
    if (
      isFerryRouteWaypoint(origin) ||
      !world.airports.some((a) => a.icao === origin)
    ) {
      fuelCostUsd = Math.max(
        0,
        Math.round(fuelUpliftKg * FERRY_WAYPOINT_FUEL_USD_PER_KG),
      );
      fuelScarcity = 'ok';
    } else {
      const quote = quoteFuelUplift(world, {
        originIcao: origin,
        destIcao: dest,
        aircraftClassId: aircraft.aircraftClassId,
        requestedKg: fuelUpliftKg,
        distanceNm,
        costMult: fboServiceCostMult(state, origin),
      });
      fuelCostUsd = quote.costUsd;
      fuelScarcity = quote.scarcity;
    }
  }

  const fee = computeFerryFeeUsd({
    distanceNm,
    aircraftClassId: aircraft.aircraftClassId,
    ferrySoftNmUsed: state.ferrySoftNmUsed,
  });
  return {
    aircraftId: aircraft.id,
    originIcao: origin,
    destIcao: dest,
    distanceNm,
    ferryFeeUsd: fee.ferryFeeUsd,
    softNmApplied: fee.softNmApplied,
    softNmRemaining: fee.softNmRemaining,
    fullRateFeeUsd: fee.fullRateFeeUsd,
    fuelNeededKg,
    fuelUpliftKg,
    fuelCostUsd,
    fuelScarcity,
    totalCostUsd: fee.ferryFeeUsd + fuelCostUsd,
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
    if (
      isFerryRouteWaypoint(aircraft.locationIcao) ||
      !world.airports.some((a) => a.icao === aircraft.locationIcao)
    ) {
      // Stepping-stone: wallet already includes flat fuel in quote; top up tanks.
      aircraft.fuelKg = Math.min(
        aircraft.fuelCapacityKg,
        aircraft.fuelKg + quote.fuelUpliftKg,
      );
    } else {
      const fuelQuote = quoteFuelUplift(world, {
        originIcao: aircraft.locationIcao,
        destIcao: quote.destIcao,
        aircraftClassId: aircraft.aircraftClassId,
        requestedKg: quote.fuelUpliftKg,
        distanceNm: quote.distanceNm,
        costMult: fboServiceCostMult(state, aircraft.locationIcao),
      });
      const uplift = deliverFuelUplift(world, fuelQuote);
      aircraft.fuelKg = Math.min(
        aircraft.fuelCapacityKg,
        aircraft.fuelKg + uplift.deliveredKg,
      );
    }
  }

  aircraft.fuelKg = Math.max(
    0,
    Math.min(aircraft.fuelCapacityKg, aircraft.fuelKg - quote.fuelNeededKg),
  );
  aircraft.locationIcao = quote.destIcao;
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;

  applyWalletDelta(state, {
    amountUsd: -quote.totalCostUsd,
    kind: 'ferry',
    atTick: world.tick,
    aircraftId: aircraft.id,
    icao: quote.destIcao,
    note:
      quote.softNmApplied > 0
        ? `${quote.originIcao}→${quote.destIcao} (early soft ${Math.round(quote.softNmApplied)} nm)`
        : `${quote.originIcao}→${quote.destIcao}`,
  });

  if (quote.softNmApplied > 0) {
    state.ferrySoftNmUsed =
      Math.round(((state.ferrySoftNmUsed ?? 0) + quote.softNmApplied) * 100) /
      100;
  }

  return {
    aircraft,
    quote,
    walletDebitUsd: quote.totalCostUsd,
  };
}
