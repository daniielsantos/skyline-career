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
  cancelOrphanPlayerMissions,
  cargoOpsIsUnlocked,
  unlockAllCareerCargoOps,
  unlockAllCareerClassOps,
  classOpsIsUnlocked,
  classOpsHidesBoardLot,
  CLASS_OPS_STARTER_IDS,
  LEASE_UNLOCK_CLEAN_DRY_SETTLES,
  dryCleanSettlesOk,
  aircraftLeaseUnlockProgress,
  aircraftLeaseUnlockProgressDevOpen,
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
  resolveMarketCountryId,
  dealerPoolCountryCounts,
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
  BUSH_TRIPS_BOARD_ENABLED,
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
  parseMarketBoardCrewFilter,
  parseMarketBoardSorts,
  parsePositiveNumberParam,
  boardFreightKgForEstimates,
  boardDisplayPayUsd,
  queryMarketBoardPage,
  quoteFuelUplift,
  quoteContractPilotFeeUsd,
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
  quoteAircraftRepositionForListing,
  quotePlayerMissionOfpFuel,
  reconcilePlayerInbound,
  replaceMissionManifest,
  resolveAircraftDeliveryIcao,
  routeDistanceNm,
  estimateMissionBlockHours,
  selectStarterHub,
  listAircraftForLease,
  listAircraftForSale,
  unlistAircraftForLease,
  sellPlayerAircraft,
  settleAircraftMarketOps,
  settleHangarParkingFees,
  settleFboOps,
  settleWarehouseStorageFees,
  settleWarehouseInboundTransfers,
  settlePortYardHoldFees,
  settleCompanyCredit,
  companyCreditSnapshot,
  buyFboTier1,
  upgradeFboToTier2,
  portSnapshot,
  buyPortListing,
  depositPortPickupToWarehouse,
  abandonPortPickup,
  buyWarehouseAtPickupHub,
  upgradeWarehouse,
  abandonWarehouseStock,
  playerWarehouseSnapshot,
  quoteWarehouseBuyUsd,
  ensureDemandOrders,
  demandSnapshot,
  acceptDemandOrder,
  replaceDemandMissionCargo,
  demandMissionEditableMaxKg,
  ensurePortListings,
  claimPortConcession,
  renewPortConcession,
  upgradePortConcession,
  tickPortConcessions,
  ensurePortInventoryRestock,
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
  settleGroundStaffDailyOps,
  groundStaffSnapshot,
  hireGroundStaffCandidate,
  fireGroundStaffMember,
  releaseCompanyCrewFromMission,
  drawCompanyCredit,
  repayCompanyCredit,
  assertCompanyCreditAllowsOps,
  executeSettleFlight,
  signAircraftLease,
  resolveHangarParkingUsdPerDay,
  applyWalletDelta,
  summarizeCareerLedger,
  LEDGER_KIND_LABEL,
  openCareerStore,
  applyMsfsBushHubOverrideToTerminal,
  pruneOrphanCareerHubs,
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
  effectiveFeeTickRange,
  buildOfflineFeeSummary,
  type OfflineFeeSummary,
  fuelBurnMultFromAircraft,
  padOfpBlockFuelKgForMx,
  bumpMissionOfpCheckSeq,
  isOfpCargoUnderOnlyFailure,
  missionOfpCheckSeq,
  trimMissionCargoToKg,
  airportByIcao,
  resolveAirportCoords,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type CareerStore,
  type CommodityId,
  type FreighterClassId,
  type MissionIntent,
  type PlayerAircraft,
} from '@msfs-compat/shared';
import {
  buildFlyableMissionDispatch,
  confirmMissionOfp,
  estimateFlyableRouteCargoLimit,
  resolveClassMaxCargoKg,
} from './dispatch-helpers.ts';
import {
  announceOfpLoadStarting,
  applyMissionOfpLoad,
  getLastProbeAircraftTitle,
  getOfpLoadProgress,
  isOfpLoadBusy,
  probeSimBridgeStatus,
  requestOfpLoadCancel,
} from './ofp-load-helpers.ts';
import { beginOfpLoadActive, endOfpLoadActive, isOfpLoadActive } from './ofp-load-state.ts';
import { preflightBlocksDepart, runMissionPreflight, lastPreflightFromInjectLive } from './preflight-helpers.ts';
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
  persistProfileMsfsBushHubOverrides,
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
  loadMaptilerEnvFiles,
  maptilerKeyFromEnv,
  maptilerSatelliteStyleUrl,
} from './maptiler-style.ts';
import {
  getRepoRoot,
  getUiDist,
  resolveCareerRoot,
} from './skyline-paths.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = getRepoRoot();
const uiDist = getUiDist();
loadMaptilerEnvFiles([
  repoRoot,
  process.cwd(),
  process.env.SKYLINE_CAREER_DATA?.trim(),
  join(repoRoot, 'profiles', 'career'),
]);
if (maptilerSatelliteStyleUrl()) {
  console.log('MapTiler satellite: enabled');
} else {
  console.log(
    'MapTiler satellite: MAPTILER_KEY missing — uncomment it in .env and restart Career API',
  );
}

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
/** One-shot banner after long wall-clock catch-up; cleared on /api/state. */
let pendingOfflineFeeSummary: OfflineFeeSummary | null = null;

await ensureCareerProfilesLayout(careerRoot);
await loadProfileMsfsBushHubOverrides(careerRoot);
await persistProfileMsfsBushHubOverrides(careerRoot);

