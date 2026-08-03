import { createServer } from 'node:http';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acceptMission,
  assignAircraftToMission,
  buyOutAircraftLease,
  CAREER_COMMODITIES,
  cancelMission,
  cargoOpsIsUnlocked,
  clearAircraftMaintenanceWithParts,
  repairAircraftConditionWithParts,
  hoursUntilInspection,
  inspectionCostUsd,
  commitStagedManifest,
  continuousEconomyHours,
  createSeedEconomyWorld,
  departMission,
  emptyMissionsStateV2,
  ensureSeedMarketFormed,
  executeFerry,
  findCareerPlayerAirframe,
  findOpenManifestForRoute,
  findPlayerAircraft,
  listActivePlayerMissions,
  listAircraftClassCatalog,
  listAircraftMarket,
  listCareerHubIcaos,
  listParkedAt,
  listStarterCareerPlayerAirframes,
  resolveAirframePerfForUi,
  getCommodity,
  hubTierOf,
  countFuelHaulsEnroute,
  hubLevelProfile,
  hubLevelXpProgress,
  listActiveEconomyEvents,
  listActiveNpcFreights,
  listAirportFuelInbound,
  listFuelHaulViews,
  listMarketLots,
  listNpcFleetStatus,
  listRegionMarketPressure,
  listViableMarketLots,
  parseMarketBoardAccessFilter,
  parseMarketBoardSorts,
  parsePositiveNumberParam,
  queryMarketBoardPage,
  localUnitPriceUsd,
  regionFuelThin,
  missionRemainingCapacityKg,
  hoursToMs,
  MS_PER_TICK,
  msToHours,
  TICKS_PER_DAY,
  NPC_FLEET_SIZE,
  npcClaimForLot,
  parseFreighterClassId,
  purchaseAircraftListing,
  purchasePlayerMissionOfpFuel,
  quotePlayerMissionOfpFuel,
  quoteFerry,
  reconcilePlayerInbound,
  replaceMissionManifest,
  routeDistanceNm,
  selectStarterHub,
  listAircraftForLease,
  unlistAircraftForLease,
  sellPlayerAircraft,
  settleAircraftMarketOps,
  settleHangarParkingFees,
  settleMission,
  signAircraftLease,
  resolveHangarParkingUsdPerDay,
  applyWalletDelta,
  summarizeCareerLedger,
  LEDGER_KIND_LABEL,
  openCareerStore,
  listWorldCountryIds,
  syncHomeCountryFromHub,
  stockTrend,
  tickEconomyN,
  withMissionLoadPolicy,
  missionLoadPolicy,
  careerAllowsDirectInject,
  economyDayIndex,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type CareerStore,
  type FreighterClassId,
  type MissionIntent,
  type PlayerAircraft,
} from '@msfs-compat/shared';
import {
  buildMissionDispatch,
  confirmMissionOfp,
  estimateRouteCargoLimit,
  openDispatchUrl,
  resolveClassMaxCargoKg,
} from './dispatch-helpers.ts';
import {
  applyMissionOfpLoad,
  getOfpLoadProgress,
  isOfpLoadBusy,
  probeSimBridgeStatus,
  requestOfpLoadCancel,
} from './ofp-load-helpers.ts';
import { isOfpLoadActive } from './ofp-load-state.ts';
import { preflightBlocksDepart, runMissionPreflight } from './preflight-helpers.ts';
import {
  CareerWatchSession,
  probeLiveLandingFpm,
  probeLiveResidualFuelKg,
} from './watch-helpers.ts';
import { WATCH_DEBUG_LOG_PATH } from './debug-log.ts';
import { createPromiseLock } from './career-write-lock.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

/**
 * Newest mtime across server sources, captured at boot. `dev.mjs` compares it
 * against disk so an API still serving pre-edit routes gets restarted.
 */
export async function serverSourceStamp(dir: string = here): Promise<number> {
  const files = await readdir(dir);
  let newest = 0;
  for (const file of files) {
    if (!file.endsWith('.ts')) continue;
    const info = await stat(join(dir, file));
    newest = Math.max(newest, Math.floor(info.mtimeMs));
  }
  // Agent SimBrief fetch/dispatch is imported by server — must restart when it changes.
  const agentOfp = join(repoRoot, 'packages', 'agent', 'src', 'ofp-compliance');
  try {
    for (const file of await readdir(agentOfp)) {
      if (!file.endsWith('.ts')) continue;
      const info = await stat(join(agentOfp, file));
      newest = Math.max(newest, Math.floor(info.mtimeMs));
    }
  } catch {
    /* agent path missing */
  }
  // The API serves shared logic from its build output, so a rebuilt shared
  // package must also invalidate a running server.
  const sharedDist = join(repoRoot, 'packages', 'shared', 'dist');
  try {
    for (const file of await readdir(sharedDist)) {
      if (!file.endsWith('.js')) continue;
      const info = await stat(join(sharedDist, file));
      newest = Math.max(newest, Math.floor(info.mtimeMs));
    }
  } catch {
    /* shared not built yet */
  }
  const playerAirframeCatalog = join(
    repoRoot,
    'packages',
    'shared',
    'src',
    'data',
    'career-player-airframes.json',
  );
  try {
    const info = await stat(playerAirframeCatalog);
    newest = Math.max(newest, Math.floor(info.mtimeMs));
  } catch {
    /* catalog not built yet */
  }
  return newest;
}

const bootSourceStamp = await serverSourceStamp();
const careerDir = join(repoRoot, 'profiles', 'career');
const store: CareerStore = await openCareerStore({ careerDir });
/** Row cap for the market board — filters must run server-side to survive it. */
const MARKET_LOT_LIMIT = 200;

type MissionsFile = CareerMissionsState;

async function loadMissions(): Promise<MissionsFile> {
  return store.loadMissions();
}

function withParkingRates(
  fleet: PlayerAircraft[],
  world?: Pick<CareerEconomyWorld, 'airports'>,
): Array<PlayerAircraft & { parkingUsdPerDay: number | null }> {
  const airports = world ?? { airports: [] };
  return fleet.map((aircraft) => ({
    ...aircraft,
    parkingUsdPerDay: resolveHangarParkingUsdPerDay(aircraft, airports),
  }));
}

function fleetPayload(
  missions: MissionsFile,
  world?: Pick<CareerEconomyWorld, 'airports'>,
) {
  const starterAircraft = listStarterCareerPlayerAirframes().map((airframe) => ({
    typeId: airframe.typeId,
    label: airframe.label,
    aircraftClassId: airframe.aircraftClassId,
    simbriefIcao: airframe.simbriefIcao,
  }));
  const hubs = listCareerHubIcaos().map((icao) => {
    const airport = world?.airports.find((a) => a.icao === icao);
    return {
      icao,
      name: airport?.name ?? icao,
      region: airport?.region ?? '',
      hubTier: (airport?.hubTier ?? 'spoke') as 'major' | 'regional' | 'spoke',
    };
  });
  return {
    hubSelected: missions.hubSelected,
    fleet: withParkingRates(missions.fleet, world),
    hubs,
    pilotName: missions.pilotName,
    homeHubIcao: missions.homeHubIcao,
    starterAircraft,
  };
}

function isClosedMissionStatus(status: string): boolean {
  return status === 'cancelled' || status === 'settled' || status === 'failed';
}

async function saveMissions(missions: MissionsFile): Promise<void> {
  await store.saveMissions(missions);
}

/**
 * One queue for economy + missions so tick/NPC bids cannot clobber accept/staging
 * (and missions OFP updates cannot race cancel). Non-reentrant — use *Unlocked
 * helpers while holding the lock.
 */
const careerLock = createPromiseLock();

function withCareerLock<T>(fn: () => Promise<T> | T): Promise<T> {
  return careerLock.withLock(fn);
}

/**
 * Reload missions under the lock, apply an update, and persist when the
 * updater returns true. Returns false when missing/closed or updater aborts.
 */
async function updateOpenMission(
  missionId: string,
  update: (
    missions: MissionsFile,
    mission: MissionIntent,
    idx: number,
  ) => Promise<boolean> | boolean,
): Promise<boolean> {
  return withCareerLock(async () => {
    const missions = await loadMissions();
    const idx = missions.missions.findIndex((m) => m.id === missionId);
    if (idx < 0) return false;
    const mission = missions.missions[idx]!;
    if (isClosedMissionStatus(mission.status)) return false;
    const shouldSave = await update(missions, mission, idx);
    if (!shouldSave) return false;
    await saveMissions(missions);
    return true;
  });
}

async function loadEconomyUnlocked(): Promise<CareerEconomyWorld> {
  const { world: caught, advancedTicks, dirty } = await store.loadEconomy();
  const missions = await loadMissions();
  let needsSave = dirty;
  // Home partition follows the player's chosen hub (KMIA → US), including legacy saves.
  if (syncHomeCountryFromHub(caught, missions.homeHubIcao)) {
    needsSave = true;
  }
  if (needsSave) {
    await store.saveEconomy(caught);
  }
  if (advancedTicks > 0) {
    settleAircraftMarketOps(missions, caught.tick, caught);
    settleHangarParkingFees(missions, caught, {
      fromTick: caught.tick - advancedTicks,
      toTick: caught.tick,
    });
    listAircraftMarket(missions, caught);
    await saveMissions(missions);
  }
  return caught;
}

async function persistEconomyUnlocked(world: CareerEconomyWorld): Promise<void> {
  // Do NOT stomp lastBatchAtMs — fractional hour + continuous ops depend on it.
  await store.saveEconomy(world);
}

/** Consistent snapshot of world (+ catch-up) under the career lock. */
function loadEconomy(): Promise<CareerEconomyWorld> {
  return withCareerLock(loadEconomyUnlocked);
}

/**
 * Load world + missions under one lock (catch-up may persist). Use for reads and
 * quotes so concurrent writers cannot interleave mid-snapshot.
 */
async function withCareerRead<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
): Promise<T> {
  return withCareerLock(async () => {
    const world = await loadEconomyUnlocked();
    const missions = await loadMissions();
    return fn(world, missions);
  });
}

/**
 * Load, mutate, and persist economy + missions in one hold so accept/staging/fuel
 * cannot lose to tick NPC bids (and vice versa).
 */
async function withCareerWrite<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
): Promise<T> {
  return withCareerLock(async () => {
    const world = await loadEconomyUnlocked();
    const missions = await loadMissions();
    const result = await fn(world, missions);
    await persistEconomyUnlocked(world);
    await saveMissions(missions);
    return result;
  });
}

