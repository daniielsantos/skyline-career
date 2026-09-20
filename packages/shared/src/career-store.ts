/**
 * Career save facade — JSON or embedded SQLite (default).
 * Simulation still runs on in-memory CareerEconomyWorld; this is I/O only.
 */

import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createSeedEconomyWorld,
  ensureEconomyCaughtUp,
  ensureSeedMarketFormed,
  MAX_LOAD_CATCH_UP_TICKS,
  migrateEconomyWorld,
} from './career-economy.js';
import {
  clHubIdentRemapsForPlayer,
  rewriteCareerIcaoFields,
} from './career-cl-hubs.js';
import { emptyMissionsStateV2, normalizeMissionsState } from './career-fleet.js';
import { normalizeMissionIntent } from './career-mission.js';
import { readJsonFile, renameJsonAside, writeJsonFileAtomic } from './career-json-io.js';
import {
  summarizeCareerLedger,
  type CareerLedgerSummary,
} from './career-ledger.js';
import { ensureHomeCountryId } from './career-partition.js';
import { careerDatabaseUrlFromEnv } from './career-database-url.js';
import {
  assembleMissionsFromTables,
  companyTablesPopulated,
  countLotsRows,
  economyBlobHasHotArrays,
  ensureLocalCompany,
  ensureV3Ddl,
  hydrateWorldFromTables,
  migrateV2toV3IfNeeded,
  missionsBlobStub,
  persistCompanyTables,
  persistLotsIncremental,
  persistInboundIncremental,
  lotPersistSignature,
  inboundPersistSignature,
  readLotsByIds,
  readInboundPendingForMission,
  replaceInboundPendingForMission,
  upsertLotRows,
  readLedgerRowsV3,
  persistLedgerIncremental,
  fleetPersistSignature,
  missionPersistSignature,
  replaceNpcFlights,
  replaceEconomyEvents,
  stripEconomyHotArrays,
  LOCAL_COMPANY_ID,
} from './career-store-v3.js';
import {
  countAirportRows,
  economyBlobHasAirports,
  ensureLocalWorld,
  ensureV4Ddl,
  hydrateAirportsFromTables,
  migrateV3toV4IfNeeded,
  overlayEconomyMeta,
  persistWorldAirports,
  persistAirportsPatch,
  readEconomyMeta,
  airportPersistSignature,
  airportSignaturesFromList,
  readAirportBoard,
  readAirportInventory,
  readAirportsByIcaos,
  stampCompanyWorldId,
  stripEconomyAirports,
  LOCAL_WORLD_ID,
  type AirportBoardSnapshot,
  type AirportInventorySnapshot,
} from './career-store-v4.js';
import {
  economyBlobHasWorldOps,
  ensureV5Ddl,
  hydrateWorldOpsFromTables,
  migrateV4toV5IfNeeded,
  persistWorldOpsTables,
  stripEconomyWorldOps,
  replacePortConcessions,
  replacePortInventories,
  replacePortListings,
  replaceDemandOrders,
  replaceNpcs,
  upsertDemandOrder,
  upsertPortListing,
} from './career-store-v5.js';
import {
  aircraftInstanceSignatureMap,
  ensureV6Ddl,
  hydrateAircraftPoolFromTables,
  migrateV5toV6IfNeeded,
  persistAircraftInstancesIncremental,
  claimAircraftInstanceInSqlite,
  releaseAircraftInstanceClaimInSqlite,
  stripEconomyAircraftPool,
} from './career-store-v6.js';
import {
  ensureV7Ddl,
  ensureV8HubSampleColumns,
  flushPendingHubEconomySamples,
  migrateV6toV7IfNeeded,
  migrateV7toV8IfNeeded,
  readHubEconomySamples as readHubEconomySamplesFromDb,
  readHubEconomySamplesSince as readHubEconomySamplesSinceFromDb,
  HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
} from './career-store-v7.js';
import {
  ensureV9Ddl,
  hydrateCharterFromTables,
  migrateV8toV9IfNeeded,
  persistCharterTables,
  stripEconomyCharter,
} from './career-store-v9.js';
import type { HubEconomySample } from './types/career-economy.js';
import type {
  CareerEconomyWorld,
  CareerLedgerEntry,
  CareerMissionsState,
  DemandOrder,
  MissionIntent,
  PlayerAircraft,
  PortConcessionIndexRow,
  PortListing,
} from './types/career-economy.js';
import type { OfflineFeeSummary } from './career-offline-fees.js';
import {
  ensureCompany,
  listCompaniesForWorld,
  type CareerCompanyRow,
  type EnsureCompanyOpts,
} from './career-companies.js';
import {
  settleAllCompaniesPassiveFees,
} from './career-company-session.js';
import {
  addCompanyMember,
  listAccountSessions,
  loginAccount,
  purgeExpiredSessions,
  registerAccount,
  resolveSession,
  revokeSession,
  accountOwnsCompany,
  listCompaniesForAccount,
  type AuthSessionContext,
  type AuthSessionListItem,
  type LoginAccountOpts,
  type RegisterAccountOpts,
  type RegisterAccountResult,
  type CareerAccountSession,
  type CareerAccount,
  type CareerCompanyMember,
} from './career-auth.js';
import { ensureV10Ddl, migrateV9toV10IfNeeded } from './career-store-v10.js';
import { ensureV11Ddl, migrateV10toV11IfNeeded } from './career-store-v11.js';
import { ensureV12Ddl, migrateV11toV12IfNeeded } from './career-store-v12.js';
import { ensureV13Ddl, migrateV12toV13IfNeeded } from './career-store-v13.js';
import { ensureV14Ddl, migrateV13toV14IfNeeded } from './career-store-v14.js';
import { ensureV15Ddl, migrateV14toV15IfNeeded } from './career-store-v15.js';
import { ensureV16Ddl, migrateV15toV16IfNeeded } from './career-store-v16.js';
import {
  acceptJoinRequest,
  createCompanyInvite,
  createJoinRequest,
  getCompanyMembership,
  getCompanyMemberRouteCutPct,
  homeCompanyIdForAccount,
  isCompanyRecruiting,
  joinCompanyWithInvite,
  kickCompanyMember,
  leaveCompany,
  listCompanyHaulRanking,
  listMembersForCompany,
  listOpenCompanyInvites,
  listPendingJoinRequests,
  listPilotHaulRankingForCompany,
  isCompanyVaListed,
  listVaDirectory,
  findAccountListedVaMembership,
  recordCompanyFlightQuality,
  getCompanyFlightQuality,
  recordInternalHaulStats,
  rejectJoinRequest,
  setCompanyMemberRole,
  setCompanyMemberRouteCutPct,
  setCompanyRecruiting,
  publishCompanyAsVa,
  unpublishCompanyAsVa,
  backfillCompanyHomeCountryIds,
  vaDayKeyFromTick,
  VA_FLIGHT_QUALITY_WINDOW_DAYS,
  type CareerCompanyInvite,
  type VaCompanyRankRow,
  type VaDirectoryEntry,
  type VaFlightQualitySnapshot,
  type VaJoinRequestRow,
  type VaMemberRow,
  type VaPilotRankRow,
  type VaPublishResult,
} from './career-va.js';

export type CareerStoreKind = 'json' | 'sqlite' | 'postgres';

/** Bumped when DDL changes; existing DBs upgrade via ensureSqliteSchema. */
export const CAREER_STORE_SCHEMA_VERSION = '16';
export { LOCAL_WORLD_ID, HUB_ECONOMY_SAMPLE_RETENTION_DAYS };
export { LOCAL_COMPANY_ID } from './career-store-v3.js';
export type { AirportBoardSnapshot, AirportInventorySnapshot };
export type { HubEconomySample };
export type {
  AuthSessionContext,
  AuthSessionListItem,
  CareerAccount,
  CareerAccountSession,
  CareerCompanyMember,
  RegisterAccountResult,
};

export type EconomyLoadResult = {
  world: CareerEconomyWorld;
  /** Hours advanced by wall-clock catch-up during this load. */
  advancedTicks: number;
  settledFlights: number;
  /** True when migrate/catch-up changed the world and it should be persisted. */
  dirty: boolean;
};

export type CommandWorldSliceOpts = {
  icaos: string[];
  lotIds: string[];
  missionId: string;
};

export type PersistCommandWorldSliceOpts = {
  missionId: string;
  lotIds: string[];
  icaos: string[];
};

