import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acceptMission,
  CAREER_COMMODITIES,
  cancelMission,
  commitStagedManifest,
  continuousEconomyHours,
  createSeedEconomyWorld,
  departMission,
  ensureEconomyCaughtUp,
  findOpenManifestForRoute,
  getCommodity,
  listActiveEconomyEvents,
  listActiveNpcFreights,
  listMarketLots,
  listNpcFleetStatus,
  listViableMarketLots,
  localUnitPriceUsd,
  migrateEconomyWorld,
  missionRemainingCapacityKg,
  MS_PER_TICK,
  normalizeMissionIntent,
  npcClaimForLot,
  parseFreighterClassId,
  routeDistanceNm,
  settleMission,
  stockTrend,
  tickEconomyN,
  type CareerEconomyWorld,
  type FreighterClassId,
  type MissionIntent,
} from '@msfs-compat/shared';
import {
  buildMissionDispatch,
  confirmMissionOfp,
  openDispatchUrl,
  resolveClassMaxCargoKg,
} from './dispatch-helpers.ts';
import { preflightBlocksDepart, runMissionPreflight } from './preflight-helpers.ts';
import { CareerWatchSession } from './watch-helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const economyPath = join(repoRoot, 'profiles', 'career', 'local-economy.json');
const missionsPath = join(repoRoot, 'profiles', 'career', 'local-missions.json');

type MissionsFile = {
  version: 1;
  walletUsd: number;
  missions: MissionIntent[];
};

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

