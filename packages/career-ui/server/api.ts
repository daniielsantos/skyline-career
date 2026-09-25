import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acceptEmptyFlight,
  startPayloadLabMission,
  findPayloadLabMission,
  listCareerPlayerAirframes,
  isCareerPlayerAirframeEnabled,
  resolvePayloadLabCharterMaxPax,
  assignAircraftToMission,
  reserveAircraftForMember,
  releaseAircraftReservation,
  clearExpiredAircraftReservations,
  isAircraftReservationActive,
  buyOutAircraftLease,
  returnAircraftLeaseEarly,
  payAircraftLeaseOverdue,
  CAREER_COMMODITIES,
  cancelOrphanPlayerMissions,
  expireStaleActiveMissions,
  cargoOpsIsUnlocked,
  unlockAllCareerCargoOps,
  unlockAllCareerClassOps,
  classOpsIsUnlocked,
  classOpsHidesBoardLot,
  assertClassOpsUnlocked,
  classOpsUnlockProgress,
  emptyCareerClassOps,
  CLASS_OPS_STARTER_IDS,
  LEASE_UNLOCK_CLEAN_DRY_SETTLES,
  dryCleanSettlesOk,
  applyPilotCareerSettle,
  formatPilotPayDebriefLine,
  classOpsLadderComplete,
  aircraftLeaseUnlockProgress,
  aircraftLeaseUnlockProgressDevOpen,
  BOARD_NEAR_MAX_NM,
  getAircraftClass,
  clearAircraftMaintenanceWithParts,
  repairAircraftConditionWithParts,
  hoursUntilInspection,
  startAircraftOverhaul,
  finalizeAircraftOverhaulsDue,
  inspectionCostUsd,
  ensureSeedMarketFormed,
  executeFerry,
  quoteFerry,
  planFerryRoute,
  createFerryRoutePlanner,
  computeFerryFeeUsd,
  estimateUpliftKg,
  ferryProgressPct,
  remainingNmToFinal,
  nextFerryLeg,
  quotePilotTravel,
  executePilotTravel,
  findCareerPlayerAirframe,
  findCareerAirframeConfiguration,
  resolvePassengerCapacity,
  reserveCharterOffer,
  readCharterHubPoolView,
  isCharterEligibleAircraftClass,
  findOpenManifestForRoute,
  findPlayerAircraft,
  normalizeAircraftRegistration,
  findNpcAirframe,
  listActivePlayerMissions,
  listActivePlayerMissionsForPilot,
  listAircraftClassCatalog,
  buildAirframePerfMapForUi,
  listAircraftMarket,
  resolveMarketCountryId,
  dealerPoolCountryCounts,
  listCareerHubIcaos,
  listParkedAt,
  listStarterCareerPlayerAirframes,
  resolveAirframeFuelBurnKgPerNm,
  applyCruiseSampleOverride,
  parseCruiseSampleCommit,
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
  describeLotMarketPressure,
  idleLotPayMult,
  laneDemandShock,
  isDomesticOd,
  countryIdFromRegion,
  listViableMarketLots,
  isBushHub,
  isBushTripOnlyHub,
  estimateBoardLotEconomics,
  parseMarketBoardAccessFilter,
  parseMarketBoardLaneFilter,
  parseMarketBoardCrewFilter,
  parseMarketBoardSorts,
  parseCharterBoardSorts,
  parseCharterBoardLaneFilter,
  parseCharterBoardFitFilter,
  parseCharterBoardPaxFilter,
  charterOfferMatchesPaxFilter,
  charterOfferMatchesDistanceMax,
  sortCharterBoardRows,
  charterBoardNeedsFitCompute,
  formatCharterBoardSorts,
  marketQueryTokens,
  marketEndpointMatchesQuery,
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
  MS_PER_HOUR,
  MS_PER_TICK,
  msToHours,
  CATCH_UP_TICKS_PER_PULSE,
  LOCAL_COMPANY_ID,
  LOCAL_WORLD_ID,
  worldClockFromEconomy,
  TICKS_PER_DAY,
  listNpcHomeRegions,
  targetNpcFleetSize,
  npcClaimForLot,
  acceptContractPilotOffer,
  listContractPilotPickAirframes,
  parseFreighterClassId,
  purchasePlayerMissionOfpFuel,
  quoteAircraftRepositionForListing,
  quotePlayerMissionOfpFuel,
  reconcilePlayerInbound,
  reconcileLotReservations,
  replaceMissionManifest,
  resolveAircraftDeliveryIcao,
  routeDistanceNm,
  hubDistanceNm,
  XL_LOT_MIN_KG,
  estimateMissionBlockHours,
  KG_TO_LB,
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
  localOperatorDemandCatchmentHubs,
  expireDemandHolds,
  demandSnapshot,
  acceptDemandOrder,
  holdDemandOrder,
  cancelDemandHold,
  dispatchDemandHold,
  holdWarehouseBridge,
  cancelWarehouseBridgeHold,
  acceptWarehouseBridge,
  dispatchWarehouseBridgeHold,
  quoteInternalHaulForRoute,
  listOpenAirlineDeskHolds,
  listAirlineDeskMissions,
  isVaRankingMission,
  buildCompanyNetworkNodesFromState,
  buildPublicAirlineNetworkNodes,
  vaDayKeyFromTick,
  VA_RANKING_WINDOW_DAYS,
  VA_FLIGHT_QUALITY_WINDOW_DAYS,
  VA_MEMBER_CAP,
  canManageVaRoster,
  canMutateVaPortDeskOps,
  hireVaLineCrew,
  fireVaLineCrew,
  upgradeVaLineCrew,
  buildVaLineCrewSnapshot,
  vaLineCrewAllowanceRemaining,
  consumeVaLineCrewAllowance,
  finalizeStuckNpcFerries,
  syncPilotIcaoTo,
  resolveVaOrgPerks,
  applyVaOrgCostMult,
  type VaOrgPerks,
  type VaFlightQualitySnapshot,
  holdWarehouseHaul,
  cancelWarehouseHaulHold,
  acceptWarehouseHaul,
  dispatchWarehouseHaulHold,
  quoteWarehouseHaulPayUsd,
  replaceDemandMissionCargo,
  demandMissionEditableMaxKg,
  ensurePortListings,
  claimPortConcession,
  debugForceClaimPortConcession,
  renewPortConcession,
  upgradePortConcession,
  tickPortConcessions,
  healMissingPortConcessionFromLedger,
  syncWorldPortConcessions,
  ensurePortInventoryRestock,
  tickPortAutoBuyOrders,
  tickVaAutoHaul,
  upsertVaAutoHaul,
  ensureVaAutoHaul,
  VA_AUTO_HAUL_MIN_MEMBERS,
  upsertPortAutoBuyOrder,
  setPortAutoBuyOrderPaused,
  removePortAutoBuyOrder,
  PORT_AUTO_BUY_MAX_ACTIVE,
  quotePortStevedoreHaul,
  startPortStevedoreHaul,
  listPortStevedoreDestinations,
  confirmPortScoutBridge,
  confirmPortScoutDemand,
  confirmPortScoutHaul,
  listPortScoutDesk,
  listBaseDispatchScoutSuggestions,
  confirmBaseDispatchScout,
  listBaseDispatchTours,
  confirmBaseDispatchTour,
  activeTourView,
  acceptActiveTourLeg,
  dropActiveTour,
  dropPreparedActiveTourIfUnbound,
  syncActiveTour,
  attachActiveTourFromMission,
  bindActiveTourLegToMission,
  prepareActiveTour,
  listBaseDispatchCharterTours,
  prepareCharterActiveTour,
  dropCharterActiveTour,
  bindCharterTourLegMission,
  syncCharterActiveTour,
  charterActiveTourView,
  resolveBaseDispatchScoutPolicy,
  baseDispatcherSnapshot,
  hireBaseDispatcherCandidate,
  fireBaseDispatcherMember,
  refreshBaseDispatcherHirePool,
  quotePortShuttleBridgeHold,
  dispatchPortShuttleBridgeHold,
  FERRY_SOFT_NM_BUDGET,
  cancelFboHold,
  releaseFboHoldToMission,
  returnMissionToFboHold,
  playerFboSnapshot,
  playerFboSnapshotAtIcao,
  fboServiceCostMult,
  settleCrewOpsDue,
  settleCrewDailyOps,
  companyCrewSnapshot,
  fireCrewMember,
  settleGroundStaffDailyOps,
  groundStaffSnapshot,
  hireGroundStaffCandidate,
  fireGroundStaffMember,
  drawCompanyCredit,
  repayCompanyCredit,
  assertCompanyCreditAllowsOps,
  executeSettleFlight,
  executeAcceptLot,
  executeAcceptManifest,
  executeDepartFlight,
  revertFalseDepartMission,
  executeBuyAircraft,
  executeCancelMission,
  signAircraftLease,
  resolveHangarParkingUsdPerDay,
  applyWalletDelta,
  summarizeCareerLedger,
  estimateCareerBurnUsdPerDay,
  LEDGER_KIND_LABEL,
  enterLedgerActorAccountId,
  peekLedgerActorAccountId,
  runWithLedgerActorAccountId,
  AccessKeyError,
  openCareerStore,
  applyMsfsBushHubOverrideToTerminal,
  pruneOrphanCareerHubs,
  listWorldCountryIds,
  countryIdFromHubIcao,
  localUnitPriceUsd,
  computeEconomyPulse,
  aggregateHubEconomyHistoryPulse,
  DEFAULT_HUB_ECONOMY_HISTORY_FOCUS,
  syncHomeCountryFromHub,
  stockTrend,
  companySessionFromTick,
  settleCompanyPassiveFeesForTickRange,
  applyEconomyAdvanceToCrewAirborne,
  resolveCompanyId,
  isCareerAuthRequired,
  AUTH_ONLINE_WINDOW_MS,
  bearerTokenFromHeader,
  isCareerWorldFixed,
  withPostgresReadyRetry,
  ensureEconomyCaughtUpCooperative,
  tickEconomyNCooperative,
  createEmptyTickPhaseProfile,
  summarizeTickPhaseProfile,
  withMissionLoadPolicy,
  normalizeMissionIntent,
  missionLoadPolicy,
  careerAllowsDirectInject,
  economyDayIndex,
  HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
  buildHubEconomySampleForAirport,
  type OfflineFeeSummary,
  fuelBurnMultFromAircraft,
  padOfpBlockFuelKgForMx,
  bumpMissionOfpCheckSeq,
  parseClientUpdatePolicy,
  clientUpdateGateRejection,
  DEFAULT_CLIENT_UPDATE_POLICY,
  CLIENT_VERSION_HEADER,
  type ClientUpdatePolicy,
  isOfpCargoUnderOnlyFailure,
  missionOfpCheckSeq,
  trimMissionCargoToKg,
  airportByIcao,
  resolveAirportCoords,
  pushPresenceEvent,
  listPresenceEvents,
  recordFlightTrackSample,
  getFlightTrack,
  clearFlightTrack,
  isFlightTrackFresh,
  FLIGHT_TRACK_FRESH_MS,
  getCareerPort,
  listCareerPorts,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type CharterOffer,
  type CareerStore,
  type AuthSessionContext,
  type CommodityId,
  type FreighterClassId,
  type HubEconomySample,
  type MissionIntent,
  type PlayerAircraft,
  type WorldTickService,
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
import {
  careerWorldApiUrlFromEnv,
  isGatewayEnrichApiPath,
  isGatewayProxiedPath,
  isSimDisabledMode,
  isSimLocalApiPath,
  resolveCareerApiMode,
  SIM_ON_CLIENT_CODE,
  SIM_ON_CLIENT_ERROR,
  type CareerApiMode,
} from './career-api-mode.ts';
import { proxyToWorldApi } from './gateway-proxy.ts';
import { homeCountryPersistence } from './home-country-persistence.ts';
import {
  authRateLimitKeyFromRequest,
  consumeAuthRateLimit,
  isAuthSessionsListAllEnabled,
} from './auth-rate-limit.ts';
import {
  authInviteCodeRequired,
  isAuthAccessKeysRequired,
  isAuthClaimCompanyAllowed,
  isAuthInviteFieldRequired,
  isAuthRegisterEnabled,
  resolveRegisterAccessGate,
} from './auth-register-policy.ts';
import {
  createGatewayWatchMutations,
  gatewayEconomyShell,
  gatewayLoadMissions,
  gatewayUpdateOpenMission,
} from './gateway-career-access.ts';
import {
  WorldApiAuthScope,
  WorldApiClient,
  WorldApiError,
  worldAuthFromIncoming,
  type WorldApiAuth,
} from './world-api-client.ts';
import { createVaLiveUplink } from './va-live-uplink.ts';

import { WATCH_DEBUG_LOG_PATH } from './debug-log.ts';
import {
  loadProfileMsfsBushHubOverrides,
  persistProfileMsfsBushHubOverrides,
} from './msfs-hub-overrides-io.ts';
import {
  clearActiveCareerProfile,
  createCareerProfile,
  deleteCareerProfile,
  ensureCareerProfilesLayout,
  FIXED_WORLD_PROFILE_ID,
  FIXED_WORLD_PROFILE_NAME,
  fixedWorldProfileMeta,
  openCareerFixedWorldStore,
  openCareerProfileStore,
  readProfilesFile,
  renameCareerProfile,
  setActiveCareerProfile,
} from './career-profiles.ts';
import { createPromiseLock } from './career-write-lock.ts';
import { LocalWorldTickService, isHeadlessPulseEnabled, emptyPulseChunkTiming } from './local-world-tick-service.ts';
import type { PulseChunkTiming } from './local-world-tick-service.ts';
import {
  RemoteWorldTickService,
  isRemoteWorldTickEnabled,
  remoteWorldPathStyleFromEnv,
} from './remote-world-tick-service.ts';
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
let fixedWorldOpenError: string | null = null;
let worldWriterLeaseState:
  | 'not-required'
  | 'pending'
  | 'acquired'
  | 'denied' = 'not-required';
let worldWriterLeaseError: string | null = null;

/** Process role: full (SP) | world (VPS) | gateway (desktop sim). */
const careerApiMode: CareerApiMode = resolveCareerApiMode();
let gatewayWorldClient: WorldApiClient | null = null;
const gatewayAuthScope = new WorldApiAuthScope();

function gatewayAuthOrThrow(): WorldApiAuth {
  return gatewayAuthScope.current();
}
/** Defer MSFS hub coord stamp until after profile-select responds. */
let msfsStampNeeded = false;
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

/** Hydrate SQLite → RAM once so the first /api/state avoids a cold parse. */
async function warmCareerStoreCache(): Promise<void> {
  if (!store) return;
  const t0 = performance.now();
  await withCareerLock(async () => {
    if (!store) return;
    await store.loadEconomy({ maxCatchUpTicks: 0 });
  });
  console.log(
    `[career] store-warm ok ${Math.round(performance.now() - t0)}ms`,
  );
}

function schedulePostLoginEconomyWork(tickService: WorldTickService): void {
  void (async () => {
    try {
      await warmCareerStoreCache();
    } catch (error) {
      console.error(
        `[career] store-warm fail:`,
        error instanceof Error ? error.message : error,
      );
    }
    // Remote client: poll clock only. Local host: advance + settle.
    tickService.startBackgroundPulse(LOCAL_WORLD_ID);
  })();
}

async function startOwnedWorldPulse(
  tickService: WorldTickService,
): Promise<void> {
  const activeStore = requireStore();
  worldWriterLeaseState = 'pending';
  worldWriterLeaseError = null;
  try {
    if (activeStore.kind === 'postgres') {
      if (!activeStore.acquireWorldWriterLease) {
        throw new Error('Postgres store does not implement the world-writer lease');
      }
      const acquired = await activeStore.acquireWorldWriterLease();
      if (!acquired) {
        throw new Error(
          'Another process already owns the Postgres world-writer lease',
        );
      }
    }
    worldWriterLeaseState = 'acquired';
    console.log('[career] world-writer lease acquired by API');
    schedulePostLoginEconomyWork(tickService);
  } catch (error) {
    worldWriterLeaseState = 'denied';
    worldWriterLeaseError =
      error instanceof Error ? error.message : String(error);
    console.error(`[career] world-writer lease denied: ${worldWriterLeaseError}`);
  }
}

/**
 * Phase 2 — resume last-played profile on API boot so the world tick runs
 * with zero UI clients (hosted SP mold). Opt out: CAREER_HEADLESS_PULSE=0.
 * Phase 4 remote client: never resume/advance locally.
 * Phase 8 fixed world: open the single `careerRoot/world` SQLite (no profiles.json).
 * Postgres lab/VPS: open store even when pulse is off (worker owns ticks).
 */
async function bootstrapHeadlessWorldPulse(
  tickService: WorldTickService,
): Promise<void> {
  if (tickService.mode === 'mp-remote') {
    console.log('[career] headless-pulse skip — remote world tick client');
    tickService.startBackgroundPulse(LOCAL_WORLD_ID);
    return;
  }

  if (isCareerWorldFixed()) {
    if (!store) {
      const t0 = performance.now();
      try {
        fixedWorldOpenError = null;
        const openedStore = await withPostgresReadyRetry(
          'fixed-world open',
          () =>
            withCareerLock(async () => {
              if (store) return store;
              resetMsfsStampState();
              const nextStore = await openCareerFixedWorldStore(careerRoot);
              store = nextStore;
              activeProfileId = FIXED_WORLD_PROFILE_ID;
              msfsStampNeeded = true;
              return nextStore;
            }),
          {
            attempts: 12,
            delayMs: 1_000,
            log: (line) => console.warn(`[career] ${line}`),
          },
        );
        console.log(
          `[career] fixed-world open id=${FIXED_WORLD_PROFILE_ID} ` +
            `backend=${openedStore.kind} ${Math.round(performance.now() - t0)}ms`,
        );
      } catch (error) {
        fixedWorldOpenError =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[career] fixed-world open fail ${Math.round(performance.now() - t0)}ms:`,
          fixedWorldOpenError,
        );
        return;
      }
    }
    if (!isHeadlessPulseEnabled()) {
      if (careerApiMode === 'world') {
        worldWriterLeaseState = 'denied';
        worldWriterLeaseError =
          'CAREER_API_MODE=world requires CAREER_HEADLESS_PULSE=1';
        console.error(`[career] ${worldWriterLeaseError}`);
        return;
      }
      console.log(
        '[career] headless-pulse disabled (CAREER_HEADLESS_PULSE) — store open; an external writer must own ticks',
      );
      return;
    }
    await startOwnedWorldPulse(tickService);
    return;
  }

  if (!isHeadlessPulseEnabled()) {
    console.log('[career] headless-pulse disabled (CAREER_HEADLESS_PULSE)');
    return;
  }
  if (store) {
    await startOwnedWorldPulse(tickService);
    return;
  }

  const file = await readProfilesFile(careerRoot);
  const id = file.activeId?.trim() ?? '';
  if (!id || !file.profiles.some((p) => p.id === id)) {
    console.log('[career] headless-pulse skip — no last-played profile');
    return;
  }
  const t0 = performance.now();
  try {
    await withCareerLock(async () => {
      if (store) return;
      resetMsfsStampState();
      const next = await openCareerProfileStore(careerRoot, id);
      store = next;
      activeProfileId = id;
      msfsStampNeeded = true;
    });
    console.log(
      `[career] headless-pulse resume id=${id} ${Math.round(performance.now() - t0)}ms`,
    );
    await startOwnedWorldPulse(tickService);
  } catch (error) {
    console.error(
      `[career] headless-pulse fail id=${id} ${Math.round(performance.now() - t0)}ms:`,
      error instanceof Error ? error.message : error,
    );
  }
}

function resetMsfsStampState(): void {
  msfsStampNeeded = false;
}

function requireStore(): CareerStore {
  if (!store) {
    if (isCareerWorldFixed()) {
      throw new Error(
        fixedWorldOpenError
          ? `World database unavailable: ${fixedWorldOpenError}`
          : 'World is not ready yet — try again in a moment',
      );
    }
    throw new Error('Select a career profile first');
  }
  return store;
}

/** Auth/register before the store is open — never reuse the SP profile-gate copy on MP. */
function sendMissingStoreForAuth(
  res: import('node:http').ServerResponse,
): void {
  if (isCareerWorldFixed()) {
    send(res, 503, {
      error: fixedWorldOpenError
        ? `World database unavailable: ${fixedWorldOpenError}`
        : 'World is not ready yet — try again in a moment',
      code: fixedWorldOpenError
        ? 'world_store_unavailable'
        : 'world_store_opening',
    });
    return;
  }
  send(res, 409, {
    error: 'Select a career profile first',
    code: 'needs_profile',
  });
}

/** Row cap for the market board — filters must run server-side to survive it. */
const MARKET_LOT_LIMIT = 200;

type MissionsFile = CareerMissionsState;

async function loadMissions(opts?: {
  companyId?: string;
}): Promise<MissionsFile> {
  if (careerApiMode === 'gateway' && gatewayWorldClient) {
    const auth: WorldApiAuth = {
      ...gatewayAuthOrThrow(),
      ...(opts?.companyId ? { companyId: opts.companyId } : {}),
    };
    return gatewayLoadMissions(gatewayWorldClient, auth);
  }
  return requireStore().loadMissions(opts);
}

/** Enrich mission rows for Logbook (distance + concrete airframe name). */
function withMissionClientView(
  world: CareerEconomyWorld,
  missions: MissionsFile,
  mission: MissionIntent,
  opts?: { forceVaFlight?: boolean },
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
  const lots = normalized.lots.map((line) => {
    const lot = world.lots.find((row) => row.id === line.shipmentLotId);
    const lotQuantityKg =
      typeof lot?.quantityKg === 'number' && lot.quantityKg > 0
        ? Math.floor(lot.quantityKg)
        : undefined;
    return lotQuantityKg !== undefined ? { ...line, lotQuantityKg } : line;
  });
  const vaFlight =
    opts?.forceVaFlight === true ||
    normalized.vaFlight === true ||
    (normalized.warehouseBridge === true && normalized.internalHaul === true);
  return {
    ...base,
    lots,
    ...(airframeLabel ? { airframeLabel } : {}),
    ...(distanceNm !== undefined ? { distanceNm } : {}),
    ...(demandEditMaxKg !== undefined ? { demandEditMaxKg } : {}),
    ...(vaFlight ? { vaFlight: true as const } : {}),
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

function charterAircraftFit(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  offer: CharterOffer,
  aircraft: PlayerAircraft,
  structuralMaxPayloadKg: number,
  ferryPlanner?: ReturnType<typeof createFerryRoutePlanner> | null,
) {
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const configuration = findCareerAirframeConfiguration(
    airframe,
    aircraft.airframeConfigurationId,
    aircraft.rolesPackRelPath,
  );
  const seatCapacity = resolvePassengerCapacity(
    aircraft.airframeTypeId,
    aircraft.airframeConfigurationId,
    aircraft.rolesPackRelPath,
  );
  const inRange =
    offer.distanceNm <=
    resolveAirframeMaxRangeNm(aircraft.airframeTypeId, aircraft.aircraftClassId);
  const baggageCapacityKg = (configuration?.baggageCapacityLb ?? 0) / KG_TO_LB;
  const baggageOk = offer.baggageKg <= baggageCapacityKg + 0.5;
  const passengerPayloadKg =
    (offer.groupSize * 175) / KG_TO_LB + offer.baggageKg;
  const planningBurnKgPerNm = resolveAirframeFuelBurnKgPerNm(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId,
    missions.airframePerfOverrides?.[aircraft.airframeTypeId] ?? null,
  );
  const routeLimit = estimateFlyableRouteCargoLimit(
    aircraft.aircraftClassId,
    offer.distanceNm,
    structuralMaxPayloadKg,
    {
      oewKg: airframe?.oewKg,
      mtowKg: airframe?.mtowKg,
      fuelCapacityKg: airframe?.fuelCapacityKg,
      fuelBurnKgPerNm: planningBurnKgPerNm,
      airframeTypeId: aircraft.airframeTypeId,
    },
    // Passenger body + bags are the useful load; cockpit crew remains reserved
    // by the route estimator.
  );
  const payloadOk =
    routeLimit.fuelFeasible &&
    passengerPayloadKg <= routeLimit.operationalMaxCargoKg + 0.5;
  const ferryRequired =
    aircraft.locationIcao.toUpperCase() !== offer.originIcao.toUpperCase();
  let ferryNm = 0;
  let ferryCostUsd = 0;
  const reasons: string[] = [];
  if (!isCharterEligibleAircraftClass(aircraft.aircraftClassId)) {
    reasons.push(
      'Charter class required (GA, TP, light jet, medium piston, or narrowbody)',
    );
  }
  if (!configuration || configuration.role !== 'passenger') {
    reasons.push('Passenger/VIP configuration required');
  } else if (configuration.certificationState === 'catalog_only') {
    reasons.push('Passenger configuration is not dispatch ready');
  }
  if (seatCapacity < offer.groupSize) {
    reasons.push(`${offer.groupSize} pax require more than ${seatCapacity} seats`);
  }
  if (!baggageOk) {
    reasons.push(`Baggage exceeds ${Math.floor(baggageCapacityKg)} kg capacity`);
  }
  if (!inRange) reasons.push('Route exceeds aircraft range');
  if (!routeLimit.fuelFeasible) reasons.push('Route fuel exceeds tank capacity');
  else if (!payloadOk) reasons.push('Passenger and baggage payload exceeds route weight limit');
  if (aircraft.status !== 'parked') reasons.push('Aircraft is not parked');
  if (aircraft.leaseOverdue) {
    reasons.push('Lease payment overdue — catch up in Hangar before dispatch');
  }
  // Ferry is done from Manifest (multi-leg), same as Aircraft needed — never
  // block Prepare on a single-hop range check.
  if (ferryRequired && aircraft.status === 'parked') {
    try {
      const maxRangeNm = resolveAirframeMaxRangeNm(
        aircraft.airframeTypeId,
        aircraft.aircraftClassId,
      );
      const plan = ferryPlanner
        ? ferryPlanner.planTo(offer.originIcao)
        : planFerryRoute({
            originIcao: aircraft.locationIcao,
            finalDestIcao: offer.originIcao,
            maxRangeNm,
          });
      ferryNm = plan.totalDistanceNm;
      if (plan.legCount === 1) {
        const quote = quoteFerry(world, missions, {
          aircraftId: aircraft.id,
          destIcao: offer.originIcao,
        });
        ferryNm = quote.distanceNm;
        ferryCostUsd = quote.totalCostUsd;
      } else {
        let softUsed = missions.ferrySoftNmUsed;
        for (const leg of plan.legs) {
          const fee = computeFerryFeeUsd({
            distanceNm: leg.distanceNm,
            aircraftClassId: aircraft.aircraftClassId,
            ferrySoftNmUsed: softUsed,
          });
          softUsed += fee.softNmApplied;
          ferryCostUsd += fee.ferryFeeUsd;
          // Board estimate only — Manifest quotes each real leg on fly.
          ferryCostUsd += Math.round(
            estimateUpliftKg(aircraft.aircraftClassId, leg.distanceNm) * 1.35,
          );
        }
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    aircraftId: aircraft.id,
    aircraftLabel: aircraft.label,
    compatible: reasons.length === 0,
    seatCapacity,
    inRange,
    baggageOk,
    fuelFeasible: routeLimit.fuelFeasible && payloadOk,
    ferryRequired,
    ferryNm,
    // Keep finite for JSON (NaN becomes null and crashes Net `toLocaleString`).
    netUsd: (() => {
      const raw = Number(offer.payUsd) - ferryCostUsd;
      return Number.isFinite(raw)
        ? Math.round(raw)
        : Math.max(0, Math.round(Number(offer.payUsd) || 0));
    })(),
    reasons,
  };
}

/** Class Ops (home ladder) — Charter Fit must match Freights / staging gates. */
function withCharterClassOpsGate(
  fit: ReturnType<typeof charterAircraftFit>,
  classOps: CareerMissionsState['classOps'] | undefined,
  classId: FreighterClassId,
): ReturnType<typeof charterAircraftFit> {
  if (classOpsIsUnlocked(classOps, classId)) return fit;
  const progress = classOpsUnlockProgress(
    classOps ?? emptyCareerClassOps(),
    classId,
  );
  const reason = progress.summary
    ? `Class locked: ${progress.label}. ${progress.summary}`
    : `Class locked: ${progress.label}`;
  return {
    ...fit,
    compatible: false,
    reasons: [reason, ...fit.reasons.filter((entry) => entry !== reason)],
  };
}

function withParkingRates(
  fleet: PlayerAircraft[],
  world?: Pick<CareerEconomyWorld, 'airports'>,
  missions?: Pick<CareerMissionsState, 'playerFbos' | 'homeHubIcao'>,
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

function careerCashflowSnapshot(
  missions: MissionsFile,
  world: Pick<CareerEconomyWorld, 'tick' | 'airports'>,
) {
  return {
    ...summarizeCareerLedger(missions, world.tick),
    burnEstimate: estimateCareerBurnUsdPerDay(missions, world),
  };
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
    airframePerf: buildAirframePerfMapForUi(missions.fleet, {
      overrides: missions.airframePerfOverrides,
    }),
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
    message: `MX burn +${excessPct}% · cond ${Math.round(mxBurn.conditionPct)}% — excess at settle`,
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

async function saveMissions(
  missions: MissionsFile,
  opts?: { companyId?: string },
): Promise<void> {
  await requireStore().saveMissions(missions, opts);
}

/**
 * World (stock, lots, inbound) then company (missions, wallet, fleet).
 * Non-reentrant — use *Unlocked helpers while holding. Never take world
 * while holding company.
 */
const worldLock = createPromiseLock();
const companyLock = createPromiseLock();

/** Request-scoped Accept timing. Only set around POST /api/staging/commit. */
type CareerWriteDiag = {
  startedAt: number;
  lockWaitMs: number;
  inLockMs: number;
  failed: boolean;
};

const careerWriteDiag = new AsyncLocalStorage<CareerWriteDiag>();

function logCareerWriteDiag(label: string, diag: CareerWriteDiag): void {
  const wallMs = performance.now() - diag.startedAt;
  const outsideMs = Math.max(0, wallMs - diag.lockWaitMs - diag.inLockMs);
  // Skip validation rejects that never touched the lock.
  if (
    !diag.failed &&
    diag.lockWaitMs === 0 &&
    diag.inLockMs === 0 &&
    wallMs < 50
  ) {
    return;
  }
  console.log(
    `[career] ${label}${diag.failed ? ' fail' : ''} ${Math.round(wallMs)}ms` +
      ` lockWait=${Math.round(diag.lockWaitMs)}ms` +
      ` inLock=${Math.round(diag.inLockMs)}ms` +
      ` outside=${Math.round(outsideMs)}ms`,
  );
}

function withWorldThenCompany<T>(fn: () => Promise<T> | T): Promise<T> {
  const diag = careerWriteDiag.getStore();
  const queuedAt = diag ? performance.now() : 0;
  return worldLock.withLock(() =>
    companyLock.withLock(async () => {
      if (diag) diag.lockWaitMs += performance.now() - queuedAt;
      const holdAt = performance.now();
      try {
        return await fn();
      } finally {
        if (diag) diag.inLockMs += performance.now() - holdAt;
      }
    }),
  );
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
  opts?: { companyId?: string },
): Promise<boolean> {
  if (careerApiMode === 'gateway' && gatewayWorldClient) {
    const auth: WorldApiAuth = {
      ...gatewayAuthOrThrow(),
      ...(opts?.companyId ? { companyId: opts.companyId } : {}),
    };
    return gatewayUpdateOpenMission(
      gatewayWorldClient,
      auth,
      missionId,
      update,
    );
  }
  return companyLock.withLock(async () => {
    const companyId = opts?.companyId?.trim();
    const companyOpts = companyId ? { companyId } : undefined;
    const missions = await loadMissions(companyOpts);
    const idx = missions.missions.findIndex((m) => m.id === missionId);
    if (idx < 0) return false;
    const mission = missions.missions[idx]!;
    if (isClosedMissionStatus(mission.status)) return false;
    const shouldSave = await update(missions, mission, idx);
    if (!shouldSave) return false;
    await saveMissions(missions, companyOpts);
    return true;
  });
}

async function loadEconomyUnlocked(opts?: {
  skipCatchUp?: boolean;
  maxCatchUpTicks?: number;
  /** Background pulse: yield between countries and use lock chunks in caller. */
  cooperative?: boolean;
  /** Pulse spike diag — optional accumulator. */
  catchUpTiming?: Pick<PulseChunkTiming, 'tickMs' | 'saveMs' | 'lots'>;
  /**
   * Tick / heal under worldLock but skip economy PG/SQLite saves — caller
   * persists a snapshot after releasing the lock (two-queue pulse).
   */
  deferPersist?: boolean;
}): Promise<CareerEconomyWorld> {
  const activeStore = requireStore();
  let caught: CareerEconomyWorld;
  let advancedTicks: number;
  let dirty: boolean;
  const timing = opts?.catchUpTiming;
  const deferPersist = opts?.deferPersist === true;

  const useCooperative =
    opts?.cooperative === true &&
    !opts?.skipCatchUp &&
    opts?.maxCatchUpTicks != null &&
    opts.maxCatchUpTicks > 0;

  const timedSave = async (fn: () => Promise<void>): Promise<void> => {
    if (deferPersist) return;
    if (!timing) {
      await fn();
      return;
    }
    const t0 = performance.now();
    await fn();
    timing.saveMs += performance.now() - t0;
  };

  if (useCooperative) {
    const loaded = await activeStore.loadEconomy({ maxCatchUpTicks: 0 });
    const tickStarted = performance.now();
    const coop = await ensureEconomyCaughtUpCooperative(loaded.world, Date.now(), {
      maxTicks: opts.maxCatchUpTicks,
    });
    if (timing) timing.tickMs += performance.now() - tickStarted;
    caught = coop.world;
    advancedTicks = coop.advancedTicks;
    dirty =
      loaded.dirty ||
      coop.advancedTicks > 0 ||
      coop.settledFlights > 0 ||
      ensureSeedMarketFormed(caught);
  } else {
    const loadOpts = opts?.skipCatchUp
      ? { maxCatchUpTicks: 0 }
      : opts?.maxCatchUpTicks != null
        ? { maxCatchUpTicks: opts.maxCatchUpTicks }
        : undefined;
    const tickStarted = performance.now();
    const loaded = await activeStore.loadEconomy(loadOpts);
    if (timing && !opts?.skipCatchUp && (opts?.maxCatchUpTicks ?? 0) > 0) {
      timing.tickMs += performance.now() - tickStarted;
    }
    caught = loaded.world;
    advancedTicks = loaded.advancedTicks;
    dirty = loaded.dirty;
  }
  if (timing) timing.lots = Math.max(timing.lots, caught.lots?.length ?? 0);
  const missions = await loadMissions();
  let needsSave = dirty;
  // SP owns one partition, so its world follows the player's hub. Shared
  // worlds derive country per company and reads must never mutate global state.
  const homeCountryPolicy = homeCountryPersistence(
    activeStore.kind,
    isCareerWorldFixed(),
  );
  if (
    homeCountryPolicy.syncWorldHomeCountry &&
    syncHomeCountryFromHub(caught, missions.homeHubIcao)
  ) {
    needsSave = true;
  }
  if (needsSave) {
    await timedSave(() => activeStore.saveEconomy(caught));
  }
  // Always deposit inbound that is already due (readyAtTick <= tick), even when
  // catch-up advanced 0 ticks — UI can show Arriving… until the next pulse
  // otherwise. MP-safe: uses authoritative world.tick, never early before ETA.
  const inboundSettle = settleWarehouseInboundTransfers(missions, caught);
  const concessionHeal = healMissingPortConcessionFromLedger(missions, caught);
  syncWorldPortConcessions(caught, missions);
  if (advancedTicks > 0) {
    tickPortConcessions(missions, caught);
    ensurePortInventoryRestock(caught);
    ensurePortListings(caught);
    const deskCompanyId =
      activeStore.getActiveCompanyId?.() ||
      activeStore.activeCompanyId ||
      undefined;
    tickPortAutoBuyOrders(missions, caught, deskCompanyId);
    if (deskCompanyId && typeof activeStore.vaIsListed === 'function') {
      try {
        const listed = await Promise.resolve(
          activeStore.vaIsListed(deskCompanyId),
        );
        let memberCount = 0;
        if (typeof activeStore.vaListMembers === 'function') {
          const members = await Promise.resolve(
            activeStore.vaListMembers(deskCompanyId),
          );
          memberCount = Array.isArray(members) ? members.length : 0;
        }
        tickVaAutoHaul(missions, caught, {
          companyId: deskCompanyId,
          vaListed: Boolean(listed),
          memberCount,
        });
      } catch {
        /* auto-haul is best-effort on catch-up */
      }
    }
    expireDemandHolds(missions, caught);
    ensureDemandOrders(caught, {
      operatorCatchmentHubs: localOperatorDemandCatchmentHubs(caught),
    });
    await saveMissions(missions);
    await timedSave(() =>
      activeStore.persistPortConcessionIndex(caught.portConcessions ?? []),
    );
    await timedSave(() => persistEconomyUnlocked(caught));
  } else if (
    concessionHeal !== 'none' ||
    inboundSettle.deposited.length > 0 ||
    inboundSettle.yardOverflow.length > 0
  ) {
    await saveMissions(missions);
    if (concessionHeal === 'restored') {
      await timedSave(() =>
        activeStore.persistPortConcessionIndex(caught.portConcessions ?? []),
      );
    }
  }
  return caught;
}

/** Passive company fees after a catch-up write (MP-shaped session settlement). */
async function applyCompanySessionSettlement(opts: {
  fromTick: number;
  toTick: number;
  /** Pulse/headless: bill every company on the world. Session open: active only. */
  allCompanies?: boolean;
  /** Prefer this tenant's OfflineFeeSummary (defaults to store active). */
  preferCompanyId?: string;
  /** Debug +Nd: shift crew airborne clocks on every company. */
  economyAdvanceMs?: number;
}): Promise<OfflineFeeSummary | undefined> {
  const activeStore = requireStore();
  const world = activeStore.peekEconomyWorld();
  if (!world) return undefined;
  const prefer =
    opts.preferCompanyId?.trim() ||
    activeStore.getActiveCompanyId?.() ||
    activeStore.activeCompanyId ||
    undefined;
  if (opts.allCompanies === true) {
    if (typeof activeStore.settleWorldCompaniesPassiveFees === 'function') {
      const summary = await Promise.resolve(
        activeStore.settleWorldCompaniesPassiveFees({
          world,
          fromTick: opts.fromTick,
          toTick: opts.toTick,
          worldId: LOCAL_WORLD_ID,
          preferCompanyId: prefer,
          economyAdvanceMs: opts.economyAdvanceMs,
        }),
      );
      return summary ?? undefined;
    }
    // Store without settle-all: settle each company explicitly —
    // never fall through to ambient activeCompanyId (that can thrash/wipe tenants).
    const companies = await Promise.resolve(
      activeStore.listWorldCompanies(LOCAL_WORLD_ID),
    );
    let preferred: OfflineFeeSummary | undefined;
    for (const company of companies) {
      try {
        const missions = await loadMissions({ companyId: company.id });
        try {
          if (opts.economyAdvanceMs) {
            applyEconomyAdvanceToCrewAirborne(missions, opts.economyAdvanceMs);
          }
          const fromTick = companySessionFromTick(
            missions,
            opts.fromTick,
            opts.toTick,
          );
          let vaListed = false;
          let memberCount = 0;
          if (typeof activeStore.vaIsListed === 'function') {
            vaListed = Boolean(
              await Promise.resolve(activeStore.vaIsListed(company.id)),
            );
          }
          if (typeof activeStore.vaListMembers === 'function') {
            const members = await Promise.resolve(
              activeStore.vaListMembers(company.id),
            );
            memberCount = Array.isArray(members) ? members.length : 0;
          }
          const summary = settleCompanyPassiveFeesForTickRange(
            missions,
            world,
            fromTick,
            opts.toTick,
            Date.now(),
            {
              companyId: company.id,
              vaListed,
              memberCount,
            },
          );
          if (summary && prefer && company.id === prefer) {
            preferred = summary;
          }
        } finally {
          missions.lastSeenTick = opts.toTick;
          await saveMissions(missions, { companyId: company.id });
        }
      } catch (error) {
        console.error(
          `[career] pulse company settle skipped company=${company.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    return preferred;
  }
  const missions = await loadMissions(
    prefer ? { companyId: prefer } : undefined,
  );
  try {
    if (opts.economyAdvanceMs) {
      applyEconomyAdvanceToCrewAirborne(missions, opts.economyAdvanceMs);
    }
    const fromTick = companySessionFromTick(missions, opts.fromTick, opts.toTick);
    let vaListed = false;
    let memberCount = 0;
    const deskCompanyId = prefer;
    if (deskCompanyId && typeof activeStore.vaIsListed === 'function') {
      vaListed = Boolean(
        await Promise.resolve(activeStore.vaIsListed(deskCompanyId)),
      );
    }
    if (
      deskCompanyId &&
      typeof activeStore.vaListMembers === 'function'
    ) {
      const members = await Promise.resolve(
        activeStore.vaListMembers(deskCompanyId),
      );
      memberCount = Array.isArray(members) ? members.length : 0;
    }
    const summary = settleCompanyPassiveFeesForTickRange(
      missions,
      world,
      fromTick,
      opts.toTick,
      Date.now(),
      deskCompanyId
        ? { companyId: deskCompanyId, vaListed, memberCount }
        : undefined,
    );
    return summary ?? undefined;
  } finally {
    missions.lastSeenTick = opts.toTick;
    await saveMissions(missions, prefer ? { companyId: prefer } : undefined);
  }
}

type IncomingWithAuth = import('node:http').IncomingMessage & {
  __skylineAuthSession?: AuthSessionContext | null;
  __skylineAuthPrimed?: boolean;
};

async function primeAuthSession(
  req: import('node:http').IncomingMessage,
): Promise<void> {
  const r = req as IncomingWithAuth;
  if (r.__skylineAuthPrimed) return;
  r.__skylineAuthPrimed = true;
  if (!store?.supportsAuth) {
    r.__skylineAuthSession = null;
    return;
  }
  const token = bearerTokenFromHeader(req.headers.authorization);
  if (!token) {
    r.__skylineAuthSession = null;
    return;
  }
  try {
    r.__skylineAuthSession = await Promise.resolve(
      store.authResolveSession(token),
    );
  } catch {
    r.__skylineAuthSession = null;
  }
}

function authSessionFromRequest(
  req: import('node:http').IncomingMessage,
): AuthSessionContext | null {
  const r = req as IncomingWithAuth;
  if (r.__skylineAuthPrimed) return r.__skylineAuthSession ?? null;
  if (!store?.supportsAuth) return null;
  const token = bearerTokenFromHeader(req.headers.authorization);
  if (!token) return null;
  try {
    const resolved = store.authResolveSession(token);
    // Sync SQLite path — Postgres must be primed via primeAuthSession first.
    if (resolved && typeof (resolved as Promise<unknown>).then === 'function') {
      return null;
    }
    return resolved as AuthSessionContext | null;
  } catch {
    return null;
  }
}

function companyIdFromRequest(
  req: import('node:http').IncomingMessage,
  bodyCompanyId?: string | null,
): string {
  const headerRaw = req.headers['x-skyline-company-id'];
  const header =
    typeof headerRaw === 'string'
      ? headerRaw
      : Array.isArray(headerRaw)
        ? headerRaw[0]
        : undefined;
  const requestedRaw =
    bodyCompanyId?.trim() ||
    header?.trim() ||
    store?.getActiveCompanyId() ||
    LOCAL_COMPANY_ID;
  const authRequired = isCareerAuthRequired();
  const session = authSessionFromRequest(req);

  if (authRequired) {
    if (!session || session.companies.length === 0) {
      try {
        return resolveCompanyId({
          requested: LOCAL_COMPANY_ID,
          worldId: LOCAL_WORLD_ID,
          db: null,
        });
      } catch {
        return LOCAL_COMPANY_ID;
      }
    }
    const owned = new Set(session.companies.map((c) => c.id));
    let pick: string | null = owned.has(requestedRaw) ? requestedRaw : null;
    // VA members: body/header may target the listed company they don't own.
    if (!pick && store?.supportsAuth && requestedRaw !== LOCAL_COMPANY_ID) {
      try {
        const membership = store.vaGetMembership(
          session.account.id,
          requestedRaw,
        );
        if (
          membership &&
          typeof (membership as Promise<unknown>).then !== 'function' &&
          (membership as { companyId?: string }).companyId
        ) {
          pick = requestedRaw;
        }
      } catch {
        /* fall through to home */
      }
    }
    if (!pick) pick = session.companies[0]!.id;
    try {
      return resolveCompanyId({
        requested: pick,
        worldId: LOCAL_WORLD_ID,
        db: null,
      });
    } catch {
      return session.companies[0]!.id;
    }
  }

  try {
    return resolveCompanyId({
      requested: requestedRaw,
      worldId: LOCAL_WORLD_ID,
      db: null,
    });
  } catch {
    return LOCAL_COMPANY_ID;
  }
}

async function companyDisplayNameMap(
  store: CareerStore,
): Promise<Map<string, string>> {
  const rows = await Promise.resolve(store.listWorldCompanies(LOCAL_WORLD_ID));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.displayName?.trim() || row.id);
  }
  return map;
}

/**
 * Listed VA company ids for this account — Port FBO buy/ETA inheritance.
 * Empty when not a member/owner of any va_listed company.
 */
async function portOperatorAlliedCompanyIds(
  req: import('node:http').IncomingMessage,
): Promise<string[]> {
  if (!store?.supportsAuth) return [];
  const session = authSessionFromRequest(req);
  if (!session) return [];
  try {
    const listed = await Promise.resolve(
      store.vaListedMembership(session.account.id),
    );
    const id = listed?.companyId?.trim();
    return id ? [id] : [];
  } catch {
    return [];
  }
}

async function resolveCompanyDisplayName(
  store: CareerStore,
  companyId: string | null | undefined,
): Promise<string | null> {
  const id = companyId?.trim();
  if (!id) return null;
  const map = await companyDisplayNameMap(store);
  return map.get(id) ?? id;
}

function recordPresence(
  world: CareerEconomyWorld,
  opts: {
    kind: 'lot_accept' | 'port_claim' | 'aircraft_buy' | 'aircraft_lease';
    companyId: string;
    companyDisplayName: string;
    summary: string;
  },
): void {
  pushPresenceEvent(world, {
    kind: opts.kind,
    atTick: world.tick,
    atMs: Date.now(),
    companyId: opts.companyId,
    companyDisplayName: opts.companyDisplayName,
    summary: opts.summary,
  });
}

/** F7 DB claim before wallet debit; returns whether a claim was taken. */
async function tryClaimDealerListing(opts: {
  store: CareerStore;
  listingId: string;
  companyId: string;
}): Promise<'ok' | 'unavailable' | 'skipped'> {
  if (typeof opts.store.claimAircraftInstance !== 'function') {
    return 'skipped';
  }
  const result = await opts.store.claimAircraftInstance({
    instanceId: opts.listingId,
    companyId: opts.companyId,
  });
  return result === 'claimed' ? 'ok' : 'unavailable';
}

async function releaseDealerListingClaim(opts: {
  store: CareerStore;
  listingId: string;
  companyId: string;
}): Promise<void> {
  if (typeof opts.store.releaseAircraftInstanceClaim !== 'function') return;
  try {
    await opts.store.releaseAircraftInstanceClaim({
      instanceId: opts.listingId,
      companyId: opts.companyId,
    });
  } catch {
    /* best-effort rollback */
  }
}

async function activateCompanyContext(
  companyId: string,
  accountId?: string,
): Promise<string> {
  const activeStore = requireStore();
  const id = resolveCompanyId({
    requested: companyId,
    worldId: LOCAL_WORLD_ID,
    db: null,
  });
  if (isCareerAuthRequired() && accountId) {
    const owns = await Promise.resolve(
      activeStore.authAccountOwnsCompany(accountId, id),
    );
    if (!owns) {
      throw new Error('company not available to this account');
    }
  }
  const known = await Promise.resolve(
    activeStore.listWorldCompanies(LOCAL_WORLD_ID),
  );
  if (known.length > 0 && !known.some((c) => c.id === id)) {
    if (id !== LOCAL_COMPANY_ID) {
      throw new Error(`Unknown company ${id}`);
    }
  }
  activeStore.setActiveCompanyId(id);
  return id;
}

/**
 * Fleet mutations that spend/change VA assets: owner-only when company is VA-listed.
 */
async function assertVaOwnerForFleetMutation(
  req: import('node:http').IncomingMessage,
  companyId: string,
  actionLabel = 'change VA fleet',
): Promise<void> {
  if (!store?.supportsAuth) return;
  const listed = await Promise.resolve(store.vaIsListed(companyId));
  if (!listed) return;
  const session = authSessionFromRequest(req);
  if (!session) {
    throw new Error(`Authentication required to ${actionLabel}`);
  }
  const membership = await Promise.resolve(
    store.vaGetMembership(session.account.id, companyId),
  );
  if (!membership || membership.role !== 'owner') {
    throw new Error(`Only the VA owner can ${actionLabel}`);
  }
}

/**
 * Port FBO desk ops (auto-buy / stevedore / shuttle / yard abandon):
 * owner or dispatcher when company is VA-listed. Solo companies skip.
 */
async function assertVaPortDeskOps(
  req: import('node:http').IncomingMessage,
  companyId: string,
  actionLabel = 'run Port FBO desk ops',
): Promise<void> {
  if (!store?.supportsAuth) return;
  const listed = await Promise.resolve(store.vaIsListed(companyId));
  if (!listed) return;
  const session = authSessionFromRequest(req);
  if (!session) {
    throw new Error(`Authentication required to ${actionLabel}`);
  }
  const membership = await Promise.resolve(
    store.vaGetMembership(session.account.id, companyId),
  );
  if (!membership || !canMutateVaPortDeskOps(membership.role)) {
    throw new Error(`Owner or dispatcher only — ${actionLabel}`);
  }
}

function vaPermissionStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /Only the VA owner|Owner or dispatcher|Authentication required/i.test(
      message,
    )
  ) {
    return 403;
  }
  return 400;
}

