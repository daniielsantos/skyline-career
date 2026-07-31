/** Skyline Career — local cargo logistics economy (Slice 1). */

import type { OfpBriefingSummary, OfpLoadMethod } from './ofp-compliance.js';

export type { OfpLoadMethod };

export type CommodityId =
  | 'electronics'
  | 'perishables'
  | 'machinery'
  | 'general'
  | 'fuel';

export interface CommodityDef {
  id: CommodityId;
  name: string;
  /** Reference price USD per kg at balanced stock. */
  basePricePerKg: number;
  perishable?: boolean;
  highValue?: boolean;
  /**
   * `fuel` stays in terminal inventory + uplift; not formed into freight lots (MVP).
   * Default / omitted = cargo.
   */
  kind?: 'cargo' | 'fuel';
}

export interface StockPile {
  stockKg: number;
  capacityKg: number;
}

export interface AirportTerminal {
  icao: string;
  name: string;
  /** Geographic / economic region tag for shocks later. */
  region: string;
  /** WGS84 latitude (degrees) — used for live settle proximity. */
  lat: number;
  /** WGS84 longitude (degrees). */
  lon: number;
  /**
   * Terminal development level (Transport Fever–style growth later).
   * MVP: affects capacity slightly; raised when shortages are repeatedly filled.
   */
  level: number;
  inventory: Partial<Record<CommodityId, StockPile>>;
  /**
   * Baseline production per tick (kg). Effective flow each tick is derived from this.
   * Falls back to `production` on legacy saves.
   */
  baseProduction?: Partial<Record<CommodityId, number>>;
  /**
   * Baseline consumption per tick (kg).
   * Falls back to `consumption` on legacy saves.
   */
  baseConsumption?: Partial<Record<CommodityId, number>>;
  /** Last effective production applied this tick (kg) — UI display. */
  production: Partial<Record<CommodityId, number>>;
  /** Last effective consumption applied this tick (kg) — UI display. */
  consumption: Partial<Record<CommodityId, number>>;
}

export type ShipmentLotStatus = 'available' | 'reserved' | 'in_transit' | 'delivered' | 'expired';

export type EconomyEventKind =
  | 'harvest_boost'
  | 'port_congestion'
  | 'factory_outage'
  | 'festival_demand';

export interface EconomyEvent {
  id: string;
  kind: EconomyEventKind;
  region: string;
  commodityId?: CommodityId;
  startsAtTick: number;
  endsAtTick: number;
  label: string;
}

export interface ShipmentLot {
  id: string;
  commodityId: CommodityId;
  originIcao: string;
  destIcao: string;
  quantityKg: number;
  reservedKg: number;
  /** Created on this world tick. */
  createdAtTick: number;
  /** Soft expiry; perishables expire sooner. */
  expiresAtTick: number;
  /** Freight pay USD for the full lot (before urgency multipliers already baked in). */
  payUsd: number;
  urgency: 'normal' | 'urgent';
  /** Short economic reason (surplus → shortage). */
  reason: string;
  status: ShipmentLotStatus;
}

/** Competing AI freighter (Phase 2) — 1 mission at a time, no player wallet credit. */
export interface NpcFreighter {
  id: string;
  name: string;
  aircraftClassId: FreighterClassId;
  homeRegion: string;
  /** 0–1: less noise / more consistent bidding when high. */
  reliability: number;
  /** 0–1: prefers urgent, high-pay, expiring lots. */
  aggressiveness: number;
  /** Multiplier on minimum acceptable pay/kg vs commodity base. */
  feeBias: number;
  status: 'idle' | 'busy' | 'resting';
  /** Economy tick when this freighter can bid again (legacy / debug). */
  busyUntilTick?: number;
  /** Wall-clock when freighter can bid again after turnaround (authoritative). */
  busyUntilMs?: number;
  /** Duty hours accumulated since last crew rest (flight + turnaround). */
  dutyHoursAccum?: number;
  /** Duty hours from the most recent leg (for long-haul rest trigger). */
  lastLegDutyHours?: number;
  /** Economy tick when crew rest ends (legacy / debug). */
  restUntilTick?: number;
  /** Wall-clock when crew rest ends — NPC cannot bid until then. */
  restUntilMs?: number;
  currentFlightId?: string;
}