function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

function fillPct(stockKg: number, capacityKg: number): number {
  return capacityKg > 0 ? stockKg / capacityKg : 0;
}

function stockBalance(fill: number): 'surplus' | 'shortage' | 'balanced' {
  if (fill >= 0.58) return 'surplus';
  if (fill <= 0.42) return 'shortage';
  return 'balanced';
}

function clockPayload(world: CareerEconomyWorld, nowMs = Date.now()) {
  return {
    serverNowMs: nowMs,
    lastBatchAtMs: world.lastBatchAtMs,
    lastSyncedAtMs: world.lastBatchAtMs,
    tick: world.tick,
    continuousHours: continuousEconomyHours(world, nowMs),
    msPerTick: MS_PER_TICK,
    fuelHaulsEnroute: countFuelHaulsEnroute(world),
  };
}

function mapFuelHaulView(
  row: ReturnType<typeof listFuelHaulViews>[number],
) {
  return {
    id: row.id,
    truckId: row.truckId,
    truckName: row.truckName,
    truckClassId: row.truckClassId,
    truckLabel: row.truckLabel,
    originIcao: row.originIcao,
    destIcao: row.destIcao,
    cargoKg: row.cargoKg,
    departedAtMs: row.departedAtMs,
    arrivesAtMs: row.arrivesAtMs,
    etaMs: row.etaMs,
    etaHours: row.etaHours,
    progressPct: row.progressPct,
    status: row.status,
    phase: row.phase,
  };
}

function mapLotSummary(
  world: Awaited<ReturnType<typeof loadEconomy>>,
  lot: (typeof world.lots)[number],
  nowMs = Date.now(),
) {
  const commodity = getCommodity(lot.commodityId);
  const availableKg = Math.max(0, lot.quantityKg - lot.reservedKg);
  const npcClaim = npcClaimForLot(world, lot.id, nowMs);
  return {
    id: lot.id,
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    commodityId: lot.commodityId,
    commodityName: commodity.name,
    availableKg,
    quantityKg: lot.quantityKg,
    reservedKg: lot.reservedKg,
    payUsd: lot.payUsd,
    urgency: lot.urgency,
    reason: lot.reason,
    status: lot.status,
    createdAtTick: lot.createdAtTick,
    expiresAtTick: lot.expiresAtTick,
    ticksRemaining: Math.max(0, lot.expiresAtTick - world.tick),
    expired: world.tick >= lot.expiresAtTick,
    perishable: Boolean(commodity.perishable),
    distanceNm: routeDistanceNm(world, lot.originIcao, lot.destIcao),
    npcClaim: npcClaim
      ? {
          npcName: npcClaim.npcName,
          cargoKg: npcClaim.cargoKg,
          etaHours: npcClaim.etaHours,
          etaMs: npcClaim.etaMs,
          arrivesAtMs: npcClaim.arrivesAtMs,
        }
      : null,
  };
}

function mapNpcActivity(
  world: Awaited<ReturnType<typeof loadEconomy>>,
  nowMs = Date.now(),
) {
  return listActiveNpcFreights(world, nowMs).map((row) => ({
    id: row.flight.id,
    npcId: row.flight.npcId,
    npcName: row.npcName,
    originIcao: row.flight.originIcao,
    destIcao: row.flight.destIcao,
    commodityId: row.flight.commodityId,
    commodityName: row.commodityName,
    cargoKg: row.flight.cargoKg,
    payUsd: row.payUsd,
    distanceNm: row.distanceNm,
    etaHours: row.hoursRemaining,
    etaMs: row.etaMs,
    departedAtTick: row.flight.departedAtTick,
    arrivesAtTick: row.flight.arrivesAtTick,
    departedAtMs: row.flight.departedAtMs,
    arrivesAtMs: row.flight.arrivesAtMs,
    urgency: row.urgency,
    aircraftClassId: row.flight.aircraftClassId,
    aircraftLabel: row.aircraftLabel,
    homeRegion: row.homeRegion,
    progressPct: row.progressPct,
    flightHours: row.flightHours,
    phase: row.phase,
  }));
}

function mapNpcFleet(world: Awaited<ReturnType<typeof loadEconomy>>, nowMs = Date.now()) {
  return listNpcFleetStatus(world, nowMs).map((row) => ({
    id: row.id,
    name: row.name,
    aircraftClassId: row.aircraftClassId,
    aircraftLabel: row.aircraftLabel,
    homeRegion: row.homeRegion,
    reliability: row.reliability,
    aggressiveness: row.aggressiveness,
    feeBias: row.feeBias,
    status: row.status,
    phase: row.phase,
    busyUntilTick: row.busyUntilTick,
    busyUntilMs: row.busyUntilMs,
    turnaroundHoursLeft: row.turnaroundHoursLeft,
    restUntilTick: row.restUntilTick,
    restUntilMs: row.restUntilMs,
    restHoursLeft: row.restHoursLeft,
    mxUntilTick: row.mxUntilTick,
    mxUntilMs: row.mxUntilMs,
    mxHoursLeft: row.mxHoursLeft,
    locationIcao: row.locationIcao,
    hoursSinceMx: row.hoursSinceMx,
    dutyHoursAccum: row.dutyHoursAccum,
    mission: row.mission
      ? {
          flightId: row.mission.flightId,
          lotId: row.mission.lotId,
          originIcao: row.mission.originIcao,
          destIcao: row.mission.destIcao,
          commodityId: row.mission.commodityId,
          commodityName: row.mission.commodityName,
          cargoKg: row.mission.cargoKg,
          payUsd: row.mission.payUsd,
          distanceNm: row.mission.distanceNm,
          departedAtTick: row.mission.departedAtTick,
          arrivesAtTick: row.mission.arrivesAtTick,
          departedAtMs: row.mission.departedAtMs,
          arrivesAtMs: row.mission.arrivesAtMs,
          etaHours: row.mission.etaHours,
          etaMs: row.mission.etaMs,
          progressPct: row.mission.progressPct,
          flightHours: row.mission.flightHours,
          urgency: row.mission.urgency,
          phase: row.mission.phase,
        }
      : null,
  }));
}

type AirportMovement = {
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
  etaMs: number;
  progressPct: number;
  arrivesAtTick?: number;
  arrivesAtMs?: number;
  departedAtMs?: number;
  urgency: string;
  distanceNm?: number;
};

function mapAirportMovements(
  world: Awaited<ReturnType<typeof loadEconomy>>,
  icao: string,
  missions: MissionIntent[],
  nowMs = Date.now(),
): { arrivals: AirportMovement[]; departures: AirportMovement[] } {
  const arrivals: AirportMovement[] = [];
  const departures: AirportMovement[] = [];

  for (const row of listActiveNpcFreights(world, nowMs)) {
    const movement: AirportMovement = {
      id: row.flight.id,
      kind: 'npc',
      operatorName: row.npcName,
      originIcao: row.flight.originIcao,
      destIcao: row.flight.destIcao,
      commodityName: row.commodityName,
      cargoKg: row.flight.cargoKg,
      payUsd: row.payUsd,
      aircraftClassId: row.flight.aircraftClassId,
      aircraftLabel: row.aircraftLabel,
      phase: row.phase,
      etaHours: row.hoursRemaining,
      etaMs: row.etaMs,
      progressPct: row.progressPct,
      arrivesAtTick: row.flight.arrivesAtTick,
      arrivesAtMs: row.flight.arrivesAtMs,
      departedAtMs: row.flight.departedAtMs,
      urgency: row.urgency,
      distanceNm: row.distanceNm,
    };
    if (row.flight.destIcao === icao) arrivals.push(movement);
    if (row.flight.originIcao === icao) departures.push(movement);
  }

  for (const m of missions) {
    if (!['accepted', 'dispatched', 'in_flight'].includes(m.status)) continue;
    if (m.originIcao !== icao && m.destIcao !== icao) continue;
    const dist = routeDistanceNm(world, m.originIcao, m.destIcao) ?? 0;
    const cruise =
      m.aircraftClassId === 'wide_freighter'
        ? 480
        : m.aircraftClassId === 'light_turboprop'
          ? 185
          : m.aircraftClassId === 'light_ga'
            ? 170
            : m.aircraftClassId === 'medium_piston'
              ? 290
              : m.aircraftClassId === 'light_jet' ||
                  m.aircraftClassId === 'narrow_freighter'
                ? 430
                : 430;
    const flightHours = Math.max(2, Math.ceil(dist / cruise));
    const departedAt = m.departedAtTick ?? m.dispatchedAtTick ?? m.acceptedAtTick;
    let etaHours = flightHours;
    let etaMs = hoursToMs(flightHours);
    let progressPct = 0;
    let phase = m.status === 'in_flight' ? 'enroute' : 'boarding';
    let arrivesAtMs: number | undefined;
    let departedAtMs: number | undefined;
    if (m.status === 'in_flight' && departedAt !== undefined) {
      // Approximate player ETA from tick stamps relative to batch anchor.
      departedAtMs = world.lastBatchAtMs - (world.tick - departedAt) * MS_PER_TICK;
      arrivesAtMs = departedAtMs + hoursToMs(flightHours);
      etaMs = Math.max(0, arrivesAtMs - nowMs);
      etaHours = msToHours(etaMs);
      const duration = Math.max(1, arrivesAtMs - departedAtMs);
      const flown = Math.min(duration, Math.max(0, nowMs - departedAtMs));
      progressPct = Math.min(100, Math.round((flown / duration) * 100));
      phase = etaMs <= MS_PER_TICK ? 'arriving' : 'enroute';
    }
    const movement: AirportMovement = {
      id: m.id,
      kind: 'player',
      operatorName: 'You',
      originIcao: m.originIcao,
      destIcao: m.destIcao,
      commodityName: getCommodity(m.commodityId).name,
      cargoKg: m.cargoKg,
      payUsd: m.payUsd,
      aircraftClassId: m.aircraftClassId,
      phase,
      etaHours,
      etaMs,
      progressPct,
      arrivesAtTick:
        m.status === 'in_flight' && departedAt !== undefined
          ? departedAt + flightHours
          : undefined,
      arrivesAtMs,
      departedAtMs,
      urgency: m.urgency,
      distanceNm: dist,
    };
    if (m.destIcao === icao) arrivals.push(movement);
    if (m.originIcao === icao) departures.push(movement);
  }

  arrivals.sort((a, b) => a.etaMs - b.etaMs);
  departures.sort((a, b) => a.etaMs - b.etaMs);
  return { arrivals, departures };
}

