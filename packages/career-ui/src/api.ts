export type AircraftClass =
  | 'narrow_freighter'
  | 'wide_freighter'
  | 'medium_piston'
  | 'light_jet'
  | 'light_turboprop'
  | 'light_ga';

export type PlayerAircraft = {
  id: string;
  aircraftClassId: AircraftClass;
  airframeTypeId?: string;
  label: string;
  locationIcao: string;
  fuelKg: number;
  fuelCapacityKg: number;
  status: 'parked' | 'assigned' | 'maintenance' | 'listed' | 'leased_out';
  assignedMissionId?: string;
  ownership?: 'owned' | 'leased';
  condition?: 'excellent' | 'good' | 'fair' | 'tired';
  hoursAirframe?: number;
  hoursEngine?: number;
  maintenanceDueAtHours?: number;
  airframeConditionPct?: number;
  engineConditionPct?: number;
  hoursSinceInspection?: number;
  leaseOverdue?: boolean;
  lease?: {
    monthlyUsd: number;
    nextDueTick: number;
    termEndsTick: number;
    buyoutUsd?: number;
  };
  listedListingId?: string;
  leaseOut?: {
    monthlyUsd: number;
    nextDueTick: number;
    termEndsTick: number;
    depositUsd: number;
    listingId?: string;
    lesseeNpcId?: string;
    lesseeName?: string;
    startedAtTick?: number;
    lastWearTick?: number;
  };
  /** Daily hangar fee when parked/maintenance; null when exempt. */
  parkingUsdPerDay?: number | null;
};

export type CareerLedgerKind =
  | 'freight_payout'
  | 'hangar_parking'
  | 'lease_payment'
  | 'lease_out_income'
  | 'lease_deposit'
  | 'lease_early_return'
  | 'aircraft_buy'
  | 'aircraft_lease_sign'
  | 'aircraft_sell'
  | 'aircraft_buyout'
  | 'fbo_buy'
  | 'fbo_storage'
  | 'fbo_hold_expire'
  | 'fbo_spot_sale'
  | 'fbo_reroute'
  | 'crew_fee'
  | 'crew_salary'
  | 'crew_hire'
  | 'ferry'
  | 'fuel'
  | 'inspection'
  | 'repair'
  | 'other';

/** OnAir-style flight scorecard (mirrors @msfs-compat/shared FlightScoreSnapshot). */
export type FlightScoreMetric = {
  id: string;
  label: string;
  category: 'envelope' | 'taxi' | 'landing';
  points: number;
  maxPoints: number;
  detail?: string;
};

export type FlightScoreCategory = {
  id: 'envelope' | 'taxi' | 'landing';
  label: string;
  earned: number;
  max: number;
  metrics: FlightScoreMetric[];
};

export type FlightScoreSnapshot = {
  earned: number;
  max: number;
  pct: number;
  categories: FlightScoreCategory[];
};

export type CareerLedgerEntry = {
  id: string;
  atTick: number;
  dayIndex: number;
  amountUsd: number;
  kind: CareerLedgerKind;
  note?: string;
  aircraftId?: string;
  missionId?: string;
  icao?: string;
};

export type CareerLedgerSummary = {
  incomeUsd: number;
  expenseUsd: number;
  netUsd: number;
  entryCount: number;
  byKind?: Partial<Record<CareerLedgerKind, number>>;
};

export type CareerCashflowSnapshot = {
  week: CareerLedgerSummary;
  month: CareerLedgerSummary;
  allTime: CareerLedgerSummary;
  recent: CareerLedgerEntry[];
};

export type AircraftListing = {
  id: string;
  kind: 'new' | 'used' | 'lease';
  aircraftClassId: AircraftClass;
  airframeTypeId?: string;
  label: string;
  basedIcao: string;
  askingUsd: number;
  leaseMonthlyUsd?: number;
  leaseTermMonths?: number;
  condition: 'excellent' | 'good' | 'fair' | 'tired';
  hoursAirframe: number;
  hoursEngine: number;
  airframeConditionPct?: number;
  engineConditionPct?: number;
  expiresAtTick: number;
  status: string;
  source?: 'generated' | 'player_sale' | 'player_lease';
  sellerAircraftId?: string;
};

export type FerryQuote = {
  aircraftId: string;
  originIcao: string;
  destIcao: string;
  distanceNm: number;
  ferryFeeUsd: number;
  softNmApplied?: number;
  softNmRemaining?: number;
  fullRateFeeUsd?: number;
  fuelNeededKg: number;
  fuelUpliftKg: number;
  fuelCostUsd: number;
  fuelScarcity: 'ok' | 'partial' | 'dry';
  totalCostUsd: number;
};

export type PilotTravelQuote = {
  originIcao: string;
  destIcao: string;
  distanceNm: number;
  costUsd: number;
};

export type ClockSync = {
  serverNowMs: number;
  lastBatchAtMs: number;
  lastSyncedAtMs?: number;
  tick: number;
  continuousHours: number;
  msPerTick: number;
};

export type NpcClaim = {
  npcName: string;
  cargoKg: number;
  etaHours: number;
  etaMs?: number;
  arrivesAtMs?: number;
  crewNeeded?: boolean;
  pilotFeeUsd?: number;
  /** Min fee when partial lift airframes exist; omit or equal to pilotFeeUsd when fixed. */
  pilotFeeMinUsd?: number;
  awaitingPilotUntilMs?: number;
  airframeTypeId?: string;
  aircraftLabel?: string;
  aircraftClassId?: string;
};

export type NpcActivity = {
  id: string;
  npcId: string;
  npcName: string;
  originIcao: string;
  destIcao: string;
  commodityId?: string;
  commodityName: string;
  cargoKg: number;
  payUsd: number;
  distanceNm: number;
  etaHours: number;
  etaMs?: number;
  departedAtTick?: number;
  arrivesAtTick: number;
  departedAtMs?: number;
  arrivesAtMs?: number;
  urgency: string;
  aircraftClassId: string;
  airframeTypeId?: string;
  aircraftLabel?: string;
  homeRegion?: string;
  progressPct?: number;
  flightHours?: number;
  phase?: 'enroute' | 'arriving';
};

export type NpcMission = {
  flightId: string;
  lotId: string;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  commodityName: string;
  cargoKg: number;
  payUsd: number;
  distanceNm: number;
  departedAtTick: number;
  arrivesAtTick: number;
  departedAtMs?: number;
  arrivesAtMs?: number;
  etaHours: number;
  etaMs?: number;
  progressPct: number;
  flightHours: number;
  urgency: string;
  phase: 'enroute' | 'arriving';
  /** True when origin/dest countries differ. */
  international?: boolean;
};

export type NpcFleetMember = {
  id: string;
  name: string;
  aircraftClassId: string;
  aircraftLabel: string;
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
  mission?: NpcMission | null;
};