export interface NpcFlight {
  id: string;
  npcId: string;
  lotId: string;
  originIcao: string;
  destIcao: string;
  commodityId: CommodityId;
  cargoKg: number;
  /** Pro-rata freight value (not paid to player). */
  payUsd: number;
  aircraftClassId: FreighterClassId;
  departedAtTick: number;
  /** Tick when cargo delivers into dest stock (legacy / debug). */
  arrivesAtTick: number;
  /** Wall-clock departure (authoritative for live ETA/progress). */
  departedAtMs: number;
  /** Wall-clock arrival / cargo delivery. */
  arrivesAtMs: number;
  status: 'in_flight' | 'completed';
  /** Origin fuel taken / billed when the NPC claimed the lot. */
  fuelUpliftKg?: number;
  fuelCostUsd?: number;
  fuelScarcity?: MissionFuelUplift['scarcity'];
}

export interface NpcActivityView {
  flight: NpcFlight;
  npcName: string;
  commodityName: string;
  /** Fractional hours remaining until arrival. */
  hoursRemaining: number;
  /** Milliseconds remaining until arrival. */
  etaMs: number;
  distanceNm: number;
  payUsd: number;
  urgency: ShipmentLot['urgency'];
  /** 0–100 progress along the route (wall-clock). */
  progressPct: number;
  /** Total planned block hours for this leg. */
  flightHours: number;
  homeRegion: string;
  aircraftLabel: string;
  phase: 'enroute' | 'arriving';
}

/** Roster row for the NPC fleet board (idle + busy + resting). */
export interface NpcFleetMemberView {
  id: string;
  name: string;
  aircraftClassId: FreighterClassId;
  aircraftLabel: string;
  homeRegion: string;
  reliability: number;
  aggressiveness: number;
  feeBias: number;
  status: 'idle' | 'busy' | 'resting';
  phase: 'idle' | 'enroute' | 'arriving' | 'turnaround' | 'resting';
  busyUntilTick?: number;
  busyUntilMs?: number;
  turnaroundHoursLeft?: number;
  restUntilTick?: number;
  restUntilMs?: number;
  restHoursLeft?: number;
  dutyHoursAccum?: number;
  mission?: {
    flightId: string;
    lotId: string;
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    commodityName: string;
    cargoKg: number;
    payUsd: number;
    distanceNm: number;
    departedAtTick: number;
    arrivesAtTick: number;
    departedAtMs: number;
    arrivesAtMs: number;
    etaHours: number;
    etaMs: number;
    progressPct: number;
    flightHours: number;
    urgency: ShipmentLot['urgency'];
    phase: 'enroute' | 'arriving';
  };
}

export interface CareerEconomyWorld {
  version: 3;
  seed: string;
  /** Completed hourly economy batches. */
  tick: number;
  /**
   * Wall-clock when the last hourly batch completed (or was anchored).
   * Partial hours since this instant are continuous ops / UI only.
   */
  lastBatchAtMs: number;
  /**
   * @deprecated Alias of lastBatchAtMs for one-release read/write compat.
   */
  lastSyncedAtMs?: number;
  airports: AirportTerminal[];
  lots: ShipmentLot[];
  /** Active / recent regional shocks. */
  events: EconomyEvent[];
  /** Limited competing freighter pool (seeded / migrated). */
  npcs: NpcFreighter[];
  /** Active NPC hauls; completed flights are pruned after settle. */
  npcFlights: NpcFlight[];
}

/** Legacy persisted shape before continuous clock / live events. */
export interface CareerEconomyWorldV1 {
  version: 1;
  seed: string;
  tick: number;
  airports: AirportTerminal[];
  lots: ShipmentLot[];
}

/** Legacy v2 before continuous ops timestamps. */
export interface CareerEconomyWorldV2 {
  version: 2;
  seed: string;
  tick: number;
  lastSyncedAtMs: number;
  airports: AirportTerminal[];
  lots: ShipmentLot[];
  events: EconomyEvent[];
  npcs?: NpcFreighter[];
  npcFlights?: NpcFlight[];
}