async function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export function createCareerApiServer(port = 8787) {
  let catchUpTimer: ReturnType<typeof setInterval> | undefined;
  const watchSession = new CareerWatchSession({
    withCareerRead,
    withCareerWrite,
    updateOpenMission,
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      send(res, 204, {});
      return;
    }

    try {
      if (req.method === 'GET' && path === '/api/health') {
        const world = await loadEconomy();
        send(res, 200, {
          ok: true,
          npcFleetTarget: NPC_FLEET_SIZE,
          sourceStamp: bootSourceStamp,
          store: store.kind,
          homeCountryId: world.homeCountryId ?? null,
          countries: listWorldCountryIds(world),
          internationalLaneCount: world.internationalLanes?.length ?? 0,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/state') {
        const payload = await withCareerRead((world, missions) => {
          const nowMs = Date.now();
          const npcBusy = (world.npcs ?? []).filter((n) => n.status === 'busy').length;
          return {
            ...clockPayload(world, nowMs),
            seed: world.seed,
            airportCount: world.airports.length,
            walletUsd: missions.walletUsd,
            activeMissions: missions.missions.filter((m) =>
              ['accepted', 'dispatched', 'in_flight'].includes(m.status),
            ).length,
            npcFleet: world.npcs?.length ?? 0,
            npcBusy,
            npcFlights:
              world.npcFlights?.filter((f) => f.status === 'in_flight').length ?? 0,
            ...fleetPayload(missions, world),
            cashflow: summarizeCareerLedger(missions, world.tick),
            cargoOps: missions.cargoOps ?? null,
            homeCountryId: world.homeCountryId ?? null,
            countries: listWorldCountryIds(world),
            internationalLaneCount: world.internationalLanes?.length ?? 0,
            store: store.kind,
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/hubs') {
        const payload = await withCareerRead((world, missions) => ({
          homeHubIcao: missions.homeHubIcao ?? null,
          hubs: world.airports.map((airport) => ({
            icao: airport.icao,
            name: airport.name,
            region: airport.region,
            hubTier: airport.hubTier ?? 'spoke',
            lat: airport.lat,
            lon: airport.lon,
            level: airport.level,
          })),
        }));
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/fleet') {
        const payload = await withCareerRead((world, missions) => ({
          walletUsd: missions.walletUsd,
          ...fleetPayload(missions, world),
          cashflow: summarizeCareerLedger(missions, world.tick),
          homeCountryId: world.homeCountryId ?? null,
          store: store.kind,
        }));
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/cashflow') {
        const payload = await withCareerRead(async (world, missions) => {
          const cashflow = await store.summarizeCashflow(world.tick);
          return {
            walletUsd: missions.walletUsd,
            tick: world.tick,
            dayIndex: economyDayIndex(world.tick),
            homeCountryId: world.homeCountryId ?? null,
            store: store.kind,
            labels: LEDGER_KIND_LABEL,
            ...cashflow,
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/fleet/select-hub') {
        const body = (await readBody(req)) as {
          icao?: string;
          pilotName?: string;
          airframeTypeId?: string;
        };
        if (!body.icao) {
          send(res, 400, { error: 'icao required' });
          return;
        }
        if (!body.pilotName || !String(body.pilotName).trim()) {
          send(res, 400, { error: 'pilotName required' });
          return;
        }
        if (!body.airframeTypeId || !String(body.airframeTypeId).trim()) {
          send(res, 400, { error: 'airframeTypeId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const next = selectStarterHub(missions, body.icao!, {
              pilotName: body.pilotName!,
              airframeTypeId: body.airframeTypeId!,
            });
            Object.assign(missions, next);
            syncHomeCountryFromHub(world, missions.homeHubIcao);
            return {
              walletUsd: missions.walletUsd,
              homeCountryId: world.homeCountryId ?? null,
              ...fleetPayload(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      // Generated board contains one listing per homologated player airframe.
      if (req.method === 'GET' && path === '/api/aircraft-market') {
        const payload = await withCareerWrite((world, missions) => {
          settleAircraftMarketOps(missions, world.tick, world);
          const listings = listAircraftMarket(missions, world);
          const nowMs = Date.now();
          const catalog = listAircraftClassCatalog();
          const catalogByClass = new Map(catalog.map((row) => [row.id, row]));
          const typeIds = new Set<string>();
          for (const listing of listings) {
            if (listing.airframeTypeId) typeIds.add(listing.airframeTypeId);
          }
          for (const acf of missions.fleet) {
            if (acf.airframeTypeId) typeIds.add(acf.airframeTypeId);
          }
          const airframePerf = Object.fromEntries(
            [...typeIds].map((typeId) => {
              const listing = listings.find((row) => row.airframeTypeId === typeId);
              const fleetAcf = missions.fleet.find(
                (row) => row.airframeTypeId === typeId,
              );
              const classId =
                listing?.aircraftClassId ??
                fleetAcf?.aircraftClassId ??
                findCareerPlayerAirframe(typeId)?.aircraftClassId ??
                'light_ga';
              const classRow = catalogByClass.get(classId);
              const liveOverride =
                missions.airframePerfOverrides?.[typeId] ?? null;
              return [
                typeId,
                resolveAirframePerfForUi(
                  typeId,
                  classId,
                  classRow,
                  liveOverride,
                ),
              ] as const;
            }),
          );
          return {
            ...clockPayload(world, nowMs),
            walletUsd: missions.walletUsd,
            dayIndex: economyDayIndex(world.tick),
            listings,
            catalog,
            airframePerf,
            fleet: withParkingRates(missions.fleet),
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/buy') {
        const body = (await readBody(req)) as { listingId?: string };
        if (!body.listingId) {
          send(res, 400, { error: 'listingId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            settleAircraftMarketOps(missions, world.tick);
            const purchased = purchaseAircraftListing(
              missions,
              world,
              body.listingId!,
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: purchased.debitUsd,
              aircraft: purchased.aircraft,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/lease') {
        const body = (await readBody(req)) as { listingId?: string };
        if (!body.listingId) {
          send(res, 400, { error: 'listingId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            settleAircraftMarketOps(missions, world.tick);
            const leased = signAircraftLease(missions, world, body.listingId!);
            return {
              walletUsd: missions.walletUsd,
              debitUsd: leased.debitUsd,
              aircraft: leased.aircraft,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/sell') {
        const body = (await readBody(req)) as { aircraftId?: string };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const sold = sellPlayerAircraft(
              missions,
              body.aircraftId!,
              world.tick,
            );
            return {
              walletUsd: missions.walletUsd,
              creditUsd: sold.creditUsd,
              listing: sold.listing,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/list-lease') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          termMonths?: number;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const term = body.termMonths === 24 ? (24 as const) : (12 as const);
            const listed = listAircraftForLease(
              missions,
              body.aircraftId!,
              world.tick,
              { termMonths: term },
            );
            return {
              walletUsd: missions.walletUsd,
              listing: listed.listing,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/unlist') {
        const body = (await readBody(req)) as { aircraftId?: string };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            unlistAircraftForLease(missions, body.aircraftId!);
            return {
              walletUsd: missions.walletUsd,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/maintenance') {
        const body = (await readBody(req)) as { aircraftId?: string };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const mx = clearAircraftMaintenanceWithParts(
              missions,
              body.aircraftId!,
              world,
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: mx.debitUsd,
              needsRepair: mx.needsRepair,
              mro: mx.mro,
              fleet: withParkingRates(missions.fleet),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/repair') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          airframePts?: number;
          enginePts?: number;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const repaired = repairAircraftConditionWithParts(
              missions,
              body.aircraftId!,
              world,
              {
                airframePts: body.airframePts,
                enginePts: body.enginePts,
              },
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: repaired.debitUsd,
              aircraft: repaired.aircraft,
              mro: repaired.mro,
              fleet: withParkingRates(missions.fleet),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/buyout') {
        const body = (await readBody(req)) as { aircraftId?: string };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const boughtOut = buyOutAircraftLease(
              missions,
              body.aircraftId!,
              world.tick,
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: boughtOut.debitUsd,
              fleet: withParkingRates(missions.fleet, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/fleet/ferry') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          destIcao?: string;
          quoteOnly?: boolean;
        };
        if (!body.aircraftId || !body.destIcao) {
          send(res, 400, { error: 'aircraftId and destIcao required' });
          return;
        }
        try {
          if (body.quoteOnly) {
            const quoted = await withCareerRead((world, missions) => {
              const quote = quoteFerry(world, missions, {
                aircraftId: body.aircraftId!,
                destIcao: body.destIcao!,
              });
              return { quote, walletUsd: missions.walletUsd };
            });
            send(res, 200, quoted);
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            const ferried = executeFerry(world, missions, {
              aircraftId: body.aircraftId!,
              destIcao: body.destIcao!,
            });
            return {
              aircraft: ferried.aircraft,
              quote: ferried.quote,
              walletDebitUsd: ferried.walletDebitUsd,
              walletUsd: missions.walletUsd,
              ...fleetPayload(missions),
            };
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/cargo-limit') {
        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        if (!aircraft) {
          send(res, 400, { error: 'aircraft query required' });
          return;
        }
        const airframeTypeId = url.searchParams.get('airframe') ?? undefined;
        const cargoLimit = await resolveClassMaxCargoKg(
          aircraft,
          airframeTypeId,
        );
        const distanceNm = Number(url.searchParams.get('distanceNm'));
        const routeLimit =
          Number.isFinite(distanceNm) && distanceNm >= 0
            ? estimateRouteCargoLimit(
                aircraft,
                distanceNm,
                cargoLimit.maxCargoKg,
                cargoLimit,
              )
            : undefined;
        send(res, 200, {
          aircraftClassId: aircraft,
          maxCargoKg: cargoLimit.maxCargoKg,
          maxCargoSource: cargoLimit.source,
          airframeLabel: cargoLimit.airframeLabel,
          oewKg: cargoLimit.oewKg ?? null,
          mtowKg: cargoLimit.mtowKg ?? null,
          fuelCapacityKg: routeLimit?.fuelCapacityKg ?? null,
          operationalMaxCargoKg:
            routeLimit?.operationalMaxCargoKg ?? cargoLimit.maxCargoKg,
          estimatedBlockFuelKg: routeLimit?.estimatedBlockFuelKg ?? null,
          fuelDeficitKg: routeLimit?.fuelDeficitKg ?? null,
          fuelFeasible: routeLimit?.fuelFeasible ?? null,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/market') {
        const { world, cargoOps } = await withCareerWrite((w, missions) => {
          reconcilePlayerInbound(w, missions.missions);
          return { world: w, cargoOps: missions.cargoOps };
        });
        const nowMs = Date.now();
        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        const origin = url.searchParams.get('origin') ?? undefined;
        const dest = url.searchParams.get('dest') ?? undefined;
        const query = url.searchParams.get('q') ?? undefined;
        const originQuery = url.searchParams.get('originQ') ?? undefined;
        const destQuery = url.searchParams.get('destQ') ?? undefined;
        const pageParam = url.searchParams.get('page');
        const exactRoute = Boolean(origin?.trim() && dest?.trim());
        const commodityParam = url.searchParams.get('commodity') ?? undefined;
        const filter = {
          originIcao: origin ?? undefined,
          destIcao: dest ?? undefined,
          query: query ?? undefined,
          originQuery: originQuery ?? undefined,
          destQuery: destQuery ?? undefined,
          nowMs,
        };
        const cargoLimit = aircraft ? await resolveClassMaxCargoKg(aircraft) : undefined;
        const listed = aircraft
          ? listViableMarketLots(world, aircraft, {
              ...filter,
              maxCargoKg: cargoLimit?.maxCargoKg,
            })
          : listMarketLots(world, filter);
        const mapped = listed.map((row) => ({
          id: row.lot.id,
          originIcao: row.lot.originIcao,
          destIcao: row.lot.destIcao,
          originName: row.originName,
          destName: row.destName,
          distanceNm: routeDistanceNm(
            world,
            row.lot.originIcao,
            row.lot.destIcao,
          ),
          commodityId: row.lot.commodityId,
          commodityName: row.commodityName,
          quantityKg: row.lot.quantityKg,
          availableKg: row.availableKg,
          payUsd: row.lot.payUsd,
          urgency: row.lot.urgency,
          reason: row.lot.reason,
          createdAtTick: row.lot.createdAtTick,
          expiresAtTick: row.lot.expiresAtTick,
          ticksRemaining: Math.max(0, row.lot.expiresAtTick - world.tick),
          perishable: Boolean(getCommodity(row.lot.commodityId).perishable),
          cargoLocked: !cargoOpsIsUnlocked(
            cargoOps ?? undefined,
            row.lot.commodityId,
          ),
          pressure: row.pressure
            ? {
                originRegion: row.pressure.originRegion,
                originRegionCapacity: row.pressure.originRegionCapacity,
                laneSaturation: row.pressure.laneSaturation,
                thinFleet: row.pressure.thinFleet,
                laneBusy: row.pressure.laneBusy,
                weather: row.pressure.weather,
                idleEscalated: row.pressure.idleEscalated ?? false,
                idlePayMult: row.pressure.idlePayMult ?? 1,
                demandShock: row.pressure.demandShock ?? false,
                shockLabels: row.pressure.shockLabels ?? [],
                shockPayMult: row.pressure.shockPayMult ?? 1,
                international: row.pressure.international ?? false,
              }
            : null,
          npcClaim: row.npcClaim
            ? {
                npcName: row.npcClaim.npcName,
                cargoKg: row.npcClaim.cargoKg,
                etaHours: row.npcClaim.etaHours,
              }
            : null,
        }));
        const requestedSorts = parseMarketBoardSorts(
          url.searchParams.get('sort'),
        );
        const boardOpts = {
          currentTick: world.tick,
          distanceMaxNm: parsePositiveNumberParam(
            url.searchParams.get('distanceMaxNm'),
          ),
          commodityId: commodityParam,
          loadMaxKg: parsePositiveNumberParam(url.searchParams.get('loadMaxKg')),
          expiresWithinHours: parsePositiveNumberParam(
            url.searchParams.get('expiresWithinHours'),
          ),
          minPayUsd: parsePositiveNumberParam(url.searchParams.get('minPayUsd')),
          accessFilter: parseMarketBoardAccessFilter(
            url.searchParams.get('access'),
          ),
          // Sticky unlocked-first unless client sends access:desc.
          sorts: requestedSorts,
        };
        // Exact OD (route drawer): full filtered set. Paginated Freights sends page=.
        // Legacy callers without page keep a soft 200-row cap.
        const paged =
          exactRoute && pageParam === null
            ? queryMarketBoardPage(mapped, {
                ...boardOpts,
                page: 1,
                pageSize: Math.max(mapped.length, 1),
              })
            : queryMarketBoardPage(mapped, {
                ...boardOpts,
                page: parsePositiveNumberParam(pageParam) ?? 1,
                pageSize:
                  parsePositiveNumberParam(url.searchParams.get('pageSize')) ??
                  (pageParam === null ? MARKET_LOT_LIMIT : 10),
              });
        send(res, 200, {
          ...clockPayload(world, nowMs),
          aircraftClassId: aircraft ?? null,
          maxCargoKg: cargoLimit?.maxCargoKg ?? null,
          maxCargoSource: cargoLimit?.source ?? null,
          airframeLabel: cargoLimit?.airframeLabel ?? null,
          npcActivity: mapNpcActivity(world, nowMs),
          regionPressure: listRegionMarketPressure(world, nowMs).map((r) => ({
            region: r.region,
            capacity: r.capacity,
            thinFleet: r.thinFleet,
            ready: r.ready,
            total: r.total,
            resting: r.resting,
            maintenance: r.maintenance,
            weather: r.weather,
            fuelThin: regionFuelThin(world, r.region, nowMs),
          })),
          totalLots: paged.total,
          page: paged.page,
          pageSize: paged.pageSize,
          pageCount: paged.pageCount,
          lotLimit: paged.pageSize,
          countries: listWorldCountryIds(world),
          internationalLaneCount: world.internationalLanes?.length ?? 0,
          homeCountryId: world.homeCountryId ?? null,
          lots: paged.rows,
          events: listActiveEconomyEvents(world).map((ev) => ({
            id: ev.id,
            kind: ev.kind,
            region: ev.region,
            commodityId: ev.commodityId ?? null,
            startsAtTick: ev.startsAtTick,
            endsAtTick: ev.endsAtTick,
            label: ev.label,
          })),
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/npc') {
        const world = await loadEconomy();
        const nowMs = Date.now();
        const fleet = mapNpcFleet(world, nowMs);
        send(res, 200, {
          ...clockPayload(world, nowMs),
          fleetSize: fleet.length,
          busy: fleet.filter((n) => n.status === 'busy').length,
          airborne: fleet.filter((n) => n.phase === 'enroute' || n.phase === 'arriving')
            .length,
          turnaround: fleet.filter((n) => n.phase === 'turnaround').length,
          resting: fleet.filter((n) => n.phase === 'resting').length,
          maintenance: fleet.filter((n) => n.phase === 'maintenance').length,
          idle: fleet.filter((n) => n.phase === 'idle').length,
          regionPressure: listRegionMarketPressure(world, nowMs).map((r) => ({
            region: r.region,
            capacity: r.capacity,
            thinFleet: r.thinFleet,
            ready: r.ready,
            total: r.total,
            resting: r.resting,
            maintenance: r.maintenance,
            weather: r.weather,
            fuelThin: regionFuelThin(world, r.region, nowMs),
          })),
          fleet,
          activity: mapNpcActivity(world, nowMs),
        });
        return;
      }

      const airportMatch = path.match(/^\/api\/airport\/([A-Za-z0-9]{3,4})$/);
      if (req.method === 'GET' && airportMatch) {
        const icao = airportMatch[1]!.toUpperCase();
        const world = await loadEconomy();
        const missions = await loadMissions();
        const nowMs = Date.now();
        const airport = world.airports.find((a) => a.icao === icao);
        if (!airport) {
          send(res, 404, { error: `Unknown airport ${icao}` });
          return;
        }

        const commodities = CAREER_COMMODITIES.map((c) => {
          const pile = airport.inventory[c.id] ?? { stockKg: 0, capacityKg: 0 };
          const fill = fillPct(pile.stockKg, pile.capacityKg);
          const productionPerTickKg = airport.production[c.id] ?? 0;
          const consumptionPerTickKg = airport.consumption[c.id] ?? 0;
          return {
            commodityId: c.id,
            name: c.name,
            kind: c.kind ?? 'cargo',
            perishable: Boolean(c.perishable),
            highValue: Boolean(c.highValue),
            stockKg: pile.stockKg,
            capacityKg: pile.capacityKg,
            stockTonnes: pile.stockKg / 1000,
            capacityTonnes: pile.capacityKg / 1000,
            fillPct: fill,
            balance: stockBalance(fill),
            trend: stockTrend(productionPerTickKg, consumptionPerTickKg),
            productionPerTickKg,
            consumptionPerTickKg,
            unitPriceUsd: localUnitPriceUsd(c.id, pile),
          };
        });

        const totalStockKg = commodities.reduce((sum, c) => sum + c.stockKg, 0);
        const relatedLots = world.lots
          .filter(
            (lot) =>
              (lot.originIcao === icao || lot.destIcao === icao) &&
              (lot.status === 'available' ||
                lot.status === 'reserved' ||
                lot.status === 'in_transit'),
          )
          .map((lot) => mapLotSummary(world, lot, nowMs));

        const movements = mapAirportMovements(world, icao, missions.missions, nowMs);
        const fuelInbound = listAirportFuelInbound(world, icao, nowMs).map(mapFuelHaulView);
        const fuelRecent = listFuelHaulViews(world, { destIcao: icao, nowMs })
          .filter((h) => h.status === 'completed' || h.phase === 'delivered')
          .slice(-3)
          .map(mapFuelHaulView);
        const levelInfo = hubLevelXpProgress(airport);
        const levelProfile = hubLevelProfile(levelInfo.level);

        send(res, 200, {
          ...clockPayload(world, nowMs),
          airport: {
            icao: airport.icao,
            name: airport.name,
            region: airport.region,
            level: levelInfo.level,
            hubTier: hubTierOf(airport),
            lat: airport.lat,
            lon: airport.lon,
          },
          hubLevel: {
            level: levelInfo.level,
            xp: levelInfo.xp,
            xpIntoLevel: levelInfo.xpIntoLevel,
            xpForNext: levelInfo.xpForNext,
            progressPct: levelInfo.progressPct,
            capacityMult: levelProfile.capacityMult,
            flowMult: levelProfile.flowMult,
            laneBonus: levelProfile.laneBonus,
            originPayMult: levelProfile.originPayMult,
            quiet: (airport.activityScore ?? 40) < 8,
          },
          events: listActiveEconomyEvents(world, { icao }),
          totalStockKg,
          totalStockTonnes: totalStockKg / 1000,
          commodities,
          outboundLots: relatedLots.filter((l) => l.originIcao === icao),
          inboundLots: relatedLots.filter((l) => l.destIcao === icao),
          arrivals: movements.arrivals,
          departures: movements.departures,
          npcActivity: mapNpcActivity(world, nowMs).filter(
            (f) => f.originIcao === icao || f.destIcao === icao,
          ),
          fuelInbound,
          fuelRecent,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/missions') {
        const missions = await loadMissions();
        send(res, 200, {
          ...missions,
          missions: missions.missions.map((m) => withMissionLoadPolicy(m)),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/tick') {
        const body = (await readBody(req)) as { n?: number };
        const n = Math.max(1, Math.min(TICKS_PER_DAY * 7, Math.floor(body.n ?? TICKS_PER_DAY)));
        const payload = await withCareerWrite((world, missions) => {
          tickEconomyN(world, n);
          const leaseOps = settleAircraftMarketOps(missions, world.tick, world);
          const hangarOps = settleHangarParkingFees(missions, world, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          listAircraftMarket(missions, world);
          const nowMs = Date.now();
          return {
            ...clockPayload(world, nowMs),
            availableLots: world.lots.filter((l) => l.status === 'available').length,
            leasePaidUsd: leaseOps.paidUsd,
            leaseRepossessed: leaseOps.repossessed,
            leaseOutEarnedUsd: leaseOps.leaseOutEarnedUsd,
            hangarDebitUsd: hangarOps.debitUsd,
            hangarRequestedUsd: hangarOps.requestedUsd,
            hangarShortfallUsd: hangarOps.shortfallUsd,
            hangarDaysCharged: hangarOps.daysCharged,
            walletUsd: missions.walletUsd,
          };
        });
        send(res, 200, payload);
        return;
      }

      // Temporary test aid — remove before release.
      if (req.method === 'POST' && path === '/api/debug/credit-wallet') {
        const body = (await readBody(req)) as { amountUsd?: number };
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? Math.round(body.amountUsd * 100) / 100
            : 100_000;
        if (amountUsd === 0) {
          send(res, 400, { error: 'amountUsd must be non-zero' });
          return;
        }
        const payload = await withCareerWrite((world, missions) => {
          applyWalletDelta(missions, {
            amountUsd,
            kind: 'other',
            atTick: world.tick,
            note: 'Debug wallet credit',
          });
          return { walletUsd: missions.walletUsd, creditedUsd: amountUsd };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/init') {
        const body = (await readBody(req)) as {
          seed?: string;
          resetMissions?: boolean;
        };
        const fresh = await withCareerLock(async () => {
          const world = createSeedEconomyWorld({ seed: body.seed });
          // Warm one career day so Freights/Contracts exist without a manual +1 day.
          ensureSeedMarketFormed(world);
          await persistEconomyUnlocked(world);
          if (body.resetMissions) {
            await saveMissions(emptyMissionsStateV2());
          }
          return world;
        });
        const availableLots = fresh.lots.filter(
          (lot) => lot.status === 'available' && lot.quantityKg > lot.reservedKg,
        ).length;
        send(res, 200, {
          tick: fresh.tick,
          seed: fresh.seed,
          airports: fresh.airports.length,
          npcFleet: fresh.npcs.length,
          availableLots,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/accept') {
        const body = (await readBody(req)) as {
          lotId?: string;
          kg?: number;
          aircraft?: string;
          missionId?: string;
        };
        if (!body.lotId) {
          send(res, 400, { error: 'lotId required' });
          return;
        }
        const aircraft =
          (parseFreighterClassId(body.aircraft) as FreighterClassId | undefined) ??
          'narrow_freighter';
        const cargoLimit = await resolveClassMaxCargoKg(aircraft);
        try {
          const result = await withCareerWrite((world, missions) => {
            const lot = world.lots.find((l) => l.id === body.lotId);
            if (!lot) return { kind: 'missing_lot' as const };

            let intoMission =
              body.missionId
                ? missions.missions.find((m) => m.id === body.missionId)
                : findOpenManifestForRoute(missions.missions, {
                    originIcao: lot.originIcao,
                    destIcao: lot.destIcao,
                    aircraftClassId: aircraft,
                  });

            if (body.missionId && !intoMission) {
              return { kind: 'missing_mission' as const };
            }

            const beforeLots = intoMission?.lots.length ?? 0;
            const mission = acceptMission(world, {
              lotId: body.lotId!,
              cargoKg: body.kg,
              aircraftClassId: aircraft,
              maxCargoKg: cargoLimit.maxCargoKg,
              intoMission: intoMission ?? undefined,
              cargoOps: missions.cargoOps,
            });
            const appended = Boolean(intoMission) && mission.lots.length > beforeLots;
            if (intoMission) {
              const idx = missions.missions.findIndex((m) => m.id === intoMission!.id);
              if (idx >= 0) missions.missions[idx] = mission;
              else missions.missions.push(mission);
            } else {
              missions.missions.push(mission);
            }
            return {
              kind: 'ok' as const,
              mission,
              walletUsd: missions.walletUsd,
              appended,
            };
          });
          if (result.kind === 'missing_lot') {
            send(res, 404, { error: `Unknown lot ${body.lotId}` });
            return;
          }
          if (result.kind === 'missing_mission') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          send(res, 200, {
            mission: result.mission,
            walletUsd: result.walletUsd,
            maxCargoKg: cargoLimit.maxCargoKg,
            maxCargoSource: cargoLimit.source,
            appended: result.appended,
            remainingKg: missionRemainingCapacityKg(
              result.mission,
              cargoLimit.maxCargoKg,
            ),
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/staging/commit') {
        const body = (await readBody(req)) as {
          aircraft?: string;
          aircraftId?: string;
          missionId?: string;
          openDispatch?: boolean;
          replace?: boolean;
          weightSystem?: 'metric' | 'imperial';
          units?: 'KGS' | 'LBS';
          lines?: Array<{ lotId?: string; cargoKg?: number }>;
        };
        const lines = (body.lines ?? [])
          .filter((line) => line.lotId)
          .map((line) => ({
            lotId: String(line.lotId),
            cargoKg: Number(line.cargoKg),
          }));
        if (lines.length === 0) {
          send(res, 400, { error: 'lines required' });
          return;
        }
        const replace = body.replace === true;
        if (replace && !body.missionId) {
          send(res, 400, { error: 'missionId required when replace=true' });
          return;
        }
        const peek = await withCareerRead((world, missions) => {
          if (!missions.hubSelected || missions.fleet.length === 0) {
            return { kind: 'no_hub' as const };
          }
          const firstLot = world.lots.find((lot) => lot.id === lines[0]!.lotId);
          if (!firstLot) return { kind: 'missing_lot' as const };
          const intoMission = body.missionId
            ? missions.missions.find((m) => m.id === body.missionId)
            : undefined;
          if (body.missionId && !intoMission) {
            return { kind: 'missing_mission' as const };
          }
          let playerAircraft: PlayerAircraft | undefined = body.aircraftId
            ? findPlayerAircraft(missions, body.aircraftId)
            : undefined;
          if (body.aircraftId && !playerAircraft) {
            return { kind: 'missing_aircraft' as const };
          }
          if (!playerAircraft && intoMission?.aircraftId) {
            playerAircraft = findPlayerAircraft(missions, intoMission.aircraftId);
          }
          if (!playerAircraft) {
            playerAircraft = listParkedAt(missions, firstLot.originIcao)[0];
          }
          if (!playerAircraft) {
            return {
              kind: 'no_parked' as const,
              originIcao: firstLot.originIcao,
            };
          }
          return {
            kind: 'ok' as const,
            aircraftClassId: playerAircraft.aircraftClassId,
            airframeTypeId: playerAircraft.airframeTypeId,
          };
        });
        if (peek.kind === 'no_hub') {
          send(res, 400, { error: 'Select a starter hub before staging a flight' });
          return;
        }
        if (peek.kind === 'missing_lot') {
          send(res, 404, { error: `Unknown lot ${lines[0]!.lotId}` });
          return;
        }
        if (peek.kind === 'missing_mission') {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (peek.kind === 'missing_aircraft') {
          send(res, 404, { error: `Unknown aircraft ${body.aircraftId}` });
          return;
        }
        if (peek.kind === 'no_parked') {
          send(res, 400, {
            error: `No parked aircraft at ${peek.originIcao} — ferry one there first`,
          });
          return;
        }
        const cargoLimit = await resolveClassMaxCargoKg(
          peek.aircraftClassId,
          peek.airframeTypeId,
        );
        try {
          const committed = await withCareerWrite((world, missions) => {
            if (!missions.hubSelected || missions.fleet.length === 0) {
              throw new Error('Select a starter hub before staging a flight');
            }
            const firstLot = world.lots.find((lot) => lot.id === lines[0]!.lotId);
            if (!firstLot) {
              throw new Error(`Unknown lot ${lines[0]!.lotId}`);
            }
            let intoMission =
              body.missionId
                ? missions.missions.find((m) => m.id === body.missionId)
                : undefined;
            if (body.missionId && !intoMission) {
              throw new Error(`Unknown mission ${body.missionId}`);
            }
            let playerAircraft: PlayerAircraft | undefined = body.aircraftId
              ? findPlayerAircraft(missions, body.aircraftId)
              : undefined;
            if (body.aircraftId && !playerAircraft) {
              throw new Error(`Unknown aircraft ${body.aircraftId}`);
            }
            if (!playerAircraft && intoMission?.aircraftId) {
              playerAircraft = findPlayerAircraft(missions, intoMission.aircraftId);
            }
            if (!playerAircraft) {
              playerAircraft = listParkedAt(missions, firstLot.originIcao)[0];
            }
            if (!playerAircraft) {
              throw new Error(
                `No parked aircraft at ${firstLot.originIcao} — ferry one there first`,
              );
            }
            const aircraft = playerAircraft.aircraftClassId;
            const playerAirframe = findCareerPlayerAirframe(
              playerAircraft.airframeTypeId,
            );
            const stagingDistanceNm =
              routeDistanceNm(world, firstLot.originIcao, firstLot.destIcao) ?? 0;
            const routeCargoLimit = estimateRouteCargoLimit(
              aircraft,
              stagingDistanceNm,
              cargoLimit.maxCargoKg,
              cargoLimit,
            );
            const operationalMaxCargoKg = routeCargoLimit.operationalMaxCargoKg;
            if (!routeCargoLimit.fuelFeasible) {
              throw new Error(
                `Estimated block fuel ${routeCargoLimit.estimatedBlockFuelKg} kg exceeds ` +
                  `${aircraft} tank capacity ${routeCargoLimit.fuelCapacityKg} kg ` +
                  `(deficit ${routeCargoLimit.fuelDeficitKg} kg)`,
              );
            }
            if (!intoMission && !replace) {
              intoMission = findOpenManifestForRoute(missions.missions, {
                originIcao: firstLot.originIcao,
                destIcao: firstLot.destIcao,
                aircraftClassId: aircraft,
              });
            }
            const activeMissions = listActivePlayerMissions(missions.missions);
            if (!intoMission && activeMissions.length > 0) {
              throw new Error(
                `Finish or cancel active flight ${activeMissions[0]!.id} before staging another`,
              );
            }
            if (
              intoMission &&
              activeMissions.some((mission) => mission.id !== intoMission!.id)
            ) {
              throw new Error(
                'Another active flight is already open — finish it before adding cargo',
              );
            }
            if (intoMission?.aircraftId && intoMission.aircraftId !== playerAircraft.id) {
              throw new Error(
                `Mission ${intoMission.id} is assigned to another aircraft`,
              );
            }
            let mission: MissionIntent;
            let appended = false;
            let lineCount = lines.length;
            if (replace) {
              if (!intoMission) {
                throw new Error('replace requires an existing mission');
              }
              mission = {
                ...replaceMissionManifest(world, intoMission, {
                  lines,
                  aircraftClassId: aircraft,
                  maxCargoKg: operationalMaxCargoKg,
                  cargoOps: missions.cargoOps,
                }),
                aircraftId: playerAircraft.id,
                airframeTypeId: playerAirframe?.typeId,
                rolesPackRelPath:
                  playerAirframe?.rolesPackRelPath ??
                  intoMission.rolesPackRelPath,
              };
              const idx = missions.missions.findIndex((m) => m.id === mission.id);
              if (idx >= 0) missions.missions[idx] = mission;
              else missions.missions.push(mission);
            } else {
              if (!intoMission) {
                if (
                  playerAircraft.status !== 'parked' ||
                  playerAircraft.locationIcao !== firstLot.originIcao
                ) {
                  throw new Error(
                    `Aircraft ${playerAircraft.id} is at ${playerAircraft.locationIcao}, not ${firstLot.originIcao}`,
                  );
                }
              }
              const staged = commitStagedManifest(world, {
                lines,
                aircraftClassId: aircraft,
                maxCargoKg: operationalMaxCargoKg,
                intoMission: intoMission ?? undefined,
                airframeTypeId: playerAirframe?.typeId,
                cargoOps: missions.cargoOps,
              });
              mission = {
                ...staged.mission,
                aircraftId: playerAircraft.id,
                airframeTypeId: playerAirframe?.typeId,
                rolesPackRelPath:
                  playerAirframe?.rolesPackRelPath ??
                  staged.mission.rolesPackRelPath,
              };
              appended = staged.appended;
              lineCount = staged.lineCount;
              if (staged.appended && intoMission) {
                const idx = missions.missions.findIndex((m) => m.id === intoMission!.id);
                if (idx >= 0) missions.missions[idx] = mission;
                else missions.missions.push(mission);
              } else {
                const idx = missions.missions.findIndex((m) => m.id === mission.id);
                if (idx >= 0) missions.missions[idx] = mission;
                else missions.missions.push(mission);
                assignAircraftToMission(
                  missions,
                  playerAircraft.id,
                  mission.id,
                  mission.originIcao,
                );
              }
            }
            return {
              mission,
              appended,
              lineCount,
              operationalMaxCargoKg,
              estimatedBlockFuelKg: routeCargoLimit.estimatedBlockFuelKg,
              walletUsd: missions.walletUsd,
              fleet: withParkingRates(missions.fleet),
            };
          });

          let mission = committed.mission;
          let dispatch:
            | {
                url: string;
                staticId: string;
                type: string;
                airframeLabel: string;
                opened: boolean;
              }
            | undefined;
          if (body.openDispatch !== false) {
            const built = await buildMissionDispatch(mission, {
              units: body.units ?? body.weightSystem,
            });
            mission = await withCareerWrite((world, missions) => {
              const idx = missions.missions.findIndex((m) => m.id === mission.id);
              const dispatched: MissionIntent = {
                ...mission,
                staticId: built.staticId,
                status: 'dispatched',
                dispatchedAtTick: world.tick,
                lastOfpCheck: undefined,
                lastPreflightCheck: undefined,
                fuelAuthorizedOfpId: undefined,
              };
              if (idx >= 0) missions.missions[idx] = dispatched;
              else missions.missions.push(dispatched);
              return dispatched;
            });
            openDispatchUrl(built.url);
            dispatch = {
              url: built.url,
              staticId: built.staticId,
              type: built.type,
              airframeLabel: built.airframeLabel,
              opened: true,
            };
          }

          send(res, 200, {
            mission,
            walletUsd: committed.walletUsd,
            maxCargoKg: committed.operationalMaxCargoKg,
            structuralMaxCargoKg: cargoLimit.maxCargoKg,
            operationalMaxCargoKg: committed.operationalMaxCargoKg,
            estimatedBlockFuelKg: committed.estimatedBlockFuelKg,
            maxCargoSource: cargoLimit.source,
            appended: committed.appended,
            replaced: replace,
            lineCount: committed.lineCount,
            remainingKg: missionRemainingCapacityKg(
              mission,
              committed.operationalMaxCargoKg,
            ),
            dispatch: dispatch ?? null,
            fleet: committed.fleet,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const notFound =
            /^Unknown (lot|mission|aircraft) /.test(message) ||
            message.startsWith('Unknown lot') ||
            message.startsWith('Unknown mission') ||
            message.startsWith('Unknown aircraft');
          send(res, notFound ? 404 : 400, { error: message });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/cancel') {
        const body = (await readBody(req)) as { missionId?: string };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        // Stop live watch first so an in-flight tick cannot rewrite this mission.
        const watch = watchSession.getStatus();
        if (watch.running && watch.missionId === body.missionId) {
          await watchSession.stop();
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const idx = missions.missions.findIndex((m) => m.id === body.missionId);
            if (idx < 0) return { kind: 'missing' as const };
            const existing = missions.missions[idx]!;
            const lines = existing.lots?.length
              ? existing.lots
              : existing.shipmentLotId
                ? [
                    {
                      shipmentLotId: existing.shipmentLotId,
                      cargoKg: existing.cargoKg,
                    },
                  ]
                : [];
            let reservedBefore = 0;
            let foundBefore = 0;
            for (const line of lines) {
              const lot = world.lots.find((l) => l.id === line.shipmentLotId);
              if (lot) {
                foundBefore += 1;
                reservedBefore += lot.reservedKg;
              }
            }
            const cancelled = cancelMission(world, existing, { fleet: missions });
            let reservedAfter = 0;
            let anyReturned = false;
            for (const line of lines) {
              const lot = world.lots.find((l) => l.id === line.shipmentLotId);
              if (!lot) continue;
              reservedAfter += lot.reservedKg;
              if (lot.status === 'available' || lot.status === 'reserved') {
                anyReturned = true;
              }
            }
            const releasedKg = Math.max(0, reservedBefore - reservedAfter);
            const returnedToMarket = releasedKg > 0 && anyReturned;
            missions.missions[idx] = cancelled;
            return {
              kind: 'ok' as const,
              cancelled,
              walletUsd: missions.walletUsd,
              releasedKg,
              returnedToMarket,
              foundBefore,
            };
          });
          if (result.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          send(res, 200, {
            mission: result.cancelled,
            walletUsd: result.walletUsd,
            releasedKg: result.releasedKg,
            returnedToMarket: result.returnedToMarket,
            warning:
              result.foundBefore > 0
                ? result.returnedToMarket
                  ? null
                  : 'Mission cancelled, but its shipment lot was already expired'
                : 'Mission cancelled; its shipment lot had already been pruned or reset',
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/dispatch') {
        const body = (await readBody(req)) as {
          missionId?: string;
          open?: boolean;
          weightSystem?: 'metric' | 'imperial';
          units?: 'KGS' | 'LBS';
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const prep = await withCareerRead((world, missions) => {
          const mission = missions.missions.find((m) => m.id === body.missionId);
          if (!mission) return { kind: 'missing' as const };
          if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
            return {
              kind: 'bad_status' as const,
              status: mission.status,
              id: mission.id,
            };
          }
          const dispatchDistanceNm =
            routeDistanceNm(world, mission.originIcao, mission.destIcao) ?? 0;
          return {
            kind: 'ok' as const,
            mission,
            dispatchDistanceNm,
            aircraftClassId: mission.aircraftClassId,
          };
        });
        if (prep.kind === 'missing') {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (prep.kind === 'bad_status') {
          send(res, 400, {
            error: `Mission ${prep.id} cannot dispatch (status=${prep.status})`,
          });
          return;
        }

        const dispatchCargoLimit = await resolveClassMaxCargoKg(
          prep.aircraftClassId,
        );
        const dispatchRouteLimit = estimateRouteCargoLimit(
          prep.aircraftClassId,
          prep.dispatchDistanceNm,
          dispatchCargoLimit.maxCargoKg,
          dispatchCargoLimit,
        );
        if (!dispatchRouteLimit.fuelFeasible) {
          send(res, 400, {
            error:
              `Estimated block fuel ${dispatchRouteLimit.estimatedBlockFuelKg} kg exceeds ` +
              `tank capacity ${dispatchRouteLimit.fuelCapacityKg} kg ` +
              `(deficit ${dispatchRouteLimit.fuelDeficitKg} kg)`,
          });
          return;
        }

        const built = await buildMissionDispatch(prep.mission, {
          units: body.units ?? body.weightSystem,
        });
        const mission = await withCareerWrite((world, missions) => {
          const idx = missions.missions.findIndex((m) => m.id === body.missionId);
          if (idx < 0) {
            throw new Error(`Unknown mission ${body.missionId}`);
          }
          const open = missions.missions[idx]!;
          if (open.status !== 'accepted' && open.status !== 'dispatched') {
            throw new Error(
              `Mission ${open.id} cannot dispatch (status=${open.status})`,
            );
          }
          const dispatched: MissionIntent = {
            ...open,
            staticId: built.staticId,
            status: 'dispatched',
            dispatchedAtTick: world.tick,
            lastOfpCheck: undefined,
            lastPreflightCheck: undefined,
            fuelAuthorizedOfpId: undefined,
          };
          missions.missions[idx] = dispatched;
          return dispatched;
        });

        const shouldOpen = body.open !== false;
        if (shouldOpen) {
          openDispatchUrl(built.url);
        }

        send(res, 200, {
          mission,
          url: built.url,
          staticId: built.staticId,
          type: built.type,
          airframeLabel: built.airframeLabel,
          cargoThousands: built.cargoThousands,
          units: built.units,
          opened: shouldOpen,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/confirm-ofp') {
        const body = (await readBody(req)) as {
          missionId?: string;
          simbriefUser?: string;
          simbriefUserid?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const probe = await loadMissions();
        const probeMission = probe.missions.find((m) => m.id === body.missionId);
        if (!probeMission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (
          probeMission.status !== 'dispatched' &&
          probeMission.status !== 'in_flight'
        ) {
          send(res, 400, {
            error: `Mission ${probeMission.id} needs Dispatch first (status=${probeMission.status})`,
          });
          return;
        }

        try {
          const result = await confirmMissionOfp(probeMission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
          });
          const ofpCheck = {
            verdict: result.check.verdict,
            summary: result.summary,
            checkedAtIso: new Date().toISOString(),
            ofpId: result.ofp.ofpId,
            staticId: probeMission.staticId,
            briefing: result.ofp.briefing,
            plannedBlockFuelKg: result.ofp.blockFuelKg,
            findings: result.check.findings.map((f) => ({
              code: f.code,
              severity: f.severity,
              message: f.message,
            })),
          };
          let savedMission: MissionIntent | null = null;
          const wrote = await updateOpenMission(body.missionId, (_missions, mission) => {
            if (
              mission.status !== 'dispatched' &&
              mission.status !== 'in_flight'
            ) {
              return false;
            }
            mission.lastOfpCheck = {
              ...ofpCheck,
              staticId: mission.staticId,
            };
            savedMission = mission;
            return true;
          });
          if (!wrote || !savedMission) {
            const latest = await loadMissions();
            const current = latest.missions.find((m) => m.id === body.missionId);
            if (!current) {
              send(res, 404, { error: `Unknown mission ${body.missionId}` });
              return;
            }
            send(res, 200, {
              mission: current,
              check: result.check,
              summary: result.summary,
              ofp: result.ofp,
              warning: isClosedMissionStatus(current.status)
                ? 'Mission was cancelled or closed before OFP could be saved'
                : 'Mission status changed before OFP could be saved',
            });
            return;
          }
          send(res, 200, {
            mission: savedMission,
            check: result.check,
            summary: result.summary,
            ofp: result.ofp,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (
        req.method === 'POST' &&
        (path === '/api/fuel/quote' || path === '/api/fuel/purchase')
      ) {
        const body = (await readBody(req)) as { missionId?: string };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        try {
          if (path === '/api/fuel/quote') {
            const quoted = await withCareerRead((world, missions) => {
              const idx = missions.missions.findIndex((m) => m.id === body.missionId);
              if (idx < 0) return { kind: 'missing' as const };
              const mission = missions.missions[idx]!;
              if (mission.status !== 'dispatched') {
                throw new Error(
                  `Fuel planning requires a dispatched mission (status=${mission.status})`,
                );
              }
              const ofp = mission.lastOfpCheck;
              if (
                !ofp ||
                (ofp.verdict !== 'pass' && ofp.verdict !== 'warn') ||
                !ofp.ofpId ||
                !(
                  typeof ofp.plannedBlockFuelKg === 'number' &&
                  ofp.plannedBlockFuelKg > 0
                )
              ) {
                throw new Error('Confirm a valid OFP before planning fuel');
              }
              if (ofp.staticId && ofp.staticId !== mission.staticId) {
                throw new Error('OFP belongs to a previous dispatch revision');
              }
              const quote = quotePlayerMissionOfpFuel(world, missions, mission, {
                ofpId: ofp.ofpId,
                requiredBlockFuelKg: ofp.plannedBlockFuelKg,
              });
              return {
                kind: 'ok' as const,
                quote,
                walletUsd: missions.walletUsd,
              };
            });
            if (quoted.kind === 'missing') {
              send(res, 404, { error: `Unknown mission ${body.missionId}` });
              return;
            }
            send(res, 200, {
              quote: quoted.quote,
              walletUsd: quoted.walletUsd,
              walletAfterUsd:
                Math.round((quoted.walletUsd - quoted.quote.uplift.costUsd) * 100) /
                100,
            });
            return;
          }

          const purchased = await withCareerWrite((world, missions) => {
            const idx = missions.missions.findIndex((m) => m.id === body.missionId);
            if (idx < 0) return { kind: 'missing' as const };
            const mission = missions.missions[idx]!;
            if (mission.status !== 'dispatched') {
              throw new Error(
                `Fuel planning requires a dispatched mission (status=${mission.status})`,
              );
            }
            const ofp = mission.lastOfpCheck;
            if (
              !ofp ||
              (ofp.verdict !== 'pass' && ofp.verdict !== 'warn') ||
              !ofp.ofpId ||
              !(
                typeof ofp.plannedBlockFuelKg === 'number' &&
                ofp.plannedBlockFuelKg > 0
              )
            ) {
              throw new Error('Confirm a valid OFP before planning fuel');
            }
            if (ofp.staticId && ofp.staticId !== mission.staticId) {
              throw new Error('OFP belongs to a previous dispatch revision');
            }
            const result = purchasePlayerMissionOfpFuel(world, missions, mission, {
              ofpId: ofp.ofpId,
              requiredBlockFuelKg: ofp.plannedBlockFuelKg,
            });
            missions.missions[idx] = result.mission;
            if (result.fuelDebitUsd > 0) {
              applyWalletDelta(missions, {
                amountUsd: -result.fuelDebitUsd,
                kind: 'fuel',
                atTick: world.tick,
                missionId: mission.id,
                icao: mission.originIcao,
                note: `${mission.originIcao}→${mission.destIcao}`,
              });
            }
            return {
              kind: 'ok' as const,
              mission: result.mission,
              quote: result.quote,
              fuelDebitUsd: result.fuelDebitUsd,
              walletUsd: missions.walletUsd,
              fleet: withParkingRates(missions.fleet),
            };
          });
          if (purchased.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          send(res, 200, {
            mission: purchased.mission,
            quote: purchased.quote,
            fuelDebitUsd: purchased.fuelDebitUsd,
            walletUsd: purchased.walletUsd,
            fleet: purchased.fleet,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/preflight') {
        const body = (await readBody(req)) as {
          missionId?: string;
          simbriefUser?: string;
          simbriefUserid?: string;
          pipeName?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        if (isOfpLoadActive()) {
          send(res, 409, {
            error: 'OFP inject in progress — preflight paused',
            code: 'ofp_inject_active',
          });
          return;
        }
        if (watchSession.getStatus().running) {
          send(res, 409, {
            error: 'Flight Watch owns SimBridge — preflight paused',
            code: 'watch_active',
          });
          return;
        }
        const probe = await loadMissions();
        const probeMission = probe.missions.find((m) => m.id === body.missionId);
        if (!probeMission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (!['accepted', 'dispatched', 'in_flight'].includes(probeMission.status)) {
          send(res, 400, {
            error: `Mission ${probeMission.id} cannot preflight (status=${probeMission.status})`,
          });
          return;
        }
        try {
          const result = await runMissionPreflight(probeMission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
            pipeName: body.pipeName,
          });
          const lastPreflightCheck = {
            verdict: result.check.verdict,
            summary: result.check.summary,
            checkedAtIso: result.check.checkedAtIso,
            phase: result.check.phase,
            loadVerification: result.check.loadVerification,
            findings: result.check.findings,
          };
          let savedMission: MissionIntent | null = null;
          const wrote = await updateOpenMission(body.missionId, (_missions, mission) => {
            if (!['accepted', 'dispatched', 'in_flight'].includes(mission.status)) {
              return false;
            }
            mission.lastPreflightCheck = lastPreflightCheck;
            savedMission = mission;
            return true;
          });
          if (!wrote || !savedMission) {
            const latest = await loadMissions();
            const current = latest.missions.find((m) => m.id === body.missionId);
            if (!current) {
              send(res, 404, { error: `Unknown mission ${body.missionId}` });
              return;
            }
            send(res, 200, {
              mission: current,
              check: result.check,
              summary: result.summary,
              ofp: result.ofp,
              live: result.live,
              warning: isClosedMissionStatus(current.status)
                ? 'Mission was cancelled or closed before Preflight could be saved'
                : 'Mission status changed before Preflight could be saved',
            });
            return;
          }
          send(res, 200, {
            mission: savedMission,
            check: result.check,
            summary: result.summary,
            ofp: result.ofp,
            live: result.live,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const unavailable =
            /ENOENT|pipe|connect|SimBridge|ECONNREFUSED/i.test(message);
          send(res, unavailable ? 503 : 400, { error: message });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/depart') {
        const body = (await readBody(req)) as {
          missionId?: string;
          override?: boolean;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const idx = missions.missions.findIndex((m) => m.id === body.missionId);
            if (idx < 0) return { kind: 'missing' as const };
            const existing = missions.missions[idx]!;
            if (preflightBlocksDepart(existing) && body.override !== true) {
              return {
                kind: 'preflight_failed' as const,
                preflight: existing.lastPreflightCheck ?? null,
              };
            }
            const departedResult = departMission(world, existing, { fleet: missions });
            const departed = departedResult.mission;
            missions.missions[idx] = departed;
            if (departedResult.fuelDebitUsd > 0) {
              applyWalletDelta(missions, {
                amountUsd: -departedResult.fuelDebitUsd,
                kind: 'fuel',
                atTick: world.tick,
                missionId: departed.id,
                icao: departed.originIcao,
                note: `${departed.originIcao}→${departed.destIcao}`,
              });
            }
            return {
              kind: 'ok' as const,
              mission: departed,
              walletUsd: missions.walletUsd,
              fuelDebitUsd: departedResult.fuelDebitUsd,
              fleet: withParkingRates(missions.fleet),
            };
          });
          if (result.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          if (result.kind === 'preflight_failed') {
            send(res, 400, {
              error:
                'Preflight failed — fix fuel/payload in the aircraft, re-run Preflight, or depart with override',
              code: 'preflight_failed',
              preflight: result.preflight,
            });
            return;
          }
          send(res, 200, {
            mission: result.mission,
            walletUsd: result.walletUsd,
            fuelDebitUsd: result.fuelDebitUsd,
            fleet: result.fleet,
            preflightOverride: body.override === true,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/settle') {
        const body = (await readBody(req)) as { missionId?: string };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const exists = await withCareerRead((_world, missions) =>
          missions.missions.some((m) => m.id === body.missionId),
        );
        if (!exists) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        try {
          let residualFuelKg: number | undefined;
          try {
            residualFuelKg = await probeLiveResidualFuelKg();
          } catch {
            // Manual/offline settle keeps the estimated-burn fallback.
            residualFuelKg = undefined;
          }
          // Prefer Watch-captured touchdown VS; else probe the sim latch.
          let landingFpm =
            watchSession.getStatus().missionId === body.missionId
              ? watchSession.getCapturedLandingFpm()
              : undefined;
          if (landingFpm === undefined) {
            try {
              landingFpm = await probeLiveLandingFpm();
            } catch {
              landingFpm = undefined;
            }
          }
          const airborneEndedAtMs =
            watchSession.getStatus().missionId === body.missionId
              ? watchSession.getCapturedAirborneEndedAtMs()
              : undefined;
          const flightScore =
            watchSession.getStatus().missionId === body.missionId
              ? watchSession.getCapturedFlightScore() ?? undefined
              : undefined;
          // Stop live watch first so an in-flight tick cannot rewrite this mission.
          const watch = watchSession.getStatus();
          if (watch.running && watch.missionId === body.missionId) {
            await watchSession.stop();
          }
          const settled = await withCareerWrite((world, missions) => {
            const idx = missions.missions.findIndex((m) => m.id === body.missionId);
            if (idx < 0) return { kind: 'missing' as const };
            const result = settleMission(world, missions.missions[idx]!, {
              fleet: missions,
              residualFuelKg,
              landingFpm,
              airborneEndedAtMs,
              nowMs: Date.now(),
              flightScore,
            });
            missions.missions[idx] = result.mission;
            if (result.walletCreditUsd > 0) {
              applyWalletDelta(missions, {
                amountUsd: result.walletCreditUsd,
                kind: 'freight_payout',
                atTick: world.tick,
                missionId: result.mission.id,
                icao: result.mission.destIcao,
                note: `${result.mission.originIcao}→${result.mission.destIcao}`,
              });
            }
            if (result.fuelDebitUsd > 0) {
              applyWalletDelta(missions, {
                amountUsd: -result.fuelDebitUsd,
                kind: 'fuel',
                atTick: world.tick,
                missionId: result.mission.id,
                icao: result.mission.destIcao,
                note: 'settlement fuel',
              });
            }
            return {
              kind: 'ok' as const,
              mission: result.mission,
              walletUsd: missions.walletUsd,
              fuelDebitUsd: result.fuelDebitUsd,
              fleet: withParkingRates(missions.fleet),
              settlement: result.settlement,
              cargoOpsDeltas: result.cargoOpsDeltas ?? [],
            };
          });
          if (settled.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          send(res, 200, {
            mission: settled.mission,
            walletUsd: settled.walletUsd,
            fuelDebitUsd: settled.fuelDebitUsd,
            fleet: settled.fleet,
            settlement: {
              payoutUsd: settled.settlement.payoutUsd,
              penaltyUsd: settled.settlement.penaltyUsd,
              lateTicks: settled.settlement.lateTicks,
              onTime: settled.settlement.onTime,
              deliveredKg: settled.settlement.deliveredKg,
              residualFuelKg: settled.mission.settledFuelKg ?? null,
              landingFpm: settled.mission.settledLandingFpm ?? null,
              flightDurationMs: settled.mission.settledFlightDurationMs ?? null,
              flightScore: settled.mission.settledFlightScore ?? null,
              cargoOpsDeltas: settled.cargoOpsDeltas,
            },
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/simbridge/status') {
        const status = await probeSimBridgeStatus({
          watchSession,
          pipeName: url.searchParams.get('pipe') ?? undefined,
        });
        send(res, 200, status);
        return;
      }

      if (req.method === 'GET' && path === '/api/load-ofp/progress') {
        const missionId = url.searchParams.get('missionId')?.trim();
        if (!missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        send(res, 200, {
          progress: getOfpLoadProgress(missionId),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/load-ofp/cancel') {
        const body = (await readBody(req)) as { missionId?: string };
        if (!body.missionId?.trim()) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const accepted = requestOfpLoadCancel(body.missionId);
        send(res, 200, {
          ok: true,
          accepted,
          progress: getOfpLoadProgress(body.missionId.trim()),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/load-ofp') {
        const body = (await readBody(req)) as {
          missionId?: string;
          simbriefUser?: string;
          simbriefUserid?: string;
          pipeName?: string;
          runPreflightAfter?: boolean;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const missions = await loadMissions();
        const idx = missions.missions.findIndex((m) => m.id === body.missionId);
        if (idx < 0) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        const mission = missions.missions[idx]!;
        const loadPolicy = missionLoadPolicy(mission);
        if (!careerAllowsDirectInject(loadPolicy)) {
          send(res, 409, {
            error:
              'This aircraft uses native SimBrief / EFB import — use Validate Fuel and Payload after loading in the aircraft',
            code: 'inject_not_supported',
            loadMethod: loadPolicy.loadMethod,
            injectCapable: loadPolicy.injectCapable,
          });
          return;
        }
        if (
          !mission.lastOfpCheck?.ofpId ||
          mission.fuelAuthorizedOfpId !== mission.lastOfpCheck.ofpId
        ) {
          send(res, 409, {
            error: 'Purchase or authorize OFP block fuel before loading the aircraft',
            code: 'fuel_purchase_required',
          });
          return;
        }
        if (isOfpLoadBusy(mission.id) || isOfpLoadActive()) {
          send(res, 409, {
            error: 'OFP inject already in progress — wait or cancel first',
            code: 'inject_in_progress',
            progress: getOfpLoadProgress(mission.id),
          });
          return;
        }
        try {
          // Any Watch pipe client contends with inject — stop regardless of mission.
          if (watchSession.getStatus().running) {
            await watchSession.stop();
          }
          const result = await applyMissionOfpLoad(mission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
            pipeName: body.pipeName,
            runPreflightAfter: body.runPreflightAfter,
          });
          let savedMission = mission;
          if (result.preflight) {
            const lastPreflightCheck = {
              verdict: result.preflight.check.verdict,
              summary: result.preflight.check.summary,
              checkedAtIso: result.preflight.check.checkedAtIso,
              phase: result.preflight.check.phase,
              loadVerification: result.preflight.check.loadVerification,
              findings: result.preflight.check.findings,
            };
            const wrote = await updateOpenMission(body.missionId, (_m, open) => {
              open.lastPreflightCheck = lastPreflightCheck;
              savedMission = open;
              return true;
            });
            if (!wrote) {
              const latest = await loadMissions();
              savedMission =
                latest.missions.find((m) => m.id === body.missionId) ?? mission;
            }
          }
          if (!result.ok) {
            const unavailable =
              /ENOENT|pipe|connect|SimBridge|ECONNREFUSED|No writable aircraft/i.test(
                result.error ?? '',
              );
            send(res, unavailable ? 503 : 400, {
              error: result.error ?? 'OFP load failed',
              mission: savedMission,
              ...result,
            });
            return;
          }
          send(res, 200, {
            mission: savedMission,
            ...result,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const unavailable =
            /ENOENT|pipe|connect|SimBridge|ECONNREFUSED/i.test(message);
          send(res, unavailable ? 503 : 400, { error: message });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/watch/status') {
        send(res, 200, watchSession.getStatus());
        return;
      }

      if (req.method === 'GET' && path === '/api/watch/debug-log') {
        const { readFile } = await import('node:fs/promises');
        const maxLines = Math.min(
          500,
          Math.max(20, Number(url.searchParams.get('lines') ?? 120) || 120),
        );
        let text = '';
        try {
          text = await readFile(WATCH_DEBUG_LOG_PATH, 'utf8');
        } catch {
          text = '';
        }
        const lines = text ? text.trimEnd().split(/\r?\n/) : [];
        send(res, 200, {
          path: WATCH_DEBUG_LOG_PATH,
          lineCount: lines.length,
          lines: lines.slice(-maxLines),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/watch/start') {
        const body = (await readBody(req)) as {
          missionId?: string;
          intervalSec?: number;
          autoDepart?: boolean;
          autoSettle?: boolean;
          requireEnginesOff?: boolean;
          requireDestProximity?: boolean;
          settleRadiusNm?: number;
          pipeName?: string;
          allowDepartOverride?: boolean;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        if (isOfpLoadActive()) {
          send(res, 409, {
            error: 'OFP inject in progress — Watch start blocked',
            code: 'ofp_inject_active',
          });
          return;
        }
        try {
          const status = await watchSession.start({
            missionId: body.missionId,
            intervalSec: body.intervalSec,
            autoDepart: body.autoDepart,
            autoSettle: body.autoSettle,
            requireEnginesOff: body.requireEnginesOff,
            requireDestProximity: body.requireDestProximity,
            settleRadiusNm: body.settleRadiusNm,
            pipeName: body.pipeName,
            allowDepartOverride: body.allowDepartOverride,
          });
          send(res, 200, status);
        } catch (error) {
          send(res, 503, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/watch/stop') {
        const status = await watchSession.stop();
        send(res, 200, status);
        return;
      }

      send(res, 404, { error: `No route ${req.method} ${path}` });
    } catch (error) {
      send(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    listen(): Promise<void> {
      return new Promise((resolveListen) => {
        server.listen(port, '127.0.0.1', () => {
          // Keep wall-clock economy moving while the API is up (~every minute).
          catchUpTimer = setInterval(() => {
            void (async () => {
              try {
                await withCareerWrite(() => undefined);
              } catch {
                /* ignore background catch-up errors */
              }
            })();
          }, 60_000);
          resolveListen();
        });
      });
    },
    async close(): Promise<void> {
      if (catchUpTimer) {
        clearInterval(catchUpTimer);
        catchUpTimer = undefined;
      }
      await watchSession.stop();
      await new Promise<void>((resolveClose, reject) => {
        server.close((err) => (err ? reject(err) : resolveClose()));
      });
    },
    port,
  };
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry && import.meta.url === entry) {
  const port = Number(process.env.CAREER_UI_API_PORT ?? 8787);
  const api = createCareerApiServer(port);
  await api.listen();
  console.log(`Career API http://127.0.0.1:${port}`);
}