export interface CareerStore {
  readonly kind: CareerStoreKind;
  readonly sqlitePath?: string;
  /**
   * Acquire the process-lifetime world-writer lease. Postgres implements this
   * with a session advisory lock; embedded stores do not need one.
   */
  acquireWorldWriterLease?(): Promise<boolean>;
  /** False after the lease connection is lost; used by health/write guards. */
  hasWorldWriterLease?(): boolean;
  loadEconomy(opts?: { maxCatchUpTicks?: number }): Promise<EconomyLoadResult>;
  saveEconomy(
    world: CareerEconomyWorld,
    opts?: { liveTables?: boolean },
  ): Promise<void>;
  persistDemandOrder(order: DemandOrder): Promise<void>;
  persistPortListing(listing: PortListing): Promise<void>;
  persistPortConcessionIndex(rows: PortConcessionIndexRow[]): Promise<void>;
  /** Seed/expire port market projection — not airports/lots/NPC. */
  persistPortMarketTables(world: CareerEconomyWorld): Promise<void>;
  persistDemandBoardTables(world: CareerEconomyWorld): Promise<void>;
  persistInboundPending(world: CareerEconomyWorld): Promise<void>;
  /**
   * Contract-pilot / NPC live: lots, inbound, dirty airports, NPC roster +
   * flights — not port/demand ops tables.
   */
  persistNpcLiveWorld(world: CareerEconomyWorld): Promise<void>;
  /** Dealer pool rows only (F7); blob stub no longer holds instances. */
  persistAircraftPool(world: CareerEconomyWorld): Promise<void>;
  /**
   * F7 — lock dealer hull as sold for companyId (PG FOR UPDATE / SQLite
   * BEGIN IMMEDIATE). Idempotent for same company. Optional on JSON store.
   */
  claimAircraftInstance?(opts: {
    instanceId: string;
    companyId: string;
    worldId?: string;
  }): Promise<'claimed' | 'unavailable'>;
  /** Undo claimAircraftInstance after a failed buy/lease. */
  releaseAircraftInstanceClaim?(opts: {
    instanceId: string;
    companyId: string;
    worldId?: string;
  }): Promise<boolean>;
  /** Daily Hub Stats samples for one ICAO (empty on JSON store). */
  readHubEconomySamples(opts: {
    icao: string;
    sinceDay?: number;
  }): HubEconomySample[] | Promise<HubEconomySample[]>;
  /** All hubs for days ≥ sinceDay (network history pulse). */
  readHubEconomySamplesSince(opts?: {
    sinceDay?: number;
    untilDay?: number;
  }): HubEconomySample[] | Promise<HubEconomySample[]>;
  /**
   * Origin/dest + listed lots + inbound for one mission. Does not set RAM.
   * JSON store returns null (caller loads the full world).
   */
  loadCommandWorldSlice(opts: CommandWorldSliceOpts): CareerEconomyWorld | null;
  /** Patch those hubs/lots/inbound only — never prune the planet. */
  persistCommandWorldSlice(
    world: CareerEconomyWorld,
    opts: PersistCommandWorldSliceOpts,
  ): Promise<void>;
  loadMissions(opts?: { companyId?: string }): Promise<CareerMissionsState>;
  saveMissions(
    state: CareerMissionsState,
    opts?: { companyId?: string },
  ): Promise<void>;
  /** Active company tenant for load/save (SP default `local`). */
  getActiveCompanyId(): string;
  setActiveCompanyId(companyId: string): void;
  /** Companies registered on a world (SQLite/Postgres); JSON store returns `local` only. */
  listWorldCompanies(worldId?: string):
    | Array<{
        id: string;
        displayName: string;
        homeHubIcao: string;
        homeCountryId: string;
        worldId: string;
        createdAtMs: number;
      }>
    | Promise<
        Array<{
          id: string;
          displayName: string;
          homeHubIcao: string;
          homeCountryId: string;
          worldId: string;
          createdAtMs: number;
        }>
      >;
  /** Upsert a company row on the shared world (no-op / throw on JSON for non-local). */
  ensureCompany(opts: {
    id: string;
    worldId?: string;
    displayName?: string;
    homeHubIcao?: string;
    homeCountryId?: string;
  }):
    | {
        id: string;
        displayName: string;
        homeHubIcao: string;
        homeCountryId: string;
        worldId: string;
        createdAtMs: number;
      }
    | Promise<{
        id: string;
        displayName: string;
        homeHubIcao: string;
        homeCountryId: string;
        worldId: string;
        createdAtMs: number;
      }>;
  /** Local Auth (schema v10). JSON store throws. */
  readonly supportsAuth: boolean;
  authRegister(
    opts: RegisterAccountOpts,
  ): RegisterAccountResult | Promise<RegisterAccountResult>;
  authLogin(opts: LoginAccountOpts):
    | {
        account: CareerAccount;
        session: CareerAccountSession;
      }
    | Promise<{
        account: CareerAccount;
        session: CareerAccountSession;
      }>;
  authResolveSession(
    token: string | null | undefined,
    opts?: { nowMs?: number; touch?: boolean },
  ): AuthSessionContext | null | Promise<AuthSessionContext | null>;
  authRevokeSession(token: string): boolean | Promise<boolean>;
  /** Delete expired account_sessions rows. Returns removed count. */
  authPurgeExpiredSessions(nowMs?: number): number | Promise<number>;
  /** Live sessions (+ online flag from last_seen). JSON store returns []. */
  authListSessions(opts?: {
    accountId?: string;
    nowMs?: number;
    onlineWindowMs?: number;
    includeExpired?: boolean;
  }): AuthSessionListItem[] | Promise<AuthSessionListItem[]>;
  authListCompaniesForAccount(
    accountId: string,
  ): CareerCompanyRow[] | Promise<CareerCompanyRow[]>;
  authAddCompanyMember(opts: {
    companyId: string;
    accountId: string;
    role?: CareerCompanyMember['role'];
  }): CareerCompanyMember | Promise<CareerCompanyMember>;
  authAccountOwnsCompany(
    accountId: string,
    companyId: string,
  ): boolean | Promise<boolean>;
  /** VA roster / invites (SQLite + Postgres). JSON store throws / empty. */
  vaListMembers(companyId: string): VaMemberRow[] | Promise<VaMemberRow[]>;
  vaCreateInvite(opts: {
    companyId: string;
    createdByAccountId: string;
    role?: CareerCompanyMember['role'];
    maxUses?: number;
  }): CareerCompanyInvite | Promise<CareerCompanyInvite>;
  vaListInvites(
    companyId: string,
  ): CareerCompanyInvite[] | Promise<CareerCompanyInvite[]>;
  vaJoinInvite(opts: { code: string; accountId: string }):
    | { member: CareerCompanyMember; companyId: string }
    | Promise<{ member: CareerCompanyMember; companyId: string }>;
  vaLeave(opts: { companyId: string; accountId: string }): void | Promise<void>;
  vaKick(opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
  }): void | Promise<void>;
  vaSetRole(opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
    role: CareerCompanyMember['role'];
  }): CareerCompanyMember | Promise<CareerCompanyMember>;
  vaHomeCompanyId(accountId: string): string | null | Promise<string | null>;
  vaGetMembership(
    accountId: string,
    companyId: string,
  ): CareerCompanyMember | null | Promise<CareerCompanyMember | null>;
  vaRecordHaulStats(opts: {
    companyId: string;
    accountId?: string | null;
    dayKey: number;
    nm: number;
    payUsd: number;
  }): void | Promise<void>;
  vaRecordFlightQuality(opts: {
    companyId: string;
    dayKey: number;
    scorePct: number;
    onTime: boolean;
  }): void | Promise<void>;
  vaFlightQuality(opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
  }): VaFlightQualitySnapshot | Promise<VaFlightQualitySnapshot>;
  vaCompanyRanking(opts: {
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): VaCompanyRankRow[] | Promise<VaCompanyRankRow[]>;
  vaPilotRanking(opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): VaPilotRankRow[] | Promise<VaPilotRankRow[]>;
  vaDirectory(opts?: {
    worldId?: string;
    accountId?: string;
    includeClosed?: boolean;
    limit?: number;
    fromDayKey?: number;
    toDayKey?: number;
  }): VaDirectoryEntry[] | Promise<VaDirectoryEntry[]>;
  vaSetRecruiting(opts: {
    companyId: string;
    actorAccountId: string;
    recruiting: boolean;
  }): boolean | Promise<boolean>;
  vaPublish(opts: {
    companyId: string;
    actorAccountId: string;
    displayName: string;
    homeHubIcao: string;
    recruiting?: boolean;
    memberRouteCutPct?: number;
  }): VaPublishResult | Promise<VaPublishResult>;
  vaUnpublish(opts: {
    companyId: string;
    actorAccountId: string;
  }):
    | { companyId: string; listed: false; removedMembers: number }
    | Promise<{ companyId: string; listed: false; removedMembers: number }>;
  vaGetMemberRouteCutPct(companyId: string): number | Promise<number>;
  vaSetMemberRouteCutPct(opts: {
    companyId: string;
    actorAccountId: string;
    memberRouteCutPct: number;
  }): number | Promise<number>;
  vaIsListed(companyId: string): boolean | Promise<boolean>;
  vaIsRecruiting(companyId: string): boolean | Promise<boolean>;
  /** Listed VA the account already belongs to (owner or member), if any. */
  vaListedMembership(accountId: string):
    | { companyId: string; role: CareerCompanyMember['role'] }
    | null
    | Promise<{ companyId: string; role: CareerCompanyMember['role'] } | null>;
  vaCreateJoinRequest(opts: {
    companyId: string;
    accountId: string;
  }): VaJoinRequestRow | Promise<VaJoinRequestRow>;
  vaListJoinRequests(companyId: string):
    | VaJoinRequestRow[]
    | Promise<VaJoinRequestRow[]>;
  vaAcceptJoinRequest(opts: {
    requestId: string;
    actorAccountId: string;
  }):
    | { member: CareerCompanyMember; companyId: string }
    | Promise<{ member: CareerCompanyMember; companyId: string }>;
  vaRejectJoinRequest(opts: {
    requestId: string;
    actorAccountId: string;
  }): void | Promise<void>;
  /**
   * Pulse settle-all companies on the world (SQLite/Postgres).
   * JSON: settles active only via caller.
   * Returns preferred (active) company fee summary when present.
   */
  settleWorldCompaniesPassiveFees?(opts: {
    world: CareerEconomyWorld;
    fromTick: number;
    toTick: number;
    worldId?: string;
    nowMs?: number;
  }): OfflineFeeSummary | null | Promise<OfflineFeeSummary | null>;
  /** In-process world after last load/save — skip blob parse on hot reads. */
  peekEconomyWorld(): CareerEconomyWorld | null;
  /**
   * Live read of one economy_meta.misc_json key (Postgres). Used for rare
   * ops flags so SQL patches apply without waiting for a full rehydrate.
   * SQLite/JSON omit this — callers fall back to peeked world.
   */
  readEconomyMiscField?(key: string): Promise<unknown>;
  /** Schema v4: hub + stock + lots by ICAO. JSON store uses RAM if present. */
  readAirportBoard(icao: string): AirportBoardSnapshot | null;
  /** Hub + stock + clock only (no lots). SQL, no economy blob. */
  readAirportInventory(icao: string): AirportInventorySnapshot | null;
  /** Ledger rows (materialized in SQLite; from missions blob for JSON). */
  loadLedger(): Promise<CareerLedgerEntry[]>;
  summarizeCashflow(atTick: number): Promise<{
    week: CareerLedgerSummary;
    month: CareerLedgerSummary;
    allTime: CareerLedgerSummary;
    recent: CareerLedgerEntry[];
  }>;
  close(): void;
}

export type OpenCareerStoreOpts = {
  careerDir: string;
  /** Force backend. Default: sqlite (migrate from JSON when present). */
  backend?: CareerStoreKind | 'auto';
  /** Postgres connection string (MP hosted world). */
  connectionString?: string;
  economyFileName?: string;
  missionsFileName?: string;
  sqliteFileName?: string;
};