async function loadEconomy(): Promise<CareerEconomyWorld> {
  const existing = await readJson<Record<string, unknown>>(economyPath);
  if (existing && Array.isArray(existing.airports)) {
    const world = migrateEconomyWorld(existing);
    const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(world);
    const version = (existing as { version?: number }).version;
    if (advancedTicks > 0 || settledFlights > 0 || version !== 3) {
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

async function loadMissions(): Promise<MissionsFile> {
  const existing = await readJson<MissionsFile>(missionsPath);
  if (existing?.version === 1 && Array.isArray(existing.missions)) {
    return {
      version: 1,
      walletUsd: typeof existing.walletUsd === 'number' ? existing.walletUsd : 0,
      missions: existing.missions.map((m) => normalizeMissionIntent(m)),
    };
  }
  const fresh: MissionsFile = { version: 1, walletUsd: 0, missions: [] };
  await writeJson(missionsPath, fresh);
  return fresh;
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
    saveMissions: async (missions) => {
      await writeJson(missionsPath, missions);
    },
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
        send(res, 200, { ok: true });
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
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/market') {
        const world = await loadEconomy();
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
          lots: lots.slice(0, 80).map((row) => ({
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
          idle: fleet.filter((n) => n.phase === 'idle').length,
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
        send(res, 200, missions);
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
          await writeJson(missionsPath, {
            version: 1,
            walletUsd: 0,
            missions: [],
          } satisfies MissionsFile);
        }
        send(res, 200, { tick: fresh.tick, seed: fresh.seed, airports: fresh.airports.length });
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
          missionId?: string;
          openDispatch?: boolean;
          lines?: Array<{ lotId?: string; cargoKg?: number }>;
        };
        const aircraft =
          (parseFreighterClassId(body.aircraft) as FreighterClassId | undefined) ??
          'narrow_freighter';
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
        const cargoLimit = await resolveClassMaxCargoKg(aircraft);
        const world = await loadEconomy();
        const missions = await loadMissions();
        let intoMission =
          body.missionId
            ? missions.missions.find((m) => m.id === body.missionId)
            : undefined;
        if (body.missionId && !intoMission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        // Soft auto-attach when exactly one open same-OD flight exists.
        if (!intoMission && lines[0]) {
          const firstLot = world.lots.find((lot) => lot.id === lines[0]!.lotId);
          if (firstLot) {
            intoMission = findOpenManifestForRoute(missions.missions, {
              originIcao: firstLot.originIcao,
              destIcao: firstLot.destIcao,
              aircraftClassId: aircraft,
            });
          }
        }

        try {
          const committed = commitStagedManifest(world, {
            lines,
            aircraftClassId: aircraft,
            maxCargoKg: cargoLimit.maxCargoKg,
            intoMission: intoMission ?? undefined,
          });
          const mission = committed.mission;
          if (committed.appended && intoMission) {
            const idx = missions.missions.findIndex((m) => m.id === intoMission!.id);
            if (idx >= 0) missions.missions[idx] = mission;
            else missions.missions.push(mission);
          } else {
            const idx = missions.missions.findIndex((m) => m.id === mission.id);
            if (idx >= 0) missions.missions[idx] = mission;
            else missions.missions.push(mission);
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
            const built = await buildMissionDispatch(mission);
            const idx = missions.missions.findIndex((m) => m.id === mission.id);
            const dispatched: MissionIntent = {
              ...mission,
              staticId: built.staticId,
              status: 'dispatched',
              dispatchedAtTick: world.tick,
            };
            if (idx >= 0) missions.missions[idx] = dispatched;
            await writeJson(missionsPath, missions);
            openDispatchUrl(built.url);
            dispatch = {
              url: built.url,
              staticId: built.staticId,
              type: built.type,
              airframeLabel: built.airframeLabel,
              opened: true,
            };
            send(res, 200, {
              mission: dispatched,
              walletUsd: missions.walletUsd,
              maxCargoKg: cargoLimit.maxCargoKg,
              maxCargoSource: cargoLimit.source,
              appended: committed.appended,
              lineCount: committed.lineCount,
              remainingKg: missionRemainingCapacityKg(
                dispatched,
                cargoLimit.maxCargoKg,
              ),
              dispatch,
            });
            return;
          }

          send(res, 200, {
            mission,
            walletUsd: missions.walletUsd,
            maxCargoKg: cargoLimit.maxCargoKg,
            maxCargoSource: cargoLimit.source,
            appended: committed.appended,
            lineCount: committed.lineCount,
            remainingKg: missionRemainingCapacityKg(mission, cargoLimit.maxCargoKg),
            dispatch: null,
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
        const world = await loadEconomy();
        const missions = await loadMissions();
        const idx = missions.missions.findIndex((m) => m.id === body.missionId);
        if (idx < 0) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        const existing = missions.missions[idx]!;
        try {
          const lines = existing.lots?.length
            ? existing.lots
            : existing.shipmentLotId
              ? [{ shipmentLotId: existing.shipmentLotId, cargoKg: existing.cargoKg }]
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
          const cancelled = cancelMission(world, existing);
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
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission: cancelled,
            walletUsd: missions.walletUsd,
            releasedKg,
            returnedToMarket,
            warning:
              foundBefore > 0
                ? returnedToMarket
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

        const built = await buildMissionDispatch(mission);
        mission.staticId = built.staticId;
        mission.status = 'dispatched';
        mission.dispatchedAtTick = world.tick;
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
        const missions = await loadMissions();
        const mission = missions.missions.find((m) => m.id === body.missionId);
        if (!mission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (mission.status !== 'dispatched' && mission.status !== 'in_flight') {
          send(res, 400, {
            error: `Mission ${mission.id} needs Dispatch first (status=${mission.status})`,
          });
          return;
        }

        const result = await confirmMissionOfp(mission, {
          username: body.simbriefUser,
          userid: body.simbriefUserid,
        });
        mission.lastOfpCheck = {
          verdict: result.check.verdict,
          summary: result.summary,
          checkedAtIso: new Date().toISOString(),
          findings: result.check.findings.map((f) => ({
            code: f.code,
            severity: f.severity,
            message: f.message,
          })),
        };
        await writeJson(missionsPath, missions);

        send(res, 200, {
          mission,
          check: result.check,
          summary: result.summary,
          ofp: result.ofp,
        });
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
        const missions = await loadMissions();
        const idx = missions.missions.findIndex((m) => m.id === body.missionId);
        if (idx < 0) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        const mission = missions.missions[idx]!;
        if (!['accepted', 'dispatched', 'in_flight'].includes(mission.status)) {
          send(res, 400, {
            error: `Mission ${mission.id} cannot preflight (status=${mission.status})`,
          });
          return;
        }
        try {
          const result = await runMissionPreflight(mission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
            pipeName: body.pipeName,
          });
          mission.lastPreflightCheck = {
            verdict: result.check.verdict,
            summary: result.check.summary,
            checkedAtIso: result.check.checkedAtIso,
            phase: result.check.phase,
            findings: result.check.findings,
          };
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission,
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
          const departed = departMission(world, existing);
          missions.missions[idx] = departed;
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission: departed,
            walletUsd: missions.walletUsd,
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
          // Stop live watch if it was tracking this mission.
          const watch = watchSession.getStatus();
          if (watch.running && watch.missionId === body.missionId) {
            await watchSession.stop();
          }
          const result = settleMission(world, missions.missions[idx]!);
          missions.missions[idx] = result.mission;
          missions.walletUsd =
            Math.round((missions.walletUsd + result.walletCreditUsd) * 100) / 100;
          await persistEconomy(world);
          await writeJson(missionsPath, missions);
          send(res, 200, {
            mission: result.mission,
            walletUsd: missions.walletUsd,
            settlement: {
              payoutUsd: result.settlement.payoutUsd,
              penaltyUsd: result.settlement.penaltyUsd,
              lateTicks: result.settlement.lateTicks,
              onTime: result.settlement.onTime,
              deliveredKg: result.settlement.deliveredKg,
            },
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
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
