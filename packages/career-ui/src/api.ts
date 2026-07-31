export type AircraftClass =
  | 'narrow_freighter'
  | 'wide_freighter'
  | 'light_turboprop'
  | 'light_ga';

export type PlayerAircraft = {
  id: string;
  aircraftClassId: AircraftClass;
  label: string;
  locationIcao: string;
  fuelKg: number;
  fuelCapacityKg: number;
  status: 'parked' | 'assigned';
  assignedMissionId?: string;
};

export type FerryQuote = {
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
};

export type NpcFleetMember = {
  id: string;
  name: string;
  aircraftClassId: string;
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
};

export type RegionPressure = {
  region: string;
  capacity: number;
  thinFleet: boolean;
  ready: number;
  total: number;
  resting: number;
  weather?: 'fair' | 'marginal' | 'poor';
};

export type LotPressure = {
  originRegion: string;
  originRegionCapacity: number;
  laneSaturation: number;
  thinFleet: boolean;
  laneBusy: boolean;
  weather?: 'fair' | 'marginal' | 'poor';
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
  urgency: 'normal' | 'urgent';
  reason: string;
  createdAtTick?: number;
  expiresAtTick: number;
  ticksRemaining?: number;
  perishable?: boolean;
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
  cruiseAltitudeFt?: number;
  alternateIcao?: string;
  route?: string;
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
  settledAtTick?: number;
  settledFuelKg?: number;
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
  payUsd: number;
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
  events?: EconomyEvent[];
  totalStockKg: number;
  totalStockTonnes: number;
  commodities: AirportCommodity[];
  outboundLots: AirportLot[];
  inboundLots: AirportLot[];
  arrivals?: AirportMovement[];
  departures?: AirportMovement[];
  npcActivity?: NpcActivity[];
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
      hubs?: string[];
      pilotName?: string;
      homeHubIcao?: string;
    }
  >('/api/state');
}

export function fetchMarket(aircraft?: AircraftClass) {
  const qs = aircraft ? `?aircraft=${aircraft}` : '';
  return api<
    ClockSync & {
      lots: MarketLot[];
      npcActivity?: NpcActivity[];
      regionPressure?: RegionPressure[];
      maxCargoKg?: number | null;
      maxCargoSource?: string | null;
      airframeLabel?: string | null;
    }
  >(`/api/market${qs}`);
}

/** Fetch every available lot for one exact route (not the global 200-row slice). */
export function fetchRouteLots(originIcao: string, destIcao: string) {
  const qs = new URLSearchParams({
    origin: originIcao.trim().toUpperCase(),
    dest: destIcao.trim().toUpperCase(),
  });
  return api<ClockSync & { lots: MarketLot[] }>(`/api/market?${qs.toString()}`);
}

export function fetchCargoLimit(aircraft: AircraftClass, distanceNm?: number) {
  const qs = new URLSearchParams({ aircraft });
  if (distanceNm !== undefined && Number.isFinite(distanceNm)) {
    qs.set('distanceNm', String(distanceNm));
  }
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
      idle: number;
      regionPressure?: RegionPressure[];
      fleet: NpcFleetMember[];
      activity: NpcActivity[];
    }
  >('/api/npc');
}

export function fetchAirport(icao: string) {
  return api<AirportView>(`/api/airport/${encodeURIComponent(icao.trim().toUpperCase())}`);
}

export function fetchMissions() {
  return api<{ walletUsd: number; missions: Mission[] }>('/api/missions');
}

export function postTick(n = 24) {
  return api<{ tick: number; availableLots: number }>('/api/tick', {
    method: 'POST',
    body: JSON.stringify({ n }),
  });
}

export function postInitBrazil() {
  return api<{ tick: number; seed: string; airports: number }>('/api/init', {
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

export function postSelectHub(opts: { icao: string; pilotName: string }) {
  return api<{
    walletUsd: number;
    hubSelected: boolean;
    fleet: PlayerAircraft[];
    hubs: string[];
    pilotName: string;
    homeHubIcao: string;
  }>('/api/fleet/select-hub', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function postAcquireAircraft(opts: {
  aircraftClassId: AircraftClass;
  locationIcao?: string;
}) {
  return api<{
    walletUsd: number;
    hubSelected: boolean;
    fleet: PlayerAircraft[];
    hubs: string[];
    pilotName: string;
    homeHubIcao: string;
  }>('/api/fleet/acquire', {
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
    hubs?: string[];
  }>('/api/fleet/ferry', {
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
  position: { lat: number; lon: number } | null;
  sawAirborne: boolean;
  lastEvent: WatchEvent | null;
  lastEventAtIso: string | null;
  lastError: string | null;
  settlement: MissionSettlement | null;
  walletUsd: number | null;
  autoDepart: boolean;
  autoSettle: boolean;
  intervalSec: number;
  allowDepartOverride?: boolean;
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

export function postLoadOfp(opts: {
  missionId: string;
  simbriefUser?: string;
  simbriefUserid?: string;
  runPreflightAfter?: boolean;
}) {
  return (async () => {
    const res = await fetch('/api/load-ofp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
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