export interface MarketLotView {
  lot: ShipmentLot;
  originName: string;
  destName: string;
  commodityName: string;
  availableKg: number;
  payPerKgUsd: number;
  originStockKg: number;
  destStockKg: number;
  originFillPct: number;
  destFillPct: number;
  /** Present when an NPC has reserved cargo on this lot. */
  npcClaim?: {
    npcId: string;
    npcName: string;
    cargoKg: number;
    etaHours: number;
  };
}

/** Freighter capacity classes (Slice 2) — filter market + drive SimBrief dispatch. */
export type FreighterClassId =
  | 'narrow_freighter'
  | 'wide_freighter'
  | 'light_turboprop'
  | 'light_ga';

export interface AircraftClass {
  id: FreighterClassId;
  name: string;
  /** Soft cargo weight limit used for accept clamp / market viability (MZFW−OEW structural). */
  maxCargoKg: number;
  maxRangeNm: number;
  /** Repo-relative OFP roles pack path. */
  rolesPackRelPath: string;
  /** Preferred Career load path for this class (manual always allowed in UI). */
  loadMethod: OfpLoadMethod;
  /** True when a writable Skyline profile exists for direct injection. */
  injectCapable: boolean;
  simbriefIcao: string;
  simbriefAirframeMatch: string;
  /** Career-economy burn estimate (not SimBrief OFP). */
  fuelBurnKgPerNm: number;
  /** Taxi fuel included in uplift / route estimates. */
  fuelTaxiKg: number;
  /** Maximum usable fuel for route-feasibility planning. */
  fuelCapacityKg: number;
  /**
   * Homologation weights for route operational cargo estimates (MTOW − OEW − fuel).
   * Prefer live SimBrief airframe_options when available; these are the class fallback.
   */
  oewKg: number;
  mtowKg: number;
  /**
   * Airway/wind multiplier on distance for block-fuel estimate before Dispatch.
   * New aircraft homologations should calibrate this against typical SimBrief OFPs.
   */
  fuelRouteFactor: number;
  /** Alternate / final reserve fuel included in route block estimate (kg). */
  fuelReserveKg: number;
}

export type MissionStatus =
  | 'accepted'
  | 'dispatched'
  | 'in_flight'
  | 'settled'
  | 'cancelled'
  | 'failed';

/**
 * What the player committed to haul — source of truth for dispatch prefill
 * and later Intent→OFP validation.
 *
 * One flight can carry multiple market lots (same origin→dest) as `lots[]`.
 * Top-level cargo/pay/commodity/urgency/deadline are mirrors of the manifest.
 */
export interface MissionLotLine {
  shipmentLotId: string;
  commodityId: CommodityId;
  cargoKg: number;
  /** Pro-rata freight pay for this cargoKg. */
  payUsd: number;
  urgency: 'normal' | 'urgent';
  reason: string;
  deadlineTick: number;
}

/** Soft cap: how many market lots can share one flight. */
export const MAX_MANIFEST_LOTS = 5;

/** Jet-A purchased at origin when the flight departs. */
export interface MissionFuelUplift {
  originIcao: string;
  requestedKg: number;
  /** Kg taken from terminal stock (may be less than requested). */
  deliveredKg: number;
  unitPriceUsd: number;
  costUsd: number;
  scarcity: 'ok' | 'partial' | 'dry';
  upliftedAtTick: number;
}