function catchUpOpts(opts?: { maxCatchUpTicks?: number }) {
  return { maxTicks: opts?.maxCatchUpTicks ?? MAX_LOAD_CATCH_UP_TICKS };
}

function economyNeedsRewrite(
  existing: Record<string, unknown>,
  caught: CareerEconomyWorld,
  advancedTicks: number,
  settledFlights: number,
): boolean {
  const blobNpcs = Array.isArray(existing.npcs) ? existing.npcs : [];
  const blobHasNpcs = blobNpcs.length > 0;
  const npcCountBefore = blobHasNpcs ? blobNpcs.length : caught.npcs.length;
  const blobTrucks = Array.isArray(existing.fuelTrucks) ? existing.fuelTrucks : [];
  const blobHasTrucks = blobTrucks.length > 0;
  const trucksBefore = blobHasTrucks
    ? blobTrucks.length
    : (caught.fuelTrucks?.length ?? 0);
  const blobAirports = Array.isArray(existing.airports) ? existing.airports : [];
  const blobHasAirports = blobAirports.length > 0;
  const airportsBefore = blobHasAirports ? blobAirports.length : caught.airports.length;
  const hubLevelSigBefore = blobHasAirports
    ? (blobAirports as Array<{ level?: number; levelXp?: number; levelCurveVersion?: number }>)
        .map((ap) => `${ap.level ?? ''}:${ap.levelXp ?? ''}:${ap.levelCurveVersion ?? ''}`)
        .join('|')
    : '';
  const npcRegionsBefore = blobHasNpcs
    ? (blobNpcs as Array<{ homeRegion?: string }>)
        .map((npc) => npc.homeRegion ?? '')
        .join('|')
    : '';
  const missingHubTiers = blobHasAirports
    ? (blobAirports as Array<{ hubTier?: string }>).some((ap) => !ap.hubTier)
    : false;
  const missingHomeCountry = !(existing as { homeCountryId?: string }).homeCountryId;
  const version = (existing as { version?: number }).version;

  const hubLevelSigAfter = blobHasAirports
    ? (caught.airports ?? [])
        .map((ap) => `${ap.level ?? ''}:${ap.levelXp ?? ''}:${ap.levelCurveVersion ?? ''}`)
        .join('|')
    : '';
  const npcRegionsAfter = (caught.npcs ?? []).map((npc) => npc.homeRegion ?? '').join('|');

  return (
    advancedTicks > 0 ||
    settledFlights > 0 ||
    version !== 3 ||
    (blobHasNpcs && caught.npcs.length !== npcCountBefore) ||
    (blobHasTrucks && (caught.fuelTrucks?.length ?? 0) !== trucksBefore) ||
    (blobHasAirports && caught.airports.length !== airportsBefore) ||
    (blobHasNpcs && npcRegionsAfter !== npcRegionsBefore) ||
    (blobHasAirports && hubLevelSigAfter !== hubLevelSigBefore) ||
    missingHubTiers ||
    missingHomeCountry ||
    economyBlobHasHotArrays(existing) ||
    economyBlobHasAirports(existing) ||
    economyBlobHasWorldOps(existing)
  );
}

function normalizeMissions(raw: Record<string, unknown>): CareerMissionsState {
  const normalized = normalizeMissionsState(raw);
  normalized.missions = normalized.missions.map((m) => normalizeMissionIntent(m));
  return normalized;
}

function missionsPayloadForBlob(state: CareerMissionsState): CareerMissionsState {
  return normalizeMissions(state as unknown as Record<string, unknown>);
}

function airportIcaoList(raw: { airports?: Array<{ icao?: string }> }): string[] {
  return (raw.airports ?? [])
    .map((airport) => String(airport.icao ?? '').trim().toUpperCase())
    .filter(Boolean);
}

async function persistClHubIdentRemaps(
  store: {
    loadMissions(): Promise<CareerMissionsState>;
    saveMissions(state: CareerMissionsState): Promise<void>;
  },
  beforeIcaos: string[],
  afterIcaos: string[],
): Promise<void> {
  const remaps = clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos);
  if (remaps.length === 0) return;
  try {
    const missions = await store.loadMissions();
    for (const [from, to] of remaps) rewriteCareerIcaoFields(missions, from, to);
    await store.saveMissions(missions);
  } catch {
    /* missions file may not exist yet on a fresh economy */
  }
}

// ─── JSON store ─────────────────────────────────────────────────────────────

class JsonCareerStore implements CareerStore {
  readonly kind = 'json' as const;
  private ram: CareerEconomyWorld | null = null;
  private activeCompanyId = LOCAL_COMPANY_ID;
  constructor(
    private readonly economyPath: string,
    private readonly missionsPath: string,
  ) {}

  getActiveCompanyId(): string {
    return this.activeCompanyId;
  }

  setActiveCompanyId(companyId: string): void {
    const id = companyId.trim() || LOCAL_COMPANY_ID;
    if (id !== LOCAL_COMPANY_ID) {
      throw new Error('JSON career store only supports company id "local"');
    }
    this.activeCompanyId = LOCAL_COMPANY_ID;
  }

  listWorldCompanies(worldId?: string): CareerCompanyRow[] {
    void worldId;
    return [
      {
        id: LOCAL_COMPANY_ID,
        displayName: '',
        homeHubIcao: '',
        homeCountryId: '',
        worldId: LOCAL_WORLD_ID,
        createdAtMs: 0,
      },
    ];
  }

  ensureCompany(opts: EnsureCompanyOpts): CareerCompanyRow {
    const id = opts.id.trim() || LOCAL_COMPANY_ID;
    if (id !== LOCAL_COMPANY_ID) {
      throw new Error('JSON career store only supports company id "local"');
    }
    return {
      id: LOCAL_COMPANY_ID,
      displayName: opts.displayName ?? '',
      homeHubIcao: opts.homeHubIcao ?? '',
      homeCountryId: opts.homeCountryId ?? '',
      worldId: opts.worldId?.trim() || LOCAL_WORLD_ID,
      createdAtMs: Date.now(),
    };
  }

  readonly supportsAuth = false;

  authRegister(_opts: RegisterAccountOpts): RegisterAccountResult {
    throw new Error('Auth requires SQLite career store');
  }

  authLogin(_opts: LoginAccountOpts): {
    account: CareerAccount;
    session: CareerAccountSession;
  } {
    throw new Error('Auth requires SQLite career store');
  }

  authResolveSession(
    _token: string | null | undefined,
    _opts?: { nowMs?: number; touch?: boolean },
  ): AuthSessionContext | null {
    return null;
  }

  authRevokeSession(_token: string): boolean {
    return false;
  }

  authPurgeExpiredSessions(_nowMs?: number): number {
    return 0;
  }

  authListSessions(_opts?: {
    accountId?: string;
    nowMs?: number;
    onlineWindowMs?: number;
    includeExpired?: boolean;
  }): AuthSessionListItem[] {
    return [];
  }

  authListCompaniesForAccount(_accountId: string): CareerCompanyRow[] {
    return [];
  }

  authAddCompanyMember(_opts: {
    companyId: string;
    accountId: string;
    role?: CareerCompanyMember['role'];
  }): CareerCompanyMember {
    throw new Error('Auth requires SQLite career store');
  }

  authAccountOwnsCompany(_accountId: string, _companyId: string): boolean {
    return false;
  }

  vaListMembers(_companyId: string): VaMemberRow[] {
    return [];
  }

  vaCreateInvite(_opts: {
    companyId: string;
    createdByAccountId: string;
    role?: CareerCompanyMember['role'];
    maxUses?: number;
  }): CareerCompanyInvite {
    throw new Error('VA requires SQLite career store');
  }

  vaListInvites(_companyId: string): CareerCompanyInvite[] {
    return [];
  }

  vaJoinInvite(_opts: {
    code: string;
    accountId: string;
  }): { member: CareerCompanyMember; companyId: string } {
    throw new Error('VA requires SQLite career store');
  }

  vaLeave(_opts: { companyId: string; accountId: string }): void {
    throw new Error('VA requires SQLite career store');
  }

