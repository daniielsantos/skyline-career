/** Skyline Career — local cargo logistics economy (Slice 1). */

import type { FlightScoreSnapshot } from '../career-flight-score.js';
import type { WeatherOpsSnapshot } from '../career-weather-ops.js';
import type { RunwayTouchdownSnapshot } from '../career-runways.js';
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

/** One commodity row inside a daily hub economy sample. */
export type HubEconomyCommoditySample = {
  id: CommodityId;
  /** 0–1 warehouse fill. */
  fill: number;
  spotUsd: number;
  stockKg?: number;
  capacityKg?: number;
};

/** Daily hub snapshot for Hub Stats history (SQLite hub_economy_samples). */
export type HubEconomySample = {
  icao: string;
  dayIndex: number;
  tick: number;
  /** ISO-ish country id from region (BR, US, …). */
  countryId: string;
  region: string;
  hubTier: HubTier;
  activityScore: number;
  hubLevel: number;
  quiet: boolean;
  jetAFill: number;
  outboundLots: number;
  outboundKg: number;
  payP50Usd: number | null;
  /** Board pay dispersion (null when &lt;2 paying lots). */
  payP10Usd?: number | null;
  payP90Usd?: number | null;
  kgGa: number;
  kgTp: number;
  kgMedium: number;
  kgNarrow: number;
  kgWide: number;
  /** Lot counts by size band (alongside kg*). */
  lotsGa: number;
  lotsTp: number;
  lotsMedium: number;
  lotsNarrow: number;
  lotsWide: number;
  /** Cargo terminal stock (excludes fuel / MRO). */
  cargoStockKg: number;
  cargoCapacityKg: number;
  /** Inbound pending + NPC enroute to this hub (kg). */
  inboundKg: number;
  commodities: HubEconomyCommoditySample[];
};

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
  /**
   * Soft-field bush strip (Amazon v1). No ferry; light_ga freight vs gateways only.
   */
  bush?: boolean;
  /**
 * Trip-only strip (US FAA locals). On map for bush trips only — hidden from
 * Network; no Market/ferry/home hub; frozen cargo economy.
 */
  bushTripOnly?: boolean;
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
   * Airframe variant typeId — homologated player Market SKU when available for
   * the class; otherwise abstract FSLTL-style code (A321F, 208B, …) for label
   * + optional cargo ceiling only.
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
  /**
   * `awaiting_pilot` = cargo reserved, offer open for contract pilot;
   * auto-promotes to `in_flight` when awaitingPilotUntilMs elapses.
   */
  status: 'awaiting_pilot' | 'in_flight' | 'completed';
  /**
   * `reposition` = empty deadhead toward home region (Crew needed · reposition).
   * Omitted / `freight` = normal cargo haul.
   */
  kind?: 'freight' | 'reposition';
  /** Wall-clock when an awaiting_pilot offer expires and the NPC departs alone. */
  awaitingPilotUntilMs?: number;
  /** Contract-pilot fee preview (fraction of payUsd); set on awaiting_pilot. */
  pilotFeeUsd?: number;
  /** Origin fuel taken / billed when the NPC claimed the lot (or promoted). */
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
    /** True when origin/dest countries differ. */
    international?: boolean;
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
  /** Monotonic freight flow counters (throughput instrumentation). */
  flow?: EconomyFlowStats;
  /** Seaport factory catalog (real ports → pickup hubs). */
  portListings?: PortListing[];
  /** Passive factory stock per port × commodity (drains into listings). */
  portInventories?: PortInventoryRow[];
  /**
   * Next world discharge per port (economy-day cadence). Not stripped from
   * the blob — small, and tick-settled independently of listings.
   */
  portInboundShips?: PortInboundShip[];
  /** Thin world index of who operates each port (lease window). */
  portConcessions?: PortConcessionIndexRow[];
  /** Terminal buy-orders for player warehouse cargo (Demand Board). */
  demandOrders?: DemandOrder[];
  /** Dealer aircraft pool (finite instances; Market board source). */
  aircraftInstances?: AircraftInstance[];
  /** Hash of enabled player-airframe catalog; triggers incremental backfill. */
  aircraftPoolCatalogHash?: string;
  /**
   * Ephemeral: day-boundary hub samples waiting for saveEconomy → SQL.
   * Never persisted in economy_json.
   */
  pendingHubEconomySamples?: HubEconomySample[];
}