export type AirportMovement = {
  id: string;
  kind: 'npc' | 'player';
  operatorName: string;
  originIcao: string;
  destIcao: string;
  commodityName: string;
  cargoKg: number;
  payUsd: number;
  aircraftClassId: string;
  aircraftLabel?: string;
  phase: string;
  etaHours: number;
  etaMs?: number;
  progressPct: number;
  arrivesAtTick?: number;
  arrivesAtMs?: number;
  departedAtMs?: number;
  urgency: string;
  distanceNm?: number;
  crewOperated?: boolean;
};

export type RegionPressure = {
  region: string;
  capacity: number;
  thinFleet: boolean;
  ready: number;
  total: number;
  resting: number;
  maintenance?: number;
  weather?: 'fair' | 'marginal' | 'poor';
  /** Non-hub Jet-A average is low and no truck haul is inbound. */
  fuelThin?: boolean;
};

export type FuelHaulView = {
  id: string;
  truckId: string;
  truckName: string;
  truckClassId: string;
  truckLabel: string;
  originIcao: string;
  destIcao: string;
  cargoKg: number;
  departedAtMs: number;
  arrivesAtMs: number;
  etaMs: number;
  etaHours: number;
  progressPct: number;
  status: 'enroute' | 'completed';
  phase: 'enroute' | 'arriving' | 'delivered';
};

export type LotPressure = {
  originRegion: string;
  originRegionCapacity: number;
  laneSaturation: number;
  thinFleet: boolean;
  laneBusy: boolean;
  weather?: 'fair' | 'marginal' | 'poor';
  idleEscalated?: boolean;
  idlePayMult?: number;
  demandShock?: boolean;
  shockLabels?: string[];
  shockPayMult?: number;
  international?: boolean;
};

export type MarketLot = {
  id: string;
  originIcao: string;
  destIcao: string;
  originName: string;
  destName: string;
  distanceNm?: number;
  commodityId: string;
  commodityName: string;
  /** Full market lot size before reservations (optional for older API replies). */
  quantityKg?: number;
  availableKg: number;
  payUsd: number;
  /** Jet-A estimate for the board-selected aircraft (pay − fuel = net). */
  estimatedFuelCostUsd?: number | null;
  /** Pro-rated pay minus estimated Jet-A for the selected aircraft. */
  estimatedNetUsd?: number | null;
  estimatedLiftKg?: number | null;
  estimatedMarginPct?: number | null;
  estimatedFuelFeasible?: boolean | null;
  estimatedInRange?: boolean | null;
  urgency: 'normal' | 'urgent';
  reason: string;
  createdAtTick?: number;
  expiresAtTick: number;
  ticksRemaining?: number;
  perishable?: boolean;
  cargoLocked?: boolean;
  international?: boolean;
  pressure?: LotPressure | null;
  npcClaim?: NpcClaim | null;
};

export type OfpCheckFinding = {
  code: string;
  severity: string;
  message: string;
};

export type OfpBriefing = {
  aircraftIcao?: string;
  tailNumber?: string;
  distanceNm?: number;
  blockTime?: string;
  airTime?: string;
  cruiseAltitudeFt?: number;
  alternateIcao?: string;
  route?: string;
  waypoints?: Array<{
    ident: string;
    lat: number;
    lon: number;
    type?: string;
  }>;
};

export type MissionLotLine = {
  shipmentLotId: string;
  commodityId: string;
  cargoKg: number;
  payUsd: number;
  urgency: string;
  reason: string;
  deadlineTick: number;
};

export type Mission = {
  id: string;
  status: string;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  cargoKg: number;
  payUsd: number;
  payoutUsd?: number;
  urgency: string;
  aircraftClassId: string;
  /** Concrete Market airframe assigned to this flight. */
  airframeTypeId?: string;
  /** Preferred OFP load path for this class (manual always allowed). */
  loadMethod?: 'native-simbrief' | 'direct-injection';
  /** True when Skyline can inject fuel/payload for this class. */
  injectCapable?: boolean;
  aircraftId?: string;
  deadlineTick: number;
  reason: string;
  acceptedAtTick?: number;
  dispatchedAtTick?: number;
  departedAtTick?: number;
  airborneAtMs?: number;
  expectedRouteMs?: number;
  settledAtTick?: number;
  /** Company crew (AI) operating this leg. */
  crewOperated?: boolean;
  crewMemberId?: string;
  crewFeeUsd?: number;
  /** Fly an NPC homologated airframe for a pilot fee (no owned aircraft). */
  contractPilot?: boolean;
  contractPilotFeeUsd?: number;
  contractGrossPayUsd?: number;
  operatorNpcId?: string;
  operatorNpcName?: string;
  npcFlightId?: string;
  /** Empty return fee quoted at dispatch (charged when return starts). */
  crewReturnFeeUsd?: number;
  crewRoundTrip?: boolean;
  crewDeadhead?: boolean;
  crewReturnIcao?: string;
  crewOutboundMissionId?: string;
  settledFuelKg?: number;
  /** Touchdown vertical speed (fpm), typically negative. */
  settledLandingFpm?: number;
  /** Airborne wall-clock duration when settled (ms). */
  settledFlightDurationMs?: number;
  /** Watch flight scorecard from the completed leg. */
  settledFlightScore?: FlightScoreSnapshot;
  staticId?: string;
  lots?: MissionLotLine[];
  shipmentLotId?: string;
  fuelUplift?: {
    originIcao: string;
    requestedKg: number;
    deliveredKg: number;
    unitPriceUsd: number;
    costUsd: number;
    scarcity: 'ok' | 'partial' | 'dry';
    upliftedAtTick: number;
  };
  fuelAuthorizedOfpId?: string;
  lastOfpCheck?: {
    verdict: 'pass' | 'warn' | 'fail';
    summary: string;
    checkedAtIso: string;
    ofpId?: string;
    staticId?: string;
    briefing?: OfpBriefing;
    plannedBlockFuelKg?: number;
    findings: OfpCheckFinding[];
  };
  lastPreflightCheck?: {
    verdict: 'pass' | 'warn' | 'fail';
    summary: string;
    checkedAtIso: string;
    phase?: string;
    loadVerification?: {
      ready: boolean;
      fuel: {
        plannedLb?: number;
        liveLb: number;
        ok: boolean;
        tanks?: {
          left: number;
          right: number;
          center: number;
          leftAux?: number;
          rightAux?: number;
          leftTip?: number;
          rightTip?: number;
        };
        tankCapacity?: {
          left: number;
          right: number;
          center: number;
          leftAux?: number;
          rightAux?: number;
          leftTip?: number;
          rightTip?: number;
        };
      };
      payload: {
        plannedLb?: number;
        /** Mission cargo in Due (excludes crew floor). */
        cargoLb?: number;
        /** Crew floor in Due (n × 170 lb) — cargo soft-capped on crew seats stays in cargoLb. */
        crewLb?: number;
        liveLb?: number;
        ok: boolean;
        stations?: Record<number, number>;
        stationMax?: Record<number, number>;
      };
      aircraft: {
        onGround: boolean;
        enginesRunning: boolean;
      };
      cg?: {
        liveMac?: number;
        minMac?: number;
        maxMac?: number;
        ok: boolean;
        severity: 'info' | 'warn';
      };
      weightNoteCount: number;
    };
    findings: OfpCheckFinding[];
  };
};