  vaKick(_opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
  }): void {
    throw new Error('VA requires SQLite career store');
  }

  vaSetRole(_opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
    role: CareerCompanyMember['role'];
  }): CareerCompanyMember {
    throw new Error('VA requires SQLite career store');
  }

  vaHomeCompanyId(_accountId: string): string | null {
    return null;
  }

  vaGetMembership(
    _accountId: string,
    _companyId: string,
  ): CareerCompanyMember | null {
    return null;
  }

  vaRecordHaulStats(_opts: {
    companyId: string;
    accountId?: string | null;
    dayKey: number;
    nm: number;
    payUsd: number;
  }): void {}

  vaRecordFlightQuality(_opts: {
    companyId: string;
    dayKey: number;
    scorePct: number;
    onTime: boolean;
  }): void {}

  vaFlightQuality(_opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
  }): VaFlightQualitySnapshot {
    return {
      windowDays: VA_FLIGHT_QUALITY_WINDOW_DAYS,
      flightCount: 0,
      avgFlightScorePct: null,
      onTimePct: null,
      qualityScore: null,
    };
  }

  vaCompanyRanking(_opts: {
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): VaCompanyRankRow[] {
    return [];
  }

  vaPilotRanking(_opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): VaPilotRankRow[] {
    return [];
  }

  vaDirectory(): VaDirectoryEntry[] {
    return [];
  }

  vaSetRecruiting(_opts: {
    companyId: string;
    actorAccountId: string;
    recruiting: boolean;
  }): boolean {
    throw new Error('VA requires SQLite career store');
  }

  vaPublish(_opts: {
    companyId: string;
    actorAccountId: string;
    displayName: string;
    homeHubIcao: string;
    recruiting?: boolean;
    memberRouteCutPct?: number;
  }): VaPublishResult {
    throw new Error('VA requires SQLite career store');
  }

  vaUnpublish(_opts: {
    companyId: string;
    actorAccountId: string;
  }): { companyId: string; listed: false; removedMembers: number } {
    throw new Error('VA requires SQLite career store');
  }

  vaGetMemberRouteCutPct(_companyId: string): number {
    return 30;
  }

  vaSetMemberRouteCutPct(_opts: {
    companyId: string;
    actorAccountId: string;
    memberRouteCutPct: number;
  }): number {
    throw new Error('VA requires SQLite career store');
  }

  vaIsListed(_companyId: string): boolean {
    return false;
  }

  vaIsRecruiting(_companyId: string): boolean {
    return false;
  }

  vaListedMembership(
    _accountId: string,
  ): { companyId: string; role: CareerCompanyMember['role'] } | null {
    return null;
  }

  vaCreateJoinRequest(_opts: {
    companyId: string;
    accountId: string;
  }): VaJoinRequestRow {
    throw new Error('VA requires SQLite career store');
  }

  vaListJoinRequests(_companyId: string): VaJoinRequestRow[] {
    return [];
  }

  vaAcceptJoinRequest(_opts: {
    requestId: string;
    actorAccountId: string;
  }): { member: CareerCompanyMember; companyId: string } {
    throw new Error('VA requires SQLite career store');
  }

  vaRejectJoinRequest(_opts: {
    requestId: string;
    actorAccountId: string;
  }): void {
    throw new Error('VA requires SQLite career store');
  }

  peekEconomyWorld(): CareerEconomyWorld | null {
    return this.ram;
  }

  loadCommandWorldSlice(_opts: CommandWorldSliceOpts): CareerEconomyWorld | null {
    return null;
  }

  async persistCommandWorldSlice(
    world: CareerEconomyWorld,
    _opts: PersistCommandWorldSliceOpts,
  ): Promise<void> {
    await this.saveEconomy(world);
  }

  readAirportInventory(icao: string): AirportInventorySnapshot | null {
    const world = this.ram;
    if (!world) return null;
    const code = icao.trim().toUpperCase();
    const airport = world.airports.find((a) => a.icao === code);
    if (!airport) return null;
    return {
      worldId: LOCAL_WORLD_ID,
      meta: {
        worldId: LOCAL_WORLD_ID,
        seed: world.seed,
        tick: world.tick,
        lastBatchAtMs: world.lastBatchAtMs,
        homeCountryId: world.homeCountryId ?? '',
      },
      airport,
    };
  }

  readAirportBoard(icao: string): AirportBoardSnapshot | null {
    const world = this.ram;
    if (!world) return null;
    const code = icao.trim().toUpperCase();
    const airport = world.airports.find((a) => a.icao === code);
    if (!airport) return null;
    const lots = (world.lots ?? []).filter(
      (lot) =>
        (lot.originIcao === code || lot.destIcao === code) &&
        (lot.status === 'available' ||
          lot.status === 'reserved' ||
          lot.status === 'in_transit'),
    );
    const partnerIcaos = lots
      .flatMap((l) => [l.originIcao, l.destIcao])
      .filter((c) => c !== code);
    const relatedAirports = world.airports.filter((a) => partnerIcaos.includes(a.icao));
    return {
      worldId: LOCAL_WORLD_ID,
      meta: {
        worldId: LOCAL_WORLD_ID,
        seed: world.seed,
        tick: world.tick,
        lastBatchAtMs: world.lastBatchAtMs,
        homeCountryId: world.homeCountryId ?? '',
      },
      airport,
      lots,
      relatedAirports,
    };
  }

  async loadEconomy(opts?: { maxCatchUpTicks?: number }): Promise<EconomyLoadResult> {
    if (this.ram && opts?.maxCatchUpTicks === 0) {
      return {
        world: this.ram,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }
    const existing = await readJsonFile<Record<string, unknown>>(this.economyPath);
    if (existing && Array.isArray(existing.airports)) {
      const beforeIcaos = airportIcaoList(existing);
      const world = migrateEconomyWorld(existing);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
        world,
        Date.now(),
        catchUpOpts(opts),
      );
      ensureHomeCountryId(caught);
      const afterIcaos = airportIcaoList(caught);
      let dirty = economyNeedsRewrite(existing, caught, advancedTicks, settledFlights);
      if (ensureSeedMarketFormed(caught)) dirty = true;
      if (clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos).length > 0) dirty = true;
      await persistClHubIdentRemaps(this, beforeIcaos, afterIcaos);
      this.ram = caught;
      return { world: caught, advancedTicks, settledFlights, dirty };
    }
    if (existing) {
      throw new Error(
        `Save at ${this.economyPath} has no airports[]; refusing to overwrite it with a fresh world`,
      );
    }
    const fresh = createSeedEconomyWorld();
    ensureSeedMarketFormed(fresh);
    await this.saveEconomy(fresh);
    this.ram = fresh;
    return { world: fresh, advancedTicks: 0, settledFlights: 0, dirty: false };
  }

  async saveEconomy(
    world: CareerEconomyWorld,
    _opts?: { liveTables?: boolean },
  ): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    this.ram = toSave;
    await writeJsonFileAtomic(this.economyPath, toSave);
  }

  async persistDemandOrder(_order: DemandOrder): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistPortListing(_listing: PortListing): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistPortConcessionIndex(_rows: PortConcessionIndexRow[]): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistPortMarketTables(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistDemandBoardTables(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistInboundPending(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistNpcLiveWorld(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  async persistAircraftPool(_world: CareerEconomyWorld): Promise<void> {
    if (this.ram) await this.saveEconomy(this.ram);
  }

  readHubEconomySamples(_opts: {
    icao: string;
    sinceDay?: number;
  }): HubEconomySample[] {
    return [];
  }

  readHubEconomySamplesSince(_opts?: {
    sinceDay?: number;
    untilDay?: number;
  }): HubEconomySample[] {
    return [];
  }

  async loadMissions(_opts?: { companyId?: string }): Promise<CareerMissionsState> {
    const existing = await readJsonFile<Record<string, unknown>>(this.missionsPath);
    if (existing && Array.isArray(existing.missions)) {
      const normalized = normalizeMissions(existing);
      if (
        existing.version !== 2 ||
        !Array.isArray((existing as { fleet?: unknown }).fleet)
      ) {
        await this.saveMissions(normalized);
      }
      return normalized;
    }
    if (existing) {
      throw new Error(
        `Save at ${this.missionsPath} has no missions[]; refusing to overwrite it with an empty career`,
      );
    }
    const fresh = emptyMissionsStateV2();
    await this.saveMissions(fresh);
    return fresh;
  }

  async saveMissions(
    state: CareerMissionsState,
    _opts?: { companyId?: string },
  ): Promise<void> {
    await writeJsonFileAtomic(this.missionsPath, missionsPayloadForBlob(state));
  }

  async loadLedger(): Promise<CareerLedgerEntry[]> {
    const missions = await this.loadMissions();
    return missions.ledger ?? [];
  }

  async summarizeCashflow(atTick: number) {
    const missions = await this.loadMissions();
    return summarizeCareerLedger(missions, atTick);
  }

  close(): void {
    this.ram = null;
  }
}

// ─── SQLite store ───────────────────────────────────────────────────────────

type SqliteDb = DatabaseSync;

function runInTransaction(db: SqliteDb, fn: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw error;
  }
}

function openSqliteDb(path: string): SqliteDb {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  ensureSqliteSchema(db);
  return db;
}

/** Create/upgrade DDL. Idempotent; bumps meta.schema_version to current. */
function ensureSqliteSchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS economy_json (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS missions_json (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY NOT NULL,
      at_tick INTEGER NOT NULL,
      day_index INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      kind TEXT NOT NULL,
      note TEXT,
      aircraft_id TEXT,
      mission_id TEXT,
      icao TEXT
    );
    CREATE INDEX IF NOT EXISTS ledger_day_idx ON ledger(day_index);
    CREATE INDEX IF NOT EXISTS ledger_tick_idx ON ledger(at_tick);
    CREATE TABLE IF NOT EXISTS lots (
      id TEXT PRIMARY KEY NOT NULL,
      commodity_id TEXT NOT NULL,
      origin_icao TEXT NOT NULL,
      dest_icao TEXT NOT NULL,
      quantity_kg INTEGER NOT NULL,
      reserved_kg INTEGER NOT NULL,
      created_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      pay_usd INTEGER NOT NULL,
      base_pay_usd INTEGER,
      urgency TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lots_status_idx ON lots(status);
    CREATE INDEX IF NOT EXISTS lots_od_idx ON lots(origin_icao, dest_icao);
    CREATE INDEX IF NOT EXISTS lots_expires_idx ON lots(expires_at_tick);
  `);

  ensureV3Ddl(db);
  ensureV4Ddl(db);
  ensureV5Ddl(db);
  ensureV6Ddl(db);
  ensureV7Ddl(db);
  ensureV8HubSampleColumns(db);
  ensureV9Ddl(db);
  ensureV10Ddl(db);
  ensureV11Ddl(db);
  ensureV12Ddl(db);
  ensureV13Ddl(db);
  ensureV14Ddl(db);
  ensureV15Ddl(db);
  ensureV16Ddl(db);

  const ver = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  if (!ver) {
    ensureLocalWorld(db);
    ensureLocalCompany(db);
    stampCompanyWorldId(db);
    db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`).run(
      CAREER_STORE_SCHEMA_VERSION,
    );
    return;
  }

  const current = Number.parseInt(ver.value, 10);
  if (!Number.isFinite(current) || current < 3) {
    migrateV2toV3IfNeeded(db, metaSet, '3');
  }
  const afterV3 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV3 = Number.parseInt(afterV3?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV3) || verAfterV3 < 4) {
    migrateV3toV4IfNeeded(db, metaSet, '4');
  }
  const afterV4 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verNow = Number.parseInt(afterV4?.value ?? ver.value, 10);
  if (!Number.isFinite(verNow) || verNow < 5) {
    migrateV4toV5IfNeeded(db, metaSet, '5');
  }
  const afterV5 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV5 = Number.parseInt(afterV5?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV5) || verAfterV5 < 6) {
    migrateV5toV6IfNeeded(db, metaSet, '6');
  }
  const afterV6 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV6 = Number.parseInt(afterV6?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV6) || verAfterV6 < 7) {
    migrateV6toV7IfNeeded(db, metaSet, '7');
  }
  const afterV7 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV7 = Number.parseInt(afterV7?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV7) || verAfterV7 < 8) {
    migrateV7toV8IfNeeded(db, metaSet, '8');
  }
  const afterV8 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV8 = Number.parseInt(afterV8?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV8) || verAfterV8 < 9) {
    migrateV8toV9IfNeeded(db, metaSet, '9');
  }
  const afterV9 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV9 = Number.parseInt(afterV9?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV9) || verAfterV9 < 10) {
    migrateV9toV10IfNeeded(db, metaSet, '10');
  }
  const afterV10 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV10 = Number.parseInt(afterV10?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV10) || verAfterV10 < 11) {
    migrateV10toV11IfNeeded(db, metaSet, '11');
  }
  const afterV11 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV11 = Number.parseInt(afterV11?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV11) || verAfterV11 < 12) {
    migrateV11toV12IfNeeded(db, metaSet, '12');
  }
  const afterV12 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV12 = Number.parseInt(afterV12?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV12) || verAfterV12 < 13) {
    migrateV12toV13IfNeeded(db, metaSet, '13');
  }
  const afterV13 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV13 = Number.parseInt(afterV13?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV13) || verAfterV13 < 14) {
    migrateV13toV14IfNeeded(db, metaSet, '14');
  }
  const afterV14 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV14 = Number.parseInt(afterV14?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV14) || verAfterV14 < 15) {
    migrateV14toV15IfNeeded(db, metaSet, '15');
  }
  const afterV15 = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;
  const verAfterV15 = Number.parseInt(afterV15?.value ?? ver.value, 10);
  if (!Number.isFinite(verAfterV15) || verAfterV15 < 16) {
    migrateV15toV16IfNeeded(db, metaSet, CAREER_STORE_SCHEMA_VERSION);
  }
  ensureLocalWorld(db);
  ensureLocalCompany(db);
  stampCompanyWorldId(db);
  backfillCompanyHomeCountryIds(db);
}