/** Dealer-owned airframe in the world pool (one physical tail number). */
export type AircraftInstanceStatus = 'available' | 'sold';

export interface AircraftInstance {
  id: string;
  airframeTypeId: string;
  aircraftClassId: FreighterClassId;
  /** ISO country id (BR, US, …). */
  countryId: string;
  basedIcao: string;
  registration: string;
  kind: AircraftListingKind;
  condition: AirframeCondition;
  hoursAirframe: number;
  hoursEngine: number;
  airframeConditionPct?: number;
  engineConditionPct?: number;
  /** available = on Market; sold = purchased / removed from dealer stock. */
  status: AircraftInstanceStatus;
  /** Economy tick when the instance entered dealer stock. */
  seededAtTick: number;
  /** Hidden from Market until this tick (trade-in restock delay). */
  availableAtTick?: number;
}

/** Lot size buckets used by flow instrumentation. */
export type FlowLotSizeBand = 'ga_ltl' | 'ltl' | 'large' | 'xl';

export interface FlowCounter {
  lots: number;
  kg: number;
}

/**
 * Cumulative freight flow since `sinceTick`. Board status counts only survive a
 * 12h retention window, so throughput has to come from monotonic counters.
 */
export interface EconomyFlowStats {
  sinceTick: number;
  /** Lots pushed onto the board. */
  formed: FlowCounter;
  /** Unclaimed remainder that aged out. */
  expired: FlowCounter;
  /** Stale heavy lots pulled early (subset of expired). */
  recycled: FlowCounter;
  /** Cargo that landed at the destination. */
  delivered: FlowCounter;
  /** Cargo taken off the board into a hold. */
  claimed: FlowCounter;
  /** Formation reserve returned to origin stock on expiry. */
  reserveRefundedKg: number;
  /** Warehouse produced kg after saturation (all cargo hubs). */
  producedKg: number;
  /** Warehouse consumed kg after starvation (all cargo hubs). */
  consumedKg: number;
  /** Origin stock actually drawn at delivery settle. */
  deliveredOriginDrawnKg: number;
  /** Destination stock actually credited at delivery settle. */
  deliveredDestCreditedKg: number;
  byCommodity: Partial<
    Record<
      CommodityId,
      {
        formed: FlowCounter;
        expired: FlowCounter;
        delivered: FlowCounter;
        claimed: FlowCounter;
        /** Warehouse produced kg after saturation. */
        producedKg: number;
        /** Warehouse consumed kg after starvation. */
        consumedKg: number;
      }
    >
  >;
  formedBySize: Record<FlowLotSizeBand, number>;
  /** Unclaimed lots that aged out, by size band. */
  expiredBySize: Record<FlowLotSizeBand, number>;
  /** Hours the schedule granted, to compare against sampled fleet occupancy. */
  npc: {
    legs: number;
    flightHours: number;
    turnaroundHours: number;
    restHours: number;
  };
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
    /** True when the NPC is holding for a contract pilot (crew needed). */
    crewNeeded?: boolean;
    /** Empty deadhead home — not a freight haul. */
    crewReposition?: boolean;
    /** Max crew fee (full offer). Scales down with partial lift. */
    pilotFeeUsd?: number;
    /** Min crew fee among flyable homologated airframes. */
    pilotFeeMinUsd?: number;
    awaitingPilotUntilMs?: number;
    airframeTypeId?: string;
    aircraftLabel?: string;
    aircraftClassId?: string;
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
   * May be re-based on Watch resume so offline time does not count.
   */
  airborneAtMs?: number;
  /**
   * Accumulated sim-active airborne elapsed (ms) at last Watch flush / stop.
   * Excludes pause / slew / menu; also skips offline gap on resume.
   */
  airborneElapsedMs?: number;
  /**
   * Planned route duration (ms) stamped at airborne — OFP air time / distance
   * estimate. May tighten after stable cruise TAS rebase (floor 55% of OFP).
   */
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
  /**
   * Bumped on every lastOfpCheck write (and cargo-trim before reconfirm).
   * Stale auto-confirm must not overwrite a newer Accept OFP cargo snapshot.
   */
  ofpCheckSeq?: number;
  /** Player fleet aircraft that flies this mission. */
  aircraftId?: string;
  /**
   * Company crew (AI) is operating this leg on the player's airframe.
   * Settles on wall-clock ETA — no Flight Watch required.
   */
  crewOperated?: boolean;
  /**
   * Player is flying as a contract pilot on an NPC homologated airframe.
   * No player fleet aircraftId; operator covers fuel; payUsd is the pilot fee.
   */
  contractPilot?: boolean;
  /**
   * Dev-only Payload Lab flight (inject / Due vs Sim harness). No hangar, no
   * Market lot, no payout — cancel when done. Skips fuel purchase like contractPilot.
   */
  payloadLab?: boolean;
  /**
   * Contract-pilot empty reposition (NPC deadhead home). Skips Cargo Ops Dry
   * settles — not a freight haul.
   */
  contractPilotReposition?: boolean;
  /**
   * Player-owned empty reposition (no freight). Flown via Dispatch/Watch —
   * used to leave bush/trip-only strips and to relocate without a contract.
   */
  emptyFlight?: boolean;
  /** Great-circle / network route distance (nm); stamped on accept when known. */
  distanceNm?: number;
  /**
   * Port factory cargo staged as a hub→dest reposition (legacy). Prefer demandOrderId.
   * Skips terminal freight delivery when settling into FBO spot (removed) — demand path uses demandOrderId.
   */
  portPickupId?: string;
  /** Seaport id the cargo was bought from (restore on cancel). */
  portId?: string;
  /** Avg cost (USD/kg) carried from the port purchase for P&L. */
  portAvgCostUsdPerKg?: number;
  /**
   * Demand Board haul: warehouse stock → terminal dest. Settle pays order price
   * and fills destination inventory (freight delivery).
   */
  demandOrderId?: string;
  /**
   * Company WH→WH air bridge (no payout). Settle deposits dest warehouse;
   * overflow goes to that hub's port yard. Cancel restores origin WH.
   */
  warehouseBridge?: boolean;
  /** Dest warehouse id for a bridge mission. */
  destWarehouseId?: string;
  /** Warehouse id cargo was drawn from (restore on cancel). */
  warehouseId?: string;
  /** Avg cost (USD/kg) of reserved warehouse cargo. */
  warehouseAvgCostUsdPerKg?: number;
  /** Fee paid to the player on settle (also mirrored in payUsd for contract legs). */
  contractPilotFeeUsd?: number;
  /** Full freight value the NPC reserved (display / ledger note). */
  contractGrossPayUsd?: number;
  /** NPC operator that posted the crew-needed offer. */
  operatorNpcId?: string;
  operatorNpcName?: string;
  /** Source awaiting_pilot flight id (cleared from npcFlights on accept). */
  npcFlightId?: string;
  /** Crew fee charged at dispatch (USD). */
  crewFeeUsd?: number;
  /** Roster member flying this leg (company crew). */
  crewMemberId?: string;
  /**
   * Outbound crew leg that auto-queues an empty return to crewReturnIcao
   * after cargo settle.
   */
  crewRoundTrip?: boolean;
  /** Empty reposition leg spawned after a round-trip outbound settle. */
  crewDeadhead?: boolean;
  /** ICAO the aircraft returns to after a crewRoundTrip outbound. */
  crewReturnIcao?: string;
  /** Outbound mission id that spawned this deadhead return. */
  crewOutboundMissionId?: string;
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
  /** Live weather-ops score from Watch ambient samples. */
  settledWeatherOps?: WeatherOpsSnapshot;
  /** Extra wallet credit from weather-ops bonus (USD). */
  settledWeatherBonusUsd?: number;
  /** Touchdown WGS84 latitude (degrees). */
  settledTouchdownLat?: number;
  /** Touchdown WGS84 longitude (degrees). */
  settledTouchdownLon?: number;
  /** Catalog runway projection at dest (when hub runways known). */
  settledRunwayTouch?: RunwayTouchdownSnapshot;
  /**
   * CG ballast (lb) the last successful inject placed on top of OFP cargo.
   * An empty/ferry cabin can sit outside the envelope with nothing to shift;
   * Loaded vs Due adds this so preflight expects the weight Skyline applied.
   */
  injectBallastLb?: number;
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
    /**
     * Live MSFS vs mission origin (same 12 nm settle radius).
     * `ok: false` blocks manual Depart unless override.
     */
    location?: {
      ok: boolean;
      originIcao: string;
      distanceNm?: number;
      radiusNm: number;
      code: string;
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
  /** Live weather-ops bonus included in payoutUsd. */
  weatherBonusUsd?: number;
  /** Dest runway touchdown projection (catalog). */
  runwayTouch?: RunwayTouchdownSnapshot;
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
  /** Unique tail number / registration (e.g. PR-SKY, N208AS). */
  registration?: string;
  basedIcao: string;
  /** Dealer / listing country (`BR`). Used for board browse vs acquire. */
  countryId?: string;
  /** Sub-region of `basedIcao` (`BR-N`). */
  region?: string;
  /** Purchase price, or lease deposit (weeks of rent up front). */
  askingUsd: number;
  /** Weekly lease installment (field name legacy). */
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
  /** Weekly installment (field name legacy). */
  monthlyUsd: number;
  /** Economy tick when the next weekly debit is due. */
  nextDueTick: number;
  /** Economy tick when the lease term ends. */
  termEndsTick: number;
  buyoutUsd?: number;
  listingId?: string;
  /** ICAO where possession started — return ferry if elsewhere at term end. */
  startIcao?: string;
  /**
   * Term ended during a long offline catch-up — airframe kept for player
   * action (return/buyout) instead of silent repossess.
   */
  termEndedSoft?: boolean;
}

/** Income side when an NPC/market leases a player-listed airframe. */
export interface AircraftLeaseOutContract {
  /** Weekly installment paid to the owner (field name legacy). */
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

/** In-progress bush trip arc — not a Market MissionIntent. */
export type ActiveBushTrip = {
  tripId: string;
  /** 0-based index into the trip legs catalog. */
  legIndex: number;
  /**
   * Current-leg flight phase for Watch.
   * ready = on ground awaiting wheels-up; departed = airborne / settling.
   */
  legStatus: 'ready' | 'departed';
  status: 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  aircraftId: string;
  acceptedAtTick: number;
  /** Wall-clock when the current leg went wheels-up (Watch restore). */
  departedAtMs?: number;
  cancelledAtTick?: number;
  completedAtTick?: number;
};

export interface CareerMissionsState {
  version: 2;
  /** Company cash from settled freights (Slice 4). */
  walletUsd: number;
  missions: MissionIntent[];
  /** Owned freighters; empty for contract pilots until first buy/lease. */
  fleet: PlayerAircraft[];
  /** False until the player registers (name + home hub). */
  hubSelected: boolean;
  /** Display name from pilot signup; empty until registered. */
  pilotName: string;
  /** Home / starter hub ICAO; empty until registered. */
  homeHubIcao: string;
  /**
   * Where the pilot currently is (career hub). Independent of aircraft ferry.
   * Empty until registered; migrate from homeHubIcao.
   */
  pilotIcao?: string;
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
  /**
   * Aircraft class unlock ladder (starters → Jet|Medium → Narrow → Wide).
   * Gates buy/lease, accept, contract-pilot, and Freights board size.
   */
  classOps?: CareerClassOps;
  /** Revolving company credit line (Hangar cashflow). */
  companyCredit?: CompanyCreditState;
  /** Player-owned FBOs + bonded contract holds (spot inventory removed). */
  playerFbos?: PlayerFboState;
  /** Cargo bought at a seaport, waiting at the allocated pickup hub. */
  portPickups?: PlayerPortPickup[];
  /** Player warehouses at port pickup hubs + stock piles. */
  playerWarehouses?: PlayerWarehouseState;
  /** Endgame seaport concessions (company-owned leases). */
  playerPortConcessions?: PlayerPortConcession[];
  /** Company crew roster (AI slots based at an FBO). */
  companyCrew?: CompanyCrewState;
  /** Ground staff at player warehouses (ports / WH ops — not flight crew). */
  groundStaff?: GroundStaffState;
  /**
   * Lifetime ferry nm that already consumed the early-career soft fee budget.
   * First FERRY_SOFT_NM_BUDGET nm of ferry pay a reduced fee.
   */
  ferrySoftNmUsed?: number;
  /** Active Activities-style bush trip (parallel to Market missions). */
  activeBushTrip?: ActiveBushTrip;
  /**
   * Last economy tick this company was billed against (MP session watermark).
   * SP: updated after each catch-up fee settlement.
   */
  lastSeenTick?: number;
};

/** Player FBO ownership + bonded warehouse holds. */
export type PlayerFboTier = 1 | 2;

export interface PlayerFbo {
  id: string;
  icao: string;
  tier: PlayerFboTier;
  capacityKg: number;
}

export interface PlayerFboHold {
  id: string;
  fboId: string;
  lotId: string;
  commodityId: CommodityId;
  originIcao: string;
  destIcao: string;
  cargoKg: number;
  payUsd: number;
  urgency: ShipmentLot['urgency'];
  reason: string;
  acceptedAtTick: number;
  /** From lot.expiresAtTick — clock does not pause in storage. */
  deadlineTick: number;
  /** Great-circle origin→dest (nm); refreshed on reroute. */
  distanceNm?: number;
}

/**
 * Player-owned spot inventory at an FBO — **removed** from gameplay.
 * Kept for save normalize (stock wiped on load).
 */
export interface PlayerFboStockPile {
  id: string;
  fboId: string;
  commodityId: CommodityId;
  kg: number;
  avgCostUsdPerKg: number;
  acquiredAtTick: number;
}

export interface PlayerFboState {
  fbos: PlayerFbo[];
  holds: PlayerFboHold[];
  /** Always wiped empty — legacy field. */
  stock: PlayerFboStockPile[];
}

/** Player warehouse at a port pickup hub. */
export interface PlayerWarehouse {
  id: string;
  icao: string;
  capacityKg: number;
  tier: 1 | 2 | 3;
  /**
   * Lifetime kg delivered from this warehouse via Demand Board settle.
   * Used to unlock T1→T2 / T2→T3 upgrades (hybrid money + throughput).
   */
  lifetimeShippedKg?: number;
}

export interface PlayerWarehousePile {
  id: string;
  warehouseId: string;
  commodityId: CommodityId;
  kg: number;
  avgCostUsdPerKg: number;
  acquiredAtTick: number;
}

/**
 * Port buy cargo en route to a warehouse (not stock yet).
 * Settles into WH (or yard overflow) at readyAtTick.
 */
export interface WarehouseInboundTransfer {
  id: string;
  warehouseId: string;
  hubIcao: string;
  portId: string;
  listingId?: string;
  commodityId: CommodityId;
  kg: number;
  unitCostUsd: number;
  purchasedAtTick: number;
  readyAtTick: number;
}

/** Demand Board kg pledged at a warehouse without starting a flight. */
export interface PlayerDemandHold {
  id: string;
  /** `demand` claims world remainingKg; `bridge` is company WH→WH only. */
  kind?: 'demand' | 'bridge';
  /** Demand Board order id (`demand` holds). */
  orderId?: string;
  warehouseId: string;
  originIcao: string;
  destIcao: string;
  /** Dest warehouse id (`bridge` holds). */
  destWarehouseId?: string;
  commodityId: CommodityId;
  kg: number;
  /** Frozen USD/kg at hold (intl + demand desk). 0 on bridge. */
  unitPriceUsd: number;
  heldAtTick: number;
  expiresAtTick: number;
}

export interface PlayerWarehouseState {
  warehouses: PlayerWarehouse[];
  stock: PlayerWarehousePile[];
  /** Port→WH transfers in flight (slice 1 ground logistics). */
  inboundTransfers?: WarehouseInboundTransfer[];
  /** Company Demand holds (stock stays in piles; world remainingKg is claimed). */
  demandHolds?: PlayerDemandHold[];
}

/** Terminal buy-order on the Demand Board. */
export type DemandOrderStatus = 'open' | 'filled' | 'expired';

export interface DemandOrder {
  id: string;
  /**
   * Seaport desk this buy-order belongs to (per-port Demand board).
   * Missing on legacy rows — ensureDemandOrders expires those.
   */
  portId?: string;
  destIcao: string;
  commodityId: CommodityId;
  wantedKg: number;
  remainingKg: number;
  /** Max USD/kg the terminal will pay. */
  maxUnitPriceUsd: number;
  arrivedAtTick: number;
  expiresAtTick: number;
  status: DemandOrderStatus;
}

/** Open factory catalog row at a real-world seaport. */
export type PortListingStatus = 'open' | 'sold_out' | 'expired';

export interface PortListing {
  id: string;
  portId: string;
  commodityId: CommodityId;
  availableKg: number;
  /** Factory unit price (below typical hub spot). */
  unitPriceUsd: number;
  /** Career hub where purchased cargo waits for collection. */
  allocatedHubIcao: string;
  arrivedAtTick: number;
  expiresAtTick: number;
  status: PortListingStatus;
}

/** Passive warehouse stock at a seaport (feeds listings). */
export interface PortInventoryRow {
  portId: string;
  commodityId: CommodityId;
  stockKg: number;
  lastRestockTick: number;
}

/** Scheduled factory discharge (one ship per port). Cargo is computed on arrival. */
export interface PortInboundShip {
  portId: string;
  arrivesAtTick: number;
}

/** Company-owned seaport concession (endgame lease). */
export type PortConcessionLevel = 1 | 2 | 3;

/** World-side operator index (mirrors active company concessions). */
export interface PortConcessionIndexRow {
  portId: string;
  companyId: string;
  leasePaidThroughTick: number;
  level?: PortConcessionLevel;
}

export interface PlayerPortConcession {
  portId: string;
  companyId: string;
  /** P1 default; P2 enlarges yard cap. P3 reserved. */
  level: PortConcessionLevel;
  claimedAtTick: number;
  leasePaidThroughTick: number;
  /** Cumulative kg bought at this port by anyone while under this operator. */
  lifetimeThroughputKg: number;
  /** Economy-day index (`floor(tick/96)`) for `throughputWindowKg[0]`. */
  throughputWindowDay?: number;
  /** Last 7 economy days of port throughput, `[today, yesterday, …]`. */
  throughputWindowKg?: number[];
}

/**
 * Player-owned cargo still at the pickup hub (bought from a port).
 * Deposit into FBO spot only when FBO is at the same ICAO; cross-hub fly = later.
 */
export interface PlayerPortPickup {
  id: string;
  portId: string;
  listingId?: string;
  hubIcao: string;
  commodityId: CommodityId;
  kg: number;
  avgCostUsdPerKg: number;
  purchasedAtTick: number;
}

export type CompanyCrewStatus = 'idle' | 'airborne';

/** Concrete perks tied to Skyline loops (burn, wear, on-time, Value freight). */
export type CompanyCrewPerkId = 'fuel' | 'wear' | 'on_time' | 'value';

/** Candidate available to hire at the FBO hire desk (short pool, not a market board). */
export interface CompanyCrewCandidate {
  id: string;
  displayName: string;
  perkId: CompanyCrewPerkId;
  salaryUsdPerDay: number;
  /** One-time signing cost to hire. */
  hireUsd: number;
  /**
   * Portrait asset id under career-ui/public/crew/ (`man_1`…`woman_5`).
   * Assigned from display-name gender when missing.
   */
  portraitId?: string;
}

/** Named company crew slot — based at an FBO, not a limbo flag. */
export interface CompanyCrewMember {
  id: string;
  displayName: string;
  /** Employing FBO ICAO (home base). */
  baseIcao: string;
  /** Where they are now (idle snaps back to base after settle). */
  locationIcao: string;
  status: CompanyCrewStatus;
  missionId?: string;
  aircraftId?: string;
  lastFeeUsd?: number;
  perkId?: CompanyCrewPerkId;
  salaryUsdPerDay?: number;
  hiredAtTick?: number;
  /** Portrait asset id under career-ui/public/crew/ (`man_1`…`woman_5`). */
  portraitId?: string;
}

export interface CompanyCrewState {
  members: CompanyCrewMember[];
  /** Short hire desk at the crew base FBO. */
  hirePool?: CompanyCrewCandidate[];
  /** Economy day when hirePool was last rolled. */
  hirePoolDay?: number;
  hirePoolIcao?: string;
}

/**
 * Ground ops perks (warehouse / ports). v1 ships `logistics` + `yard`;
 * other ids are reserved for later slices.
 */
export type GroundStaffPerkId =
  | 'logistics'
  | 'yard'
  | 'procurement'
  | 'demand_desk'
  | 'wh_ops';

/**
 * Hire-desk quality band (people grades — not aircraft condition names).
 * Rolled once at hire and frozen on the member.
 */
export type GroundStaffGrade = 'ace' | 'solid' | 'capable' | 'green';

/** Candidate at a warehouse hire desk (short pool per pickup hub). */
export interface GroundStaffCandidate {
  id: string;
  displayName: string;
  perkId: GroundStaffPerkId;
  grade: GroundStaffGrade;
  /** 40–99 skill inside the grade band (frozen). */
  skillPct: number;
  /** Perk-specific effect multiplier (frozen; lower usually = stronger perk). */
  effectMult: number;
  salaryUsdPerDay: number;
  hireUsd: number;
  portraitId?: string;
}

/** Hired ground staff assigned to one player warehouse. */
export interface GroundStaffMember {
  id: string;
  displayName: string;
  warehouseId: string;
  hubIcao: string;
  perkId: GroundStaffPerkId;
  grade: GroundStaffGrade;
  skillPct: number;
  effectMult: number;
  salaryUsdPerDay: number;
  hiredAtTick: number;
  portraitId?: string;
}

export interface GroundStaffState {
  members: GroundStaffMember[];
  /** Hire desk candidates keyed by pickup hub ICAO. */
  hirePoolByHub?: Record<string, GroundStaffCandidate[]>;
  /** Economy day when each hub pool was last rolled. */
  hirePoolDayByHub?: Record<string, number>;
}


/** Persistent revolving credit balance on the company. */
export interface CompanyCreditState {
  /** Outstanding principal (includes compounded unpaid interest). */
  principalUsd: number;
  /** Consecutive economy days with unpaid interest (0 = current). */
  overdueDays: number;
  /** Last economy day index for which interest was settled. */
  lastSettledDayIndex: number;
}

/** Player-facing credit snapshot for UI / API. */
export interface CompanyCreditSnapshot {
  principalUsd: number;
  limitUsd: number;
  availableUsd: number;
  collateralUsd: number;
  repScore: number;
  overdueDays: number;
  dailyInterestUsd: number;
  lastSettledDayIndex: number;
}

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

/** Per-class progress toward the freighter unlock ladder. */
export interface ClassOpsClassState {
  unlocked: boolean;
  /** Accumulated block hours on non-empty freights of this class. */
  hours: number;
  /** Clean settles (on-time + score ≥ threshold) on this class. */
  cleans: number;
}

/**
 * Aircraft class ladder — Light starters → Jet | Medium → Narrow → Wide.
 * Medium is optional (parallel to Light jet).
 */
export interface CareerClassOps {
  classes: Record<FreighterClassId, ClassOpsClassState>;
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
  | 'lease_early_return'
  | 'aircraft_buy'
  | 'aircraft_delivery'
  | 'aircraft_import'
  | 'aircraft_lease_sign'
  | 'aircraft_sell'
  | 'aircraft_buyout'
  | 'fbo_buy'
  | 'fbo_storage'
  | 'fbo_hold_expire'
  | 'fbo_spot_buy'
  | 'fbo_spot_sale'
  | 'port_buy'
  | 'port_yard_hold'
  | 'port_concession_claim'
  | 'port_concession_lease'
  | 'port_concession_upgrade'
  | 'warehouse_buy'
  | 'warehouse_storage'
  | 'warehouse_upgrade'
  | 'demand_payout'
  | 'fbo_reroute'
  | 'crew_fee'
  | 'crew_salary'
  | 'crew_hire'
  | 'ground_staff_salary'
  | 'ground_staff_hire'
  | 'ground_staff_fire'
  | 'ferry'
  | 'pilot_travel'
  | 'fuel'
  | 'inspection'
  | 'repair'
  | 'credit_draw'
  | 'credit_repay'
  | 'credit_interest'
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
  /** Unique tail number shown on cards, dispatch, and market listings. */
  registration?: string;
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