export type AirportCommodity = {
  commodityId: string;
  name: string;
  kind?: 'cargo' | 'fuel' | 'mro';
  perishable: boolean;
  highValue: boolean;
  stockKg: number;
  capacityKg: number;
  stockTonnes: number;
  capacityTonnes: number;
  fillPct: number;
  balance: 'surplus' | 'shortage' | 'balanced';
  trend?: 'rising' | 'falling' | 'stable';
  productionPerTickKg: number;
  consumptionPerTickKg: number;
  unitPriceUsd: number;
};

export type AirportLot = {
  id: string;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  commodityName: string;
  availableKg: number;
  quantityKg?: number;
  reservedKg?: number;
  payUsd: number;
  /** Jet-A estimate for the board-selected aircraft (pay − fuel = net). */
  estimatedFuelCostUsd?: number | null;
  /** Pro-rated pay minus estimated Jet-A for the selected aircraft. */
  estimatedNetUsd?: number | null;
  estimatedLiftKg?: number | null;
  estimatedMarginPct?: number | null;
  estimatedFuelFeasible?: boolean | null;
  estimatedInRange?: boolean | null;
  urgency: string;
  status: string;
  createdAtTick: number;
  expiresAtTick: number;
  ticksRemaining: number;
  expired: boolean;
  perishable: boolean;
  distanceNm?: number;
  reason: string;
  npcClaim?: NpcClaim | null;
};

export type EconomyEvent = {
  id: string;
  kind: string;
  region: string;
  commodityId?: string;
  startsAtTick: number;
  endsAtTick: number;
  label: string;
};

export type PlayerFboHold = {
  id: string;
  fboId: string;
  lotId: string;
  commodityId: string;
  originIcao: string;
  destIcao: string;
  cargoKg: number;
  payUsd: number;
  urgency: 'normal' | 'urgent';
  reason: string;
  acceptedAtTick: number;
  deadlineTick: number;
  distanceNm?: number;
};

export type PlayerFboSnapshot = {
  fbos: Array<{
    id: string;
    icao: string;
    tier: number;
    capacityKg: number;
    usedKg: number;
    canUpgradeToTier2?: boolean;
    upgradeUsd?: number | null;
    parkingFeeMult?: number;
    serviceCostMult?: number;
  }>;
  holds: PlayerFboHold[];
  canBuyAtHome: boolean;
  homeBuyUsd: number | null;
  canBuyAtIcao?: boolean;
  buyAtIcaoUsd?: number | null;
  buyAtIcaoReason?: string | null;
  phase1MaxOwned: number;
  maxOwned?: number;
};

export type CompanyCrewSnapshot = {
  slotsUnlocked: number;
  slotsInUse: number;
  slotsFree: number;
  rosterSlotsFree?: number;
  slotsMax?: number;
  feeFrac: number;
  baseIcao?: string | null;
  members?: Array<{
    id: string;
    displayName: string;
    baseIcao: string;
    locationIcao: string;
    status: 'idle' | 'airborne';
    missionId?: string;
    aircraftId?: string;
    lastFeeUsd?: number;
    perkId?: 'fuel' | 'wear' | 'on_time' | 'value';
    perkLabel?: string;
    perkHint?: string;
    salaryUsdPerDay?: number;
    portraitId?: string;
    originIcao?: string;
    destIcao?: string;
    airborneAtMs?: number;
    expectedRouteMs?: number;
    arrivesAtMs?: number;
  }>;
  hirePool?: Array<{
    id: string;
    displayName: string;
    perkId: 'fuel' | 'wear' | 'on_time' | 'value';
    perkLabel: string;
    perkHint: string;
    salaryUsdPerDay: number;
    hireUsd: number;
    portraitId?: string;
  }>;
  hirePoolDay?: number;
  inFlight: Array<{
    missionId: string;
    originIcao: string;
    destIcao: string;
    aircraftId?: string;
    crewMemberId?: string;
    airborneAtMs?: number;
    expectedRouteMs?: number;
    arrivesAtMs?: number;
    crewFeeUsd?: number;
    crewDeadhead?: boolean;
    crewRoundTrip?: boolean;
    crewReturnIcao?: string;
  }>;
};

