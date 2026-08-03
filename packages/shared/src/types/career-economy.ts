/** Skyline Career — local cargo logistics economy (Slice 1). */

import type { FlightScoreSnapshot } from '../career-flight-score.js';
import type { OfpBriefingSummary, OfpLoadMethod } from './ofp-compliance.js';

export type { OfpLoadMethod };

export type CommodityId =
  | 'electronics'
  | 'perishables'
  | 'machinery'
  | 'general'
  | 'supplies'
  | 'fuel'
  | 'mro_parts';

export interface CommodityDef {
  id: CommodityId;
  name: string;
  /** Reference price USD per kg at balanced stock. */
  basePricePerKg: number;
  perishable?: boolean;
  highValue?: boolean;
  /**
   * `fuel` / `mro` stay in terminal inventory; not formed into freight lots.
   * Default / omitted = cargo.
   */
  kind?: 'cargo' | 'fuel' | 'mro';
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
  /**
   * Static cargo-role tier (calibrated offline from ANAC/concession tonnage).
   * Drives warehouse scale and how many lots a lane may form.
   */
  hubTier?: HubTier;
  /** WGS84 latitude (degrees) — used for live settle proximity. */
  lat: number;
  /** WGS84 longitude (degrees). */
  lon: number;
  /**
   * Terminal development level 1–5 (sticky). Raised by traffic XP, not by
   * idle stock alone. Distinct from static hubTier.
   */
  level: number;
  /** Cumulative activity points toward / past current level. */
  levelXp?: number;
  /**
   * Balance-curve generation for hub XP thresholds.
   * Bumped when thresholds/XP rates are retuned so inflated levels can resync.
   */
  levelCurveVersion?: number;
  /** XP granted during the current economy tick (cap spam from lot formation). */
  levelXpTick?: number;
  levelXpTickAt?: number;
  /** Decaying recent-activity score for soft neglect (does not drop level). */
  activityScore?: number;
  /** Last tick that recorded hub activity. */
  lastActivityTick?: number;
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

/** Cargo-network role for Brazil career hubs (not live API — curated snapshot). */
export type HubTier = 'major' | 'regional' | 'spoke';

export type ShipmentLotStatus = 'available' | 'reserved' | 'in_transit' | 'delivered' | 'expired';

export type EconomyEventKind =
  | 'harvest_boost'
  | 'port_congestion'
  | 'factory_outage'
  | 'festival_demand'
  | 'labor_strike';

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
  /** Freight pay USD for the full lot (idle escalation may raise this). */
  payUsd: number;
  /**
   * Pay at formation. Idle escalation multiplies from this so re-ticks stay
   * deterministic. Missing on legacy lots — first escalate stamps current pay.
   */
  basePayUsd?: number;
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
  /**
   * Optional ICAO-ish airframe variant (A321F, 208B, …) from the abstract
   * NPC catalog — display + optional cargo ceiling. Not a player flight_model.
   */
  airframeTypeId?: string;
  /** Optional cargo ceiling (kg); clamped to class max when bidding. */
  maxCargoKg?: number;
  homeRegion: string;
  /** 0–1: less noise / more consistent bidding when high. */
  reliability: number;
  /** 0–1: prefers urgent, high-pay, expiring lots. */
  aggressiveness: number;
  /** Multiplier on minimum acceptable pay/kg vs commodity base. */
  feeBias: number;
  status: 'idle' | 'busy' | 'resting' | 'maintenance';
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
  /**
   * Block hours since last abstract shop visit (inspection-scale).
   * When past class interval, NPC enters maintenance after turnaround.
   */
  hoursSinceMx?: number;
  /** Last known terminal (set on arrival); MRO parts drawn here. */
  locationIcao?: string;
  /** Wall-clock when shop visit ends. */
  mxUntilMs?: number;
  /** Economy tick when shop visit ends (legacy / debug). */
  mxUntilTick?: number;
  /**
   * Player airframe currently wet-leased to this operator (lease-out from hangar).
   * Cleared when the term ends.
   */
  leasedPlayerAircraftId?: string;
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

/**
 * Destination-notified inbound: cargo already committed toward a dest terminal.
 * Player missions publish on accept/depart; NPCs use `npcFlights` instead.
 */
export interface InboundPending {
  id: string;
  missionId: string;
  originIcao: string;
  destIcao: string;
  commodityId: CommodityId;
  cargoKg: number;
  /** Drop after this tick + retention (usually the lot deadline). */
  expiresAtTick: number;
  source: 'player';
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
  /** ICAO-ish variant when assigned (A321F, …). */
  airframeTypeId?: string;
  homeRegion: string;
  reliability: number;
  aggressiveness: number;
  feeBias: number;
  status: 'idle' | 'busy' | 'resting' | 'maintenance';
  phase: 'idle' | 'enroute' | 'arriving' | 'turnaround' | 'resting' | 'maintenance';
  busyUntilTick?: number;
  busyUntilMs?: number;
  turnaroundHoursLeft?: number;
  restUntilTick?: number;
  restUntilMs?: number;
  restHoursLeft?: number;
  mxUntilTick?: number;
  mxUntilMs?: number;
  mxHoursLeft?: number;
  locationIcao?: string;
  hoursSinceMx?: number;
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

/** Background Jet-A road tanker (not a player career vehicle). */
export type FuelTruckClassId = 'rigid_tanker' | 'semi_tanker' | 'btrain_tanker';

export interface FuelTruck {
  id: string;
  name: string;
  truckClassId: FuelTruckClassId;
  homeRegion: string;
  status: 'idle' | 'enroute' | 'turnaround';
  currentHaulId?: string;
  /** Wall-clock when turnaround ends / truck becomes idle again. */
  busyUntilMs?: number;
}

/** One hub→spoke Jet-A road delivery. */
export interface FuelHaul {
  id: string;
  truckId: string;
  originIcao: string;
  destIcao: string;
  commodityId: 'fuel';
  cargoKg: number;
  departedAtMs: number;
  arrivesAtMs: number;
  status: 'enroute' | 'completed';
}

/** Compact Terminal / API row for an inbound (or recent) fuel truck. */
export interface FuelHaulView {
  id: string;
  truckId: string;
  truckName: string;
  truckClassId: FuelTruckClassId;
  truckLabel: string;
  originIcao: string;
  destIcao: string;
  cargoKg: number;
  departedAtMs: number;
  arrivesAtMs: number;
  etaMs: number;
  etaHours: number;
  progressPct: number;
  status: FuelHaul['status'];
  phase: 'enroute' | 'arriving' | 'delivered';
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
  /**
   * Player home domestic partition (ISO-ish country code).
   * Follows the chosen starter hub's region (`KMIA` / `US-SE` → `US`).
   * Seed default is `BR` until hub selection; missing values fall back to
   * majority airport country via `inferHomeCountryId`.
   */
  homeCountryId?: string;
  airports: AirportTerminal[];
  lots: ShipmentLot[];
  /** Active / recent regional shocks. */
  events: EconomyEvent[];
  /** Limited competing freighter pool (seeded / migrated). */
  npcs: NpcFreighter[];
  /** Active NPC hauls; completed flights are pruned after settle. */
  npcFlights: NpcFlight[];
  /**
   * Player cargo notified to dest (accepted / dispatched / in_flight).
   * Soft fill = stock + NPC airborne + these rows.
   */
  inboundPending?: InboundPending[];
  /** Background Jet-A road tankers (seeded / migrated). */
  fuelTrucks?: FuelTruck[];
  /** Active / recently completed fuel road hauls. */
  fuelHauls?: FuelHaul[];
  /**
   * Sparse hub↔hub international OD overlay (bidirectional match).
   * Domestic lot formation never crosses countries except via these lanes.
   */
  internationalLanes?: InternationalLane[];
}

/**
 * Sparse hub↔hub OD between countries.
 * Country partitions share this contract instead of fully simulating each other.
 */
export interface InternationalLane {
  id: string;
  originCountryId: string;
  destCountryId: string;
  originIcao: string;
  destIcao: string;
  /** Soft capacity hint for international freight (kg / day). */
  capacityKgPerDay?: number;
}

/** Per-partition stats from a domestic or international lot-formation pass. */
export interface PartitionTickResult {
  countryId: string;
  ticksAdvanced: number;
  lotsFormed: number;
  npcSettled: number;
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
  /** Fatia 1–2 signals for market UI chips. */
  pressure?: {
    originRegion: string;
    originRegionCapacity: number;
    laneSaturation: number;
    thinFleet: boolean;
    laneBusy: boolean;
    weather?: 'fair' | 'marginal' | 'poor';
    /** True when idle age has raised freight above formation pay. */
    idleEscalated?: boolean;
    /** Current idle pay multiplier (>= 1). */
    idlePayMult?: number;
    /** Active regional demand shocks touching this OD. */
    demandShock?: boolean;
    /** Short shock labels for chips (e.g. Harvest, Festival). */
    shockLabels?: string[];
    /** Combined freight pay multiplier from shocks (>= 1). */
    shockPayMult?: number;
    /** True when origin/dest countries differ (international lane). */
    international?: boolean;
  };
}

/** Freighter capacity classes (Slice 2) — filter market + drive SimBrief dispatch. */
export type FreighterClassId =
  | 'narrow_freighter'
  | 'wide_freighter'
  | 'medium_piston'
  | 'light_jet'
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
  /** Concrete homologated player model assigned to this flight. */
  airframeTypeId?: string;
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
  /**
   * Wall-clock when the aircraft left the ground (Watch / depart).
   * Used to enforce a minimum airborne fraction of planned route time.
   */
  airborneAtMs?: number;
  /** Planned route duration (ms) stamped at airborne — OFP block or distance estimate. */
  expectedRouteMs?: number;
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
  /**
   * Vertical speed at first touchdown (feet per minute).
   * Typically negative for a descent (e.g. -220).
   */
  settledLandingFpm?: number;
  /** Wall-clock airborne duration (wheels-up → touchdown/settle), ms. */
  settledFlightDurationMs?: number;
  /** OnAir-style flight scorecard captured by Watch (envelope / taxi / landing). */
  settledFlightScore?: FlightScoreSnapshot;
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
        tanks?: { left: number; right: number; center: number };
      };
      payload: {
        plannedLb?: number;
        liveLb?: number;
        ok: boolean;
        stations?: Record<number, number>;
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

export type AircraftListingKind = 'new' | 'used' | 'lease';
export type AirframeCondition = 'excellent' | 'good' | 'fair' | 'tired';
export type AircraftListingStatus = 'available' | 'reserved' | 'sold' | 'expired';
export type AircraftListingSource = 'generated' | 'player_sale' | 'player_lease';

/** Board listing on the Skyline aircraft market. */
export interface AircraftListing {
  id: string;
  kind: AircraftListingKind;
  aircraftClassId: FreighterClassId;
  /** Concrete homologated player model within the economic class. */
  airframeTypeId?: string;
  label: string;
  basedIcao: string;
  /** Purchase price, or lease down-payment. */
  askingUsd: number;
  leaseMonthlyUsd?: number;
  leaseTermMonths?: number;
  condition: AirframeCondition;
  hoursAirframe: number;
  hoursEngine: number;
  /** Optional 0–100 wear stats (market / hangar). */
  airframeConditionPct?: number;
  engineConditionPct?: number;
  expiresAtTick: number;
  status: AircraftListingStatus;
  /** Origin of the listing; omit/legacy treated as generated. */
  source?: AircraftListingSource;
  /** Fleet id when source is player_sale or player_lease. */
  sellerAircraftId?: string;
}

export interface AircraftLeaseContract {
  monthlyUsd: number;
  /** Economy tick when the next monthly debit is due. */
  nextDueTick: number;
  /** Economy tick when the lease term ends. */
  termEndsTick: number;
  buyoutUsd?: number;
  listingId?: string;
}

/** Income side when an NPC/market leases a player-listed airframe. */
export interface AircraftLeaseOutContract {
  monthlyUsd: number;
  nextDueTick: number;
  termEndsTick: number;
  depositUsd: number;
  listingId?: string;
  /** Named competing freighter operating the airframe (when bound). */
  lesseeNpcId?: string;
  lesseeName?: string;
  /** Economy tick when the lease-out started (wear baseline). */
  startedAtTick: number;
  /** Economy tick through which utilization wear was last applied. */
  lastWearTick: number;
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
  /** Active aircraft-market board (refreshed by economy day). */
  aircraftMarket?: AircraftListing[];
  /** Economy day index when aircraftMarket was last regenerated. */
  aircraftMarketDay?: number;
  /** Economy day when abstract NPC demand last ran. */
  aircraftMarketDemandDay?: number;
  /** Append-only company cashflow (income + expenses). */
  ledger?: CareerLedgerEntry[];
  /**
   * Runtime cruise perf learned from stable in-mission samples.
   * Prefer over static catalog burn/TAS for Market/Hangar UI + planning.
   */
  airframePerfOverrides?: Record<string, AirframePerfOverride>;
  /**
   * Commodity ladder progression (Dry → Value → Time → Heavy).
   * Unlocks market freights and scales pay by reputation.
   */
  cargoOps?: CareerCargoOps;
};

/** Per-commodity reputation + unlock for the Cargo Ops ladder. */
export type CargoOpsCommodityId =
  | 'general'
  | 'supplies'
  | 'electronics'
  | 'perishables'
  | 'machinery';

export interface CargoOpsCommodityState {
  unlocked: boolean;
  /** 0–100 operator reputation for this commodity. */
  rep: number;
  /** Count of clean settles (on-time + score threshold). */
  settlesOk: number;
}

export interface CareerCargoOps {
  commodities: Record<CargoOpsCommodityId, CargoOpsCommodityState>;
}

/** Live-learned cruise burn / TAS for one Market airframe typeId. */
export interface AirframePerfOverride {
  cruiseFuelFlowKgPerHour?: number;
  cruiseSpeedKt?: number;
  fuelBurnKgPerNm?: number;
  updatedAtIso?: string;
  sampleCount?: number;
}

/** Legacy missions save before hangar / fleet. */
export interface CareerMissionsStateV1 {
  version: 1;
  walletUsd: number;
  missions: MissionIntent[];
}

export type PlayerAircraftStatus =
  | 'parked'
  | 'assigned'
  | 'maintenance'
  | 'listed'
  | 'leased_out';
export type AircraftOwnership = 'owned' | 'leased';

/** Signed company cashflow row (see career-ledger). */
export type CareerLedgerKind =
  | 'freight_payout'
  | 'hangar_parking'
  | 'lease_payment'
  | 'lease_out_income'
  | 'lease_deposit'
  | 'aircraft_buy'
  | 'aircraft_lease_sign'
  | 'aircraft_sell'
  | 'aircraft_buyout'
  | 'ferry'
  | 'fuel'
  | 'inspection'
  | 'repair'
  | 'other';

export interface CareerLedgerEntry {
  id: string;
  atTick: number;
  dayIndex: number;
  /** Signed: +income / −expense. */
  amountUsd: number;
  kind: CareerLedgerKind;
  note?: string;
  aircraftId?: string;
  missionId?: string;
  icao?: string;
}

/** Player freighter parked at a career terminal when not on a mission. */
export interface PlayerAircraft {
  id: string;
  aircraftClassId: FreighterClassId;
  /** Concrete homologated model bought/leased from the aircraft market. */
  airframeTypeId?: string;
  label: string;
  /** ICAO where the aircraft is parked (or last parked while assigned). */
  locationIcao: string;
  fuelKg: number;
  fuelCapacityKg: number;
  status: PlayerAircraftStatus;
  /** Active mission id while status === 'assigned'. */
  assignedMissionId?: string;
  ownership?: AircraftOwnership;
  condition?: AirframeCondition;
  hoursAirframe?: number;
  hoursEngine?: number;
  /** Soft inspection threshold (absolute airframe hours); derived from hoursSinceInspection. */
  maintenanceDueAtHours?: number;
  /** Airframe condition 0–100. */
  airframeConditionPct?: number;
  /** Engine condition 0–100. */
  engineConditionPct?: number;
  /** Flight hours since last workshop inspection. */
  hoursSinceInspection?: number;
  lease?: AircraftLeaseContract;
  /** Set when lease payment is overdue — blocks dispatch until paid/caught up. */
  leaseOverdue?: boolean;
  /** Active board listing when status === 'listed'. */
  listedListingId?: string;
  /** Active when status === 'leased_out' (NPC/market holds the airframe). */
  leaseOut?: AircraftLeaseOutContract;
}