/** @deprecated alias — MX uses the same owner gate. */
async function assertVaOwnerForFleetMx(
  req: import('node:http').IncomingMessage,
  companyId: string,
): Promise<void> {
  return assertVaOwnerForFleetMutation(
    req,
    companyId,
    'pay maintenance or repair on company aircraft',
  );
}

/** Flight-quality org perks for a listed VA (noop tiers for solo / missing). */
async function loadVaOrgPerksForCompany(
  companyId: string | null | undefined,
): Promise<{
  flightQuality: VaFlightQualitySnapshot | null;
  orgPerks: VaOrgPerks;
}> {
  const empty = {
    flightQuality: null as VaFlightQualitySnapshot | null,
    orgPerks: resolveVaOrgPerks(null),
  };
  if (!companyId || !store?.supportsAuth) return empty;
  try {
    const listed = await Promise.resolve(store.vaIsListed(companyId));
    if (!listed) return empty;
    const tick =
      typeof store.peekEconomyWorld === 'function'
        ? (store.peekEconomyWorld()?.tick ?? 0)
        : 0;
    const toDay = vaDayKeyFromTick(tick);
    const fromDay = Math.max(0, toDay - (VA_FLIGHT_QUALITY_WINDOW_DAYS - 1));
    const flightQuality = await Promise.resolve(
      store.vaFlightQuality({
        companyId,
        fromDayKey: fromDay,
        toDayKey: toDay,
      }),
    );
    return {
      flightQuality,
      orgPerks: resolveVaOrgPerks(flightQuality),
    };
  } catch {
    return empty;
  }
}

async function resolveVaFleetActor(
  req: import('node:http').IncomingMessage,
  companyId: string,
): Promise<{
  accountId: string | null;
  isOwner: boolean;
  isMember: boolean;
}> {
  if (!store?.supportsAuth) {
    return { accountId: null, isOwner: true, isMember: true };
  }
  const session = authSessionFromRequest(req);
  if (!session) {
    return { accountId: null, isOwner: false, isMember: false };
  }
  const listed = await Promise.resolve(store.vaIsListed(companyId));
  if (!listed) {
    return {
      accountId: session.account.id,
      isOwner: true,
      isMember: true,
    };
  }
  const membership = await Promise.resolve(
    store.vaGetMembership(session.account.id, companyId),
  );
  return {
    accountId: session.account.id,
    isOwner: membership?.role === 'owner',
    isMember: Boolean(membership),
  };
}

function missionIsInFlight(
  missions: { missions?: Array<{ id: string; status?: string }> },
  aircraft: { assignedMissionId?: string; status?: string },
): boolean {
  if (aircraft.status === 'assigned' && aircraft.assignedMissionId) {
    const m = (missions.missions ?? []).find(
      (row) => row.id === aircraft.assignedMissionId,
    );
    if (m?.status === 'in_flight') return true;
  }
  return false;
}

function requireAuthSession(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): AuthSessionContext | null {
  if (!isCareerAuthRequired()) return null;
  const session = authSessionFromRequest(req);
  if (!session) {
    send(res, 401, {
      error: 'Authentication required',
      code: 'auth_required',
    });
    return null;
  }
  return session;
}

/** Paths that stay open when CAREER_AUTH=1 (no Bearer). */
function isAuthPublicPath(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true;
  if (path === '/api/health') return true;
  if (path === '/api/auth/status') return true;
  if (path === '/api/auth/register' || path === '/api/auth/login') return true;
  if (path === '/api/auth/logout') return true;
  if (path.startsWith('/api/profiles')) return true;
  // Map style requires Bearer when CAREER_AUTH=1 (not public).
  if (path.startsWith('/worlds/') && path.endsWith('/clock')) return true;
  if (path === '/api/world/clock') return true;
  return false;
}

async function persistEconomyUnlocked(world: CareerEconomyWorld): Promise<void> {
  // Do NOT stomp lastBatchAtMs — fractional hour + continuous ops depend on it.
  await requireStore().saveEconomy(world);
}

/** GET/health snapshot — no hourly catch-up (timer / POST /api/tick do that). */
function loadEconomy(): Promise<CareerEconomyWorld> {
  return withCareerLock(() => loadEconomyUnlocked({ skipCatchUp: true }));
}

/** API requests never mutate/retain the Postgres store's shared RAM snapshot. */
function isolatePostgresWorldSnapshot(
  activeStore: CareerStore,
  world: CareerEconomyWorld,
): CareerEconomyWorld {
  return activeStore.kind === 'postgres' ? structuredClone(world) : world;
}

/**
 * Load world + missions under one lock. Button/GET paths skip hourly catch-up;
 * the 60s timer and POST /api/tick advance the world.
 */
async function withCareerRead<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
  opts?: { companyId?: string },
): Promise<T> {
  if (careerApiMode === 'gateway' && gatewayWorldClient) {
    const auth: WorldApiAuth = {
      ...gatewayAuthOrThrow(),
      ...(opts?.companyId ? { companyId: opts.companyId } : {}),
    };
    const missions = await gatewayLoadMissions(gatewayWorldClient, auth);
    return fn(gatewayEconomyShell(), missions);
  }
  return withCareerLock(async () => {
    const activeStore = requireStore();
    const world = isolatePostgresWorldSnapshot(
      activeStore,
      await loadEconomyUnlocked({ skipCatchUp: true }),
    );
    const companyId = opts?.companyId?.trim();
    const missions = await loadMissions(companyId ? { companyId } : undefined);
    const crew = settleCrewOpsDue(missions, world, Date.now());
    const landed = finalizeStuckNpcFerries(missions, world.tick);
    const overhauled = finalizeAircraftOverhaulsDue(missions, world.tick);
    if (crew.settled.length > 0 || landed.length > 0 || overhauled.length > 0) {
      await saveMissions(missions, companyId ? { companyId } : undefined);
    }
    return fn(world, missions);
  });
}

/**
 * Quote / plan reads that must not queue behind the world pulse.
 * Peeks the in-memory economy (no world lock, no crew settle) + loads missions.
 * Mutating writes still use withCareerWrite.
 */
async function withCareerPeekRead<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
  opts?: { companyId?: string },
): Promise<T> {
  if (careerApiMode === 'gateway' && gatewayWorldClient) {
    const auth: WorldApiAuth = {
      ...gatewayAuthOrThrow(),
      ...(opts?.companyId ? { companyId: opts.companyId } : {}),
    };
    const missions = await gatewayLoadMissions(gatewayWorldClient, auth);
    await mirrorHomePilotIcaoOntoOps(missions, opts?.companyId);
    return fn(gatewayEconomyShell(), missions);
  }
  const activeStore = requireStore();
  const world = activeStore.peekEconomyWorld();
  if (!world) {
    throw new Error('Economy not loaded');
  }
  const companyId = opts?.companyId?.trim();
  const missions = await loadMissions(companyId ? { companyId } : undefined);
  await mirrorHomePilotIcaoOntoOps(missions, companyId);
  return fn(world, missions);
}

type CareerWriteOpts = {
  housekeeping?: boolean;
  /** Default false — only the timer / POST /api/tick should pass true. */
  catchUp?: boolean;
  /** Batches per catch-up write (default CATCH_UP_TICKS_PER_PULSE). */
  catchUpTicks?: number;
  /** Background pulse: cooperative tick via LocalWorldTickService. */
  cooperative?: boolean;
  /**
   * Pulse spike diag — accumulate tick/save/lots for this catch-up write.
   * Only used when `catchUp: true`.
   */
  catchUpTiming?: PulseChunkTiming;
  /** `performance.now()` when the caller queued this write (lock-wait diag). */
  lockQueuedAtMs?: number;
  /** Per-request company tenant (avoids ambient activeCompanyId thrash). */
  companyId?: string;
  /** Stamp ledger rows for this account (overrides request ambient). */
  actorAccountId?: string;
  /** Skip saveEconomy when the handler only mutates company/missions. */
  persist?:
    | 'economy'
    | 'company'
    | 'blob'
    | 'aircraftMarket'
    | 'portMarket'
    | 'demandBoard'
    | 'inbound'
    | 'npcLive';
  persistDemandOrderId?: string;
  persistPortListingId?: string;
  persistPortConcessions?: boolean;
  commandSliceMissionId?: string;
  commandSliceHoldId?: string;
  commandSliceLotIds?: string[];
  commandSliceIcaos?: string[];
  commandSliceAircraftId?: string;
};

/**
 * Dual-tenant: chrome pilot lives on the home company. VA ops missions often
 * keep a stale pilotIcao — mirror home onto ops before co-location asserts
 * (Accept / fuel / depart) so Travel on home is honored.
 */
async function mirrorHomePilotIcaoOntoOps(
  missions: MissionsFile,
  opsCompanyId: string | undefined,
  opts?: { accountId?: string | null },
): Promise<void> {
  const companyId = opsCompanyId?.trim();
  if (!companyId || !store?.supportsAuth) return;
  const accountId =
    opts?.accountId?.trim() || peekLedgerActorAccountId() || '';
  if (!accountId) return;
  try {
    const homeId =
      (await Promise.resolve(store.vaHomeCompanyId(accountId))) ?? companyId;
    if (!homeId || homeId === companyId) return;
    const home = await loadMissions({ companyId: homeId });
    const icao = (
      home.pilotIcao?.trim() ||
      home.homeHubIcao?.trim() ||
      ''
    ).toUpperCase();
    if (icao) missions.pilotIcao = icao;
  } catch {
    /* soft — leave ops pilotIcao */
  }
}

/**
 * Pilot hub + travel cash live on the account home company (chrome sticky).
 * Crew may pin a VA tenant in the header — never debit that for member travel.
 */
async function resolvePilotTravelCompanyId(
  req: import('node:http').IncomingMessage,
  requestedCompanyId: string,
): Promise<{ companyId: string; actorAccountId?: string }> {
  const requested = requestedCompanyId.trim();
  const session = authSessionFromRequest(req);
  const actorAccountId = session?.account?.id?.trim() || undefined;
  if (!actorAccountId || !store?.supportsAuth) {
    return { companyId: requested, actorAccountId };
  }
  try {
    const home = await Promise.resolve(store.vaHomeCompanyId(actorAccountId));
    const id = home?.trim();
    if (id) return { companyId: id, actorAccountId };
  } catch {
    /* fall through */
  }
  return { companyId: requested, actorAccountId };
}

/**
 * Load, mutate, and persist. Default: no hourly tick, full economy save.
 * `persist: 'company'` writes missions only (plus optional demand/listing/concession
 * upserts). `persist: 'blob'` writes economy stub + dealer pool table (not live cargo).
 * `persist: 'aircraftMarket'` writes dealer pool + company (buy/lease/sell) — not lots/NPC.
 * `persist: 'portMarket'` rewrites port listings+inventory (GET /api/ports seed)
 * and company_state (hire-desk pool may roll in that snapshot).
 * `persist: 'demandBoard'` rewrites demand_orders only. `persist: 'inbound'` patches inbound_pending.
 * `persist: 'npcLive'` writes NPC roster/flights + dirty lots/inbound/airports (not port ops).
 */
async function withCareerWrite<T>(
  fn: (world: CareerEconomyWorld, missions: MissionsFile) => Promise<T> | T,
  opts?: CareerWriteOpts,
): Promise<T> {
  if (careerApiMode === 'gateway') {
    throw new Error(
      'gateway mode: economy writes must go to the world host (use HTTP proxy)',
    );
  }
  // Pulse / catch-up must not inherit a prior request's ledger actor.
  const writeActor =
    opts?.catchUp === true
      ? undefined
      : opts?.actorAccountId?.trim() || undefined;
  const isCatchUp = opts?.catchUp === true;
  const companyOnly =
    opts?.persist === 'company' &&
    !opts?.commandSliceMissionId?.trim() &&
    !(opts?.commandSliceLotIds?.length) &&
    !(opts?.commandSliceIcaos?.length) &&
    !opts?.commandSliceHoldId?.trim() &&
    !opts?.commandSliceAircraftId?.trim() &&
    !opts?.persistDemandOrderId?.trim() &&
    !opts?.persistPortListingId?.trim() &&
    opts?.persistPortConcessions !== true;

  type DeferredPersist = {
    pulseSnapshot?: CareerEconomyWorld;
    commandSlice?: {
      world: CareerEconomyWorld;
      missionId: string;
      lotIds: string[];
      icaos: string[];
      demandOrderId?: string;
      contractPilot?: boolean;
    };
  };
  const deferred: DeferredPersist = {};

  const withWriteLock = <R>(body: () => Promise<R>): Promise<R> => {
    if (!companyOnly) return withCareerLock(body);
    const diag = careerWriteDiag.getStore();
    const queuedAt = diag ? performance.now() : 0;
    return companyLock.withLock(async () => {
      if (diag) diag.lockWaitMs += performance.now() - queuedAt;
      const holdAt = performance.now();
      try {
        return await body();
      } finally {
        if (diag) diag.inLockMs += performance.now() - holdAt;
      }
    });
  };

  const runWrite = () =>
    withWriteLock(async () => {
  if (opts?.catchUpTiming && opts.lockQueuedAtMs != null) {
    opts.catchUpTiming.lockWaitMs = performance.now() - opts.lockQueuedAtMs;
  }
  const activeStore = requireStore();
  if (careerApiMode === 'world' && activeStore.kind === 'postgres') {
    const acquired =
      activeStore.acquireWorldWriterLease &&
      (await activeStore.acquireWorldWriterLease());
    if (!acquired) {
      worldWriterLeaseState = 'denied';
      worldWriterLeaseError =
        'Another process owns the Postgres world-writer lease';
      throw new Error(worldWriterLeaseError);
    }
    worldWriterLeaseState = 'acquired';
    worldWriterLeaseError = null;
  }
  const companyId = opts?.companyId?.trim();
  const companyOpts = companyId ? { companyId } : undefined;
  const missions = await loadMissions(companyOpts);
  if (opts?.catchUp !== true) {
    await mirrorHomePilotIcaoOntoOps(missions, companyId, {
      accountId: writeActor,
    });
  }
  // Phase 4 remote client: never simulate ticks locally — host owns the clock.
  const skipCatchUp =
    isRemoteWorldTickEnabled() || opts?.catchUp !== true;
  const catchUpTicks =
    !skipCatchUp && opts?.catchUp === true
      ? (opts.catchUpTicks ?? CATCH_UP_TICKS_PER_PULSE)
      : undefined;
  const persistCompany = opts?.persist === 'company';
  const persistBlob = opts?.persist === 'blob';
  const persistAircraftMarket = opts?.persist === 'aircraftMarket';
  const persistPortMarket = opts?.persist === 'portMarket';
  const persistDemandBoard = opts?.persist === 'demandBoard';
  const persistInbound = opts?.persist === 'inbound';
  const persistNpcLive = opts?.persist === 'npcLive';
  const demandOrderId = opts?.persistDemandOrderId?.trim();
  const portListingId = opts?.persistPortListingId?.trim();
  const persistPortConcessions = opts?.persistPortConcessions === true;
  const sliceId = opts?.commandSliceMissionId?.trim();
  const holdSliceId = opts?.commandSliceHoldId?.trim();
  const sliceLotIdsOpt = (opts?.commandSliceLotIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  if (holdSliceId) {
    const hold = missions.playerFbos?.holds?.find((h) => h.id === holdSliceId);
    const lotId = hold?.lotId?.trim();
    if (lotId) sliceLotIdsOpt.push(lotId);
  }
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
      world = await loadEconomyUnlocked({
        skipCatchUp,
        maxCatchUpTicks: catchUpTicks,
        cooperative: opts?.cooperative,
        catchUpTiming: opts?.catchUpTiming,
        deferPersist: isCatchUp,
      });
    }
    // Catch-up / POST /api/tick must mutate live Postgres RAM. Isolating a clone
    // then deferred-saving peekEconomyWorld() discarded forced +Nd ticks (world
    // day stuck) while the JSON response still reported the clone's advanced tick.
    if (isCatchUp) {
      world = activeStore.peekEconomyWorld() ?? world;
    } else {
      world = isolatePostgresWorldSnapshot(activeStore, world);
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
      persistAircraftMarket ||
      persistPortMarket ||
      persistDemandBoard ||
      persistInbound ||
      persistNpcLive
        ? false
        : opts?.housekeeping !== false;
    if (housekeeping) {
      settleCrewOpsDue(missions, world, Date.now());
      reconcileLotReservations(world, missions);
      cancelOrphanPlayerMissions(world, missions);
      expireStaleActiveMissions(world, missions);
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
      await saveMissions(missions, companyOpts);
      return result;
    }
    if (persistBlob) {
      await activeStore.saveEconomy(world, { liveTables: false });
      await activeStore.persistAircraftPool(world);
      await saveMissions(missions, companyOpts);
      return result;
    }
    if (persistAircraftMarket) {
      await activeStore.persistAircraftPool(world);
      await saveMissions(missions, companyOpts);
      return result;
    }
    if (persistPortMarket) {
      await activeStore.persistPortMarketTables(world);
      // Postgres commits listings, inventory and concessions under one revision.
      // Embedded stores retain their separate concession table update.
      if (activeStore.kind !== 'postgres') {
        await activeStore.persistPortConcessionIndex(
          world.portConcessions ?? [],
        );
      }
      // Hire-desk pool lives on company_state; snapshot may roll it here.
      await saveMissions(missions, companyOpts);
      return result;
    }
    if (persistDemandBoard) {
      await activeStore.persistDemandBoardTables(world);
      await saveMissions(missions, companyOpts);
      return result;
    }
    if (persistInbound) {
      await activeStore.persistInboundPending(world);
      return result;
    }
    if (persistNpcLive) {
      await activeStore.persistNpcLiveWorld(world);
      await saveMissions(missions, companyOpts);
      return result;
    }
    if (useCommandPersist) {
      const sliceMission = sliceMissionId
        ? missions.missions.find((row) => row.id === sliceMissionId)
        : undefined;
      const sliceOpts = {
        missionId: sliceMissionId,
        lotIds: sliceLotIds,
        icaos: sliceIcaos,
      };
      if (
        activeStore.kind === 'postgres' &&
        typeof activeStore.applyCommandWorldSliceToRam === 'function'
      ) {
        // Publish claim/stock into live RAM under worldLock; PG UPSERT after unlock.
        activeStore.applyCommandWorldSliceToRam(world, sliceOpts);
        deferred.commandSlice = {
          world,
          ...sliceOpts,
          demandOrderId:
            demandOrderId || sliceMission?.demandOrderId?.trim() || undefined,
          contractPilot: Boolean(sliceMission?.contractPilot),
        };
      } else {
        await activeStore.persistCommandWorldSlice(world, sliceOpts);
        const demandId =
          demandOrderId || sliceMission?.demandOrderId?.trim() || '';
        if (demandId) {
          const order = world.demandOrders?.find((row) => row.id === demandId);
          if (order) await activeStore.persistDemandOrder(order);
        }
        if (sliceMission?.contractPilot) {
          await activeStore.persistNpcLiveWorld(world);
        }
      }
    } else if (isCatchUp) {
      // Tick already mutated live RAM (cooperative load or /api/tick handler).
      // Persist a frozen snapshot outside the lock — must be the mutated world,
      // not a stale pre-isolate peek.
      deferred.pulseSnapshot = structuredClone(world);
    } else {
      const timing = opts?.catchUpTiming;
      if (timing) {
        const t0 = performance.now();
        await persistEconomyUnlocked(world);
        timing.saveMs += performance.now() - t0;
        timing.lots = Math.max(timing.lots, world.lots?.length ?? 0);
      } else {
        await persistEconomyUnlocked(world);
      }
    }
    await saveMissions(missions, companyOpts);
    return result;
  });

  const result =
    isCatchUp
      ? await runWithLedgerActorAccountId(undefined, runWrite)
      : writeActor
        ? await runWithLedgerActorAccountId(writeActor, runWrite)
        : await runWrite();

  const activeStore = requireStore();
  if (deferred.pulseSnapshot) {
    const timing = opts?.catchUpTiming;
    const t0 = performance.now();
    await activeStore.saveEconomy(deferred.pulseSnapshot, {
      applyToRam: false,
    });
    if (timing) {
      timing.saveMs += performance.now() - t0;
      timing.lots = Math.max(
        timing.lots,
        deferred.pulseSnapshot.lots?.length ?? 0,
      );
    }
    await activeStore.flushDirtyCommandLots?.();
  }
  if (deferred.commandSlice) {
    const slice = deferred.commandSlice;
    await activeStore.persistCommandWorldSlice(slice.world, {
      missionId: slice.missionId,
      lotIds: slice.lotIds,
      icaos: slice.icaos,
    });
    if (slice.demandOrderId) {
      const order = slice.world.demandOrders?.find(
        (row) => row.id === slice.demandOrderId,
      );
      if (order) await activeStore.persistDemandOrder(order);
    }
    if (slice.contractPilot) {
      await activeStore.persistNpcLiveWorld(slice.world);
    }
  }
  return result;
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

/**
 * Stamp dual-tenant pilot + VA tag onto Accept / Dispatch mission creates.
 * `vaFlight` is set when the ops company is `va_listed` (VA aircraft / VA ops).
 */
async function vaPilotMissionStamp(
  req: import('node:http').IncomingMessage,
  opsCompanyId: string | undefined,
): Promise<{
  pilotAccountId?: string;
  pilotHomeCompanyId?: string;
  vaFlight?: boolean;
}> {
  const session = authSessionFromRequest(req);
  const cid = opsCompanyId?.trim();
  if (!session || !cid) return {};
  const pilotHome =
    store?.supportsAuth
      ? ((await Promise.resolve(store.vaHomeCompanyId(session.account.id))) ??
        cid)
      : cid;
  const listed =
    Boolean(store?.supportsAuth) &&
    (await Promise.resolve(store!.vaIsListed(cid)));
  return {
    pilotAccountId: session.account.id,
    ...(pilotHome ? { pilotHomeCompanyId: pilotHome } : {}),
    ...(listed ? { vaFlight: true as const } : {}),
  };
}

/**
 * VA member progression: gates + XP use the pilot's home company ladder,
 * not the VA ops company. Owner / solo → ops company ladders.
 */
async function resolvePilotProgressionOps(
  req: import('node:http').IncomingMessage,
  opsCompanyId: string,
  opsMissions: Pick<CareerMissionsState, 'cargoOps' | 'classOps'> & {
    pilotFlightHours?: number;
    lastSettleOutcome?: CareerMissionsState['lastSettleOutcome'];
  },
): Promise<{
  cargoOps: CareerMissionsState['cargoOps'];
  classOps: CareerMissionsState['classOps'];
  pilotFlightHours: number;
  lastSettleOutcome: CareerMissionsState['lastSettleOutcome'];
  homeCompanyId: string | null;
  crossCompany: boolean;
}> {
  const session = authSessionFromRequest(req);
  if (!session || !store?.supportsAuth) {
    return {
      cargoOps: cargoOpsForRequest(req, opsMissions.cargoOps),
      classOps: classOpsForRequest(req, opsMissions.classOps),
      pilotFlightHours: opsMissions.pilotFlightHours ?? 0,
      lastSettleOutcome: opsMissions.lastSettleOutcome,
      homeCompanyId: null,
      crossCompany: false,
    };
  }
  const homeId =
    (await Promise.resolve(store.vaHomeCompanyId(session.account.id))) ??
    opsCompanyId;
  if (!homeId || homeId === opsCompanyId) {
    return {
      cargoOps: cargoOpsForRequest(req, opsMissions.cargoOps),
      classOps: classOpsForRequest(req, opsMissions.classOps),
      pilotFlightHours: opsMissions.pilotFlightHours ?? 0,
      lastSettleOutcome: opsMissions.lastSettleOutcome,
      homeCompanyId: homeId,
      crossCompany: false,
    };
  }
  const home = await withCareerRead(
    (_world, missions) => ({
      cargoOps: missions.cargoOps,
      classOps: missions.classOps,
      pilotFlightHours: missions.pilotFlightHours ?? 0,
      lastSettleOutcome: missions.lastSettleOutcome,
    }),
    { companyId: homeId },
  );
  return {
    cargoOps: cargoOpsForRequest(req, home.cargoOps),
    classOps: classOpsForRequest(req, home.classOps),
    pilotFlightHours: home.pilotFlightHours,
    lastSettleOutcome: home.lastSettleOutcome,
    homeCompanyId: homeId,
    crossCompany: true,
  };
}

/** Temporarily gate accept/dispatch on pilot home ladders (VA member). */
function withProgressionGates<T>(
  missions: CareerMissionsState,
  prog: {
    cargoOps: CareerMissionsState['cargoOps'];
    classOps: CareerMissionsState['classOps'];
  },
  fn: () => T,
): T {
  const savedCargo = missions.cargoOps;
  const savedClass = missions.classOps;
  missions.cargoOps = prog.cargoOps;
  missions.classOps = prog.classOps;
  try {
    return fn();
  } finally {
    missions.cargoOps = savedCargo;
    missions.classOps = savedClass;
  }
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
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Skyline-Dev-Mode, X-Skyline-Company-Id, X-Skyline-Client-Version',
  });
  res.end(json);
}

async function resolveClientUpdatePolicy(
  active: CareerStore | null,
): Promise<ClientUpdatePolicy> {
  if (!active) return { ...DEFAULT_CLIENT_UPDATE_POLICY };
  if (typeof active.readEconomyMiscField === 'function') {
    try {
      const raw = await active.readEconomyMiscField('clientUpdatePolicy');
      const policy = parseClientUpdatePolicy(raw);
      const peeked = active.peekEconomyWorld?.() ?? null;
      if (peeked) peeked.clientUpdatePolicy = policy;
      return policy;
    } catch {
      /* fall through to peeked world */
    }
  }
  return parseClientUpdatePolicy(active.peekEconomyWorld()?.clientUpdatePolicy);
}

function clientVersionFromRequest(
  req: import('node:http').IncomingMessage,
): string | null {
  const raw = req.headers[CLIENT_VERSION_HEADER];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const first = raw.find((v) => typeof v === 'string' && v.trim());
    if (first) return first.trim();
  }
  return null;
}

/** Returns true when the response was already sent (426). */
function rejectIfClientUpdateRequired(
  res: import('node:http').ServerResponse,
  policy: ClientUpdatePolicy,
  clientVersion: string | null,
): boolean {
  const rejection = clientUpdateGateRejection(policy, clientVersion);
  if (!rejection) return false;
  send(res, rejection.status, rejection.body);
  return true;
}

/** Preserve upstream auth/status contracts for sim-local gateway handlers. */
function sendRouteError(
  res: import('node:http').ServerResponse,
  error: unknown,
  fallbackStatus: number,
): void {
  if (error instanceof WorldApiError) {
    const upstream =
      error.body && typeof error.body === 'object' && !Array.isArray(error.body)
        ? (error.body as Record<string, unknown>)
        : {};
    send(res, error.status, {
      ...upstream,
      error: error.message,
    });
    return;
  }
  send(res, fallbackStatus, {
    error: error instanceof Error ? error.message : String(error),
  });
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
  const clock = worldClockFromEconomy(world, LOCAL_WORLD_ID, nowMs);
  return {
    serverNowMs: clock.serverNowMs,
    lastBatchAtMs: clock.lastBatchAtMs,
    lastSyncedAtMs: clock.lastBatchAtMs,
    tick: clock.tick,
    continuousHours: clock.continuousHours,
    msPerTick: clock.msPerTick,
    nextPulseAtMs: clock.nextPulseAtMs,
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
      atRisk: levelInfo.atRisk,
      demoteBelowXp: levelInfo.demoteBelowXp,
    },
  };
}

