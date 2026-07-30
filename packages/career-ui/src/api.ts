export type AircraftClass = 'narrow_freighter' | 'wide_freighter' | 'light_turboprop';

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
  status: 'idle' | 'busy';
  phase: 'idle' | 'enroute' | 'arriving' | 'turnaround';
  busyUntilTick?: number;
  busyUntilMs?: number;
  turnaroundHoursLeft?: number;
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
  npcClaim?: NpcClaim | null;
};

export type OfpCheckFinding = {
  code: string;
  severity: string;
  message: string;
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
  deadlineTick: number;
  reason: string;
  acceptedAtTick?: number;
  staticId?: string;
  lots?: MissionLotLine[];
  shipmentLotId?: string;
  lastOfpCheck?: {
    verdict: 'pass' | 'warn' | 'fail';
    summary: string;
    checkedAtIso: string;
    findings: OfpCheckFinding[];
  };
  lastPreflightCheck?: {
    verdict: 'pass' | 'warn' | 'fail';
    summary: string;
    checkedAtIso: string;
    phase?: string;
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
    }
  >('/api/state');
}

export function fetchMarket(aircraft?: AircraftClass) {
  const qs = aircraft ? `?aircraft=${aircraft}` : '';
  return api<
    ClockSync & {
      lots: MarketLot[];
      npcActivity?: NpcActivity[];
      maxCargoKg?: number | null;
      maxCargoSource?: string | null;
      airframeLabel?: string | null;
    }
  >(`/api/market${qs}`);
}

export function fetchNpcFleet() {
  return api<
    ClockSync & {
      fleetSize: number;
      busy: number;
      airborne: number;
      turnaround: number;
      idle: number;
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
  missionId?: string;
  openDispatch?: boolean;
  lines: Array<{ lotId: string; cargoKg: number }>;
}) {
  return api<{
    mission: Mission;
    walletUsd: number;
    maxCargoKg?: number;
    maxCargoSource?: string;
    appended?: boolean;
    lineCount?: number;
    remainingKg?: number;
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

export function postDispatch(opts: { missionId: string; open?: boolean }) {
  return api<{
    mission: Mission;
    url: string;
    staticId: string;
    type: string;
    airframeLabel: string;
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
    };
  }>('/api/confirm-ofp', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export type MissionSettlement = {
  payoutUsd: number;
  penaltyUsd: number;
  lateTicks: number;
  onTime: boolean;
  deliveredKg: number;
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
  return api<{ mission: Mission; walletUsd: number; preflightOverride?: boolean }>(
    '/api/depart',
    {
      method: 'POST',
      body: JSON.stringify(opts),
    },
  );
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