async function stampMsfsOverridesOnStore(target: CareerStore): Promise<void> {
  const { world, dirty } = await target.loadEconomy({ maxCatchUpTicks: 0 });
  let stamped = 0;
  const pruned = pruneOrphanCareerHubs(world);
  for (const airport of world.airports) {
    if (applyMsfsBushHubOverrideToTerminal(airport)) stamped += 1;
  }
  if (dirty || stamped > 0 || pruned) {
    await target.saveEconomy(world);
    if (stamped > 0) {
      console.log(
        `[career] updated MSFS homolog coords for ${stamped} airport(s) in economy`,
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
  const demandEditMaxKg = normalized.demandOrderId
    ? demandMissionEditableMaxKg(missions, world, normalized)
    : undefined;
  return {
    ...base,
    ...(airframeLabel ? { airframeLabel } : {}),
    ...(distanceNm !== undefined ? { distanceNm } : {}),
    ...(demandEditMaxKg !== undefined ? { demandEditMaxKg } : {}),
  };
}

async function toClientMission(mission: MissionIntent) {
  return withCareerRead((world, missions) =>
    withMissionClientView(world, missions, mission),
  );
}

function blockReasonAnotherActiveFlight(
  missions: Pick<CareerMissionsState, 'fleet'>,
  mission: MissionIntent,
): string {
  const acf = mission.aircraftId
    ? findPlayerAircraft(missions, mission.aircraftId)
    : undefined;
  const route = `${mission.originIcao}→${mission.destIcao}`;
  const tail = acf?.label ?? 'another aircraft';
  return `Finish or cancel the ${route} flight on ${tail} before staging another`;
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
  req?: import('node:http').IncomingMessage,
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
    leaseUnlock: req
      ? leaseUnlockForRequest(req, missions)
      : aircraftLeaseUnlockProgress(missions),
    classOps: req
      ? classOpsForRequest(req, missions.classOps) ?? null
      : missions.classOps ?? null,
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

function applyConfirmedOfpCheck(
  mission: MissionIntent,
  ofpCheck: NonNullable<MissionIntent['lastOfpCheck']>,
): void {
  bumpMissionOfpCheckSeq(mission);
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
}

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
 * World (stock, lots, inbound) then company (missions, wallet, fleet).
 * Non-reentrant — use *Unlocked helpers while holding. Never take world
 * while holding company.
 */
const worldLock = createPromiseLock();
const companyLock = createPromiseLock();

function withWorldThenCompany<T>(fn: () => Promise<T> | T): Promise<T> {
  return worldLock.withLock(() => companyLock.withLock(fn));
}

function withCareerLock<T>(fn: () => Promise<T> | T): Promise<T> {
  return withWorldThenCompany(fn);
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
  return companyLock.withLock(async () => {
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

async function loadEconomyUnlocked(opts?: {
  skipCatchUp?: boolean;
}): Promise<CareerEconomyWorld> {
  const activeStore = requireStore();
  const { world: caught, advancedTicks, dirty } = await activeStore.loadEconomy(
    opts?.skipCatchUp ? { maxCatchUpTicks: 0 } : undefined,
  );
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
    const rawFrom = caught.tick - advancedTicks;
    const feeRange = effectiveFeeTickRange(rawFrom, caught.tick);
    const leaseOps = settleAircraftMarketOps(missions, caught.tick, caught, {
      maxInstallments: feeRange.capped ? 1 : undefined,
      deferTermRepossess: feeRange.capped,
    });
    const hangarOps = settleHangarParkingFees(missions, caught, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    const fboOps = settleFboOps(missions, caught, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    const whOps = settleWarehouseStorageFees(missions, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    settleWarehouseInboundTransfers(missions, caught);
    const yardOps = settlePortYardHoldFees(missions, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    tickPortConcessions(missions, caught);
    ensurePortInventoryRestock(caught);
    ensurePortListings(caught);
    ensureDemandOrders(caught);
    const crewDaily = settleCrewDailyOps(missions, caught, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    const groundStaffDaily = settleGroundStaffDailyOps(missions, caught, {
      fromTick: feeRange.fromTick,
      toTick: feeRange.toTick,
    });
    settleCrewOpsDue(missions, caught, Date.now());
    listAircraftMarket(missions, caught);

    const passiveDebitUsd =
      hangarOps.debitUsd +
      (fboOps.storage?.debitUsd ?? 0) +
      whOps.debitUsd +
      yardOps.debitUsd +
      (crewDaily.salary?.debitUsd ?? 0) +
      (groundStaffDaily.salary?.debitUsd ?? 0);
    const summary = buildOfflineFeeSummary({
      feeRange,
      passiveDebitUsd,
      debitUsdByKind: {
        hangar: hangarOps.debitUsd,
        warehouse: whOps.debitUsd,
        yard: yardOps.debitUsd,
        fboStorage: fboOps.storage?.debitUsd ?? 0,
        crewSalary: crewDaily.salary?.debitUsd ?? 0,
        groundStaffSalary: groundStaffDaily.salary?.debitUsd ?? 0,
      },
      lease: {
        installmentsPaid: leaseOps.installmentsPaid,
        overdueIds: leaseOps.overdueIds,
        termEndedSoftIds: leaseOps.termEndedSoft,
        repossessedIds: leaseOps.repossessed,
      },
    });
    if (summary) pendingOfflineFeeSummary = summary;

    await saveMissions(missions);
    await persistEconomyUnlocked(caught);
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
 * Load world + missions under one lock. Button/GET paths skip hourly catch-up;
 * the 60s timer and POST /api/tick advance the world.
 */
async function withCareerRead<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
): Promise<T> {
  return withCareerLock(async () => {
    const world = await loadEconomyUnlocked({ skipCatchUp: true });
    const missions = await loadMissions();
    const crew = settleCrewOpsDue(missions, world, Date.now());
    if (crew.settled.length > 0) {
      await saveMissions(missions);
    }
    return fn(world, missions);
  });
}

type CareerWriteOpts = {
  housekeeping?: boolean;
  /** Default false — only the timer / POST /api/tick should pass true. */
  catchUp?: boolean;
  /** Skip saveEconomy when the handler only mutates company/missions. */
  persist?: 'economy' | 'company' | 'blob' | 'portMarket' | 'demandBoard' | 'inbound';
  persistDemandOrderId?: string;
  persistPortListingId?: string;
  persistPortConcessions?: boolean;
  commandSliceMissionId?: string;
  commandSliceLotIds?: string[];
  commandSliceIcaos?: string[];
  commandSliceAircraftId?: string;
};

/**
 * Load, mutate, and persist. Default: no hourly tick, full economy save.
 * `persist: 'company'` writes missions only (plus optional demand/listing/concession
 * upserts). `persist: 'blob'` writes dealer pool JSON without live tables.
 * `persist: 'portMarket'` rewrites port listings+inventory only (GET /api/ports seed).
 * `persist: 'demandBoard'` rewrites demand_orders only. `persist: 'inbound'` patches inbound_pending.
 */
async function withCareerWrite<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
  opts?: CareerWriteOpts,
): Promise<T> {
  return withCareerLock(async () => {
    const activeStore = requireStore();
    const missions = await loadMissions();
    const skipCatchUp = opts?.catchUp !== true;
    const persistCompany = opts?.persist === 'company';
    const persistBlob = opts?.persist === 'blob';
    const persistPortMarket = opts?.persist === 'portMarket';
    const persistDemandBoard = opts?.persist === 'demandBoard';
    const persistInbound = opts?.persist === 'inbound';
    const demandOrderId = opts?.persistDemandOrderId?.trim();
    const portListingId = opts?.persistPortListingId?.trim();
    const persistPortConcessions = opts?.persistPortConcessions === true;
    const sliceId = opts?.commandSliceMissionId?.trim();
    const sliceLotIdsOpt = (opts?.commandSliceLotIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean);
    const acfId = opts?.commandSliceAircraftId?.trim();
    if (acfId) {
      const acf = missions.fleet.find((a) => a.id === acfId);
      const loc = acf?.locationIcao?.trim().toUpperCase();
      if (loc) {
        opts = {
          ...opts,
          commandSliceIcaos: [...(opts?.commandSliceIcaos ?? []), loc],
        };
      }
    }
    const sliceIcaosOpt = [
      ...new Set(
        (opts?.commandSliceIcaos ?? [])
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    let world: CareerEconomyWorld | undefined;
    let useCommandPersist = false;
    let sliceLotIds: string[] = [...sliceLotIdsOpt];
    let sliceIcaos: string[] = [];
    let sliceMissionId = sliceId ?? '';
    if (skipCatchUp && sliceId) {
      const mission = missions.missions.find((m) => m.id === sliceId);
      if (mission) {
        sliceIcaos = [
          ...new Set(
            [mission.originIcao, mission.destIcao]
              .map((c) => c.trim().toUpperCase())
              .filter(Boolean),
          ),
        ];
        sliceLotIds = [
          ...new Set([
            ...sliceLotIds,
            ...mission.lots
              .map((lot) => lot.shipmentLotId)
              .filter((id): id is string => Boolean(id)),
          ]),
        ];
        useCommandPersist = sliceIcaos.length > 0;
        if (!activeStore.peekEconomyWorld()) {
          const slice = activeStore.loadCommandWorldSlice({
            icaos: sliceIcaos,
            lotIds: sliceLotIds,
            missionId: sliceId,
          });
          const hasAllHubs =
            slice &&
            sliceIcaos.every((icao) =>
              slice.airports.some((ap) => ap.icao === icao),
            );
          if (slice && hasAllHubs) world = slice;
        }
      }
    } else if (skipCatchUp && sliceLotIdsOpt.length > 0 && !activeStore.peekEconomyWorld()) {
      const slice = activeStore.loadCommandWorldSlice({
        icaos: [],
        lotIds: sliceLotIdsOpt,
        missionId: sliceMissionId,
      });
      if (slice && slice.airports.length > 0) {
        world = slice;
        sliceIcaos = slice.airports.map((ap) => ap.icao);
        useCommandPersist = true;
      }
    } else if (
      skipCatchUp &&
      sliceIcaosOpt.length > 0 &&
      !activeStore.peekEconomyWorld()
    ) {
      const slice = activeStore.loadCommandWorldSlice({
        icaos: sliceIcaosOpt,
        lotIds: sliceLotIdsOpt,
        missionId: sliceMissionId,
      });
      const hasAllHubs =
        slice &&
        sliceIcaosOpt.every((icao) =>
          slice.airports.some((ap) => ap.icao === icao),
        );
      if (slice && hasAllHubs) {
        world = slice;
        sliceIcaos = sliceIcaosOpt;
        useCommandPersist = true;
      }
    }
    if (!world) {
      world = await loadEconomyUnlocked({ skipCatchUp });
    }
    if (sliceLotIdsOpt.length > 0 && !useCommandPersist) {
      for (const id of sliceLotIdsOpt) {
        const lot = world.lots.find((row) => row.id === id);
        if (!lot) continue;
        sliceIcaos.push(lot.originIcao, lot.destIcao);
        sliceLotIds.push(lot.id);
      }
      sliceIcaos = [...new Set(sliceIcaos.map((c) => c.trim().toUpperCase()).filter(Boolean))];
      sliceLotIds = [...new Set(sliceLotIds)];
      useCommandPersist = sliceIcaos.length > 0;
    }
    if (sliceIcaosOpt.length > 0) {
      sliceIcaos = [...new Set([...sliceIcaos, ...sliceIcaosOpt])];
      useCommandPersist = true;
    }
    const housekeeping =
      persistCompany ||
      persistBlob ||
      persistPortMarket ||
      persistDemandBoard ||
      persistInbound
        ? false
        : opts?.housekeeping !== false;
    if (housekeeping) {
      settleCrewOpsDue(missions, world, Date.now());
      cancelOrphanPlayerMissions(world, missions);
    }
    const result = await fn(world, missions);
    if (!sliceMissionId && sliceLotIds.length > 0) {
      const found = missions.missions.find((m) =>
        m.lots.some((line) => sliceLotIds.includes(line.shipmentLotId)),
      );
      if (found) sliceMissionId = found.id;
    }
    if (persistCompany) {
      if (demandOrderId) {
        const order = world.demandOrders?.find((o) => o.id === demandOrderId);
        if (order) await activeStore.persistDemandOrder(order);
      }
      if (portListingId) {
        const listing = world.portListings?.find((l) => l.id === portListingId);
        if (listing) await activeStore.persistPortListing(listing);
      }
      if (persistPortConcessions) {
        await activeStore.persistPortConcessionIndex(world.portConcessions ?? []);
      }
      await saveMissions(missions);
      return result;
    }
    if (persistBlob) {
      await activeStore.saveEconomy(world, { liveTables: false });
      await saveMissions(missions);
      return result;
    }
    if (persistPortMarket) {
      await activeStore.persistPortMarketTables(world);
      return result;
    }
    if (persistDemandBoard) {
      await activeStore.persistDemandBoardTables(world);
      return result;
    }
    if (persistInbound) {
      await activeStore.persistInboundPending(world);
      return result;
    }
    if (useCommandPersist) {
      await activeStore.persistCommandWorldSlice(world, {
        missionId: sliceMissionId,
        lotIds: sliceLotIds,
        icaos: sliceIcaos,
      });
    } else {
      await persistEconomyUnlocked(world);
    }
    await saveMissions(missions);
    return result;
  });
}

function requestDevMode(req: import('node:http').IncomingMessage): boolean {
  const raw = req.headers['x-skyline-dev-mode'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

/** Gate copy of cargo ops — unlocked in Dev Mode, not written back to save. */
function cargoOpsForRequest(
  req: import('node:http').IncomingMessage,
  ops: CareerMissionsState['cargoOps'],
): CareerMissionsState['cargoOps'] {
  if (!requestDevMode(req)) return ops;
  return unlockAllCareerCargoOps(ops ?? undefined);
}

/** Gate copy of class ops — unlocked in Dev Mode, not written back to save. */
function classOpsForRequest(
  req: import('node:http').IncomingMessage,
  ops: CareerMissionsState['classOps'],
): CareerMissionsState['classOps'] {
  if (!requestDevMode(req)) return ops;
  return unlockAllCareerClassOps(ops ?? undefined);
}

function leaseUnlockForRequest(
  req: import('node:http').IncomingMessage,
  missions: Pick<CareerMissionsState, 'cargoOps'>,
) {
  if (!requestDevMode(req)) return aircraftLeaseUnlockProgress(missions);
  return aircraftLeaseUnlockProgressDevOpen(missions);
}

/**
 * Temporarily unlock cargo + class ladders (and Dry settles for lease gate)
 * for a write. Restores only fields the callback did not replace.
 */
function withDevProgressionUnlock<T>(
  req: import('node:http').IncomingMessage,
  missions: CareerMissionsState,
  fn: () => T,
): T {
  if (!requestDevMode(req)) return fn();
  const savedCargo = missions.cargoOps;
  const savedClass = missions.classOps;
  const cargoGate = unlockAllCareerCargoOps(savedCargo ?? undefined);
  const have = dryCleanSettlesOk(cargoGate);
  if (have < LEASE_UNLOCK_CLEAN_DRY_SETTLES) {
    cargoGate.commodities.supplies.settlesOk +=
      LEASE_UNLOCK_CLEAN_DRY_SETTLES - have;
  }
  const classGate = unlockAllCareerClassOps(savedClass ?? undefined);
  missions.cargoOps = cargoGate;
  missions.classOps = classGate;
  try {
    return fn();
  } finally {
    if (missions.cargoOps === cargoGate) missions.cargoOps = savedCargo;
    if (missions.classOps === classGate) missions.classOps = savedClass;
  }
}

/** @deprecated alias — prefer withDevProgressionUnlock */
function withDevCargoOpsUnlock<T>(
  req: import('node:http').IncomingMessage,
  missions: CareerMissionsState,
  fn: () => T,
): T {
  return withDevProgressionUnlock(req, missions, fn);
}

function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Skyline-Dev-Mode',
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

function clockPayloadFromMeta(
  meta: { tick: number; lastBatchAtMs: number },
  nowMs: number,
) {
  const anchor =
    typeof meta.lastBatchAtMs === 'number' && Number.isFinite(meta.lastBatchAtMs)
      ? meta.lastBatchAtMs
      : nowMs;
  const frac = Math.max(0, nowMs - anchor) / MS_PER_TICK;
  return {
    serverNowMs: nowMs,
    lastBatchAtMs: meta.lastBatchAtMs,
    lastSyncedAtMs: meta.lastBatchAtMs,
    tick: meta.tick,
    continuousHours: meta.tick + frac,
    msPerTick: MS_PER_TICK,
    fuelHaulsEnroute: 0,
  };
}

function mapAirportCommodities(
  airport: CareerEconomyWorld['airports'][number],
) {
  return CAREER_COMMODITIES.map((c) => {
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
}

function mapAirportTerminalChrome(
  airport: CareerEconomyWorld['airports'][number],
) {
  const stamped = {
    icao: airport.icao,
    name: airport.name,
    lat: airport.lat,
    lon: airport.lon,
  };
  applyMsfsBushHubOverrideToTerminal(stamped);
  const levelInfo = hubLevelXpProgress(airport);
  const levelProfile = hubLevelProfile(levelInfo.level);
  return {
    airport: {
      icao: airport.icao,
      name: stamped.name,
      region: airport.region,
      level: levelInfo.level,
      hubTier: hubTierOf(airport),
      bush: Boolean(airport.bush) || isBushHub(airport.icao),
      bushTripOnly: Boolean(airport.bushTripOnly) || isBushTripOnlyHub(airport.icao),
      lat: stamped.lat,
      lon: stamped.lon,
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
  };
}

function mapAirportStockPayload(
  snap: NonNullable<ReturnType<CareerStore['readAirportInventory']>>,
  nowMs: number,
) {
  const commodities = mapAirportCommodities(snap.airport);
  const totalStockKg = commodities.reduce((sum, c) => sum + c.stockKg, 0);
  return {
    ...clockPayloadFromMeta(snap.meta, nowMs),
    ...mapAirportTerminalChrome(snap.airport),
    events: [],
    totalStockKg,
    totalStockTonnes: totalStockKg / 1000,
    commodities,
    outboundLots: [],
    inboundLots: [],
    arrivals: [],
    departures: [],
    npcActivity: [],
    fuelInbound: [],
    fuelRecent: [],
    playerFbos: null,
    homeHubIcao: null,
    runways: getAirportRunways(snap.airport.icao),
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

function overlayAirportBoard(
  cached: CareerEconomyWorld,
  board: ReturnType<CareerStore['readAirportBoard']>,
  airport: CareerEconomyWorld['airports'][number],
): CareerEconomyWorld {
  if (!board) return cached;
  const byIcao = new Map(cached.airports.map((a) => [a.icao, a]));
  byIcao.set(airport.icao, airport);
  for (const ap of board.relatedAirports) byIcao.set(ap.icao, ap);
  return {
    ...cached,
    tick: board.meta.tick || cached.tick,
    lastBatchAtMs: board.meta.lastBatchAtMs || cached.lastBatchAtMs,
    airports: [...byIcao.values()],
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
      if (req.method === 'GET' && path === '/api/map/satellite-style') {
        const apiKey = maptilerKeyFromEnv();
        send(res, 200, {
          apiKey,
          styleUrl: maptilerSatelliteStyleUrl(),
        });
        return;
      }

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
        const id = profileDeleteMatch[1]!;
        try {
          if (activeProfileId === id) {
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
            });
          }
          const file = await deleteCareerProfile(careerRoot, id);
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
          const offlineFeeSummary = pendingOfflineFeeSummary;
          pendingOfflineFeeSummary = null;
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
            ...fleetPayload(missions, world, req),
            cashflow: summarizeCareerLedger(missions, world.tick),
            cargoOps: cargoOpsForRequest(req, missions.cargoOps) ?? null,
            playerFbos: playerFboSnapshot(missions, world),
            companyCrew: companyCrewSnapshot(missions, world),
            groundStaff: groundStaffSnapshot(missions, world),
            homeCountryId: world.homeCountryId ?? null,
            countries: listWorldCountryIds(world),
            internationalLaneCount: world.internationalLanes?.length ?? 0,
            store: store!.kind,
            ...(offlineFeeSummary ? { offlineFeeSummary } : {}),
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
          }, { persist: 'company' });
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
          }, { persist: 'company' });
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
        const browseRaw = url.searchParams.get('country')?.trim().toUpperCase();
        const payload = await withCareerWrite((world, missions) => {
          settleAircraftMarketOps(missions, world.tick, world);
          const homeCountryId = resolveMarketCountryId(world, missions);
          const browseCountryId =
            browseRaw === 'WORLD'
              ? 'WORLD'
              : browseRaw && /^[A-Z]{2}$/.test(browseRaw)
                ? browseRaw
                : homeCountryId;
          const listings = listAircraftMarket(missions, world, {
            browseCountryId,
          });
          const acquireEnabled = browseCountryId === homeCountryId;
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
            homeCountryId,
            browseCountryId,
            acquireEnabled,
            poolCountries: dealerPoolCountryCounts(world, world.tick),
            deliveryTargetIcao: resolveAircraftDeliveryIcao(missions),
            deliveryQuotes: Object.fromEntries(
              listings.map((listing) => {
                try {
                  const q = quoteAircraftRepositionForListing(
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
                      crossBorder: q.crossBorder === true,
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
            leaseUnlock: leaseUnlockForRequest(req, missions),
          };
        }, { persist: 'blob' });
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
            return withDevProgressionUnlock(req, missions, () => {
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
          }, { persist: 'blob' });
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
            return withDevProgressionUnlock(req, missions, () => {
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
                leaseUnlock: leaseUnlockForRequest(req, missions),
              };
            });
          }, { persist: 'blob' });
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
              world,
            );
            return {
              walletUsd: missions.walletUsd,
              creditUsd: sold.creditUsd,
              restockId: sold.restockId,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          }, { persist: 'blob' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/list-sale') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          askingUsd?: number;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const listed = listAircraftForSale(
              missions,
              body.aircraftId!,
              world.tick,
              Number(body.askingUsd),
            );
            return {
              walletUsd: missions.walletUsd,
              listing: listed.listing,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          }, { persist: 'company' });
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
          monthlyUsd?: number;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const listed = listAircraftForLease(
              missions,
              body.aircraftId!,
              world.tick,
              {
                termMonths: body.termMonths,
                monthlyUsd: body.monthlyUsd,
              },
            );
            return {
              walletUsd: missions.walletUsd,
              listing: listed.listing,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          }, { persist: 'company' });
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
          }, { persist: 'company' });
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
          }, { commandSliceAircraftId: body.aircraftId });
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
          }, { commandSliceAircraftId: body.aircraftId });
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
          }, { persist: 'company' });
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
              world,
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: returned.debitUsd,
              returnFerryUsd: returned.returnFerryUsd,
              remainingMonths: returned.remainingMonths,
              fleet: withParkingRates(missions.fleet, world, missions),
            };
          }, { persist: 'blob' });
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
          }, {
            commandSliceAircraftId: body.aircraftId,
            commandSliceIcaos: [body.destIcao],
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
          }, { persist: 'company' });
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
          }, { persist: 'company' });
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
            ? estimateFlyableRouteCargoLimit(
                aircraft,
                distanceNm,
                cargoLimit.maxCargoKg,
                cargoLimit,
              )
            : undefined;
        const routeLimitMx =
          routeLimit && mxBurn && mxBurn.mult > 1.001
            ? estimateFlyableRouteCargoLimit(
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
              cargoOps: cargoOpsForRequest(req, missions.cargoOps),
              classOps: classOpsForRequest(req, missions.classOps),
              missionsState: missions,
            };
          },
          { persist: 'inbound' },
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
        ).filter((row) => {
          // Always hide crew offers on a class the player has not unlocked.
          if (row.npcClaim?.crewNeeded) {
            const crewClassId = row.npcClaim.aircraftClassId;
            if (
              crewClassId &&
              !classOpsIsUnlocked(classOps, crewClassId)
            ) {
              return false;
            }
          }
          // Size hide only for empty-hangar starter browsing (Gross / no fleet).
          // Own fleet + Gross pay → full market; Viable/estimate uses the
          // selected airframe when the client passes aircraft=.
          if (hangarEmpty) {
            return !classOpsHidesBoardLot(classOps, {
              availableKg: row.availableKg,
              crewNeeded: row.npcClaim?.crewNeeded,
              claimCargoKg: row.npcClaim?.cargoKg,
              crewClassId: row.npcClaim?.aircraftClassId,
            });
          }
          return true;
        });
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
            ...(row.npcClaim?.crewReposition ? { crewReposition: true } : {}),
            ...(row.npcClaim?.crewNeeded &&
            typeof row.npcClaim.pilotFeeUsd === 'number'
              ? { pilotFeeUsd: row.npcClaim.pilotFeeUsd }
              : {}),
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
          loadMinKg: parsePositiveNumberParam(url.searchParams.get('loadMinKg')),
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
          crewFilter: parseMarketBoardCrewFilter(url.searchParams.get('crew')),
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
        const nowMs = Date.now();
        if (url.searchParams.get('part') === 'stock') {
          const snap = requireStore().readAirportInventory(icao);
          if (!snap) {
            send(res, 404, { error: `Unknown airport ${icao}` });
            return;
          }
          send(res, 200, mapAirportStockPayload(snap, nowMs));
          return;
        }
        const loaded = await withCareerLock(async () => {
          const active = requireStore();
          if (!active.peekEconomyWorld()) {
            await loadEconomyUnlocked();
          }
          const missions = await loadMissions();
          const cached = active.peekEconomyWorld();
          if (!cached) return null;
          const board = active.readAirportBoard(icao);
          const airport =
            board?.airport ?? cached.airports.find((a) => a.icao === icao);
          if (!airport) return { missing: true as const };
          return {
            world: overlayAirportBoard(cached, board, airport),
            missions,
            airport,
            boardLots: board?.lots,
          };
        });
        if (!loaded || 'missing' in loaded) {
          send(res, 404, { error: `Unknown airport ${icao}` });
          return;
        }
        const { world, missions, airport, boardLots } = loaded;
        const commodities = mapAirportCommodities(airport);

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
        const relatedLots = (boardLots ?? world.lots)
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
        const chrome = mapAirportTerminalChrome(airport);

        send(res, 200, {
          ...clockPayload(world, nowMs),
          ...chrome,
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
          }, { persist: 'company' });
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
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/spot/buy') {
        send(res, 410, {
          error:
            'FBO spot trading removed — use Warehouses at port pickup hubs and the Demand Board',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/spot/sell') {
        send(res, 410, {
          error:
            'FBO spot trading removed — use Warehouses at port pickup hubs and the Demand Board',
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/ports') {
        try {
          // ensurePortListings may expire/refill; persist those tables only so
          // buy can find the same listing IDs after reload.
          const result = await withCareerWrite(
            (world, missions) => ({
              ...portSnapshot(world, missions),
              groundStaff: groundStaffSnapshot(missions, world),
            }),
            { persist: 'portMarket' },
          );
          send(res, 200, result);
        } catch (error) {
          send(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/buy') {
        const body = (await readBody(req)) as {
          listingId?: string;
          kg?: number;
        };
        if (!body.listingId || body.kg == null) {
          send(res, 400, { error: 'listingId and kg required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () => {
              const bought = buyPortListing(missions, world, {
                listingId: body.listingId!,
                kg: Number(body.kg),
              });
              return {
                walletUsd: missions.walletUsd,
                debitUsd: bought.debitUsd,
                unitPriceUsd: bought.unitPriceUsd,
                kg: bought.kg,
                storedKg: bought.storedKg,
                inboundKg: bought.inboundKg,
                yardKg: bought.yardKg,
                transferTicks: bought.transferTicks,
                readyAtTick: bought.readyAtTick,
                pickup: bought.pickup,
                inboundTransfer: bought.inboundTransfer,
                warehousePile: bought.warehousePile,
                ports: portSnapshot(world, missions),
                warehouses: playerWarehouseSnapshot(missions, world),
              };
            });
          }, {
            persist: 'company',
            persistPortListingId: body.listingId,
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/concession/claim') {
        const body = (await readBody(req)) as { portId?: string };
        if (!body.portId) {
          send(res, 400, { error: 'portId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const concession = claimPortConcession(missions, world, {
              portId: body.portId!,
            });
            return {
              walletUsd: missions.walletUsd,
              concession,
              ports: portSnapshot(world, missions),
            };
          }, { persist: 'company', persistPortConcessions: true });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/concession/renew') {
        const body = (await readBody(req)) as { portId?: string; days?: number };
        if (!body.portId) {
          send(res, 400, { error: 'portId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const concession = renewPortConcession(missions, world, {
              portId: body.portId!,
              days: body.days != null ? Number(body.days) : undefined,
            });
            return {
              walletUsd: missions.walletUsd,
              concession,
              ports: portSnapshot(world, missions),
            };
          }, { persist: 'company', persistPortConcessions: true });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/concession/upgrade') {
        const body = (await readBody(req)) as { portId?: string };
        if (!body.portId) {
          send(res, 400, { error: 'portId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const concession = upgradePortConcession(missions, world, {
              portId: body.portId!,
            });
            return {
              walletUsd: missions.walletUsd,
              concession,
              ports: portSnapshot(world, missions),
            };
          }, { persist: 'company', persistPortConcessions: true });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/deposit') {
        const body = (await readBody(req)) as { pickupId?: string; kg?: number };
        if (!body.pickupId) {
          send(res, 400, { error: 'pickupId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const deposited = depositPortPickupToWarehouse(missions, world, {
              pickupId: body.pickupId!,
              kg: body.kg != null ? Number(body.kg) : undefined,
            });
            return {
              walletUsd: missions.walletUsd,
              kg: deposited.kg,
              hubIcao: deposited.hubIcao,
              remainingYardKg: deposited.remainingYardKg,
              pile: deposited.pile,
              ports: portSnapshot(world, missions),
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/pickup/abandon') {
        const body = (await readBody(req)) as { pickupId?: string };
        if (!body.pickupId) {
          send(res, 400, { error: 'pickupId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const abandoned = abandonPortPickup(missions, {
              pickupId: body.pickupId!,
            });
            return {
              walletUsd: missions.walletUsd,
              kg: abandoned.kg,
              hubIcao: abandoned.hubIcao,
              commodityId: abandoned.commodityId,
              ports: portSnapshot(world, missions),
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/stage') {
        send(res, 410, {
          error:
            'Fly to FBO for spot removed — store in Warehouse and accept a Demand Board order',
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/warehouses') {
        try {
          const result = await withCareerRead((world, missions) => ({
            ...playerWarehouseSnapshot(missions, world),
            groundStaff: groundStaffSnapshot(missions, world),
          }));
          send(res, 200, result);
        } catch (error) {
          send(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/buy') {
        const body = (await readBody(req)) as { icao?: string };
        if (!body.icao) {
          send(res, 400, { error: 'icao required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const bought = buyWarehouseAtPickupHub(missions, world, body.icao!);
            return {
              walletUsd: missions.walletUsd,
              debitUsd: bought.debitUsd,
              warehouse: bought.warehouse,
              quoteUsd: quoteWarehouseBuyUsd(world, body.icao!),
              warehouses: playerWarehouseSnapshot(missions, world),
              ports: portSnapshot(world, missions),
            };
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/upgrade') {
        const body = (await readBody(req)) as { warehouseId?: string };
        if (!body.warehouseId) {
          send(res, 400, { error: 'warehouseId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const upgraded = upgradeWarehouse(
              missions,
              world,
              body.warehouseId!,
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: upgraded.debitUsd,
              warehouse: upgraded.warehouse,
              warehouses: playerWarehouseSnapshot(missions, world),
              ports: portSnapshot(world, missions),
            };
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/stock/abandon') {
        const body = (await readBody(req)) as { stockId?: string };
        if (!body.stockId) {
          send(res, 400, { error: 'stockId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const abandoned = abandonWarehouseStock(missions, {
              stockId: body.stockId!,
            });
            return {
              walletUsd: missions.walletUsd,
              kg: abandoned.kg,
              hubIcao: abandoned.hubIcao,
              commodityId: abandoned.commodityId,
              warehouseId: abandoned.warehouseId,
              warehouses: playerWarehouseSnapshot(missions, world),
              ports: portSnapshot(world, missions),
            };
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/demand') {
        try {
          const result = await withCareerWrite((world, missions) => {
            ensureDemandOrders(world);
            const warehouses = playerWarehouseSnapshot(missions, world);
            return {
              ...demandSnapshot(world, {
                warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
              }),
              warehouses,
            };
          }, { persist: 'demandBoard' });
          send(res, 200, result);
        } catch (error) {
          send(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/demand/accept') {
        const body = (await readBody(req)) as {
          orderId?: string;
          originIcao?: string;
          aircraftId?: string;
          kg?: number;
        };
        if (!body.orderId || !body.originIcao || !body.aircraftId) {
          send(res, 400, {
            error: 'orderId, originIcao and aircraftId required',
          });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () => {
              const accepted = acceptDemandOrder(missions, world, {
                orderId: body.orderId!,
                originIcao: body.originIcao!,
                aircraftId: body.aircraftId!,
                kg: body.kg != null ? Number(body.kg) : undefined,
              });
              return {
                walletUsd: missions.walletUsd,
                mission: withMissionClientView(world, missions, accepted.mission),
                order: accepted.order,
                kg: accepted.kg,
                payUsd: accepted.payUsd,
                warehouses: playerWarehouseSnapshot(missions, world),
                demand: demandSnapshot(world, {
                  warehouseIcaos: (missions.playerWarehouses?.warehouses ?? []).map(
                    (w) => w.icao,
                  ),
                }),
                fleet: missions.fleet,
                missions: missions.missions.map((m) =>
                  withMissionClientView(world, missions, m),
                ),
              };
            });
          }, {
            persist: 'company',
            persistDemandOrderId: body.orderId,
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
            return withDevCargoOpsUnlock(req, missions, () => {
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
          }, { persist: 'company' });
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
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ground-staff/hire') {
        const body = (await readBody(req)) as {
          warehouseId?: string;
          candidateId?: string;
        };
        if (!body.warehouseId?.trim() || !body.candidateId?.trim()) {
          send(res, 400, { error: 'warehouseId and candidateId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const hired = hireGroundStaffCandidate(missions, world, {
              warehouseId: body.warehouseId!.trim(),
              candidateId: body.candidateId!.trim(),
            });
            const groundStaff = groundStaffSnapshot(missions, world);
            return {
              member: hired.member,
              debitUsd: hired.debitUsd,
              walletUsd: missions.walletUsd,
              groundStaff,
              warehouses: playerWarehouseSnapshot(missions, world),
              ports: {
                ...portSnapshot(world, missions),
                groundStaff,
              },
            };
          }, { persist: 'company' });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ground-staff/fire') {
        const body = (await readBody(req)) as { memberId?: string };
        if (!body.memberId?.trim()) {
          send(res, 400, { error: 'memberId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const fired = fireGroundStaffMember(
              missions,
              world,
              body.memberId!.trim(),
            );
            const groundStaff = groundStaffSnapshot(missions, world);
            return {
              member: fired.member,
              debitUsd: fired.debitUsd,
              walletUsd: missions.walletUsd,
              groundStaff,
              warehouses: playerWarehouseSnapshot(missions, world),
              ports: {
                ...portSnapshot(world, missions),
                groundStaff,
              },
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
          settleWarehouseStorageFees(missions, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          settleWarehouseInboundTransfers(missions, world);
          settlePortYardHoldFees(missions, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          tickPortConcessions(missions, world);
          ensurePortInventoryRestock(world);
          ensurePortListings(world);
          ensureDemandOrders(world);
          const crewDaily = settleCrewDailyOps(missions, world, {
            fromTick: world.tick - n,
            toTick: world.tick,
          });
          const groundStaffDaily = settleGroundStaffDailyOps(missions, world, {
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
            groundStaffSalaryDebitUsd: groundStaffDaily.salary.debitUsd,
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
        }, { catchUp: true });
        send(res, 200, payload);
        return;
      }

      // Temporary test aid — remove before release.
      if (req.method === 'POST' && path === '/api/debug/credit-wallet') {
        const body = (await readBody(req)) as { amountUsd?: number };
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? Math.round(body.amountUsd * 100) / 100
            : 1_000_000;
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
              cargoOps: cargoOpsForRequest(req, missions.cargoOps),
              classOps: classOpsForRequest(req, missions.classOps),
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
          }, { commandSliceLotIds: [body.lotId] });
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
              !classOpsIsUnlocked(
                classOpsForRequest(req, missions.classOps),
                flight.aircraftClassId,
              )
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
                  quoteContractPilotFeeUsd(flight.payUsd),
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
          if (body.openDispatch === true) {
            try {
              const distanceNm =
                (await withCareerRead((world) =>
                  routeDistanceNm(
                    world,
                    mission.originIcao,
                    mission.destIcao,
                  ),
                )) ??
                mission.distanceNm ??
                0;
              const { built, flyable } = await buildFlyableMissionDispatch(
                mission,
                distanceNm,
                { liveTitle: getLastProbeAircraftTitle() },
              );
              mission = await withCareerWrite((world, missions) => {
                const idx = missions.missions.findIndex((m) => m.id === mission.id);
                let next = mission;
                if (flyable.cargoKg < mission.cargoKg) {
                  next = trimMissionCargoToKg(
                    world,
                    mission,
                    flyable.cargoKg,
                  ).mission;
                }
                const dispatched: MissionIntent = {
                  ...next,
                  staticId: built.staticId,
                  status: 'dispatched',
                  dispatchedAtTick: world.tick,
                  ofpCheckSeq: missionOfpCheckSeq(next) + 1,
                  lastOfpCheck: undefined,
                  lastPreflightCheck: undefined,
                  injectBallastLb: undefined,
                  fuelAuthorizedOfpId: undefined,
                };
                if (idx >= 0) missions.missions[idx] = dispatched;
                else missions.missions.push(dispatched);
                return dispatched;
              });
              // UI opens the URL once (Electron IPC / window.open).
              dispatch = {
                url: built.url,
                staticId: built.staticId,
                type: built.type,
                airframeLabel: built.airframeLabel,
                opened: false,
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
            mission: await toClientMission(mission),
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
          const intoMission = body.missionId
            ? missions.missions.find((m) => m.id === body.missionId)
            : undefined;
          if (body.missionId && !intoMission) {
            return { kind: 'missing_mission' as const };
          }
          const demandReplace =
            replace && Boolean(intoMission?.demandOrderId);
          const firstLot = demandReplace
            ? undefined
            : world.lots.find((lot) => lot.id === lines[0]!.lotId);
          if (!demandReplace && !firstLot) {
            return { kind: 'missing_lot' as const };
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
          const originIcao = demandReplace
            ? intoMission!.originIcao
            : firstLot!.originIcao;
          if (!playerAircraft) {
            playerAircraft = listParkedAt(missions, originIcao)[0];
          }
          if (!playerAircraft) {
            return {
              kind: 'no_parked' as const,
              originIcao,
            };
          }
          return {
            kind: 'ok' as const,
            aircraftClassId: playerAircraft.aircraftClassId,
            airframeTypeId: playerAircraft.airframeTypeId,
            demandReplace,
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
            let intoMission =
              body.missionId
                ? missions.missions.find((m) => m.id === body.missionId)
                : undefined;
            if (body.missionId && !intoMission) {
              throw new Error(`Unknown mission ${body.missionId}`);
            }

            if (replace && intoMission?.demandOrderId) {
              if (lines.length !== 1) {
                throw new Error(
                  'Demand Board edit allows exactly one cargo line',
                );
              }
              let playerAircraft: PlayerAircraft | undefined = body.aircraftId
                ? findPlayerAircraft(missions, body.aircraftId)
                : undefined;
              if (body.aircraftId && !playerAircraft) {
                throw new Error(`Unknown aircraft ${body.aircraftId}`);
              }
              if (!playerAircraft && intoMission.aircraftId) {
                playerAircraft = findPlayerAircraft(
                  missions,
                  intoMission.aircraftId,
                );
              }
              if (!playerAircraft) {
                playerAircraft = listParkedAt(
                  missions,
                  intoMission.originIcao,
                )[0];
              }
              if (!playerAircraft) {
                throw new Error(
                  `No parked aircraft at ${intoMission.originIcao} — ferry one there first`,
                );
              }
              if (
                intoMission.aircraftId &&
                intoMission.aircraftId !== playerAircraft.id
              ) {
                throw new Error(
                  `Mission ${intoMission.id} is assigned to another aircraft`,
                );
              }
              const aircraft = playerAircraft.aircraftClassId;
              const playerAirframe = findCareerPlayerAirframe(
                playerAircraft.airframeTypeId,
              );
              const stagingDistanceNm =
                routeDistanceNm(
                  world,
                  intoMission.originIcao,
                  intoMission.destIcao,
                ) ??
                intoMission.distanceNm ??
                0;
              const routeCargoLimit = estimateFlyableRouteCargoLimit(
                aircraft,
                stagingDistanceNm,
                cargoLimit.maxCargoKg,
                cargoLimit,
              );
              const operationalMaxCargoKg =
                routeCargoLimit.operationalMaxCargoKg;
              if (!routeCargoLimit.fuelFeasible) {
                throw new Error(
                  `Estimated block fuel ${routeCargoLimit.estimatedBlockFuelKg} kg exceeds ` +
                    `${aircraft} tank capacity ${routeCargoLimit.fuelCapacityKg} kg ` +
                    `(deficit ${routeCargoLimit.fuelDeficitKg} kg)`,
                );
              }
              const mission: MissionIntent = {
                ...replaceDemandMissionCargo(missions, world, intoMission, {
                  cargoKg: lines[0]!.cargoKg,
                  maxCargoKg: operationalMaxCargoKg,
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
              return {
                mission,
                appended: false,
                lineCount: 1,
                operationalMaxCargoKg,
                estimatedBlockFuelKg: routeCargoLimit.estimatedBlockFuelKg,
                walletUsd: missions.walletUsd,
                fleet: withParkingRates(missions.fleet),
              };
            }

            const firstLot = world.lots.find((lot) => lot.id === lines[0]!.lotId);
            if (!firstLot) {
              throw new Error(`Unknown lot ${lines[0]!.lotId}`);
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
            const routeCargoLimit = estimateFlyableRouteCargoLimit(
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
                aircraftId: playerAircraft.id,
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
                blockReasonAnotherActiveFlight(missions, activeMissions[0]!),
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
                blockReasonAnotherActiveFlight(missions, intoMission),
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
                  cargoOps: cargoOpsForRequest(req, missions.cargoOps),
                  classOps: classOpsForRequest(req, missions.classOps),
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
                cargoOps: cargoOpsForRequest(req, missions.cargoOps),
                classOps: classOpsForRequest(req, missions.classOps),
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
          }, { commandSliceLotIds: lines.map((line) => line.lotId) });

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
          if (body.openDispatch === true) {
            try {
              const distanceNm =
                (await withCareerRead((world) =>
                  routeDistanceNm(
                    world,
                    mission.originIcao,
                    mission.destIcao,
                  ),
                )) ??
                mission.distanceNm ??
                0;
              const { built, flyable } = await buildFlyableMissionDispatch(
                mission,
                distanceNm,
                {
                  units: body.units ?? body.weightSystem,
                  liveTitle: getLastProbeAircraftTitle(),
                },
              );
              mission = await withCareerWrite((world, missions) => {
                const idx = missions.missions.findIndex((m) => m.id === mission.id);
                let next = mission;
                if (flyable.cargoKg < mission.cargoKg) {
                  next = trimMissionCargoToKg(
                    world,
                    mission,
                    flyable.cargoKg,
                  ).mission;
                }
                const dispatched: MissionIntent = {
                  ...next,
                  staticId: built.staticId,
                  status: 'dispatched',
                  dispatchedAtTick: world.tick,
                  ofpCheckSeq: missionOfpCheckSeq(next) + 1,
                  lastOfpCheck: undefined,
                  lastPreflightCheck: undefined,
                  injectBallastLb: undefined,
                  fuelAuthorizedOfpId: undefined,
                };
                if (idx >= 0) missions.missions[idx] = dispatched;
                else missions.missions.push(dispatched);
                return dispatched;
              });
              // UI opens the URL once (Electron IPC / window.open).
              dispatch = {
                url: built.url,
                staticId: built.staticId,
                type: built.type,
                airframeLabel: built.airframeLabel,
                opened: false,
              };
            } catch (error) {
              // Cargo is already reserved — don't fail the accept with a dispatch error
              // (that left the UI retrying Max/Accept onto a full flight).
              dispatchError =
                error instanceof Error ? error.message : String(error);
            }
          }

          send(res, 200, {
            mission: await withCareerRead((world, missions) =>
              withMissionClientView(world, missions, mission),
            ),
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
            boardEnabled: BUSH_TRIPS_BOARD_ENABLED,
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
        if (!BUSH_TRIPS_BOARD_ENABLED) {
          send(res, 503, { error: 'Bush trips are temporarily disabled' });
          return;
        }
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
          }, { commandSliceMissionId: body.missionId });
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

        try {
          const { built, flyable, cargoLimit } = await buildFlyableMissionDispatch(
            prep.mission,
            prep.dispatchDistanceNm,
            {
              units: body.units ?? body.weightSystem,
              liveTitle: getLastProbeAircraftTitle(),
            },
          );
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
            let next = open;
            if (flyable.cargoKg < open.cargoKg) {
              next = trimMissionCargoToKg(world, open, flyable.cargoKg).mission;
            }
            const dispatched: MissionIntent = {
              ...next,
              staticId: built.staticId,
              status: 'dispatched',
              dispatchedAtTick: world.tick,
              ofpCheckSeq: missionOfpCheckSeq(next) + 1,
              lastOfpCheck: undefined,
              lastPreflightCheck: undefined,
              injectBallastLb: undefined,
              fuelAuthorizedOfpId: undefined,
            };
            missions.missions[idx] = dispatched;
            return dispatched;
          }, { commandSliceMissionId: body.missionId });

          send(res, 200, {
            mission,
            url: built.url,
            staticId: built.staticId,
            type: built.type,
            airframeLabel: built.airframeLabel,
            cargoThousands: built.cargoThousands,
            cargoKg: built.cargoKg,
            units: built.units,
            operationalMaxCargoKg: flyable.operationalMaxCargoKg,
            structuralMaxCargoKg: cargoLimit.maxCargoKg,
            maxCargoSource: cargoLimit.source,
            // UI opens the URL once — API must not spawn a second browser.
            opened: false,
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
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
          const seqAtProbe = missionOfpCheckSeq(probeMission);
          const cargoKgAtProbe = probeMission.cargoKg;
          const staticIdAtProbe = probeMission.staticId;
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
            if (
              missionOfpCheckSeq(mission) !== seqAtProbe ||
              mission.cargoKg !== cargoKgAtProbe ||
              mission.staticId !== staticIdAtProbe
            ) {
              savedMission = mission;
              return false;
            }
            applyConfirmedOfpCheck(mission, ofpCheck);
            savedMission = mission;
            return true;
          });
          if (!wrote || !savedMission) {
            const latest = await loadMissions();
            const current =
              savedMission ??
              latest.missions.find((m) => m.id === body.missionId);
            if (!current) {
              send(res, 404, { error: `Unknown mission ${body.missionId}` });
              return;
            }
            send(res, 200, {
              mission: await toClientMission(current),
              check: result.check,
              summary: result.summary,
              ofp: result.ofp,
              ...(savedMission
                ? {}
                : {
                    warning: isClosedMissionStatus(current.status)
                      ? 'Mission was cancelled or closed before OFP could be saved'
                      : 'Mission status changed before OFP could be saved',
                  }),
            });
            return;
          }
          send(res, 200, {
            mission: await toClientMission(savedMission),
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
            const trimmed = trimMissionCargoToKg(world, mission, ofpCargoKg);
            Object.assign(mission, trimmed.mission);
            bumpMissionOfpCheckSeq(mission);
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
          }, { commandSliceMissionId: body.missionId });

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
            applyConfirmedOfpCheck(mission, ofpCheck);
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
            mission: await toClientMission(savedMission),
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
          const originCoords = await withCareerRead((world) => {
            const terminal = airportByIcao(world, probeMission.originIcao);
            return resolveAirportCoords(probeMission.originIcao, terminal);
          });
          const result = await runMissionPreflight(probeMission, {
            username: body.simbriefUser,
            userid: body.simbriefUserid,
            pipeName: body.pipeName,
            ...(originCoords ? { originCoords } : {}),
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
            ...(result.check.location
              ? { location: result.check.location }
              : {}),
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
              mission: await toClientMission(current),
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
            mission: await toClientMission(savedMission),
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
          }, { commandSliceMissionId: body.missionId });
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
            const openMission = missions.missions.find(
              (m) => m.id === body.missionId,
            );
            if (!openMission) return { kind: 'missing' as const };
            const runwayTouch =
              touchdownLat != null && touchdownLon != null
                ? evaluateRunwayTouchdown(
                    openMission.destIcao,
                    touchdownLat,
                    touchdownLon,
                    touchdownHeadingTrueDeg,
                  )
                : undefined;
            const executed = executeSettleFlight(world, missions, {
              missionId: body.missionId,
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
            if (executed.kind === 'missing') return { kind: 'missing' as const };
            if (executed.kind === 'closed') return { kind: 'closed' as const };
            const result = executed.result;
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
          }, {
            housekeeping: false,
            catchUp: false,
            commandSliceMissionId: body.missionId,
          });
          if (settled.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          if (settled.kind === 'closed') {
            send(res, 409, { error: `Mission ${body.missionId} is already closed` });
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
        {
          const ofp = mission.lastOfpCheck;
          const ofpOk =
            Boolean(ofp?.ofpId) &&
            (ofp?.verdict === 'pass' || ofp?.verdict === 'warn');
          // Match UI fuelAuthorizedForOfp: contract-pilot skips Jet-A purchase.
          const fuelOk = mission.contractPilot
            ? ofpOk
            : ofpOk && mission.fuelAuthorizedOfpId === ofp?.ofpId;
          if (!fuelOk) {
            send(res, 409, {
              error:
                'Purchase or authorize OFP block fuel before loading the aircraft',
              code: 'fuel_purchase_required',
            });
            return;
          }
        }
        if (isOfpLoadBusy(mission.id) || isOfpLoadActive()) {
          send(res, 409, {
            error: 'OFP inject already in progress — wait or cancel first',
            code: 'inject_in_progress',
            progress: getOfpLoadProgress(mission.id),
          });
          return;
        }
        let handedToApply = false;
        try {
          // Abort Watch ticks before stop() so sampleLiveLoadLb bails out.
          // Progress first — otherwise the UI sits on a blank INJECTING LOAD.
          beginOfpLoadActive();
          announceOfpLoadStarting(
            mission.id,
            'Stopping Watch so inject can own SimBridge…',
          );
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
            await new Promise((r) => setTimeout(r, 150));
          }
          const injectFleet = await withCareerRead(
            async (_world, missions) => missions.fleet ?? [],
          );
          const injectAcf = mission.aircraftId
            ? injectFleet.find((a) => a.id === mission.aircraftId)
            : undefined;
          handedToApply = true;
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
          if (!lastPreflightCheck && result.ok) {
            const progress = getOfpLoadProgress(mission.id);
            lastPreflightCheck = lastPreflightFromInjectLive({
              previous: mission.lastPreflightCheck,
              stations: (progress?.liveStations ?? result.after.stations) as Record<
                number,
                number
              >,
              tanks: result.after.tanks,
              liveFuelLb: progress?.liveFuelLb,
              livePayloadLb: progress?.livePayloadLb,
              liveTanks: progress?.liveTanks,
              blockFuelLb: result.plan.blockFuelLb,
              cargoLb: result.plan.cargoLb,
              displayCg: result.displayCg,
            });
          }
          {
            const wrote = await updateOpenMission(body.missionId, (_m, open) => {
              if (lastPreflightCheck) open.lastPreflightCheck = lastPreflightCheck;
              const painted = result.displayCg;
              const prevLv = open.lastPreflightCheck?.loadVerification;
              if (result.ok && painted && prevLv) {
                const minMac = painted.minMac;
                const maxMac = painted.maxMac;
                const liveMac = painted.liveMac;
                const inEnvelope =
                  liveMac === undefined ||
                  minMac === undefined ||
                  maxMac === undefined ||
                  (liveMac >= minMac && liveMac <= maxMac);
                open.lastPreflightCheck = {
                  ...open.lastPreflightCheck!,
                  loadVerification: {
                    ...prevLv,
                    cg: {
                      liveMac,
                      minMac,
                      maxMac,
                      ok: inEnvelope,
                      severity: inEnvelope ? 'info' : 'warn',
                    },
                  },
                };
              }
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
        } finally {
          if (!handedToApply) {
            endOfpLoadActive();
          }
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
                await withCareerWrite(() => undefined, { catchUp: true });
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