function mapAirportStockPayload(
  snap: NonNullable<ReturnType<CareerStore['readAirportInventory']>>,
  nowMs: number,
  world?: CareerEconomyWorld | null,
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
    charter: world ? readCharterHubPoolView(world, snap.airport) : null,
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

function hubInboundPendingKg(
  world: CareerEconomyWorld,
  icao: string,
): number {
  let kg = 0;
  for (const row of world.inboundPending ?? []) {
    if (row.destIcao?.toUpperCase() !== icao) continue;
    kg += Math.max(0, row.cargoKg ?? 0);
  }
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'in_flight' && flight.status !== 'awaiting_pilot') {
      continue;
    }
    if (flight.destIcao?.toUpperCase() !== icao) continue;
    kg += Math.max(0, flight.cargoKg ?? 0);
  }
  return kg;
}

function mapHubStatsPayload(
  world: CareerEconomyWorld,
  airport: CareerEconomyWorld['airports'][number],
  history: HubEconomySample[],
  nowMs: number,
) {
  const icao = airport.icao.toUpperCase();
  const outbound = (world.lots ?? []).filter(
    (lot) => lot.originIcao === icao && lot.status === 'available',
  );
  const sample = buildHubEconomySampleForAirport(world, airport, outbound);
  const commodities = mapAirportCommodities(airport);
  const cargoStockKg = commodities
    .filter((c) => c.kind !== 'fuel' && c.kind !== 'mro')
    .reduce((sum, c) => sum + c.stockKg, 0);
  const cargoCapKg = commodities
    .filter((c) => c.kind !== 'fuel' && c.kind !== 'mro')
    .reduce((sum, c) => sum + c.capacityKg, 0);
  const inboundKg = hubInboundPendingKg(world, icao);
  const softFillKg = cargoStockKg + inboundKg;
  const chrome = mapAirportTerminalChrome(airport);
  return {
    ...clockPayload(world, nowMs),
    ...chrome,
    now: {
      commodities: commodities.map((c) => ({
        id: c.commodityId,
        name: c.name,
        kind: c.kind,
        // UI expects 0–100 (same as softFill.fillPct); mapAirportCommodities is 0–1.
        fillPct: Math.round(c.fillPct * 1000) / 10,
        unitPriceUsd: c.unitPriceUsd,
        stockKg: c.stockKg,
        capacityKg: c.capacityKg,
      })),
      hubLevel: chrome.hubLevel,
      outboundLots: sample?.outboundLots ?? 0,
      outboundKg: sample?.outboundKg ?? 0,
      payP50Usd: sample?.payP50Usd ?? null,
      sizeMixKg: {
        ga: sample?.kgGa ?? 0,
        tp: sample?.kgTp ?? 0,
        medium: sample?.kgMedium ?? 0,
        narrow: sample?.kgNarrow ?? 0,
        wide: sample?.kgWide ?? 0,
      },
      jetAFillPct: Math.round((sample?.jetAFill ?? 0) * 100),
      softFill: {
        stockKg: cargoStockKg,
        inboundKg,
        softFillKg,
        capacityKg: cargoCapKg,
        fillPct:
          cargoCapKg > 0
            ? Math.round((softFillKg / cargoCapKg) * 1000) / 10
            : 0,
      },
    },
    history,
    retentionDays: HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
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

/** Board pressure + idle flags — same shape as Freights market rows. */
function mapLotPayPressure(
  world: Awaited<ReturnType<typeof loadEconomy>>,
  lot: (typeof world.lots)[number],
  nowMs = Date.now(),
) {
  const pressure = describeLotMarketPressure(world, lot, nowMs);
  const idlePayMult = idleLotPayMult(lot, world.tick);
  const originRegion = pressure.originRegion ?? '';
  const destRegion =
    world.airports.find((a) => a.icao === lot.destIcao.toUpperCase())?.region ??
    '';
  const shock = laneDemandShock(world, {
    originRegion,
    destRegion,
    commodityId: lot.commodityId,
  });
  return {
    originRegion: pressure.originRegion,
    originRegionCapacity: pressure.originRegionCapacity,
    laneSaturation: pressure.laneSaturation,
    thinFleet: pressure.thinFleet,
    laneBusy: pressure.laneBusy,
    weather: pressure.weather,
    idlePayMult,
    idleEscalated: idlePayMult > 1.02,
    demandShock: shock.labels.length > 0,
    shockLabels: shock.labels,
    shockPayMult: shock.payMult,
    international: !isDomesticOd(originRegion, destRegion),
  };
}

function lotBasePayUsd(lot: {
  payUsd: number;
  basePayUsd?: number;
}): number {
  return typeof lot.basePayUsd === 'number' && Number.isFinite(lot.basePayUsd)
    ? Math.round(lot.basePayUsd)
    : Math.round(lot.payUsd);
}

function mapLotSummary(
  world: Awaited<ReturnType<typeof loadEconomy>>,
  lot: (typeof world.lots)[number],
  nowMs = Date.now(),
) {
  const commodity = getCommodity(lot.commodityId);
  const availableKg = Math.max(0, lot.quantityKg - lot.reservedKg);
  const npcClaim = npcClaimForLot(world, lot.id, nowMs);
  const pressure = mapLotPayPressure(world, lot, nowMs);
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
    basePayUsd: lotBasePayUsd(lot),
    urgency: lot.urgency,
    reason: lot.reason,
    status: lot.status,
    createdAtTick: lot.createdAtTick,
    expiresAtTick: lot.expiresAtTick,
    ticksRemaining: Math.max(0, lot.expiresAtTick - world.tick),
    expired: world.tick >= lot.expiresAtTick,
    perishable: Boolean(commodity.perishable),
    bush: isBushHub(lot.originIcao) || isBushHub(lot.destIcao),
    lastMile: /last-mile/i.test(lot.reason),
    distanceNm: routeDistanceNm(world, lot.originIcao, lot.destIcao),
    idleEscalated: pressure.idleEscalated,
    international: pressure.international,
    pressure,
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
  if (careerApiMode === 'gateway') {
    const worldUrl = careerWorldApiUrlFromEnv();
    if (!worldUrl) {
      throw new Error(
        'CAREER_API_MODE=gateway requires CAREER_WORLD_API_URL',
      );
    }
    gatewayWorldClient = new WorldApiClient({ baseUrl: worldUrl });
    console.log(
      `[career] API mode=gateway → world ${worldUrl} (sim local, economy proxied)`,
    );
  } else if (careerApiMode === 'world') {
    console.log(
      '[career] API mode=world (sim disabled — Watch/inject on desktop)',
    );
  }

  const worldTick: WorldTickService = isRemoteWorldTickEnabled()
    ? new RemoteWorldTickService({
        baseUrl: process.env.CAREER_REMOTE_WORLD_URL!.trim(),
        pathStyle: remoteWorldPathStyleFromEnv(),
        companyId: process.env.CAREER_REMOTE_COMPANY_ID?.trim() || undefined,
      })
    : new LocalWorldTickService({
        requireStore,
        loadMissions,
        peekWorld: () => store?.peekEconomyWorld() ?? undefined,
        isReady: () => store != null,
        beforeAdvance: async () => {
          if (!store || !msfsStampNeeded) return;
          await withCareerLock(async () => {
            if (!store || !msfsStampNeeded) return;
            await stampMsfsOverridesOnStore(store);
            msfsStampNeeded = false;
          });
        },
        runCatchUpWrite: async ({ catchUpTicks, cooperative }) => {
          const timing = emptyPulseChunkTiming();
          const queuedAt = performance.now();
          await withCareerWrite(() => undefined, {
            catchUp: true,
            catchUpTicks,
            cooperative,
            catchUpTiming: timing,
            lockQueuedAtMs: queuedAt,
          });
          const settleStarted = performance.now();
          await withCareerLock(async () => {
            const world = store?.peekEconomyWorld();
            if (!world) return;
            const toTick = world.tick;
            const summary = await applyCompanySessionSettlement({
              fromTick: toTick - catchUpTicks,
              toTick,
              allCompanies: true,
            });
            if (summary) pendingOfflineFeeSummary = summary;
            timing.lots = Math.max(timing.lots, world.lots?.length ?? 0);
          });
          timing.settleMs = performance.now() - settleStarted;
          return timing;
        },
        applyCompanySessionSettlement: async ({ fromTick, toTick }) => {
          return withCareerLock(async () =>
            applyCompanySessionSettlement({ fromTick, toTick }),
          );
        },
      });
  if (worldTick.mode === 'mp-remote') {
    console.log(
      `[career] world-tick mode=mp-remote url=${process.env.CAREER_REMOTE_WORLD_URL?.trim()}`,
    );
  }
  if (isCareerAuthRequired()) {
    console.log('[career] auth required (CAREER_AUTH=1) — Bearer session → company');
  }
  if (isCareerWorldFixed()) {
    console.log('[career] world-fixed (CAREER_WORLD_FIXED=1) — clients attach, no profile gate');
  }
  /** Account id captured on Watch start for full-mode local flight-track. */
  let watchLiveAccountId: string | null = null;
  const watchSession = new CareerWatchSession({
    withCareerRead,
    withCareerWrite,
    updateOpenMission,
    ...(careerApiMode === 'gateway' && gatewayWorldClient
      ? {
          worldMutations: createGatewayWatchMutations(
            gatewayWorldClient,
            gatewayAuthOrThrow,
          ),
        }
      : {}),
    liveUplink: createVaLiveUplink({
      worldClient:
        careerApiMode === 'gateway' ? gatewayWorldClient : null,
      getAuth: () =>
        careerApiMode === 'gateway' ? gatewayAuthScope.current() : {},
      recordLocal:
        careerApiMode === 'gateway'
          ? undefined
          : (sample) => {
              try {
                recordFlightTrackSample({
                  companyId: sample.companyId,
                  accountId: sample.accountId,
                  missionId: sample.missionId,
                  originIcao: '',
                  destIcao: '',
                  lat: sample.lat,
                  lon: sample.lon,
                  altFt: sample.altFt,
                  gsKt: sample.gsKt,
                  phase: sample.phase ?? undefined,
                  onGround:
                    typeof sample.onGround === 'boolean'
                      ? sample.onGround
                      : undefined,
                });
              } catch {
                /* soft */
              }
            },
      getAccountId: () => watchLiveAccountId,
    }),
  });
  const handleRequest = async (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      send(res, 204, {});
      return;
    }

    try {
      if (careerApiMode === 'gateway') {
        if (path === '/api/health') {
          const worldUrl = careerWorldApiUrlFromEnv()!;
          let worldHealth: Record<string, unknown> = {};
          try {
            const upstream = await fetch(`${worldUrl}/api/health`);
            if (upstream.ok) {
              worldHealth = (await upstream.json()) as Record<string, unknown>;
            }
          } catch {
            /* world down — still report gateway alive */
          }
          send(res, 200, {
            ok: true,
            mode: 'gateway',
            worldApiUrl: worldUrl,
            store: worldHealth.store ?? null,
            simLocal: true,
            authRequired: Boolean(worldHealth.authRequired),
            worldFixed: Boolean(worldHealth.worldFixed),
            needsProfile: Boolean(worldHealth.needsProfile),
            activeProfileId:
              typeof worldHealth.activeProfileId === 'string'
                ? worldHealth.activeProfileId
                : null,
            activeProfileName:
              typeof worldHealth.activeProfileName === 'string'
                ? worldHealth.activeProfileName
                : null,
            countries: Array.isArray(worldHealth.countries)
              ? worldHealth.countries
              : undefined,
            homeCountryId:
              typeof worldHealth.homeCountryId === 'string'
                ? worldHealth.homeCountryId
                : undefined,
            clientUpdatePolicy:
              worldHealth.clientUpdatePolicy &&
              typeof worldHealth.clientUpdatePolicy === 'object'
                ? worldHealth.clientUpdatePolicy
                : DEFAULT_CLIENT_UPDATE_POLICY,
          });
          return;
        }
        if (isGatewayEnrichApiPath(path) && req.method === 'POST' && path === '/api/settle') {
          // Enrich settle with local Watch telemetry, then forward.
          const body = (await readBody(req)) as Record<string, unknown>;
          const missionId =
            typeof body.missionId === 'string' ? body.missionId : '';
          const st = watchSession.getStatus();
          if (st.running && st.missionId === missionId) {
            const landingFpm = watchSession.getCapturedLandingFpm();
            const airborneEndedAtMs =
              watchSession.getCapturedAirborneEndedAtMs();
            const flightScore =
              watchSession.finalizeFlightScoreForSettle(landingFpm);
            const weatherOps = watchSession.getCapturedWeatherOps();
            const mx = watchSession.getCapturedMxFuelDrain();
            const td = watchSession.getCapturedTouchdownPosition();
            const cruiseCommit = watchSession.getCapturedCruiseCommit();
            Object.assign(body, {
              ...(landingFpm != null ? { landingFpm } : {}),
              ...(airborneEndedAtMs != null ? { airborneEndedAtMs } : {}),
              ...(flightScore ? { flightScore } : {}),
              ...(weatherOps ? { weatherOps } : {}),
              ...(cruiseCommit ? { cruiseCommit } : {}),
              mxFuelDrainUnsettledKg: mx.unsettledKg,
              mxFuelDrainTotalKg: mx.totalKg,
              ...(td
                ? {
                    touchdownLat: td.lat,
                    touchdownLon: td.lon,
                    touchdownHeadingTrueDeg: td.headingTrueDeg,
                  }
                : {}),
            });
            await watchSession.stop();
          }
          const worldUrl = careerWorldApiUrlFromEnv()!;
          const auth = worldAuthFromIncoming(req);
          const upstream = await fetch(`${worldUrl}/api/settle`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(auth.authorization
                ? { authorization: auth.authorization }
                : {}),
              ...(auth.companyId
                ? { 'x-skyline-company-id': auth.companyId }
                : {}),
            },
            body: JSON.stringify(body),
          });
          const text = await upstream.text();
          res.writeHead(upstream.status, {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
          });
          res.end(text);
          return;
        }
        if (isGatewayProxiedPath(path)) {
          await proxyToWorldApi(req, res, {
            worldBaseUrl: careerWorldApiUrlFromEnv()!,
          });
          return;
        }
        // UI + sim-local APIs fall through to local handlers / static dist.
      }

      if (
        isSimDisabledMode(careerApiMode) &&
        isSimLocalApiPath(path)
      ) {
        send(res, 501, {
          error: SIM_ON_CLIENT_ERROR,
          code: SIM_ON_CLIENT_CODE,
        });
        return;
      }

      await primeAuthSession(req);
      enterLedgerActorAccountId(authSessionFromRequest(req)?.account.id);

      if (
        isCareerAuthRequired() &&
        careerApiMode !== 'gateway' &&
        !isAuthPublicPath(req.method ?? 'GET', path)
      ) {
        const gate = requireAuthSession(req, res);
        if (!gate) return;
      }

      if (req.method === 'GET' && path === '/api/map/satellite-style') {
        // When CAREER_AUTH=1, requireAuthSession already ran (path not public).
        const apiKey = maptilerKeyFromEnv();
        send(res, 200, {
          apiKey,
          styleUrl: maptilerSatelliteStyleUrl(),
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/health') {
        const worldFixed = isCareerWorldFixed();
        const activeProfileName = worldFixed
          ? store
            ? FIXED_WORLD_PROFILE_NAME
            : null
          : activeProfileId
            ? (
                await readProfilesFile(careerRoot).catch(() => null)
              )?.profiles.find((p) => p.id === activeProfileId)?.name ?? null
            : null;
        if (!store) {
          const worldUnavailable = worldFixed;
          send(res, worldUnavailable ? 503 : 200, {
            ok: !worldUnavailable,
            ...(worldUnavailable
              ? {
                  error: fixedWorldOpenError
                    ? 'World store failed to open; check server logs'
                    : 'World store is opening',
                  code: fixedWorldOpenError
                    ? 'world_store_unavailable'
                    : 'world_store_opening',
                }
              : {}),
            needsProfile: true,
            activeProfileId: null,
            activeProfileName: null,
            worldFixed,
            // Non-zero so career:ui health check doesn't treat idle boot as stale.
            npcFleetTarget: 1,
            sourceStamp: bootSourceStamp,
            store: null,
            homeCountryId: null,
            countries: [],
            internationalLaneCount: 0,
            authRequired: isCareerAuthRequired(),
            clientUpdatePolicy: DEFAULT_CLIENT_UPDATE_POLICY,
          });
          return;
        }
        // Liveness must not wait on the career lock — headless login catch-up
        // can hold it for >90s and the Electron shell times out waiting here.
        const peeked = store.peekEconomyWorld?.() ?? null;
        const regionCount = peeked
          ? listNpcHomeRegions(peeked.airports ?? []).length
          : 0;
        const writerRequired = careerApiMode === 'world';
        const writerLeaseHeld =
          worldWriterLeaseState === 'acquired' &&
          store.hasWorldWriterLease?.() !== false;
        const writerReady =
          !writerRequired || writerLeaseHeld;
        const clientUpdatePolicy = await resolveClientUpdatePolicy(store);
        send(res, writerReady ? 200 : 503, {
          ok: writerReady,
          ...(!writerReady
            ? {
                error:
                  worldWriterLeaseError ??
                  (worldWriterLeaseState === 'acquired'
                    ? 'World writer lease connection was lost'
                    : 'World writer lease is not acquired yet'),
                code:
                  worldWriterLeaseState === 'denied' ||
                  worldWriterLeaseState === 'acquired'
                    ? 'world_writer_denied'
                    : 'world_writer_pending',
              }
            : {}),
          needsProfile: false,
          activeProfileId: worldFixed ? FIXED_WORLD_PROFILE_ID : activeProfileId,
          activeProfileName,
          worldFixed,
          npcFleetTarget: peeked ? targetNpcFleetSize(regionCount) : 1,
          sourceStamp: bootSourceStamp,
          store: store.kind,
          worldWriter: writerRequired
            ? writerReady
              ? 'api'
              : worldWriterLeaseState === 'pending'
                ? 'pending'
                : 'denied'
            : 'external',
          homeCountryId: peeked?.homeCountryId ?? null,
          countries: peeked ? listWorldCountryIds(peeked) : [],
          internationalLaneCount: peeked?.internationalLanes?.length ?? 0,
          authRequired: isCareerAuthRequired(),
          clientUpdatePolicy,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/auth/status') {
        const required = isCareerAuthRequired();
        const session = authSessionFromRequest(req);
        send(res, 200, {
          required,
          supportsAuth: store?.supportsAuth === true,
          authenticated: Boolean(session),
          account: session?.account ?? null,
          companies: session?.companies ?? [],
          registerEnabled: isAuthRegisterEnabled(),
          inviteRequired: isAuthInviteFieldRequired(),
          accessKeysRequired: isAuthAccessKeysRequired(),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/auth/register') {
        if (!store) {
          sendMissingStoreForAuth(res);
          return;
        }
        if (!store.supportsAuth) {
          send(res, 501, { error: 'Auth requires SQLite career store' });
          return;
        }
        if (!isAuthRegisterEnabled()) {
          send(res, 403, {
            error: 'Registration is disabled on this world',
            code: 'register_disabled',
          });
          return;
        }
        const rate = consumeAuthRateLimit(authRateLimitKeyFromRequest(req));
        if (!rate.ok) {
          res.setHeader('Retry-After', String(rate.retryAfterSec));
          send(res, 429, {
            error: 'Too many login/register attempts — try again later',
            code: 'auth_rate_limited',
            retryAfterSec: rate.retryAfterSec,
          });
          return;
        }
        try {
          const body = (await readBody(req)) as {
            loginName?: string;
            displayName?: string;
            password?: string;
            inviteCode?: string;
            createCompany?: boolean;
            companyId?: string;
            companyDisplayName?: string;
            claimCompanyId?: string;
            homeHubIcao?: string;
            homeCountryId?: string;
          };
          if (!body.loginName?.trim() || !body.password || !body.displayName?.trim()) {
            send(res, 400, {
              error: 'loginName, displayName, and password required',
            });
            return;
          }
          const gate = resolveRegisterAccessGate(body.inviteCode);
          if (!gate.ok) {
            send(res, 403, {
              error:
                gate.code === 'access_key_required'
                  ? 'Valid product key required'
                  : authInviteCodeRequired()
                    ? 'Valid invite code required'
                    : 'Registration invite invalid',
              code: gate.code,
            });
            return;
          }
          if (body.claimCompanyId?.trim() && !isAuthClaimCompanyAllowed()) {
            send(res, 403, {
              error:
                'claimCompanyId requires CAREER_AUTH_ALLOW_CLAIM=1 (lab migration)',
              code: 'claim_disabled',
            });
            return;
          }
          const result = await Promise.resolve(
            store.authRegister({
              loginName: body.loginName,
              displayName: body.displayName,
              password: body.password,
              createCompany: body.createCompany,
              companyId: body.companyId,
              companyDisplayName: body.companyDisplayName,
              claimCompanyId: body.claimCompanyId,
              homeHubIcao: body.homeHubIcao,
              homeCountryId: body.homeCountryId,
              accessKeyCode: gate.accessKeyCode,
            }),
          );
          if (result.company) {
            const seeded = await store.loadMissions({
              companyId: result.company.id,
            });
            // Anchor watermark to current world tick so a brand-new tenant
            // does not inherit the SP world's offline catch-up gap as "Away".
            const worldTick = store.peekEconomyWorld()?.tick;
            if (typeof worldTick === 'number' && Number.isFinite(worldTick)) {
              seeded.lastSeenTick = Math.max(0, Math.floor(worldTick));
            }
            const identity =
              result.company.displayName?.trim() ||
              result.account.displayName?.trim() ||
              result.account.loginName?.trim() ||
              '';
            if (identity.length >= 2) {
              seeded.pilotName = identity;
            }
            await store.saveMissions(seeded, { companyId: result.company.id });
            store.setActiveCompanyId(result.company.id);
          }
          send(res, 200, {
            token: result.session.token,
            expiresAtMs: result.session.expiresAtMs,
            account: result.account,
            company: result.company,
            companies: await Promise.resolve(
              store.authListCompaniesForAccount(result.account.id),
            ),
          });
        } catch (err) {
          if (err instanceof AccessKeyError) {
            send(res, 403, {
              error:
                err.code === 'access_key_used'
                  ? 'This product key was already used'
                  : err.code === 'access_key_revoked'
                    ? 'This product key was revoked'
                    : 'Invalid product key',
              code: err.code,
            });
            return;
          }
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/auth/login') {
        if (!store) {
          sendMissingStoreForAuth(res);
          return;
        }
        if (!store.supportsAuth) {
          send(res, 501, { error: 'Auth requires SQLite career store' });
          return;
        }
        const rate = consumeAuthRateLimit(authRateLimitKeyFromRequest(req));
        if (!rate.ok) {
          res.setHeader('Retry-After', String(rate.retryAfterSec));
          send(res, 429, {
            error: 'Too many login/register attempts — try again later',
            code: 'auth_rate_limited',
            retryAfterSec: rate.retryAfterSec,
          });
          return;
        }
        try {
          const body = (await readBody(req)) as {
            loginName?: string;
            password?: string;
          };
          if (!body.loginName?.trim() || !body.password) {
            send(res, 400, { error: 'loginName and password required' });
            return;
          }
          const result = await Promise.resolve(
            store.authLogin({
              loginName: body.loginName,
              password: body.password,
            }),
          );
          const companies = await Promise.resolve(
            store.authListCompaniesForAccount(result.account.id),
          );
          if (companies[0]) {
            store.setActiveCompanyId(companies[0].id);
          }
          send(res, 200, {
            token: result.session.token,
            expiresAtMs: result.session.expiresAtMs,
            account: result.account,
            companies,
          });
        } catch (err) {
          send(res, 401, {
            error: err instanceof Error ? err.message : String(err),
            code: 'auth_failed',
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/auth/logout') {
        const token = bearerTokenFromHeader(req.headers.authorization);
        if (store?.supportsAuth && token) {
          await Promise.resolve(store.authRevokeSession(token));
        }
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && path === '/api/auth/me') {
        if (!store) {
          sendMissingStoreForAuth(res);
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        send(res, 200, {
          account: session.account,
          companies: session.companies,
          memberships: session.memberships,
        });
        return;
      }

      // --- VA / Internal Haul multi-pilot (IH-2) ---
      if (req.method === 'GET' && path === '/api/va/members') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const companyIdRaw = companyIdFromRequest(req);
        if (!companyIdRaw) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        let companyId = companyIdRaw;
        let membership = await Promise.resolve(
          store.vaGetMembership(session.account.id, companyId),
        );
        let listed = membership
          ? await Promise.resolve(store.vaIsListed(companyId))
          : false;
        // Member dual-tenant: active company is often home (not listed). Resolve
        // to their listed VA membership so My VA shows the airline, not "Become a VA".
        let switchedFromCompanyId: string | undefined;
        if (!membership || !listed) {
          const listedMem = await Promise.resolve(
            store.vaListedMembership(session.account.id),
          );
          if (
            listedMem &&
            listedMem.companyId &&
            listedMem.companyId !== companyId
          ) {
            switchedFromCompanyId = companyId;
            companyId = listedMem.companyId;
            membership = await Promise.resolve(
              store.vaGetMembership(session.account.id, companyId),
            );
            listed = true;
          }
        }
        if (!membership) {
          send(res, 403, { error: 'Not a member of this company' });
          return;
        }
        if (!listed) {
          listed = await Promise.resolve(store.vaIsListed(companyId));
        }
        const [
          members,
          recruiting,
          memberRouteCutPct,
          memberAirlineCutPct,
          companies,
        ] = await Promise.all([
          Promise.resolve(store.vaListMembers(companyId)),
          Promise.resolve(store.vaIsRecruiting(companyId)),
          Promise.resolve(store.vaGetMemberRouteCutPct(companyId)),
          Promise.resolve(store.vaGetMemberAirlineCutPct(companyId)),
          Promise.resolve(
            store.authListCompaniesForAccount(session.account.id),
          ),
        ]);
        const co = companies.find((c) => c.id === companyId);
        // Roster presence: session last-seen + active VA missions per pilot.
        const nowMs = Date.now();
        const lastSeenByAccount = new Map<string, number>();
        try {
          const sessions = await Promise.resolve(
            store.authListSessions({ nowMs }),
          );
          for (const s of sessions) {
            const prev = lastSeenByAccount.get(s.accountId) ?? 0;
            if (s.lastSeenAtMs > prev) {
              lastSeenByAccount.set(s.accountId, s.lastSeenAtMs);
            }
          }
        } catch {
          /* presence soft-fail */
        }
        const flightRank: Record<string, number> = {
          accepted: 1,
          dispatched: 2,
          in_flight: 3,
        };
        const flightByAccount = new Map<
          string,
          { status: string; originIcao: string; destIcao: string }
        >();
        let vaMissionsForRoster: Awaited<ReturnType<typeof loadMissions>> | null =
          null;
        try {
          vaMissionsForRoster = await loadMissions({ companyId });
          const tick =
            typeof store.peekEconomyWorld === 'function'
              ? (store.peekEconomyWorld()?.tick ?? 0)
              : 0;
          const landed = finalizeStuckNpcFerries(vaMissionsForRoster, tick);
          const overhauled = finalizeAircraftOverhaulsDue(
            vaMissionsForRoster,
            tick,
          );
          if (landed.length > 0 || overhauled.length > 0) {
            await saveMissions(vaMissionsForRoster, { companyId });
          }
          for (const mission of vaMissionsForRoster.missions ?? []) {
            const status = String(mission.status ?? '');
            if (!(status in flightRank)) continue;
            const pilotId = mission.pilotAccountId?.trim();
            if (!pilotId) continue;
            const prev = flightByAccount.get(pilotId);
            if (!prev || flightRank[status]! > flightRank[prev.status]!) {
              flightByAccount.set(pilotId, {
                status,
                originIcao: String(mission.originIcao ?? '').toUpperCase(),
                destIcao: String(mission.destIcao ?? '').toUpperCase(),
              });
            }
          }
        } catch {
          vaMissionsForRoster = null;
        }
        // Pilot hub = home-company pilotIcao (chrome sticky). Cap 8 — batch by home.
        const pilotIcaoByAccount = new Map<string, string>();
        try {
          const homeByAccount = new Map<string, string>();
          await Promise.all(
            members.map(async (m) => {
              try {
                const homeId =
                  m.role === 'owner'
                    ? companyId
                    : ((await Promise.resolve(
                        store.vaHomeCompanyId(m.accountId),
                      )) ?? '');
                if (homeId) homeByAccount.set(m.accountId, homeId);
              } catch {
                /* soft */
              }
            }),
          );
          const uniqueHomes = [...new Set(homeByAccount.values())];
          const missionsByHome = new Map<
            string,
            Awaited<ReturnType<typeof loadMissions>>
          >();
          await Promise.all(
            uniqueHomes.map(async (homeId) => {
              try {
                if (homeId === companyId && vaMissionsForRoster) {
                  missionsByHome.set(homeId, vaMissionsForRoster);
                  return;
                }
                missionsByHome.set(
                  homeId,
                  await loadMissions({ companyId: homeId }),
                );
              } catch {
                /* soft */
              }
            }),
          );
          for (const m of members) {
            const homeId = homeByAccount.get(m.accountId);
            if (!homeId) continue;
            const ms = missionsByHome.get(homeId);
            if (!ms) continue;
            const icao = (
              ms.pilotIcao?.trim() ||
              ms.homeHubIcao?.trim() ||
              ''
            ).toUpperCase();
            if (icao) pilotIcaoByAccount.set(m.accountId, icao);
          }
        } catch {
          /* soft-fail — roster still paints without hubs */
        }
        const membersWithPresence = members.map((m) => {
          const lastSeenAtMs = lastSeenByAccount.get(m.accountId) ?? null;
          const online =
            lastSeenAtMs != null &&
            lastSeenAtMs >= nowMs - AUTH_ONLINE_WINDOW_MS;
          const track = getFlightTrack(companyId, m.accountId);
          const lastPt = track?.points[track.points.length - 1];
          const flight = flightByAccount.get(m.accountId) ?? null;
          const flightActive =
            flight != null &&
            ['accepted', 'dispatched', 'in_flight'].includes(flight.status);
          const live =
            track &&
            isFlightTrackFresh(track.updatedAtMs, nowMs) &&
            flightActive
              ? (() => {
                  const lat =
                    typeof track.lat === 'number' ? track.lat : lastPt?.lat;
                  const lon =
                    typeof track.lon === 'number' ? track.lon : lastPt?.lon;
                  if (
                    typeof lat !== 'number' ||
                    typeof lon !== 'number' ||
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon) ||
                    (lat === 0 && lon === 0)
                  ) {
                    return null;
                  }
                  return {
                    atMs: track.updatedAtMs,
                    lat,
                    lon,
                    missionId: track.missionId,
                    originIcao: track.originIcao,
                    destIcao: track.destIcao,
                    ...(track.phase ? { phase: track.phase } : {}),
                    ...(typeof track.onGround === 'boolean'
                      ? { onGround: track.onGround }
                      : {}),
                    ...(typeof track.altFt === 'number'
                      ? { altFt: track.altFt }
                      : {}),
                    ...(typeof track.gsKt === 'number'
                      ? { gsKt: track.gsKt }
                      : {}),
                  };
                })()
              : null;
          return {
            ...m,
            online,
            lastSeenAtMs,
            flight,
            pilotIcao: pilotIcaoByAccount.get(m.accountId) ?? null,
            live,
          };
        });
        // Line crew snapshot for all members (read-only Config). Missions already
        // loaded for roster presence — no world lock. Soft-fail → null.
        let lineCrew: ReturnType<typeof buildVaLineCrewSnapshot> | null = null;
        let autoHaul: ReturnType<typeof ensureVaAutoHaul> | null = null;
        if (listed) {
          try {
            const tick =
              typeof store.peekEconomyWorld === 'function'
                ? (store.peekEconomyWorld()?.tick ?? 0)
                : 0;
            const missions =
              vaMissionsForRoster ?? (await loadMissions({ companyId }));
            lineCrew = buildVaLineCrewSnapshot(missions, tick);
            autoHaul = ensureVaAutoHaul(missions);
          } catch {
            lineCrew = null;
            autoHaul = null;
          }
        }
        let flightQuality = null;
        let orgPerks = resolveVaOrgPerks(null);
        if (listed) {
          const loaded = await loadVaOrgPerksForCompany(companyId);
          flightQuality = loaded.flightQuality;
          orgPerks = loaded.orgPerks;
        }
        // Hangar preview from the same missions load — avoids a second
        // withCareerRead(/api/state) behind the world pulse (~20s).
        let hangarFleet: Array<
          PlayerAircraft & { parkingUsdPerDay: number | null }
        > = [];
        let hangarAirframePerf: ReturnType<typeof buildAirframePerfMapForUi> =
          {};
        let walletUsd = 0;
        if (vaMissionsForRoster) {
          try {
            clearExpiredAircraftReservations(vaMissionsForRoster.fleet);
            const peeked =
              typeof store.peekEconomyWorld === 'function'
                ? store.peekEconomyWorld()
                : null;
            hangarFleet = withParkingRates(
              vaMissionsForRoster.fleet,
              peeked ?? undefined,
              vaMissionsForRoster,
            );
            hangarAirframePerf = buildAirframePerfMapForUi(
              vaMissionsForRoster.fleet,
              { overrides: vaMissionsForRoster.airframePerfOverrides },
            );
            walletUsd =
              typeof vaMissionsForRoster.walletUsd === 'number' &&
              Number.isFinite(vaMissionsForRoster.walletUsd)
                ? vaMissionsForRoster.walletUsd
                : 0;
          } catch {
            hangarFleet = [];
            hangarAirframePerf = {};
          }
        }
        send(res, 200, {
          companyId,
          memberCap: VA_MEMBER_CAP,
          role: membership.role,
          members: membersWithPresence,
          listed,
          recruiting,
          memberRouteCutPct,
          memberAirlineCutPct,
          displayName: co?.displayName?.trim() || companyId,
          homeHubIcao: co?.homeHubIcao?.trim() || '',
          lineCrew,
          autoHaul,
          autoHaulMinMembers: VA_AUTO_HAUL_MIN_MEMBERS,
          flightQuality,
          orgPerks,
          fleet: hangarFleet,
          airframePerf: hangarAirframePerf,
          walletUsd,
          viewerAccountId: session.account.id,
          onlineWindowMs: AUTH_ONLINE_WINDOW_MS,
          liveFreshMs: FLIGHT_TRACK_FRESH_MS,
          nowMs,
          ...(switchedFromCompanyId
            ? { switchToCompanyId: companyId }
            : {}),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/va/flight-track') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          missionId?: string;
          lat?: number;
          lon?: number;
          altFt?: number;
          gsKt?: number;
          phase?: string;
          onGround?: boolean;
        };
        // Prefer explicit body/header target — do not remap via session home.
        // companyIdFromRequest can drop VA→home when PG vaGetMembership is async.
        const headerRaw = req.headers['x-skyline-company-id'];
        const headerCompany =
          typeof headerRaw === 'string'
            ? headerRaw.trim()
            : Array.isArray(headerRaw)
              ? String(headerRaw[0] ?? '').trim()
              : '';
        const companyId =
          body.companyId?.trim() ||
          headerCompany ||
          companyIdFromRequest(req, body.companyId);
        if (!companyId || !body.missionId?.trim()) {
          send(res, 400, { error: 'companyId and missionId required' });
          return;
        }
        if (
          typeof body.lat !== 'number' ||
          typeof body.lon !== 'number' ||
          !Number.isFinite(body.lat) ||
          !Number.isFinite(body.lon)
        ) {
          send(res, 400, { error: 'lat and lon required' });
          return;
        }
        try {
          const listed = await Promise.resolve(store.vaIsListed(companyId));
          if (!listed) {
            send(res, 400, { error: 'Flight track is only for listed airlines' });
            return;
          }
          const membership = await Promise.resolve(
            store.vaGetMembership(session.account.id, companyId),
          );
          if (!membership) {
            send(res, 403, { error: 'Not a member of this airline' });
            return;
          }
          const missions = await loadMissions({ companyId });
          const mission = missions.missions.find(
            (m) => m.id === body.missionId!.trim(),
          );
          if (!mission) {
            send(res, 404, { error: 'Mission not found' });
            return;
          }
          const pilotId = mission.pilotAccountId?.trim() || '';
          if (pilotId && pilotId !== session.account.id) {
            send(res, 403, { error: 'Not your mission' });
            return;
          }
          const status = String(mission.status ?? '');
          if (!['accepted', 'dispatched', 'in_flight'].includes(status)) {
            clearFlightTrack(companyId, session.account.id);
            send(res, 409, {
              error: 'Mission is not active',
              code: 'not_active',
            });
            return;
          }
          const track = recordFlightTrackSample({
            companyId,
            accountId: session.account.id,
            missionId: mission.id,
            originIcao: mission.originIcao,
            destIcao: mission.destIcao,
            lat: body.lat,
            lon: body.lon,
            altFt: body.altFt,
            gsKt: body.gsKt,
            phase: body.phase,
            onGround: body.onGround,
          });
          send(res, 200, {
            ok: true,
            updatedAtMs: track.updatedAtMs,
            pointCount: track.points.length,
            phase: track.phase ?? null,
            onGround: track.onGround ?? null,
            altFt: track.altFt ?? null,
            gsKt: track.gsKt ?? null,
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/va/flight-track') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const headerRaw = req.headers['x-skyline-company-id'];
        const headerCompany =
          typeof headerRaw === 'string'
            ? headerRaw.trim()
            : Array.isArray(headerRaw)
              ? String(headerRaw[0] ?? '').trim()
              : '';
        const companyId =
          (url.searchParams.get('companyId') ?? '').trim() ||
          headerCompany ||
          companyIdFromRequest(req, url.searchParams.get('companyId'));
        const accountId = (url.searchParams.get('accountId') ?? '').trim();
        if (!companyId || !accountId) {
          send(res, 400, { error: 'companyId and accountId required' });
          return;
        }
        try {
          const listed = await Promise.resolve(store.vaIsListed(companyId));
          if (!listed) {
            send(res, 400, { error: 'Flight track is only for listed airlines' });
            return;
          }
          const membership = await Promise.resolve(
            store.vaGetMembership(session.account.id, companyId),
          );
          if (!membership) {
            send(res, 403, { error: 'Not a member of this airline' });
            return;
          }
          const track = getFlightTrack(companyId, accountId);
          if (!track) {
            send(res, 200, { track: null, nowMs: Date.now() });
            return;
          }
          const world =
            typeof store.peekEconomyWorld === 'function'
              ? store.peekEconomyWorld()
              : null;
          const originCoords = resolveAirportCoords(
            track.originIcao,
            world
              ? airportByIcao(world, track.originIcao) ?? null
              : null,
          );
          const destCoords = resolveAirportCoords(
            track.destIcao,
            world ? airportByIcao(world, track.destIcao) ?? null : null,
          );
          send(res, 200, {
            track,
            fresh: isFlightTrackFresh(track.updatedAtMs),
            nowMs: Date.now(),
            freshMs: FLIGHT_TRACK_FRESH_MS,
            origin: originCoords
              ? { icao: track.originIcao, ...originCoords }
              : null,
            dest: destCoords
              ? { icao: track.destIcao, ...destCoords }
              : null,
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/route-cut') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          memberRouteCutPct?: number;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId || typeof body.memberRouteCutPct !== 'number') {
          send(res, 400, {
            error: 'companyId and memberRouteCutPct required',
          });
          return;
        }
        try {
          const memberRouteCutPct = await Promise.resolve(
            store.vaSetMemberRouteCutPct({
              companyId,
              actorAccountId: session.account.id,
              memberRouteCutPct: body.memberRouteCutPct,
            }),
          );
          send(res, 200, { memberRouteCutPct });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/airline-cut') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          memberAirlineCutPct?: number;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId || typeof body.memberAirlineCutPct !== 'number') {
          send(res, 400, {
            error: 'companyId and memberAirlineCutPct required',
          });
          return;
        }
        try {
          const memberAirlineCutPct = await Promise.resolve(
            store.vaSetMemberAirlineCutPct({
              companyId,
              actorAccountId: session.account.id,
              memberAirlineCutPct: body.memberAirlineCutPct,
            }),
          );
          send(res, 200, { memberAirlineCutPct });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/line-crew') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          action?: 'hire' | 'fire' | 'upgrade';
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        const action = body.action;
        if (
          !companyId ||
          (action !== 'hire' && action !== 'fire' && action !== 'upgrade')
        ) {
          send(res, 400, {
            error: 'companyId and action (hire|fire|upgrade) required',
          });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            companyId,
            'hire, upgrade, or fire Line crew',
          );
          const listed = await Promise.resolve(store.vaIsListed(companyId));
          if (!listed) {
            send(res, 400, { error: 'Publish as a VA before hiring Line crew' });
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            const out =
              action === 'hire'
                ? hireVaLineCrew(missions, world.tick)
                : action === 'upgrade'
                  ? upgradeVaLineCrew(missions, world.tick)
                  : fireVaLineCrew(missions, world.tick);
            return {
              walletUsd: missions.walletUsd,
              debitUsd: out.debitUsd,
              lineCrew: buildVaLineCrewSnapshot(missions, world.tick),
            };
          }, { persist: 'company', companyId });
          send(res, 200, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/auto-haul') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          enabled?: boolean;
          maxHaulsPerDay?: number;
          payMult?: number;
          walletFloorUsd?: number;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            companyId,
            'configure Auto-haul desk',
          );
          const listed = await Promise.resolve(store.vaIsListed(companyId));
          if (!listed) {
            send(res, 400, {
              error: 'Publish as a VA before enabling Auto-haul',
            });
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            const autoHaul = upsertVaAutoHaul(missions, {
              enabled: body.enabled,
              maxHaulsPerDay: body.maxHaulsPerDay,
              payMult: body.payMult,
              walletFloorUsd: body.walletFloorUsd,
            });
            void world;
            return { autoHaul };
          }, { persist: 'company', companyId });
          send(res, 200, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send(
            res,
            /Only the VA owner|Authentication required/i.test(message)
              ? 403
              : 400,
            { error: message },
          );
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/invite') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          role?: string;
          maxUses?: number;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          const invite = await Promise.resolve(
            store.vaCreateInvite({
              companyId,
              createdByAccountId: session.account.id,
              role:
                body.role === 'dispatcher' ? 'dispatcher' : 'pilot',
              maxUses: body.maxUses,
            }),
          );
          send(res, 200, { invite });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/va/invites') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const companyId = companyIdFromRequest(req);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        const membership = await Promise.resolve(
          store.vaGetMembership(session.account.id, companyId),
        );
        if (!membership || !canManageVaRoster(membership.role)) {
          send(res, 403, { error: 'Owner or dispatcher only' });
          return;
        }
        const invites = await Promise.resolve(store.vaListInvites(companyId));
        send(res, 200, { invites });
        return;
      }

      if (req.method === 'POST' && path === '/api/va/join') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as { code?: string };
        if (!body.code?.trim()) {
          send(res, 400, { error: 'code required' });
          return;
        }
        try {
          const joined = await Promise.resolve(
            store.vaJoinInvite({
              code: body.code,
              accountId: session.account.id,
            }),
          );
          const companies = await Promise.resolve(
            store.authListCompaniesForAccount(session.account.id),
          );
          send(res, 200, {
            companyId: joined.companyId,
            member: joined.member,
            companies,
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/leave') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as { companyId?: string };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          await Promise.resolve(
            store.vaLeave({ companyId, accountId: session.account.id }),
          );
          const homeCompanyId = await Promise.resolve(
            store.vaHomeCompanyId(session.account.id),
          );
          const companies = await Promise.resolve(
            store.authListCompaniesForAccount(session.account.id),
          );
          send(res, 200, {
            ok: true,
            homeCompanyId,
            companies,
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/kick') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          accountId?: string;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId || !body.accountId?.trim()) {
          send(res, 400, { error: 'companyId and accountId required' });
          return;
        }
        try {
          await Promise.resolve(
            store.vaKick({
              companyId,
              actorAccountId: session.account.id,
              targetAccountId: body.accountId.trim(),
            }),
          );
          send(res, 200, { ok: true });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/role') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          accountId?: string;
          role?: string;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId || !body.accountId?.trim() || !body.role) {
          send(res, 400, { error: 'companyId, accountId, role required' });
          return;
        }
        try {
          const member = await Promise.resolve(
            store.vaSetRole({
              companyId,
              actorAccountId: session.account.id,
              targetAccountId: body.accountId.trim(),
              role: body.role === 'dispatcher' ? 'dispatcher' : 'pilot',
            }),
          );
          send(res, 200, { member });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/va/hauls') {
        if (!store) {
          send(res, 409, { error: 'Select a career profile first' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (isCareerAuthRequired() && !session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const companyId = companyIdFromRequest(req);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        if (session && store.supportsAuth) {
          const membership = await Promise.resolve(
            store.vaGetMembership(session.account.id, companyId),
          );
          if (!membership) {
            send(res, 403, { error: 'Not a member of this company' });
            return;
          }
        }
        const missions = await store.loadMissions({ companyId });
        const openHolds = listOpenAirlineDeskHolds(missions);
        const active = listAirlineDeskMissions(missions);
        const world = store.peekEconomyWorld();
        const companyNetwork = world
          ? buildCompanyNetworkNodesFromState(world, missions, companyId)
          : [];
        const members =
          store.supportsAuth
            ? await Promise.resolve(store.vaListMembers(companyId))
            : [];
        const memberNameById = new Map(
          members.map((m) => [
            m.accountId,
            (m.displayName || m.loginName || '').trim() || m.accountId,
          ]),
        );
        send(res, 200, {
          companyId,
          companyNetwork,
          openHolds: openHolds.map((h) => {
            const origin = h.originIcao.trim().toUpperCase();
            const dest = h.destIcao.trim().toUpperCase();
            const originCoords = world
              ? resolveAirportCoords(origin, airportByIcao(world, origin) ?? null)
              : undefined;
            const destCoords = world
              ? resolveAirportCoords(dest, airportByIcao(world, dest) ?? null)
              : undefined;
            const heldByAccountId = h.heldByAccountId?.trim() || undefined;
            const distanceRaw = world
              ? routeDistanceNm(world, origin, dest)
              : undefined;
            const distanceNm =
              typeof distanceRaw === 'number' &&
              Number.isFinite(distanceRaw) &&
              distanceRaw > 0
                ? Math.round(distanceRaw)
                : undefined;
            return {
              id: h.id,
              kind: h.kind ?? 'demand',
              originIcao: h.originIcao,
              destIcao: h.destIcao,
              kg: h.kg,
              commodityId: h.commodityId,
              pilotPayUsd: h.pilotPayUsd,
              unitPriceUsd: h.unitPriceUsd,
              distanceNm,
              heldAtTick: h.heldAtTick,
              expiresAtTick: h.expiresAtTick,
              heldByAccountId,
              heldByAuto: h.heldByAuto === true ? true : undefined,
              heldByName: heldByAccountId
                ? memberNameById.get(heldByAccountId) ?? null
                : h.heldByAuto
                  ? 'Auto-haul'
                  : null,
              originLat: originCoords?.lat,
              originLon: originCoords?.lon,
              destLat: destCoords?.lat,
              destLon: destCoords?.lon,
            };
          }),
          activeMissions: active.map((m) => {
            const pilotAccountId = m.pilotAccountId?.trim() || undefined;
            return {
              id: m.id,
              kind:
                m.warehouseBridge && m.internalHaul
                  ? 'bridge'
                  : m.warehouseHaul
                    ? 'haul'
                    : m.demandOrderId
                      ? 'demand'
                      : 'other',
              originIcao: m.originIcao,
              destIcao: m.destIcao,
              commodityId: m.commodityId,
              cargoKg: m.cargoKg,
              payUsd: m.payUsd,
              status: m.status,
              distanceNm: m.distanceNm,
              pilotAccountId,
              pilotName: pilotAccountId
                ? memberNameById.get(pilotAccountId) ?? null
                : null,
              aircraftId: m.aircraftId,
            };
          }),
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/va/directory') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const url = new URL(
          req.url ?? '/',
          `http://${req.headers.host ?? 'localhost'}`,
        );
        const includeClosed = url.searchParams.get('includeClosed') === '1';
        const world = store.peekEconomyWorld();
        const worldId =
          url.searchParams.get('worldId')?.trim() ||
          world?.worldId ||
          undefined;
        const directoryRaw = await Promise.resolve(
          store.vaDirectory({
            worldId,
            accountId: session.account.id,
            includeClosed,
            limit: 80,
          }),
        );
        const directory = directoryRaw.map((row) => ({
          ...row,
          orgPerks: resolveVaOrgPerks(row.flightQuality ?? null),
        }));
        const listedMembership = await Promise.resolve(
          store.vaListedMembership(session.account.id),
        );
        send(res, 200, {
          directory,
          memberOfVaCompanyId: listedMembership?.companyId ?? null,
        });
        return;
      }

      const vaProfileMatch = path.match(/^\/api\/va\/profile\/([^/]+)$/i);
      if (req.method === 'GET' && vaProfileMatch) {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const profileCompanyId = decodeURIComponent(
          vaProfileMatch[1] ?? '',
        ).trim();
        if (!profileCompanyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          const listed = await Promise.resolve(
            store.vaIsListed(profileCompanyId),
          );
          if (!listed) {
            send(res, 404, { error: 'Airline not listed' });
            return;
          }
          const world = store.peekEconomyWorld();
          const worldId = world?.worldId || undefined;
          const directoryRaw = await Promise.resolve(
            store.vaDirectory({
              worldId,
              accountId: session.account.id,
              includeClosed: true,
              limit: 100,
            }),
          );
          const entry = directoryRaw.find(
            (row) => row.companyId === profileCompanyId,
          );
          if (!entry) {
            send(res, 404, { error: 'Airline not found' });
            return;
          }
          const missions = await store.loadMissions({
            companyId: profileCompanyId,
          });
          const network =
            world != null
              ? buildPublicAirlineNetworkNodes(world, missions, {
                  companyId: profileCompanyId,
                  homeHubIcao: entry.homeHubIcao,
                })
              : [];
          const listedMembership = await Promise.resolve(
            store.vaListedMembership(session.account.id),
          );
          send(res, 200, {
            airline: {
              ...entry,
              orgPerks: resolveVaOrgPerks(entry.flightQuality ?? null),
            },
            network,
            memberOfVaCompanyId: listedMembership?.companyId ?? null,
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/request') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as { companyId?: string };
        if (!body.companyId?.trim()) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          const request = await Promise.resolve(
            store.vaCreateJoinRequest({
              companyId: body.companyId.trim(),
              accountId: session.account.id,
            }),
          );
          send(res, 200, { request });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/va/requests') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const companyId = companyIdFromRequest(req);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        const membership = await Promise.resolve(
          store.vaGetMembership(session.account.id, companyId),
        );
        if (!membership || !canManageVaRoster(membership.role)) {
          send(res, 403, { error: 'Owner or dispatcher only' });
          return;
        }
        const requests = await Promise.resolve(
          store.vaListJoinRequests(companyId),
        );
        send(res, 200, { requests });
        return;
      }

      if (req.method === 'POST' && path === '/api/va/requests/accept') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as { requestId?: string };
        if (!body.requestId?.trim()) {
          send(res, 400, { error: 'requestId required' });
          return;
        }
        try {
          const result = await Promise.resolve(
            store.vaAcceptJoinRequest({
              requestId: body.requestId.trim(),
              actorAccountId: session.account.id,
            }),
          );
          send(res, 200, result);
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/requests/reject') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as { requestId?: string };
        if (!body.requestId?.trim()) {
          send(res, 400, { error: 'requestId required' });
          return;
        }
        try {
          await Promise.resolve(
            store.vaRejectJoinRequest({
              requestId: body.requestId.trim(),
              actorAccountId: session.account.id,
            }),
          );
          send(res, 200, { ok: true });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/recruiting') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          recruiting?: boolean;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId || typeof body.recruiting !== 'boolean') {
          send(res, 400, { error: 'companyId and recruiting boolean required' });
          return;
        }
        try {
          const recruiting = await Promise.resolve(
            store.vaSetRecruiting({
              companyId,
              actorAccountId: session.account.id,
              recruiting: body.recruiting,
            }),
          );
          send(res, 200, { recruiting });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/publish') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          companyId?: string;
          displayName?: string;
          homeHubIcao?: string;
          recruiting?: boolean;
        };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId || !body.displayName?.trim() || !body.homeHubIcao?.trim()) {
          send(res, 400, {
            error: 'companyId, displayName, and homeHubIcao required',
          });
          return;
        }
        try {
          const published = await Promise.resolve(
            store.vaPublish({
              companyId,
              actorAccountId: session.account.id,
              displayName: body.displayName,
              homeHubIcao: body.homeHubIcao,
              recruiting: body.recruiting,
            }),
          );
          send(res, 200, { company: published });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/unpublish') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as { companyId?: string };
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          const result = await Promise.resolve(
            store.vaUnpublish({
              companyId,
              actorAccountId: session.account.id,
            }),
          );
          send(res, 200, result);
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/fleet/reserve') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId?.trim()) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          const listed = await Promise.resolve(store.vaIsListed(companyId));
          if (!listed) {
            send(res, 400, { error: 'Aircraft reserve is only for listed VAs' });
            return;
          }
          const membership = await Promise.resolve(
            store.vaGetMembership(session.account.id, companyId),
          );
          if (!membership) {
            send(res, 403, { error: 'Not a member of this VA' });
            return;
          }
          const result = await withCareerWrite((_world, missions) => {
            clearExpiredAircraftReservations(missions.fleet);
            const aircraft = reserveAircraftForMember(
              missions,
              body.aircraftId!,
              session.account.id,
            );
            return {
              aircraft,
              fleet: withParkingRates(missions.fleet),
            };
          }, { persist: 'company', companyId });
          send(res, 200, result);
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/va/fleet/release') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId?.trim()) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const companyId = companyIdFromRequest(req, body.companyId);
        if (!companyId) {
          send(res, 400, { error: 'companyId required' });
          return;
        }
        try {
          const listed = await Promise.resolve(store.vaIsListed(companyId));
          if (!listed) {
            send(res, 400, { error: 'Aircraft release is only for listed VAs' });
            return;
          }
          const membership = await Promise.resolve(
            store.vaGetMembership(session.account.id, companyId),
          );
          if (!membership) {
            send(res, 403, { error: 'Not a member of this VA' });
            return;
          }
          const result = await withCareerWrite((_world, missions) => {
            clearExpiredAircraftReservations(missions.fleet);
            const aircraft = findPlayerAircraft(missions, body.aircraftId!);
            if (!aircraft) {
              throw new Error(`Unknown aircraft ${body.aircraftId}`);
            }
            if (missionIsInFlight(missions, aircraft)) {
              throw new Error(
                'Cannot release reservation while the aircraft is in flight',
              );
            }
            const holder = aircraft.reservedByAccountId?.trim();
            const isHolder = holder === session.account.id;
            const isOwner = membership.role === 'owner';
            if (
              isAircraftReservationActive(aircraft) &&
              !isHolder &&
              !isOwner
            ) {
              throw new Error('Only the reserving pilot or VA owner can release');
            }
            releaseAircraftReservation(missions, aircraft.id);
            return {
              aircraft,
              fleet: withParkingRates(missions.fleet),
            };
          }, { persist: 'company', companyId });
          send(res, 200, result);
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/va/ranking') {
        if (!store?.supportsAuth) {
          send(res, 501, { error: 'VA ranking requires auth store' });
          return;
        }
        const session = authSessionFromRequest(req);
        if (isCareerAuthRequired() && !session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const world = store.peekEconomyWorld();
        const tick = world?.tick ?? 0;
        const toDay = vaDayKeyFromTick(tick);
        const fromDay = Math.max(0, toDay - (VA_RANKING_WINDOW_DAYS - 1));
        const rankingRaw = await Promise.resolve(
          store.vaCompanyRanking({
            fromDayKey: fromDay,
            toDayKey: toDay,
            limit: 20,
          }),
        );
        const ranking = rankingRaw.map((row) => ({
          ...row,
          orgPerks: resolveVaOrgPerks(row.flightQuality ?? null),
        }));
        const pilots = await Promise.resolve(
          store.vaPilotRanking({
            fromDayKey: fromDay,
            toDayKey: toDay,
            limit: 20,
          }),
        );
        send(res, 200, {
          windowDays: VA_RANKING_WINDOW_DAYS,
          fromDayKey: fromDay,
          toDayKey: toDay,
          companies: ranking,
          pilots,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/auth/sessions') {
        if (!store) {
          send(res, 409, {
            error: 'Select a career profile first',
            code: 'needs_profile',
          });
          return;
        }
        if (!store.supportsAuth) {
          send(res, 501, {
            error: 'Auth sessions require SQLite/Postgres career store',
            code: 'auth_unsupported',
          });
          return;
        }
        const session = authSessionFromRequest(req);
        if (!session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const scopeRaw = (url.searchParams.get('scope') ?? 'mine').trim().toLowerCase();
        const wantAll = scopeRaw === 'all';
        if (wantAll && !isAuthSessionsListAllEnabled()) {
          send(res, 403, {
            error:
              'Listing all sessions requires CAREER_AUTH_SESSIONS_LIST_ALL=1 (lab presence)',
            code: 'sessions_list_all_disabled',
          });
          return;
        }
        const nowMs = Date.now();
        const sessions = await Promise.resolve(
          store.authListSessions({
            accountId: wantAll ? undefined : session.account.id,
            nowMs,
          }),
        );
        send(res, 200, {
          nowMs,
          onlineWindowMs: AUTH_ONLINE_WINDOW_MS,
          scope: wantAll ? 'all' : 'mine',
          sessions,
          onlineCount: sessions.filter((s) => s.online).length,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/world/presence') {
        if (!store) {
          send(res, 409, {
            error: 'Select a career profile first',
            code: 'needs_profile',
          });
          return;
        }
        const session = authSessionFromRequest(req);
        if (isCareerAuthRequired() && !session) {
          send(res, 401, {
            error: 'Authentication required',
            code: 'auth_required',
          });
          return;
        }
        try {
          const nowMs = Date.now();
          const companyNames = await companyDisplayNameMap(store);
          const onlineByCompany = new Map<
            string,
            { companyId: string; displayName: string; lastSeenAtMs: number }
          >();
          const onlineAccountIds = new Set<string>();
          if (store.supportsAuth) {
            const sessions = await Promise.resolve(
              store.authListSessions({ nowMs }),
            );
            for (const s of sessions) {
              if (!s.online) continue;
              onlineAccountIds.add(s.accountId);
              const companies = await Promise.resolve(
                store.authListCompaniesForAccount(s.accountId),
              );
              for (const co of companies) {
                const prev = onlineByCompany.get(co.id);
                if (!prev || s.lastSeenAtMs > prev.lastSeenAtMs) {
                  onlineByCompany.set(co.id, {
                    companyId: co.id,
                    displayName:
                      companyNames.get(co.id) ||
                      co.displayName ||
                      co.id,
                    lastSeenAtMs: s.lastSeenAtMs,
                  });
                }
              }
            }
          }
          const presence = await withCareerRead((world) => {
            const portsHeld = (world.portConcessions ?? [])
              .filter((c) => c.leasePaidThroughTick > world.tick)
              .map((c) => {
                const port = getCareerPort(c.portId);
                return {
                  portId: c.portId,
                  name: port?.name ?? c.portId,
                  companyId: c.companyId,
                  displayName:
                    companyNames.get(c.companyId) ?? c.companyId,
                  level: c.level ?? 1,
                };
              });
            return {
              tick: world.tick,
              recent: listPresenceEvents(world, 20),
              portsHeld,
            };
          });
          send(res, 200, {
            nowMs,
            onlineWindowMs: AUTH_ONLINE_WINDOW_MS,
            // Chip = pilots (accounts), not companies — one player with
            // home + VA membership must not read as "2 online".
            onlineCount: onlineAccountIds.size,
            online: [...onlineByCompany.values()].sort(
              (a, b) => b.lastSeenAtMs - a.lastSeenAtMs,
            ),
            ...presence,
          });
        } catch (error) {
          send(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/profiles') {
        if (isCareerWorldFixed()) {
          const meta = fixedWorldProfileMeta();
          send(res, 200, {
            activeId: store ? FIXED_WORLD_PROFILE_ID : null,
            profiles: [meta],
            worldFixed: true,
          });
          return;
        }
        const file = await readProfilesFile(careerRoot);
        send(res, 200, {
          activeId: activeProfileId ?? file.activeId,
          profiles: file.profiles,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/profiles') {
        if (isCareerWorldFixed()) {
          send(res, 403, {
            error: 'Fixed world has one shared DB — no multi-save create',
            code: 'world_fixed',
          });
          return;
        }
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
        if (isCareerWorldFixed()) {
          // Idempotent attach — host already owns careerRoot/world.
          if (!store) {
            send(res, 409, {
              error: 'Fixed world not open on host yet',
              code: 'needs_profile',
            });
            return;
          }
          const meta = fixedWorldProfileMeta();
          send(res, 200, {
            activeId: FIXED_WORLD_PROFILE_ID,
            profile: meta,
            profiles: [meta],
            worldFixed: true,
          });
          return;
        }
        const body = (await readBody(req)) as { id?: string };
        const id = body.id?.trim() ?? '';
        if (!id) {
          send(res, 400, { error: 'id required' });
          return;
        }
        const selectT0 = performance.now();
        console.log(`[career] profile-select start id=${id}`);
        try {
          if (watchSession.getStatus().running) await watchSession.stop();
          worldTick.stopBackgroundPulse();
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
            resetMsfsStampState();
            const next = await openCareerProfileStore(careerRoot, id);
            store = next;
            activeProfileId = id;
            await setActiveCareerProfile(careerRoot, id);
            msfsStampNeeded = true;
          });
          const file = await readProfilesFile(careerRoot);
          const profile = file.profiles.find((p) => p.id === id) ?? null;
          console.log(
            `[career] profile-select ok id=${id} ${Math.round(performance.now() - selectT0)}ms`,
          );
          schedulePostLoginEconomyWork(worldTick);
          send(res, 200, {
            activeId: id,
            profile,
            profiles: file.profiles,
          });
        } catch (error) {
          console.error(
            `[career] profile-select fail id=${id} ${Math.round(performance.now() - selectT0)}ms:`,
            error instanceof Error ? error.message : error,
          );
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/profiles/clear') {
        if (isCareerWorldFixed()) {
          send(res, 403, {
            error: 'Fixed world cannot be cleared from a client',
            code: 'world_fixed',
          });
          return;
        }
        try {
          if (watchSession.getStatus().running) await watchSession.stop();
          worldTick.stopBackgroundPulse();
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
            resetMsfsStampState();
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
        if (isCareerWorldFixed()) {
          send(res, 403, {
            error: 'Fixed world has no renameable saves',
            code: 'world_fixed',
          });
          return;
        }
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
        if (isCareerWorldFixed()) {
          send(res, 403, {
            error: 'Fixed world cannot be deleted from a client',
            code: 'world_fixed',
          });
          return;
        }
        const id = profileDeleteMatch[1]!;
        try {
          if (activeProfileId === id) {
            if (watchSession.getStatus().running) await watchSession.stop();
            worldTick.stopBackgroundPulse();
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
              resetMsfsStampState();
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

      if (req.method === 'GET' && path === '/api/world/clock') {
        // SP: same mold as MP GET /worlds/:id/clock — local world only.
        try {
          const worldId =
            url.searchParams.get('worldId')?.trim() || LOCAL_WORLD_ID;
          const nowMsRaw = url.searchParams.get('nowMs');
          const nowMs =
            nowMsRaw && Number.isFinite(Number(nowMsRaw))
              ? Number(nowMsRaw)
              : Date.now();
          const clock = await worldTick.getClock(worldId, nowMs);
          send(res, 200, clock);
        } catch (err) {
          send(res, 503, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      {
        const worldsClock = path.match(/^\/worlds\/([^/]+)\/clock$/);
        if (req.method === 'GET' && worldsClock) {
          try {
            const worldId = decodeURIComponent(worldsClock[1] ?? '').trim() || LOCAL_WORLD_ID;
            const nowMsRaw = url.searchParams.get('nowMs');
            const nowMs =
              nowMsRaw && Number.isFinite(Number(nowMsRaw))
                ? Number(nowMsRaw)
                : Date.now();
            const clock = await worldTick.getClock(worldId, nowMs);
            send(res, 200, clock);
          } catch (err) {
            send(res, 503, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
      }

      if (req.method === 'POST' && path === '/api/world/pulse') {
        // Explicit world advance (admin / hosted ops). Requires a loaded profile.
        if (worldTick.mode === 'mp-remote') {
          send(res, 403, {
            error: 'Remote world-tick client cannot advance the world',
            code: 'client_cannot_advance',
          });
          return;
        }
        if (!store) {
          send(res, 409, {
            error: 'Select a career profile first',
            code: 'needs_profile',
          });
          return;
        }
        try {
          const body = (await readBody(req)) as { n?: number };
          const n =
            typeof body.n === 'number' && Number.isFinite(body.n) && body.n > 0
              ? Math.min(96, Math.floor(body.n))
              : undefined;
          const result = await worldTick.advance(LOCAL_WORLD_ID, {
            n,
            cooperative: true,
          });
          const clock = await worldTick.getClock(LOCAL_WORLD_ID, Date.now());
          send(res, 200, { ...result, clock });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/companies/session/open') {
        // SP: settle passive fees from world.tick delta (MP session/open path).
        if (!store) {
          send(res, 409, {
            error: 'Select a career profile first',
            code: 'needs_profile',
          });
          return;
        }
        try {
          const body = (await readBody(req)) as {
            companyId?: string;
            worldId?: string;
            lastSeenTick?: number;
          };
          const companyId = await activateCompanyContext(
            body.companyId?.trim() ||
              companyIdFromRequest(req) ||
              LOCAL_COMPANY_ID,
            authSessionFromRequest(req)?.account.id,
          );
          const missions = await loadMissions({ companyId });
          const result = await worldTick.openCompanySession({
            companyId,
            worldId: body.worldId?.trim() || LOCAL_WORLD_ID,
            lastSeenTick:
              typeof body.lastSeenTick === 'number' &&
              Number.isFinite(body.lastSeenTick)
                ? body.lastSeenTick
                : (missions.lastSeenTick ?? 0),
          });
          if (result.offlineFeeSummary) {
            pendingOfflineFeeSummary = result.offlineFeeSummary;
          }
          send(res, 200, { ...result, companyId });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      {
        const companiesSession = path.match(
          /^\/companies\/([^/]+)\/session\/open$/,
        );
        if (req.method === 'POST' && companiesSession) {
          if (!store && worldTick.mode !== 'mp-remote') {
            send(res, 409, {
              error: 'Select a career profile first',
              code: 'needs_profile',
            });
            return;
          }
          try {
            const pathCompanyId =
              decodeURIComponent(companiesSession[1] ?? '').trim() ||
              LOCAL_COMPANY_ID;
            const body = (await readBody(req)) as {
              companyId?: string;
              worldId?: string;
              lastSeenTick?: number;
            };
            const companyId =
              worldTick.mode === 'mp-remote'
                ? body.companyId?.trim() || pathCompanyId
                : await activateCompanyContext(
                    body.companyId?.trim() || pathCompanyId,
                    authSessionFromRequest(req)?.account.id,
                  );
            const lastSeenTick =
              typeof body.lastSeenTick === 'number' &&
              Number.isFinite(body.lastSeenTick)
                ? body.lastSeenTick
                : store
                  ? ((await loadMissions({ companyId })).lastSeenTick ?? 0)
                  : 0;
            const result = await worldTick.openCompanySession({
              companyId,
              worldId: body.worldId?.trim() || LOCAL_WORLD_ID,
              lastSeenTick,
            });
            if (result.offlineFeeSummary) {
              pendingOfflineFeeSummary = result.offlineFeeSummary;
            }
            send(res, 200, { ...result, companyId });
          } catch (err) {
            send(res, 400, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
      }

      if (req.method === 'GET' && path === '/api/companies') {
        if (!store) {
          send(res, 409, {
            error: 'Select a career profile first',
            code: 'needs_profile',
          });
          return;
        }
        try {
          const worldId =
            url.searchParams.get('worldId')?.trim() || LOCAL_WORLD_ID;
          const session = authSessionFromRequest(req);
          const companies = await Promise.resolve(
            isCareerAuthRequired() && session
              ? session.companies
              : store.listWorldCompanies(worldId),
          );
          send(res, 200, {
            worldId,
            activeCompanyId: store.getActiveCompanyId(),
            companies,
            accountId: session?.account.id ?? null,
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/companies') {
        if (!store) {
          send(res, 409, {
            error: 'Select a career profile first',
            code: 'needs_profile',
          });
          return;
        }
        try {
          const body = (await readBody(req)) as {
            id?: string;
            worldId?: string;
            displayName?: string;
            homeHubIcao?: string;
            homeCountryId?: string;
            activate?: boolean;
          };
          if (!body.id?.trim()) {
            send(res, 400, { error: 'id required' });
            return;
          }
          const session = authSessionFromRequest(req);
          if (isCareerAuthRequired() && !session) {
            send(res, 401, {
              error: 'Authentication required',
              code: 'auth_required',
            });
            return;
          }
          const company = await Promise.resolve(
            store.ensureCompany({
              id: body.id.trim(),
              worldId: body.worldId?.trim() || LOCAL_WORLD_ID,
              displayName: body.displayName,
              homeHubIcao: body.homeHubIcao,
              homeCountryId: body.homeCountryId,
            }),
          );
          if (session) {
            await Promise.resolve(
              store.authAddCompanyMember({
                companyId: company.id,
                accountId: session.account.id,
                role: 'owner',
              }),
            );
          }
          // Seed empty company_state so load/save works for the new tenant.
          const seeded = await store.loadMissions({ companyId: company.id });
          const worldTick = store.peekEconomyWorld()?.tick;
          if (typeof worldTick === 'number' && Number.isFinite(worldTick)) {
            seeded.lastSeenTick = Math.max(0, Math.floor(worldTick));
          }
          await store.saveMissions(seeded, { companyId: company.id });
          if (body.activate !== false) {
            store.setActiveCompanyId(company.id);
          }
          send(res, 200, {
            company,
            activeCompanyId: store.getActiveCompanyId(),
          });
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
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
        const nowMs = Date.now();
        const stateCompanyId = companyIdFromRequest(req);
        // SP-only ⟳ chip. World host / worker own the clock — never tell
        // desktop clients they must stay open to drain backlog.
        const catchUp =
          careerApiMode === 'world'
            ? null
            : await worldTick.getCatchUpProgress(LOCAL_WORLD_ID, nowMs);
        const { payload, opsPeek } = await withCareerRead((world, missions) => {
          const npcBusy = (world.npcs ?? []).filter((n) => n.status === 'busy').length;
          const offlineFeeSummary = pendingOfflineFeeSummary;
          pendingOfflineFeeSummary = null;
          return {
            opsPeek: {
              cargoOps: missions.cargoOps,
              classOps: missions.classOps,
              pilotFlightHours: missions.pilotFlightHours ?? 0,
              lastSettleOutcome: missions.lastSettleOutcome,
            },
            payload: {
              needsProfile: false,
              activeProfileId,
              companyId: stateCompanyId,
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
                world.npcFlights?.filter((f) => f.status === 'in_flight').length ??
                0,
              ...fleetPayload(missions, world, req),
              cashflow: careerCashflowSnapshot(missions, world),
              cargoOps: null as CareerMissionsState['cargoOps'] | null,
              playerFbos: playerFboSnapshot(missions, world),
              companyCrew: companyCrewSnapshot(missions, world),
              groundStaff: groundStaffSnapshot(missions, world),
              homeCountryId: world.homeCountryId ?? null,
              countries: listWorldCountryIds(world),
              internationalLaneCount: world.internationalLanes?.length ?? 0,
              store: store!.kind,
              ...(offlineFeeSummary ? { offlineFeeSummary } : {}),
              ...(catchUp ? { catchUp } : {}),
            },
          };
        }, { companyId: stateCompanyId });
        const progression = await resolvePilotProgressionOps(
          req,
          stateCompanyId ?? '',
          opsPeek,
        );
        send(res, 200, {
          ...payload,
          cargoOps: progression.cargoOps ?? null,
          classOps: progression.classOps ?? payload.classOps ?? null,
          pilotFlightHours: progression.pilotFlightHours,
          lastSettleOutcome: progression.lastSettleOutcome ?? null,
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/hubs') {
        const hubsCompanyId = companyIdFromRequest(req);
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
        }), { companyId: hubsCompanyId });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/fleet') {
        const fleetCompanyId = companyIdFromRequest(req);
        const payload = await withCareerRead((world, missions) => ({
          walletUsd: missions.walletUsd,
          ...fleetPayload(missions, world),
          cashflow: careerCashflowSnapshot(missions, world),
          homeCountryId: world.homeCountryId ?? null,
          store: requireStore().kind,
        }), { companyId: fleetCompanyId });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/cashflow') {
        const cashflowCompanyId = companyIdFromRequest(req);
        // Light read: company missions + peeked tick. Avoid withCareerRead —
        // My VA Ledger was queueing behind the world pulse (~20s) for a P&L
        // that only needs ledger rows + credit (no crew settle / economy lock).
        const world =
          careerApiMode === 'gateway' && gatewayWorldClient
            ? gatewayEconomyShell()
            : requireStore().peekEconomyWorld();
        if (!world) {
          send(res, 503, { error: 'Economy not loaded' });
          return;
        }
        const missions = await loadMissions(
          cashflowCompanyId ? { companyId: cashflowCompanyId } : undefined,
        );
        const cashflow = careerCashflowSnapshot(missions, world);
        let flightQuality = null;
        let orgPerks = resolveVaOrgPerks(null);
        if (cashflowCompanyId && store) {
          const loaded = await loadVaOrgPerksForCompany(cashflowCompanyId);
          flightQuality = loaded.flightQuality;
          orgPerks = loaded.orgPerks;
        }
        send(res, 200, {
          walletUsd: missions.walletUsd,
          tick: world.tick,
          dayIndex: economyDayIndex(world.tick),
          homeCountryId: world.homeCountryId ?? null,
          store: requireStore().kind,
          labels: LEDGER_KIND_LABEL,
          companyCredit: companyCreditSnapshot(missions),
          flightQuality,
          orgPerks,
          ...cashflow,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/credit/draw') {
        const body = (await readBody(req)) as {
          amountUsd?: number;
          companyId?: string;
        };
        const credit_drawCompanyId = companyIdFromRequest(req, body.companyId);
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? body.amountUsd
            : NaN;
        try {
          await assertVaOwnerForFleetMutation(
            req,
            credit_drawCompanyId,
            'draw company credit on a listed VA',
          );
          const result = await withCareerWrite((world, missions) => {
            const drawn = drawCompanyCredit(missions, amountUsd, world.tick);
            return {
              walletUsd: missions.walletUsd,
              drawnUsd: drawn.drawnUsd,
              companyCredit: drawn.snapshot,
              ...fleetPayload(missions, world),
            };
          }, { persist: 'company', companyId: credit_drawCompanyId });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/credit/repay') {
        const body = (await readBody(req)) as {
          amountUsd?: number;
          companyId?: string;
        };
        const credit_repayCompanyId = companyIdFromRequest(req, body.companyId);
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? body.amountUsd
            : NaN;
        try {
          await assertVaOwnerForFleetMutation(
            req,
            credit_repayCompanyId,
            'repay company credit on a listed VA',
          );
          const result = await withCareerWrite((world, missions) => {
            const repaid = repayCompanyCredit(missions, amountUsd, world.tick);
            return {
              walletUsd: missions.walletUsd,
              repaidUsd: repaid.repaidUsd,
              companyCredit: repaid.snapshot,
              ...fleetPayload(missions, world),
            };
          }, { persist: 'company', companyId: credit_repayCompanyId });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/fleet/select-hub') {
        const body = (await readBody(req)) as {
          icao?: string;
          pilotName?: string;
          airframeTypeId?: string;
          companyId?: string;
        };
        if (!body.icao) {
          send(res, 400, { error: 'icao required' });
          return;
        }
        if (!body.pilotName || !String(body.pilotName).trim()) {
          send(res, 400, { error: 'pilotName required' });
          return;
        }
        const selectHubCompanyId = companyIdFromRequest(req, body.companyId);
        const selectHubStore = requireStore();
        const hubPersistence = homeCountryPersistence(
          selectHubStore.kind,
          isCareerWorldFixed(),
        );
        const sharedWorld = !hubPersistence.syncWorldHomeCountry;
        try {
          const result = await withCareerWrite(async (world, missions) => {
            const next = selectStarterHub(missions, body.icao!, {
              pilotName: body.pilotName!,
              ...(body.airframeTypeId?.trim()
                ? { airframeTypeId: body.airframeTypeId.trim() }
                : {}),
            });
            Object.assign(missions, next);
            const selectedHomeCountryId =
              countryIdFromHubIcao(world, missions.homeHubIcao) ??
              world.homeCountryId ??
              null;
            if (sharedWorld) {
              await selectHubStore.ensureCompany({
                id:
                  selectHubCompanyId?.trim() ||
                  selectHubStore.getActiveCompanyId(),
                // Do not pass displayName — pilot name ≠ VA listing name.
                homeHubIcao: missions.homeHubIcao,
                homeCountryId: selectedHomeCountryId ?? undefined,
              });
            } else {
              // SP has one player partition and one save, so its world-level
              // home country still follows the selected starter hub.
              syncHomeCountryFromHub(world, missions.homeHubIcao);
            }
            return {
              walletUsd: missions.walletUsd,
              homeCountryId: selectedHomeCountryId,
              contractPilotCareer: missions.fleet.length === 0,
              ...fleetPayload(missions, world),
            };
          }, {
            persist: hubPersistence.persistHubSelection,
            companyId: selectHubCompanyId,
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
        const aircraftMarketCompanyId = companyIdFromRequest(req);
        const payload = await withCareerRead((world, missions) => {
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
          const typeIds = new Set<string>();
          for (const listing of listings) {
            if (listing.airframeTypeId) typeIds.add(listing.airframeTypeId);
          }
          const airframePerf = buildAirframePerfMapForUi(missions.fleet, {
            overrides: missions.airframePerfOverrides,
            extraTypeIds: typeIds,
          });
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
        }, { companyId: aircraftMarketCompanyId });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/buy') {
        const body = (await readBody(req)) as {
          listingId?: string;
          deliver?: boolean;
          deliverToIcao?: string;
          companyId?: string;
        };
        if (!body.listingId) {
          send(res, 400, { error: 'listingId required' });
          return;
        }
        const buyCompanyId = companyIdFromRequest(req, body.companyId);
        const buyStore = requireStore();
        let dbClaimed = false;
        try {
          const claim = await tryClaimDealerListing({
            store: buyStore,
            listingId: body.listingId!,
            companyId: buyCompanyId,
          });
          if (claim === 'unavailable') {
            send(res, 409, {
              error: `Listing ${body.listingId} is not available`,
              code: 'aircraft_claimed',
            });
            return;
          }
          dbClaimed = claim === 'ok';
          const companyNames = await companyDisplayNameMap(buyStore);
          const displayName =
            companyNames.get(buyCompanyId) ?? buyCompanyId;
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            settleAircraftMarketOps(missions, world.tick);
            return withDevProgressionUnlock(req, missions, () => {
              const purchased = executeBuyAircraft(world, missions, {
                listingId: body.listingId!,
                deliver: body.deliver === true,
                companyId: buyCompanyId,
                ...(typeof body.deliverToIcao === 'string'
                  ? { deliverToIcao: body.deliverToIcao }
                  : {}),
              });
              if (purchased.kind === 'unavailable') {
                const err = new Error(
                  `Listing ${body.listingId} is not available`,
                ) as Error & { code?: string };
                err.code = 'aircraft_claimed';
                throw err;
              }
              if (purchased.kind === 'applied') {
                const ac = purchased.aircraft;
                recordPresence(world, {
                  kind: 'aircraft_buy',
                  companyId: buyCompanyId,
                  companyDisplayName: displayName,
                  summary: `${ac.registration ?? 'aircraft'} · buy`,
                });
              }
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
          }, {
            persist: 'aircraftMarket',
            housekeeping: false,
            companyId: buyCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          if (dbClaimed) {
            await releaseDealerListingClaim({
              store: buyStore,
              listingId: body.listingId!,
              companyId: buyCompanyId,
            });
          }
          const code =
            error instanceof Error &&
            'code' in error &&
            (error as { code?: string }).code === 'aircraft_claimed'
              ? 'aircraft_claimed'
              : undefined;
          send(res, code === 'aircraft_claimed' ? 409 : 400, {
            error: error instanceof Error ? error.message : String(error),
            ...(code ? { code } : {}),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/lease') {
        const body = (await readBody(req)) as {
          listingId?: string;
          deliver?: boolean;
          deliverToIcao?: string;
          companyId?: string;
        };
        if (!body.listingId) {
          send(res, 400, { error: 'listingId required' });
          return;
        }
        const leaseCompanyId = companyIdFromRequest(req, body.companyId);
        const leaseStore = requireStore();
        let dbClaimed = false;
        try {
          const claim = await tryClaimDealerListing({
            store: leaseStore,
            listingId: body.listingId!,
            companyId: leaseCompanyId,
          });
          if (claim === 'unavailable') {
            send(res, 409, {
              error: `Listing ${body.listingId} is not available`,
              code: 'aircraft_claimed',
            });
            return;
          }
          dbClaimed = claim === 'ok';
          const companyNames = await companyDisplayNameMap(leaseStore);
          const displayName =
            companyNames.get(leaseCompanyId) ?? leaseCompanyId;
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            settleAircraftMarketOps(missions, world.tick);
            return withDevProgressionUnlock(req, missions, () => {
              const leased = signAircraftLease(missions, world, body.listingId!, {
                deliver: body.deliver === true,
                companyId: leaseCompanyId,
                ...(typeof body.deliverToIcao === 'string'
                  ? { deliverToIcao: body.deliverToIcao }
                  : {}),
              });
              recordPresence(world, {
                kind: 'aircraft_lease',
                companyId: leaseCompanyId,
                companyDisplayName: displayName,
                summary: `${leased.aircraft.registration ?? 'aircraft'} · lease`,
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
          }, { persist: 'aircraftMarket', companyId: leaseCompanyId });
          send(res, 200, result);
        } catch (error) {
          if (dbClaimed) {
            await releaseDealerListingClaim({
              store: leaseStore,
              listingId: body.listingId!,
              companyId: leaseCompanyId,
            });
          }
          const message =
            error instanceof Error ? error.message : String(error);
          const claimed = /not available/i.test(message);
          send(res, claimed ? 409 : 400, {
            error: message,
            ...(claimed ? { code: 'aircraft_claimed' } : {}),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/sell') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const sellCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMutation(req, sellCompanyId, 'sell VA aircraft');
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
          }, { persist: 'aircraftMarket', companyId: sellCompanyId });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/list-sale') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          askingUsd?: number;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const listSaleCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMutation(
            req,
            listSaleCompanyId,
            'list VA aircraft for sale',
          );
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
          }, { persist: 'company', companyId: listSaleCompanyId });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/list-lease') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          termMonths?: number;
          monthlyUsd?: number;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const listLeaseCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMutation(
            req,
            listLeaseCompanyId,
            'list VA aircraft for lease',
          );
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
          }, { persist: 'company', companyId: listLeaseCompanyId });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/unlist') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const unlistCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMutation(
            req,
            unlistCompanyId,
            'unlist VA aircraft',
          );
          const result = await withCareerWrite((world, missions) => {
            unlistAircraftForLease(missions, body.aircraftId!);
            return {
              walletUsd: missions.walletUsd,
              fleet: withParkingRates(missions.fleet),
              listings: listAircraftMarket(missions, world),
            };
          }, { persist: 'company', companyId: unlistCompanyId });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/maintenance') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const mxCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMx(req, mxCompanyId);
          const { orgPerks } = await loadVaOrgPerksForCompany(mxCompanyId);
          const result = await withCareerWrite((world, missions) => {
            const mx = clearAircraftMaintenanceWithParts(
              missions,
              body.aircraftId!,
              world,
              { extraServiceMult: orgPerks.mxCostMult },
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: mx.debitUsd,
              needsRepair: mx.needsRepair,
              mro: mx.mro,
              fleet: withParkingRates(missions.fleet),
              orgPerks,
            };
          }, {
            commandSliceAircraftId: body.aircraftId,
            companyId: mxCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/repair') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          airframePts?: number;
          enginePts?: number;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const repairCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMx(req, repairCompanyId);
          const { orgPerks } = await loadVaOrgPerksForCompany(repairCompanyId);
          const result = await withCareerWrite((world, missions) => {
            const repaired = repairAircraftConditionWithParts(
              missions,
              body.aircraftId!,
              world,
              {
                airframePts: body.airframePts,
                enginePts: body.enginePts,
                extraServiceMult: orgPerks.mxCostMult,
              },
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: repaired.debitUsd,
              aircraft: repaired.aircraft,
              mro: repaired.mro,
              fleet: withParkingRates(missions.fleet),
              orgPerks,
            };
          }, {
            commandSliceAircraftId: body.aircraftId,
            companyId: repairCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/overhaul') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          which?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const which =
          body.which === 'airframe' || body.which === 'engine'
            ? body.which
            : null;
        if (!which) {
          send(res, 400, { error: 'which must be engine or airframe' });
          return;
        }
        const ohCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          await assertVaOwnerForFleetMutation(
            req,
            ohCompanyId,
            'overhaul company aircraft',
          );
          const { orgPerks } = await loadVaOrgPerksForCompany(ohCompanyId);
          const result = await withCareerWrite((world, missions) => {
            finalizeAircraftOverhaulsDue(missions, world.tick);
            const started = startAircraftOverhaul(
              missions,
              body.aircraftId!,
              which,
              {
                atTick: world.tick,
                extraServiceMult: orgPerks.mxCostMult,
              },
            );
            return {
              walletUsd: missions.walletUsd,
              debitUsd: started.debitUsd,
              quote: started.quote,
              aircraft: started.aircraft,
              fleet: withParkingRates(missions.fleet),
              orgPerks,
            };
          }, {
            persist: 'company',
            companyId: ohCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /Only the VA owner|Authentication required/i.test(message) ? 403 : 400, {
            error: message,
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/buyout') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const buyoutCompanyId = companyIdFromRequest(req, body.companyId);
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
          }, { persist: 'company', companyId: buyoutCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/pay-lease') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const payLeaseCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const result = await withCareerWrite((world, missions) => {
            const paid = payAircraftLeaseOverdue(
              missions,
              body.aircraftId!,
              world.tick,
            );
            return {
              walletUsd: missions.walletUsd,
              paidUsd: paid.paidUsd,
              weeksPaid: paid.weeksPaid,
              fleet: withParkingRates(missions.fleet, world, missions),
            };
          }, { persist: 'company', companyId: payLeaseCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/aircraft-market/return-lease') {
        const body = (await readBody(req)) as {
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.aircraftId) {
          send(res, 400, { error: 'aircraftId required' });
          return;
        }
        const returnLeaseCompanyId = companyIdFromRequest(req, body.companyId);
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
          }, { persist: 'aircraftMarket', companyId: returnLeaseCompanyId });
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
        // Query companyId wins over chrome header (VA tail while sticky-home).
        const ferryPlanCompanyId = companyIdFromRequest(
          req,
          url.searchParams.get('companyId'),
        );
        const ferryPlanActor = await resolveVaFleetActor(req, ferryPlanCompanyId);
        const ferryPlanVaListed =
          Boolean(store?.supportsAuth) &&
          Boolean(
            await Promise.resolve(store!.vaIsListed(ferryPlanCompanyId)),
          );
        const ferryPlanSession = authSessionFromRequest(req);
        const ferryPlanPilotHome =
          ferryPlanVaListed && ferryPlanSession && store
            ? ((await Promise.resolve(
                store.vaHomeCompanyId(ferryPlanSession.account.id),
              )) ?? ferryPlanCompanyId)
            : ferryPlanCompanyId;
        const ferryPlanOrgPerks = ferryPlanVaListed
          ? (await loadVaOrgPerksForCompany(ferryPlanCompanyId)).orgPerks
          : resolveVaOrgPerks(null);
        try {
          const result = await withCareerPeekRead((world, missions) => {
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
                ferryBilling: null,
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
                  actorAccountId: ferryPlanActor.accountId,
                  actorIsVaOwner: ferryPlanActor.isOwner,
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

            let ferryBilling:
              | {
                  mode: 'allowance' | 'overflow' | 'company';
                  yourCostUsd: number;
                  hired?: boolean;
                  remaining?: number;
                  allowance?: number;
                }
              | null = null;
            if (ferryPlanVaListed && nextQuote) {
              const lineCrew = vaLineCrewAllowanceRemaining(
                missions,
                world.tick,
              );
              const memberCross =
                Boolean(ferryPlanPilotHome) &&
                ferryPlanPilotHome !== ferryPlanCompanyId;
              if (lineCrew.hired && lineCrew.remaining > 0) {
                ferryBilling = {
                  mode: 'allowance',
                  yourCostUsd: 0,
                  hired: true,
                  remaining: lineCrew.remaining,
                  allowance: lineCrew.allowance,
                };
              } else if (memberCross) {
                ferryBilling = {
                  mode: 'overflow',
                  yourCostUsd: applyVaOrgCostMult(
                    nextQuote.totalCostUsd,
                    ferryPlanOrgPerks.ferryOverflowCostMult,
                  ),
                  hired: lineCrew.hired,
                  remaining: lineCrew.remaining,
                  allowance: lineCrew.allowance,
                };
              } else {
                ferryBilling = {
                  mode: 'company',
                  yourCostUsd: nextQuote.totalCostUsd,
                  hired: lineCrew.hired,
                  remaining: lineCrew.remaining,
                  allowance: lineCrew.allowance,
                };
              }
            }

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
              ferryBilling,
            };
          }, { companyId: ferryPlanCompanyId });
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
          companyId?: string;
        };
        if (!body.aircraftId || !body.destIcao) {
          send(res, 400, { error: 'aircraftId and destIcao required' });
          return;
        }
        const ferryCompanyId = companyIdFromRequest(req, body.companyId);
        const ferryActor = await resolveVaFleetActor(req, ferryCompanyId);
        try {
          if (body.quoteOnly) {
            const quoted = await withCareerPeekRead((world, missions) => {
              const quote = quoteFerry(world, missions, {
                aircraftId: body.aircraftId!,
                destIcao: body.destIcao!,
                actorAccountId: ferryActor.accountId,
                actorIsVaOwner: ferryActor.isOwner,
              });
              return { quote, walletUsd: missions.walletUsd };
            }, { companyId: ferryCompanyId });
            send(res, 200, quoted);
            return;
          }

          const vaListed =
            store?.supportsAuth &&
            (await Promise.resolve(store.vaIsListed(ferryCompanyId)));
          const session = authSessionFromRequest(req);
          const pilotHome =
            vaListed && session && store
              ? ((await Promise.resolve(
                  store.vaHomeCompanyId(session.account.id),
                )) ?? ferryCompanyId)
              : ferryCompanyId;
          const ferryOrgPerks = vaListed
            ? (await loadVaOrgPerksForCompany(ferryCompanyId)).orgPerks
            : resolveVaOrgPerks(null);

          // Peek quote + allowance to decide overflow before mutating VA fleet.
          let willOverflow = false;
          let overflowQuoteUsd = 0;
          if (vaListed) {
            const peek = await withCareerPeekRead((world, missions) => {
              const quote = quoteFerry(world, missions, {
                aircraftId: body.aircraftId!,
                destIcao: body.destIcao!,
                actorAccountId: ferryActor.accountId,
                actorIsVaOwner: ferryActor.isOwner,
              });
              const allowance = vaLineCrewAllowanceRemaining(
                missions,
                world.tick,
              );
              return { quote, allowance };
            }, { companyId: ferryCompanyId });
            willOverflow =
              !peek.allowance.hired || peek.allowance.remaining <= 0;
            overflowQuoteUsd = applyVaOrgCostMult(
              peek.quote.totalCostUsd,
              ferryOrgPerks.ferryOverflowCostMult,
            );
            if (
              willOverflow &&
              pilotHome &&
              pilotHome !== ferryCompanyId
            ) {
              const homeWallet = await withCareerPeekRead((_w, missions) => {
                return missions.walletUsd;
              }, { companyId: pilotHome });
              if (homeWallet < overflowQuoteUsd) {
                send(res, 400, {
                  error: `Ferry overflow costs $${overflowQuoteUsd.toLocaleString()} but your home wallet has $${homeWallet.toLocaleString()} — hire Line crew or top up home`,
                });
                return;
              }
            }
          }

          let overflowDebit: {
            companyId: string;
            amountUsd: number;
            note: string;
            aircraftId: string;
            destIcao: string;
          } | null = null;

          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            finalizeStuckNpcFerries(missions, world.tick);
            const quote = quoteFerry(world, missions, {
              aircraftId: body.aircraftId!,
              destIcao: body.destIcao!,
              actorAccountId: ferryActor.accountId,
              actorIsVaOwner: ferryActor.isOwner,
            });

            let skipWalletDebit = false;
            let ferryMode: 'solo' | 'allowance' | 'overflow' = 'solo';

            if (vaListed) {
              const usedAllowance = consumeVaLineCrewAllowance(
                missions,
                world.tick,
              );
              if (usedAllowance) {
                // Free hop, still instant — NPC ETA hid tails from Manifest and
                // contradicted the Instant ferry journey UI.
                skipWalletDebit = true;
                ferryMode = 'allowance';
              } else {
                // Overflow: no VA debit; charge pilot home after write.
                skipWalletDebit = true;
                ferryMode = 'overflow';
                if (pilotHome && pilotHome !== ferryCompanyId) {
                  overflowDebit = {
                    companyId: pilotHome,
                    amountUsd: applyVaOrgCostMult(
                      quote.totalCostUsd,
                      ferryOrgPerks.ferryOverflowCostMult,
                    ),
                    note: `${quote.originIcao}→${quote.destIcao}`,
                    aircraftId: body.aircraftId!,
                    destIcao: quote.destIcao,
                  };
                } else {
                  // Owner flying own VA without allowance — VA pays (instant).
                  skipWalletDebit = false;
                  ferryMode = 'solo';
                }
              }
            }

            const ferried = executeFerry(world, missions, {
              aircraftId: body.aircraftId!,
              destIcao: body.destIcao!,
              skipWalletDebit,
              actorAccountId: ferryActor.accountId,
              actorIsVaOwner: ferryActor.isOwner,
            });
            const allowance = vaLineCrewAllowanceRemaining(
              missions,
              world.tick,
            );
            return {
              aircraft: ferried.aircraft,
              quote: ferried.quote,
              walletDebitUsd: ferried.walletDebitUsd,
              walletUsd: missions.walletUsd,
              ferryMode,
              lineCrew: allowance,
              ...fleetPayload(missions),
            };
          }, {
            commandSliceAircraftId: body.aircraftId,
            commandSliceIcaos: [body.destIcao],
            companyId: ferryCompanyId,
          });

          if (overflowDebit && overflowDebit.amountUsd > 0) {
            const debit = overflowDebit;
            await withCareerWrite(
              (world, missions) => {
                if (missions.walletUsd < debit.amountUsd) {
                  throw new Error(
                    `Ferry overflow costs $${debit.amountUsd.toLocaleString()} but your home wallet has $${missions.walletUsd.toLocaleString()}`,
                  );
                }
                applyWalletDelta(missions, {
                  amountUsd: -debit.amountUsd,
                  kind: 'va_line_crew_ferry',
                  atTick: world.tick,
                  aircraftId: debit.aircraftId,
                  icao: debit.destIcao,
                  note: `VA empty ferry · ${debit.note}`,
                });
                return { walletUsd: missions.walletUsd };
              },
              {
                persist: 'company',
                companyId: debit.companyId,
                housekeeping: false,
                catchUp: false,
              },
            );
            result.walletDebitUsd = debit.amountUsd;
          }

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
          companyId?: string;
        };
        if (!body.aircraftId || !body.destIcao) {
          send(res, 400, { error: 'aircraftId and destIcao required' });
          return;
        }
        const emptyFlightCompanyId = companyIdFromRequest(req, body.companyId);
        const emptyActor = await resolveVaFleetActor(req, emptyFlightCompanyId);
        const emptyPilotStamp = await vaPilotMissionStamp(
          req,
          emptyFlightCompanyId,
        );
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const accepted = acceptEmptyFlight(world, missions, {
              aircraftId: body.aircraftId!,
              destIcao: body.destIcao!,
              actorAccountId: emptyActor.accountId,
              actorIsVaOwner: emptyActor.isOwner,
            });
            const mission = {
              ...accepted.mission,
              ...emptyPilotStamp,
            };
            const idx = missions.missions.findIndex((m) => m.id === mission.id);
            if (idx >= 0) missions.missions[idx] = mission;
            return {
              mission,
              aircraft: accepted.aircraft,
              walletUsd: missions.walletUsd,
              ...fleetPayload(missions, world),
            };
          }, { persist: 'company', companyId: emptyFlightCompanyId });
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

      if (req.method === 'GET' && path === '/api/dev/payload-lab') {
        const options = listCareerPlayerAirframes()
          .filter((row) => isCareerPlayerAirframeEnabled(row))
          .map((row) => {
            const maxPaxSeats = resolvePayloadLabCharterMaxPax(row);
            return {
              typeId: row.typeId,
              label: row.label,
              aircraftClassId: row.aircraftClassId,
              maxCargoKg: row.maxCargoKg ?? null,
              maxPaxSeats: maxPaxSeats > 0 ? maxPaxSeats : null,
              loadLayout: row.loadLayout ?? 'freighter',
              injectCapable: row.injectCapable !== false,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
        const lab = await withCareerRead(
          (_world, missions) => findPayloadLabMission(missions.missions ?? []),
          { companyId: companyIdFromRequest(req) },
        );
        send(res, 200, {
          options,
          mission: lab
            ? {
                id: lab.id,
                status: lab.status,
                airframeTypeId: lab.airframeTypeId,
                originIcao: lab.originIcao,
                destIcao: lab.destIcao,
                cargoKg: lab.cargoKg,
                pax: lab.pax ?? 0,
                baggageKg: lab.baggageKg ?? 0,
                missionType: lab.missionType === 'charter' ? 'charter' : 'freight',
                reason: lab.reason,
              }
            : null,
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/dev/payload-lab') {
        const body = (await readBody(req)) as {
          airframeTypeId?: string;
          missionKind?: 'freight' | 'charter';
          cargoKg?: number;
          pax?: number;
          baggageKg?: number;
          originIcao?: string;
          destIcao?: string;
          companyId?: string;
        };
        if (!body.airframeTypeId?.trim()) {
          send(res, 400, { error: 'airframeTypeId required' });
          return;
        }
        const missionKind =
          body.missionKind === 'charter' ? 'charter' : 'freight';
        if (missionKind === 'freight') {
          if (
            typeof body.cargoKg !== 'number' ||
            !Number.isFinite(body.cargoKg)
          ) {
            send(res, 400, { error: 'cargoKg required' });
            return;
          }
        } else if (
          typeof body.pax !== 'number' ||
          !Number.isFinite(body.pax)
        ) {
          send(res, 400, { error: 'pax required for charter Lab' });
          return;
        }
        const labCompanyId = companyIdFromRequest(req, body.companyId);
        // Stamp pilot only — never vaFlight. Lab is a local Dispatch harness, not a VA leg.
        const labPilotFull = await vaPilotMissionStamp(req, labCompanyId);
        const labPilotStamp = {
          ...(labPilotFull.pilotAccountId
            ? { pilotAccountId: labPilotFull.pilotAccountId }
            : {}),
          ...(labPilotFull.pilotHomeCompanyId
            ? { pilotHomeCompanyId: labPilotFull.pilotHomeCompanyId }
            : {}),
        };
        const originIcao = (body.originIcao ?? 'SBGR').trim().toUpperCase();
        const destIcao = (body.destIcao ?? 'SBSP').trim().toUpperCase();
        try {
          const result = await withCareerWrite((world, missions) => {
            const started = startPayloadLabMission(world, missions, {
              airframeTypeId: body.airframeTypeId!.trim(),
              missionKind,
              ...(missionKind === 'charter'
                ? {
                    pax: body.pax!,
                    ...(typeof body.baggageKg === 'number'
                      ? { baggageKg: body.baggageKg }
                      : {}),
                  }
                : { cargoKg: body.cargoKg! }),
              originIcao,
              destIcao,
              ...labPilotStamp,
            });
            return {
              mission: withMissionClientView(world, missions, started.mission),
              airframeLabel: started.airframeLabel,
              replacedLabIds: started.replacedLabIds,
              missions: missions.missions.map((m) =>
                withMissionClientView(world, missions, m),
              ),
            };
          }, { persist: 'company', companyId: labCompanyId });
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

      if (req.method === 'DELETE' && path === '/api/dev/payload-lab') {
        const labCancelCompanyId = companyIdFromRequest(req);
        try {
          const result = await withCareerWrite((world, missions) => {
            const lab = findPayloadLabMission(missions.missions ?? []);
            if (!lab) {
              return {
                cancelled: null as null,
                missions: missions.missions.map((m) =>
                  withMissionClientView(world, missions, m),
                ),
              };
            }
            const executed = executeCancelMission(world, missions, {
              missionId: lab.id,
            });
            if (executed.kind !== 'applied') {
              throw new Error(`Could not cancel lab flight (${executed.kind})`);
            }
            return {
              cancelled: withMissionClientView(
                world,
                missions,
                executed.mission,
              ),
              missions: missions.missions.map((m) =>
                withMissionClientView(world, missions, m),
              ),
            };
          }, { persist: 'company', companyId: labCancelCompanyId });
          const watch = watchSession.getStatus();
          if (
            result.cancelled &&
            watch.missionId === result.cancelled.id
          ) {
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
          companyId?: string;
        };
        const requestedTravelCompanyId = companyIdFromRequest(
          req,
          body.companyId,
        );
        const {
          companyId: pilot_travelCompanyId,
          actorAccountId: pilot_travelActorId,
        } = await resolvePilotTravelCompanyId(req, requestedTravelCompanyId);
        if (!body.destIcao) {
          send(res, 400, { error: 'destIcao required' });
          return;
        }
        try {
          if (body.quoteOnly) {
            const quoted = await withCareerPeekRead((world, missions) => {
              const quote = quotePilotTravel(world, missions, body.destIcao!);
              return {
                quote,
                walletUsd: missions.walletUsd,
                pilotIcao: missions.pilotIcao ?? missions.homeHubIcao ?? '',
                companyId: pilot_travelCompanyId,
              };
            }, { companyId: pilot_travelCompanyId });
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
              companyId: pilot_travelCompanyId,
              ...fleetPayload(missions, world),
            };
          }, {
            persist: 'company',
            companyId: pilot_travelCompanyId,
            actorAccountId: pilot_travelActorId,
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
        const cargo_limitCompanyId = companyIdFromRequest(
          req,
          url.searchParams.get('companyId'),
        );

        const aircraftRaw = url.searchParams.get('aircraft') ?? undefined;
        const aircraft = parseFreighterClassId(aircraftRaw ?? undefined);
        if (!aircraft) {
          send(res, 400, { error: 'aircraft query required' });
          return;
        }
        const airframeTypeIdRaw = url.searchParams.get('airframe') ?? undefined;
        const aircraftId = url.searchParams.get('aircraftId')?.trim() || undefined;
        const originIcao = url.searchParams.get('origin')?.trim().toUpperCase();
        const destIcao = url.searchParams.get('dest')?.trim().toUpperCase();
        let airframeTypeId = airframeTypeIdRaw?.trim() || undefined;
        if (!airframeTypeId && aircraftId) {
          try {
            airframeTypeId = await withCareerPeekRead((_world, missions) => {
              const acf = missions.fleet.find((a) => a.id === aircraftId);
              return acf?.airframeTypeId?.trim() || undefined;
            }, { companyId: cargo_limitCompanyId });
          } catch {
            airframeTypeId = undefined;
          }
        }
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
          try {
            distanceNm = await withCareerPeekRead((world) =>
              routeDistanceNm(world, originIcao, destIcao),
            );
          } catch {
            distanceNm = undefined;
          }
        }
        const mxBurn = aircraftId
          ? await withCareerPeekRead((_world, missions) => {
              const acf = missions.fleet.find((a) => a.id === aircraftId);
              return acf ? fuelBurnMultFromAircraft(acf) : null;
            }, { companyId: cargo_limitCompanyId }).catch(() => null)
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
            const fuelQuote = await withCareerPeekRead((world, missions) =>
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
              { companyId: cargo_limitCompanyId },
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

      if (req.method === 'GET' && path === '/api/charters') {
        const originExact = url.searchParams.get('origin')?.trim().toUpperCase();
        const destExact = url.searchParams.get('dest')?.trim().toUpperCase();
        const originQueryTokens = marketQueryTokens(
          url.searchParams.get('originQ') ?? '',
        );
        const destQueryTokens = marketQueryTokens(
          url.searchParams.get('destQ') ?? '',
        );
        const laneFilter = parseCharterBoardLaneFilter(
          url.searchParams.get('lane'),
        );
        const fitFilter = parseCharterBoardFitFilter(
          url.searchParams.get('fit'),
        );
        const paxFilter = parseCharterBoardPaxFilter(
          url.searchParams.get('pax'),
        );
        const distanceMaxNm = parsePositiveNumberParam(
          url.searchParams.get('distanceMaxNm'),
        );
        const aircraftId = url.searchParams.get('aircraftId')?.trim();
        const requestedSorts = parseCharterBoardSorts(
          url.searchParams.get('sort'),
        );
        const pageSize = Math.max(
          1,
          Math.min(100, Math.floor(Number(url.searchParams.get('pageSize')) || 10)),
        );
        const requestedPage = Math.max(
          1,
          Math.floor(Number(url.searchParams.get('page')) || 1),
        );
        // Query companyId wins over chrome header (VA tail while sticky-home).
        const chartersCompanyId = companyIdFromRequest(
          req,
          url.searchParams.get('companyId'),
        );
        try {
          // Read-only board query — never tickCharterEconomy + full economy save here.
          // Sort/filter used withCareerWrite (default persist), which rewrote the whole
          // Postgres world on every click and could freeze/blank the UI for many seconds.
          // Per-request companyId (same as /api/fleet): ambient activeCompanyId on the
          // world host is another tenant — missing it → Unknown aircraft on Fit.
          const snapshot = await withCareerRead((world, missions) => {
            return {
              world,
              missions,
              aircraft: aircraftId
                ? findPlayerAircraft(missions, aircraftId)
                : undefined,
            };
          }, { companyId: chartersCompanyId });
          if (aircraftId && !snapshot.aircraft) {
            send(res, 404, { error: `Unknown aircraft ${aircraftId}` });
            return;
          }
          // Class Ops = pilot home ladder (VA member), same as Freights board.
          const charterProgression = await resolvePilotProgressionOps(
            req,
            chartersCompanyId,
            {
              cargoOps: snapshot.missions.cargoOps,
              classOps: snapshot.missions.classOps,
            },
          );
          const gateClassOps = charterProgression.classOps;
          const cargoLimit = snapshot.aircraft
            ? await resolveClassMaxCargoKg(
                snapshot.aircraft.aircraftClassId,
                snapshot.aircraft.airframeTypeId,
              )
            : undefined;
          const airports = new Map(
            snapshot.world.airports.map((airport) => [
              airport.icao.toUpperCase(),
              airport,
            ]),
          );
          const focusIcao = (
            snapshot.aircraft?.locationIcao ||
            snapshot.missions.pilotIcao ||
            snapshot.missions.homeHubIcao ||
            ''
          )
            .trim()
            .toUpperCase();
          const pilotCountryId = focusIcao
            ? countryIdFromRegion(airports.get(focusIcao)?.region ?? '')
            : undefined;
          const filtered = (snapshot.world.charterOffers ?? []).filter(
            (offer) => {
              if (
                offer.status !== 'available' ||
                snapshot.world.tick >= offer.expiresAtTick
              ) {
                return false;
              }
              if (originExact && offer.originIcao !== originExact) return false;
              if (destExact && offer.destIcao !== destExact) return false;
              const originName =
                airports.get(offer.originIcao)?.name ?? offer.originIcao;
              const destName =
                airports.get(offer.destIcao)?.name ?? offer.destIcao;
              if (
                !marketEndpointMatchesQuery(
                  originQueryTokens,
                  offer.originIcao,
                  originName,
                )
              ) {
                return false;
              }
              if (
                !marketEndpointMatchesQuery(
                  destQueryTokens,
                  offer.destIcao,
                  destName,
                )
              ) {
                return false;
              }
              if (laneFilter === 'intl' && !offer.international) return false;
              if (laneFilter === 'domestic' && offer.international) return false;
              if (laneFilter === 'pilot-domestic') {
                if (offer.international) return false;
                if (!pilotCountryId) return false;
                const originCountry = countryIdFromRegion(
                  airports.get(offer.originIcao)?.region ?? '',
                );
                if (originCountry !== pilotCountryId) return false;
              }
              if (laneFilter === 'pilot-intl') {
                if (!offer.international) return false;
                if (!pilotCountryId) return false;
                const originCountry = countryIdFromRegion(
                  airports.get(offer.originIcao)?.region ?? '',
                );
                if (originCountry !== pilotCountryId) return false;
              }
              if (!charterOfferMatchesPaxFilter(offer.groupSize, paxFilter)) {
                return false;
              }
              if (
                !charterOfferMatchesDistanceMax(
                  offer.distanceNm,
                  distanceMaxNm,
                )
              ) {
                return false;
              }
              return true;
            },
          );
          const needFitForAll =
            Boolean(snapshot.aircraft && cargoLimit) &&
            charterBoardNeedsFitCompute(requestedSorts, fitFilter);
          const fitById = new Map<
            string,
            ReturnType<typeof charterAircraftFit>
          >();
          let ferryPlanner: ReturnType<typeof createFerryRoutePlanner> | null =
            null;
          if (needFitForAll && snapshot.aircraft && cargoLimit) {
            // Net/Fit sort runs fit for every filtered offer. planFerryRoute used
            // to rebuild an O(hubs²) graph per offer (~40s). One Dijkstra from
            // the aircraft location covers the whole board.
            if (snapshot.aircraft.status === 'parked') {
              try {
                ferryPlanner = createFerryRoutePlanner({
                  originIcao: snapshot.aircraft.locationIcao,
                  maxRangeNm: resolveAirframeMaxRangeNm(
                    snapshot.aircraft.airframeTypeId,
                    snapshot.aircraft.aircraftClassId,
                  ),
                });
              } catch {
                ferryPlanner = null;
              }
            }
            for (const offer of filtered) {
              fitById.set(
                offer.id,
                withCharterClassOpsGate(
                  charterAircraftFit(
                    snapshot.world,
                    snapshot.missions,
                    offer,
                    snapshot.aircraft,
                    cargoLimit.maxCargoKg,
                    ferryPlanner,
                  ),
                  gateClassOps,
                  snapshot.aircraft.aircraftClassId,
                ),
              );
            }
          }
          const afterFit = filtered.filter((offer) => {
            if (!fitFilter) return true;
            const fit = fitById.get(offer.id);
            if (!fit) return false;
            return fitFilter === 'open' ? fit.compatible : !fit.compatible;
          });
          const sortable = afterFit.map((offer) => {
            const fit = fitById.get(offer.id);
            return {
              offer,
              id: offer.id,
              distanceNm: offer.distanceNm,
              paxCount: offer.groupSize,
              baggageKg: offer.baggageKg,
              expiresAtTick: offer.expiresAtTick,
              payUsd: offer.payUsd,
              netUsd: fit?.netUsd ?? null,
              fitCompatible: fit?.compatible ?? null,
            };
          });
          const rows = sortCharterBoardRows(sortable, requestedSorts);
          const total = rows.length;
          const pageCount = Math.max(1, Math.ceil(total / pageSize));
          const page = Math.min(requestedPage, pageCount);
          const offers = rows
            .slice((page - 1) * pageSize, page * pageSize)
            .map(({ offer }) => {
              let fit = fitById.get(offer.id);
              if (
                !fit &&
                snapshot.aircraft &&
                cargoLimit &&
                !needFitForAll
              ) {
                fit = withCharterClassOpsGate(
                  charterAircraftFit(
                    snapshot.world,
                    snapshot.missions,
                    offer,
                    snapshot.aircraft,
                    cargoLimit.maxCargoKg,
                  ),
                  gateClassOps,
                  snapshot.aircraft.aircraftClassId,
                );
              }
              return {
                id: offer.id,
                originIcao: offer.originIcao,
                destIcao: offer.destIcao,
                originName:
                  airports.get(offer.originIcao)?.name ?? offer.originIcao,
                destName: airports.get(offer.destIcao)?.name ?? offer.destIcao,
                paxCount: offer.groupSize,
                baggageKg: offer.baggageKg,
                payUsd: offer.payUsd,
                basePayUsd: offer.payUsd,
                urgency: offer.urgency === 'normal' ? 'normal' : 'urgent',
                reason: `Charter · ${offer.tier} · ${offer.groupSize} pax`,
                createdAtTick: offer.createdAtTick,
                expiresAtTick: offer.expiresAtTick,
                ticksRemaining: Math.max(
                  0,
                  offer.expiresAtTick - snapshot.world.tick,
                ),
                distanceNm: offer.distanceNm,
                international: offer.international,
                status: offer.status,
                ...(fit ? { fit } : {}),
              };
            });
          send(res, 200, {
            offers,
            total,
            page,
            pageCount,
            tick: snapshot.world.tick,
            sort: formatCharterBoardSorts(requestedSorts),
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/charters/accept') {
        const body = (await readBody(req)) as {
          offerId?: string;
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.offerId?.trim() || !body.aircraftId?.trim()) {
          send(res, 400, { error: 'offerId and aircraftId required' });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        const acceptCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const charterActor = await resolveVaFleetActor(req, acceptCompanyId);
          const pilotStamp = await vaPilotMissionStamp(req, acceptCompanyId);
          const peek = await withCareerRead((_world, missions) => {
            const aircraft = findPlayerAircraft(missions, body.aircraftId!);
            if (!aircraft) throw new Error(`Unknown aircraft ${body.aircraftId}`);
            return {
              aircraft,
              cargoOps: missions.cargoOps,
              classOps: missions.classOps,
            };
          }, { companyId: acceptCompanyId });
          const cargoLimit = await resolveClassMaxCargoKg(
            peek.aircraft.aircraftClassId,
            peek.aircraft.airframeTypeId,
          );
          const charterProgression = await resolvePilotProgressionOps(
            req,
            acceptCompanyId,
            { cargoOps: peek.cargoOps, classOps: peek.classOps },
          );
          const accepted = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withProgressionGates(missions, charterProgression, () => {
              const offer = (world.charterOffers ?? []).find(
                (row) => row.id === body.offerId,
              );
              if (!offer) throw new Error(`Unknown charter offer ${body.offerId}`);
              const aircraft = findPlayerAircraft(missions, body.aircraftId!);
              if (!aircraft) throw new Error(`Unknown aircraft ${body.aircraftId}`);
              assertClassOpsUnlocked(
                missions.classOps,
                aircraft.aircraftClassId,
              );
              if (
                aircraft.status !== 'parked' ||
                aircraft.locationIcao.toUpperCase() !== offer.originIcao
              ) {
                throw new Error(
                  `Aircraft ${aircraft.label} must be parked at ${offer.originIcao}`,
                );
              }
              const active = listActivePlayerMissionsForPilot(
                missions.missions,
                pilotStamp.pilotAccountId,
              );
              if (active.length > 0) {
                throw new Error(blockReasonAnotherActiveFlight(missions, active[0]!));
              }
              const fit = withCharterClassOpsGate(
                charterAircraftFit(
                  world,
                  missions,
                  offer,
                  aircraft,
                  cargoLimit.maxCargoKg,
                ),
                missions.classOps,
                aircraft.aircraftClassId,
              );
              if (!fit.compatible) {
                throw new Error(fit.reasons.join(' · ') || 'Aircraft is not compatible');
              }
              const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
              const configuration = findCareerAirframeConfiguration(
                airframe,
                aircraft.airframeConfigurationId,
                aircraft.rolesPackRelPath,
              );
              if (!configuration) throw new Error('Passenger configuration not found');
              const missionId = `msn_charter_${world.tick}_${Math.floor(
                Math.random() * 1e9,
              )}`;
              const mission = {
                ...reserveCharterOffer(world, {
                  offerId: offer.id,
                  missionId,
                  aircraftClassId: aircraft.aircraftClassId,
                  aircraftId: aircraft.id,
                  airframeTypeId: aircraft.airframeTypeId,
                  airframeConfigurationId: configuration.id,
                  rolesPackRelPath: configuration.rolesPackRelPath,
                }),
                ...pilotStamp,
              };
              missions.missions.push(mission);
              assignAircraftToMission(
                missions,
                aircraft.id,
                mission.id,
                mission.originIcao,
                {
                  actorAccountId: charterActor.accountId,
                  actorIsVaOwner: charterActor.isOwner,
                },
              );
              const charterTour = missions.playerFbos?.charterActiveTour;
              if (charterTour?.status === 'active') {
                const planned = charterTour.legs.find(
                  (leg) =>
                    leg.status === 'planned' &&
                    !leg.missionId &&
                    leg.offerId === offer.id,
                );
                if (planned) {
                  bindCharterTourLegMission(missions, {
                    legIndex: planned.index,
                    missionId: mission.id,
                    offerId: offer.id,
                  });
                }
              }
              syncCharterActiveTour(missions, world);
              return {
                mission: withMissionClientView(world, missions, mission),
                walletUsd: missions.walletUsd,
                fleet: withParkingRates(missions.fleet, world, missions),
                charterActiveTour: charterActiveTourView(missions, world),
              };
            });
          }, { housekeeping: false, companyId: acceptCompanyId });
          send(res, 200, accepted);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(res, /^Unknown /.test(message) ? 404 : 400, { error: message });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/market') {
        const marketCompanyId = companyIdFromRequest(req);
        // Sort/filter must not rewrite the world. (On Postgres, persist:'inbound'
        // still fell through to full saveEconomy — same freeze class as Charter.)
        const { world, cargoOps, classOps, missionsState } = await withCareerRead(
          (w, missions) => {
            reconcilePlayerInbound(w, missions.missions);
            return {
              world: w,
              cargoOps: missions.cargoOps,
              classOps: missions.classOps,
              missionsState: missions,
            };
          },
          { companyId: marketCompanyId },
        );
        const progression = await resolvePilotProgressionOps(
          req,
          marketCompanyId,
          { cargoOps, classOps },
        );
        const gateCargoOps = progression.cargoOps;
        const gateClassOps = progression.classOps;
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
          viewerCompanyId: marketCompanyId,
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
          // VA members: home Class Ops, not the VA ladder.
          if (row.npcClaim?.crewNeeded) {
            const crewClassId = row.npcClaim.aircraftClassId;
            if (
              crewClassId &&
              !classOpsIsUnlocked(gateClassOps, crewClassId)
            ) {
              return false;
            }
          }
          // Size hide only for empty-hangar starter browsing (Gross / no fleet).
          // Own fleet + Gross pay → full market; Viable/estimate uses the
          // selected airframe when the client passes aircraft=.
          if (hangarEmpty) {
            return !classOpsHidesBoardLot(gateClassOps, {
              availableKg: row.availableKg,
              crewNeeded: row.npcClaim?.crewNeeded,
              claimCargoKg: row.npcClaim?.cargoKg,
              crewClassId: row.npcClaim?.aircraftClassId,
            });
          }
          return true;
        });
        const countryByIcao = new Map(
          world.airports.map((airport) => [
            airport.icao.toUpperCase(),
            countryIdFromRegion(airport.region),
          ]),
        );
        const pilotCountryId = countryByIcao.get(
          (missionsState.pilotIcao ?? '').trim().toUpperCase(),
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
          /** Formation pay before idle escalation (freight board transparency). */
          basePayUsd?: number;
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
          originCountryId: string | undefined;
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
            basePayUsd: lotBasePayUsd(row.lot),
            urgency: row.lot.urgency,
            reason: row.lot.reason,
            createdAtTick: row.lot.createdAtTick,
            expiresAtTick: row.lot.expiresAtTick,
            ticksRemaining: Math.max(0, row.lot.expiresAtTick - world.tick),
            perishable: Boolean(getCommodity(row.lot.commodityId).perishable),
            bush:
              isBushHub(row.lot.originIcao) || isBushHub(row.lot.destIcao),
            cargoLocked: !cargoOpsIsUnlocked(
              gateCargoOps ?? undefined,
              row.lot.commodityId,
            ),
            classLocked: Boolean(
              row.npcClaim?.crewNeeded &&
                crewClassId &&
                !classOpsIsUnlocked(gateClassOps, crewClassId),
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
            originCountryId: countryByIcao.get(row.lot.originIcao.toUpperCase()),
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
          const netUsdRaw = payUsd - cached.fuelCostUsd;
          const netUsd = Number.isFinite(netUsdRaw) ? netUsdRaw : payUsd;
          const marginPct =
            payUsd > 0 ? netUsd / payUsd : netUsd < 0 ? -1 : 0;
          return {
            ...base,
            estimatedLiftKg: liftKg,
            estimatedFuelCostUsd: Number.isFinite(cached.fuelCostUsd)
              ? cached.fuelCostUsd
              : 0,
            estimatedNetUsd: netUsd,
            estimatedMarginPct: Number.isFinite(marginPct) ? marginPct : 0,
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
          pilotCountryId,
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
        const airportCompanyId = companyIdFromRequest(req);
        if (url.searchParams.get('part') === 'stock') {
          const world = await loadEconomy();
          const snap = requireStore().readAirportInventory(icao);
          if (!snap) {
            send(res, 404, { error: `Unknown airport ${icao}` });
            return;
          }
          send(
            res,
            200,
            mapAirportStockPayload(
              snap,
              nowMs,
              world,
            ),
          );
          return;
        }
        if (url.searchParams.get('part') === 'stats') {
          const loaded = await withCareerLock(async () => {
            const active = requireStore();
            const cached = await loadEconomyUnlocked({ skipCatchUp: true });
            const airport = cached.airports.find((a) => a.icao === icao);
            if (!airport) return { missing: true as const };
            const day = economyDayIndex(cached.tick);
            const sinceDay = Math.max(
              0,
              day - HUB_ECONOMY_SAMPLE_RETENTION_DAYS + 1,
            );
            const history = await Promise.resolve(
              active.readHubEconomySamples({ icao, sinceDay }),
            );
            return { world: cached, airport, history };
          });
          if (!loaded || 'missing' in loaded) {
            send(res, 404, { error: `Unknown airport ${icao}` });
            return;
          }
          send(
            res,
            200,
            mapHubStatsPayload(
              loaded.world,
              loaded.airport,
              loaded.history,
              nowMs,
            ),
          );
          return;
        }
        const loaded = await withCareerLock(async () => {
          const active = requireStore();
          const cached = await loadEconomyUnlocked({ skipCatchUp: true });
          const missions = await loadMissions({ companyId: airportCompanyId });
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
          charter: readCharterHubPoolView(world, airport),
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
        const body = (await readBody(req)) as {
          icao?: string;
          companyId?: string;
        };
        const fboBuyCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const icao = (body.icao ?? missions.homeHubIcao).trim().toUpperCase();
            const bought = buyFboTier1(missions, world, icao);
            // Open Dispatcher hire desk for this hub (same persist as the buy).
            refreshBaseDispatcherHirePool(missions, world, {
              hubIcao: bought.fbo.icao,
              force: true,
            });
            return {
              walletUsd: missions.walletUsd,
              debitUsd: bought.debitUsd,
              fbo: bought.fbo,
              playerFbos: playerFboSnapshot(missions, world),
              companyCrew: companyCrewSnapshot(missions, world),
              dispatcher: baseDispatcherSnapshot(missions, world, {
                hubIcao: bought.fbo.icao,
              }),
              policy: resolveBaseDispatchScoutPolicy(missions),
            };
          }, { persist: 'company', companyId: fboBuyCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/upgrade') {
        const body = (await readBody(req)) as {
          fboId?: string;
          companyId?: string;
        };
        if (!body.fboId) {
          send(res, 400, { error: 'fboId required' });
          return;
        }
        const fboUpgradeCompanyId = companyIdFromRequest(req, body.companyId);
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
          }, { persist: 'company', companyId: fboUpgradeCompanyId });
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
        const portsCompanyId = companyIdFromRequest(req);

        try {
          // ensurePortListings may expire/refill; persist those tables only so
          // buy can find the same listing IDs after reload.
          const companyNames = await companyDisplayNameMap(requireStore());
          const alliedCompanyIds = await portOperatorAlliedCompanyIds(req);
          const result = await withCareerWrite(
            (world, missions) => {
              settleWarehouseInboundTransfers(missions, world);
              const groundStaff = groundStaffSnapshot(missions, world);
              const ports = portSnapshot(world, missions, {
                companyDisplayNames: companyNames,
                viewerCompanyId: portsCompanyId,
                alliedCompanyIds,
              });
              return {
                ...ports,
                groundStaff,
                warehouses: { ...ports.warehouses, groundStaff },
              };
            },
            { persist: 'portMarket', companyId: portsCompanyId },
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
          companyId?: string;
        };
        const ports_buyCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.listingId || body.kg == null) {
          send(res, 400, { error: 'listingId and kg required' });
          return;
        }
        try {
          const alliedCompanyIds = await portOperatorAlliedCompanyIds(req);
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () => {
              const bought = buyPortListing(missions, world, {
                listingId: body.listingId!,
                kg: Number(body.kg),
                companyId: ports_buyCompanyId,
                alliedCompanyIds,
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
                ports: portSnapshot(world, missions, {
                  viewerCompanyId: ports_buyCompanyId,
                  alliedCompanyIds,
                }),
                warehouses: playerWarehouseSnapshot(missions, world),
              };
            });
          }, {
            persist: 'company',
            persistPortListingId: body.listingId,
              companyId: ports_buyCompanyId,
            });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/auto-buy') {
        const body = (await readBody(req)) as {
          action?: 'upsert' | 'pause' | 'remove';
          id?: string;
          portId?: string;
          commodityId?: string;
          maxPriceUsdPerKg?: number;
          maxKgPerDay?: number;
          warehouseId?: string;
          walletFloorUsd?: number;
          paused?: boolean;
          companyId?: string;
        };
        const ports_auto_buyCompanyId = companyIdFromRequest(req, body.companyId);
        const action = body.action ?? 'upsert';
        try {
          await assertVaPortDeskOps(
            req,
            ports_auto_buyCompanyId,
            'manage Port FBO desk auto-buy',
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            if (action === 'remove') {
              if (!body.id) throw new Error('id required');
              removePortAutoBuyOrder(missions, body.id);
            } else if (action === 'pause') {
              if (!body.id) throw new Error('id required');
              setPortAutoBuyOrderPaused(
                missions,
                body.id,
                body.paused !== false,
              );
            } else {
              if (
                !body.portId ||
                !body.commodityId ||
                body.maxPriceUsdPerKg == null ||
                body.maxKgPerDay == null ||
                !body.warehouseId
              ) {
                throw new Error(
                  'portId, commodityId, maxPriceUsdPerKg, maxKgPerDay, warehouseId required',
                );
              }
              upsertPortAutoBuyOrder(missions, world, {
                id: body.id,
                portId: body.portId,
                commodityId: body.commodityId,
                maxPriceUsdPerKg: Number(body.maxPriceUsdPerKg),
                maxKgPerDay: Number(body.maxKgPerDay),
                warehouseId: body.warehouseId,
                walletFloorUsd:
                  body.walletFloorUsd != null
                    ? Number(body.walletFloorUsd)
                    : undefined,
                paused: body.paused === true,
                companyId: ports_auto_buyCompanyId,
              });
            }
            return {
              walletUsd: missions.walletUsd,
              maxActive: PORT_AUTO_BUY_MAX_ACTIVE,
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_auto_buyCompanyId }),
            };
          }, { persist: 'company', companyId: ports_auto_buyCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/concession/claim') {
        const body = (await readBody(req)) as { portId?: string; companyId?: string;
        };
        const ports_concession_claimCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.portId) {
          send(res, 400, { error: 'portId required' });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            ports_concession_claimCompanyId,
            'claim a Port FBO for the VA',
          );
          const companyNames = await companyDisplayNameMap(requireStore());
          const displayName =
            companyNames.get(ports_concession_claimCompanyId) ??
            ports_concession_claimCompanyId;
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const concession = claimPortConcession(missions, world, {
              portId: body.portId!,
              companyId: ports_concession_claimCompanyId,
            });
            const port = getCareerPort(body.portId!);
            recordPresence(world, {
              kind: 'port_claim',
              companyId: ports_concession_claimCompanyId,
              companyDisplayName: displayName,
              summary: port
                ? `Port FBO · ${port.name}`
                : `Port FBO · ${body.portId}`,
            });
            return {
              walletUsd: missions.walletUsd,
              concession,
              ports: portSnapshot(world, missions, {
                companyDisplayNames: companyNames,
                viewerCompanyId: ports_concession_claimCompanyId,
              }),
            };
          }, {
            persist: 'company',
            persistPortConcessions: true,
            companyId: ports_concession_claimCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/concession/renew') {
        const body = (await readBody(req)) as {
          portId?: string;
          days?: number;
          companyId?: string;
        };
        const ports_concession_renewCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.portId) {
          send(res, 400, { error: 'portId required' });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            ports_concession_renewCompanyId,
            'renew a Port FBO lease',
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const concession = renewPortConcession(missions, world, {
              portId: body.portId!,
              days: body.days != null ? Number(body.days) : undefined,
              companyId: ports_concession_renewCompanyId,
            });
            return {
              walletUsd: missions.walletUsd,
              concession,
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_concession_renewCompanyId }),
            };
          }, { persist: 'company', persistPortConcessions: true, companyId: ports_concession_renewCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/concession/upgrade') {
        const body = (await readBody(req)) as { portId?: string; companyId?: string;
        };
        const ports_concession_upgradeCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.portId) {
          send(res, 400, { error: 'portId required' });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            ports_concession_upgradeCompanyId,
            'upgrade a Port FBO',
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const concession = upgradePortConcession(missions, world, {
              portId: body.portId!,
              companyId: ports_concession_upgradeCompanyId,
            });
            return {
              walletUsd: missions.walletUsd,
              concession,
              ports: portSnapshot(world, missions, {
                viewerCompanyId: ports_concession_upgradeCompanyId,
              }),
            };
          }, {
            persist: 'company',
            persistPortConcessions: true,
            companyId: ports_concession_upgradeCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/base/dispatch-scout') {
        const body = (await readBody(req)) as {
          action?: 'list' | 'confirm';
          lotId?: string;
          aircraftId?: string;
          kg?: number;
          minNm?: number;
          minKg?: number;
          excludeLastMile?: boolean;
          hubIcao?: string;
          companyId?: string;
        };
        const action = body.action ?? 'list';
        const hubIcao = body.hubIcao?.trim().toUpperCase() || undefined;
        const scoutCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          if (action === 'list') {
            const missions = await loadMissions({ companyId: scoutCompanyId });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            const policy = resolveBaseDispatchScoutPolicy(missions);
            send(res, 200, {
              suggestions: listBaseDispatchScoutSuggestions(missions, world, {
                aircraftId: body.aircraftId,
                minNm: body.minNm != null ? Number(body.minNm) : undefined,
                minKg: body.minKg != null ? Number(body.minKg) : undefined,
                excludeLastMile: body.excludeLastMile,
                hubIcao,
              }),
              policy,
              dispatcher: baseDispatcherSnapshot(missions, world),
            });
            return;
          }
          if (!body.lotId?.trim() || !body.aircraftId?.trim()) {
            send(res, 400, { error: 'lotId and aircraftId required' });
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const confirmed = confirmBaseDispatchScout(missions, world, {
              lotId: body.lotId!,
              aircraftId: body.aircraftId!,
              kg: body.kg != null ? Number(body.kg) : undefined,
              hubIcao,
            });
            const policy = resolveBaseDispatchScoutPolicy(missions);
            return {
              mission: withMissionClientView(world, missions, confirmed.mission),
              kg: confirmed.kg,
              suggestions: listBaseDispatchScoutSuggestions(missions, world, {
                hubIcao,
              }),
              policy,
              dispatcher: baseDispatcherSnapshot(missions, world),
              walletUsd: missions.walletUsd,
              missions: missions.missions.map((m) =>
                withMissionClientView(world, missions, m),
              ),
            };
          }, {
            commandSliceLotIds: [body.lotId],
            housekeeping: false,
            companyId: scoutCompanyId,
          });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/base/dispatch-tours') {
        const body = (await readBody(req)) as {
          action?: 'list' | 'confirm' | 'status' | 'accept-leg' | 'drop' | 'drop-unbound' | 'prepare' | 'attach' | 'bind-leg';
          hubIcao?: string;
          aircraftId?: string;
          originIcao?: string;
          legs?: number;
          minNm?: number;
          maxNm?: number | null;
          maxFerryNm?: number | null;
          minKg?: number;
          returnMode?: 'none' | 'origin' | 'base';
          preferLeaveBase?: boolean;
          excludeLastMile?: boolean;
          firstLotId?: string;
          kg?: number;
          tourId?: string;
          routeLabel?: string;
          tourLegs?: Array<{
            lotId: string;
            originIcao: string;
            destIcao: string;
            commodityId: string;
            liftKg: number;
            distanceNm: number;
            ferryNm: number;
            payUsd: number;
            fuelCostUsd: number;
            netUsd: number;
            lastMile: boolean;
          }>;
          legIndex?: number;
          missionId?: string;
          companyId?: string;
        };
        const action = body.action ?? 'list';
        const hubIcao = body.hubIcao?.trim().toUpperCase() || undefined;
        const tourCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          if (action === 'list') {
            if (!hubIcao) {
              send(res, 400, { error: 'hubIcao required' });
              return;
            }
            const missions = await loadMissions({ companyId: tourCompanyId });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            const maxNmRaw =
              body.maxNm == null ? null : Number(body.maxNm);
            const maxFerryNmRaw =
              body.maxFerryNm == null ? null : Number(body.maxFerryNm);
            const policy = resolveBaseDispatchScoutPolicy(missions);
            syncActiveTour(missions, world, { renewSoftHold: false });
            const tours = withDevProgressionUnlock(req, missions, () =>
              listBaseDispatchTours(missions, world, {
                hubIcao,
                aircraftId: body.aircraftId,
                originIcao: body.originIcao,
                legs: body.legs != null ? Number(body.legs) : undefined,
                minNm: body.minNm != null ? Number(body.minNm) : undefined,
                maxNm:
                  maxNmRaw != null && Number.isFinite(maxNmRaw) && maxNmRaw > 0
                    ? maxNmRaw
                    : null,
                maxFerryNm:
                  maxFerryNmRaw != null &&
                  Number.isFinite(maxFerryNmRaw) &&
                  maxFerryNmRaw > 0
                    ? maxFerryNmRaw
                    : undefined,
                minKg: body.minKg != null ? Number(body.minKg) : undefined,
                returnMode: body.returnMode,
                preferLeaveBase: body.preferLeaveBase,
                excludeLastMile: body.excludeLastMile,
              }),
            );
            send(res, 200, {
              tours,
              activeTour: activeTourView(missions, world, {
                renewSoftHold: false,
              }),
              policy,
              dispatcher: baseDispatcherSnapshot(missions, world),
            });
            return;
          }
          if (action === 'status') {
            const peek = await loadMissions({ companyId: tourCompanyId });
            const softLots = (peek.playerFbos?.activeTour?.legs ?? [])
              .filter((l) => (l.softHoldKg ?? 0) > 0 && l.lotId)
              .map((l) => l.lotId);
            const plannedLots = (peek.playerFbos?.activeTour?.legs ?? [])
              .filter((l) => l.status === 'planned' && l.lotId)
              .map((l) => l.lotId);
            const result = await withCareerWrite((world, missions) => {
              syncActiveTour(missions, world);
              return {
                activeTour: activeTourView(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              commandSliceLotIds: [...new Set([...softLots, ...plannedLots])],
              housekeeping: false,
              companyId: tourCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (action === 'drop') {
            const peek = await loadMissions({ companyId: tourCompanyId });
            const softLots = (peek.playerFbos?.activeTour?.legs ?? [])
              .filter((l) => (l.softHoldKg ?? 0) > 0 && l.lotId)
              .map((l) => l.lotId);
            const result = await withCareerWrite((world, missions) => {
              dropActiveTour(missions, world);
              return {
                activeTour: null as null,
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
              };
            }, {
              commandSliceLotIds: softLots,
              housekeeping: false,
              companyId: tourCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (
            action === 'prepare' ||
            action === 'accept-leg' ||
            action === 'confirm'
          ) {
            const updatePolicy = await resolveClientUpdatePolicy(store);
            if (
              rejectIfClientUpdateRequired(
                res,
                updatePolicy,
                clientVersionFromRequest(req),
              )
            ) {
              return;
            }
          }
          if (action === 'prepare') {
            if (
              !body.aircraftId?.trim() ||
              !Array.isArray(body.tourLegs) ||
              body.tourLegs.length < 2
            ) {
              send(res, 400, {
                error: 'aircraftId and tourLegs (2+) required',
              });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              prepareActiveTour(missions, world, {
                aircraftId: body.aircraftId!,
                hubIcao:
                  hubIcao ||
                  body.tourLegs![0]!.originIcao.trim().toUpperCase(),
                tourId: body.tourId,
                routeLabel: body.routeLabel,
                legs: body.tourLegs!,
              });
              return {
                activeTour: activeTourView(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              commandSliceLotIds: body.tourLegs.map((l) => l.lotId),
              housekeeping: false,
              companyId: tourCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (action === 'drop-unbound') {
            const peek = await loadMissions({ companyId: tourCompanyId });
            const softLots = (peek.playerFbos?.activeTour?.legs ?? [])
              .filter((l) => (l.softHoldKg ?? 0) > 0 && l.lotId)
              .map((l) => l.lotId);
            const result = await withCareerWrite((world, missions) => {
              dropPreparedActiveTourIfUnbound(missions, world);
              return {
                activeTour: activeTourView(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              commandSliceLotIds: softLots,
              housekeeping: false,
              companyId: tourCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (action === 'attach') {
            if (
              !body.missionId?.trim() ||
              !body.aircraftId?.trim() ||
              !Array.isArray(body.tourLegs) ||
              body.tourLegs.length < 2
            ) {
              send(res, 400, {
                error: 'missionId, aircraftId, and tourLegs (2+) required',
              });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              const attached = attachActiveTourFromMission(missions, world, {
                missionId: body.missionId!,
                aircraftId: body.aircraftId!,
                hubIcao:
                  hubIcao ||
                  missions.homeHubIcao?.trim().toUpperCase() ||
                  body.tourLegs![0]!.originIcao,
                tourLegs: body.tourLegs!,
                tourId: body.tourId,
                routeLabel: body.routeLabel,
              });
              return {
                activeTour: activeTourView(missions, world),
                tour: attached,
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
                missions: missions.missions.map((m) =>
                  withMissionClientView(world, missions, m),
                ),
              };
            }, { persist: 'company', housekeeping: false, companyId: tourCompanyId });
            send(res, 200, result);
            return;
          }
          if (action === 'bind-leg') {
            if (!body.missionId?.trim() || body.legIndex == null) {
              send(res, 400, { error: 'missionId and legIndex required' });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              const activeTour = bindActiveTourLegToMission(missions, world, {
                legIndex: Number(body.legIndex),
                missionId: body.missionId!,
              });
              return {
                activeTour,
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
                missions: missions.missions.map((m) =>
                  withMissionClientView(world, missions, m),
                ),
              };
            }, { persist: 'company', housekeeping: false, companyId: tourCompanyId });
            send(res, 200, result);
            return;
          }
          if (action === 'accept-leg') {
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              const accepted = acceptActiveTourLeg(missions, world, {
                legIndex:
                  body.legIndex != null ? Number(body.legIndex) : undefined,
                kg: body.kg != null ? Number(body.kg) : undefined,
              });
              return {
                mission: withMissionClientView(
                  world,
                  missions,
                  accepted.mission,
                ),
                kg: accepted.kg,
                tourLegIndex: accepted.tourLegIndex,
                rebound: accepted.rebound,
                activeTour: accepted.activeTour,
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                walletUsd: missions.walletUsd,
                missions: missions.missions.map((m) =>
                  withMissionClientView(world, missions, m),
                ),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              housekeeping: false,
              companyId: tourCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (!body.firstLotId?.trim() || !body.aircraftId?.trim()) {
            send(res, 400, { error: 'firstLotId and aircraftId required' });
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const confirmed = confirmBaseDispatchTour(missions, world, {
              firstLotId: body.firstLotId!,
              aircraftId: body.aircraftId!,
              kg: body.kg != null ? Number(body.kg) : undefined,
              hubIcao,
              tourId: body.tourId,
              routeLabel: body.routeLabel,
              tourLegs: body.tourLegs,
            });
            const policy = resolveBaseDispatchScoutPolicy(missions);
            return {
              mission: withMissionClientView(
                world,
                missions,
                confirmed.mission,
              ),
              kg: confirmed.kg,
              tourLegIndex: confirmed.tourLegIndex,
              activeTour: confirmed.activeTour
                ? activeTourView(missions, world)
                : null,
              tours: hubIcao
                ? listBaseDispatchTours(missions, world, {
                    hubIcao,
                    aircraftId: body.aircraftId,
                    originIcao: body.originIcao,
                    legs: body.legs != null ? Number(body.legs) : undefined,
                    minNm: body.minNm != null ? Number(body.minNm) : undefined,
                    returnMode: body.returnMode,
                  })
                : [],
              suggestions: listBaseDispatchScoutSuggestions(missions, world, {
                hubIcao,
              }),
              policy,
              dispatcher: baseDispatcherSnapshot(missions, world),
              walletUsd: missions.walletUsd,
              missions: missions.missions.map((m) =>
                withMissionClientView(world, missions, m),
              ),
              playerFbos: playerFboSnapshot(missions, world),
            };
          }, {
            commandSliceLotIds: [body.firstLotId],
            housekeeping: false,
              companyId: tourCompanyId,
            });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/base/dispatch-charters') {
        const body = (await readBody(req)) as {
          action?: 'list' | 'status' | 'prepare' | 'drop' | 'bind-leg';
          hubIcao?: string;
          aircraftId?: string;
          originIcao?: string;
          legs?: number;
          minNm?: number;
          maxNm?: number | null;
          maxFerryNm?: number | null;
          returnMode?: 'none' | 'origin' | 'base';
          preferLeaveBase?: boolean;
          tourId?: string;
          routeLabel?: string;
          tourLegs?: Array<{
            offerId: string;
            originIcao: string;
            destIcao: string;
            groupSize: number;
            baggageKg: number;
            distanceNm: number;
            ferryNm: number;
            payUsd: number;
            fuelCostUsd: number;
            netUsd: number;
            tier: string;
            expiresAtTick: number;
          }>;
          legIndex?: number;
          missionId?: string;
          offerId?: string;
          companyId?: string;
        };
        const action = body.action ?? 'list';
        const hubIcao = body.hubIcao?.trim().toUpperCase() || undefined;
        const charterCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          if (action === 'list') {
            if (!hubIcao) {
              send(res, 400, { error: 'hubIcao required' });
              return;
            }
            const missions = await loadMissions({ companyId: charterCompanyId });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            const maxNmRaw =
              body.maxNm == null ? null : Number(body.maxNm);
            const maxFerryNmRaw =
              body.maxFerryNm == null ? null : Number(body.maxFerryNm);
            syncCharterActiveTour(missions, world);
            const tours = withDevProgressionUnlock(req, missions, () =>
              listBaseDispatchCharterTours(missions, world, {
                hubIcao,
                aircraftId: body.aircraftId,
                originIcao: body.originIcao,
                legs: body.legs != null ? Number(body.legs) : undefined,
                minNm: body.minNm != null ? Number(body.minNm) : undefined,
                maxNm:
                  maxNmRaw != null && Number.isFinite(maxNmRaw) && maxNmRaw > 0
                    ? maxNmRaw
                    : null,
                maxFerryNm:
                  maxFerryNmRaw != null &&
                  Number.isFinite(maxFerryNmRaw) &&
                  maxFerryNmRaw > 0
                    ? maxFerryNmRaw
                    : undefined,
                returnMode: body.returnMode,
                preferLeaveBase: body.preferLeaveBase,
              }),
            );
            send(res, 200, {
              tours,
              charterActiveTour: charterActiveTourView(missions, world),
              policy: resolveBaseDispatchScoutPolicy(missions),
              dispatcher: baseDispatcherSnapshot(missions, world),
            });
            return;
          }
          if (action === 'status') {
            const result = await withCareerWrite((world, missions) => {
              syncCharterActiveTour(missions, world);
              return {
                charterActiveTour: charterActiveTourView(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              housekeeping: false,
              companyId: charterCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (action === 'drop') {
            const result = await withCareerWrite((world, missions) => {
              dropCharterActiveTour(missions);
              return {
                charterActiveTour: null as null,
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              housekeeping: false,
              companyId: charterCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (
            action === 'prepare' ||
            action === 'accept-leg' ||
            action === 'confirm'
          ) {
            const updatePolicy = await resolveClientUpdatePolicy(store);
            if (
              rejectIfClientUpdateRequired(
                res,
                updatePolicy,
                clientVersionFromRequest(req),
              )
            ) {
              return;
            }
          }
          if (action === 'prepare') {
            if (
              !body.aircraftId?.trim() ||
              !Array.isArray(body.tourLegs) ||
              body.tourLegs.length < 2
            ) {
              send(res, 400, {
                error: 'aircraftId and tourLegs (2) required',
              });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              prepareCharterActiveTour(missions, world, {
                aircraftId: body.aircraftId!,
                hubIcao:
                  hubIcao ||
                  body.tourLegs![0]!.originIcao.trim().toUpperCase(),
                tourId: body.tourId,
                routeLabel: body.routeLabel,
                legs: body.tourLegs!,
              });
              return {
                charterActiveTour: charterActiveTourView(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              housekeeping: false,
              companyId: charterCompanyId,
            });
            send(res, 200, result);
            return;
          }
          if (action === 'bind-leg') {
            if (!body.missionId?.trim() || body.legIndex == null) {
              send(res, 400, { error: 'missionId and legIndex required' });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              bindCharterTourLegMission(missions, {
                legIndex: Number(body.legIndex),
                missionId: body.missionId!,
                offerId: body.offerId,
              });
              syncCharterActiveTour(missions, world);
              return {
                charterActiveTour: charterActiveTourView(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
                dispatcher: baseDispatcherSnapshot(missions, world),
                playerFbos: playerFboSnapshot(missions, world),
              };
            }, {
              persist: 'company',
              housekeeping: false,
              companyId: charterCompanyId,
            });
            send(res, 200, result);
            return;
          }
          send(res, 400, { error: `Unknown action ${action}` });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/base/dispatcher') {
        const body = (await readBody(req)) as {
          action?: 'list' | 'hire' | 'fire' | 'refresh';
          fboId?: string;
          hubIcao?: string;
          candidateId?: string;
          memberId?: string;
          companyId?: string;
        };
        const action = body.action ?? 'list';
        const dispatcherCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          if (action === 'list') {
            const missions = await loadMissions({
              companyId: dispatcherCompanyId,
            });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            send(res, 200, {
              dispatcher: baseDispatcherSnapshot(missions, world, {
                hubIcao: body.hubIcao,
              }),
              policy: resolveBaseDispatchScoutPolicy(missions),
            });
            return;
          }
          if (action === 'refresh') {
            const result = await withCareerWrite((world, missions) => {
              refreshBaseDispatcherHirePool(missions, world, {
                hubIcao: body.hubIcao,
                force: true,
              });
              return {
                dispatcher: baseDispatcherSnapshot(missions, world, {
                  hubIcao: body.hubIcao,
                }),
                policy: resolveBaseDispatchScoutPolicy(missions),
              };
            }, { persist: 'company', companyId: dispatcherCompanyId });
            send(res, 200, result);
            return;
          }
          if (action === 'hire') {
            if (!body.fboId?.trim() || !body.candidateId?.trim()) {
              send(res, 400, { error: 'fboId and candidateId required' });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              const hired = hireBaseDispatcherCandidate(missions, world, {
                fboId: body.fboId!.trim(),
                candidateId: body.candidateId!.trim(),
              });
              // Do not list scout suggestions here — that walks world.lots × fleet
              // under the career lock (tens of seconds on MP). Client only needs
              // dispatcher + policy; Search fetches tours on demand.
              return {
                member: hired.member,
                debitUsd: hired.debitUsd,
                walletUsd: missions.walletUsd,
                dispatcher: baseDispatcherSnapshot(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
              };
            }, { persist: 'company', companyId: dispatcherCompanyId });
            send(res, 200, result);
            return;
          }
          if (action === 'fire') {
            if (!body.memberId?.trim()) {
              send(res, 400, { error: 'memberId required' });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              const fired = fireBaseDispatcherMember(
                missions,
                world,
                body.memberId!.trim(),
              );
              return {
                member: fired.member,
                debitUsd: fired.debitUsd,
                walletUsd: missions.walletUsd,
                dispatcher: baseDispatcherSnapshot(missions, world),
                policy: resolveBaseDispatchScoutPolicy(missions),
              };
            }, { persist: 'company', companyId: dispatcherCompanyId });
            send(res, 200, result);
            return;
          }
          send(res, 400, { error: 'Unknown action' });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/scout') {
        const body = (await readBody(req)) as {
          action?: 'list' | 'confirm';
          kind?: 'bridge' | 'demand' | 'haul';
          orderId?: string;
          originIcao?: string;
          destIcao?: string;
          commodityId?: string;
          kg?: number;
          companyId?: string;
        };
        const ports_scoutCompanyId = companyIdFromRequest(req, body.companyId);
        const action = body.action ?? 'list';
        const kind =
          body.kind ??
          (body.orderId ? 'demand' : 'bridge');
        const scoutActorAccountId =
          authSessionFromRequest(req)?.account.id?.trim() || undefined;
        try {
          if (action === 'list') {
            const missions = await loadMissions({ companyId: ports_scoutCompanyId });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            send(
              res,
              200,
              listPortScoutDesk(missions, world, {
                companyId: ports_scoutCompanyId,
              }),
            );
            return;
          }
          if (kind === 'demand') {
            if (!body.orderId?.trim() || !body.originIcao?.trim()) {
              send(res, 400, {
                error: 'orderId and originIcao required for Demand scout',
              });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              const confirmed = confirmPortScoutDemand(missions, world, {
                orderId: body.orderId!,
                originIcao: body.originIcao!,
                kg: body.kg != null ? Number(body.kg) : undefined,
                companyId: ports_scoutCompanyId,
                heldByAccountId: scoutActorAccountId,
              });
              return {
                hold: confirmed.hold,
                kg: confirmed.kg,
                ...listPortScoutDesk(missions, world, {
                  companyId: ports_scoutCompanyId,
                }),
                ports: portSnapshot(world, missions, { viewerCompanyId: ports_scoutCompanyId }),
                warehouses: playerWarehouseSnapshot(missions, world),
                demand: demandSnapshot(world, {
                  warehouseIcaos: (missions.playerWarehouses?.warehouses ?? []).map(
                    (w) => w.icao,
                  ),
                }),
              };
            }, { persist: 'company', companyId: ports_scoutCompanyId });
            send(res, 200, result);
            return;
          }
          if (kind === 'haul') {
            if (
              !body.originIcao?.trim() ||
              !body.destIcao?.trim() ||
              !body.commodityId?.trim()
            ) {
              send(res, 400, {
                error:
                  'originIcao, destIcao, and commodityId required for Haul scout',
              });
              return;
            }
            const result = await withCareerWrite((world, missions) => {
              assertCompanyCreditAllowsOps(missions);
              const confirmed = confirmPortScoutHaul(missions, world, {
                originIcao: body.originIcao!,
                destIcao: body.destIcao!,
                commodityId: body.commodityId!.trim() as Parameters<
                  typeof confirmPortScoutHaul
                >[2]['commodityId'],
                kg: body.kg != null ? Number(body.kg) : undefined,
                companyId: ports_scoutCompanyId,
                heldByAccountId: scoutActorAccountId,
              });
              return {
                hold: confirmed.hold,
                kg: confirmed.kg,
                payUsd: confirmed.payUsd,
                ...listPortScoutDesk(missions, world, {
                  companyId: ports_scoutCompanyId,
                }),
                ports: portSnapshot(world, missions, { viewerCompanyId: ports_scoutCompanyId }),
                warehouses: playerWarehouseSnapshot(missions, world),
              };
            }, { persist: 'company', companyId: ports_scoutCompanyId });
            send(res, 200, result);
            return;
          }
          if (
            !body.originIcao?.trim() ||
            !body.destIcao?.trim() ||
            !body.commodityId?.trim()
          ) {
            send(res, 400, {
              error: 'originIcao, destIcao, and commodityId required',
            });
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const confirmed = confirmPortScoutBridge(missions, world, {
              originIcao: body.originIcao!,
              destIcao: body.destIcao!,
              commodityId: body.commodityId!.trim() as Parameters<
                typeof confirmPortScoutBridge
              >[2]['commodityId'],
              kg: body.kg != null ? Number(body.kg) : undefined,
              companyId: ports_scoutCompanyId,
              heldByAccountId: scoutActorAccountId,
            });
            return {
              hold: confirmed.hold,
              kg: confirmed.kg,
              ...listPortScoutDesk(missions, world, {
                companyId: ports_scoutCompanyId,
              }),
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_scoutCompanyId }),
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: ports_scoutCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/shuttle') {
        const body = (await readBody(req)) as {
          action?: 'quote' | 'dispatch';
          holdId?: string;
          aircraftId?: string;
          companyId?: string;
        };
        const ports_shuttleCompanyId = companyIdFromRequest(req, body.companyId);
        const action = body.action ?? 'dispatch';
        if (!body.holdId?.trim()) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        try {
          if (action === 'quote') {
            const missions = await loadMissions({ companyId: ports_shuttleCompanyId });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            send(res, 200, {
              quote: quotePortShuttleBridgeHold(missions, world, {
                holdId: body.holdId,
                companyId: ports_shuttleCompanyId,
              }),
            });
            return;
          }
          if (!body.aircraftId?.trim()) {
            send(res, 400, { error: 'aircraftId required' });
            return;
          }
          await assertVaPortDeskOps(
            req,
            ports_shuttleCompanyId,
            'dispatch a Port shuttle',
          );
          const updatePolicy = await resolveClientUpdatePolicy(store);
          if (
            rejectIfClientUpdateRequired(
              res,
              updatePolicy,
              clientVersionFromRequest(req),
            )
          ) {
            return;
          }
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const dispatched = dispatchPortShuttleBridgeHold(missions, world, {
              holdId: body.holdId!,
              aircraftId: body.aircraftId!,
              nowMs: Date.now(),
              companyId: ports_shuttleCompanyId,
            });
            return {
              mission: dispatched.mission,
              kg: dispatched.kg,
              feeUsd: dispatched.feeUsd,
              fuelDebitUsd: dispatched.fuelDebitUsd,
              walletUsd: missions.walletUsd,
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_shuttleCompanyId }),
              warehouses: playerWarehouseSnapshot(missions, world),
              fleet: missions.fleet ?? [],
              missions: listActivePlayerMissions(missions.missions ?? []),
            };
          }, { persist: 'company', companyId: ports_shuttleCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/stevedore') {
        const body = (await readBody(req)) as {
          action?: 'quote' | 'start' | 'destinations';
          pickupId?: string;
          destWarehouseId?: string;
          kg?: number;
          companyId?: string;
        };
        const ports_stevedoreCompanyId = companyIdFromRequest(req, body.companyId);
        const action = body.action ?? 'start';
        if (!body.pickupId) {
          send(res, 400, { error: 'pickupId required' });
          return;
        }
        try {
          if (action === 'destinations' || action === 'quote') {
            const missions = await loadMissions({ companyId: ports_stevedoreCompanyId });
            const world = requireStore().peekEconomyWorld();
            if (!world) {
              send(res, 503, { error: 'Economy not loaded' });
              return;
            }
            if (action === 'destinations') {
              send(res, 200, {
                destinations: listPortStevedoreDestinations(
                  missions,
                  world,
                  body.pickupId,
                  ports_stevedoreCompanyId,
                ),
              });
              return;
            }
            if (!body.destWarehouseId) {
              send(res, 400, { error: 'destWarehouseId required' });
              return;
            }
            send(res, 200, {
              quote: quotePortStevedoreHaul(
                missions,
                world,
                {
                  pickupId: body.pickupId,
                  destWarehouseId: body.destWarehouseId,
                  kg: body.kg != null ? Number(body.kg) : undefined,
                },
                ports_stevedoreCompanyId,
              ),
            });
            return;
          }
          if (!body.destWarehouseId) {
            send(res, 400, { error: 'destWarehouseId required' });
            return;
          }
          await assertVaPortDeskOps(
            req,
            ports_stevedoreCompanyId,
            'start a Port FBO stevedore haul',
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const started = startPortStevedoreHaul(
              missions,
              world,
              {
                pickupId: body.pickupId!,
                destWarehouseId: body.destWarehouseId!,
                kg: body.kg != null ? Number(body.kg) : undefined,
              },
              ports_stevedoreCompanyId,
            );
            return {
              walletUsd: missions.walletUsd,
              quote: started.quote,
              inboundTransfer: started.inboundTransfer,
              remainingYardKg: started.remainingYardKg,
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_stevedoreCompanyId }),
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: ports_stevedoreCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/deposit') {
        const body = (await readBody(req)) as {
          pickupId?: string;
          kg?: number;
          companyId?: string;
        };
        const ports_depositCompanyId = companyIdFromRequest(req, body.companyId);
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
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_depositCompanyId }),
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: ports_depositCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ports/pickup/abandon') {
        const body = (await readBody(req)) as { pickupId?: string; companyId?: string;
        };
        const ports_pickup_abandonCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.pickupId) {
          send(res, 400, { error: 'pickupId required' });
          return;
        }
        try {
          await assertVaPortDeskOps(
            req,
            ports_pickup_abandonCompanyId,
            'abandon Port yard cargo',
          );
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
              ports: portSnapshot(world, missions, { viewerCompanyId: ports_pickup_abandonCompanyId }),
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: ports_pickup_abandonCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
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
        const warehousesCompanyId = companyIdFromRequest(req);

        try {
          // Deposit due inbound on read so Arriving… does not wait for the next
          // pulse (SP UX). Gate remains readyAtTick <= world.tick (MP-safe).
          const result = await withCareerWrite((world, missions) => {
            settleWarehouseInboundTransfers(missions, world);
            return {
              ...playerWarehouseSnapshot(missions, world),
              groundStaff: groundStaffSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: warehousesCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/buy') {
        const body = (await readBody(req)) as { icao?: string; companyId?: string;
        };
        const warehouses_buyCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.icao) {
          send(res, 400, { error: 'icao required' });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            warehouses_buyCompanyId,
            'buy a warehouse for the VA',
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const bought = buyWarehouseAtPickupHub(missions, world, body.icao!);
            return {
              walletUsd: missions.walletUsd,
              debitUsd: bought.debitUsd,
              warehouse: bought.warehouse,
              quoteUsd: quoteWarehouseBuyUsd(world, body.icao!),
              warehouses: playerWarehouseSnapshot(missions, world),
              ports: portSnapshot(world, missions, { viewerCompanyId: warehouses_buyCompanyId }),
            };
          }, { persist: 'company', companyId: warehouses_buyCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/upgrade') {
        const body = (await readBody(req)) as { warehouseId?: string; companyId?: string;
        };
        const warehouses_upgradeCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.warehouseId) {
          send(res, 400, { error: 'warehouseId required' });
          return;
        }
        try {
          await assertVaOwnerForFleetMutation(
            req,
            warehouses_upgradeCompanyId,
            'upgrade a VA warehouse',
          );
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
              ports: portSnapshot(world, missions, { viewerCompanyId: warehouses_upgradeCompanyId }),
            };
          }, { persist: 'company', companyId: warehouses_upgradeCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/stock/abandon') {
        const body = (await readBody(req)) as { stockId?: string; companyId?: string;
        };
        const warehouses_stock_abandonCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.stockId) {
          send(res, 400, { error: 'stockId required' });
          return;
        }
        try {
          await assertVaPortDeskOps(
            req,
            warehouses_stock_abandonCompanyId,
            'abandon warehouse stock',
          );
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
              ports: portSnapshot(world, missions, { viewerCompanyId: warehouses_stock_abandonCompanyId }),
            };
          }, { persist: 'company', companyId: warehouses_stock_abandonCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, vaPermissionStatus(error), {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/bridge/quote') {
        const body = (await readBody(req)) as {
          originIcao?: string;
          destIcao?: string;
          kg?: number;
          commodityId?: string;
        };
        if (!body.originIcao || !body.destIcao) {
          send(res, 400, { error: 'originIcao and destIcao required' });
          return;
        }
        try {
          const world = requireStore().peekEconomyWorld();
          if (!world) {
            send(res, 503, { error: 'Economy not loaded' });
            return;
          }
          send(res, 200, {
            quote: quoteInternalHaulForRoute(world, {
              originIcao: body.originIcao,
              destIcao: body.destIcao,
              kg: body.kg != null ? Number(body.kg) : 0,
              commodityId: body.commodityId as CommodityId | undefined,
            }),
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/bridge/hold') {
        const body = (await readBody(req)) as {
          originIcao?: string;
          destIcao?: string;
          commodityId?: string;
          kg?: number;
          pilotPayUsd?: number | null;
          companyId?: string;
        };
        const warehouses_bridge_holdCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.originIcao || !body.destIcao || !body.commodityId) {
          send(res, 400, {
            error: 'originIcao, destIcao and commodityId required',
          });
          return;
        }
        try {
          const actorAccountId =
            authSessionFromRequest(req)?.account.id?.trim() || undefined;
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () => {
              const held = holdWarehouseBridge(missions, world, {
                originIcao: body.originIcao!,
                destIcao: body.destIcao!,
                commodityId: body.commodityId as CommodityId,
                kg: body.kg != null ? Number(body.kg) : undefined,
                pilotPayUsd:
                  body.pilotPayUsd === null
                    ? 0
                    : body.pilotPayUsd != null
                      ? Number(body.pilotPayUsd)
                      : undefined,
                heldByAccountId: actorAccountId,
              });
              return {
                hold: held.hold,
                kg: held.kg,
                pilotPayUsd: held.pilotPayUsd,
                warehouses: playerWarehouseSnapshot(missions, world),
              };
            });
          }, { persist: 'company', companyId: warehouses_bridge_holdCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/bridge/hold/cancel') {
        const body = (await readBody(req)) as { holdId?: string; companyId?: string;
        };
        const warehouses_bridge_hold_cancelCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const cancelled = cancelWarehouseBridgeHold(missions, world, {
              holdId: body.holdId!,
            });
            return {
              kg: cancelled.kg,
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: warehouses_bridge_hold_cancelCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/bridge/accept') {
        const body = (await readBody(req)) as {
          originIcao?: string;
          destIcao?: string;
          commodityId?: string;
          aircraftId?: string;
          kg?: number;
          pilotPayUsd?: number | null;
          companyId?: string;
        };
        const warehouses_bridge_acceptCompanyId = companyIdFromRequest(req, body.companyId);
        if (
          !body.originIcao ||
          !body.destIcao ||
          !body.commodityId ||
          !body.aircraftId
        ) {
          send(res, 400, {
            error: 'originIcao, destIcao, commodityId and aircraftId required',
          });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        try {
          const pilotStamp = await vaPilotMissionStamp(
            req,
            warehouses_bridge_acceptCompanyId,
          );
          const bridgeProgPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: warehouses_bridge_acceptCompanyId });
          const bridgeProgression = await resolvePilotProgressionOps(
            req,
            warehouses_bridge_acceptCompanyId,
            bridgeProgPeek,
          );
          const bridgeActor = await resolveVaFleetActor(
            req,
            warehouses_bridge_acceptCompanyId,
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () =>
              withProgressionGates(missions, bridgeProgression, () => {
                const accepted = acceptWarehouseBridge(missions, world, {
                  originIcao: body.originIcao!,
                  destIcao: body.destIcao!,
                  commodityId: body.commodityId as CommodityId,
                  aircraftId: body.aircraftId!,
                  kg: body.kg != null ? Number(body.kg) : undefined,
                  pilotPayUsd:
                    body.pilotPayUsd === null
                      ? 0
                      : body.pilotPayUsd != null
                        ? Number(body.pilotPayUsd)
                        : undefined,
                  ...pilotStamp,
                  actorIsVaOwner: bridgeActor.isOwner,
                });
                const warehouses = playerWarehouseSnapshot(missions, world);
                return {
                  walletUsd: missions.walletUsd,
                  mission: withMissionClientView(world, missions, accepted.mission),
                  kg: accepted.kg,
                  pilotPayUsd: accepted.pilotPayUsd,
                  warehouses,
                  fleet: missions.fleet,
                  missions: missions.missions.map((m) =>
                    withMissionClientView(world, missions, m),
                  ),
                };
              }),
            );
          }, { persist: 'company', companyId: warehouses_bridge_acceptCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/bridge/dispatch-hold') {
        const body = (await readBody(req)) as {
          holdId?: string;
          aircraftId?: string;
          pilotPayUsd?: number | null;
          kg?: number;
          companyId?: string;
        };
        const warehouses_bridge_dispatch_holdCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.holdId || !body.aircraftId) {
          send(res, 400, {
            error: 'holdId and aircraftId required',
          });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        try {
          const pilotStamp = await vaPilotMissionStamp(
            req,
            warehouses_bridge_dispatch_holdCompanyId,
          );
          const bridgeHoldActor = await resolveVaFleetActor(
            req,
            warehouses_bridge_dispatch_holdCompanyId,
          );
          const bridgeHoldProgPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: warehouses_bridge_dispatch_holdCompanyId });
          const bridgeHoldProgression = await resolvePilotProgressionOps(
            req,
            warehouses_bridge_dispatch_holdCompanyId,
            bridgeHoldProgPeek,
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () =>
              withProgressionGates(missions, bridgeHoldProgression, () => {
                const dispatched = dispatchWarehouseBridgeHold(missions, world, {
                  holdId: body.holdId!,
                  aircraftId: body.aircraftId!,
                  kg:
                    body.kg != null && Number.isFinite(Number(body.kg))
                      ? Number(body.kg)
                      : undefined,
                  pilotPayUsd:
                    body.pilotPayUsd === null
                      ? 0
                      : body.pilotPayUsd != null
                        ? Number(body.pilotPayUsd)
                        : undefined,
                  ...pilotStamp,
                  actorIsVaOwner: bridgeHoldActor.isOwner,
                });
                return {
                  walletUsd: missions.walletUsd,
                  mission: withMissionClientView(
                    world,
                    missions,
                    dispatched.mission,
                  ),
                  kg: dispatched.kg,
                  pilotPayUsd: dispatched.pilotPayUsd,
                  warehouses: playerWarehouseSnapshot(missions, world),
                  fleet: missions.fleet,
                  missions: missions.missions.map((m) =>
                    withMissionClientView(world, missions, m),
                  ),
                };
              }),
            );
          }, { persist: 'company', companyId: warehouses_bridge_dispatch_holdCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/haul/quote') {
        const body = (await readBody(req)) as {
          originIcao?: string;
          destIcao?: string;
          commodityId?: string;
          kg?: number;
        };
        if (!body.originIcao || !body.destIcao || !body.commodityId) {
          send(res, 400, {
            error: 'originIcao, destIcao and commodityId required',
          });
          return;
        }
        const kg = Math.max(0, Math.floor(Number(body.kg) || 0));
        if (kg <= 0) {
          send(res, 400, { error: 'kg must be > 0' });
          return;
        }
        try {
          const world = requireStore().peekEconomyWorld();
          if (!world) {
            send(res, 503, { error: 'Economy not loaded' });
            return;
          }
          const origin = body.originIcao.trim().toUpperCase();
          const dest = body.destIcao.trim().toUpperCase();
          const commodityId = body.commodityId as CommodityId;
          const payUsd = quoteWarehouseHaulPayUsd(world, {
            originIcao: origin,
            destIcao: dest,
            commodityId,
            kg,
          });
          const distanceNm =
            hubDistanceNm(origin, dest) ??
            routeDistanceNm(world, origin, dest) ??
            0;
          send(res, 200, {
            quote: {
              kg,
              payUsd,
              unitPriceUsd:
                kg > 0 ? Math.round((payUsd / kg) * 10000) / 10000 : 0,
              distanceNm: Math.round(distanceNm),
              wide: kg >= XL_LOT_MIN_KG,
            },
          });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/haul/hold') {
        const body = (await readBody(req)) as {
          originIcao?: string;
          destIcao?: string;
          commodityId?: string;
          kg?: number;
          companyId?: string;
        };
        const warehouses_haul_holdCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.originIcao || !body.destIcao || !body.commodityId) {
          send(res, 400, {
            error: 'originIcao, destIcao and commodityId required',
          });
          return;
        }
        try {
          const actorAccountId =
            authSessionFromRequest(req)?.account.id?.trim() || undefined;
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () => {
              const held = holdWarehouseHaul(missions, world, {
                originIcao: body.originIcao!,
                destIcao: body.destIcao!,
                commodityId: body.commodityId as CommodityId,
                kg: body.kg != null ? Number(body.kg) : undefined,
                heldByAccountId: actorAccountId,
              });
              return {
                hold: held.hold,
                kg: held.kg,
                payUsd: held.payUsd,
                warehouses: playerWarehouseSnapshot(missions, world),
              };
            });
          }, { persist: 'company', companyId: warehouses_haul_holdCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/haul/hold/cancel') {
        const body = (await readBody(req)) as { holdId?: string; companyId?: string;
        };
        const warehouses_haul_hold_cancelCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const cancelled = cancelWarehouseHaulHold(missions, world, {
              holdId: body.holdId!,
            });
            return {
              kg: cancelled.kg,
              warehouses: playerWarehouseSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: warehouses_haul_hold_cancelCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/haul/accept') {
        const body = (await readBody(req)) as {
          originIcao?: string;
          destIcao?: string;
          commodityId?: string;
          aircraftId?: string;
          kg?: number;
          companyId?: string;
        };
        const warehouses_haul_acceptCompanyId = companyIdFromRequest(req, body.companyId);
        if (
          !body.originIcao ||
          !body.destIcao ||
          !body.commodityId ||
          !body.aircraftId
        ) {
          send(res, 400, {
            error: 'originIcao, destIcao, commodityId and aircraftId required',
          });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        try {
          const haulPilotStamp = await vaPilotMissionStamp(
            req,
            warehouses_haul_acceptCompanyId,
          );
          const haulProgPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: warehouses_haul_acceptCompanyId });
          const haulProgression = await resolvePilotProgressionOps(
            req,
            warehouses_haul_acceptCompanyId,
            haulProgPeek,
          );
          const haulActor = await resolveVaFleetActor(
            req,
            warehouses_haul_acceptCompanyId,
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () =>
              withProgressionGates(missions, haulProgression, () => {
                const accepted = acceptWarehouseHaul(missions, world, {
                  originIcao: body.originIcao!,
                  destIcao: body.destIcao!,
                  commodityId: body.commodityId as CommodityId,
                  aircraftId: body.aircraftId!,
                  kg: body.kg != null ? Number(body.kg) : undefined,
                  ...haulPilotStamp,
                  actorIsVaOwner: haulActor.isOwner,
                });
                const mission = {
                  ...accepted.mission,
                  ...haulPilotStamp,
                };
                const idx = missions.missions.findIndex((m) => m.id === mission.id);
                if (idx >= 0) missions.missions[idx] = mission;
                return {
                  walletUsd: missions.walletUsd,
                  mission: withMissionClientView(world, missions, mission),
                  kg: accepted.kg,
                  payUsd: accepted.payUsd,
                  warehouses: playerWarehouseSnapshot(missions, world),
                  fleet: missions.fleet,
                  missions: missions.missions.map((m) =>
                    withMissionClientView(world, missions, m),
                  ),
                };
              }),
            );
          }, { persist: 'company', companyId: warehouses_haul_acceptCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/warehouses/haul/dispatch-hold') {
        const body = (await readBody(req)) as {
          holdId?: string;
          aircraftId?: string;
          kg?: number;
          companyId?: string;
        };
        const warehouses_haul_dispatch_holdCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.holdId || !body.aircraftId) {
          send(res, 400, {
            error: 'holdId and aircraftId required',
          });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        try {
          const haulPilotStamp = await vaPilotMissionStamp(
            req,
            warehouses_haul_dispatch_holdCompanyId,
          );
          const haulHoldActor = await resolveVaFleetActor(
            req,
            warehouses_haul_dispatch_holdCompanyId,
          );
          const haulHoldProgPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: warehouses_haul_dispatch_holdCompanyId });
          const haulHoldProgression = await resolvePilotProgressionOps(
            req,
            warehouses_haul_dispatch_holdCompanyId,
            haulHoldProgPeek,
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () =>
              withProgressionGates(missions, haulHoldProgression, () => {
                const dispatched = dispatchWarehouseHaulHold(missions, world, {
                  holdId: body.holdId!,
                  aircraftId: body.aircraftId!,
                  kg:
                    body.kg != null && Number.isFinite(Number(body.kg))
                      ? Number(body.kg)
                      : undefined,
                  ...haulPilotStamp,
                  actorIsVaOwner: haulHoldActor.isOwner,
                });
                return {
                  walletUsd: missions.walletUsd,
                  mission: withMissionClientView(
                    world,
                    missions,
                    dispatched.mission,
                  ),
                  kg: dispatched.kg,
                  payUsd: dispatched.payUsd,
                  warehouses: playerWarehouseSnapshot(missions, world),
                  fleet: missions.fleet,
                  missions: missions.missions.map((m) =>
                    withMissionClientView(world, missions, m),
                  ),
                };
              }),
            );
          }, { persist: 'company', companyId: warehouses_haul_dispatch_holdCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/demand') {
        const demandCompanyId = companyIdFromRequest(req);

        try {
          const result = await withCareerWrite((world, missions) => {
            expireDemandHolds(missions, world);
            ensureDemandOrders(world, {
              operatorCatchmentHubs: localOperatorDemandCatchmentHubs(world),
            });
            const warehouses = playerWarehouseSnapshot(missions, world);
            return {
              ...demandSnapshot(world, {
                warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
              }),
              warehouses,
            };
          }, { persist: 'demandBoard', companyId: demandCompanyId });
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
          companyId?: string;
        };
        const demand_acceptCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.orderId || !body.originIcao || !body.aircraftId) {
          send(res, 400, {
            error: 'orderId, originIcao and aircraftId required',
          });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        try {
          const pilotStamp = await vaPilotMissionStamp(
            req,
            demand_acceptCompanyId,
          );
          const demandActor = await resolveVaFleetActor(
            req,
            demand_acceptCompanyId,
          );
          const progPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: demand_acceptCompanyId });
          const progression = await resolvePilotProgressionOps(
            req,
            demand_acceptCompanyId,
            progPeek,
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withProgressionGates(missions, progression, () => {
              const accepted = acceptDemandOrder(missions, world, {
                orderId: body.orderId!,
                originIcao: body.originIcao!,
                aircraftId: body.aircraftId!,
                kg: body.kg != null ? Number(body.kg) : undefined,
                ...pilotStamp,
                actorIsVaOwner: demandActor.isOwner,
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
              companyId: demand_acceptCompanyId,
            });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/demand/hold') {
        const body = (await readBody(req)) as {
          orderId?: string;
          originIcao?: string;
          kg?: number;
          companyId?: string;
        };
        const demand_holdCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.orderId || !body.originIcao) {
          send(res, 400, {
            error: 'orderId and originIcao required',
          });
          return;
        }
        try {
          const actorAccountId =
            authSessionFromRequest(req)?.account.id?.trim() || undefined;
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () => {
              const held = holdDemandOrder(missions, world, {
                orderId: body.orderId!,
                originIcao: body.originIcao!,
                kg: body.kg != null ? Number(body.kg) : undefined,
                heldByAccountId: actorAccountId,
              });
              const warehouses = playerWarehouseSnapshot(missions, world);
              return {
                hold: held.hold,
                order: held.order,
                kg: held.kg,
                warehouses,
                demand: demandSnapshot(world, {
                  warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
                }),
              };
            });
          }, {
            persist: 'company',
            persistDemandOrderId: body.orderId,
              companyId: demand_holdCompanyId,
            });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/demand/hold/cancel') {
        const body = (await readBody(req)) as { holdId?: string; companyId?: string;
        };
        const demand_hold_cancelCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const cancelled = cancelDemandHold(missions, world, {
              holdId: body.holdId!,
            });
            const warehouses = playerWarehouseSnapshot(missions, world);
            return {
              kg: cancelled.kg,
              orderId: cancelled.orderId,
              warehouses,
              demand: demandSnapshot(world, {
                warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
              }),
            };
          }, {
            persist: 'demandBoard',
              companyId: demand_hold_cancelCompanyId,
            });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/demand/dispatch-hold') {
        const body = (await readBody(req)) as {
          holdId?: string;
          aircraftId?: string;
          kg?: number;
          companyId?: string;
        };
        const demand_dispatch_holdCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.holdId || !body.aircraftId) {
          send(res, 400, {
            error: 'holdId and aircraftId required',
          });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        try {
          const demandHoldStamp = await vaPilotMissionStamp(
            req,
            demand_dispatch_holdCompanyId,
          );
          const demandHoldActor = await resolveVaFleetActor(
            req,
            demand_dispatch_holdCompanyId,
          );
          const demandHoldProgPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: demand_dispatch_holdCompanyId });
          const demandHoldProgression = await resolvePilotProgressionOps(
            req,
            demand_dispatch_holdCompanyId,
            demandHoldProgPeek,
          );
          const result = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            return withDevCargoOpsUnlock(req, missions, () =>
              withProgressionGates(missions, demandHoldProgression, () => {
                const dispatched = dispatchDemandHold(missions, world, {
                  holdId: body.holdId!,
                  aircraftId: body.aircraftId!,
                  kg:
                    body.kg != null && Number.isFinite(Number(body.kg))
                      ? Number(body.kg)
                      : undefined,
                  ...demandHoldStamp,
                  actorIsVaOwner: demandHoldActor.isOwner,
                });
                const warehouses = playerWarehouseSnapshot(missions, world);
                return {
                  walletUsd: missions.walletUsd,
                  mission: withMissionClientView(world, missions, dispatched.mission),
                  order: dispatched.order,
                  kg: dispatched.kg,
                  payUsd: dispatched.payUsd,
                  warehouses,
                  demand: demandSnapshot(world, {
                    warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
                  }),
                  fleet: missions.fleet,
                  missions: missions.missions.map((m) =>
                    withMissionClientView(world, missions, m),
                  ),
                };
              }),
            );
          }, {
            persist: 'company',
            persistDemandOrderId: undefined,
            commandSliceAircraftId: body.aircraftId,
              companyId: demand_dispatch_holdCompanyId,
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
        send(res, 410, {
          error:
            'Base bonded holds removed — buy WH at a port pickup hub and use Demand Hold, or Accept the Market lot',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/cancel-hold') {
        const body = (await readBody(req)) as {
          holdId?: string;
          companyId?: string;
        };
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        const fboCancelHoldCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const result = await withCareerWrite((world, missions) => {
            const cancelled = cancelFboHold(missions, world, body.holdId!);
            return {
              releasedKg: cancelled.releasedKg,
              playerFbos: playerFboSnapshot(missions, world),
              walletUsd: missions.walletUsd,
            };
          }, {
            commandSliceHoldId: body.holdId,
            companyId: fboCancelHoldCompanyId,
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
        send(res, 410, {
          error:
            'Base hold reroute removed — cancel and re-hold, or Dispatch the current destination',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/release') {
        const body = (await readBody(req)) as {
          holdId?: string;
          aircraft?: string;
          aircraftId?: string;
          companyId?: string;
        };
        if (!body.holdId) {
          send(res, 400, { error: 'holdId required' });
          return;
        }
        const fboReleaseCompanyId = companyIdFromRequest(req, body.companyId);
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
              mission: withMissionClientView(world, missions, released.mission),
              playerFbos: playerFboSnapshot(missions, world),
              walletUsd: missions.walletUsd,
              missions: missions.missions.map((m) =>
                withMissionClientView(world, missions, m),
              ),
            };
          }, {
            commandSliceHoldId: body.holdId,
            companyId: fboReleaseCompanyId,
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
        send(res, 410, {
          error:
            'Company crew removed — Dispatch the hold yourself (Crew fly / split disabled)',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/fbo/return-mission') {
        const body = (await readBody(req)) as {
          missionId?: string;
          companyId?: string;
        };
        if (!body.missionId?.trim()) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const fboReturnCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const result = await withCareerWrite((world, missions) => {
            const returned = returnMissionToFboHold(
              missions,
              world,
              body.missionId!.trim(),
            );
            return {
              mission: withMissionClientView(world, missions, returned.mission),
              hold: returned.hold,
              merged: returned.merged,
              playerFbos: playerFboSnapshot(missions, world),
              fleet: withParkingRates(missions.fleet, world, missions),
              walletUsd: missions.walletUsd,
              missions: missions.missions.map((m) =>
                withMissionClientView(world, missions, m),
              ),
            };
          }, {
            commandSliceMissionId: body.missionId,
            companyId: fboReturnCompanyId,
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
        send(res, 410, {
          error:
            'Company crew removed — fly freights yourself (Base keeps parking / Jet-A / MRO perks)',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/crew/dispatch') {
        send(res, 410, {
          error:
            'Company crew removed — fly freights yourself (Base keeps parking / Jet-A / MRO perks)',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/crew/hire') {
        send(res, 410, {
          error:
            'Company crew removed — fly freights yourself (Base keeps parking / Jet-A / MRO perks)',
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/crew/fire') {
        const body = (await readBody(req)) as { memberId?: string; companyId?: string;
        };
        const crew_fireCompanyId = companyIdFromRequest(req, body.companyId);
        if (!body.memberId?.trim()) {
          send(res, 400, { error: 'memberId required' });
          return;
        }
        try {
          const result = await withCareerWrite((world, missions) => {
            const fired = fireCrewMember(missions, body.memberId!.trim());
            return {
              member: fired,
              companyCrew: companyCrewSnapshot(missions, world),
            };
          }, { persist: 'company', companyId: crew_fireCompanyId });
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
          companyId?: string;
        };
        const ground_staff_hireCompanyId = companyIdFromRequest(req, body.companyId);
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
                ...portSnapshot(world, missions, {
                  viewerCompanyId: ground_staff_hireCompanyId,
                }),
                groundStaff,
              },
            };
          }, { persist: 'company', companyId: ground_staff_hireCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/ground-staff/fire') {
        const body = (await readBody(req)) as { memberId?: string; companyId?: string;
        };
        const ground_staff_fireCompanyId = companyIdFromRequest(req, body.companyId);
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
                ...portSnapshot(world, missions, {
                  viewerCompanyId: ground_staff_fireCompanyId,
                }),
                groundStaff,
              },
            };
          }, { persist: 'company', companyId: ground_staff_fireCompanyId });
          send(res, 200, result);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'GET' && path === '/api/missions') {
        // Query companyId wins over chrome header (Logbook merge home+VA).
        const missionsCompanyId = companyIdFromRequest(
          req,
          url.searchParams.get('companyId'),
        );
        const forceVaFlight =
          Boolean(missionsCompanyId) &&
          Boolean(store) &&
          (await Promise.resolve(store!.vaIsListed(missionsCompanyId!)));
        const payload = await withCareerRead((world, missions) => ({
          ...missions,
          missions: missions.missions.map((m) =>
            withMissionClientView(world, missions, m, { forceVaFlight }),
          ),
        }), { companyId: missionsCompanyId });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/missions/open-update') {
        const body = (await readBody(req)) as {
          missionId?: string;
          companyId?: string;
          patch?: Partial<MissionIntent>;
          revertFalseDepart?: boolean;
        };
        if (!body.missionId?.trim()) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const companyId = companyIdFromRequest(req, body.companyId);
        try {
          const wrote = await updateOpenMission(
            body.missionId.trim(),
            (missions, open, idx) => {
              if (body.revertFalseDepart === true) {
                if (open.status !== 'in_flight') return false;
                const world = store?.peekEconomyWorld() ?? gatewayEconomyShell();
                missions.missions[idx] = revertFalseDepartMission(world, open);
                return true;
              }
              if (!body.patch || typeof body.patch !== 'object') return false;
              const { id: _id, ...rest } = body.patch;
              missions.missions[idx] = {
                ...open,
                ...rest,
                id: open.id,
              };
              return true;
            },
            { companyId },
          );
          if (!wrote) {
            send(res, 404, { error: `Unknown or closed mission ${body.missionId}` });
            return;
          }
          const missions = await loadMissions({ companyId });
          const mission = missions.missions.find((m) => m.id === body.missionId);
          send(res, 200, { ok: true, mission: mission ?? null });
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/tick') {
        if (worldTick.mode === 'mp-remote') {
          send(res, 403, {
            error: 'Remote world-tick client cannot advance the world',
            code: 'client_cannot_advance',
          });
          return;
        }
        const body = (await readBody(req)) as {
          n?: number;
          profile?: boolean;
          companyId?: string;
        };
        const n = Math.max(1, Math.min(TICKS_PER_DAY * 7, Math.floor(body.n ?? TICKS_PER_DAY)));
        const wantProfile = body.profile === true;
        // Same mold as market/fleet: never fall through to ambient
        // activeCompanyId (can paint/save another tenant's $0 shell).
        const tickCompanyId = companyIdFromRequest(req, body.companyId);
        const tickBefore =
          store?.peekEconomyWorld()?.tick ?? 0;
        const advanceMs = n * MS_PER_TICK;
        const tickPayload = await withCareerWrite(async (world, _missions) => {
          const profile = wantProfile
            ? createEmptyTickPhaseProfile()
            : undefined;
          const tickStartedAt = performance.now();
          await tickEconomyNCooperative(world, n, { profile });
          const tickWallMs = performance.now() - tickStartedAt;
          // World-scoped market hygiene only — company passive fees settle
          // for every tenant below (home vs VA wallets) with lastSeenTick.
          ensurePortInventoryRestock(world);
          ensurePortListings(world);
          expireDemandHolds(_missions, world);
          ensureDemandOrders(world, {
            operatorCatchmentHubs: localOperatorDemandCatchmentHubs(world),
          });
          const nowMs = Date.now();
          return {
            ...clockPayload(world, nowMs),
            availableLots: world.lots.filter((l) => l.status === 'available')
              .length,
            tickWallMs: Math.round(tickWallMs),
            ...(profile
              ? { tickProfile: summarizeTickPhaseProfile(profile) }
              : {}),
          };
        }, {
          catchUp: true,
          ...(tickCompanyId ? { companyId: tickCompanyId } : {}),
        });
        const toTick =
          typeof tickPayload.tick === 'number' && Number.isFinite(tickPayload.tick)
            ? tickPayload.tick
            : (store?.peekEconomyWorld()?.tick ?? 0);
        // +Nd is chunked (~24 ticks). Full allCompanies settle is heavy (port
        // auto-buy / WH / every tenant). Only bill every company when the
        // economy day actually crosses; same-day chunks settle the request
        // tenant lightly (watermark + crew clocks).
        const crossedEconomyDay =
          economyDayIndex(tickBefore) < economyDayIndex(toTick);
        const feeSummary = await withCareerLock(async () =>
          applyCompanySessionSettlement({
            fromTick: tickBefore,
            toTick,
            allCompanies: crossedEconomyDay,
            preferCompanyId: tickCompanyId || undefined,
            economyAdvanceMs: advanceMs,
          }),
        );
        const responseCompanyId =
          tickCompanyId ||
          store?.getActiveCompanyId?.() ||
          undefined;
        const missions = await loadMissions(
          responseCompanyId ? { companyId: responseCompanyId } : undefined,
        );
        const world = store?.peekEconomyWorld();
        if (!world) {
          send(res, 500, { error: 'World missing after tick' });
          return;
        }
        send(res, 200, {
          ...tickPayload,
          leasePaidUsd: 0,
          leaseRepossessed: feeSummary?.lease?.repossessedIds ?? [],
          leaseOutEarnedUsd: 0,
          hangarDebitUsd: feeSummary?.debitUsdByKind?.hangar ?? 0,
          hangarRequestedUsd: feeSummary?.debitUsdByKind?.hangar ?? 0,
          hangarShortfallUsd: 0,
          hangarDaysCharged: feeSummary?.daysBilled ?? 0,
          fboStorageDebitUsd: feeSummary?.debitUsdByKind?.fboStorage ?? 0,
          fboHoldsExpired: 0,
          fboExpirePenaltyUsd: 0,
          crewSalaryDebitUsd: feeSummary?.debitUsdByKind?.crewSalary ?? 0,
          groundStaffSalaryDebitUsd:
            feeSummary?.debitUsdByKind?.groundStaffSalary ?? 0,
          crewSettled: 0,
          creditInterestPaidUsd: 0,
          creditInterestCompoundedUsd: 0,
          creditOverdueDays: missions.companyCredit?.overdueDays ?? 0,
          creditPrincipalUsd: missions.companyCredit?.principalUsd ?? 0,
          companyCredit: companyCreditSnapshot(missions),
          playerFbos: playerFboSnapshot(missions, world),
          companyCrew: companyCrewSnapshot(missions, world),
          walletUsd: missions.walletUsd,
        });
        return;
      }

      // Dev-only test aid.
      if (req.method === 'POST' && path === '/api/debug/credit-wallet') {
        if (!requestDevMode(req)) {
          send(res, 403, { error: 'Dev Mode is required' });
          return;
        }
        const body = (await readBody(req)) as {
          amountUsd?: number;
          companyId?: string;
        };
        const amountUsd =
          typeof body.amountUsd === 'number' && Number.isFinite(body.amountUsd)
            ? Math.round(body.amountUsd * 100) / 100
            : 5_000;
        if (amountUsd === 0) {
          send(res, 400, { error: 'amountUsd must be non-zero' });
          return;
        }
        const creditCompanyId = companyIdFromRequest(req, body.companyId);
        const payload = await withCareerWrite((world, missions) => {
          applyWalletDelta(missions, {
            amountUsd,
            kind: 'other',
            atTick: world.tick,
            note: 'Debug wallet credit',
          });
          return { walletUsd: missions.walletUsd, creditedUsd: amountUsd };
        }, { persist: 'company', companyId: creditCompanyId });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/debug/port-catalog') {
        if (!requestDevMode(req)) {
          send(res, 403, { error: 'Dev Mode is required' });
          return;
        }
        send(res, 200, {
          ports: listCareerPorts().map((p) => ({
            id: p.id,
            name: p.name,
            countryId: p.countryId,
          })),
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/debug/claim-port') {
        if (!requestDevMode(req)) {
          send(res, 403, { error: 'Dev Mode is required' });
          return;
        }
        const body = (await readBody(req)) as {
          portId?: string;
          companyId?: string;
        };
        const portId = (body.portId ?? '').trim().toUpperCase();
        if (!portId || !getCareerPort(portId)) {
          send(res, 400, { error: 'Unknown portId — pick one from CAREER_PORTS' });
          return;
        }
        const claimCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const payload = await withCareerWrite(
            (world, missions) => {
              const concession = debugForceClaimPortConcession(missions, world, {
                portId,
                companyId: claimCompanyId,
              });
              return {
                walletUsd: missions.walletUsd,
                concession,
                ports: portSnapshot(world, missions, {
                  viewerCompanyId: claimCompanyId,
                }),
              };
            },
            {
              persist: 'company',
              persistPortConcessions: true,
              companyId: claimCompanyId,
            },
          );
          send(res, 200, payload);
        } catch (error) {
          send(res, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/debug/unlock-class-ops') {
        if (!requestDevMode(req)) {
          send(res, 403, { error: 'Dev Mode is required' });
          return;
        }
        const unlockCompanyId = companyIdFromRequest(req);
        const payload = await withCareerWrite(
          (_world, missions) => {
            missions.classOps = unlockAllCareerClassOps(missions.classOps);
            return { classOps: missions.classOps };
          },
          { persist: 'company', companyId: unlockCompanyId },
        );
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/debug/economy-pulse') {
        const payload = await withCareerRead((world) => computeEconomyPulse(world));
        send(res, 200, payload);
        return;
      }

      if (req.method === 'GET' && path === '/api/debug/hub-economy-history') {
        const q = url.searchParams;
        const daysRaw = Number.parseInt(q.get('days') ?? '7', 10);
        const days = daysRaw === 90 ? 90 : daysRaw === 30 ? 30 : 7;
        const payload = await withCareerRead(async (world) => {
          const active = requireStore();
          const today = economyDayIndex(world.tick);
          const sinceDay = Math.max(0, today - days + 1);
          const samples = await Promise.resolve(
            active.readHubEconomySamplesSince({ sinceDay }),
          );
          return {
            ...clockPayload(world, Date.now()),
            windowDays: days,
            ...aggregateHubEconomyHistoryPulse(samples, {
              retentionDays: HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
              focusCountries: [...DEFAULT_HUB_ECONOMY_HISTORY_FOCUS],
            }),
          };
        });
        send(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && path === '/api/accept') {
        const body = (await readBody(req)) as {
          lotId?: string;
          kg?: number;
          aircraft?: string;
          missionId?: string;
          companyId?: string;
        };
        if (!body.lotId) {
          send(res, 400, { error: 'lotId required' });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        const aircraft =
          (parseFreighterClassId(body.aircraft) as FreighterClassId | undefined) ??
          'narrow_freighter';
        const cargoLimit = await resolveClassMaxCargoKg(aircraft);
        let acceptCompanyId = LOCAL_COMPANY_ID;
        try {
          acceptCompanyId = await activateCompanyContext(
            companyIdFromRequest(req, body.companyId),
            authSessionFromRequest(req)?.account.id,
          );
        } catch (err) {
          send(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        try {
          const acceptDisplayName =
            (await resolveCompanyDisplayName(
              requireStore(),
              acceptCompanyId,
            )) ?? acceptCompanyId;
          const pilotStamp = await vaPilotMissionStamp(req, acceptCompanyId);
          const progPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: acceptCompanyId });
          const progression = await resolvePilotProgressionOps(
            req,
            acceptCompanyId,
            progPeek,
          );
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

            const executed = executeAcceptLot(world, missions, {
              lotId: body.lotId!,
              cargoKg: body.kg,
              aircraftClassId: aircraft,
              maxCargoKg: cargoLimit.maxCargoKg,
              intoMissionId: intoMission?.id,
              cargoOps: progression.cargoOps,
              classOps: progression.classOps,
              companyId: acceptCompanyId,
              ...pilotStamp,
            });
            if (executed.kind === 'missing_lot') {
              return { kind: 'missing_lot' as const };
            }
            if (executed.kind === 'missing_mission') {
              return { kind: 'missing_mission' as const };
            }
            if (executed.kind === 'conflict') {
              return {
                kind: 'conflict' as const,
                claimedByCompanyId: executed.claimedByCompanyId,
              };
            }
            recordPresence(world, {
              kind: 'lot_accept',
              companyId: acceptCompanyId,
              companyDisplayName: acceptDisplayName,
              summary: `${executed.mission.originIcao}→${executed.mission.destIcao}`,
            });
            return {
              kind: 'ok' as const,
              mission: executed.mission,
              walletUsd: missions.walletUsd,
              appended: executed.appended,
              companyId: acceptCompanyId,
            };
          }, {
            commandSliceLotIds: [body.lotId],
            housekeeping: false,
            companyId: acceptCompanyId,
          });
          if (result.kind === 'missing_lot') {
            send(res, 404, { error: `Unknown lot ${body.lotId}` });
            return;
          }
          if (result.kind === 'missing_mission') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          if (result.kind === 'conflict') {
            const claimedByCompanyDisplayName =
              await resolveCompanyDisplayName(
                requireStore(),
                result.claimedByCompanyId,
              );
            send(res, 409, {
              error: claimedByCompanyDisplayName
                ? `Lot claimed by ${claimedByCompanyDisplayName}`
                : 'Lot claimed by another company',
              code: 'lot_claimed',
              claimedByCompanyId: result.claimedByCompanyId,
              claimedByCompanyDisplayName,
            });
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
            mission: await toClientMission(result.mission),
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
        const cpOptionsCompanyId = companyIdFromRequest(req);
        try {
          const cpProgPeek = await withCareerRead((_w, missions) => ({
            cargoOps: missions.cargoOps,
            classOps: missions.classOps,
          }), { companyId: cpOptionsCompanyId });
          const cpProgression = await resolvePilotProgressionOps(
            req,
            cpOptionsCompanyId,
            cpProgPeek,
          );
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
                cpProgression.classOps,
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
                  quoteContractPilotFeeUsd(flight.payUsd, {
                    distanceNm,
                    aircraftClassId: flight.aircraftClassId,
                  }),
                awaitingPilotUntilMs: flight.awaitingPilotUntilMs,
              },
              airframes,
            };
          }, { companyId: cpOptionsCompanyId });
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
          companyId?: string;
        };
        if (!body.lotId && !body.npcFlightId) {
          send(res, 400, { error: 'lotId or npcFlightId required' });
          return;
        }
        if (!body.airframeTypeId?.trim()) {
          send(res, 400, { error: 'airframeTypeId required' });
          return;
        }
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        const cpAcceptCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          const cpPilotStamp = await vaPilotMissionStamp(req, cpAcceptCompanyId);
          const accepted = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            const result = acceptContractPilotOffer(world, missions, {
              lotId: body.lotId,
              npcFlightId: body.npcFlightId,
              airframeTypeId: body.airframeTypeId!,
              nowMs: Date.now(),
              pilotAccountId: cpPilotStamp.pilotAccountId,
            });
            if (cpPilotStamp.pilotAccountId || cpPilotStamp.pilotHomeCompanyId) {
              const idx = missions.missions.findIndex(
                (m) => m.id === result.mission.id,
              );
              if (idx >= 0) {
                missions.missions[idx] = {
                  ...missions.missions[idx]!,
                  ...cpPilotStamp,
                };
                return {
                  ...result,
                  mission: missions.missions[idx]!,
                  walletUsd: missions.walletUsd,
                };
              }
            }
            return {
              ...result,
              walletUsd: missions.walletUsd,
            };
          }, { persist: 'npcLive', companyId: cpAcceptCompanyId });
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
                (await withCareerRead(
                  (world) =>
                    routeDistanceNm(
                      world,
                      mission.originIcao,
                      mission.destIcao,
                    ),
                  { companyId: cpAcceptCompanyId },
                )) ??
                mission.distanceNm ??
                0;
              const { built, flyable } = await buildFlyableMissionDispatch(
                mission,
                distanceNm,
                {
                  liveTitle: getLastProbeAircraftTitle(),
                  registration: await withCareerPeekRead((_w, missions) => {
                    if (!mission.aircraftId) return undefined;
                    return (
                      normalizeAircraftRegistration(
                        findPlayerAircraft(missions, mission.aircraftId)
                          ?.registration,
                      ) ?? undefined
                    );
                  }, { companyId: cpAcceptCompanyId }),
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
                    missions,
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
              }, {
                commandSliceMissionId: mission.id,
                companyId: cpAcceptCompanyId,
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
        const stagingDiag: CareerWriteDiag = {
          startedAt: performance.now(),
          lockWaitMs: 0,
          inLockMs: 0,
          failed: false,
        };
        await careerWriteDiag.run(stagingDiag, async () => {
        try {
        const body = (await readBody(req)) as {
          aircraft?: string;
          aircraftId?: string;
          missionId?: string;
          openDispatch?: boolean;
          replace?: boolean;
          weightSystem?: 'metric' | 'imperial';
          units?: 'KGS' | 'LBS';
          companyId?: string;
          lines?: Array<{ lotId?: string; cargoKg?: number }>;
        };
        const updatePolicy = await resolveClientUpdatePolicy(store);
        if (
          rejectIfClientUpdateRequired(
            res,
            updatePolicy,
            clientVersionFromRequest(req),
          )
        ) {
          return;
        }
        const stagingCompanyId = companyIdFromRequest(req, body.companyId);
        const stagingActor = await resolveVaFleetActor(req, stagingCompanyId);
        const stagingPilotStamp = await vaPilotMissionStamp(
          req,
          stagingCompanyId,
        );
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
        const peek = await withCareerPeekRead((world, missions) => {
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
        }, { companyId: stagingCompanyId });
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
        const stagingProgPeek = await withCareerPeekRead((_w, missions) => ({
          cargoOps: missions.cargoOps,
          classOps: missions.classOps,
        }), { companyId: stagingCompanyId });
        const stagingProgression = await resolvePilotProgressionOps(
          req,
          stagingCompanyId,
          stagingProgPeek,
        );
        try {
          const committed = await withCareerWrite((world, missions) => {
            assertCompanyCreditAllowsOps(missions);
            reconcileLotReservations(world, missions);
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
                ...stagingPilotStamp,
              };
              const idx = missions.missions.findIndex((m) => m.id === mission.id);
              if (idx >= 0) missions.missions[idx] = mission;
              else missions.missions.push(mission);
              return {
                kind: 'ok' as const,
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
                    kind: 'ok' as const,
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
            const activeMissions = listActivePlayerMissionsForPilot(
              missions.missions,
              stagingPilotStamp.pilotAccountId,
            );
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
                  cargoOps: stagingProgression.cargoOps,
                  classOps: stagingProgression.classOps,
                }),
                aircraftId: playerAircraft.id,
                airframeTypeId: playerAirframe?.typeId,
                rolesPackRelPath:
                  playerAirframe?.rolesPackRelPath ??
                  intoMission.rolesPackRelPath,
                ...stagingPilotStamp,
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
              const staged = executeAcceptManifest(world, missions, {
                lines,
                aircraftClassId: aircraft,
                maxCargoKg: operationalMaxCargoKg,
                intoMissionId: intoMission?.id,
                airframeTypeId: playerAirframe?.typeId,
                cargoOps: stagingProgression.cargoOps,
                classOps: stagingProgression.classOps,
                companyId: stagingCompanyId,
                ...stagingPilotStamp,
              });
              if (staged.kind === 'missing_mission') {
                throw new Error('Unknown mission for staged accept');
              }
              if (staged.kind === 'conflict') {
                return {
                  kind: 'conflict' as const,
                  claimedByCompanyId: staged.claimedByCompanyId,
                };
              }
              mission = {
                ...staged.mission,
                aircraftId: playerAircraft.id,
                airframeTypeId: playerAirframe?.typeId,
                rolesPackRelPath:
                  playerAirframe?.rolesPackRelPath ??
                  staged.mission.rolesPackRelPath,
                ...stagingPilotStamp,
              };
              appended = staged.kind === 'applied' ? staged.appended : false;
              lineCount = staged.lineCount;
              const idx = missions.missions.findIndex((m) => m.id === mission.id);
              if (idx >= 0) missions.missions[idx] = mission;
              else missions.missions.push(mission);
              if (staged.kind === 'applied' && !staged.appended) {
                assignAircraftToMission(
                  missions,
                  playerAircraft.id,
                  mission.id,
                  mission.originIcao,
                  {
                    actorAccountId: stagingActor.accountId,
                    actorIsVaOwner: stagingActor.isOwner,
                  },
                );
              }
            }
            return {
              kind: 'ok' as const,
              mission,
              appended,
              lineCount,
              operationalMaxCargoKg,
              estimatedBlockFuelKg: routeCargoLimit.estimatedBlockFuelKg,
              walletUsd: missions.walletUsd,
              fleet: withParkingRates(missions.fleet),
            };
          }, {
            commandSliceLotIds: lines.map((line) => line.lotId),
            housekeeping: false,
            companyId: stagingCompanyId,
          });
          if (committed.kind === 'conflict') {
            const claimedByCompanyDisplayName =
              await resolveCompanyDisplayName(
                requireStore(),
                committed.claimedByCompanyId,
              );
            send(res, 409, {
              error: claimedByCompanyDisplayName
                ? `Lot claimed by ${claimedByCompanyDisplayName}`
                : `Lot claimed by ${committed.claimedByCompanyId}`,
              code: 'lot_claimed',
              claimedByCompanyId: committed.claimedByCompanyId,
              claimedByCompanyDisplayName,
            });
            return;
          }

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
                  registration: await withCareerPeekRead((_w, missions) => {
                    if (!mission.aircraftId) return undefined;
                    return (
                      normalizeAircraftRegistration(
                        findPlayerAircraft(missions, mission.aircraftId)
                          ?.registration,
                      ) ?? undefined
                    );
                  }),
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
                    missions,
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
              }, { commandSliceMissionId: mission.id });
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
          stagingDiag.failed = true;
          const message = error instanceof Error ? error.message : String(error);
          const notFound =
            /^Unknown (lot|mission|aircraft) /.test(message) ||
            message.startsWith('Unknown lot') ||
            message.startsWith('Unknown mission') ||
            message.startsWith('Unknown aircraft');
          send(res, notFound ? 404 : 400, { error: message });
        }
        } catch (error) {
          stagingDiag.failed = true;
          throw error;
        } finally {
          logCareerWriteDiag('staging/commit', stagingDiag);
        }
        });
        return;
      }

      if (
        path === '/api/bush-trips' ||
        path.startsWith('/api/bush-trips/') ||
        path === '/api/bush-watch/status' ||
        path === '/api/bush-watch/start' ||
        path === '/api/bush-watch/stop'
      ) {
        send(res, 410, { error: 'bush trips removed' });
        return;
      }

      if (req.method === 'POST' && path === '/api/cancel') {
        const body = (await readBody(req)) as {
          missionId?: string;
          companyId?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const cancelCompanyId = companyIdFromRequest(req, body.companyId);
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
            const existing = missions.missions.find((m) => m.id === body.missionId);
            if (!existing) return { kind: 'missing' as const };
            const charter = existing.missionType === 'charter';
            const lines = charter
              ? []
              : existing.lots?.length
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
            const executed = executeCancelMission(world, missions, {
              missionId: body.missionId!,
            });
            // Free orphan reserved kg left behind by older cancel paths / partial accepts.
            if (!charter) reconcileLotReservations(world, missions);
            if (executed.kind === 'missing') return { kind: 'missing' as const };
            if (executed.kind === 'closed') return { kind: 'closed' as const };
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
            const releasedKg =
              executed.kind === 'applied'
                ? Math.max(0, reservedBefore - reservedAfter)
                : 0;
            const charterOffer = charter
              ? (world.charterOffers ?? []).find(
                  (offer) => offer.id === existing.charterOfferId,
                )
              : undefined;
            const returnedToMarket = charter
              ? charterOffer?.status === 'available'
              : releasedKg > 0 && anyReturned;
            // Haul/Bridge/Demand never touch world.lots — cancel deposits kg
            // back to the origin warehouse (hold was already consumed on Accept).
            const returnedToWarehouse = Boolean(
              !charter &&
                (existing.warehouseHaul ||
                  existing.warehouseBridge ||
                  existing.demandOrderId) &&
                (existing.cargoKg ?? 0) > 0,
            );
            const noBoardLot =
              charter ||
              returnedToWarehouse ||
              Boolean(existing.portPickupId) ||
              Boolean(existing.emptyFlight) ||
              Boolean(existing.crewDeadhead);
            syncActiveTour(missions, world);
            syncCharterActiveTour(missions, world);
            return {
              kind: 'ok' as const,
              cancelled: executed.mission,
              walletUsd: missions.walletUsd,
              releasedKg,
              returnedToMarket,
              returnedToWarehouse,
              foundBefore: charter ? 1 : foundBefore,
              noBoardLot,
              charter,
              activeTour: activeTourView(missions, world),
              charterActiveTour: charterActiveTourView(missions, world),
            };
          }, {
            commandSliceMissionId: body.missionId,
            housekeeping: false,
            companyId: cancelCompanyId,
          });
          if (result.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          if (result.kind === 'closed') {
            send(res, 409, { error: `Mission ${body.missionId} is already closed` });
            return;
          }
          send(res, 200, {
            mission: await toClientMission(result.cancelled),
            walletUsd: result.walletUsd,
            releasedKg: result.releasedKg,
            returnedToMarket: result.returnedToMarket,
            returnedToWarehouse: result.returnedToWarehouse ?? false,
            activeTour: result.activeTour ?? null,
            charterActiveTour: result.charterActiveTour ?? null,
            warning:
              result.charter || result.noBoardLot
                ? null
                : result.foundBefore > 0
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
          /** UI SimBridge title — preferred over last probe for family ICAO. */
          liveTitle?: string | null;
          companyId?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const dispatchCompanyId = companyIdFromRequest(req, body.companyId);
        // Peek — do not queue behind the world pulse for a read-only prep.
        const prep = await withCareerPeekRead((world, missions) => {
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
          const registration =
            mission.aircraftId != null
              ? normalizeAircraftRegistration(
                  findPlayerAircraft(missions, mission.aircraftId)?.registration,
                ) ?? undefined
              : undefined;
          return {
            kind: 'ok' as const,
            mission,
            dispatchDistanceNm,
            aircraftClassId: mission.aircraftClassId,
            registration,
          };
        }, { companyId: dispatchCompanyId });
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
          const liveTitle =
            body.liveTitle?.trim() || getLastProbeAircraftTitle();
          const { built, flyable, cargoLimit } = await buildFlyableMissionDispatch(
            prep.mission,
            prep.dispatchDistanceNm,
            {
              units: body.units ?? body.weightSystem,
              liveTitle,
              registration: prep.registration,
            },
          );
          const needsCargoTrim = flyable.cargoKg < prep.mission.cargoKg;
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
              next = trimMissionCargoToKg(
                world,
                open,
                flyable.cargoKg,
                missions,
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
            missions.missions[idx] = dispatched;
            return dispatched;
          }, {
            // Open SimBrief usually only flips accepted→dispatched + staticId.
            // That is company-only — do not touch economy_meta CAS / command slice
            // (pulse off-lock save bumps revision continuously now).
            ...(needsCargoTrim
              ? { commandSliceMissionId: body.missionId }
              : { persist: 'company' as const }),
            companyId: dispatchCompanyId,
          });

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
          companyId?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const ofpCompanyId = companyIdFromRequest(req, body.companyId);
        const probe = await loadMissions({ companyId: ofpCompanyId });
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
            ...(typeof result.ofp.passengerCount === 'number'
              ? { passengerCount: result.ofp.passengerCount }
              : {}),
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
          const wrote = await updateOpenMission(
            body.missionId,
            (_missions, mission) => {
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
          },
            { companyId: ofpCompanyId },
          );
          if (!wrote || !savedMission) {
            const latest = await loadMissions({ companyId: ofpCompanyId });
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
          companyId?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const ofpCargoCompanyId = companyIdFromRequest(req, body.companyId);
        const probe = await loadMissions({ companyId: ofpCargoCompanyId });
        const probeMission = probe.missions.find((m) => m.id === body.missionId);
        if (!probeMission) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        if (probeMission.missionType === 'charter') {
          send(res, 400, {
            error:
              'Charter passenger and baggage manifests are fixed; OFP cargo cannot be accepted',
          });
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
            const trimmed = trimMissionCargoToKg(
              world,
              mission,
              ofpCargoKg,
              missions,
            );
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
          }, {
            commandSliceMissionId: body.missionId,
            companyId: ofpCargoCompanyId,
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
            ...(typeof after.ofp.passengerCount === 'number'
              ? { passengerCount: after.ofp.passengerCount }
              : {}),
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
          const wrote = await updateOpenMission(
            body.missionId,
            (_missions, mission) => {
            if (
              mission.status !== 'accepted' &&
              mission.status !== 'dispatched'
            ) {
              return false;
            }
            applyConfirmedOfpCheck(mission, ofpCheck);
            savedMission = mission;
            return true;
          },
            { companyId: ofpCargoCompanyId },
          );
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
        const body = (await readBody(req)) as {
          missionId?: string;
          companyId?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const fuelCompanyId = companyIdFromRequest(req, body.companyId);
        try {
          if (path === '/api/fuel/quote') {
            // Peek — quote must not sit behind the world pulse (~15s).
            const quoted = await withCareerPeekRead((world, missions) => {
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
            }, { companyId: fuelCompanyId });
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
          }, {
            commandSliceMissionId: body.missionId,
            companyId: fuelCompanyId,
          });
          if (purchased.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          send(res, 200, {
            mission: await toClientMission(purchased.mission),
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
          companyId?: string;
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
        const preflightCompanyId = companyIdFromRequest(req, body.companyId);
        const probe = await loadMissions({ companyId: preflightCompanyId });
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
          const originCoords = await withCareerPeekRead((world) => {
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
          const wrote = await updateOpenMission(
            body.missionId,
            (_missions, mission) => {
            if (!['accepted', 'dispatched', 'in_flight'].includes(mission.status)) {
              return false;
            }
            mission.lastPreflightCheck = lastPreflightCheck;
            savedMission = mission;
            return true;
          },
            { companyId: preflightCompanyId },
          );
          if (!wrote || !savedMission) {
            const latest = await loadMissions({ companyId: preflightCompanyId });
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
          sendRouteError(res, error, unavailable ? 503 : 400);
        }
        return;
      }

      if (req.method === 'POST' && path === '/api/depart') {
        const body = (await readBody(req)) as {
          missionId?: string;
          override?: boolean;
          companyId?: string;
          nowMs?: number;
          distanceNm?: number;
          expectedRouteMs?: number;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const departCompanyId = companyIdFromRequest(req, body.companyId);
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
            const departedResult = executeDepartFlight(world, missions, {
              missionId: body.missionId!,
              ...(typeof body.nowMs === 'number' ? { nowMs: body.nowMs } : {}),
              ...(typeof body.distanceNm === 'number'
                ? { distanceNm: body.distanceNm }
                : {}),
              ...(typeof body.expectedRouteMs === 'number'
                ? { expectedRouteMs: body.expectedRouteMs }
                : {}),
            });
            if (departedResult.kind === 'missing') {
              return { kind: 'missing' as const };
            }
            if (departedResult.kind === 'closed') {
              return { kind: 'closed' as const };
            }
            return {
              kind: 'ok' as const,
              mission: departedResult.result.mission,
              walletUsd: missions.walletUsd,
              fuelDebitUsd: departedResult.result.fuelDebitUsd,
              fleet: withParkingRates(missions.fleet),
            };
          }, {
            commandSliceMissionId: body.missionId,
            housekeeping: false,
            companyId: departCompanyId,
          });
          if (result.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          if (result.kind === 'closed') {
            send(res, 409, { error: `Mission ${body.missionId} is already closed` });
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
            mission: await toClientMission(result.mission),
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
        const body = (await readBody(req)) as {
          missionId?: string;
          companyId?: string;
          residualFuelKg?: number;
          landingFpm?: number;
          airborneEndedAtMs?: number;
          airborneElapsedMs?: number;
          flightScore?: unknown;
          weatherOps?: unknown;
          mxFuelDrainUnsettledKg?: number;
          mxFuelDrainTotalKg?: number;
          touchdownLat?: number;
          touchdownLon?: number;
          touchdownHeadingTrueDeg?: number;
          nowMs?: number;
          cruiseCommit?: unknown;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const settleCompanyId = companyIdFromRequest(req, body.companyId);
        const exists = await withCareerRead(
          (_world, missions) =>
            missions.missions.some((m) => m.id === body.missionId),
          { companyId: settleCompanyId },
        );
        if (!exists) {
          send(res, 404, { error: `Unknown mission ${body.missionId}` });
          return;
        }
        try {
          let residualFuelKg =
            typeof body.residualFuelKg === 'number' &&
            Number.isFinite(body.residualFuelKg)
              ? body.residualFuelKg
              : undefined;
          if (residualFuelKg === undefined) {
            try {
              residualFuelKg = await probeLiveResidualFuelKg();
            } catch {
              residualFuelKg = undefined;
            }
          }
          // Prefer body (gateway Watch) → local Watch → sim probe.
          let landingFpm =
            typeof body.landingFpm === 'number' && Number.isFinite(body.landingFpm)
              ? body.landingFpm
              : watchSession.getStatus().missionId === body.missionId
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
            typeof body.airborneEndedAtMs === 'number' &&
            Number.isFinite(body.airborneEndedAtMs)
              ? body.airborneEndedAtMs
              : watchSession.getStatus().missionId === body.missionId
                ? watchSession.getCapturedAirborneEndedAtMs()
                : undefined;
          const flightScore =
            body.flightScore != null
              ? body.flightScore
              : watchSession.getStatus().missionId === body.missionId
                ? watchSession.finalizeFlightScoreForSettle(landingFpm)
                : undefined;
          const weatherOps =
            body.weatherOps != null
              ? body.weatherOps
              : watchSession.getStatus().missionId === body.missionId
                ? watchSession.getCapturedWeatherOps() ?? undefined
                : undefined;
          const mxFuelDrain =
            typeof body.mxFuelDrainUnsettledKg === 'number' ||
            typeof body.mxFuelDrainTotalKg === 'number'
              ? {
                  unsettledKg: Number(body.mxFuelDrainUnsettledKg) || 0,
                  totalKg: Number(body.mxFuelDrainTotalKg) || 0,
                }
              : watchSession.getStatus().missionId === body.missionId
                ? watchSession.getCapturedMxFuelDrain()
                : { unsettledKg: 0, totalKg: 0 };
          let touchdownLat: number | undefined =
            typeof body.touchdownLat === 'number' ? body.touchdownLat : undefined;
          let touchdownLon: number | undefined =
            typeof body.touchdownLon === 'number' ? body.touchdownLon : undefined;
          let touchdownHeadingTrueDeg: number | undefined =
            typeof body.touchdownHeadingTrueDeg === 'number'
              ? body.touchdownHeadingTrueDeg
              : undefined;
          if (
            (touchdownLat === undefined || touchdownLon === undefined) &&
            watchSession.getStatus().missionId === body.missionId
          ) {
            const captured = watchSession.getCapturedTouchdownPosition();
            if (captured) {
              touchdownLat = captured.lat;
              touchdownLon = captured.lon;
              touchdownHeadingTrueDeg ??= captured.headingTrueDeg;
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
          const memberRouteCutPct =
            settleCompanyId && store
              ? await Promise.resolve(
                  store.vaGetMemberRouteCutPct(settleCompanyId),
                )
              : undefined;
          const memberAirlineCutPct =
            settleCompanyId && store
              ? await Promise.resolve(
                  store.vaGetMemberAirlineCutPct(settleCompanyId),
                )
              : undefined;
          // Peek mission for pilot home before write (cross-company XP).
          const settlePeek = await withCareerRead((_world, missions) => {
            const m = missions.missions.find((row) => row.id === body.missionId);
            return m
              ? {
                  pilotHomeCompanyId: m.pilotHomeCompanyId?.trim() || '',
                  cargoOps: missions.cargoOps,
                  classOps: missions.classOps,
                }
              : null;
          }, { companyId: settleCompanyId });
          let progressionBag:
            | {
                cargoOps: CareerMissionsState['cargoOps'];
                classOps: CareerMissionsState['classOps'];
              }
            | undefined;
          const pilotHomeForXp = settlePeek?.pilotHomeCompanyId || '';
          if (
            settlePeek &&
            pilotHomeForXp &&
            settleCompanyId &&
            pilotHomeForXp !== settleCompanyId
          ) {
            const homeOps = await withCareerRead((_w, missions) => ({
              cargoOps: missions.cargoOps,
              classOps: missions.classOps,
            }), { companyId: pilotHomeForXp });
            progressionBag = {
              cargoOps: homeOps.cargoOps,
              classOps: homeOps.classOps,
            };
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
              companyId: settleCompanyId,
              memberRouteCutPct,
              memberAirlineCutPct,
              residualFuelKg,
              mxFuelDrainUnsettledKg: mxFuelDrain.unsettledKg,
              mxFuelDrainTotalKg: mxFuelDrain.totalKg,
              landingFpm,
              airborneEndedAtMs,
              airborneElapsedMs:
                typeof body.airborneElapsedMs === 'number'
                  ? body.airborneElapsedMs
                  : undefined,
              flightScore: flightScore as never,
              weatherOps: weatherOps as never,
              touchdownLat,
              touchdownLon,
              touchdownHeadingTrueDeg,
              runwayTouch,
              nowMs:
                typeof body.nowMs === 'number' && Number.isFinite(body.nowMs)
                  ? body.nowMs
                  : Date.now(),
              ...(progressionBag ? { progression: progressionBag } : {}),
            });
            if (executed.kind === 'missing') return { kind: 'missing' as const };
            if (executed.kind === 'closed') return { kind: 'closed' as const };
            const result = executed.result;
            const cruiseCommit = parseCruiseSampleCommit(body.cruiseCommit);
            if (cruiseCommit) {
              applyCruiseSampleOverride(
                missions,
                openMission.airframeTypeId,
                cruiseCommit,
                {
                  catalogCruiseFuelFlowKgPerHour: findCareerPlayerAirframe(
                    openMission.airframeTypeId,
                  )?.cruiseFuelFlowKgPerHour,
                },
              );
            }
            syncActiveTour(missions, world);
            syncCharterActiveTour(missions, world);
            return {
              kind: 'ok' as const,
              mission: result.mission,
              walletUsd: missions.walletUsd,
              fuelDebitUsd: result.fuelDebitUsd,
              fleet: withParkingRates(missions.fleet),
              pilotIcao: missions.pilotIcao ?? missions.homeHubIcao ?? '',
              settlement: result.settlement,
              cargoOpsDeltas: result.cargoOpsDeltas ?? [],
              classOpsDeltas: result.classOpsDeltas ?? [],
              activeTour: activeTourView(missions, world),
              charterActiveTour: charterActiveTourView(missions, world),
              pilotPayCredit:
                executed.kind === 'applied'
                  ? executed.pilotPayCredit
                  : undefined,
              settleTick: world.tick,
              progressionHomeCompanyId: progressionBag
                ? pilotHomeForXp
                : undefined,
            };
          }, {
            housekeeping: false,
            catchUp: false,
            commandSliceMissionId: body.missionId,
            companyId: settleCompanyId,
          });
          if (settled.kind === 'missing') {
            send(res, 404, { error: `Unknown mission ${body.missionId}` });
            return;
          }
          if (settled.kind === 'closed') {
            send(res, 409, { error: `Mission ${body.missionId} is already closed` });
            return;
          }
          // Dual-tenant: aircraft lives on VA ops; chrome pilot = home company.
          // relocateAircraftOnSettle only moved VA.pilotIcao — write home too.
          const homePilotSyncId =
            pilotHomeForXp &&
            settleCompanyId &&
            pilotHomeForXp !== settleCompanyId &&
            settled.mission.crewOperated !== true
              ? pilotHomeForXp
              : '';
          const homeProgWrite =
            progressionBag &&
            settled.progressionHomeCompanyId &&
            (settled.cargoOpsDeltas.length > 0 ||
              settled.classOpsDeltas.length > 0)
              ? settled.progressionHomeCompanyId
              : '';
          const careerCompanyId =
            pilotHomeForXp &&
            settleCompanyId &&
            pilotHomeForXp !== settleCompanyId
              ? pilotHomeForXp
              : settleCompanyId ?? '';
          const homeWriteId = homePilotSyncId || homeProgWrite || careerCompanyId;
          let lastSettleOutcome:
            | ReturnType<typeof applyPilotCareerSettle>
            | undefined;
          let showClassOpsDebrief = false;
          if (homeWriteId) {
            const destIcao = (settled.mission.destIcao ?? '').trim().toUpperCase();
            const nextCargo = progressionBag?.cargoOps;
            const nextClass = progressionBag?.classOps;
            const pilotPayUsd = settled.pilotPayCredit?.amountUsd ?? null;
            const scorePct = settled.mission.settledFlightScore?.pct;
            const careerWrite = await withCareerWrite(
              (world, missions) => {
                if (homePilotSyncId && destIcao) {
                  syncPilotIcaoTo(missions, destIcao);
                }
                if (homeProgWrite && nextCargo && nextClass) {
                  missions.cargoOps = nextCargo;
                  missions.classOps = nextClass;
                }
                const leaseCleanAfter = dryCleanSettlesOk(missions.cargoOps);
                const outcome = applyPilotCareerSettle(missions, {
                  atTick: settled.settleTick,
                  mission: settled.mission,
                  flightDurationMs: settled.mission.settledFlightDurationMs,
                  blockHoursFallback: estimateMissionBlockHours(
                    world,
                    settled.mission.originIcao,
                    settled.mission.destIcao,
                    settled.mission.aircraftClassId,
                  ),
                  cargoOpsDeltas: settled.cargoOpsDeltas,
                  classOpsDeltas: settled.classOpsDeltas,
                  flightScorePct:
                    typeof scorePct === 'number' ? scorePct : null,
                  onTime: settled.settlement.onTime,
                  pilotPayUsd,
                  leaseCleanAfter,
                  leaseCleanRequired: LEASE_UNLOCK_CLEAN_DRY_SETTLES,
                });
                const classDeltas = settled.classOpsDeltas ?? [];
                const showClass =
                  classDeltas.length > 0 &&
                  (!classOpsLadderComplete(missions.classOps) ||
                    classDeltas.some((d) => d.unlockedNow));
                return {
                  ok: true as const,
                  pilotIcao: missions.pilotIcao ?? missions.homeHubIcao ?? '',
                  outcome,
                  showClassOpsDebrief: showClass,
                };
              },
              {
                persist: 'company',
                companyId: homeWriteId,
                housekeeping: false,
                catchUp: false,
              },
            );
            lastSettleOutcome = careerWrite.outcome;
            showClassOpsDebrief = careerWrite.showClassOpsDebrief;
            if (homePilotSyncId && destIcao) {
              settled.pilotIcao = destIcao;
            }
          }
          if (settled.pilotPayCredit && settled.pilotPayCredit.amountUsd > 0) {
            const credit = settled.pilotPayCredit;
            const creditKind =
              settled.mission.warehouseBridge === true &&
              settled.mission.internalHaul === true
                ? 'internal_haul_pay'
                : 'va_member_cut';
            await withCareerWrite(
              (_world, missions) => {
                applyWalletDelta(missions, {
                  amountUsd: credit.amountUsd,
                  kind: creditKind,
                  atTick: settled.settleTick,
                  missionId: credit.missionId,
                  icao: credit.destIcao,
                  note:
                    creditKind === 'internal_haul_pay'
                      ? `Internal haul pilot · ${credit.originIcao}→${credit.destIcao}`
                      : `VA member cut · ${credit.originIcao}→${credit.destIcao}`,
                });
                return { walletUsd: missions.walletUsd };
              },
              {
                persist: 'company',
                companyId: credit.companyId,
                housekeeping: false,
                catchUp: false,
              },
            );
          }
          if (
            isVaRankingMission(settled.mission) &&
            settleCompanyId &&
            store
          ) {
            const listedForHaul = await Promise.resolve(
              store.vaIsListed(settleCompanyId),
            );
            if (listedForHaul) {
              const dayKey = vaDayKeyFromTick(settled.settleTick);
              await Promise.resolve(
                store.vaRecordHaulStats({
                  companyId: settleCompanyId,
                  accountId: settled.mission.pilotAccountId,
                  dayKey,
                  nm: Number(settled.mission.distanceNm) || 0,
                  payUsd: settled.settlement.payoutUsd ?? 0,
                }),
              );
            }
          }
          const flightScorePct = settled.mission.settledFlightScore?.pct;
          if (
            settleCompanyId &&
            store &&
            typeof flightScorePct === 'number' &&
            Number.isFinite(flightScorePct)
          ) {
            const listed = await Promise.resolve(
              store.vaIsListed(settleCompanyId),
            );
            if (listed) {
              const onTime =
                typeof settled.settlement.onTime === 'boolean'
                  ? settled.settlement.onTime
                  : true;
              await Promise.resolve(
                store.vaRecordFlightQuality({
                  companyId: settleCompanyId,
                  dayKey: vaDayKeyFromTick(settled.settleTick),
                  scorePct: flightScorePct,
                  onTime,
                }),
              );
            }
          }
          const payLine = formatPilotPayDebriefLine({
            pilotPayUsd: settled.pilotPayCredit?.amountUsd ?? null,
            companyPayoutUsd: settled.settlement.payoutUsd,
            isVaFlight: settled.mission.vaFlight === true,
            internalHaul:
              settled.mission.warehouseBridge === true &&
              settled.mission.internalHaul === true,
          });
          send(res, 200, {
            mission: await toClientMission(settled.mission),
            walletUsd: settled.walletUsd,
            fuelDebitUsd: settled.fuelDebitUsd,
            fleet: settled.fleet,
            pilotIcao: settled.pilotIcao,
            activeTour: settled.activeTour ?? null,
            charterActiveTour: settled.charterActiveTour ?? null,
            lastSettleOutcome: lastSettleOutcome ?? null,
            settlement: settled.settlement.settlementType === 'charter'
              ? {
                  ...settled.settlement,
                  residualFuelKg: settled.mission.settledFuelKg ?? null,
                  landingFpm: settled.mission.settledLandingFpm ?? null,
                  flightDurationMs:
                    settled.mission.settledFlightDurationMs ?? null,
                  flightScore: settled.mission.settledFlightScore ?? null,
                  weatherOps: settled.mission.settledWeatherOps ?? null,
                  runwayTouch: settled.mission.settledRunwayTouch ?? null,
                  pilotPayUsd: settled.pilotPayCredit?.amountUsd ?? null,
                  lastSettleOutcome: lastSettleOutcome ?? null,
                  payLine,
                  showClassOpsDebrief,
                }
              : {
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
              classOpsDeltas: settled.classOpsDeltas,
              pilotPayUsd: settled.pilotPayCredit?.amountUsd ?? null,
              lastSettleOutcome: lastSettleOutcome ?? null,
              payLine,
              showClassOpsDebrief,
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
          companyId?: string;
        };
        if (!body.missionId) {
          send(res, 400, { error: 'missionId required' });
          return;
        }
        const loadOfpCompanyId = companyIdFromRequest(req, body.companyId);
        const missions = await loadMissions({ companyId: loadOfpCompanyId });
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
          if (stoppedPipe) {
            await new Promise((r) => setTimeout(r, 150));
          }
          const injectFleet = await withCareerRead(
            async (_world, missions) => missions.fleet ?? [],
            { companyId: loadOfpCompanyId },
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
            const wrote = await updateOpenMission(
              body.missionId,
              (_m, open) => {
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
            },
              { companyId: loadOfpCompanyId },
            );
            if (!wrote) {
              const latest = await loadMissions({ companyId: loadOfpCompanyId });
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
              mission: await toClientMission(savedMission),
              ...result,
            });
            return;
          }
          send(res, 200, {
            mission: await toClientMission(savedMission),
            ...result,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const unavailable =
            /ENOENT|pipe|connect|SimBridge|ECONNREFUSED/i.test(message);
          sendRouteError(res, error, unavailable ? 503 : 400);
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
          /** Ops company for Crew Live soft uplink (explicit VA id). */
          companyId?: string;
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
          const session = authSessionFromRequest(req);
          watchLiveAccountId = session?.account.id?.trim() || null;
          const headerCompany =
            careerApiMode === 'gateway'
              ? worldAuthFromIncoming(req).companyId?.trim()
              : companyIdFromRequest(req, body.companyId)?.trim();
          const liveTrackCompanyId =
            body.companyId?.trim() || headerCompany || undefined;
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
            liveTrackCompanyId,
          });
          send(res, 200, status);
        } catch (error) {
          sendRouteError(res, error, 503);
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
      if (
        /World is not ready yet/i.test(message) ||
        /World database unavailable/i.test(message)
      ) {
        send(res, 503, {
          error: message,
          code: /unavailable/i.test(message)
            ? 'world_store_unavailable'
            : 'world_store_opening',
        });
        return;
      }
      sendRouteError(res, error, 500);
    }
  };

  const server = createServer((req, res) => {
    if (careerApiMode !== 'gateway') {
      return handleRequest(req, res);
    }
    return gatewayAuthScope.run(
      worldAuthFromIncoming(req),
      () => handleRequest(req, res),
    );
  });

  return {
    listen(): Promise<void> {
      return new Promise((resolveListen) => {
        const bind =
          (process.env.CAREER_UI_API_BIND ?? '127.0.0.1').trim() || '127.0.0.1';
        server.listen(port, bind, () => {
          console.log(`[career] API listening on http://${bind}:${port}`);
          // Phase 2: world tick without waiting for a UI client.
          // Gateway has no local store — pulse lives on the world host / worker.
          if (careerApiMode !== 'gateway') {
            void bootstrapHeadlessWorldPulse(worldTick);
          }
          resolveListen();
        });
      });
    },
    async close(): Promise<void> {
      worldTick.stopBackgroundPulse();
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
  const bind =
    (process.env.CAREER_UI_API_BIND ?? '127.0.0.1').trim() || '127.0.0.1';
  const api = createCareerApiServer(port);
  await api.listen();
  console.log(`Career API http://${bind === '0.0.0.0' ? '127.0.0.1' : bind}:${port} (bind ${bind})`);
  try {
    await access(join(uiDist, 'index.html'));
    console.log(`Career UI (static) ${uiDist}`);
  } catch {
    console.log('Career UI static dist not found — API-only (use Vite in dev)');
  }
}
