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
  registration?: string;
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
    termEndedSoft?: boolean;
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
  | 'fbo_spot_buy'
  | 'fbo_spot_sale'
  | 'port_buy'
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

/** Live weather-ops score from Watch (mirrors shared WeatherOpsSnapshot). */
export type WeatherOpsSnapshot = {
  avgScore: number;
  bonusFrac: number;
  sampleCount: number;
  approachSampleCount: number;
  airborneMs: number;
  avgHeadwindKt: number;
  avgVisM: number | null;
  rainFraction: number;
  minApproachVisM: number | null;
  eligible: boolean;
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
  registration?: string;
  basedIcao: string;
  countryId?: string;
  region?: string;
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
  /** Empty NPC deadhead home — not a freight haul. */
  crewReposition?: boolean;
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
  laneBusy?: boolean;
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
  /** Soft-field bush OD (light GA only; no ferry; same-country gateways). */
  bush?: boolean;
  cargoLocked?: boolean;
  classLocked?: boolean;
  crewNeeded?: boolean;
  crewClassId?: string;
  lastMile?: boolean;
  idleEscalated?: boolean;
  international?: boolean;
  pressure?: LotPressure | null;
  npcClaim?: NpcClaim | null;
};

export type OfpCheckFinding = {
  code: string;
  severity: string;
  message: string;
  expected?: number;
  actual?: number;
  delta?: number;
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
  /** Full market lot kg (survives reserved lots dropping off the board). */
  lotQuantityKg?: number;
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
  /** Contract-pilot empty deadhead (NPC home reposition). */
  contractPilotReposition?: boolean;
  contractPilotFeeUsd?: number;
  contractGrossPayUsd?: number;
  operatorNpcId?: string;
  operatorNpcName?: string;
  npcFlightId?: string;
  /** Empty return fee quoted at dispatch (charged when return starts). */
  crewReturnFeeUsd?: number;
  crewRoundTrip?: boolean;
  crewDeadhead?: boolean;
  /** Player empty reposition (no freight) — Hangar → Plan empty flight. */
  emptyFlight?: boolean;
  /** Demand Board mission (warehouse → terminal). */
  demandOrderId?: string;
  warehouseId?: string;
  warehouseAvgCostUsdPerKg?: number;
  /**
   * Max kg allowed when editing a Demand Board flight (onboard + WH headroom).
   * Enriched by /api/missions.
   */
  demandEditMaxKg?: number;
  /** Great-circle / network route distance (enriched by /api/missions). */
  distanceNm?: number;
  /** Catalog airframe label (enriched by /api/missions). */
  airframeLabel?: string;
  crewReturnIcao?: string;
  crewOutboundMissionId?: string;
  settledFuelKg?: number;
  /** Touchdown vertical speed (fpm), typically negative. */
  settledLandingFpm?: number;
  /** Airborne wall-clock duration when settled (ms). */
  settledFlightDurationMs?: number;
  /** Watch flight scorecard from the completed leg. */
  settledFlightScore?: FlightScoreSnapshot;
  /** Live weather-ops score from Watch ambient samples. */
  settledWeatherOps?: WeatherOpsSnapshot;
  /** Extra wallet credit from weather-ops bonus (USD). */
  settledWeatherBonusUsd?: number;
  settledTouchdownLat?: number;
  settledTouchdownLon?: number;
  settledRunwayTouch?: RunwayTouchdownSnapshot;
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
  ofpCheckSeq?: number;
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
        /** SimBrief OFP taxi fuel (lb) used as Loaded vs Due undershoot slack. */
        taxiBurnLb?: number;
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
        /** Nominal crew floor before empty-station adjust. */
        crewFloorLb?: number;
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
    /**
     * Live MSFS vs mission origin (settle radius). Blocks Depart when ok=false
     * unless override.
     */
    location?: {
      ok: boolean;
      originIcao: string;
      distanceNm?: number;
      radiusNm: number;
      code: string;
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
  bush?: boolean;
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

export type PlayerFboStockPile = {
  id: string;
  fboId: string;
  commodityId: string;
  kg: number;
  avgCostUsdPerKg: number;
  acquiredAtTick: number;
};

export type PlayerFboSnapshot = {
  fbos: Array<{
    id: string;
    icao: string;
    tier: number;
    capacityKg: number;
    usedKg: number;
    bondedKg?: number;
    spotKg?: number;
    canUpgradeToTier2?: boolean;
    upgradeUsd?: number | null;
    parkingFeeMult?: number;
    serviceCostMult?: number;
  }>;
  holds: PlayerFboHold[];
  stock?: PlayerFboStockPile[];
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

export type GroundStaffPerkId =
  | 'logistics'
  | 'yard'
  | 'procurement'
  | 'demand_desk'
  | 'wh_ops';

export type GroundStaffGrade = 'ace' | 'solid' | 'capable' | 'green';

type GroundStaffPersonView = {
  id: string;
  displayName: string;
  warehouseId?: string;
  hubIcao?: string;
  perkId: GroundStaffPerkId;
  grade?: GroundStaffGrade;
  skillPct?: number;
  effectMult?: number;
  salaryUsdPerDay: number;
  hireUsd?: number;
  hiredAtTick?: number;
  portraitId?: string;
  perkLabel: string;
  perkHint: string;
  gradeLabel?: string;
  /** Severance debit if fired (members only). */
  fireSeveranceUsd?: number;
};

export type GroundStaffSnapshot = {
  members: Array<
    GroundStaffPersonView & {
      warehouseId: string;
      hubIcao: string;
      hiredAtTick: number;
    }
  >;
  hirePoolByHub: Record<string, GroundStaffPersonView[]>;
  hirePoolDayByHub: Record<string, number>;
  byWarehouse: Record<
    string,
    {
      warehouseId: string;
      hubIcao: string;
      tier: 1 | 2 | 3;
      slotsUnlocked: number;
      slotsUsed: number;
      slotsFree: number;
      logisticsActive: boolean;
      logisticsMult: number;
      yardActive?: boolean;
      yardHoldMult?: number;
      procurementActive?: boolean;
      procurementMult?: number;
      demandDeskActive?: boolean;
      demandDeskMult?: number;
      whOpsActive?: boolean;
      whOpsCapexMult?: number;
      whOpsShippedMult?: number;
      members: Array<
        GroundStaffPersonView & {
          warehouseId: string;
          hubIcao: string;
          hiredAtTick: number;
        }
      >;
    }
  >;
};

export type CareerRunwaySurface =
  | 'asphalt'
  | 'concrete'
  | 'grass'
  | 'gravel'
  | 'dirt'
  | 'water'
  | 'other';

export type CareerRunway = {
  ident: string;
  identReciprocal?: string;
  headingTrueDeg: number;
  lengthM: number;
  widthM: number;
  lat: number;
  lon: number;
  surface?: CareerRunwaySurface;
  lighted?: boolean;
};

/** Dest runway projection at touchdown (from settle). */
export type RunwayTouchdownSnapshot = {
  lat: number;
  lon: number;
  icao: string;
  runwayIdent: string;
  runwayIdentReciprocal?: string;
  lengthM: number;
  widthM: number;
  headingTrueDeg: number;
  lighted?: boolean;
  alongM: number;
  lateralM: number;
  pastThresholdM: number;
  onPavement: boolean;
  landingEnd: 'primary' | 'reciprocal';
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
    bush?: boolean;
    bushTripOnly?: boolean;
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
  /** Curated runway strips for this hub (empty if unknown). */
  runways?: CareerRunway[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    if (localStorage.getItem('skyline.devMode') === '1') {
      headers['X-Skyline-Dev-Mode'] = '1';
    }
  } catch {
    /* ignore */
  }
  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
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

export type ClassOpsClassState = {
  unlocked: boolean;
  hours: number;
  cleans: number;
};

export type CareerClassOps = {
  classes: Record<AircraftClass, ClassOpsClassState>;
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
  bush?: boolean;
  bushTripOnly?: boolean;
};

export function fetchState() {
  return api<
    ClockSync & {
      needsProfile?: boolean;
      activeProfileId?: string | null;
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
      classOps?: CareerClassOps | null;
      playerFbos?: PlayerFboSnapshot | null;
      companyCrew?: CompanyCrewSnapshot | null;
      groundStaff?: GroundStaffSnapshot | null;
      leaseUnlock?: AircraftLeaseUnlock;
      offlineFeeSummary?: OfflineFeeSummary | null;
      starterAircraft?: Array<{
        typeId: string;
        label: string;
        aircraftClassId: AircraftClass;
        simbriefIcao: string;
      }>;
    }
  >('/api/state');
}

export type OfflineFeeSummary = {
  daysAway: number;
  daysBilled: number;
  capped: boolean;
  passiveDebitUsd: number;
  debitUsdByKind?: Partial<{
    hangar: number;
    warehouse: number;
    yard: number;
    fboStorage: number;
    crewSalary: number;
    groundStaffSalary: number;
  }>;
  lease?: {
    installmentsPaid: number;
    overdueIds: string[];
    termEndedSoftIds: string[];
    repossessedIds: string[];
  };
};

export type CareerProfileMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export function fetchCareerProfiles() {
  return api<{
    activeId: string | null;
    profiles: CareerProfileMeta[];
  }>('/api/profiles');
}

export function postCareerProfileCreate(name: string) {
  return api<{
    profile: CareerProfileMeta;
    profiles: CareerProfileMeta[];
  }>('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function postCareerProfileSelect(id: string) {
  return api<{
    activeId: string;
    profile: CareerProfileMeta | null;
    profiles: CareerProfileMeta[];
  }>('/api/profiles/select', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export function postCareerProfileClear() {
  return api<{
    activeId: null;
    profiles: CareerProfileMeta[];
  }>('/api/profiles/clear', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function postCareerProfileRename(id: string, name: string) {
  return api<{ profile: CareerProfileMeta }>(
    `/api/profiles/${encodeURIComponent(id)}/rename`,
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    },
  );
}

export function deleteCareerProfile(id: string) {
  return api<{
    profiles: CareerProfileMeta[];
    activeId: string | null;
  }>(`/api/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
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
    loadMinKg?: number | string;
    loadMaxKg?: number | string;
    expiresWithinHours?: number | string;
    minPayUsd?: number | string;
    /** Concrete Market airframe for fuel/payload estimates. */
    airframe?: string;
    /** Keep lots with estimated net > 0 (requires aircraft). */
    profitableOnly?: boolean;
    /** Keep unlocked + in-range + liftable lots. Empty hangar: crew + last-mile. */
    viableOnly?: boolean;
    /** Focus ICAO for Near me (origins within nearMaxNm). */
    nearIcao?: string;
    /** Max nm from nearIcao to lot origin. */
    nearMaxNm?: number | string;
    /** Cargo Ops: open = unlocked only, locked = locked only. */
    access?: 'open' | 'locked' | '';
    /** Route scope: intl = cross-country, domestic = same country. */
    lane?: 'intl' | 'domestic' | 'bush' | '';
    /** Crew needed vs own-aircraft freights. */
    crew?: 'crew' | 'aircraft' | '';
  } = {},
) {
  const params = new URLSearchParams();
  if (aircraft) params.set('aircraft', aircraft);
  const airframe = opts.airframe?.trim();
  if (airframe) params.set('airframe', airframe);
  if (opts.profitableOnly) params.set('profitableOnly', '1');
  if (opts.viableOnly) params.set('viableOnly', '1');
  const nearIcao = opts.nearIcao?.trim().toUpperCase();
  if (nearIcao) params.set('nearIcao', nearIcao);
  const nearMaxNm = String(opts.nearMaxNm ?? '').trim();
  if (nearMaxNm) params.set('nearMaxNm', nearMaxNm);
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
  const loadMinKg = String(opts.loadMinKg ?? '').trim();
  if (loadMinKg) params.set('loadMinKg', loadMinKg);
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
  const crew = String(opts.crew ?? '').trim();
  if (crew === 'crew' || crew === 'aircraft') params.set('crew', crew);
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
  opts: {
    originIcao?: string;
    destIcao?: string;
    aircraftId?: string;
  } = {},
) {
  const qs = new URLSearchParams({ aircraft });
  if (airframeTypeId) qs.set('airframe', airframeTypeId);
  if (opts.aircraftId?.trim()) qs.set('aircraftId', opts.aircraftId.trim());
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
    distanceNm?: number | null;
    estimatedBlockFuelKg?: number | null;
    fuelCapacityKg?: number | null;
    fuelDeficitKg?: number | null;
    fuelFeasible?: boolean | null;
    estimatedFuelCostUsd?: number | null;
    estimatedFuelUnitPriceUsd?: number | null;
    estimatedFuelScarcity?: 'ok' | 'partial' | 'dry' | null;
    fuelBurnMult?: number;
    mxFuelBurn?: {
      mult: number;
      excessPct: number;
      conditionPct: number;
      blockFuelKg?: number;
      baseBlockFuelKg?: number | null;
      exceedsTank?: boolean;
      deficitKg?: number;
    } | null;
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

export async function fetchSatelliteMapStyle() {
  return api<{ apiKey: string | null; styleUrl: string | null }>(
    '/api/map/satellite-style',
    {
      cache: 'no-store',
    },
  );
}

export function fetchAirport(
  icao: string,
  opts: {
    aircraft?: AircraftClass;
    airframe?: string;
    /** Hub + stock only — skips lots / NPC / estimates. */
    part?: 'stock';
  } = {},
) {
  const params = new URLSearchParams();
  if (opts.aircraft) params.set('aircraft', opts.aircraft);
  const airframe = opts.airframe?.trim();
  if (airframe) params.set('airframe', airframe);
  if (opts.part) params.set('part', opts.part);
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
  bush?: boolean;
  bushTripOnly?: boolean;
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
    lastBatchAtMs?: number;
    serverNowMs?: number;
    continuousHours?: number;
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

/** Temporary test aid — credits the career wallet (default +$1M). */
export function postDebugCreditWallet(amountUsd = 1_000_000) {
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
    remainderOpenOnBoard?: boolean;
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

export type ContractPilotOptions = {
  offer: {
    lotId: string;
    npcFlightId: string;
    originIcao: string;
    destIcao: string;
    aircraftClassId: string;
    cargoKg: number;
    payUsd: number;
    distanceNm?: number | null;
    crewReposition?: boolean;
    pilotFeeUsd: number;
    awaitingPilotUntilMs?: number;
  };
  airframes: ContractPilotPickAirframe[];
};

export type ContractPilotPickAirframe = {
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
};

export function fetchContractPilotOptions(opts: {
  lotId?: string;
  npcFlightId?: string;
  signal?: AbortSignal;
}) {
  const q = new URLSearchParams();
  if (opts.lotId) q.set('lotId', opts.lotId);
  if (opts.npcFlightId) q.set('npcFlightId', opts.npcFlightId);
  return api<ContractPilotOptions>(`/api/contract-pilot/options?${q.toString()}`, {
    signal: opts.signal,
  });
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
  crossBorder?: boolean;
};

export type AircraftLeaseUnlock = {
  current: number;
  required: number;
  remaining: number;
  unlocked: boolean;
  hint: string;
};

export type AircraftMarketPoolCountry = {
  countryId: string;
  count: number;
};

export const AIRCRAFT_MARKET_NEAR_NM = 400;

export function fetchAircraftMarket(opts?: { country?: string }) {
  const country = opts?.country?.trim().toUpperCase();
  const q =
    country && (country === 'WORLD' || country.length === 2)
      ? `?country=${encodeURIComponent(country)}`
      : '';
  return api<
    ClockSync & {
      walletUsd: number;
      dayIndex: number;
      listings: AircraftListing[];
      homeCountryId?: string;
      browseCountryId?: string;
      acquireEnabled?: boolean;
      poolCountries?: AircraftMarketPoolCountry[];
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
  >(`/api/aircraft-market${q}`);
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
    restockId?: string;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
  }>('/api/aircraft-market/sell', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftListSale(opts: {
  aircraftId: string;
  askingUsd: number;
}) {
  return api<{
    walletUsd: number;
    listing: AircraftListing;
    fleet: PlayerAircraft[];
    listings: AircraftListing[];
  }>('/api/aircraft-market/list-sale', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAircraftListLease(opts: {
  aircraftId: string;
  termMonths?: number;
  monthlyUsd?: number;
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

export type PortListingView = {
  id: string;
  portId: string;
  commodityId: string;
  commodityName?: string;
  availableKg: number;
  unitPriceUsd: number;
  allocatedHubIcao: string;
  arrivedAtTick: number;
  expiresAtTick: number;
  status: string;
  hubSpotUnitPriceUsd: number | null;
};

export type PlayerPortPickupView = {
  id: string;
  portId: string;
  listingId?: string;
  hubIcao: string;
  commodityId: string;
  commodityName?: string;
  kg: number;
  avgCostUsdPerKg: number;
  purchasedAtTick: number;
  /** Daily yard hold fee for this lot ($/economy-day). */
  holdUsdPerDay?: number;
  /** Whole economy days since purchase. */
  heldDays?: number;
};

export type PortsSnapshot = {
  ports: Array<{
    id: string;
    name: string;
    countryId: string;
    lat: number;
    lon: number;
    pickupHubs: string[];
    pickupHubDetails?: Array<{
      icao: string;
      lat: number;
      lon: number;
      name?: string;
    }>;
    listings: PortListingView[];
    inventory?: Array<{
      commodityId: string;
      commodityName: string;
      stockKg: number;
      capKg: number;
    }>;
    inbound?: {
      arrivesAtTick: number;
      ticksLeft: number;
      totalKg: number;
      cargo: Array<{
        commodityId: string;
        commodityName: string;
        kg: number;
      }>;
    } | null;
    concession?: {
      status: 'vacant' | 'yours' | 'held';
      companyId: string | null;
      level?: 1 | 2 | 3 | null;
      leasePaidThroughTick: number | null;
      lifetimeThroughputKg: number | null;
      recentThroughputKg?: number | null;
      renewLeaseUsd?: number | null;
      claim: {
        ok: boolean;
        reasons: string[];
        claimUsd: number;
        leaseUsd: number;
        leaseDays: number;
        shippedKg: number;
        shippedNeededKg: number;
        hasTier3Warehouse: boolean;
        alreadyHoldsConcession: boolean;
        portOccupied: boolean;
      } | null;
      upgrade?: {
        ok: boolean;
        reasons: string[];
        upgradeUsd: number;
        neededKg: number;
        shippedKg: number;
        fromLevel: number;
        toLevel: number;
      } | null;
    };
  }>;
  pickups: PlayerPortPickupView[];
  /** Sum of daily yard hold fees across all pickups. */
  yardHoldUsdPerDay?: number;
  /** Economy tick at snapshot (inbound ETA). */
  tick?: number;
  warehouses?: PlayerWarehouseSnapshot;
  demand?: DemandSnapshot;
  groundStaff?: GroundStaffSnapshot;
  ownedFbos?: Array<{
    id: string;
    icao: string;
    lat: number;
    lon: number;
    name?: string;
    tier: number;
  }>;
  concessions?: Array<{
    portId: string;
    companyId: string;
    level: number;
    claimedAtTick: number;
    leasePaidThroughTick: number;
    lifetimeThroughputKg: number;
  }>;
};

export type PlayerWarehouseView = {
  id: string;
  icao: string;
  capacityKg: number;
  tier: 1 | 2 | 3;
  usedKg: number;
  freeKg: number;
  /** Kg reserved in port→WH inbound transfers. */
  inboundKg?: number;
  /** Free after stock + inbound reservation. */
  inboundFreeKg?: number;
  lifetimeShippedKg?: number;
  /** @deprecated Prefer shippedNeededForNextTierKg. */
  shippedNeededForT2Kg?: number;
  shippedNeededForNextTierKg?: number;
  nextTier?: 2 | 3 | null;
  upgradeUsd?: number | null;
  canUpgrade?: boolean;
  hubTier?: 'spoke' | 'regional' | 'major';
  /** ISO country from hub region (for Demand intl). */
  countryId?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type PlayerWarehousePileView = {
  id: string;
  warehouseId: string;
  commodityId: string;
  kg: number;
  avgCostUsdPerKg: number;
  acquiredAtTick: number;
};

export type WarehouseInboundTransferView = {
  id: string;
  warehouseId: string;
  hubIcao: string;
  portId: string;
  listingId?: string;
  commodityId: string;
  kg: number;
  unitCostUsd: number;
  purchasedAtTick: number;
  readyAtTick: number;
};

export type PlayerDemandHoldView = {
  id: string;
  orderId: string;
  warehouseId: string;
  originIcao: string;
  destIcao: string;
  commodityId: string;
  kg: number;
  unitPriceUsd: number;
  heldAtTick: number;
  expiresAtTick: number;
};

export type PlayerWarehouseSnapshot = {
  warehouses: PlayerWarehouseView[];
  stock: PlayerWarehousePileView[];
  inboundTransfers?: WarehouseInboundTransferView[];
  demandHolds?: PlayerDemandHoldView[];
  pickupHubs: string[];
  buyUsdByIcao?: Record<string, number>;
  groundStaff?: GroundStaffSnapshot;
};

export type DemandOrderView = {
  id: string;
  destIcao: string;
  /** Hub / airport display name for Dest tooltips. */
  destName?: string;
  /** ISO country of dest hub (Demand intl). */
  destCountryId?: string | null;
  destLat?: number | null;
  destLon?: number | null;
  commodityId: string;
  commodityName: string;
  wantedKg: number;
  remainingKg: number;
  maxUnitPriceUsd: number;
  arrivedAtTick: number;
  expiresAtTick: number;
  status: string;
  localSpotUsd: number | null;
};

export type DemandSnapshot = {
  orders: DemandOrderView[];
  warehouses?: PlayerWarehouseSnapshot;
};

export function fetchPorts() {
  return api<PortsSnapshot>('/api/ports');
}

export function postPortBuy(opts: { listingId: string; kg: number }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    unitPriceUsd: number;
    kg: number;
    storedKg: number;
    inboundKg?: number;
    yardKg: number;
    transferTicks?: number;
    readyAtTick?: number | null;
    pickup: PlayerPortPickupView | null;
    inboundTransfer?: WarehouseInboundTransferView | null;
    warehousePile: PlayerWarehousePileView | null;
    ports: PortsSnapshot;
    warehouses: PlayerWarehouseSnapshot;
  }>('/api/ports/buy', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postPortConcessionClaim(opts: { portId: string }) {
  return api<{
    walletUsd: number;
    concession: {
      portId: string;
      companyId: string;
      level: number;
      claimedAtTick: number;
      leasePaidThroughTick: number;
      lifetimeThroughputKg: number;
    };
    ports: PortsSnapshot;
  }>('/api/ports/concession/claim', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postPortConcessionRenew(opts: {
  portId: string;
  days?: number;
}) {
  return api<{
    walletUsd: number;
    concession: {
      portId: string;
      companyId: string;
      level: number;
      claimedAtTick: number;
      leasePaidThroughTick: number;
      lifetimeThroughputKg: number;
    };
    ports: PortsSnapshot;
  }>('/api/ports/concession/renew', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postPortConcessionUpgrade(opts: { portId: string }) {
  return api<{
    walletUsd: number;
    concession: {
      portId: string;
      companyId: string;
      level: number;
      claimedAtTick: number;
      leasePaidThroughTick: number;
      lifetimeThroughputKg: number;
    };
    ports: PortsSnapshot;
  }>('/api/ports/concession/upgrade', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postPortDeposit(opts: { pickupId: string; kg?: number }) {
  return api<{
    walletUsd: number;
    kg: number;
    hubIcao: string;
    remainingYardKg: number;
    pile: PlayerWarehousePileView;
    ports: PortsSnapshot;
    warehouses: PlayerWarehouseSnapshot;
  }>('/api/ports/deposit', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postPortPickupAbandon(opts: { pickupId: string }) {
  return api<{
    walletUsd: number;
    kg: number;
    hubIcao: string;
    commodityId: string;
    ports: PortsSnapshot;
    warehouses: PlayerWarehouseSnapshot;
  }>('/api/ports/pickup/abandon', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function fetchWarehouses() {
  return api<PlayerWarehouseSnapshot>('/api/warehouses');
}

export function postWarehouseBuy(opts: { icao: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    warehouse: { id: string; icao: string; capacityKg: number; tier: 1 | 2 | 3 };
    warehouses: PlayerWarehouseSnapshot;
    ports: PortsSnapshot;
  }>('/api/warehouses/buy', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postWarehouseUpgrade(opts: { warehouseId: string }) {
  return api<{
    walletUsd: number;
    debitUsd: number;
    warehouse: { id: string; icao: string; capacityKg: number; tier: 1 | 2 | 3 };
    warehouses: PlayerWarehouseSnapshot;
    ports: PortsSnapshot;
  }>('/api/warehouses/upgrade', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postWarehouseStockAbandon(opts: { stockId: string }) {
  return api<{
    walletUsd: number;
    kg: number;
    hubIcao: string;
    commodityId: string;
    warehouseId: string;
    warehouses: PlayerWarehouseSnapshot;
    ports: PortsSnapshot;
  }>('/api/warehouses/stock/abandon', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function fetchDemand() {
  return api<DemandSnapshot>('/api/demand');
}

export function postDemandAccept(opts: {
  orderId: string;
  originIcao: string;
  aircraftId: string;
  kg?: number;
}) {
  return api<{
    walletUsd: number;
    mission: Mission;
    order: DemandOrderView;
    kg: number;
    payUsd: number;
    warehouses: PlayerWarehouseSnapshot;
    demand: DemandSnapshot;
    fleet: PlayerAircraft[];
    missions: Mission[];
  }>('/api/demand/accept', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postDemandHold(opts: {
  orderId: string;
  originIcao: string;
  kg?: number;
}) {
  return api<{
    hold: PlayerDemandHoldView;
    order: DemandOrderView;
    kg: number;
    warehouses: PlayerWarehouseSnapshot;
    demand: DemandSnapshot;
  }>('/api/demand/hold', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postDemandHoldCancel(opts: { holdId: string }) {
  return api<{
    kg: number;
    orderId: string;
    warehouses: PlayerWarehouseSnapshot;
    demand: DemandSnapshot;
  }>('/api/demand/hold/cancel', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postDemandDispatchHold(opts: {
  holdId: string;
  aircraftId: string;
}) {
  return api<{
    walletUsd: number;
    mission: Mission;
    order: DemandOrderView;
    kg: number;
    payUsd: number;
    warehouses: PlayerWarehouseSnapshot;
    demand: DemandSnapshot;
    fleet: PlayerAircraft[];
    missions: Mission[];
  }>('/api/demand/dispatch-hold', {
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

export function postGroundStaffHire(opts: {
  warehouseId: string;
  candidateId: string;
}) {
  return api<{
    member: GroundStaffSnapshot['members'][number];
    debitUsd: number;
    walletUsd: number;
    groundStaff: GroundStaffSnapshot;
    warehouses?: PlayerWarehouseSnapshot;
    ports?: PortsSnapshot;
  }>('/api/ground-staff/hire', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postGroundStaffFire(opts: { memberId: string }) {
  return api<{
    member: GroundStaffSnapshot['members'][number];
    debitUsd: number;
    walletUsd: number;
    groundStaff: GroundStaffSnapshot;
    warehouses?: PlayerWarehouseSnapshot;
    ports?: PortsSnapshot;
  }>('/api/ground-staff/fire', {
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

/** Player empty reposition (no cargo) — Dispatch/Watch; works from bush/trip-only. */
export function postEmptyFlight(opts: {
  aircraftId: string;
  destIcao: string;
}) {
  return api<{
    mission: Mission;
    aircraft: PlayerAircraft;
    walletUsd: number;
    fleet?: PlayerAircraft[];
    hubSelected?: boolean;
    hubs?: StarterHubOption[];
    pilotIcao?: string;
  }>('/api/fleet/empty-flight', {
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

export type BushTripBoardRow = {
  id: string;
  title: string;
  countryId: string;
  summary?: string;
  legs: number;
  distanceNm: number;
  payUsd: number;
  startIcao: string;
  endIcao: string;
  viaIcao?: string;
  aircraftHint: 'light_ga';
  playable: boolean;
  hasPln?: boolean;
  /** Suggested cruise (ft MSL) from Activities PLN when available. */
  cruisingAltFt?: number;
};

export type BushTripMapNode =
  | { kind: 'hub'; icao: string }
  | { kind: 'wpt'; ident: string; lat: number; lon: number };

export type ActiveBushTripView = {
  tripId: string;
  title: string;
  legIndex: number;
  fromIcao: string;
  toIcao: string;
  legs: number;
  payUsd: number;
  aircraftId: string;
  status: 'accepted' | 'in_progress';
  legStatus?: 'ready' | 'departed';
  mapNodes?: BushTripMapNode[];
  startIcao?: string;
  endIcao?: string;
  hasPln?: boolean;
  cruisingAltFt?: number;
};

export type BushWatchStatus = {
  running: boolean;
  tripId: string | null;
  title: string | null;
  legIndex: number | null;
  legs: number | null;
  fromIcao: string | null;
  toIcao: string | null;
  legStatus: 'ready' | 'departed' | null;
  tripStatus: string | null;
  phase: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  groundSpeedKt: number | null;
  position: { lat: number; lon: number } | null;
  lastEvent: { type: string; reason?: string } | null;
  lastError: string | null;
  pipeConnected: boolean;
  completed: boolean;
  payoutUsd: number | null;
  walletUsd: number | null;
  intervalMs: number;
};

export function fetchBushWatchStatus() {
  return api<BushWatchStatus>('/api/bush-watch/status');
}

export function postBushWatchStart(opts: { intervalSec?: number } = {}) {
  return api<BushWatchStatus>('/api/bush-watch/start', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postBushWatchStop() {
  return api<BushWatchStatus>('/api/bush-watch/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function downloadBushTripPln(tripId: string): Promise<string> {
  const res = await fetch(`/api/bush-trips/${encodeURIComponent(tripId)}/pln`);
  if (!res.ok) {
    let message = `PLN download failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] ?? `${tripId}.PLN`;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return filename;
}

/** Garmin/TDS GTNXi .gfp — drop into C:\\ProgramData\\TDS\\GTNXi\\FPL then Import. */
export async function downloadBushTripGfp(tripId: string): Promise<{
  filename: string;
  waypointCount: number | null;
  thinned: boolean;
}> {
  const res = await fetch(`/api/bush-trips/${encodeURIComponent(tripId)}/gfp`);
  if (!res.ok) {
    let message = `GFP download failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] ?? `${tripId}.gfp`;
  const wpRaw = res.headers.get('X-Skyline-Gfp-Waypoints');
  const waypointCount = wpRaw ? Number(wpRaw) : null;
  const thinned = res.headers.get('X-Skyline-Gfp-Thinned') === '1';
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return {
    filename,
    waypointCount: Number.isFinite(waypointCount) ? waypointCount : null,
    thinned,
  };
}

export type HomologateBushHubResult = {
  icao: string;
  override: {
    name: string;
    lat: number;
    lon: number;
    source: 'msfs_panel' | 'parked_sample' | 'msfs_facility';
    validatedAt: string;
  };
  path: string;
  airport: {
    icao: string;
    name: string;
    lat: number;
    lon: number;
  } | null;
};

/** Stamp MSFS lat/lon/name for a bushTripOnly hub via Facilities (or explicit coords). */
export function postBushHubHomologate(body: {
  icao: string;
  name?: string;
  lat?: number;
  lon?: number;
  source?: 'msfs_panel' | 'parked_sample' | 'msfs_facility';
  pipeName?: string;
}) {
  return api<HomologateBushHubResult>('/api/bush-hubs/homologate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type HomologateBushHubBatchResult = {
  results: Array<
    | { icao: string; ok: true; result: HomologateBushHubResult }
    | { icao: string; ok: false; error: string }
  >;
  okCount: number;
  failCount: number;
};

/** Homologate all bushTripOnly hubs (or a list) via SimConnect Facilities. */
export function postBushHubHomologateBatch(body?: {
  icaos?: string[];
  all?: boolean;
  pipeName?: string;
}) {
  return api<HomologateBushHubBatchResult>('/api/bush-hubs/homologate-batch', {
    method: 'POST',
    body: JSON.stringify(body ?? { all: true }),
  });
}

export function fetchBushTrips() {
  return api<{
    trips: BushTripBoardRow[];
    active: ActiveBushTripView | null;
    walletUsd: number;
    tick: number;
    fleet: PlayerAircraft[];
    hubSelected: boolean;
    pilotIcao?: string;
    homeHubIcao?: string;
  }>('/api/bush-trips');
}

export function postBushTripAccept(opts: {
  tripId: string;
  aircraftId: string;
}) {
  return api<{
    active: { tripId: string; legIndex: number; status: string; aircraftId: string };
    trip: BushTripBoardRow;
    walletUsd: number;
    fleet: PlayerAircraft[];
  }>('/api/bush-trips/accept', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postBushTripAbandon() {
  return api<{
    active: { tripId: string; status: string; aircraftId: string };
    walletUsd: number;
    fleet: PlayerAircraft[];
  }>('/api/bush-trips/abandon', {
    method: 'POST',
    body: JSON.stringify({}),
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

export function postAcceptOfpCargo(opts: {
  missionId: string;
  simbriefUser?: string;
  simbriefUserid?: string;
}) {
  return api<{
    mission: Mission;
    releasedKg: number;
    payBeforeUsd: number;
    payAfterUsd: number;
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
    };
  }>('/api/accept-ofp-cargo', {
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
  /** Healthy SimBrief OFP block (before MX pad). */
  ofpBlockFuelKg?: number;
  /** Extra kg beyond OFP — always 0; MX wear is warn-only. */
  mxPadKg?: number;
  mxExcessPct?: number;
  mxCappedByTank?: boolean;
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
  /** Weather-ops bonus included in payoutUsd. */
  weatherBonusUsd?: number;
  /** Weather-ops snapshot from Watch. */
  weatherOps?: WeatherOpsSnapshot | null;
  /** Dest runway touchdown projection. */
  runwayTouch?: RunwayTouchdownSnapshot | null;
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
      taxiBurnLb?: number;
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
      crewFloorLb?: number;
      liveLb?: number;
      ok: boolean;
      stations?: Record<number, number>;
      stationMax?: Record<number, number>;
    };
    cg?: {
      liveMac?: number;
      minMac?: number;
      maxMac?: number;
      ok: boolean;
      severity: 'info' | 'warn';
    };
  } | null;
  sawAirborne: boolean;
  lastEvent: WatchEvent | null;
  lastEventAtIso: string | null;
  lastError: string | null;
  /** False when Watch is running but the named-pipe socket dropped. */
  pipeConnected?: boolean;
  /** Auto-settle is sampling residual fuel / writing payout. */
  settling?: boolean;
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
    /** Why idle window is stuck (e.g. flow / tas / vs / timeout). */
    hint?: string;
    committed?: {
      cruiseSpeedKt: number;
      cruiseFuelFlowKgPerHour: number;
      fuelBurnKgPerNm: number;
      sampleCount: number;
      durationSec: number;
      committedAtMs: number;
    };
  } | null;
  weatherOps?: {
    avgScore: number;
    sampleCount: number;
    eligible: boolean;
    avgHeadwindKt: number;
    avgVisM: number | null;
    rainFraction: number;
  } | null;
  /** Live MSFS vs mission origin — prefer over Validate snapshot for Origin card. */
  originProximity?: {
    ok: boolean;
    originIcao: string;
    distanceNm?: number;
    radiusNm: number;
    code: string;
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
    fleet?: PlayerAircraft[];
    pilotIcao?: string;
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

export function postWatchStop(opts?: { reset?: boolean }) {
  return api<WatchStatus>('/api/watch/stop', {
    method: 'POST',
    body: JSON.stringify({ reset: opts?.reset === true }),
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
  minMac?: number;
  maxMac?: number;
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