export interface MissionIntent {
  id: string;
  /** Canonical manifest (1..MAX_MANIFEST_LOTS). Always present after normalize. */
  lots: MissionLotLine[];
  /**
   * Legacy mirror of lots[0].shipmentLotId — kept for older callers / saves.
   * Prefer iterating `lots`.
   */
  shipmentLotId: string;
  /** Primary commodity (heaviest line). */
  commodityId: CommodityId;
  originIcao: string;
  destIcao: string;
  /** Sum of lots[].cargoKg. */
  cargoKg: number;
  /** Freighter MVP always 0. */
  pax: 0;
  aircraftClassId: FreighterClassId;
  rolesPackRelPath: string;
  /** Earliest lot deadline. */
  deadlineTick: number;
  /** Sum of lots[].payUsd. */
  payUsd: number;
  /** Urgent if any lot is urgent. */
  urgency: 'normal' | 'urgent';
  reason: string;
  status: MissionStatus;
  acceptedAtTick: number;
  /** Set when career dispatch opens SimBrief. */
  staticId?: string;
  dispatchedAtTick?: number;
  /** Economy tick when cargo left origin (career depart). */
  departedAtTick?: number;
  /** Economy tick when settle ran. */
  settledAtTick?: number;
  /** Freight paid after late penalty. */
  payoutUsd?: number;
  /** Late delivery penalty deducted from payUsd. */
  penaltyUsd?: number;
  lateTicks?: number;
  /** Origin fuel uplift charged at depart. */
  fuelUplift?: MissionFuelUplift;
  /** SimBrief OFP whose block-fuel requirement has been funded/accepted. */
  fuelAuthorizedOfpId?: string;
  /** Player fleet aircraft that flies this mission. */
  aircraftId?: string;
  /** Trip fuel burned (estimate) applied on settle. */
  tripFuelBurnKg?: number;
  /** Actual fuel remaining in MSFS when the mission settled. */
  settledFuelKg?: number;
  /** Last Intent→OFP result after Confirm OFP (UI/CLI). */
  lastOfpCheck?: {
    verdict: 'pass' | 'warn' | 'fail';
    summary: string;
    checkedAtIso: string;
    /** SimBrief request_id that produced this result. */
    ofpId?: string;
    /** Dispatch revision (static_id) validated by this result. */
    staticId?: string;
    /** Compact operational details from the confirmed SimBrief OFP. */
    briefing?: OfpBriefingSummary;
    /** SimBrief block fuel normalized to kg for career fuel accounting. */
    plannedBlockFuelKg?: number;
    findings: Array<{
      code: string;
      severity: string;
      message: string;
    }>;
  };
  /** Last OFP↔live MSFS load check (Preflight). */
  lastPreflightCheck?: {
    verdict: 'pass' | 'warn' | 'fail';
    summary: string;
    checkedAtIso: string;
    phase?: string;
    /** Concise operational verification for the Career UI. All weights are lb. */
    loadVerification?: {
      ready: boolean;
      fuel: {
        plannedLb?: number;
        liveLb: number;
        ok: boolean;
      };
      payload: {
        plannedLb?: number;
        liveLb?: number;
        ok: boolean;
      };
      aircraft: {
        onGround: boolean;
        enginesRunning: boolean;
      };
      weightNoteCount: number;
    };
    findings: Array<{
      code: string;
      severity: string;
      message: string;
    }>;
  };
}

export interface MissionSettlementLine {
  shipmentLotId: string;
  commodityId: CommodityId;
  deliveredKg: number;
  payUsd: number;
  penaltyUsd: number;
  payoutUsd: number;
}

export interface MissionSettlement {
  missionId: string;
  deliveredKg: number;
  payoutUsd: number;
  penaltyUsd: number;
  lateTicks: number;
  onTime: boolean;
  originStockAfterKg: number;
  destStockAfterKg: number;
  lines?: MissionSettlementLine[];
}

export interface CareerMissionsState {
  version: 2;
  /** Company cash from settled freights (Slice 4). */
  walletUsd: number;
  missions: MissionIntent[];
  /** Owned freighters; empty until starter hub is selected. */
  fleet: PlayerAircraft[];
  /** False until the player picks the starter hub. */
  hubSelected: boolean;
  /** Display name from pilot signup; empty until registered. */
  pilotName: string;
  /** Home / starter hub ICAO; empty until registered. */
  homeHubIcao: string;
}

/** Legacy missions save before hangar / fleet. */
export interface CareerMissionsStateV1 {
  version: 1;
  walletUsd: number;
  missions: MissionIntent[];
}

export type PlayerAircraftStatus = 'parked' | 'assigned';

/** Player-owned freighter parked at a career terminal when not on a mission. */
export interface PlayerAircraft {
  id: string;
  aircraftClassId: FreighterClassId;
  label: string;
  /** ICAO where the aircraft is parked (or last parked while assigned). */
  locationIcao: string;
  fuelKg: number;
  fuelCapacityKg: number;
  status: PlayerAircraftStatus;
  /** Active mission id while status === 'assigned'. */
  assignedMissionId?: string;
}