function stripEconomyPersistBlob(world: CareerEconomyWorld): Record<string, unknown> {
  const stripped = stripEconomyCharter(
    stripEconomyAircraftPool(
      stripEconomyWorldOps(
        stripEconomyAirports(stripEconomyHotArrays(world)),
      ),
    ),
  );
  // Ephemeral day samples — SQL only.
  delete stripped.pendingHubEconomySamples;
  return stripped;
}

function metaSet(db: SqliteDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function lotsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(
    (world.lots ?? []).map((lot) => [
      lot.id,
      lot.quantityKg,
      lot.reservedKg,
      lot.status,
      lot.payUsd,
      lot.expiresAtTick,
    ]),
  );
}

function inboundPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(world.inboundPending ?? []);
}

function npcFlightsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(world.npcFlights ?? []);
}

function eventsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(world.events ?? []);
}

function lotSignatureMap(world: CareerEconomyWorld): Map<string, string> {
  const m = new Map<string, string>();
  for (const lot of world.lots ?? []) {
    m.set(lot.id, lotPersistSignature(lot));
  }
  return m;
}

function inboundSignatureMap(world: CareerEconomyWorld): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of world.inboundPending ?? []) {
    m.set(row.id, inboundPersistSignature(row));
  }
  return m;
}

function fleetSignatureMap(fleet: PlayerAircraft[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of fleet) {
    if (a.id) m.set(a.id, fleetPersistSignature(a));
  }
  return m;
}

function missionSignatureMap(missions: MissionIntent[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of missions) {
    if (row.id) m.set(row.id, missionPersistSignature(row));
  }
  return m;
}

function aircraftPoolPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify(
    (world.aircraftInstances ?? []).map((inst) => [
      inst.id,
      inst.status,
      inst.registration,
      inst.basedIcao,
      inst.availableAtTick ?? 0,
    ]),
  );
}

function worldOpsPersistKey(world: CareerEconomyWorld): string {
  return JSON.stringify({
    npcs: world.npcs ?? [],
    fuelTrucks: world.fuelTrucks ?? [],
    fuelHauls: world.fuelHauls ?? [],
    demandOrders: world.demandOrders ?? [],
    portListings: world.portListings ?? [],
    portInventories: world.portInventories ?? [],
    portConcessions: world.portConcessions ?? [],
  });
}

class SqliteCareerStore implements CareerStore {
  readonly kind = 'sqlite' as const;
  readonly sqlitePath: string;
  private readonly db: SqliteDb;
  private activeCompanyId = LOCAL_COMPANY_ID;
  private ram: CareerEconomyWorld | null = null;
  /** Signatures from the last successful airport table write (not in-RAM mutations). */
  private lastAirportSignatures: Map<string, string> | null = null;
  private lastLotSignatures: Map<string, string> | null = null;
  private lastInboundSignatures: Map<string, string> | null = null;
  private lastLotsKey: string | null = null;
  private lastInboundKey: string | null = null;
  private lastNpcFlightsKey: string | null = null;
  private lastEventsKey: string | null = null;
  private lastOpsKey: string | null = null;
  private lastAircraftPoolKey: string | null = null;
  private lastAircraftSignatures: Map<string, string> | null = null;
  private lastEconomyBlobJson: string | null = null;
  private lastCompanyPersistKey: string | null = null;
  private lastCompanyStateKey: string | null = null;
  private lastFleetPersistKey: string | null = null;
  private lastMissionsTableKey: string | null = null;
  private lastLedgerPersistKey: string | null = null;
  private lastMissionsStubJson: string | null = null;
  private lastFleetSignatures: Map<string, string> | null = null;
  private lastMissionSignatures: Map<string, string> | null = null;

  constructor(sqlitePath: string) {
    this.sqlitePath = sqlitePath;
    this.db = openSqliteDb(sqlitePath);
  }

  getActiveCompanyId(): string {
    return this.activeCompanyId;
  }

  setActiveCompanyId(companyId: string): void {
    const id = companyId.trim() || LOCAL_COMPANY_ID;
    if (id === this.activeCompanyId) return;
    this.activeCompanyId = id;
    // Invalidate company persist caches when switching tenants.
    this.lastCompanyPersistKey = null;
    this.lastCompanyStateKey = null;
    this.lastFleetPersistKey = null;
    this.lastMissionsTableKey = null;
    this.lastLedgerPersistKey = null;
    this.lastMissionsStubJson = null;
    this.lastFleetSignatures = null;
    this.lastMissionSignatures = null;
  }

  listWorldCompanies(worldId = LOCAL_WORLD_ID): CareerCompanyRow[] {
    return listCompaniesForWorld(this.db, worldId);
  }

  ensureCompany(opts: EnsureCompanyOpts): CareerCompanyRow {
    return ensureCompany(this.db, {
      ...opts,
      worldId: opts.worldId ?? LOCAL_WORLD_ID,
    });
  }

  readonly supportsAuth = true;

  authRegister(opts: RegisterAccountOpts): RegisterAccountResult {
    return registerAccount(this.db, opts);
  }

  authLogin(opts: LoginAccountOpts): {
    account: CareerAccount;
    session: CareerAccountSession;
  } {
    return loginAccount(this.db, opts);
  }

  authResolveSession(
    token: string | null | undefined,
    opts?: { nowMs?: number; touch?: boolean },
  ): AuthSessionContext | null {
    return resolveSession(this.db, token, opts);
  }

  authRevokeSession(token: string): boolean {
    return revokeSession(this.db, token);
  }

  authPurgeExpiredSessions(nowMs?: number): number {
    return purgeExpiredSessions(this.db, nowMs);
  }

  authListSessions(opts?: {
    accountId?: string;
    nowMs?: number;
    onlineWindowMs?: number;
    includeExpired?: boolean;
  }): AuthSessionListItem[] {
    return listAccountSessions(this.db, opts);
  }

  authListCompaniesForAccount(accountId: string): CareerCompanyRow[] {
    return listCompaniesForAccount(this.db, accountId);
  }

  authAddCompanyMember(opts: {
    companyId: string;
    accountId: string;
    role?: CareerCompanyMember['role'];
  }): CareerCompanyMember {
    return addCompanyMember(this.db, opts);
  }

  authAccountOwnsCompany(accountId: string, companyId: string): boolean {
    return accountOwnsCompany(this.db, accountId, companyId);
  }

  vaListMembers(companyId: string): VaMemberRow[] {
    return listMembersForCompany(this.db, companyId);
  }

  vaCreateInvite(opts: {
    companyId: string;
    createdByAccountId: string;
    role?: CareerCompanyMember['role'];
    maxUses?: number;
  }): CareerCompanyInvite {
    return createCompanyInvite(this.db, opts);
  }

  vaListInvites(companyId: string): CareerCompanyInvite[] {
    return listOpenCompanyInvites(this.db, companyId);
  }

  vaJoinInvite(opts: {
    code: string;
    accountId: string;
  }): { member: CareerCompanyMember; companyId: string } {
    return joinCompanyWithInvite(this.db, opts);
  }

  vaLeave(opts: { companyId: string; accountId: string }): void {
    leaveCompany(this.db, opts);
  }