export type AirportView = ClockSync & {
  airport: {
    icao: string;
    name: string;
    region: string;
    level: number;
    lat?: number;
    lon?: number;
    hubTier?: 'major' | 'regional' | 'spoke';
  };
  hubLevel?: {
    level: number;
    xp: number;
    xpIntoLevel: number;
    xpForNext: number | null;
    progressPct: number;
    capacityMult: number;
    flowMult: number;
    laneBonus: number;
    originPayMult: number;
    quiet: boolean;
  };
  events?: EconomyEvent[];
  totalStockKg: number;
  totalStockTonnes: number;
  commodities: AirportCommodity[];
  outboundLots: AirportLot[];
  inboundLots: AirportLot[];
  arrivals?: AirportMovement[];
  departures?: AirportMovement[];
  npcActivity?: NpcActivity[];
  fuelInbound?: FuelHaulView[];
  fuelRecent?: FuelHaulView[];
  fuelHaulsEnroute?: number;
  playerFbos?: PlayerFboSnapshot | null;
  homeHubIcao?: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export type CargoOpsCommodityId =
  | 'general'
  | 'supplies'
  | 'electronics'
  | 'perishables'
  | 'machinery';

export type CargoOpsCommodityState = {
  unlocked: boolean;
  rep: number;
  settlesOk: number;
};

export type CareerCargoOps = {
  commodities: Record<CargoOpsCommodityId, CargoOpsCommodityState>;
};

export type CargoOpsDelta = {
  commodityId: CargoOpsCommodityId;
  deltaRep: number;
  repBefore: number;
  repAfter: number;
  settlesOkAfter: number;
  unlockedNow: boolean;
  clean: boolean;
};

export type CompanyCreditSnapshot = {
  principalUsd: number;
  limitUsd: number;
  availableUsd: number;
  collateralUsd: number;
  repScore: number;
  overdueDays: number;
  dailyInterestUsd: number;
  lastSettledDayIndex: number;
};

export type StarterHubOption = {
  icao: string;
  name: string;
  region: string;
  hubTier: 'major' | 'regional' | 'spoke';
};

export function fetchState() {
  return api<
    ClockSync & {
      seed: string;
      airportCount: number;
      walletUsd: number;
      activeMissions: number;
      npcFleet?: number;
      npcBusy?: number;
      npcFlights?: number;
      hubSelected?: boolean;
      fleet?: PlayerAircraft[];
      hubs?: StarterHubOption[];
      pilotName?: string;
      homeHubIcao?: string;
      pilotIcao?: string;
      cashflow?: CareerCashflowSnapshot;
      companyCredit?: CompanyCreditSnapshot;
      cargoOps?: CareerCargoOps | null;
      playerFbos?: PlayerFboSnapshot | null;
      companyCrew?: CompanyCrewSnapshot | null;
      leaseUnlock?: AircraftLeaseUnlock;
      starterAircraft?: Array<{
        typeId: string;
        label: string;
        aircraftClassId: AircraftClass;
        simbriefIcao: string;
      }>;
    }
  >('/api/state');
}

export function fetchCashflow() {
  return api<
    CareerCashflowSnapshot & {
      walletUsd: number;
      tick: number;
      dayIndex: number;
      labels?: Record<string, string>;
      companyCredit?: CompanyCreditSnapshot;
    }
  >('/api/cashflow');
}

export function postCreditDraw(amountUsd: number) {
  return api<{
    walletUsd: number;
    drawnUsd: number;
    companyCredit: CompanyCreditSnapshot;
    fleet?: PlayerAircraft[];
  }>('/api/credit/draw', {
    method: 'POST',
    body: JSON.stringify({ amountUsd }),
  });
}

export function postCreditRepay(amountUsd: number) {
  return api<{
    walletUsd: number;
    repaidUsd: number;
    companyCredit: CompanyCreditSnapshot;
    fleet?: PlayerAircraft[];
  }>('/api/credit/repay', {
    method: 'POST',
    body: JSON.stringify({ amountUsd }),
  });
}

export function fetchMarket(
  aircraft?: AircraftClass,
  opts: {
    query?: string;
    originQuery?: string;
    destQuery?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    distanceMaxNm?: number | string;
    commodity?: string;
    loadMaxKg?: number | string;
    expiresWithinHours?: number | string;
    minPayUsd?: number | string;
    /** Concrete Market airframe for fuel/payload estimates. */
    airframe?: string;
    /** Keep lots with estimated net > 0 (requires aircraft). */
    profitableOnly?: boolean;
    /** Keep unlocked + in-range + liftable lots (requires aircraft). */
    viableOnly?: boolean;
    /** Cargo Ops: open = unlocked only, locked = locked only. */
    access?: 'open' | 'locked' | '';
    /** Route scope: intl = cross-country, domestic = same country. */
    lane?: 'intl' | 'domestic' | '';
  } = {},
) {
  const params = new URLSearchParams();
  if (aircraft) params.set('aircraft', aircraft);
  const airframe = opts.airframe?.trim();
  if (airframe) params.set('airframe', airframe);
  if (opts.profitableOnly) params.set('profitableOnly', '1');
  if (opts.viableOnly) params.set('viableOnly', '1');
  const query = opts.query?.trim();
  if (query) params.set('q', query);
  const originQuery = opts.originQuery?.trim();
  if (originQuery) params.set('originQ', originQuery);
  const destQuery = opts.destQuery?.trim();
  if (destQuery) params.set('destQ', destQuery);
  if (opts.page !== undefined) params.set('page', String(opts.page));
  if (opts.pageSize !== undefined) params.set('pageSize', String(opts.pageSize));
  if (opts.sort) params.set('sort', opts.sort);
  const distanceMaxNm = String(opts.distanceMaxNm ?? '').trim();
  if (distanceMaxNm) params.set('distanceMaxNm', distanceMaxNm);
  if (opts.commodity) params.set('commodity', opts.commodity);
  const loadMaxKg = String(opts.loadMaxKg ?? '').trim();
  if (loadMaxKg) params.set('loadMaxKg', loadMaxKg);
  const expiresWithinHours = String(opts.expiresWithinHours ?? '').trim();
  if (expiresWithinHours) params.set('expiresWithinHours', expiresWithinHours);
  const minPayUsd = String(opts.minPayUsd ?? '').trim();
  if (minPayUsd) params.set('minPayUsd', minPayUsd);
  const access = String(opts.access ?? '').trim();
  if (access === 'open' || access === 'locked') params.set('access', access);
  const lane = String(opts.lane ?? '').trim();
  if (lane === 'intl' || lane === 'domestic') params.set('lane', lane);
  const qs = params.toString();
  return api<
    ClockSync & {
      lots: MarketLot[];
      totalLots?: number;
      page?: number;
      pageSize?: number;
      pageCount?: number;
      lotLimit?: number;
      npcActivity?: NpcActivity[];
      regionPressure?: RegionPressure[];
      events?: EconomyEvent[];
      maxCargoKg?: number | null;
      maxCargoSource?: string | null;
      airframeLabel?: string | null;
      airframeTypeId?: string | null;
    }
  >(`/api/market${qs ? `?${qs}` : ''}`);
}

/** Fetch every available lot for one exact route (not the global 200-row slice). */
export function fetchRouteLots(originIcao: string, destIcao: string) {
  const qs = new URLSearchParams({
    origin: originIcao.trim().toUpperCase(),
    dest: destIcao.trim().toUpperCase(),
  });
  return api<ClockSync & { lots: MarketLot[] }>(`/api/market?${qs.toString()}`);
}

export function fetchCargoLimit(
  aircraft: AircraftClass,
  distanceNm?: number,
  airframeTypeId?: string,
  opts: { originIcao?: string; destIcao?: string } = {},
) {
  const qs = new URLSearchParams({ aircraft });
  if (airframeTypeId) qs.set('airframe', airframeTypeId);
  if (distanceNm !== undefined && Number.isFinite(distanceNm)) {
    qs.set('distanceNm', String(distanceNm));
  }
  const origin = opts.originIcao?.trim().toUpperCase();
  if (origin) qs.set('origin', origin);
  const dest = opts.destIcao?.trim().toUpperCase();
  if (dest) qs.set('dest', dest);
  return api<{
    aircraftClassId: AircraftClass;
    maxCargoKg: number;
    maxCargoSource: string;
    airframeLabel: string;
    oewKg?: number | null;
    mtowKg?: number | null;
    operationalMaxCargoKg: number;
    estimatedBlockFuelKg?: number | null;
    fuelCapacityKg?: number | null;
    fuelDeficitKg?: number | null;
    fuelFeasible?: boolean | null;
    estimatedFuelCostUsd?: number | null;
    estimatedFuelUnitPriceUsd?: number | null;
    estimatedFuelScarcity?: 'ok' | 'partial' | 'dry' | null;
  }>(`/api/cargo-limit?${qs.toString()}`);
}

export function fetchNpcFleet() {
  return api<
    ClockSync & {
      fleetSize: number;
      busy: number;
      airborne: number;
      turnaround: number;
      resting: number;
      maintenance?: number;
      idle: number;
      regionPressure?: RegionPressure[];
      fleet: NpcFleetMember[];
      activity: NpcActivity[];
    }
  >('/api/npc');
}

export function fetchAirport(
  icao: string,
  opts: {
    aircraft?: AircraftClass;
    airframe?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (opts.aircraft) params.set('aircraft', opts.aircraft);
  const airframe = opts.airframe?.trim();
  if (airframe) params.set('airframe', airframe);
  const qs = params.toString();
  return api<AirportView>(
    `/api/airport/${encodeURIComponent(icao.trim().toUpperCase())}${
      qs ? `?${qs}` : ''
    }`,
  );
}

export type NetworkHub = {
  icao: string;
  name: string;
  region: string;
  hubTier: 'major' | 'regional' | 'spoke';
  lat: number;
  lon: number;
  level?: number;
};

export function fetchNetworkHubs() {
  return api<{ homeHubIcao: string | null; hubs: NetworkHub[] }>('/api/hubs');
}

export function fetchMissions() {
  return api<{ walletUsd: number; missions: Mission[] }>('/api/missions');
}

/** Advance economy batches; default one 15-min tick. */
export function postTick(n = 1) {
  return api<{
    tick: number;
    availableLots: number;
    leasePaidUsd?: number;
    leaseRepossessed?: string[];
    hangarDebitUsd?: number;
    hangarRequestedUsd?: number;
    hangarShortfallUsd?: number;
    hangarDaysCharged?: number;
    creditInterestPaidUsd?: number;
    creditInterestCompoundedUsd?: number;
    creditOverdueDays?: number;
    creditPrincipalUsd?: number;
    companyCredit?: CompanyCreditSnapshot;
    walletUsd?: number;
  }>('/api/tick', {
    method: 'POST',
    body: JSON.stringify({ n }),
  });
}

/** Temporary test aid — credits the career wallet (default +$100k). */
export function postDebugCreditWallet(amountUsd = 100_000) {
  return api<{ walletUsd: number; creditedUsd: number }>(
    '/api/debug/credit-wallet',
    {
      method: 'POST',
      body: JSON.stringify({ amountUsd }),
    },
  );
}

export function postInitBrazil() {
  return api<{
    tick: number;
    seed: string;
    airports: number;
    availableLots?: number;
  }>('/api/init', {
    method: 'POST',
    body: JSON.stringify({ resetMissions: true }),
  });
}

export function postAccept(opts: {
  lotId: string;
  kg?: number;
  aircraft: AircraftClass;
  missionId?: string;
}) {
  return api<{
    mission: Mission;
    walletUsd: number;
    maxCargoKg?: number;
    structuralMaxCargoKg?: number;
    operationalMaxCargoKg?: number;
    estimatedBlockFuelKg?: number;
    maxCargoSource?: string;
    appended?: boolean;
    remainingKg?: number;
  }>('/api/accept', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postContractPilotAccept(opts: {
  lotId?: string;
  npcFlightId?: string;
  airframeTypeId: string;
  openDispatch?: boolean;
}) {
  return api<{
    mission: Mission;
    pilotFeeUsd: number;
    grossPayUsd?: number;
    npcName?: string;
    airframeLabel?: string;
    liftedKg?: number;
    remainderKg?: number;
    npcDepartedWithRemainder?: boolean;
    pilotRelocatedFrom?: string | null;
    pilotIcao?: string;
    walletUsd: number;
    dispatchError?: string | null;
    dispatch?: {
      url: string;
      staticId: string;
      type: string;
      airframeLabel: string;
      opened: boolean;
    } | null;
  }>('/api/contract-pilot/accept', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function fetchContractPilotOptions(opts: {
  lotId?: string;
  npcFlightId?: string;
}) {
  const q = new URLSearchParams();
  if (opts.lotId) q.set('lotId', opts.lotId);
  if (opts.npcFlightId) q.set('npcFlightId', opts.npcFlightId);
  return api<{
    offer: {
      lotId: string;
      npcFlightId: string;
      originIcao: string;
      destIcao: string;
      aircraftClassId: string;
      cargoKg: number;
      payUsd: number;
      distanceNm?: number | null;
      pilotFeeUsd: number;
      awaitingPilotUntilMs?: number;
    };
    airframes: Array<{
      typeId: string;
      label: string;
      aircraftClassId: string;
      maxCargoKg: number;
      operationalMaxCargoKg: number;
      liftKg: number;
      remainderKg: number;
      coversOffer: boolean;
      routeLimited: boolean;
      pilotFeeUsd: number;
    }>;
  }>(`/api/contract-pilot/options?${q.toString()}`);
}

export function postStagingCommit(opts: {
  aircraft: AircraftClass;
  aircraftId?: string;
  missionId?: string;
  openDispatch?: boolean;
  replace?: boolean;
  weightSystem?: 'metric' | 'imperial';
  lines: Array<{ lotId: string; cargoKg: number }>;
}) {
  return api<{
    mission: Mission;
    walletUsd: number;
    maxCargoKg?: number;
    structuralMaxCargoKg?: number;
    operationalMaxCargoKg?: number;
    estimatedBlockFuelKg?: number;
    maxCargoSource?: string;
    appended?: boolean;
    replaced?: boolean;
    lineCount?: number;
    remainingKg?: number;
    fleet?: PlayerAircraft[];
    dispatchError?: string | null;
    dispatch?: {
      url: string;
      staticId: string;
      type: string;
      airframeLabel: string;
      opened: boolean;
    } | null;
  }>('/api/staging/commit', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postSelectHub(opts: {
  icao: string;
  pilotName: string;
  /** Legacy / optional — omitted for contract-pilot signup (empty hangar). */
  airframeTypeId?: string;
}) {
  return api<{
    walletUsd: number;
    hubSelected: boolean;
    fleet: PlayerAircraft[];
    hubs: StarterHubOption[];
    pilotName: string;
    homeHubIcao: string;
    pilotIcao?: string;
    homeCountryId: string | null;
    contractPilotCareer?: boolean;
    starterAircraft: Array<{
      typeId: string;
      label: string;
      aircraftClassId: AircraftClass;
      simbriefIcao: string;
    }>;
  }>('/api/fleet/select-hub', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export type AircraftDeliveryQuoteView = {
  deliverToIcao: string;
  basedIcao: string;
  distanceNm: number;
  deliveryFeeUsd: number;
  needed: boolean;
};

export type AircraftLeaseUnlock = {
  current: number;
  required: number;
  remaining: number;
  unlocked: boolean;
  hint: string;
};

export function fetchAircraftMarket() {
  return api<
    ClockSync & {
      walletUsd: number;
      dayIndex: number;
      listings: AircraftListing[];
      deliveryTargetIcao?: string;
      deliveryQuotes?: Record<string, AircraftDeliveryQuoteView>;
      ferrySoftNmUsed?: number;
      ferrySoftNmBudget?: number;
      catalog: Array<{
        id: AircraftClass;
        name: string;
        msrpUsd: number;
        leaseMonthlyUsd: number;
        maxCargoKg: number;
        maxRangeNm: number;
      }>;
      airframePerf?: Record<
        string,
        {
          maxCargoKg: number;
          maxRangeNm: number;
          cruiseFuelFlowKgPerHour?: number;
          cruiseSpeedKt?: number;
          fuelBurnKgPerNm: number;
        }
      >;
      fleet: PlayerAircraft[];
      leaseUnlock?: AircraftLeaseUnlock;
    }
  >('/api/aircraft-market');
}

export function postAircraftBuy(opts: {
  listingId: string;
  deliver?: boolean;
  deliverToIcao?: string;
}) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    deliveryFeeUsd?: number;
    aircraft: PlayerAircraft;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
  }>('/api/aircraft-market/buy', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftLease(opts: {
  listingId: string;
  deliver?: boolean;
  deliverToIcao?: string;
}) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    deliveryFeeUsd?: number;
    aircraft: PlayerAircraft;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
    leaseUnlock?: AircraftLeaseUnlock;
  }>('/api/aircraft-market/lease', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftSell(opts: { aircraftId: string }) {
  return api<{
    walletUsd: number;
    creditUsd: number;
    listing: AircraftListing;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
  }>('/api/aircraft-market/sell', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftListLease(opts: {
  aircraftId: string;
  termMonths?: 6 | 12;
}) {
  return api<{
    walletUsd: number;
    listing: AircraftListing;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
  }>('/api/aircraft-market/list-lease', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftUnlist(opts: { aircraftId: string }) {
  return api<{
    walletUsd: number;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
  }>('/api/aircraft-market/unlist', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export type MroPartsQuote = {
  icao: string;
  requestedKg: number;
  fromTerminalKg: number;
  shortfallKg: number;
  unitPriceUsd: number;
  partsCostUsd: number;
  laborSurcharge: number;
  scarcity: 'ok' | 'partial' | 'dry';
  stockKg: number;
  capacityKg: number;
};

export function postAircraftMaintenance(opts: { aircraftId: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    needsRepair?: boolean;
    mro?: MroPartsQuote;
    fleet: PlayerAircraft[];
  }>('/api/aircraft-market/maintenance', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftRepair(opts: {
  aircraftId: string;
  airframePts?: number;
  enginePts?: number;
}) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    aircraft: PlayerAircraft;
    mro?: MroPartsQuote;
    fleet: PlayerAircraft[];
  }>('/api/aircraft-market/repair', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftBuyout(opts: { aircraftId: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    fleet: PlayerAircraft[];
  }>('/api/aircraft-market/buyout', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftReturnLease(opts: { aircraftId: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    remainingMonths: number;
    fleet: PlayerAircraft[];
  }>('/api/aircraft-market/return-lease', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboBuy(opts?: { icao?: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    fbo: { id: string; icao: string; tier: number; capacityKg: number };
    playerFbos: PlayerFboSnapshot;
    companyCrew?: CompanyCrewSnapshot;
  }>('/api/fbo/buy', {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  });
}

export function postFboUpgrade(opts: { fboId: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    fbo: { id: string; icao: string; tier: number; capacityKg: number };
    playerFbos: PlayerFboSnapshot;
    companyCrew?: CompanyCrewSnapshot;
    fleet?: PlayerAircraft[];
  }>('/api/fbo/upgrade', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboHold(opts: { lotId: string; cargoKg?: number }) {
  return api<{
    hold: PlayerFboHold;
    playerFbos: PlayerFboSnapshot;
    walletUsd: number;
  }>('/api/fbo/hold', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboCancelHold(opts: { holdId: string }) {
  return api<{
    releasedKg: number;
    playerFbos: PlayerFboSnapshot;
    walletUsd: number;
  }>('/api/fbo/cancel-hold', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboReroute(opts: {
  holdId: string;
  destIcao: string;
  quoteOnly?: boolean;
}) {
  return api<{
    quoteOnly: boolean;
    feeUsd: number;
    debitUsd?: number;
    payAfterUsd?: number;
    haircutApplied?: boolean;
    bumpApplied?: boolean;
    bumpFrac?: number;
    previousDestIcao: string;
    destIcao: string;
    hold?: PlayerFboHold;
    playerFbos: PlayerFboSnapshot;
    walletUsd: number;
  }>('/api/fbo/reroute', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboRelease(opts: {
  holdId: string;
  aircraft?: AircraftClass;
  aircraftId?: string;
}) {
  return api<{
    mission: Mission;
    playerFbos: PlayerFboSnapshot;
    walletUsd: number;
    missions: Mission[];
  }>('/api/fbo/release', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboSplit(opts: {
  holdId: string;
  legs: Array<{ aircraftId: string; cargoKg: number }>;
}) {
  return api<{
    missions: Mission[];
    hold: PlayerFboHold | null;
    allocatedKg: number;
    remainingKg: number;
    playerFbos: PlayerFboSnapshot;
    fleet: PlayerAircraft[];
    walletUsd: number;
    allMissions: Mission[];
  }>('/api/fbo/split', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFboReturnMission(opts: { missionId: string }) {
  return api<{
    mission: Mission;
    hold: PlayerFboHold;
    merged: boolean;
    playerFbos: PlayerFboSnapshot;
    fleet: PlayerAircraft[];
    walletUsd: number;
    missions: Mission[];
  }>('/api/fbo/return-mission', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postCrewAssign(opts: {
  missionId: string;
  crewMemberId: string;
}) {
  return api<{
    mission: Mission;
    companyCrew: CompanyCrewSnapshot;
    missions: Mission[];
  }>('/api/crew/assign', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postCrewDispatch(opts: {
  missionId?: string;
  holdId?: string;
  aircraftId?: string;
  crewMemberId?: string;
}) {
  return api<{
    mission: Mission;
    crewFeeUsd: number;
    returnFeeUsd: number;
    totalRoundTripFeeUsd: number;
    fuelDebitUsd: number;
    walletUsd: number;
    fleet: PlayerAircraft[];
    playerFbos: PlayerFboSnapshot;
    companyCrew: CompanyCrewSnapshot;
    missions: Mission[];
  }>('/api/crew/dispatch', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postCrewHire(opts: { candidateId: string }) {
  return api<{
    member: NonNullable<CompanyCrewSnapshot['members']>[number];
    debitUsd: number;
    walletUsd: number;
    companyCrew: CompanyCrewSnapshot;
  }>('/api/crew/hire', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postCrewFire(opts: { memberId: string }) {
  return api<{
    member: NonNullable<CompanyCrewSnapshot['members']>[number];
    walletUsd: number;
    companyCrew: CompanyCrewSnapshot;
  }>('/api/crew/fire', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postFerry(opts: {
  aircraftId: string;
  destIcao: string;
  quoteOnly?: boolean;
}) {
  return api<{
    quote: FerryQuote;
    aircraft?: PlayerAircraft;
    walletDebitUsd?: number;
    walletUsd: number;
    hubSelected?: boolean;
    fleet?: PlayerAircraft[];
    hubs?: StarterHubOption[];
    pilotIcao?: string;
  }>('/api/fleet/ferry', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export type FerryPlanLeg = {
  from: string;
  to: string;
  distanceNm: number;
};

export type FerryPlanView = {
  arrived: boolean;
  plan: {
    originIcao: string;
    finalDestIcao: string;
    hops: string[];
    legs: FerryPlanLeg[];
    totalDistanceNm: number;
    legCount: number;
    maxRangeNm: number;
    hopRangeNm: number;
  } | null;
  nextLeg: FerryPlanLeg | null;
  nextQuote: FerryQuote | null;
  remainingNm: number;
  initialNm: number;
  progressPct: number;
  legIndex: number;
  legCount: number;
  maxRangeNm: number;
  walletUsd: number;
  aircraftLocationIcao: string;
};

export function fetchFerryPlan(opts: {
  aircraftId: string;
  destIcao: string;
  journeyOrigin?: string;
}) {
  const qs = new URLSearchParams({
    aircraftId: opts.aircraftId,
    dest: opts.destIcao.trim().toUpperCase(),
  });
  const journey = opts.journeyOrigin?.trim().toUpperCase();
  if (journey) qs.set('journeyOrigin', journey);
  return api<FerryPlanView>(`/api/fleet/ferry-plan?${qs.toString()}`);
}

export function postPilotTravel(opts: {
  destIcao: string;
  quoteOnly?: boolean;
}) {
  return api<{
    quote: PilotTravelQuote;
    walletDebitUsd?: number;
    walletUsd: number;
    pilotIcao?: string;
    hubSelected?: boolean;
    fleet?: PlayerAircraft[];
    hubs?: StarterHubOption[];
  }>('/api/pilot/travel', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postCancel(opts: { missionId: string }) {
  return api<{
    mission: Mission;
    walletUsd: number;
    releasedKg: number;
    returnedToMarket: boolean;
    warning?: string | null;
  }>('/api/cancel', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postDispatch(opts: {
  missionId: string;
  open?: boolean;
  weightSystem?: 'metric' | 'imperial';
}) {
  return api<{
    mission: Mission;
    url: string;
    staticId: string;
    type: string;
    airframeLabel: string;
    cargoThousands?: number;
    units?: 'KGS' | 'LBS';
    opened: boolean;
  }>('/api/dispatch', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postConfirmOfp(opts: {
  missionId: string;
  simbriefUser?: string;
  simbriefUserid?: string;
}) {
  return api<{
    mission: Mission;
    summary: string;
    check: { verdict: 'pass' | 'warn' | 'fail'; findings: OfpCheckFinding[] };
    ofp: {
      originIcao?: string;
      destIcao?: string;
      icao?: string;
      cargoKg?: number;
      passengerCount?: number;
      blockFuel?: number;
      ofpId?: string;
      briefing: OfpBriefing;
      navlogDiag?: {
        present: boolean;
        fixCount: number;
        withCoords: number;
        topKeys: string[];
      };
    };
  }>('/api/confirm-ofp', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export type MissionFuelQuote = {
  aircraftId: string;
  originIcao: string;
  ofpId: string;
  requiredBlockFuelKg: number;
  currentFuelKg: number;
  fuelCapacityKg: number;
  shortfallKg: number;
  authorized: boolean;
  uplift: {
    originIcao: string;
    requestedKg: number;
    availableKg: number;
    unitPriceUsd: number;
    costUsd: number;
    scarcity: 'ok' | 'partial' | 'dry';
    distanceNm: number;
  };
};

export function postFuelQuote(missionId: string) {
  return api<{
    quote: MissionFuelQuote;
    walletUsd: number;
    walletAfterUsd: number;
  }>('/api/fuel/quote', {
    method: 'POST',
    body: JSON.stringify({ missionId }),
  });
}

export function postFuelPurchase(missionId: string) {
  return api<{
    mission: Mission;
    quote: MissionFuelQuote;
    fuelDebitUsd: number;
    walletUsd: number;
    fleet: PlayerAircraft[];
  }>('/api/fuel/purchase', {
    method: 'POST',
    body: JSON.stringify({ missionId }),
  });
}

export type MissionSettlement = {
  payoutUsd: number;
  penaltyUsd: number;
  lateTicks: number;
  onTime: boolean;
  deliveredKg: number;
  residualFuelKg: number | null;
  /** Touchdown vertical speed (fpm), typically negative. */
  landingFpm?: number | null;
  /** Airborne wall-clock duration (ms). */
  flightDurationMs?: number | null;
  /** Flight scorecard from Watch telemetry. */
  flightScore?: FlightScoreSnapshot | null;
  /** Cargo Ops ladder deltas from this settle. */
  cargoOpsDeltas?: CargoOpsDelta[];
};

export type WatchEvent =
  | { type: 'depart'; reason: string }
  | { type: 'settle'; reason: string }
  | { type: 'settle_blocked'; reason: string; distanceNm?: number }
  | { type: 'none' };

export type WatchStatus = {
  running: boolean;
  missionId: string | null;
  missionStatus: string | null;
  phase: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  groundSpeedKt?: number | null;
  position: { lat: number; lon: number } | null;
  liveFuelLb?: number | null;
  livePayloadLb?: number | null;
  loadVerification?: {
    ready: boolean;
    fuel: {
      plannedLb?: number;
      liveLb: number;
      ok: boolean;
      tanks?: {
        left: number;
        right: number;
        center: number;
        leftAux?: number;
        rightAux?: number;
        leftTip?: number;
        rightTip?: number;
      };
      tankCapacity?: {
        left: number;
        right: number;
        center: number;
        leftAux?: number;
        rightAux?: number;
        leftTip?: number;
        rightTip?: number;
      };
    };
    payload: {
      plannedLb?: number;
      cargoLb?: number;
      crewLb?: number;
      liveLb?: number;
      ok: boolean;
      stations?: Record<number, number>;
      stationMax?: Record<number, number>;
    };
  } | null;
  sawAirborne: boolean;
  lastEvent: WatchEvent | null;
  lastEventAtIso: string | null;
  lastError: string | null;
  /** False when Watch is running but the named-pipe socket dropped. */
  pipeConnected?: boolean;
  settlement: MissionSettlement | null;
  walletUsd: number | null;
  autoDepart: boolean;
  autoSettle: boolean;
  intervalSec: number;
  /** Effective Watch poll interval for the current flight phase (ms). */
  intervalMs?: number;
  allowDepartOverride?: boolean;
  flightTime?: {
    airborneAtMs: number;
    expectedRouteMs: number;
    requiredMs: number;
    elapsedMs: number;
    ratio: number;
    met: boolean;
  } | null;
  cruiseSample?: {
    phase: 'idle' | 'collecting' | 'locked';
    elapsedMs: number;
    requiredMs: number;
    tasKt?: number;
    fuelFlowKgPerHour?: number;
    committed?: {
      cruiseSpeedKt: number;
      cruiseFuelFlowKgPerHour: number;
      fuelBurnKgPerNm: number;
      sampleCount: number;
      durationSec: number;
      committedAtMs: number;
    };
  } | null;
};

export function postDepart(opts: { missionId: string; override?: boolean }) {
  return api<{
    mission: Mission;
    walletUsd: number;
    fuelDebitUsd?: number;
    preflightOverride?: boolean;
  }>('/api/depart', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postPreflight(opts: {
  missionId: string;
  simbriefUser?: string;
  simbriefUserid?: string;
}) {
  return api<{
    mission: Mission;
    summary: string;
    check: {
      verdict: 'pass' | 'warn' | 'fail';
      summary: string;
      checkedAtIso: string;
      phase: string;
      loadVerification: NonNullable<Mission['lastPreflightCheck']>['loadVerification'];
      findings: OfpCheckFinding[];
    };
    ofp: {
      originIcao?: string;
      destIcao?: string;
      icao?: string;
      cargoKg?: number;
      passengerCount?: number;
      blockFuel?: number;
      ofpId?: string;
    };
    live: {
      fuelTotalLb: number;
      fuelSource: string;
      payloadTotalLb?: number;
      payloadSource?: string;
      emptyLb?: number;
      zfwLb?: number;
      grossLb?: number;
      weightSource?: string;
      onGround: boolean;
      enginesRunning: boolean;
    };
  }>('/api/preflight', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postSettle(opts: { missionId: string }) {
  return api<{
    mission: Mission;
    walletUsd: number;
    settlement: MissionSettlement;
  }>('/api/settle', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function fetchWatchStatus() {
  return api<WatchStatus>('/api/watch/status');
}

export function postWatchStart(opts: {
  missionId: string;
  intervalSec?: number;
  autoDepart?: boolean;
  autoSettle?: boolean;
  requireEnginesOff?: boolean;
  requireDestProximity?: boolean;
  settleRadiusNm?: number;
  allowDepartOverride?: boolean;
}) {
  return api<WatchStatus>('/api/watch/start', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postWatchStop() {
  return api<WatchStatus>('/api/watch/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export type SimBridgeStatus = {
  connected: boolean;
  mode: string | null;
  aircraftTitle: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  parkingBrake: boolean | null;
  phase: string | null;
  groundSpeedKt?: number | null;
  source: 'watch' | 'probe';
  error: string | null;
  checkedAtIso: string;
};

export function fetchSimBridgeStatus() {
  return api<SimBridgeStatus>('/api/simbridge/status');
}

export type OfpLoadResult = {
  ok: boolean;
  mission: Mission;
  plan: {
    blockFuelLb: number;
    cargoLb: number;
    fuelUnit: string;
    tankCapacityTotal: number;
    baggageCapacityLb: number;
    preservedStations: number[];
    baggageStations: number[];
    plan: {
      fuel?: { tanks?: Record<string, number> };
      payload?: { stations?: Record<number, number>; total?: number };
    };
  };
  identity: {
    title: string;
    publisher?: string;
    icao?: string;
  };
  profileKey: string;
  fingerprint: string;
  rolledBack: boolean;
  rollbackOk: boolean | null;
  compareSummary: string | null;
  compareVerdict: 'pass' | 'warn' | 'fail' | null;
  cgRebalanceMoves?: number;
  preflight: {
    check: {
      verdict: 'pass' | 'warn' | 'fail';
      summary: string;
      checkedAtIso: string;
      phase: string;
      loadVerification: NonNullable<Mission['lastPreflightCheck']>['loadVerification'];
      findings: OfpCheckFinding[];
    };
    ofp: {
      cargoKg?: number;
      blockFuel?: number;
      ofpId?: string;
    };
    live: {
      fuelTotalLb: number;
      payloadTotalLb?: number;
      onGround: boolean;
      enginesRunning: boolean;
    };
  } | null;
  error: string | null;
};

export type OfpLoadProgress = {
  missionId: string;
  phase: 'planning' | 'injecting' | 'balancing' | 'verifying' | 'done' | 'failed';
  message: string;
  cgAttempt?: number;
  cgMaxAttempts?: number;
  liveMac?: number;
  liveFuelLb?: number;
  livePayloadLb?: number;
  liveTanks?: {
    left: number;
    right: number;
    center: number;
    leftAux?: number;
    rightAux?: number;
    leftTip?: number;
    rightTip?: number;
  };
  tankCapacity?: {
    left: number;
    right: number;
    center: number;
    leftAux?: number;
    rightAux?: number;
    leftTip?: number;
    rightTip?: number;
  };
  liveStations?: Record<number, number>;
  stationMax?: Record<number, number>;
  plannedFuelLb?: number;
  plannedPayloadLb?: number;
  updatedAtIso: string;
};

export function fetchLoadOfpProgress(missionId: string) {
  return api<{ progress: OfpLoadProgress | null }>(
    `/api/load-ofp/progress?missionId=${encodeURIComponent(missionId)}`,
  );
}

export function postCancelLoadOfp(missionId: string) {
  return api<{
    ok: boolean;
    accepted: boolean;
    progress: OfpLoadProgress | null;
  }>('/api/load-ofp/cancel', {
    method: 'POST',
    body: JSON.stringify({ missionId }),
  });
}

export function postLoadOfp(
  opts: {
    missionId: string;
    simbriefUser?: string;
    simbriefUserid?: string;
    runPreflightAfter?: boolean;
  },
  init?: { signal?: AbortSignal },
) {
  return (async () => {
    const res = await fetch('/api/load-ofp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
      signal: init?.signal,
    });
    const data = (await res.json()) as OfpLoadResult & { error?: string };
    // Soft apply failures still return a structured body with ok:false.
    if (typeof data.ok === 'boolean') {
      return data;
    }
    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data;
  })();
}
