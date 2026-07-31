import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acceptMission,
  assignAircraftToMission,
  acquireCompanyAircraft,
  CAREER_COMMODITIES,
  cancelMission,
  commitStagedManifest,
  continuousEconomyHours,
  createSeedEconomyWorld,
  debitWalletForFuel,
  departMission,
  emptyMissionsStateV2,
  ensureEconomyCaughtUp,
  executeFerry,
  findOpenManifestForRoute,
  findPlayerAircraft,
  listActivePlayerMissions,
  listCareerHubIcaos,
  listParkedAt,
  getCommodity,
  listActiveEconomyEvents,
  listActiveNpcFreights,
  listMarketLots,
  listNpcFleetStatus,
  listRegionMarketPressure,
  listViableMarketLots,
  localUnitPriceUsd,
  migrateEconomyWorld,
  missionRemainingCapacityKg,
  MS_PER_TICK,
  NPC_FLEET_SIZE,
  normalizeMissionIntent,
  normalizeMissionsState,
  npcClaimForLot,
  parseFreighterClassId,
  purchasePlayerMissionOfpFuel,
  quotePlayerMissionOfpFuel,
  quoteFerry,
  reconcilePlayerInbound,
  replaceMissionManifest,
  routeDistanceNm,
  selectStarterHub,
  settleMission,
  stockTrend,
  tickEconomyN,
  withMissionLoadPolicy,
  missionLoadPolicy,
  careerAllowsDirectInject,
  type CareerEconomyWorld,
  type CareerMissionsState,
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
  probeSimBridgeStatus,
} from './ofp-load-helpers.ts';
import { preflightBlocksDepart, runMissionPreflight } from './preflight-helpers.ts';
import {
  CareerWatchSession,
  probeLiveResidualFuelKg,
} from './watch-helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const economyPath = join(repoRoot, 'profiles', 'career', 'local-economy.json');
const missionsPath = join(repoRoot, 'profiles', 'career', 'local-missions.json');

type MissionsFile = CareerMissionsState;

async function loadMissions(): Promise<MissionsFile> {
  const existing = await readJson<Record<string, unknown>>(missionsPath);
  if (existing && Array.isArray(existing.missions)) {
    const normalized = normalizeMissionsState(existing);
    normalized.missions = normalized.missions.map((m) => normalizeMissionIntent(m));
    if (
      existing.version !== 2 ||
      !Array.isArray((existing as { fleet?: unknown }).fleet)
    ) {
      await writeJson(missionsPath, normalized);
    }
    return normalized;
  }
  const fresh = emptyMissionsStateV2();
  await writeJson(missionsPath, fresh);
  return fresh;
}

