import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acceptMission,
  acceptEmptyFlight,
  assignAircraftToMission,
  buyOutAircraftLease,
  returnAircraftLeaseEarly,
  CAREER_COMMODITIES,
  cancelMission,
  cargoOpsIsUnlocked,
  classOpsIsUnlocked,
  classOpsHidesBoardLot,
  CLASS_OPS_STARTER_IDS,
  BOARD_NEAR_MAX_NM,
  getAircraftClass,
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
  quoteFerry,
  planFerryRoute,
  ferryProgressPct,
  remainingNmToFinal,
  nextFerryLeg,
  quotePilotTravel,
  executePilotTravel,
  findCareerPlayerAirframe,
  findOpenManifestForRoute,
  findPlayerAircraft,
  findNpcAirframe,
  listActivePlayerMissions,
  listAircraftClassCatalog,
  listAircraftMarket,
  listCareerHubIcaos,
  listParkedAt,
  listStarterCareerPlayerAirframes,
  resolveAirframePerfForUi,
  getCommodity,
  getAirportRunways,
  evaluateRunwayTouchdown,
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
  isBushHub,
  isBushTripOnlyHub,
  acceptBushTrip,
  abandonBushTrip,
  bushTripToBoardRow,
  bushTripMapNodes,
  getBushTrip,
  isBushTripActive,
  listBushTrips,
  bushTripActivitiesPlnFile,
  gfpDownloadFilename,
  gfpCoordsByIcao,
  msfsPlnXmlToGfp,
  estimateBoardLotEconomics,
  parseMarketBoardAccessFilter,
  parseMarketBoardLaneFilter,
  parseMarketBoardSorts,
  parsePositiveNumberParam,
  boardFreightKgForEstimates,
  boardDisplayPayUsd,
  queryMarketBoardPage,
  quoteFuelUplift,
  resolveAirframeMaxRangeNm,
  regionFuelThin,
  missionRemainingCapacityKg,
  hoursToMs,
  MS_PER_TICK,
  msToHours,
  TICKS_PER_DAY,
  listNpcHomeRegions,
  targetNpcFleetSize,
  npcClaimForLot,
  acceptContractPilotOffer,
  listContractPilotPickAirframes,
  parseFreighterClassId,
  purchaseAircraftListing,
  purchasePlayerMissionOfpFuel,
  quoteAircraftDeliveryForListing,
  quotePlayerMissionOfpFuel,
  reconcilePlayerInbound,
  replaceMissionManifest,
  resolveAircraftDeliveryIcao,
  routeDistanceNm,
  estimateMissionBlockHours,
  selectStarterHub,
  listAircraftForLease,
  unlistAircraftForLease,
  sellPlayerAircraft,
  settleAircraftMarketOps,
  settleHangarParkingFees,
  settleFboOps,
  settleCompanyCredit,
  companyCreditSnapshot,
  buyFboTier1,
  upgradeFboToTier2,
  holdLotAtFbo,
  FERRY_SOFT_NM_BUDGET,
  cancelFboHold,
  releaseFboHoldToMission,
  rerouteFboHold,
  splitFboHold,
  returnMissionToFboHold,
  quoteFboRerouteUsd,
  quoteFboReroutePayAfterUsd,
  playerFboSnapshot,
  playerFboSnapshotAtIcao,
  fboServiceCostMult,
  dispatchCrewMission,
  assignCrewMemberToMission,
  settleCrewOpsDue,
  settleCrewDailyOps,
  companyCrewSnapshot,
  hireCrewCandidate,
  fireCrewMember,
  releaseCompanyCrewFromMission,
  drawCompanyCredit,
  repayCompanyCredit,
  assertCompanyCreditAllowsOps,
  settleMission,
  signAircraftLease,
  aircraftLeaseUnlockProgress,
  resolveHangarParkingUsdPerDay,
  applyWalletDelta,
  summarizeCareerLedger,
  LEDGER_KIND_LABEL,
  openCareerStore,
  applyMsfsBushHubOverrideToTerminal,
  listWorldCountryIds,
  localUnitPriceUsd,
  computeEconomyPulse,
  syncHomeCountryFromHub,
  stockTrend,
  tickEconomyN,
  withMissionLoadPolicy,
  normalizeMissionIntent,
  missionLoadPolicy,
  careerAllowsDirectInject,
  economyDayIndex,
  fuelBurnMultFromAircraft,
  padOfpBlockFuelKgForMx,
  isOfpCargoUnderOnlyFailure,
  trimMissionCargoToKg,
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
  getLastProbeAircraftTitle,
  getOfpLoadProgress,
  isOfpLoadBusy,
  probeSimBridgeStatus,
  requestOfpLoadCancel,
} from './ofp-load-helpers.ts';
import { isOfpLoadActive } from './ofp-load-state.ts';
import { preflightBlocksDepart, runMissionPreflight } from './preflight-helpers.ts';
import {
  CareerWatchSession,
  probeFirstContactPosition,
  probeLiveLandingFpm,
  probeLiveResidualFuelKg,
} from './watch-helpers.ts';
import { WATCH_DEBUG_LOG_PATH } from './debug-log.ts';
import { BushTripWatchSession } from './bush-watch-helpers.ts';
import {
  homologateBushHub,
  homologateBushHubBatch,
  loadProfileMsfsBushHubOverrides,
  resolveHomologateCoords,
} from './bush-hub-homologate.ts';
import {
  clearActiveCareerProfile,
  createCareerProfile,
  deleteCareerProfile,
  ensureCareerProfilesLayout,
  openCareerProfileStore,
  readProfilesFile,
  renameCareerProfile,
  setActiveCareerProfile,
} from './career-profiles.ts';
import { createPromiseLock } from './career-write-lock.ts';
import {
  getRepoRoot,
  getUiDist,
  resolveCareerRoot,
} from './skyline-paths.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = getRepoRoot();
const uiDist = getUiDist();

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
/** Shared career assets (PLN, MSFS hub overrides). Per-player saves live under saves/<id>/. */
const careerRoot = await resolveCareerRoot();
let store: CareerStore | null = null;
let activeProfileId: string | null = null;

await ensureCareerProfilesLayout(careerRoot);
await loadProfileMsfsBushHubOverrides(careerRoot);

async function stampMsfsOverridesOnStore(target: CareerStore): Promise<void> {
  const { world, dirty } = await target.loadEconomy();
  let stamped = 0;
  for (const airport of world.airports) {
    if (applyMsfsBushHubOverrideToTerminal(airport)) stamped += 1;
  }
  if (dirty || stamped > 0) {
    await target.saveEconomy(world);
    if (stamped > 0) {
      console.log(
        `[career] applied MSFS hub overrides to ${stamped} airport(s) in economy`,
      );
    }
  }
}

function requireStore(): CareerStore {
  if (!store) {
    throw new Error('Select a career profile first');
  }
  return store;
}

/** Row cap for the market board — filters must run server-side to survive it. */
const MARKET_LOT_LIMIT = 200;

type MissionsFile = CareerMissionsState;

async function loadMissions(): Promise<MissionsFile> {
  return requireStore().loadMissions();
}

/** Enrich mission rows for Logbook (distance + concrete airframe name). */
function withMissionClientView(
  world: CareerEconomyWorld,
  missions: MissionsFile,
  mission: MissionIntent,
) {
  const normalized = normalizeMissionIntent(mission);
  const typeId =
    normalized.airframeTypeId?.trim() ||
    (normalized.aircraftId
      ? findPlayerAircraft(missions, normalized.aircraftId)?.airframeTypeId?.trim()
      : undefined);
  const base = withMissionLoadPolicy({
    ...normalized,
    ...(typeId ? { airframeTypeId: typeId } : {}),
  });
  const airframeLabel =
    findCareerPlayerAirframe(typeId)?.label ??
    findNpcAirframe(typeId)?.label;
  const distanceRaw =
    routeDistanceNm(world, normalized.originIcao, normalized.destIcao) ??
    normalized.lastOfpCheck?.briefing?.distanceNm;
  const distanceNm =
    typeof distanceRaw === 'number' &&
    Number.isFinite(distanceRaw) &&
    distanceRaw > 0
      ? Math.round(distanceRaw)
      : undefined;
  return {
    ...base,
    ...(airframeLabel ? { airframeLabel } : {}),
    ...(distanceNm !== undefined ? { distanceNm } : {}),
  };
}

function withParkingRates(
  fleet: PlayerAircraft[],
  world?: Pick<CareerEconomyWorld, 'airports'>,
  missions?: Pick<CareerMissionsState, 'playerFbos'>,
): Array<PlayerAircraft & { parkingUsdPerDay: number | null }> {
  const airports = world ?? { airports: [] };
  return fleet.map((aircraft) => ({
    ...aircraft,
    parkingUsdPerDay: resolveHangarParkingUsdPerDay(
      aircraft,
      airports,
      missions,
    ),
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
      bush: Boolean(airport?.bush) || isBushHub(icao),
      bushTripOnly: Boolean(airport?.bushTripOnly) || isBushTripOnlyHub(icao),
    };
  });
  return {
    hubSelected: missions.hubSelected,
    fleet: withParkingRates(missions.fleet, world, missions),
    hubs,
    pilotName: missions.pilotName,
    homeHubIcao: missions.homeHubIcao,
    pilotIcao: missions.pilotIcao ?? missions.homeHubIcao ?? '',
    starterAircraft,
    companyCredit: companyCreditSnapshot(missions),
    playerFbos: playerFboSnapshot(missions, world),
    leaseUnlock: aircraftLeaseUnlockProgress(missions),
    classOps: missions.classOps ?? null,
    activeBushTrip: missions.activeBushTrip ?? null,
  };
}

function isClosedMissionStatus(status: string): boolean {
  return status === 'cancelled' || status === 'settled' || status === 'failed';
}

type MxFuelBurnFinding = {
  code: 'MX_FUEL_BURN';
  severity: 'warn';
  message: string;
};

function mxFuelBurnFindingForAircraft(
  aircraft: PlayerAircraft | undefined | null,
): MxFuelBurnFinding | null {
  if (!aircraft) return null;
  const mxBurn = fuelBurnMultFromAircraft(aircraft);
  if (mxBurn.mult <= 1.001) return null;
  const excessPct = Math.round(mxBurn.excessFrac * 100);
  return {
    code: 'MX_FUEL_BURN',
    severity: 'warn',
    message:
      `This airframe burns about +${excessPct}% more fuel than healthy ` +
      `(condition ${Math.round(mxBurn.conditionPct)}%). ` +
      `Due still matches the SimBrief OFP — repair before long legs or you may ` +
      `run short; Watch can drain the excess burn in flight.`,
  };
}

function mxFuelBurnProgressNote(
  aircraft: PlayerAircraft | undefined | null,
): string | null {
  const finding = mxFuelBurnFindingForAircraft(aircraft);
  if (!finding) return null;
  const match = finding.message.match(/\+(\d+)%/);
  const excessPct = match?.[1];
  return excessPct
    ? `MX burn +${excessPct}% — OFP fuel unchanged; repair recommended`
    : null;
}

function resolveMissionMxBlockFuel(
  mission: MissionIntent,
  fleet: PlayerAircraft[],
  ofpBlockFuelKg: number,
) {
  const aircraft = mission.aircraftId
    ? fleet.find((a) => a.id === mission.aircraftId)
    : undefined;
  return padOfpBlockFuelKgForMx(ofpBlockFuelKg, aircraft);
}

async function saveMissions(missions: MissionsFile): Promise<void> {
  await requireStore().saveMissions(missions);
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
  const activeStore = requireStore();
  const { world: caught, advancedTicks, dirty } = await activeStore.loadEconomy();
  const missions = await loadMissions();
  let needsSave = dirty;
  // Home partition follows the player's chosen hub (KMIA → US), including legacy saves.
  if (syncHomeCountryFromHub(caught, missions.homeHubIcao)) {
    needsSave = true;
  }
  if (needsSave) {
    await activeStore.saveEconomy(caught);
  }
  if (advancedTicks > 0) {
    settleAircraftMarketOps(missions, caught.tick, caught);
    settleHangarParkingFees(missions, caught, {
      fromTick: caught.tick - advancedTicks,
      toTick: caught.tick,
    });
    settleFboOps(missions, caught, {
      fromTick: caught.tick - advancedTicks,
      toTick: caught.tick,
    });
    settleCrewDailyOps(missions, caught, {
      fromTick: caught.tick - advancedTicks,
      toTick: caught.tick,
    });
    settleCrewOpsDue(missions, caught, Date.now());
    listAircraftMarket(missions, caught);
    await saveMissions(missions);
  }
  return caught;
}