  vaKick(opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
  }): void {
    kickCompanyMember(this.db, opts);
  }

  vaSetRole(opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
    role: CareerCompanyMember['role'];
  }): CareerCompanyMember {
    return setCompanyMemberRole(this.db, opts);
  }

  vaHomeCompanyId(accountId: string): string | null {
    return homeCompanyIdForAccount(this.db, accountId);
  }

  vaGetMembership(
    accountId: string,
    companyId: string,
  ): CareerCompanyMember | null {
    return getCompanyMembership(this.db, accountId, companyId);
  }

  vaRecordHaulStats(opts: {
    companyId: string;
    accountId?: string | null;
    dayKey: number;
    nm: number;
    payUsd: number;
  }): void {
    recordInternalHaulStats(this.db, opts);
  }

  vaRecordFlightQuality(opts: {
    companyId: string;
    dayKey: number;
    scorePct: number;
    onTime: boolean;
  }): void {
    recordCompanyFlightQuality(this.db, opts);
  }

  vaFlightQuality(opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
  }): VaFlightQualitySnapshot {
    return getCompanyFlightQuality(this.db, opts);
  }

  vaCompanyRanking(opts: {
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): VaCompanyRankRow[] {
    return listCompanyHaulRanking(this.db, opts);
  }

  vaPilotRanking(opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  }): VaPilotRankRow[] {
    return listPilotHaulRankingForCompany(this.db, opts);
  }

  vaDirectory(opts?: {
    worldId?: string;
    accountId?: string;
    includeClosed?: boolean;
    limit?: number;
    fromDayKey?: number;
    toDayKey?: number;
  }): VaDirectoryEntry[] {
    const tick = this.peekEconomyWorld()?.tick ?? 0;
    const toDay =
      typeof opts?.toDayKey === 'number'
        ? opts.toDayKey
        : vaDayKeyFromTick(tick);
    const fromDay =
      typeof opts?.fromDayKey === 'number'
        ? opts.fromDayKey
        : Math.max(0, toDay - (VA_FLIGHT_QUALITY_WINDOW_DAYS - 1));
    return listVaDirectory(this.db, {
      ...(opts ?? {}),
      fromDayKey: fromDay,
      toDayKey: toDay,
    });
  }

  vaSetRecruiting(opts: {
    companyId: string;
    actorAccountId: string;
    recruiting: boolean;
  }): boolean {
    return setCompanyRecruiting(this.db, opts);
  }

  vaPublish(opts: {
    companyId: string;
    actorAccountId: string;
    displayName: string;
    homeHubIcao: string;
    recruiting?: boolean;
    memberRouteCutPct?: number;
  }): VaPublishResult {
    return publishCompanyAsVa(this.db, opts);
  }

  vaUnpublish(opts: {
    companyId: string;
    actorAccountId: string;
  }): { companyId: string; listed: false; removedMembers: number } {
    return unpublishCompanyAsVa(this.db, opts);
  }

  vaGetMemberRouteCutPct(companyId: string): number {
    return getCompanyMemberRouteCutPct(this.db, companyId);
  }

  vaSetMemberRouteCutPct(opts: {
    companyId: string;
    actorAccountId: string;
    memberRouteCutPct: number;
  }): number {
    return setCompanyMemberRouteCutPct(this.db, opts);
  }

  vaIsListed(companyId: string): boolean {
    return isCompanyVaListed(this.db, companyId);
  }

  vaIsRecruiting(companyId: string): boolean {
    return isCompanyRecruiting(this.db, companyId);
  }

  vaListedMembership(
    accountId: string,
  ): { companyId: string; role: CareerCompanyMember['role'] } | null {
    return findAccountListedVaMembership(this.db, accountId);
  }

  vaCreateJoinRequest(opts: {
    companyId: string;
    accountId: string;
  }): VaJoinRequestRow {
    return createJoinRequest(this.db, opts);
  }

  vaListJoinRequests(companyId: string): VaJoinRequestRow[] {
    return listPendingJoinRequests(this.db, companyId);
  }

  vaAcceptJoinRequest(opts: {
    requestId: string;
    actorAccountId: string;
  }): { member: CareerCompanyMember; companyId: string } {
    return acceptJoinRequest(this.db, opts);
  }

  vaRejectJoinRequest(opts: {
    requestId: string;
    actorAccountId: string;
  }): void {
    rejectJoinRequest(this.db, opts);
  }

  settleWorldCompaniesPassiveFees(opts: {
    world: CareerEconomyWorld;
    fromTick: number;
    toTick: number;
    worldId?: string;
    nowMs?: number;
  }): OfflineFeeSummary | null {
    return settleAllCompaniesPassiveFees({
      db: this.db,
      world: opts.world,
      fromTick: opts.fromTick,
      toTick: opts.toTick,
      worldId: opts.worldId ?? LOCAL_WORLD_ID,
      preferCompanyId: this.activeCompanyId,
      nowMs: opts.nowMs,
    });
  }

  peekEconomyWorld(): CareerEconomyWorld | null {
    return this.ram;
  }

  loadCommandWorldSlice(opts: CommandWorldSliceOpts): CareerEconomyWorld | null {
    const meta = readEconomyMeta(this.db);
    if (!meta) return null;
    const lots = readLotsByIds(this.db, opts.lotIds);
    const icaos = [
      ...new Set([
        ...opts.icaos.map((c) => c.trim().toUpperCase()).filter(Boolean),
        ...lots.flatMap((lot) => [lot.originIcao, lot.destIcao]),
      ]),
    ];
    const airports = readAirportsByIcaos(this.db, icaos);
    if (airports.length === 0) return null;
    const inboundPending = readInboundPendingForMission(this.db, opts.missionId);
    return {
      version: 3,
      seed: meta.seed,
      tick: meta.tick,
      lastBatchAtMs: meta.lastBatchAtMs,
      lastSyncedAtMs: meta.lastBatchAtMs,
      homeCountryId: meta.homeCountryId || undefined,
      airports,
      lots,
      inboundPending,
      events: [],
      npcs: [],
      npcFlights: [],
    };
  }

  async persistCommandWorldSlice(
    world: CareerEconomyWorld,
    opts: PersistCommandWorldSliceOpts,
  ): Promise<void> {
    const icaoSet = new Set(
      opts.icaos.map((c) => c.trim().toUpperCase()).filter(Boolean),
    );
    const lotIdSet = new Set(opts.lotIds.map((id) => id.trim()).filter(Boolean));
    const airports = (world.airports ?? []).filter((ap) =>
      icaoSet.has(String(ap.icao ?? '').trim().toUpperCase()),
    );
    const lots = (world.lots ?? []).filter((lot) => lotIdSet.has(lot.id));
    const remainingLotIds = new Set(lots.map((lot) => lot.id));
    const inbound = (world.inboundPending ?? []).filter(
      (row) => row.missionId === opts.missionId,
    );
    runInTransaction(this.db, () => {
      persistAirportsPatch(this.db, airports, []);
      if (lots.length > 0) upsertLotRows(this.db, lots, airports);
      const del = this.db.prepare(`DELETE FROM lots WHERE id = ?`);
      for (const id of lotIdSet) {
        if (!remainingLotIds.has(id)) del.run(id);
      }
      replaceInboundPendingForMission(this.db, opts.missionId, inbound, airports);
    });
    if (this.ram && this.lastAirportSignatures) {
      for (const ap of airports) {
        const icao = String(ap.icao ?? '').trim().toUpperCase();
        if (icao) this.lastAirportSignatures.set(icao, airportPersistSignature(ap));
      }
    }
    if (this.ram && this.lastLotSignatures) {
      for (const lot of lots) {
        this.lastLotSignatures.set(lot.id, lotPersistSignature(lot));
      }
      for (const id of lotIdSet) {
        if (!remainingLotIds.has(id)) this.lastLotSignatures.delete(id);
      }
      this.lastLotsKey = lotsPersistKey(this.ram);
    }
    if (this.ram && this.lastInboundSignatures) {
      this.lastInboundSignatures = inboundSignatureMap(this.ram);
      this.lastInboundKey = inboundPersistKey(this.ram);
    }
  }

  async persistDemandOrder(order: DemandOrder): Promise<void> {
    upsertDemandOrder(this.db, order);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistPortListing(listing: PortListing): Promise<void> {
    upsertPortListing(this.db, listing);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistPortConcessionIndex(rows: PortConcessionIndexRow[]): Promise<void> {
    replacePortConcessions(this.db, rows);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistPortMarketTables(world: CareerEconomyWorld): Promise<void> {
    replacePortListings(this.db, world.portListings ?? []);
    replacePortInventories(this.db, world.portInventories ?? []);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistDemandBoardTables(world: CareerEconomyWorld): Promise<void> {
    replaceDemandOrders(this.db, world.demandOrders ?? []);
    if (this.ram) this.lastOpsKey = worldOpsPersistKey(this.ram);
  }

  async persistInboundPending(world: CareerEconomyWorld): Promise<void> {
    persistInboundIncremental(
      this.db,
      world.inboundPending ?? [],
      world.airports,
      this.lastInboundSignatures,
    );
    this.lastInboundSignatures = inboundSignatureMap(world);
    this.lastInboundKey = inboundPersistKey(world);
  }

  async persistNpcLiveWorld(world: CareerEconomyWorld): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    ensureHomeCountryId(toSave);
    const blob = stripEconomyPersistBlob(toSave);
    const json = JSON.stringify(blob);
    const now = Date.now();
    const lotsKey = lotsPersistKey(toSave);
    const inboundKey = inboundPersistKey(toSave);
    const prevAirportSignatures = this.lastAirportSignatures;
    const prevLotSignatures = this.lastLotSignatures;
    const prevInboundSignatures = this.lastInboundSignatures;
    runInTransaction(this.db, () => {
      if (json !== this.lastEconomyBlobJson) {
        this.db
          .prepare(
            `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
          )
          .run(json, now);
      }
      if (this.lastLotsKey !== lotsKey) {
        persistLotsIncremental(
          this.db,
          toSave.lots ?? [],
          toSave.airports,
          prevLotSignatures,
        );
      }
      if (this.lastInboundKey !== inboundKey) {
        persistInboundIncremental(
          this.db,
          toSave.inboundPending ?? [],
          toSave.airports,
          prevInboundSignatures,
        );
      }
      replaceNpcFlights(this.db, toSave.npcFlights ?? [], toSave.airports);
      replaceNpcs(this.db, toSave.npcs ?? []);
      persistWorldAirports(this.db, toSave, LOCAL_WORLD_ID, prevAirportSignatures);
      persistAircraftInstancesIncremental(
        this.db,
        toSave.aircraftInstances ?? [],
        this.lastAircraftSignatures,
      );
      stampCompanyWorldId(this.db);
      metaSet(this.db, 'country_id', toSave.homeCountryId ?? 'BR');
      metaSet(this.db, 'economy_tick', String(toSave.tick));
    });
    this.ram = toSave;
    this.rememberPersistedWorld(toSave, json);
  }

  async persistAircraftPool(world: CareerEconomyWorld): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    runInTransaction(this.db, () => {
      persistAircraftInstancesIncremental(
        this.db,
        toSave.aircraftInstances ?? [],
        this.lastAircraftSignatures,
      );
    });
    this.ram = toSave;
    this.lastAircraftSignatures = aircraftInstanceSignatureMap(toSave);
    this.lastAircraftPoolKey = aircraftPoolPersistKey(toSave);
  }

  async claimAircraftInstance(opts: {
    instanceId: string;
    companyId: string;
    worldId?: string;
  }): Promise<'claimed' | 'unavailable'> {
    const result = claimAircraftInstanceInSqlite(this.db, opts);
    if (result === 'claimed' && this.ram?.aircraftInstances) {
      const inst = this.ram.aircraftInstances.find(
        (row) => row.id === opts.instanceId.trim(),
      );
      if (inst) {
        inst.status = 'sold';
        inst.ownerCompanyId = opts.companyId.trim();
      }
      this.lastAircraftSignatures = aircraftInstanceSignatureMap(this.ram);
    }
    return result;
  }

  async releaseAircraftInstanceClaim(opts: {
    instanceId: string;
    companyId: string;
    worldId?: string;
  }): Promise<boolean> {
    const ok = releaseAircraftInstanceClaimInSqlite(this.db, opts);
    if (ok && this.ram?.aircraftInstances) {
      const inst = this.ram.aircraftInstances.find(
        (row) => row.id === opts.instanceId.trim(),
      );
      if (inst) {
        inst.status = 'available';
        delete inst.ownerCompanyId;
      }
      this.lastAircraftSignatures = aircraftInstanceSignatureMap(this.ram);
    }
    return ok;
  }

  readAirportInventory(icao: string): AirportInventorySnapshot | null {
    return readAirportInventory(this.db, icao, LOCAL_WORLD_ID);
  }

  readHubEconomySamples(opts: {
    icao: string;
    sinceDay?: number;
  }): HubEconomySample[] {
    return readHubEconomySamplesFromDb(this.db, opts);
  }

  readHubEconomySamplesSince(opts?: {
    sinceDay?: number;
    untilDay?: number;
  }): HubEconomySample[] {
    return readHubEconomySamplesSinceFromDb(this.db, opts ?? {});
  }

  readAirportBoard(icao: string): AirportBoardSnapshot | null {
    return readAirportBoard(this.db, icao, LOCAL_WORLD_ID);
  }

  hasEconomyRow(): boolean {
    const row = this.db.prepare(`SELECT 1 AS ok FROM economy_json WHERE id = 1`).get() as
      | { ok: number }
      | undefined;
    return Boolean(row);
  }

  markMigratedFromJson(): void {
    metaSet(this.db, 'migrated_from_json', new Date().toISOString());
  }

  async loadEconomy(opts?: { maxCatchUpTicks?: number }): Promise<EconomyLoadResult> {
    if (this.ram && opts?.maxCatchUpTicks === 0) {
      return {
        world: this.ram,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }
    if (this.ram) {
      const world = migrateEconomyWorld(this.ram);
      const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
        world,
        Date.now(),
        catchUpOpts(opts),
      );
      ensureHomeCountryId(caught);
      let dirty = advancedTicks > 0 || settledFlights > 0;
      if (ensureSeedMarketFormed(caught)) dirty = true;
      this.ram = caught;
      return { world: caught, advancedTicks, settledFlights, dirty };
    }

    const row = this.db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as
      | { json: string }
      | undefined;
    if (!row) {
      const fresh = createSeedEconomyWorld();
      ensureSeedMarketFormed(fresh);
      await this.saveEconomy(fresh);
      return { world: fresh, advancedTicks: 0, settledFlights: 0, dirty: false };
    }
    let existing: Record<string, unknown>;
    try {
      existing = JSON.parse(row.json) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `SQLite economy_json is corrupt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const blobForDirty: Record<string, unknown> = {
      version: existing.version,
      homeCountryId: existing.homeCountryId,
      npcs: existing.npcs,
      fuelTrucks: existing.fuelTrucks,
      fuelHauls: existing.fuelHauls,
      demandOrders: existing.demandOrders,
      portListings: existing.portListings,
      portInventories: existing.portInventories,
      portConcessions: existing.portConcessions,
      aircraftInstances: existing.aircraftInstances,
      airports: existing.airports,
      lots: existing.lots,
      inboundPending: existing.inboundPending,
      npcFlights: existing.npcFlights,
      events: existing.events,
      charterDemand: existing.charterDemand,
      charterHubs: existing.charterHubs,
      charterOffers: existing.charterOffers,
    };
    hydrateWorldFromTables(this.db, existing as unknown as CareerEconomyWorld);
    hydrateAirportsFromTables(this.db, existing as unknown as CareerEconomyWorld);
    hydrateWorldOpsFromTables(this.db, existing as unknown as CareerEconomyWorld);
    hydrateAircraftPoolFromTables(this.db, existing as unknown as CareerEconomyWorld);
    hydrateCharterFromTables(this.db, existing as unknown as CareerEconomyWorld);
    overlayEconomyMeta(this.db, existing as unknown as CareerEconomyWorld);
    const tableAirports = countAirportRows(this.db);
    const blobAirports = Array.isArray(existing.airports) ? existing.airports.length : 0;
    if (tableAirports === 0 && blobAirports === 0) {
      throw new Error('SQLite world has no airports (tables or blob); refusing to reseed');
    }
    const beforeIcaos = airportIcaoList(existing as { airports?: Array<{ icao?: string }> });
    const world = migrateEconomyWorld(existing);
    if (opts?.maxCatchUpTicks === 0) {
      ensureHomeCountryId(world);
      this.ram = world;
      const blob = stripEconomyPersistBlob(world);
      this.rememberPersistedWorld(world, JSON.stringify(blob));
      return {
        world,
        advancedTicks: 0,
        settledFlights: 0,
        dirty: false,
      };
    }
    const { world: caught, advancedTicks, settledFlights } = ensureEconomyCaughtUp(
      world,
      Date.now(),
      catchUpOpts(opts),
    );
    ensureHomeCountryId(caught);
    const afterIcaos = airportIcaoList(caught);
    let dirty = economyNeedsRewrite(blobForDirty, caught, advancedTicks, settledFlights);
    if (ensureSeedMarketFormed(caught)) dirty = true;
    if (clHubIdentRemapsForPlayer(beforeIcaos, afterIcaos).length > 0) dirty = true;
    await persistClHubIdentRemaps(this, beforeIcaos, afterIcaos);
    this.ram = caught;
    if (!dirty) {
      const blob = stripEconomyPersistBlob(caught);
      this.rememberPersistedWorld(caught, JSON.stringify(blob));
    }
    return { world: caught, advancedTicks, settledFlights, dirty };
  }

  async saveEconomy(
    world: CareerEconomyWorld,
    opts?: { liveTables?: boolean },
  ): Promise<void> {
    const toSave = migrateEconomyWorld(world);
    toSave.lastBatchAtMs = world.lastBatchAtMs;
    toSave.lastSyncedAtMs = world.lastBatchAtMs;
    // Preserve ephemeral day samples across migrate (also copied in migrate).
    if (
      (!toSave.pendingHubEconomySamples ||
        toSave.pendingHubEconomySamples.length === 0) &&
      world.pendingHubEconomySamples?.length
    ) {
      toSave.pendingHubEconomySamples = world.pendingHubEconomySamples;
    }
    ensureHomeCountryId(toSave);
    const blob = stripEconomyPersistBlob(toSave);
    const json = JSON.stringify(blob);
    const now = Date.now();
    if (opts?.liveTables === false) {
      runInTransaction(this.db, () => {
        if (json !== this.lastEconomyBlobJson) {
          this.db
            .prepare(
              `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
            )
            .run(json, now);
        }
        flushPendingHubEconomySamples(this.db, toSave);
        persistCharterTables(this.db, toSave);
      });
      world.pendingHubEconomySamples = undefined;
      this.ram = toSave;
      this.lastEconomyBlobJson = json;
      return;
    }
    const lotsKey = lotsPersistKey(toSave);
    const inboundKey = inboundPersistKey(toSave);
    const npcKey = npcFlightsPersistKey(toSave);
    const eventsKey = eventsPersistKey(toSave);
    const opsKey = worldOpsPersistKey(toSave);
    const prevAirportSignatures = this.lastAirportSignatures;
    const prevLotSignatures = this.lastLotSignatures;
    const prevInboundSignatures = this.lastInboundSignatures;
    runInTransaction(this.db, () => {
      if (json !== this.lastEconomyBlobJson) {
        this.db
          .prepare(
            `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
          )
          .run(json, now);
      }
      if (this.lastLotsKey !== lotsKey) {
        persistLotsIncremental(
          this.db,
          toSave.lots ?? [],
          toSave.airports,
          prevLotSignatures,
        );
      }
      if (this.lastInboundKey !== inboundKey) {
        persistInboundIncremental(
          this.db,
          toSave.inboundPending ?? [],
          toSave.airports,
          prevInboundSignatures,
        );
      }
      if (this.lastNpcFlightsKey !== npcKey) {
        replaceNpcFlights(this.db, toSave.npcFlights ?? [], toSave.airports);
      }
      if (this.lastEventsKey !== eventsKey) {
        replaceEconomyEvents(this.db, toSave.events ?? []);
      }
      persistWorldAirports(this.db, toSave, LOCAL_WORLD_ID, prevAirportSignatures);
      if (this.lastOpsKey !== opsKey) {
        persistWorldOpsTables(this.db, toSave);
      }
      if (this.lastAircraftPoolKey !== aircraftPoolPersistKey(toSave)) {
        persistAircraftInstancesIncremental(
          this.db,
          toSave.aircraftInstances ?? [],
          this.lastAircraftSignatures,
        );
      }
      persistCharterTables(this.db, toSave);
      flushPendingHubEconomySamples(this.db, toSave);
      stampCompanyWorldId(this.db);
      metaSet(this.db, 'country_id', toSave.homeCountryId ?? 'BR');
      metaSet(this.db, 'economy_tick', String(toSave.tick));
    });
    world.pendingHubEconomySamples = undefined;
    this.ram = toSave;
    this.rememberPersistedWorld(toSave, json);
  }

  private rememberPersistedWorld(world: CareerEconomyWorld, blobJson: string): void {
    this.lastAirportSignatures = airportSignaturesFromList(world.airports);
    this.lastLotSignatures = lotSignatureMap(world);
    this.lastInboundSignatures = inboundSignatureMap(world);
    this.lastLotsKey = lotsPersistKey(world);
    this.lastInboundKey = inboundPersistKey(world);
    this.lastNpcFlightsKey = npcFlightsPersistKey(world);
    this.lastEventsKey = eventsPersistKey(world);
    this.lastOpsKey = worldOpsPersistKey(world);
    this.lastAircraftPoolKey = aircraftPoolPersistKey(world);
    this.lastAircraftSignatures = aircraftInstanceSignatureMap(world);
    this.lastEconomyBlobJson = blobJson;
  }

  async loadMissions(opts?: { companyId?: string }): Promise<CareerMissionsState> {
    const companyId = opts?.companyId?.trim() || this.activeCompanyId || LOCAL_COMPANY_ID;
    const row = this.db.prepare(`SELECT json FROM missions_json WHERE id = 1`).get() as
      | { json: string }
      | undefined;

    let blobNormalized = emptyMissionsStateV2();
    if (row) {
      let existing: Record<string, unknown>;
      try {
        existing = JSON.parse(row.json) as Record<string, unknown>;
      } catch (error) {
        throw new Error(
          `SQLite missions_json is corrupt: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      // After v3 migrate, missions[] may be empty stub — tables are SoT.
      const hasMissionArray = Array.isArray(existing.missions);
      if (!hasMissionArray && !companyTablesPopulated(this.db)) {
        throw new Error('SQLite missions_json has no missions[]; refusing to wipe career');
      }
      blobNormalized = normalizeMissions(
        hasMissionArray ? existing : { ...existing, missions: [] },
      );
    } else if (companyId === LOCAL_COMPANY_ID) {
      // First SP boot — seed local stub + tables.
      const fresh = emptyMissionsStateV2();
      await this.saveMissions(fresh, { companyId });
      return fresh;
    }

    // Legacy missions_json blob is only meaningful for the SP `local` tenant.
    // Non-local companies may exist before any local stub is written.
    const fallback =
      companyId === LOCAL_COMPANY_ID ? blobNormalized : emptyMissionsStateV2();
    const assembled = assembleMissionsFromTables(this.db, fallback, companyId);
    return normalizeMissions(assembled as unknown as Record<string, unknown>);
  }

  async saveMissions(
    state: CareerMissionsState,
    opts?: { companyId?: string },
  ): Promise<void> {
    const companyId = opts?.companyId?.trim() || this.activeCompanyId || LOCAL_COMPANY_ID;
    const normalized = missionsPayloadForBlob(state);
    const ledger = normalized.ledger ?? [];
    normalized.ledger = ledger;
    const persistKey = `${companyId}:${JSON.stringify(normalized)}`;
    if (persistKey === this.lastCompanyPersistKey) {
      return;
    }
    const fleetKey = JSON.stringify(normalized.fleet ?? []);
    const missionsKey = JSON.stringify(normalized.missions ?? []);
    const ledgerKey = JSON.stringify(ledger);
    const companyStateKey = JSON.stringify({
      ...normalized,
      fleet: undefined,
      missions: undefined,
      ledger: undefined,
    });
    const stub = missionsBlobStub(normalized);
    const json = JSON.stringify(stub);
    const stubDirty =
      companyId === LOCAL_COMPANY_ID && json !== this.lastMissionsStubJson;
    const companyStateDirty = companyStateKey !== this.lastCompanyStateKey;
    const fleetDirty = fleetKey !== this.lastFleetPersistKey;
    const missionsDirty = missionsKey !== this.lastMissionsTableKey;
    const ledgerDirty = ledgerKey !== this.lastLedgerPersistKey;
    const now = Date.now();
    runInTransaction(this.db, () => {
      if (companyId === LOCAL_COMPANY_ID) {
        ensureLocalCompany(this.db, {
          displayName: normalized.pilotName || '',
          homeHubIcao: normalized.homeHubIcao || '',
        });
      }
      if (stubDirty) {
        this.db
          .prepare(
            `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at_ms = excluded.updated_at_ms`,
          )
          .run(json, now);
      }
      persistCompanyTables(this.db, normalized, {
        companyId,
        companyState: companyStateDirty,
        fleet: fleetDirty,
        missions: missionsDirty,
        previousFleet: this.lastFleetSignatures,
        previousMissions: this.lastMissionSignatures,
      });
      if (ledgerDirty) persistLedgerIncremental(this.db, ledger, companyId);
    });
    this.lastCompanyPersistKey = persistKey;
    this.lastCompanyStateKey = companyStateKey;
    this.lastFleetPersistKey = fleetKey;
    this.lastMissionsTableKey = missionsKey;
    this.lastLedgerPersistKey = ledgerKey;
    if (companyId === LOCAL_COMPANY_ID) {
      this.lastMissionsStubJson = json;
    }
    if (fleetDirty) {
      this.lastFleetSignatures = fleetSignatureMap(normalized.fleet ?? []);
    }
    if (missionsDirty) {
      this.lastMissionSignatures = missionSignatureMap(normalized.missions ?? []);
    }
  }

  async loadLedger(): Promise<CareerLedgerEntry[]> {
    const fromTable = readLedgerRowsV3(this.db, this.activeCompanyId);
    if (fromTable.length > 0) return fromTable;
    const missions = await this.loadMissions();
    return missions.ledger ?? [];
  }

  async summarizeCashflow(atTick: number) {
    const ledger = await this.loadLedger();
    return summarizeCareerLedger({ ledger }, atTick);
  }

  close(): void {
    this.ram = null;
    this.lastAirportSignatures = null;
    this.lastLotSignatures = null;
    this.lastInboundSignatures = null;
    this.lastLotsKey = null;
    this.lastInboundKey = null;
    this.lastNpcFlightsKey = null;
    this.lastEventsKey = null;
    this.lastOpsKey = null;
    this.lastAircraftPoolKey = null;
    this.lastAircraftSignatures = null;
    this.lastEconomyBlobJson = null;
    this.lastCompanyPersistKey = null;
    this.lastCompanyStateKey = null;
    this.lastFleetPersistKey = null;
    this.lastMissionsTableKey = null;
    this.lastLedgerPersistKey = null;
    this.lastMissionsStubJson = null;
    this.lastFleetSignatures = null;
    this.lastMissionSignatures = null;
    this.db.close();
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Import legacy JSON files into an empty SQLite DB, then rename JSON aside.
 */
async function migrateJsonIntoSqlite(
  store: SqliteCareerStore,
  economyPath: string,
  missionsPath: string,
): Promise<void> {
  const economyRaw = await readJsonFile<Record<string, unknown>>(economyPath);
  if (economyRaw && Array.isArray(economyRaw.airports)) {
    const world = migrateEconomyWorld(economyRaw);
    ensureHomeCountryId(world);
    ensureSeedMarketFormed(world);
    await store.saveEconomy(world);
  } else if (!economyRaw) {
    const fresh = createSeedEconomyWorld();
    ensureSeedMarketFormed(fresh);
    await store.saveEconomy(fresh);
  } else {
    throw new Error(
      `Cannot migrate ${economyPath}: missing airports[]; leaving JSON in place`,
    );
  }

  const missionsRaw = await readJsonFile<Record<string, unknown>>(missionsPath);
  if (missionsRaw && Array.isArray(missionsRaw.missions)) {
    await store.saveMissions(normalizeMissions(missionsRaw));
  } else if (!missionsRaw) {
    await store.saveMissions(emptyMissionsStateV2());
  } else {
    throw new Error(
      `Cannot migrate ${missionsPath}: missing missions[]; leaving JSON in place`,
    );
  }

  store.markMigratedFromJson();
  await renameJsonAside(economyPath, '.migrated.bak');
  await renameJsonAside(missionsPath, '.migrated.bak');
}

/**
 * Open the career store. Default backend is SQLite under `careerDir/skyline.sqlite`,
 * with one-shot import from local-economy.json / local-missions.json when present.
 * Pass `backend: 'postgres'` + `connectionString` (or CAREER_DATABASE_URL / CAREER_PG=1)
 * for the hosted MP world.
 */
export async function openCareerStore(opts: OpenCareerStoreOpts): Promise<CareerStore> {
  const careerDir = opts.careerDir;
  await mkdir(careerDir, { recursive: true });
  const economyPath = join(careerDir, opts.economyFileName ?? 'local-economy.json');
  const missionsPath = join(careerDir, opts.missionsFileName ?? 'local-missions.json');
  const sqlitePath = join(careerDir, opts.sqliteFileName ?? 'skyline.sqlite');

  const envBackend = process.env.CAREER_STORE?.trim().toLowerCase();
  const pgUrl = opts.connectionString?.trim() || careerDatabaseUrlFromEnv();
  const backend: CareerStoreKind | 'auto' =
    opts.backend ??
    (envBackend === 'json' ||
    envBackend === 'sqlite' ||
    envBackend === 'postgres'
      ? (envBackend as CareerStoreKind)
      : 'auto');

  // Only load `pg` when opening Postgres — desktop packs omit that dependency.
  if (
    backend === 'postgres' ||
    (backend === 'auto' && Boolean(opts.connectionString?.trim()))
  ) {
    const url = opts.connectionString?.trim() || pgUrl;
    if (!url) {
      throw new Error(
        'Postgres career store requires connectionString or CAREER_DATABASE_URL',
      );
    }
    const { openPostgresCareerStore } = await import('./career-store-postgres.js');
    return openPostgresCareerStore(url);
  }

  if (backend === 'json') {
    return new JsonCareerStore(economyPath, missionsPath);
  }

  const sqliteExists = await pathExists(sqlitePath);
  const store = new SqliteCareerStore(sqlitePath);

  if (!sqliteExists) {
    const hasEconomyJson = await pathExists(economyPath);
    const hasMissionsJson = await pathExists(missionsPath);
    if (hasEconomyJson || hasMissionsJson) {
      await migrateJsonIntoSqlite(store, economyPath, missionsPath);
    }
  } else {
    // DB exists but economy row missing and JSON still around → import once.
    if (!store.hasEconomyRow() && (await pathExists(economyPath))) {
      await migrateJsonIntoSqlite(store, economyPath, missionsPath);
    }
  }

  return store;
}

export function createJsonCareerStore(opts: {
  economyPath: string;
  missionsPath: string;
}): CareerStore {
  return new JsonCareerStore(opts.economyPath, opts.missionsPath);
}

/** @internal test helper */
export { countLotsRows, countAirportRows };