function fleetPayload(missions: MissionsFile) {
  return {
    hubSelected: missions.hubSelected,
    fleet: missions.fleet,
    hubs: listCareerHubIcaos(),
    pilotName: missions.pilotName,
    homeHubIcao: missions.homeHubIcao,
  };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** Serialize mission-file read-modify-write so OFP/preflight/watch cannot clobber cancel. */
let missionsLock: Promise<void> = Promise.resolve();

function withMissionsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = missionsLock.then(fn, fn);
  missionsLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isClosedMissionStatus(status: string): boolean {
  return status === 'cancelled' || status === 'settled' || status === 'failed';
}

async function saveMissions(missions: MissionsFile): Promise<void> {
  await writeJson(missionsPath, missions);
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
  return withMissionsLock(async () => {
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

async function loadEconomy(): Promise<CareerEconomyWorld> {
  const existing = await readJson<Record<string, unknown>>(economyPath);
  if (existing && Array.isArray(existing.airports)) {
    const npcCountBefore = Array.isArray((existing as { npcs?: unknown[] }).npcs)
      ? (existing as { npcs: unknown[] }).npcs.length
      : 0;
    const lotsBefore = Array.isArray((existing as { lots?: unknown[] }).lots)
      ? (existing as { lots: unknown[] }).lots.length
      : 0;
    const world = migrateEconomyWorld(existing);
    const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(world);
    const version = (existing as { version?: number }).version;
    const npcCountAfter = caught.npcs?.length ?? 0;
    const lotsAfter = caught.lots?.length ?? 0;
    if (
      advancedTicks > 0 ||
      settledFlights > 0 ||
      version !== 3 ||
      npcCountAfter !== npcCountBefore ||
      lotsAfter !== lotsBefore
    ) {
      await writeJson(economyPath, caught);
    }
    return caught;
  }
  const fresh = createSeedEconomyWorld();
  await writeJson(economyPath, fresh);
  return fresh;
}

async function persistEconomy(world: CareerEconomyWorld): Promise<void> {
  // Do NOT stomp lastBatchAtMs — fractional hour + continuous ops depend on it.
  const toSave = migrateEconomyWorld(world);
  toSave.lastBatchAtMs = world.lastBatchAtMs;
  toSave.lastSyncedAtMs = world.lastBatchAtMs;
  await writeJson(economyPath, toSave);
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
            : 430;
    const flightHours = Math.max(2, Math.ceil(dist / cruise));
    const departedAt = m.departedAtTick ?? m.dispatchedAtTick ?? m.acceptedAtTick;
    let etaHours = flightHours;
    let etaMs = flightHours * MS_PER_TICK;
    let progressPct = 0;
    let phase = m.status === 'in_flight' ? 'enroute' : 'boarding';
    let arrivesAtMs: number | undefined;
    let departedAtMs: number | undefined;
    if (m.status === 'in_flight' && departedAt !== undefined) {
      // Approximate player ETA from tick stamps relative to batch anchor.
      departedAtMs = world.lastBatchAtMs - (world.tick - departedAt) * MS_PER_TICK;
      arrivesAtMs = departedAtMs + flightHours * MS_PER_TICK;
      etaMs = Math.max(0, arrivesAtMs - nowMs);
      etaHours = etaMs / MS_PER_TICK;
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
    loadEconomy,
    persistEconomy,
    loadMissions,
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
        send(res, 200, { ok: true, npcFleetTarget: NPC_FLEET_SIZE });
        return;
      }

      if (req.method === 'GET' && path === '/api/state') {
        const world = await loadEconomy();
        const missions = await loadMissions();
        const nowMs = Date.now();
        const npcBusy = (world.npcs ?? []).filter((n) => n.status === 'busy').length;
        send(res, 200, {
          ...clockPayload(world, nowMs),
          seed: world.seed,
          airportCount: world.airports.length,
          walletUsd: missions.walletUsd,
          activeMissions: missions.missions.filter((m) =>
            ['accepted', 'dispatched', 'in_flight'].includes(m.status),
          ).length,
          npcFleet: world.npcs?.length ?? 0,
          npcBusy,
          npcFlights: world.npcFlights?.filter((f) => f.status === 'in_flight').length ?? 0,
          ...fleetPayload(missions),
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/fleet') {
        const missions = await loadMissions();
        send(res, 200, {
          walletUsd: missions.walletUsd,
          ...fleetPayload(missions),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/fleet/select-hub') {
        const body = (await readBody(req)) as { icao?: string; pilotName?: string };
        if (!body.icao) {
          send(res, 400, { error: 'icao required' });
          return;
        }
        if (!body.pilotName || !String(body.pilotName).trim()) {
          send(res, 400, { error: 'pilotName required' });
          return;
        }
        const missions = await loadMissions();
        try {
          const next = selectStarterHub(missions, body.icao, {
            pilotName: body.pilotName,
          });
          Object.assign(missions, next);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            walletUsd: missions.walletUsd,
            ...fleetPayload(missions),
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/fleet/acquire') {
        const body = (await readBody(req)) as {
          aircraftClassId?: string;
          locationIcao?: string;
        };
        const aircraftClassId = parseFreighterClassId(body.aircraftClassId ?? undefined);
        if (!aircraftClassId) {
          send(res, 400, {
            error:
              'aircraftClassId required (narrow_freighter|wide_freighter|light_turboprop|light_ga)',
          });
          return;
        }
        const missions = await loadMissions();
        try {
          const next = acquireCompanyAircraft(missions, aircraftClassId, {
            locationIcao: body.locationIcao,
          });
          Object.assign(missions, next);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            walletUsd: missions.walletUsd,
            ...fleetPayload(missions),
          });
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        try {
          if (body.quoteOnly) {
            const quote = quoteFerry(world, missions, {
              aircraftId: body.aircraftId,
              destIcao: body.destIcao,
            });
            send(res, 200, { quote, walletUsd: missions.walletUsd });
            return;
          }
          const result = executeFerry(world, missions, {
            aircraftId: body.aircraftId,
            destIcao: body.destIcao,
          });
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            aircraft: result.aircraft,
            quote: result.quote,
            walletDebitUsd: result.walletDebitUsd,
            walletUsd: missions.walletUsd,
            ...fleetPayload(missions),
          });
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
        const cargoLimit = await resolveClassMaxCargoKg(aircraft);
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const inboundBefore = JSON.stringify(world.inboundPending ?? []);
        reconcilePlayerInbound(world, missions.missions);
        if (JSON.stringify(world.inboundPending ?? []) !== inboundBefore) {
          await persistEconomy(world);
        }
        const nowMs = Date.now();
        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        const origin = url.searchParams.get('origin') ?? undefined;
        const dest = url.searchParams.get('dest') ?? undefined;
        const filter = { originIcao: origin ?? undefined, destIcao: dest ?? undefined, nowMs };
        const cargoLimit = aircraft ? await resolveClassMaxCargoKg(aircraft) : undefined;
        const lots = aircraft
          ? listViableMarketLots(world, aircraft, {
              ...filter,
              maxCargoKg: cargoLimit?.maxCargoKg,
            })
          : listMarketLots(world, filter);
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
            weather: r.weather,
          })),
          lots: lots.slice(0, 200).map((row) => ({
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
            pressure: row.pressure
              ? {
                  originRegion: row.pressure.originRegion,
                  originRegionCapacity: row.pressure.originRegionCapacity,
                  laneSaturation: row.pressure.laneSaturation,
                  thinFleet: row.pressure.thinFleet,
                  laneBusy: row.pressure.laneBusy,
                  weather: row.pressure.weather,
                }
              : null,
            npcClaim: row.npcClaim
              ? {
                  npcName: row.npcClaim.npcName,
                  cargoKg: row.npcClaim.cargoKg,
                  etaHours: row.npcClaim.etaHours,
                }
              : null,
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
          idle: fleet.filter((n) => n.phase === 'idle').length,
          regionPressure: listRegionMarketPressure(world, nowMs).map((r) => ({
            region: r.region,
            capacity: r.capacity,
            thinFleet: r.thinFleet,
            ready: r.ready,
            total: r.total,
            resting: r.resting,
            weather: r.weather,
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

        send(res, 200, {
          ...clockPayload(world, nowMs),
          airport: {
            icao: airport.icao,
            name: airport.name,
            region: airport.region,
            level: airport.level,
            lat: airport.lat,
            lon: airport.lon,
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
        const world = await loadEconomy();
        const n = Math.max(1, Math.min(168, Math.floor(body.n ?? 24)));
        tickEconomyN(world, n);
        await persistEconomy(world);
        const nowMs = Date.now();
        send(res, 200, {
          ...clockPayload(world, nowMs),
          availableLots: world.lots.filter((l) => l.status === 'available').length,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/init') {
        const body = (await readBody(req)) as {
          seed?: string;
          resetMissions?: boolean;
        };
        const fresh = createSeedEconomyWorld({ seed: body.seed });
        await persistEconomy(fresh);
        if (body.resetMissions) {
          await writeJson(missionsPath, emptyMissionsStateV2());
        }
        send(res, 200, {
          tick: fresh.tick,
          seed: fresh.seed,
          airports: fresh.airports.length,
          npcFleet: fresh.npcs.length,
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const lot = world.lots.find((l) => l.id === body.lotId);
        if (!lot) {
          send(res, 404, { error: `Unknown lot ${body.lotId}` });
          return;
        }

        let intoMission =
          body.missionId
            ? missions.missions.find((m) => m.id === body.missionId)
            : findOpenManifestForRoute(missions.missions, {
                originIcao: lot.originIcao,
                destIcao: lot.destIcao,
                aircraftClassId: aircraft,
              });

        if (body.missionId && !intoMission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }

        try {
          const beforeLots = intoMission?.lots.length ?? 0;
          const mission = acceptMission(world, {
            lotId: body.lotId,
            cargoKg: body.kg,
            aircraftClassId: aircraft,
            maxCargoKg: cargoLimit.maxCargoKg,
            intoMission: intoMission ?? undefined,
          });
          const appended = Boolean(intoMission) && mission.lots.length > beforeLots;
          if (intoMission) {
            const idx = missions.missions.findIndex((m) => m.id === intoMission!.id);
            if (idx >= 0) missions.missions[idx] = mission;
            else missions.missions.push(mission);
          } else {
            missions.missions.push(mission);
          }
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission,
            walletUsd: missions.walletUsd,
            maxCargoKg: cargoLimit.maxCargoKg,
            maxCargoSource: cargoLimit.source,
            appended,
            remainingKg: missionRemainingCapacityKg(mission, cargoLimit.maxCargoKg),
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        if (!missions.hubSelected || missions.fleet.length === 0) {
          send(res, 400, { error: 'Select a starter hub before staging a flight' });
          return;
        }
        const firstLot = world.lots.find((lot) => lot.id === lines[0]!.lotId);
        if (!firstLot) {
          send(res, 404, { error: `Unknown lot ${lines[0]!.lotId}` });
          return;
        }
        let intoMission =
          body.missionId
            ? missions.missions.find((m) => m.id === body.missionId)
            : undefined;
        if (body.missionId && !intoMission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        let playerAircraft: PlayerAircraft | undefined = body.aircraftId
          ? findPlayerAircraft(missions, body.aircraftId)
          : undefined;
        if (body.aircraftId && !playerAircraft) {
          send(res, 404, { error: `Unknown aircraft ${body.aircraftId}` });
          return;
        }
        if (!playerAircraft && intoMission?.aircraftId) {
          playerAircraft = findPlayerAircraft(missions, intoMission.aircraftId);
        }
        if (!playerAircraft) {
          playerAircraft = listParkedAt(missions, firstLot.originIcao)[0];
        }
        if (!playerAircraft) {
          send(res, 400, {
            error: `No parked aircraft at ${firstLot.originIcao} — ferry one there first`,
          });
          return;
        }
        const aircraft = playerAircraft.aircraftClassId;
        const cargoLimit = await resolveClassMaxCargoKg(aircraft);
        const stagingDistanceNm =
          routeDistanceNm(world, firstLot.originIcao, firstLot.destIcao) ?? 0;
        const routeCargoLimit = estimateRouteCargoLimit(
          aircraft,
          stagingDistanceNm,
          cargoLimit.maxCargoKg,
          cargoLimit,
        );
        const operationalMaxCargoKg =
          routeCargoLimit.operationalMaxCargoKg;
        if (!routeCargoLimit.fuelFeasible) {
          send(res, 400, {
            error:
              `Estimated block fuel ${routeCargoLimit.estimatedBlockFuelKg} kg exceeds ` +
              `${aircraft} tank capacity ${routeCargoLimit.fuelCapacityKg} kg ` +
              `(deficit ${routeCargoLimit.fuelDeficitKg} kg)`,
          });
          return;
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
          send(res, 400, {
            error: `Finish or cancel active flight ${activeMissions[0]!.id} before staging another`,
          });
          return;
        }
        if (
          intoMission &&
          activeMissions.some((mission) => mission.id !== intoMission!.id)
        ) {
          send(res, 400, {
            error: 'Another active flight is already open — finish it before adding cargo',
          });
          return;
        }
        try {
          if (intoMission?.aircraftId && intoMission.aircraftId !== playerAircraft.id) {
            send(res, 400, {
              error: `Mission ${intoMission.id} is assigned to another aircraft`,
            });
            return;
          }
          let mission: MissionIntent;
          let appended = false;
          let lineCount = lines.length;
          if (replace) {
            if (!intoMission) {
              send(res, 400, { error: 'replace requires an existing mission' });
              return;
            }
            mission = {
              ...replaceMissionManifest(world, intoMission, {
                lines,
                aircraftClassId: aircraft,
                maxCargoKg: operationalMaxCargoKg,
              }),
              aircraftId: playerAircraft.id,
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
                send(res, 400, {
                  error: `Aircraft ${playerAircraft.id} is at ${playerAircraft.locationIcao}, not ${firstLot.originIcao}`,
                });
                return;
              }
            }
            const committed = commitStagedManifest(world, {
              lines,
              aircraftClassId: aircraft,
              maxCargoKg: operationalMaxCargoKg,
              intoMission: intoMission ?? undefined,
            });
            mission = {
              ...committed.mission,
              aircraftId: playerAircraft.id,
            };
            appended = committed.appended;
            lineCount = committed.lineCount;
            if (committed.appended && intoMission) {
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
          await persistEconomy(world);
          await writeJson(missionsPath, missions);

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
            mission = dispatched;
            await writeJson(missionsPath, missions);
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
            walletUsd: missions.walletUsd,
            maxCargoKg: operationalMaxCargoKg,
            structuralMaxCargoKg: cargoLimit.maxCargoKg,
            operationalMaxCargoKg,
            estimatedBlockFuelKg: routeCargoLimit.estimatedBlockFuelKg,
            maxCargoSource: cargoLimit.source,
            appended,
            replaced: replace,
            lineCount,
            remainingKg: missionRemainingCapacityKg(
              mission,
              operationalMaxCargoKg,
            ),
            dispatch: dispatch ?? null,
            fleet: missions.fleet,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
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
          const result = await withMissionsLock(async () => {
            const world = await loadEconomy();
            const missions = await loadMissions();
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
            await persistEconomy(world);
            await saveMissions(missions);
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const mission = missions.missions.find((m) => m.id === body.missionId);
        if (!mission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
          send(res, 400, {
            error: `Mission ${mission.id} cannot dispatch (status=${mission.status})`,
          });
          return;
        }

        const dispatchDistanceNm =
          routeDistanceNm(world, mission.originIcao, mission.destIcao) ?? 0;
        const dispatchCargoLimit = await resolveClassMaxCargoKg(
          mission.aircraftClassId,
        );
        const dispatchRouteLimit = estimateRouteCargoLimit(
          mission.aircraftClassId,
          dispatchDistanceNm,
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

        const built = await buildMissionDispatch(mission, {
          units: body.units ?? body.weightSystem,
        });
        mission.staticId = built.staticId;
        mission.status = 'dispatched';
        mission.dispatchedAtTick = world.tick;
        mission.lastOfpCheck = undefined;
        mission.lastPreflightCheck = undefined;
        mission.fuelAuthorizedOfpId = undefined;
        await writeJson(missionsPath, missions);

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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const idx = missions.missions.findIndex((m) => m.id === body.missionId);
        if (idx < 0) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        const mission = missions.missions[idx]!;
        if (mission.status !== 'dispatched') {
          send(res, 400, {
            error: `Fuel planning requires a dispatched mission (status=${mission.status})`,
          });
          return;
        }
        const ofp = mission.lastOfpCheck;
        if (
          !ofp ||
          (ofp.verdict !== 'pass' && ofp.verdict !== 'warn') ||
          !ofp.ofpId ||
          !(typeof ofp.plannedBlockFuelKg === 'number' && ofp.plannedBlockFuelKg > 0)
        ) {
          send(res, 400, {
            error: 'Confirm a valid OFP before planning fuel',
          });
          return;
        }
        if (ofp.staticId && ofp.staticId !== mission.staticId) {
          send(res, 400, {
            error: 'OFP belongs to a previous dispatch revision',
          });
          return;
        }

        try {
          if (path === '/api/fuel/quote') {
            const quote = quotePlayerMissionOfpFuel(world, missions, mission, {
              ofpId: ofp.ofpId,
              requiredBlockFuelKg: ofp.plannedBlockFuelKg,
            });
            send(res, 200, {
              quote,
              walletUsd: missions.walletUsd,
              walletAfterUsd: Math.round(
                (missions.walletUsd - quote.uplift.costUsd) * 100,
              ) / 100,
            });
            return;
          }

          const purchased = purchasePlayerMissionOfpFuel(
            world,
            missions,
            mission,
            {
              ofpId: ofp.ofpId,
              requiredBlockFuelKg: ofp.plannedBlockFuelKg,
            },
          );
          missions.missions[idx] = purchased.mission;
          missions.walletUsd = debitWalletForFuel(
            missions.walletUsd,
            purchased.fuelDebitUsd,
          );
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission: purchased.mission,
            quote: purchased.quote,
            fuelDebitUsd: purchased.fuelDebitUsd,
            walletUsd: missions.walletUsd,
            fleet: missions.fleet,
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const idx = missions.missions.findIndex((m) => m.id === body.missionId);
        if (idx < 0) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        const existing = missions.missions[idx]!;
        if (preflightBlocksDepart(existing) && body.override !== true) {
          send(res, 400, {
            error:
              'Preflight failed — fix fuel/payload in the aircraft, re-run Preflight, or depart with override',
            code: 'preflight_failed',
            preflight: existing.lastPreflightCheck ?? null,
          });
          return;
        }
        try {
          const departedResult = departMission(world, existing, { fleet: missions });
          const departed = departedResult.mission;
          missions.missions[idx] = departed;
          missions.walletUsd = debitWalletForFuel(
            missions.walletUsd,
            departedResult.fuelDebitUsd,
          );
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission: departed,
            walletUsd: missions.walletUsd,
            fuelDebitUsd: departedResult.fuelDebitUsd,
            fleet: missions.fleet,
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const idx = missions.missions.findIndex((m) => m.id === body.missionId);
        if (idx < 0) {
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
          // Stop live watch if it was tracking this mission.
          const watch = watchSession.getStatus();
          if (watch.running && watch.missionId === body.missionId) {
            await watchSession.stop();
          }
          const result = settleMission(world, missions.missions[idx]!, {
            fleet: missions,
            residualFuelKg,
          });
          missions.missions[idx] = result.mission;
          missions.walletUsd = debitWalletForFuel(
            Math.round((missions.walletUsd + result.walletCreditUsd) * 100) / 100,
            result.fuelDebitUsd,
          );
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission: result.mission,
            walletUsd: missions.walletUsd,
            fuelDebitUsd: result.fuelDebitUsd,
            fleet: missions.fleet,
            settlement: {
              payoutUsd: result.settlement.payoutUsd,
              penaltyUsd: result.settlement.penaltyUsd,
              lateTicks: result.settlement.lateTicks,
              onTime: result.settlement.onTime,
              deliveredKg: result.settlement.deliveredKg,
              residualFuelKg: result.mission.settledFuelKg ?? null,
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
        try {
          // Avoid Named Pipe contention with the live watch session.
          const watch = watchSession.getStatus();
          if (watch.running && watch.missionId === body.missionId) {
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
                const world = await loadEconomy();
                await persistEconomy(world);
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