async function persistEconomyUnlocked(world: CareerEconomyWorld): Promise<void> {
  // Do NOT stomp lastBatchAtMs — fractional hour + continuous ops depend on it.
  await requireStore().saveEconomy(world);
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
    const crew = settleCrewOpsDue(missions, world, Date.now());
    if (crew.settled.length > 0) {
      await persistEconomyUnlocked(world);
      await saveMissions(missions);
    }
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
    settleCrewOpsDue(missions, world, Date.now());
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

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

async function tryServeStatic(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  urlPath: string,
): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let uiRootReady = false;
  try {
    await access(join(uiDist, 'index.html'));
    uiRootReady = true;
  } catch {
    return false;
  }
  if (!uiRootReady) return false;

  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  if (clean.includes('..')) {
    send(res, 400, { error: 'Invalid path' });
    return true;
  }
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
  let filePath = join(uiDist, rel);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // SPA fallback for client routes (no file extension)
    if (extname(rel)) return false;
    filePath = join(uiDist, 'index.html');
  }
  try {
    await access(filePath);
  } catch {
    return false;
  }
  const type = STATIC_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': rel === 'index.html' ? 'no-cache' : 'public, max-age=86400',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
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
    bush: isBushHub(lot.originIcao) || isBushHub(lot.destIcao),
    distanceNm: routeDistanceNm(world, lot.originIcao, lot.destIcao),
    npcClaim: npcClaim
      ? {
          npcName: npcClaim.npcName,
          cargoKg: npcClaim.cargoKg,
          etaHours: npcClaim.etaHours,
          etaMs: npcClaim.etaMs,
          arrivesAtMs: npcClaim.arrivesAtMs,
          ...(npcClaim.crewNeeded
            ? {
                crewNeeded: true as const,
                ...(npcClaim.crewReposition
                  ? { crewReposition: true as const }
                  : {}),
                pilotFeeUsd: npcClaim.pilotFeeUsd,
                ...(typeof npcClaim.pilotFeeMinUsd === 'number'
                  ? { pilotFeeMinUsd: npcClaim.pilotFeeMinUsd }
                  : {}),
                awaitingPilotUntilMs: npcClaim.awaitingPilotUntilMs,
              }
            : {}),
          ...(npcClaim.airframeTypeId
            ? { airframeTypeId: npcClaim.airframeTypeId }
            : {}),
          ...(npcClaim.aircraftLabel
            ? { aircraftLabel: npcClaim.aircraftLabel }
            : {}),
          ...(npcClaim.aircraftClassId
            ? { aircraftClassId: npcClaim.aircraftClassId }
            : {}),
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
    airframeTypeId: row.airframeTypeId ?? null,
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
          international: Boolean(row.mission.international),
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
  crewOperated?: boolean;
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
    const blockHours = estimateMissionBlockHours(
      world,
      m.originIcao,
      m.destIcao,
      m.aircraftClassId,
    );
    const departedAt = m.departedAtTick ?? m.dispatchedAtTick ?? m.acceptedAtTick;
    let etaHours = blockHours;
    let etaMs = hoursToMs(blockHours);
    let progressPct = 0;
    let phase = m.status === 'in_flight' ? 'enroute' : 'boarding';
    let arrivesAtMs: number | undefined;
    let departedAtMs: number | undefined;
    if (m.status === 'in_flight') {
      const hasWallClock =
        typeof m.airborneAtMs === 'number' &&
        Number.isFinite(m.airborneAtMs) &&
        typeof m.expectedRouteMs === 'number' &&
        Number.isFinite(m.expectedRouteMs) &&
        m.expectedRouteMs > 0;
      if (hasWallClock) {
        departedAtMs = m.airborneAtMs;
        arrivesAtMs = m.airborneAtMs! + m.expectedRouteMs!;
      } else if (departedAt !== undefined) {
        // Approximate from economy ticks when wall-clock stamps are missing.
        departedAtMs =
          world.lastBatchAtMs - (world.tick - departedAt) * MS_PER_TICK;
        arrivesAtMs = departedAtMs + hoursToMs(blockHours);
      }
      if (departedAtMs !== undefined && arrivesAtMs !== undefined) {
        etaMs = Math.max(0, arrivesAtMs - nowMs);
        etaHours = msToHours(etaMs);
        const duration = Math.max(1, arrivesAtMs - departedAtMs);
        const flown = Math.min(duration, Math.max(0, nowMs - departedAtMs));
        progressPct = Math.min(100, Math.round((flown / duration) * 100));
        phase = etaMs <= MS_PER_TICK ? 'arriving' : 'enroute';
      }
    }
    const movement: AirportMovement = {
      id: m.id,
      kind: 'player',
      operatorName: m.crewOperated
        ? m.crewDeadhead
          ? 'Crew return'
          : 'Crew'
        : 'You',
      originIcao: m.originIcao,
      destIcao: m.destIcao,
      commodityName: m.crewDeadhead
        ? 'Empty return'
        : getCommodity(m.commodityId).name,
      cargoKg: m.cargoKg,
      payUsd: m.payUsd,
      aircraftClassId: m.aircraftClassId,
      phase,
      etaHours,
      etaMs,
      progressPct,
      arrivesAtTick:
        m.status === 'in_flight' && departedAt !== undefined
          ? departedAt + Math.max(1, Math.ceil(blockHours))
          : undefined,
      arrivesAtMs,
      departedAtMs,
      urgency: m.urgency,
      distanceNm: dist,
      crewOperated: m.crewOperated === true,
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
  const bushWatchSession = new BushTripWatchSession({
    withCareerRead,
    withCareerWrite,
    stopMarketWatch: async () => {
      if (watchSession.getStatus().running) {
        await watchSession.stop({ reset: true });
      } else if (watchSession.getStatus().missionId) {
        watchSession.resetSession();
      }
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
        if (!store) {
          send(res, 200, {
            ok: true,
            needsProfile: true,
            activeProfileId: null,
            // Non-zero so career:ui health check doesn't treat idle boot as stale.
            npcFleetTarget: 1,
            sourceStamp: bootSourceStamp,
            store: null,
            homeCountryId: null,
            countries: [],
            internationalLaneCount: 0,
          });
          return;
        }
        const world = await loadEconomy();
        const regionCount = listNpcHomeRegions(world.airports ?? []).length;
        send(res, 200, {
          ok: true,
          needsProfile: false,
          activeProfileId,
          npcFleetTarget: targetNpcFleetSize(regionCount),
          sourceStamp: bootSourceStamp,
          store: store.kind,
          homeCountryId: world.homeCountryId ?? null,
          countries: listWorldCountryIds(world),
          internationalLaneCount: world.internationalLanes?.length ?? 0,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/profiles') {
        const file = await readProfilesFile(careerRoot);
        send(res, 200, {
          activeId: activeProfileId ?? file.activeId,
          profiles: file.profiles,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/profiles') {
        const body = (await readBody(req)) as { name?: string };
        try {
          const meta = await createCareerProfile(
            careerRoot,
            body.name ?? '',
          );
          const file = await readProfilesFile(careerRoot);
          send(res, 200, { profile: meta, profiles: file.profiles });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/profiles/select') {
        const body = (await readBody(req)) as { id?: string };
        const id = body.id?.trim() ?? '';
        if (!id) {
          send(res, 400, { error: 'id required' });
          return;
        }
        try {
          if (watchSession.getStatus().running) await watchSession.stop();
          if (bushWatchSession.getStatus().running) {
            await bushWatchSession.stop();
          }
          await withCareerLock(async () => {
            if (store) {
              try {
                store.close();
              } catch {
                /* ignore */
              }
              store = null;
              activeProfileId = null;
            }
            const next = await openCareerProfileStore(careerRoot, id);
            await stampMsfsOverridesOnStore(next);
            store = next;
            activeProfileId = id;
            await setActiveCareerProfile(careerRoot, id);
          });
          const file = await readProfilesFile(careerRoot);
          const profile = file.profiles.find((p) => p.id === id) ?? null;
          send(res, 200, {
            activeId: id,
            profile,
            profiles: file.profiles,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/profiles/clear') {
        try {
          if (watchSession.getStatus().running) await watchSession.stop();
          if (bushWatchSession.getStatus().running) {
            await bushWatchSession.stop();
          }
          await withCareerLock(async () => {
            if (store) {
              try {
                store.close();
              } catch {
                /* ignore */
              }
              store = null;
              activeProfileId = null;
            }
            await clearActiveCareerProfile(careerRoot);
          });
          const file = await readProfilesFile(careerRoot);
          send(res, 200, {
            activeId: null,
            profiles: file.profiles,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const profileRenameMatch = path.match(
        /^\/api\/profiles\/([a-z0-9]+)\/rename$/i,
      );
      if (req.method === 'POST' && profileRenameMatch) {
        const body = (await readBody(req)) as { name?: string };
        try {
          const meta = await renameCareerProfile(
            careerRoot,
            profileRenameMatch[1]!,
            body.name ?? '',
          );
          send(res, 200, { profile: meta });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const profileDeleteMatch = path.match(/^\/api\/profiles\/([a-z0-9]+)$/i);
      if (req.method === 'DELETE' && profileDeleteMatch) {
        try {
          if (activeProfileId === profileDeleteMatch[1]) {
            send(res, 400, {
              error: 'Switch to another profile before deleting the active one',
            });
            return;
          }
          const file = await deleteCareerProfile(
            careerRoot,
            profileDeleteMatch[1]!,
          );
          send(res, 200, { profiles: file.profiles, activeId: file.activeId });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/state') {
        if (!store) {
          send(res, 200, {
            needsProfile: true,
            activeProfileId: null,
            hubSelected: false,
            fleet: [],
            hubs: [],
            walletUsd: 0,
            tick: 0,
          });
          return;
        }
        const payload = await withCareerRead((world, missions) => {
          const nowMs = Date.now();
          const npcBusy = (world.npcs ?? []).filter((n) => n.status === 'busy').length;
          return {
            needsProfile: false,
            activeProfileId,
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
            classOps: missions.classOps ?? null,
            playerFbos: playerFboSnapshot(missions, world),
            companyCrew: companyCrewSnapshot(missions, world),
            homeCountryId: world.homeCountryId ?? null,
            countries: listWorldCountryIds(world),
            internationalLaneCount: world.internationalLanes?.length ?? 0,
            store: store!.kind,
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/hubs') {
        const payload = await withCareerRead((world, missions) => ({
          homeHubIcao: missions.homeHubIcao ?? null,
          hubs: world.airports
            .filter(
              (airport) =>
                airport.bushTripOnly !== true &&
                !isBushTripOnlyHub(airport.icao),
            )
            .map((airport) => ({
            icao: airport.icao,
            name: airport.name,
            region: airport.region,
            hubTier: airport.hubTier ?? 'spoke',
            lat: airport.lat,
            lon: airport.lon,
            level: airport.level,
            bush: airport.bush === true,
            bushTripOnly: airport.bushTripOnly === true,
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
          store: requireStore().kind,
        }));
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/cashflow') {
        const payload = await withCareerRead(async (world, missions) => {
          const cashflow = await requireStore().summarizeCashflow(world.tick);
          return {
            walletUsd: missions.walletUsd,
            tick: world.tick,
            dayIndex: economyDayIndex(world.tick),
            homeCountryId: world.homeCountryId ?? null,
            store: requireStore().kind,
            labels: LEDGER_KIND_LABEL,
            companyCredit: companyCreditSnapshot(missions),
            ...cashflow,
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/credit/draw') {
        const body = (await readBody(req)) as { amountUsd?: number };
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? body.amountUsd
            : NaN;
        try {
          const result = await withCareerWrite((world, missions) => {
            const drawn = drawCompanyCredit(missions, amountUsd, world.tick);
            return {
              walletUsd: missions.walletUsd,
              drawnUsd: drawn.drawnUsd,
              companyCredit: drawn.snapshot,
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

      if (req.method === 'POST' && path === '/api/credit/repay') {
        const body = (await readBody(req)) as { amountUsd?: number };
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? body.amountUsd
            : NaN;
        try {
          const result = await withCareerWrite((world, missions) => {
            const repaid = repayCompanyCredit(missions, amountUsd, world.tick);
            return {
              walletUsd: missions.walletUsd,
              repaidUsd: repaid.repaidUsd,
              companyCredit: repaid.snapshot,
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
        try {
          const result = await withCareerWrite((world, missions) => {
            const next = selectStarterHub(missions, body.icao!, {
              pilotName: body.pilotName!,
              ...(body.airframeTypeId?.trim()
                ? { airframeTypeId: body.airframeTypeId.trim() }
                : {}),
            });
            Object.assign(missions, next);
            syncHomeCountryFromHub(world, missions.homeHubIcao);
            return {
              walletUsd: missions.walletUsd,
              homeCountryId: world.homeCountryId ?? null,
              contractPilotCareer: missions.fleet.length === 0,
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
            deliveryTargetIcao: resolveAircraftDeliveryIcao(missions),
            deliveryQuotes: Object.fromEntries(
              listings.map((listing) => {
                try {
                  const q = quoteAircraftDeliveryForListing(
                    world,
                    missions,
                    listing,
                  );
                  return [
                    listing.id,
                    {
                      deliverToIcao: q.deliverToIcao,
                      basedIcao: q.basedIcao,
                      distanceNm: Math.round(q.distanceNm),
                      deliveryFeeUsd: q.deliveryFeeUsd,
                      needed: q.needed,
                    },
                  ] as const;
                } catch {
                  return [
                    listing.id,
                    {
                      deliverToIcao: resolveAircraftDeliveryIcao(missions),
                      basedIcao: listing.basedIcao,
                      distanceNm: 0,
                      deliveryFeeUsd: 0,
                      needed: false,
                    },
                  ] as const;
                }
              }),
            ),
            ferrySoftNmUsed: missions.ferrySoftNmUsed ?? 0,
            ferrySoftNmBudget: FERRY_SOFT_NM_BUDGET,
            catalog,
            airframePerf,
            fleet: withParkingRates(missions.fleet),
            leaseUnlock: aircraftLeaseUnlockProgress(missions),
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/buy') {
        const body = (await readBody(req)) as {
          listingId?: string;
          deliver?: boolean;
          deliverToIcao?: string;
        };
        if (!body.listingId) {
          send(res, 400, { error: 'listingId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            settleAircraftMarketOps(missions, world.tick);
            const purchased = purchaseAircraftListing(
              missions,
              world,
              body.listingId!,
              {
                deliver: body.deliver === true,
                ...(typeof body.deliverToIcao === 'string'
                  ? { deliverToIcao: body.deliverToIcao }
                  : {}),
              },
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: purchased.debitUsd,
              deliveryFeeUsd: purchased.deliveryFeeUsd,
              aircraft: purchased.aircraft,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
              companyCredit: companyCreditSnapshot(missions),
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
        const body = (await readBody(req)) as {
          listingId?: string;
          deliver?: boolean;
          deliverToIcao?: string;
        };
        if (!body.listingId) {
          send(res, 400, { error: 'listingId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            settleAircraftMarketOps(missions, world.tick);
            const leased = signAircraftLease(missions, world, body.listingId!, {
              deliver: body.deliver === true,
              ...(typeof body.deliverToIcao === 'string'
                ? { deliverToIcao: body.deliverToIcao }
                : {}),
            });
            return {
              walletUsd: missions.walletUsd,
              debitUsd: leased.debitUsd,
              deliveryFeeUsd: leased.deliveryFeeUsd,
              aircraft: leased.aircraft,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
              companyCredit: companyCreditSnapshot(missions),
              leaseUnlock: aircraftLeaseUnlockProgress(missions),
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
            const term = body.termMonths === 12 ? (12 as const) : (6 as const);
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
              fleet: withParkingRates(missions.fleet, world, missions),
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

      if (req.method === 'POST' && path === '/api/aircraft-market/return-lease') {
        const body = (await readBody(req)) as { aircraftId?: string };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const returned = returnAircraftLeaseEarly(
              missions,
              body.aircraftId!,
              world.tick,
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: returned.debitUsd,
              remainingMonths: returned.remainingMonths,
              fleet: withParkingRates(missions.fleet, world, missions),
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

      if (req.method === 'GET' && path === '/api/fleet/ferry-plan') {
        const aircraftId = url.searchParams.get('aircraftId')?.trim();
        const destIcao = url.searchParams.get('dest')?.trim().toUpperCase();
        const journeyOrigin = url.searchParams
          .get('journeyOrigin')
          ?.trim()
          .toUpperCase();
        if (!aircraftId || !destIcao) {
          send(res, 400, { error: 'aircraftId and dest query required' });
          return;
        }
        try {
          const result = await withCareerRead((world, missions) => {
            const aircraft = findPlayerAircraft(missions, aircraftId);
            if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
            const origin = aircraft.locationIcao.trim().toUpperCase();
            if (origin === destIcao) {
              const remainingNm = 0;
              const initialNm =
                journeyOrigin && journeyOrigin !== destIcao
                  ? (remainingNmToFinal(journeyOrigin, destIcao) ?? 0)
                  : 0;
              return {
                arrived: true,
                plan: null,
                nextLeg: null,
                nextQuote: null,
                remainingNm,
                initialNm,
                progressPct: 100,
                legIndex: 0,
                legCount: 0,
                maxRangeNm: resolveAirframeMaxRangeNm(
                  aircraft.airframeTypeId,
                  aircraft.aircraftClassId,
                ),
                walletUsd: missions.walletUsd,
                aircraftLocationIcao: origin,
              };
            }
            const maxRangeNm = resolveAirframeMaxRangeNm(
              aircraft.airframeTypeId,
              aircraft.aircraftClassId,
            );
            const plan = planFerryRoute({
              originIcao: origin,
              finalDestIcao: destIcao,
              maxRangeNm,
            });
            const nextLeg = nextFerryLeg(plan, origin);
            const nextQuote = nextLeg
              ? quoteFerry(world, missions, {
                  aircraftId,
                  destIcao: nextLeg.to,
                })
              : null;
            const remainingNm =
              remainingNmToFinal(origin, destIcao) ?? plan.totalDistanceNm;
            const initialNm =
              journeyOrigin && journeyOrigin !== destIcao
                ? (remainingNmToFinal(journeyOrigin, destIcao) ?? remainingNm)
                : remainingNm;
            const legIndex = nextLeg
              ? Math.max(1, plan.hops.indexOf(origin) + 1)
              : plan.legCount;
            return {
              arrived: false,
              plan: {
                originIcao: plan.originIcao,
                finalDestIcao: plan.finalDestIcao,
                hops: plan.hops,
                legs: plan.legs,
                totalDistanceNm: plan.totalDistanceNm,
                legCount: plan.legCount,
                maxRangeNm: plan.maxRangeNm,
                hopRangeNm: plan.hopRangeNm,
              },
              nextLeg,
              nextQuote,
              remainingNm: Math.round(remainingNm),
              initialNm: Math.round(initialNm),
              progressPct: ferryProgressPct(initialNm, remainingNm),
              legIndex,
              legCount: plan.legCount,
              maxRangeNm,
              walletUsd: missions.walletUsd,
              aircraftLocationIcao: origin,
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
            assertCompanyCreditAllowsOps(missions);
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

      if (req.method === 'POST' && path === '/api/fleet/empty-flight') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          destIcao?: string;
        };
        if (!body.aircraftId || !body.destIcao) {
          send(res, 400, { error: 'aircraftId and destIcao required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const accepted = acceptEmptyFlight(world, missions, {
              aircraftId: body.aircraftId!,
              destIcao: body.destIcao!,
            });
            return {
              mission: accepted.mission,
              aircraft: accepted.aircraft,
              walletUsd: missions.walletUsd,
              ...fleetPayload(missions, world),
            };
          });
          const watch = watchSession.getStatus();
          if (watch.missionId && watch.missionId !== result.mission.id) {
            if (watch.running) await watchSession.stop({ reset: true });
            else watchSession.resetSession();
          }
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/pilot/travel') {
        const body = (await readBody(req)) as {
          destIcao?: string;
          quoteOnly?: boolean;
        };
        if (!body.destIcao) {
          send(res, 400, { error: 'destIcao required' });
          return;
        }
        try {
          if (body.quoteOnly) {
            const quoted = await withCareerRead((world, missions) => {
              const quote = quotePilotTravel(world, missions, body.destIcao!);
              return {
                quote,
                walletUsd: missions.walletUsd,
                pilotIcao: missions.pilotIcao ?? missions.homeHubIcao ?? '',
              };
            });
            send(res, 200, quoted);
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            const traveled = executePilotTravel(
              world,
              missions,
              body.destIcao!,
              world.tick,
            );
            return {
              quote: traveled.quote,
              walletDebitUsd: traveled.walletDebitUsd,
              walletUsd: missions.walletUsd,
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

      if (req.method === 'GET' && path === '/api/cargo-limit') {
        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        if (!aircraft) {
          send(res, 400, { error: 'aircraft query required' });
          return;
        }
        const airframeTypeId = url.searchParams.get('airframe') ?? undefined;
        const aircraftId = url.searchParams.get('aircraftId')?.trim() || undefined;
        const originIcao = url.searchParams.get('origin')?.trim().toUpperCase();
        const destIcao = url.searchParams.get('dest')?.trim().toUpperCase();
        const cargoLimit = await resolveClassMaxCargoKg(
          aircraft,
          airframeTypeId,
        );
        const distanceRaw = url.searchParams.get('distanceNm');
        const distanceParsed =
          distanceRaw != null && distanceRaw.trim() !== ''
            ? Number(distanceRaw)
            : Number.NaN;
        let distanceNm: number | undefined =
          Number.isFinite(distanceParsed) && distanceParsed >= 0
            ? distanceParsed
            : undefined;
        // Missing query must not become Number(null)===0 — that fakes a zero-nm
        // hop and overstates operational payload vs /api/staging/commit.
        if (
          distanceNm === undefined &&
          originIcao &&
          destIcao &&
          originIcao !== destIcao
        ) {
          distanceNm = await withCareerRead((world) =>
            routeDistanceNm(world, originIcao, destIcao),
          );
        }
        const mxBurn = aircraftId
          ? await withCareerRead((_world, missions) => {
              const acf = missions.fleet.find((a) => a.id === aircraftId);
              return acf ? fuelBurnMultFromAircraft(acf) : null;
            })
          : null;
        // Hard tank/range gate uses healthy burn — MX only advises, never blocks.
        const routeLimit =
          typeof distanceNm === 'number' &&
          Number.isFinite(distanceNm) &&
          distanceNm >= 0
            ? estimateRouteCargoLimit(
                aircraft,
                distanceNm,
                cargoLimit.maxCargoKg,
                cargoLimit,
              )
            : undefined;
        const routeLimitMx =
          routeLimit && mxBurn && mxBurn.mult > 1.001
            ? estimateRouteCargoLimit(
                aircraft,
                distanceNm!,
                cargoLimit.maxCargoKg,
                { ...cargoLimit, fuelBurnMult: mxBurn.mult },
              )
            : undefined;
        let estimatedFuelCostUsd: number | null = null;
        let estimatedFuelUnitPriceUsd: number | null = null;
        let estimatedFuelScarcity: 'ok' | 'partial' | 'dry' | null = null;
        // Quote Jet-A for MX-padded burn when worn (pilot still free to depart short).
        const blockFuelKg =
          routeLimitMx?.estimatedBlockFuelKg ??
          routeLimit?.estimatedBlockFuelKg;
        if (
          originIcao &&
          typeof blockFuelKg === 'number' &&
          Number.isFinite(blockFuelKg) &&
          blockFuelKg > 0
        ) {
          try {
            const fuelQuote = await withCareerRead((world, missions) =>
              quoteFuelUplift(world, {
                originIcao,
                destIcao: destIcao || undefined,
                aircraftClassId: aircraft,
                distanceNm:
                  typeof distanceNm === 'number' &&
                  Number.isFinite(distanceNm) &&
                  distanceNm >= 0
                    ? distanceNm
                    : undefined,
                requestedKg: blockFuelKg,
                costMult: fboServiceCostMult(missions, originIcao),
              }),
            );
            estimatedFuelCostUsd = fuelQuote.costUsd;
            estimatedFuelUnitPriceUsd = fuelQuote.unitPriceUsd;
            estimatedFuelScarcity = fuelQuote.scarcity;
          } catch {
            estimatedFuelCostUsd = null;
            estimatedFuelUnitPriceUsd = null;
            estimatedFuelScarcity = null;
          }
        }
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
          distanceNm:
            typeof distanceNm === 'number' && Number.isFinite(distanceNm)
              ? distanceNm
              : null,
          // Show MX-aware planning fuel when worn; hard gate stays on healthy burn.
          estimatedBlockFuelKg: blockFuelKg ?? null,
          fuelDeficitKg: routeLimit?.fuelDeficitKg ?? null,
          fuelFeasible: routeLimit?.fuelFeasible ?? null,
          estimatedFuelCostUsd,
          estimatedFuelUnitPriceUsd,
          estimatedFuelScarcity,
          fuelBurnMult: routeLimitMx?.fuelBurnMult ?? 1,
          mxFuelBurn:
            mxBurn && mxBurn.mult > 1.001 && routeLimitMx
              ? {
                  mult: mxBurn.mult,
                  excessPct: Math.round(mxBurn.excessFrac * 100),
                  conditionPct: mxBurn.conditionPct,
                  blockFuelKg: routeLimitMx.estimatedBlockFuelKg,
                  baseBlockFuelKg: routeLimit?.estimatedBlockFuelKg ?? null,
                  exceedsTank: !routeLimitMx.fuelFeasible,
                  deficitKg: routeLimitMx.fuelDeficitKg,
                }
              : null,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/market') {
        const { world, cargoOps, classOps, missionsState } = await withCareerWrite(
          (w, missions) => {
            reconcilePlayerInbound(w, missions.missions);
            return {
              world: w,
              cargoOps: missions.cargoOps,
              classOps: missions.classOps,
              missionsState: missions,
            };
          },
        );
        const nowMs = Date.now();
        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        const hangarEmpty =
          !aircraft && missionsState.fleet.length === 0;
        const starterSort =
          hangarEmpty ||
          (aircraft != null && CLASS_OPS_STARTER_IDS.includes(aircraft));
        const airframeTypeId =
          url.searchParams.get('airframe')?.trim() || undefined;
        const origin = url.searchParams.get('origin') ?? undefined;
        const dest = url.searchParams.get('dest') ?? undefined;
        const query = url.searchParams.get('q') ?? undefined;
        const originQuery = url.searchParams.get('originQ') ?? undefined;
        const destQuery = url.searchParams.get('destQ') ?? undefined;
        const nearIcaoRaw = url.searchParams.get('nearIcao')?.trim().toUpperCase();
        const nearIcao =
          nearIcaoRaw && /^[A-Z0-9]{3,4}$/.test(nearIcaoRaw)
            ? nearIcaoRaw
            : undefined;
        const nearMaxNm = nearIcao
          ? (parsePositiveNumberParam(url.searchParams.get('nearMaxNm')) ??
            BOARD_NEAR_MAX_NM)
          : undefined;
        const pageParam = url.searchParams.get('page');
        const exactRoute = Boolean(origin?.trim() && dest?.trim());
        const commodityParam = url.searchParams.get('commodity') ?? undefined;
        const profitableOnly =
          url.searchParams.get('profitableOnly') === '1' ||
          url.searchParams.get('profitableOnly') === 'true';
        const filter = {
          originIcao: origin ?? undefined,
          destIcao: dest ?? undefined,
          query: query ?? undefined,
          originQuery: originQuery ?? undefined,
          destQuery: destQuery ?? undefined,
          nowMs,
        };
        const cargoLimit = aircraft
          ? await resolveClassMaxCargoKg(aircraft, airframeTypeId)
          : undefined;
        const maxRangeNm = aircraft
          ? resolveAirframeMaxRangeNm(
              airframeTypeId ?? cargoLimit?.airframeTypeId,
              aircraft,
            )
          : undefined;
        const listed = (
          aircraft
            ? listViableMarketLots(world, aircraft, {
                ...filter,
                maxCargoKg: cargoLimit?.maxCargoKg,
                maxRangeNm,
              })
            : listMarketLots(world, filter)
        ).filter(
          (row) =>
            !classOpsHidesBoardLot(classOps, {
              availableKg: row.availableKg,
              crewNeeded: row.npcClaim?.crewNeeded,
              claimCargoKg: row.npcClaim?.cargoKg,
              crewClassId: row.npcClaim?.aircraftClassId,
            }),
        );
        type MarketBoardRow = {
          id: string;
          originIcao: string;
          destIcao: string;
          originName: string;
          destName: string;
          distanceNm: number | undefined;
          commodityId: string;
          commodityName: string;
          quantityKg: number;
          availableKg: number;
          payUsd: number;
          urgency: string;
          reason: string;
          createdAtTick: number;
          expiresAtTick: number;
          ticksRemaining: number;
          perishable: boolean;
          bush: boolean;
          cargoLocked: boolean;
          classLocked: boolean;
          crewNeeded: boolean;
          crewClassId?: string;
          lastMile: boolean;
          originFromFocusNm?: number;
          idleEscalated: boolean;
          international: boolean;
          pressure: unknown;
          npcClaim: unknown;
          estimatedLiftKg?: number | null;
          estimatedFuelCostUsd?: number | null;
          estimatedNetUsd?: number | null;
          estimatedMarginPct?: number | null;
          estimatedFuelFeasible?: boolean | null;
          estimatedInRange?: boolean | null;
        };
        const routeEconCache = new Map<
          string,
          {
            liftCapKg: number;
            fuelCostUsd: number;
            fuelFeasible: boolean;
            inRange: boolean;
          } | null
        >();
        const mapped: MarketBoardRow[] = listed.map((row) => {
          const distanceNm = routeDistanceNm(
            world,
            row.lot.originIcao,
            row.lot.destIcao,
          );
          const crewClassId = parseFreighterClassId(
            row.npcClaim?.aircraftClassId,
          );
          const base: MarketBoardRow = {
            id: row.lot.id,
            originIcao: row.lot.originIcao,
            destIcao: row.lot.destIcao,
            originName: row.originName,
            destName: row.destName,
            distanceNm,
            commodityId: row.lot.commodityId,
            commodityName: row.commodityName,
            quantityKg: row.lot.quantityKg,
            availableKg: row.availableKg,
            payUsd: boardDisplayPayUsd({
              lotPayUsd: row.lot.payUsd,
              quantityKg: row.lot.quantityKg,
              crewNeeded: row.npcClaim?.crewNeeded,
              claimCargoKg: row.npcClaim?.cargoKg,
              pilotFeeUsd: row.npcClaim?.pilotFeeUsd,
            }),
            urgency: row.lot.urgency,
            reason: row.lot.reason,
            createdAtTick: row.lot.createdAtTick,
            expiresAtTick: row.lot.expiresAtTick,
            ticksRemaining: Math.max(0, row.lot.expiresAtTick - world.tick),
            perishable: Boolean(getCommodity(row.lot.commodityId).perishable),
            bush:
              isBushHub(row.lot.originIcao) || isBushHub(row.lot.destIcao),
            cargoLocked: !cargoOpsIsUnlocked(
              cargoOps ?? undefined,
              row.lot.commodityId,
            ),
            classLocked: Boolean(
              row.npcClaim?.crewNeeded &&
                crewClassId &&
                !classOpsIsUnlocked(classOps, crewClassId),
            ),
            crewNeeded: Boolean(row.npcClaim?.crewNeeded),
            ...(row.npcClaim?.aircraftClassId
              ? { crewClassId: row.npcClaim.aircraftClassId }
              : {}),
            lastMile: /last-mile/i.test(row.lot.reason),
            originFromFocusNm: nearIcao
              ? routeDistanceNm(world, nearIcao, row.lot.originIcao)
              : undefined,
            idleEscalated: Boolean(row.pressure?.idleEscalated),
            international: Boolean(row.pressure?.international),
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
                  ...(row.npcClaim.crewNeeded
                    ? {
                        crewNeeded: true as const,
                        ...(row.npcClaim.crewReposition
                          ? { crewReposition: true as const }
                          : {}),
                        pilotFeeUsd: row.npcClaim.pilotFeeUsd,
                        ...(typeof row.npcClaim.pilotFeeMinUsd === 'number'
                          ? { pilotFeeMinUsd: row.npcClaim.pilotFeeMinUsd }
                          : {}),
                        awaitingPilotUntilMs: row.npcClaim.awaitingPilotUntilMs,
                      }
                    : {}),
                  ...(row.npcClaim.airframeTypeId
                    ? { airframeTypeId: row.npcClaim.airframeTypeId }
                    : {}),
                  ...(row.npcClaim.aircraftLabel
                    ? { aircraftLabel: row.npcClaim.aircraftLabel }
                    : {}),
                  ...(row.npcClaim.aircraftClassId
                    ? { aircraftClassId: row.npcClaim.aircraftClassId }
                    : {}),
                }
              : null,
          };
          if (
            !aircraft ||
            !cargoLimit ||
            distanceNm === undefined ||
            !Number.isFinite(distanceNm)
          ) {
            if (
              !aircraft &&
              row.npcClaim?.crewNeeded &&
              crewClassId &&
              distanceNm !== undefined &&
              Number.isFinite(distanceNm)
            ) {
              return {
                ...base,
                estimatedInRange:
                  distanceNm <= getAircraftClass(crewClassId).maxRangeNm,
              };
            }
            return base;
          }
          const cacheKey = `${row.lot.originIcao}|${Math.round(distanceNm)}`;
          let cached = routeEconCache.get(cacheKey);
          if (cached === undefined) {
            const probe = estimateBoardLotEconomics(world, {
              originIcao: row.lot.originIcao,
              destIcao: row.lot.destIcao,
              distanceNm,
              availableKg: cargoLimit.maxCargoKg,
              quantityKg: cargoLimit.maxCargoKg,
              lotPayUsd: 0,
              aircraftClassId: aircraft,
              structuralMaxCargoKg: cargoLimit.maxCargoKg,
              weights: cargoLimit,
              maxRangeNm,
              costMult: fboServiceCostMult(
                missionsState,
                row.lot.originIcao,
              ),
            });
            cached = probe
              ? {
                  liftCapKg: probe.liftKg,
                  fuelCostUsd: probe.fuelCostUsd,
                  fuelFeasible: probe.fuelFeasible,
                  inRange: probe.inRange,
                }
              : null;
            routeEconCache.set(cacheKey, cached);
          }
          if (!cached) {
            return {
              ...base,
              estimatedLiftKg: null,
              estimatedFuelCostUsd: null,
              estimatedNetUsd: null,
              estimatedMarginPct: null,
              estimatedFuelFeasible: null,
              estimatedInRange: null,
            };
          }
          const boardFreightKg = boardFreightKgForEstimates({
            availableKg: row.availableKg,
            crewNeeded: base.npcClaim?.crewNeeded,
            claimCargoKg: base.npcClaim?.cargoKg,
          });
          const liftKg = Math.max(
            0,
            Math.min(Math.floor(boardFreightKg), cached.liftCapKg),
          );
          const qty =
            row.lot.quantityKg > 0
              ? row.lot.quantityKg
              : Math.max(boardFreightKg, 1);
          const payUsd =
            liftKg > 0
              ? Math.max(0, Math.round((liftKg / qty) * row.lot.payUsd))
              : 0;
          const netUsd = payUsd - cached.fuelCostUsd;
          const marginPct =
            payUsd > 0 ? netUsd / payUsd : netUsd < 0 ? -1 : 0;
          return {
            ...base,
            estimatedLiftKg: liftKg,
            estimatedFuelCostUsd: cached.fuelCostUsd,
            estimatedNetUsd: netUsd,
            estimatedMarginPct: marginPct,
            estimatedFuelFeasible: cached.fuelFeasible,
            estimatedInRange: cached.inRange,
          };
        });
        const requestedSorts = parseMarketBoardSorts(
          url.searchParams.get('sort'),
        );
        const viableOnly =
          url.searchParams.get('viableOnly') === '1' ||
          url.searchParams.get('viableOnly') === 'true';
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
          minNetUsd: parsePositiveNumberParam(url.searchParams.get('minNetUsd')),
          profitableOnly: aircraft ? profitableOnly : false,
          viableOnly: aircraft || hangarEmpty ? viableOnly : false,
          hangarEmpty,
          starterSort,
          nearMaxNm,
          accessFilter: parseMarketBoardAccessFilter(
            url.searchParams.get('access'),
          ),
          laneFilter: parseMarketBoardLaneFilter(url.searchParams.get('lane')),
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
          airframeTypeId: airframeTypeId ?? null,
          maxCargoKg: cargoLimit?.maxCargoKg ?? null,
          maxCargoSource: cargoLimit?.source ?? null,
          airframeLabel: cargoLimit?.airframeLabel ?? null,
          npcActivity: mapNpcActivity(world, nowMs),
          regionPressure: listRegionMarketPressure(world, nowMs).map((r) => ({
            region: r.region,
            capacity: r.capacity,
            thinFleet: r.thinFleet,
            laneBusy: r.laneBusy,
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
            laneBusy: r.laneBusy,
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
        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        const airframeTypeId =
          url.searchParams.get('airframe')?.trim() || undefined;
        const cargoLimit = aircraft
          ? await resolveClassMaxCargoKg(aircraft, airframeTypeId)
          : undefined;
        const maxRangeNm = aircraft
          ? resolveAirframeMaxRangeNm(
              airframeTypeId ?? cargoLimit?.airframeTypeId,
              aircraft,
            )
          : undefined;
        const relatedLots = world.lots
          .filter(
            (lot) =>
              (lot.originIcao === icao || lot.destIcao === icao) &&
              (lot.status === 'available' ||
                lot.status === 'reserved' ||
                lot.status === 'in_transit'),
          )
          .map((lot) => {
            const base = mapLotSummary(world, lot, nowMs);
            // Match listMarketLots: hide fully reserved lots unless Contract open.
            if (base.availableKg <= 0 && !base.npcClaim?.crewNeeded) {
              return null;
            }
            if (!aircraft || !cargoLimit) return base;
            const distanceNm = base.distanceNm;
            if (distanceNm === undefined || !Number.isFinite(distanceNm)) {
              return {
                ...base,
                estimatedLiftKg: null,
                estimatedFuelCostUsd: null,
                estimatedNetUsd: null,
                estimatedMarginPct: null,
                estimatedFuelFeasible: null,
                estimatedInRange: null,
              };
            }
            const boardFreightKg = boardFreightKgForEstimates({
              availableKg: base.availableKg,
              crewNeeded: base.npcClaim?.crewNeeded,
              claimCargoKg: base.npcClaim?.cargoKg,
            });
            const econ = estimateBoardLotEconomics(world, {
              originIcao: lot.originIcao,
              destIcao: lot.destIcao,
              distanceNm,
              availableKg: boardFreightKg,
              quantityKg: lot.quantityKg,
              lotPayUsd: lot.payUsd,
              aircraftClassId: aircraft,
              structuralMaxCargoKg: cargoLimit.maxCargoKg,
              weights: cargoLimit,
              maxRangeNm,
              costMult: fboServiceCostMult(missions, lot.originIcao),
            });
            if (!econ) {
              return {
                ...base,
                estimatedLiftKg: null,
                estimatedFuelCostUsd: null,
                estimatedNetUsd: null,
                estimatedMarginPct: null,
                estimatedFuelFeasible: null,
                estimatedInRange: null,
              };
            }
            return {
              ...base,
              estimatedLiftKg: econ.liftKg,
              estimatedFuelCostUsd: econ.fuelCostUsd,
              estimatedNetUsd: econ.netUsd,
              estimatedMarginPct: econ.marginPct,
              estimatedFuelFeasible: econ.fuelFeasible,
              estimatedInRange: econ.inRange,
            };
          })
          .filter((lot): lot is NonNullable<typeof lot> => lot != null);

        const movements = mapAirportMovements(world, icao, missions.missions, nowMs);
        const simNowMs =
          typeof world.lastBatchAtMs === 'number' && Number.isFinite(world.lastBatchAtMs)
            ? world.lastBatchAtMs
            : nowMs;
        const fuelInbound = listAirportFuelInbound(world, icao, simNowMs).map(mapFuelHaulView);
        const fuelRecent = listFuelHaulViews(world, { destIcao: icao, nowMs: simNowMs })
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
            bush: Boolean(airport.bush) || isBushHub(airport.icao),
            bushTripOnly: Boolean(airport.bushTripOnly) || isBushTripOnlyHub(airport.icao),
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
          aircraftClassId: aircraft ?? null,
          airframeTypeId: airframeTypeId ?? null,
          airframeLabel: cargoLimit?.airframeLabel ?? null,
          outboundLots: relatedLots.filter((l) => l.originIcao === icao),
          inboundLots: relatedLots.filter((l) => l.destIcao === icao),
          arrivals: movements.arrivals,
          departures: movements.departures,
          npcActivity: mapNpcActivity(world, nowMs).filter(
            (f) => f.originIcao === icao || f.destIcao === icao,
          ),
          fuelInbound,
          fuelRecent,
          playerFbos: playerFboSnapshotAtIcao(missions, world, icao),
          homeHubIcao: missions.homeHubIcao || null,
          runways: getAirportRunways(icao),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/buy') {
        const body = (await readBody(req)) as { icao?: string };
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const icao = (body.icao ?? missions.homeHubIcao).trim().toUpperCase();
            const bought = buyFboTier1(missions, world, icao);
            return {
              walletUsd: missions.walletUsd,
              debitUsd: bought.debitUsd,
              fbo: bought.fbo,
              playerFbos: playerFboSnapshot(missions, world),
              companyCrew: companyCrewSnapshot(missions, world),
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

      if (req.method === 'POST' && path === '/api/fbo/upgrade') {
        const body = (await readBody(req)) as { fboId?: string };
        if (!body.fboId) {
          send(res, 400, { error: 'fboId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const upgraded = upgradeFboToTier2(missions, world, body.fboId!);
            return {
              walletUsd: missions.walletUsd,
              debitUsd: upgraded.debitUsd,
              fbo: upgraded.fbo,
              playerFbos: playerFboSnapshot(missions, world),
              companyCrew: companyCrewSnapshot(missions, world),
              fleet: withParkingRates(missions.fleet, world, missions),
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

      if (req.method === 'POST' && path === '/api/fbo/hold') {
        const body = (await readBody(req)) as {
          lotId?: string;
          cargoKg?: number;
        };
        if (!body.lotId) {
          send(res, 400, { error: 'lotId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const held = holdLotAtFbo(missions, world, {
              lotId: body.lotId!,
              cargoKg: body.cargoKg,
            });
            return {
              hold: held.hold,
              playerFbos: playerFboSnapshot(missions, world),
              walletUsd: missions.walletUsd,
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

      if (req.method === 'POST' && path === '/api/fbo/cancel-hold') {
        const body = (await readBody(req)) as { holdId?: string };
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const cancelled = cancelFboHold(missions, world, body.holdId!);
            return {
              releasedKg: cancelled.releasedKg,
              playerFbos: playerFboSnapshot(missions, world),
              walletUsd: missions.walletUsd,
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

      if (req.method === 'POST' && path === '/api/fbo/reroute') {
        const body = (await readBody(req)) as {
          holdId?: string;
          destIcao?: string;
          quoteOnly?: boolean;
        };
        if (!body.holdId || !body.destIcao?.trim()) {
          send(res, 400, { error: 'holdId and destIcao required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const hold = (missions.playerFbos?.holds ?? []).find(
              (h) => h.id === body.holdId,
            );
            if (!hold) throw new Error(`Unknown FBO hold ${body.holdId}`);
            const feeUsd = quoteFboRerouteUsd(world, hold, body.destIcao!);
            if (body.quoteOnly) {
              const payQuote = quoteFboReroutePayAfterUsd(
                world,
                hold,
                body.destIcao!,
              );
              return {
                quoteOnly: true as const,
                feeUsd,
                payAfterUsd: payQuote.payAfterUsd,
                haircutApplied: payQuote.haircutApplied,
                bumpApplied: payQuote.bumpApplied,
                bumpFrac: payQuote.bumpFrac,
                previousDestIcao: hold.destIcao,
                destIcao: body.destIcao!.trim().toUpperCase(),
                walletUsd: missions.walletUsd,
                playerFbos: playerFboSnapshot(missions, world),
              };
            }
            assertCompanyCreditAllowsOps(missions);
            const rerouted = rerouteFboHold(missions, world, {
              holdId: body.holdId!,
              destIcao: body.destIcao!,
            });
            return {
              quoteOnly: false as const,
              debitUsd: rerouted.debitUsd,
              feeUsd: rerouted.debitUsd,
              hold: rerouted.hold,
              previousDestIcao: rerouted.previousDestIcao,
              destIcao: rerouted.hold.destIcao,
              haircutApplied: rerouted.haircutApplied,
              bumpApplied: rerouted.bumpApplied,
              payAfterUsd: rerouted.hold.payUsd,
              playerFbos: playerFboSnapshot(missions, world),
              walletUsd: missions.walletUsd,
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

      if (req.method === 'POST' && path === '/api/fbo/release') {
        const body = (await readBody(req)) as {
          holdId?: string;
          aircraft?: string;
          aircraftId?: string;
        };
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const hold = (missions.playerFbos?.holds ?? []).find(
              (h) => h.id === body.holdId,
            );
            let aircraftClassId = parseFreighterClassId(body.aircraft);
            let maxCargoKg: number | undefined;
            if (body.aircraftId) {
              const acf = findPlayerAircraft(missions, body.aircraftId);
              if (!acf) {
                throw new Error(`Unknown aircraft ${body.aircraftId}`);
              }
              aircraftClassId = acf.aircraftClassId;
              const catalog = acf.airframeTypeId
                ? findCareerPlayerAirframe(acf.airframeTypeId)
                : undefined;
              if (catalog?.maxCargoKg) maxCargoKg = catalog.maxCargoKg;
            } else if (!aircraftClassId && hold) {
              const parked = missions.fleet.find(
                (a) =>
                  a.locationIcao.toUpperCase() === hold.originIcao &&
                  (a.status === 'parked' || a.status === 'maintenance'),
              );
              aircraftClassId = parked?.aircraftClassId ?? 'light_ga';
              if (parked?.airframeTypeId) {
                const catalog = findCareerPlayerAirframe(parked.airframeTypeId);
                if (catalog?.maxCargoKg) maxCargoKg = catalog.maxCargoKg;
              }
            }
            const released = releaseFboHoldToMission(missions, world, {
              holdId: body.holdId!,
              aircraftClassId: aircraftClassId ?? 'light_ga',
              maxCargoKg,
            });
            return {
              mission: withMissionLoadPolicy(released.mission),
              playerFbos: playerFboSnapshot(missions, world),
              walletUsd: missions.walletUsd,
              missions: missions.missions.map((m) => withMissionLoadPolicy(m)),
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

      if (req.method === 'POST' && path === '/api/fbo/split') {
        const body = (await readBody(req)) as {
          holdId?: string;
          legs?: Array<{ aircraftId?: string; cargoKg?: number }>;
        };
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        if (!Array.isArray(body.legs) || body.legs.length === 0) {
          send(res, 400, { error: 'legs required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const split = splitFboHold(missions, world, {
              holdId: body.holdId!,
              legs: body.legs!.map((leg) => ({
                aircraftId: String(leg.aircraftId ?? ''),
                cargoKg: Number(leg.cargoKg),
              })),
            });
            return {
              missions: split.missions.map((m) => withMissionLoadPolicy(m)),
              hold: split.hold,
              allocatedKg: split.allocatedKg,
              remainingKg: split.remainingKg,
              playerFbos: playerFboSnapshot(missions, world),
              fleet: withParkingRates(missions.fleet, world, missions),
              walletUsd: missions.walletUsd,
              allMissions: missions.missions.map((m) =>
                withMissionLoadPolicy(m),
              ),
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

      if (req.method === 'POST' && path === '/api/fbo/return-mission') {
        const body = (await readBody(req)) as { missionId?: string };
        if (!body.missionId?.trim()) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const returned = returnMissionToFboHold(
              missions,
              world,
              body.missionId!.trim(),
            );
            return {
              mission: withMissionLoadPolicy(returned.mission),
              hold: returned.hold,
              merged: returned.merged,
              playerFbos: playerFboSnapshot(missions, world),
              fleet: withParkingRates(missions.fleet, world, missions),
              walletUsd: missions.walletUsd,
              missions: missions.missions.map((m) => withMissionLoadPolicy(m)),
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

      if (req.method === 'POST' && path === '/api/crew/assign') {
        const body = (await readBody(req)) as {
          missionId?: string;
          crewMemberId?: string;
        };
        if (!body.missionId?.trim() || !body.crewMemberId?.trim()) {
          send(res, 400, { error: 'missionId and crewMemberId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const mission = assignCrewMemberToMission(missions, {
              missionId: body.missionId!.trim(),
              crewMemberId: body.crewMemberId!.trim(),
            });
            return {
              mission: withMissionLoadPolicy(mission),
              companyCrew: companyCrewSnapshot(missions, world),
              missions: missions.missions.map((m) => withMissionLoadPolicy(m)),
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

      if (req.method === 'POST' && path === '/api/crew/dispatch') {
        const body = (await readBody(req)) as {
          missionId?: string;
          holdId?: string;
          aircraftId?: string;
          crewMemberId?: string;
        };
        if (!body.missionId && !body.holdId) {
          send(res, 400, { error: 'missionId or holdId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            let missionId = body.missionId?.trim();
            if (!missionId && body.holdId) {
              const hold = (missions.playerFbos?.holds ?? []).find(
                (h) => h.id === body.holdId,
              );
              if (!hold) throw new Error(`Unknown hold ${body.holdId}`);
              let aircraftClassId: FreighterClassId = 'light_ga';
              let maxCargoKg: number | undefined;
              if (body.aircraftId) {
                const acf = findPlayerAircraft(missions, body.aircraftId);
                if (!acf) throw new Error(`Unknown aircraft ${body.aircraftId}`);
                aircraftClassId = acf.aircraftClassId;
                const catalog = acf.airframeTypeId
                  ? findCareerPlayerAirframe(acf.airframeTypeId)
                  : undefined;
                if (catalog?.maxCargoKg) maxCargoKg = catalog.maxCargoKg;
              } else {
                const parked = missions.fleet.find(
                  (a) =>
                    a.status === 'parked' &&
                    a.locationIcao.toUpperCase() ===
                      hold.originIcao.toUpperCase(),
                );
                if (parked) {
                  aircraftClassId = parked.aircraftClassId;
                  const catalog = parked.airframeTypeId
                    ? findCareerPlayerAirframe(parked.airframeTypeId)
                    : undefined;
                  if (catalog?.maxCargoKg) maxCargoKg = catalog.maxCargoKg;
                }
              }
              const released = releaseFboHoldToMission(missions, world, {
                holdId: body.holdId!,
                aircraftClassId,
                maxCargoKg,
              });
              missionId = released.mission.id;
            }
            const dispatched = dispatchCrewMission(missions, world, {
              missionId: missionId!,
              aircraftId: body.aircraftId,
              crewMemberId: body.crewMemberId,
              nowMs: Date.now(),
            });
            return {
              mission: withMissionLoadPolicy(dispatched.mission),
              crewFeeUsd: dispatched.crewFeeUsd,
              returnFeeUsd: dispatched.returnFeeUsd,
              totalRoundTripFeeUsd: dispatched.totalRoundTripFeeUsd,
              fuelDebitUsd: dispatched.fuelDebitUsd,
              walletUsd: missions.walletUsd,
              fleet: withParkingRates(missions.fleet, world, missions),
              playerFbos: playerFboSnapshot(missions, world),
              companyCrew: companyCrewSnapshot(missions, world),
              missions: missions.missions.map((m) => withMissionLoadPolicy(m)),
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

      if (req.method === 'POST' && path === '/api/crew/hire') {
        const body = (await readBody(req)) as { candidateId?: string };
        if (!body.candidateId?.trim()) {
          send(res, 400, { error: 'candidateId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const hired = hireCrewCandidate(missions, world, body.candidateId!.trim());
            return {
              member: hired.member,
              debitUsd: hired.debitUsd,
              walletUsd: missions.walletUsd,
              companyCrew: companyCrewSnapshot(missions, world),
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

      if (req.method === 'POST' && path === '/api/crew/fire') {
        const body = (await readBody(req)) as { memberId?: string };
        if (!body.memberId?.trim()) {
          send(res, 400, { error: 'memberId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const fired = fireCrewMember(missions, body.memberId!.trim());
            return {
              member: fired,
              walletUsd: missions.walletUsd,
              companyCrew: companyCrewSnapshot(missions, world),
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

      if (req.method === 'GET' && path === '/api/missions') {
        const payload = await withCareerRead((world, missions) => ({
          ...missions,
          missions: missions.missions.map((m) =>
            withMissionClientView(world, missions, m),
          ),
        }));
        send(res, 200, payload);
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
          const fboOps = settleFboOps(missions, world, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          const crewDaily = settleCrewDailyOps(missions, world, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          const creditOps = settleCompanyCredit(missions, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          listAircraftMarket(missions, world);
          // Debug time skip: crew legs use wall-clock, not economy ticks.
          const advanceMs = n * MS_PER_TICK;
          for (const mission of missions.missions) {
            if (
              mission.crewOperated === true &&
              mission.status === 'in_flight' &&
              typeof mission.airborneAtMs === 'number' &&
              Number.isFinite(mission.airborneAtMs)
            ) {
              mission.airborneAtMs = Math.max(
                0,
                mission.airborneAtMs - advanceMs,
              );
            }
          }
          const crewOps = settleCrewOpsDue(missions, world, Date.now());
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
            fboStorageDebitUsd: fboOps.storage.debitUsd,
            fboHoldsExpired: fboOps.expired.length,
            fboExpirePenaltyUsd: fboOps.expirePenaltyUsd,
            crewSalaryDebitUsd: crewDaily.salary.debitUsd,
            crewSettled: crewOps.settled.length,
            creditInterestPaidUsd: creditOps.interestPaidUsd,
            creditInterestCompoundedUsd: creditOps.interestCompoundedUsd,
            creditOverdueDays: creditOps.overdueDays,
            creditPrincipalUsd: creditOps.principalUsd,
            companyCredit: companyCreditSnapshot(missions),
            playerFbos: playerFboSnapshot(missions, world),
            companyCrew: companyCrewSnapshot(missions, world),
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

      if (req.method === 'GET' && path === '/api/debug/economy-pulse') {
        const payload = await withCareerRead((world) => computeEconomyPulse(world));
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
            assertCompanyCreditAllowsOps(missions);
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
              classOps: missions.classOps,
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
          // New / different mission must not inherit prior Watch leftovers.
          const watch = watchSession.getStatus();
          if (
            watch.missionId &&
            watch.missionId !== result.mission.id
          ) {
            if (watch.running) {
              await watchSession.stop({ reset: true });
            } else {
              watchSession.resetSession();
            }
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

      if (req.method === 'GET' && path === '/api/contract-pilot/options') {
        const lotId = url.searchParams.get('lotId')?.trim();
        const npcFlightId = url.searchParams.get('npcFlightId')?.trim();
        if (!lotId && !npcFlightId) {
          send(res, 400, { error: 'lotId or npcFlightId required' });
          return;
        }
        try {
          const payload = await withCareerRead((world, missions) => {
            const flight =
              (npcFlightId
                ? world.npcFlights.find((f) => f.id === npcFlightId)
                : undefined) ??
              (lotId
                ? world.npcFlights.find(
                    (f) => f.lotId === lotId && f.status === 'awaiting_pilot',
                  )
                : undefined);
            if (!flight || flight.status !== 'awaiting_pilot') {
              return { kind: 'missing' as const };
            }
            if (
              missions.classOps &&
              !classOpsIsUnlocked(missions.classOps, flight.aircraftClassId)
            ) {
              return {
                kind: 'locked' as const,
                aircraftClassId: flight.aircraftClassId,
              };
            }
            const distanceNm =
              routeDistanceNm(world, flight.originIcao, flight.destIcao) ??
              undefined;
            const airframes = listContractPilotPickAirframes(flight, {
              distanceNm,
            });
            return {
              kind: 'ok' as const,
              offer: {
                lotId: flight.lotId,
                npcFlightId: flight.id,
                originIcao: flight.originIcao,
                destIcao: flight.destIcao,
                aircraftClassId: flight.aircraftClassId,
                cargoKg: flight.cargoKg,
                payUsd: flight.payUsd,
                distanceNm: distanceNm ?? null,
                crewReposition: flight.kind === 'reposition',
                pilotFeeUsd:
                  flight.pilotFeeUsd ??
                  Math.max(50, Math.round(flight.payUsd * 0.4)),
                awaitingPilotUntilMs: flight.awaitingPilotUntilMs,
              },
              airframes,
            };
          });
          if (payload.kind === 'missing') {
            send(res, 404, { error: 'No open crew-needed offer' });
            return;
          }
          if (payload.kind === 'locked') {
            send(res, 403, {
              error: `Class locked: ${payload.aircraftClassId} — unlock this freighter class before taking crew offers`,
            });
            return;
          }
          send(res, 200, payload);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/contract-pilot/accept') {
        const body = (await readBody(req)) as {
          lotId?: string;
          npcFlightId?: string;
          airframeTypeId?: string;
          openDispatch?: boolean;
        };
        if (!body.lotId && !body.npcFlightId) {
          send(res, 400, { error: 'lotId or npcFlightId required' });
          return;
        }
        if (!body.airframeTypeId?.trim()) {
          send(res, 400, { error: 'airframeTypeId required' });
          return;
        }
        try {
          const accepted = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const result = acceptContractPilotOffer(world, missions, {
              lotId: body.lotId,
              npcFlightId: body.npcFlightId,
              airframeTypeId: body.airframeTypeId!,
              nowMs: Date.now(),
            });
            return {
              ...result,
              walletUsd: missions.walletUsd,
            };
          });
          let mission = accepted.mission;
          let dispatch:
            | {
                url: string;
                staticId: string;
                type: string;
                airframeLabel: string;
                opened: boolean;
              }
            | undefined;
          let dispatchError: string | undefined;
          if (body.openDispatch !== false) {
            try {
              const built = await buildMissionDispatch(mission, {
                liveTitle: getLastProbeAircraftTitle(),
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
                  injectBallastLb: undefined,
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
            } catch (error) {
              dispatchError =
                error instanceof Error ? error.message : String(error);
            }
          }
          const watch = watchSession.getStatus();
          if (watch.missionId && watch.missionId !== mission.id) {
            if (watch.running) await watchSession.stop({ reset: true });
            else watchSession.resetSession();
          }
          send(res, 200, {
            mission,
            pilotFeeUsd: accepted.pilotFeeUsd,
            grossPayUsd: accepted.grossPayUsd,
            npcName: accepted.npcName,
            airframeLabel: accepted.airframeLabel,
            liftedKg: accepted.liftedKg,
            remainderKg: accepted.remainderKg,
            remainderOpenOnBoard: accepted.remainderOpenOnBoard,
            npcDepartedWithRemainder: accepted.npcDepartedWithRemainder,
            pilotRelocatedFrom: accepted.pilotRelocatedFrom ?? null,
            pilotIcao: mission.originIcao,
            walletUsd: accepted.walletUsd,
            dispatch: dispatch ?? null,
            dispatchError: dispatchError ?? null,
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
          send(res, 400, {
            error:
              'Buy or lease an aircraft before staging owned freights — or accept a Crew needed offer',
          });
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
            assertCompanyCreditAllowsOps(missions);
            if (!missions.hubSelected || missions.fleet.length === 0) {
              throw new Error(
                'Buy or lease an aircraft before staging owned freights — or accept a Crew needed offer',
              );
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
            // Retry after a successful cargo write but failed client/dispatch response:
            // open route is already full — treat matching lots as idempotent success.
            if (intoMission && !replace) {
              const remaining = missionRemainingCapacityKg(
                intoMission,
                operationalMaxCargoKg,
              );
              if (remaining <= 0) {
                const onFlight = new Set(
                  (intoMission.lots ?? []).map((line) => line.shipmentLotId),
                );
                const retryOfSameLoad = lines.every((line) =>
                  onFlight.has(line.lotId),
                );
                if (retryOfSameLoad) {
                  return {
                    mission: intoMission,
                    appended: false,
                    lineCount: intoMission.lots?.length ?? 0,
                    operationalMaxCargoKg,
                    estimatedBlockFuelKg: routeCargoLimit.estimatedBlockFuelKg,
                    walletUsd: missions.walletUsd,
                    fleet: withParkingRates(missions.fleet),
                    idempotent: true,
                  };
                }
                throw new Error(
                  `Flight ${intoMission.id} is already at capacity (${intoMission.cargoKg} kg). ` +
                    `Edit the manifest from Dispatch instead of accepting again.`,
                );
              }
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
              classOps: missions.classOps,
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
              classOps: missions.classOps,
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
          // Same rule as accept: a different mission must not inherit prior
          // Watch leftovers, instead of relying on the client to start Watch.
          const stagingWatch = watchSession.getStatus();
          if (stagingWatch.missionId && stagingWatch.missionId !== mission.id) {
            if (stagingWatch.running) {
              await watchSession.stop({ reset: true });
            } else {
              watchSession.resetSession();
            }
          }
          let dispatch:
            | {
                url: string;
                staticId: string;
                type: string;
                airframeLabel: string;
                opened: boolean;
              }
            | undefined;
          let dispatchError: string | undefined;
          if (body.openDispatch !== false) {
            try {
              const built = await buildMissionDispatch(mission, {
                units: body.units ?? body.weightSystem,
                liveTitle: getLastProbeAircraftTitle(),
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
                  injectBallastLb: undefined,
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
            } catch (error) {
              // Cargo is already reserved — don't fail the accept with a dispatch error
              // (that left the UI retrying Max/Accept onto a full flight).
              dispatchError =
                error instanceof Error ? error.message : String(error);
            }
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
            dispatchError: dispatchError ?? null,
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

      if (req.method === 'GET' && path === '/api/bush-trips') {
        const payload = await withCareerRead((world, missions) => {
          const trips = listBushTrips().map(bushTripToBoardRow);
          const active = isBushTripActive(missions);
          let activeView: {
            tripId: string;
            title: string;
            legIndex: number;
            fromIcao: string;
            toIcao: string;
            legs: number;
            payUsd: number;
            aircraftId: string;
            status: 'accepted' | 'in_progress';
            mapNodes: ReturnType<typeof bushTripMapNodes>;
            startIcao: string;
            endIcao: string;
            hasPln: boolean;
            cruisingAltFt?: number;
            legStatus: 'ready' | 'departed';
          } | null = null;
          if (active) {
            const trip = getBushTrip(active.tripId);
            const leg = trip?.legs[active.legIndex];
            if (trip && leg) {
              activeView = {
                tripId: trip.id,
                title: trip.title,
                legIndex: active.legIndex,
                fromIcao: leg.fromIcao.toUpperCase(),
                toIcao: leg.toIcao.toUpperCase(),
                legs: trip.legs.length,
                payUsd: typeof trip.payUsd === 'number' ? trip.payUsd : 0,
                aircraftId: active.aircraftId,
                status: active.status === 'in_progress' ? 'in_progress' : 'accepted',
                mapNodes: bushTripMapNodes(trip),
                startIcao: trip.legs[0]!.fromIcao.toUpperCase(),
                endIcao: trip.legs[trip.legs.length - 1]!.toIcao.toUpperCase(),
                hasPln: Boolean(bushTripActivitiesPlnFile(trip.id)),
                ...(typeof trip.cruisingAltFt === 'number' &&
                Number.isFinite(trip.cruisingAltFt) &&
                trip.cruisingAltFt > 0
                  ? { cruisingAltFt: Math.round(trip.cruisingAltFt) }
                  : {}),
                legStatus: active.legStatus ?? 'ready',
              };
            }
          }
          return {
            trips,
            active: activeView,
            walletUsd: missions.walletUsd,
            tick: world.tick,
            ...fleetPayload(missions, world),
          };
        });
        send(res, 200, payload);
        return;
      }


      const bushPlnMatch = path.match(/^\/api\/bush-trips\/([a-z0-9-]+)\/pln$/i);
      if (req.method === 'GET' && bushPlnMatch) {
        const tripId = bushPlnMatch[1]!;
        const fileName = bushTripActivitiesPlnFile(tripId);
        if (!fileName) {
          send(res, 404, { error: 'No Activities PLN for this trip' });
          return;
        }
        const plnPath = join(careerRoot, 'bush_PLN', fileName);
        try {
          const { readFile } = await import('node:fs/promises');
          const xml = await readFile(plnPath, 'utf8');
          const safeName = fileName.replace(/[^\w.\- ]+/g, '_');
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safeName}"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-store',
          });
          res.end(xml);
        } catch {
          send(res, 404, { error: `PLN file missing: ${fileName}` });
        }
        return;
      }

      const bushGfpMatch = path.match(/^\/api\/bush-trips\/([a-z0-9-]+)\/gfp$/i);
      if (req.method === 'GET' && bushGfpMatch) {
        const tripId = bushGfpMatch[1]!;
        const fileName = bushTripActivitiesPlnFile(tripId);
        if (!fileName) {
          send(res, 404, { error: 'No Activities PLN to convert for this trip' });
          return;
        }
        const plnPath = join(careerRoot, 'bush_PLN', fileName);
        try {
          const { readFile } = await import('node:fs/promises');
          const xml = await readFile(plnPath, 'utf8');
          const trip = getBushTrip(tripId);
          const gfp = msfsPlnXmlToGfp(xml, {
            title: trip?.title,
            // MSFS homologation overrides win over PLN User-WP stand-ins.
            coordsByIcao: gfpCoordsByIcao(),
          });
          const safeName = gfpDownloadFilename(
            gfp.title,
            gfp.departureId,
            gfp.destinationId,
          );
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safeName}"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-store',
            'X-Skyline-Gfp-Waypoints': String(gfp.waypointCount),
            'X-Skyline-Gfp-Thinned': gfp.thinned ? '1' : '0',
          });
          res.end(gfp.body);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send(res, 500, { error: `GFP convert failed: ${message}` });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/bush-trips/accept') {
        const body = (await readBody(req)) as {
          tripId?: string;
          aircraftId?: string;
        };
        if (!body.tripId || !body.aircraftId) {
          send(res, 400, { error: 'tripId and aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const accepted = acceptBushTrip(missions, {
              tripId: body.tripId!,
              aircraftId: body.aircraftId!,
              tick: world.tick,
            });
            return {
              active: accepted.active,
              trip: bushTripToBoardRow(accepted.trip),
              walletUsd: missions.walletUsd,
              ...fleetPayload(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const notFound =
            message.startsWith('Unknown bush trip') ||
            message.startsWith('Unknown aircraft');
          send(res, notFound ? 404 : 400, { error: message });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/bush-trips/abandon') {
        try {
          if (bushWatchSession.getStatus().running) {
            await bushWatchSession.stop();
          }
          const result = await withCareerWrite((world, missions) => {
            const abandoned = abandonBushTrip(missions, { tick: world.tick });
            return {
              active: abandoned.active,
              walletUsd: missions.walletUsd,
              ...fleetPayload(missions, world),
            };
          });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, 400, { error: message });
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
        if (watch.missionId === body.missionId) {
          if (watch.running) {
            await watchSession.stop({ reset: true });
          } else {
            watchSession.resetSession();
          }
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
            if (existing.crewOperated || existing.crewMemberId) {
              releaseCompanyCrewFromMission(missions, cancelled.id);
            }
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
          prep.mission.airframeTypeId,
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
          liveTitle: getLastProbeAircraftTitle(),
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
            injectBallastLb: undefined,
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
              expected: f.expected,
              actual: f.actual,
              delta: f.delta,
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
            if (
              mission.contractPilot &&
              (ofpCheck.verdict === 'pass' || ofpCheck.verdict === 'warn') &&
              ofpCheck.ofpId
            ) {
              mission.fuelAuthorizedOfpId = ofpCheck.ofpId;
            }
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

      if (req.method === 'POST' && path === '/api/accept-ofp-cargo') {
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
          probeMission.status !== 'accepted' &&
          probeMission.status !== 'dispatched'
        ) {
          send(res, 400, {
            error: `Mission ${probeMission.id} cannot accept OFP cargo (status=${probeMission.status})`,
          });
          return;
        }
        if (probeMission.contractPilot) {
          send(res, 400, {
            error: 'Cannot trim cargo on a contract-pilot flight',
          });
          return;
        }
        if (!probeMission.staticId) {
          send(res, 400, {
            error: 'Mission has no static_id — Dispatch and generate an OFP first',
          });
          return;
        }

        try {
          const before = await confirmMissionOfp(probeMission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
          });
          if (!isOfpCargoUnderOnlyFailure(before.check)) {
            send(res, 400, {
              error:
                'OFP is not blocked solely by under-cargo — fix other findings or edit cargo manually',
            });
            return;
          }
          const ofpCargoKg = before.ofp.cargoKg;
          if (
            typeof ofpCargoKg !== 'number' ||
            !Number.isFinite(ofpCargoKg) ||
            ofpCargoKg < 1
          ) {
            send(res, 400, { error: 'OFP has no usable cargo weight to accept' });
            return;
          }
          if (ofpCargoKg >= probeMission.cargoKg) {
            send(res, 400, {
              error: 'OFP cargo is already at or above the mission load',
            });
            return;
          }

          const trimmedWrite = await withCareerWrite((world, missions) => {
            const mission = missions.missions.find((m) => m.id === body.missionId);
            if (!mission) {
              throw new Error(`Unknown mission ${body.missionId}`);
            }
            if (
              mission.status !== 'accepted' &&
              mission.status !== 'dispatched'
            ) {
              throw new Error(
                `Mission ${mission.id} cannot accept OFP cargo (status=${mission.status})`,
              );
            }
            if (mission.contractPilot) {
              throw new Error('Cannot trim cargo on a contract-pilot flight');
            }
            const trimmed = trimMissionCargoToKg(world, mission, ofpCargoKg);
            Object.assign(mission, trimmed.mission);
            mission.lastPreflightCheck = undefined;
            mission.injectBallastLb = undefined;
            mission.fuelAuthorizedOfpId = undefined;
            // Keep staticId / same SimBrief OFP — only the mission load changed.
            return {
              mission,
              releasedKg: trimmed.releasedKg,
              payBeforeUsd: trimmed.payBeforeUsd,
              payAfterUsd: trimmed.payAfterUsd,
            };
          });

          const after = await confirmMissionOfp(trimmedWrite.mission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
          });
          const ofpCheck = {
            verdict: after.check.verdict,
            summary: after.summary,
            checkedAtIso: new Date().toISOString(),
            ofpId: after.ofp.ofpId,
            staticId: trimmedWrite.mission.staticId,
            briefing: after.ofp.briefing,
            plannedBlockFuelKg: after.ofp.blockFuelKg,
            findings: after.check.findings.map((f) => ({
              code: f.code,
              severity: f.severity,
              message: f.message,
              expected: f.expected,
              actual: f.actual,
              delta: f.delta,
            })),
          };
          let savedMission: MissionIntent | null = null;
          const wrote = await updateOpenMission(body.missionId, (_missions, mission) => {
            if (
              mission.status !== 'accepted' &&
              mission.status !== 'dispatched'
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
            send(res, 400, {
              error: 'Mission changed before OFP reconfirm could be saved',
            });
            return;
          }
          send(res, 200, {
            mission: savedMission,
            releasedKg: trimmedWrite.releasedKg,
            payBeforeUsd: trimmedWrite.payBeforeUsd,
            payAfterUsd: trimmedWrite.payAfterUsd,
            check: after.check,
            summary: after.summary,
            ofp: after.ofp,
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
              const mxPad = resolveMissionMxBlockFuel(
                mission,
                missions.fleet,
                ofp.plannedBlockFuelKg,
              );
              const quote = quotePlayerMissionOfpFuel(world, missions, mission, {
                ofpId: ofp.ofpId,
                requiredBlockFuelKg: mxPad.requiredBlockFuelKg,
              });
              return {
                kind: 'ok' as const,
                quote: {
                  ...quote,
                  ofpBlockFuelKg: mxPad.ofpBlockFuelKg,
                  mxPadKg: mxPad.mxPadKg,
                  mxExcessPct: mxPad.excessPct,
                  mxCappedByTank: mxPad.cappedByTank,
                },
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
            const mxPad = resolveMissionMxBlockFuel(
              mission,
              missions.fleet,
              ofp.plannedBlockFuelKg,
            );
            const result = purchasePlayerMissionOfpFuel(world, missions, mission, {
              ofpId: ofp.ofpId,
              requiredBlockFuelKg: mxPad.requiredBlockFuelKg,
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
              quote: {
                ...result.quote,
                ofpBlockFuelKg: mxPad.ofpBlockFuelKg,
                mxPadKg: mxPad.mxPadKg,
                mxExcessPct: mxPad.excessPct,
                mxCappedByTank: mxPad.cappedByTank,
              },
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
          const fleetAcf = probeMission.aircraftId
            ? probe.fleet?.find((a) => a.id === probeMission.aircraftId)
            : undefined;
          const result = await runMissionPreflight(probeMission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
            pipeName: body.pipeName,
          });
          const mxFinding = mxFuelBurnFindingForAircraft(fleetAcf);
          const findings = mxFinding
            ? [
                ...result.check.findings.filter((f) => f.code !== 'MX_FUEL_BURN'),
                mxFinding,
              ]
            : result.check.findings;
          const summary = mxFinding
            ? `${result.check.summary} · ${mxFinding.message}`
            : result.check.summary;
          const lastPreflightCheck = {
            verdict: result.check.verdict,
            summary,
            checkedAtIso: result.check.checkedAtIso,
            phase: result.check.phase,
            loadVerification: result.check.loadVerification,
            findings,
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
              ? watchSession.finalizeFlightScoreForSettle(landingFpm)
              : undefined;
          const weatherOps =
            watchSession.getStatus().missionId === body.missionId
              ? watchSession.getCapturedWeatherOps() ?? undefined
              : undefined;
          let touchdownLat: number | undefined;
          let touchdownLon: number | undefined;
          let touchdownHeadingTrueDeg: number | undefined;
          if (watchSession.getStatus().missionId === body.missionId) {
            const captured = watchSession.getCapturedTouchdownPosition();
            if (captured) {
              touchdownLat = captured.lat;
              touchdownLon = captured.lon;
              touchdownHeadingTrueDeg = captured.headingTrueDeg;
            }
          }
          if (touchdownLat === undefined || touchdownLon === undefined) {
            try {
              const tdPos = await probeFirstContactPosition();
              if (tdPos) {
                touchdownLat = tdPos.lat;
                touchdownLon = tdPos.lon;
                touchdownHeadingTrueDeg ??= tdPos.headingTrueDeg;
              }
            } catch {
              /* soft-fail */
            }
          }
          // Stop live watch first so an in-flight tick cannot rewrite this mission.
          const watch = watchSession.getStatus();
          if (watch.running && watch.missionId === body.missionId) {
            await watchSession.stop();
          }
          const settled = await withCareerWrite((world, missions) => {
            const idx = missions.missions.findIndex((m) => m.id === body.missionId);
            if (idx < 0) return { kind: 'missing' as const };
            const openMission = missions.missions[idx]!;
            const runwayTouch =
              touchdownLat != null && touchdownLon != null
                ? evaluateRunwayTouchdown(
                    openMission.destIcao,
                    touchdownLat,
                    touchdownLon,
                    touchdownHeadingTrueDeg,
                  )
                : undefined;
            const result = settleMission(world, openMission, {
              fleet: missions,
              residualFuelKg,
              landingFpm,
              airborneEndedAtMs,
              flightScore,
              weatherOps,
              touchdownLat,
              touchdownLon,
              touchdownHeadingTrueDeg,
              runwayTouch,
              nowMs: Date.now(),
            });
            missions.missions[idx] = result.mission;
            if (result.walletCreditUsd > 0) {
              applyWalletDelta(missions, {
                amountUsd: result.walletCreditUsd,
                kind: 'freight_payout',
                atTick: world.tick,
                missionId: result.mission.id,
                icao: result.mission.destIcao,
                note: result.mission.contractPilot
                  ? `Contract pilot · ${result.mission.originIcao}→${result.mission.destIcao}`
                  : `${result.mission.originIcao}→${result.mission.destIcao}`,
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
              pilotIcao: missions.pilotIcao ?? missions.homeHubIcao ?? '',
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
            pilotIcao: settled.pilotIcao,
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
              weatherBonusUsd: settled.settlement.weatherBonusUsd,
              weatherOps: settled.mission.settledWeatherOps ?? null,
              runwayTouch: settled.mission.settledRunwayTouch ?? null,
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
        const airframeTypeId =
          mission.airframeTypeId?.trim() ||
          (mission.aircraftId
            ? findPlayerAircraft(missions, mission.aircraftId)?.airframeTypeId?.trim()
            : undefined);
        const loadPolicy = missionLoadPolicy({
          ...mission,
          ...(airframeTypeId ? { airframeTypeId } : {}),
        });
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
          // beginOfpLoadActive alone is not enough: a mid-tick sample can still
          // share the Host until stop completes and the exclusive gate drains.
          let stoppedPipe = false;
          if (watchSession.getStatus().running) {
            await watchSession.stop();
            stoppedPipe = true;
          }
          if (bushWatchSession.getStatus().running) {
            await bushWatchSession.stop();
            stoppedPipe = true;
          }
          if (stoppedPipe) {
            await new Promise((r) => setTimeout(r, 400));
          }
          const injectFleet = await withCareerRead(
            async (_world, missions) => missions.fleet ?? [],
          );
          const injectAcf = mission.aircraftId
            ? injectFleet.find((a) => a.id === mission.aircraftId)
            : undefined;
          const result = await applyMissionOfpLoad(mission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
            pipeName: body.pipeName,
            runPreflightAfter: body.runPreflightAfter,
            mxFuelBurnNote: mxFuelBurnProgressNote(injectAcf) ?? undefined,
          });
          let savedMission = mission;
          // A rolled-back inject left nothing on the stations — drop any ballast
          // from a previous pass so a later Validate does not expect it.
          const injectBallastLb =
            result.ok && result.ballastLb > 0
              ? Math.round(result.ballastLb)
              : undefined;
          let lastPreflightCheck:
            | NonNullable<MissionIntent['lastPreflightCheck']>
            | undefined;
          if (result.preflight) {
            const mxFinding = mxFuelBurnFindingForAircraft(injectAcf);
            const findings = mxFinding
              ? [
                  ...result.preflight.check.findings.filter(
                    (f) => f.code !== 'MX_FUEL_BURN',
                  ),
                  mxFinding,
                ]
              : result.preflight.check.findings;
            const summary = mxFinding
              ? `${result.preflight.check.summary} · ${mxFinding.message}`
              : result.preflight.check.summary;
            lastPreflightCheck = {
              verdict: result.preflight.check.verdict,
              summary,
              checkedAtIso: result.preflight.check.checkedAtIso,
              phase: result.preflight.check.phase,
              loadVerification: result.preflight.check.loadVerification,
              findings,
            };
          }
          {
            const wrote = await updateOpenMission(body.missionId, (_m, open) => {
              if (lastPreflightCheck) open.lastPreflightCheck = lastPreflightCheck;
              open.injectBallastLb = injectBallastLb;
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
          if (bushWatchSession.getStatus().running) {
            await bushWatchSession.stop();
          }
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
        const body = (await readBody(req).catch(() => ({}))) as {
          reset?: boolean;
        };
        const status = await watchSession.stop({
          reset: body.reset === true,
        });
        send(res, 200, status);
        return;
      }


      if (req.method === 'GET' && path === '/api/bush-watch/status') {
        send(res, 200, bushWatchSession.getStatus());
        return;
      }

      if (req.method === 'POST' && path === '/api/bush-hubs/homologate') {
        const body = (await readBody(req)) as {
          icao?: string;
          name?: string;
          lat?: number;
          lon?: number;
          source?: 'msfs_panel' | 'parked_sample' | 'msfs_facility';
          pipeName?: string;
        };
        if (!body.icao?.trim()) {
          send(res, 400, { error: 'icao required' });
          return;
        }
        try {
          const resolved = await resolveHomologateCoords({
            icao: body.icao,
            name: body.name,
            lat: body.lat,
            lon: body.lon,
            source: body.source,
            pipeName: body.pipeName,
          });
          const result = await withCareerWrite(async (world) =>
            homologateBushHub(careerRoot, world, resolved),
          );
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, 400, { error: message });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/bush-hubs/homologate-batch') {
        const body = (await readBody(req)) as {
          icaos?: string[];
          all?: boolean;
          bushOnly?: boolean;
          pipeName?: string;
        };
        try {
          const hasList = Array.isArray(body.icaos) && body.icaos.length > 0;
          const result = await homologateBushHubBatch(
            careerRoot,
            {
              icaos: body.icaos,
              all: hasList ? false : body.all !== false,
              bushOnly: body.bushOnly === true,
              pipeName: body.pipeName,
            },
            (fn) => withCareerWrite(fn),
          );
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, 400, { error: message });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/bush-watch/start') {
        const body = (await readBody(req)) as {
          intervalSec?: number;
          autoDepart?: boolean;
          autoSettle?: boolean;
          requireEnginesOff?: boolean;
          settleRadiusNm?: number;
          pipeName?: string;
        };
        if (isOfpLoadActive()) {
          send(res, 409, {
            error: 'OFP inject in progress — bush Watch start blocked',
            code: 'ofp_inject_active',
          });
          return;
        }
        try {
          const status = await bushWatchSession.start({
            intervalSec: body.intervalSec,
            autoDepart: body.autoDepart,
            autoSettle: body.autoSettle,
            requireEnginesOff: body.requireEnginesOff,
            settleRadiusNm: body.settleRadiusNm,
            pipeName: body.pipeName,
          });
          send(res, 200, status);
        } catch (error) {
          send(res, 503, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/bush-watch/stop') {
        const status = await bushWatchSession.stop();
        send(res, 200, status);
        return;
      }

      if (await tryServeStatic(req, res, path)) {
        return;
      }

      send(res, 404, { error: `No route ${req.method} ${path}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Select a career profile first/i.test(message)) {
        send(res, 409, { error: message, code: 'needs_profile' });
        return;
      }
      send(res, 500, { error: message });
    }
  });

  return {
    listen(): Promise<void> {
      return new Promise((resolveListen) => {
        server.listen(port, '127.0.0.1', () => {
          // Keep wall-clock economy moving while the API is up (~every minute).
          catchUpTimer = setInterval(() => {
            void (async () => {
              if (!store) return;
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
      await bushWatchSession.stop();
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
  try {
    await access(join(uiDist, 'index.html'));
    console.log(`Career UI (static) ${uiDist}`);
  } catch {
    console.log('Career UI static dist not found — API-only (use Vite in dev)');
  }
}
