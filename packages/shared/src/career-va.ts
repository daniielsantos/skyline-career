/**
 * VA (virtual airline) — invites, roster, Internal Haul board helpers, ranking.
 * IH-2: multi-pilot without chat / company crew.
 */

import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { countryIdForHubIcao } from './career-aircraft-registration.js';
import {
  addCompanyMember,
  countCompanyMembers,
  listMembershipsForAccount,
  type CareerAccountRole,
  type CareerCompanyMember,
} from './career-auth.js';
import { ensureV12Ddl } from './career-store-v12.js';
import { ensureV13Ddl } from './career-store-v13.js';
import { ensureV14Ddl } from './career-store-v14.js';
import { ensureV15Ddl } from './career-store-v15.js';
import type {
  CareerMissionsState,
  MissionIntent,
  PlayerDemandHold,
} from './types/career-economy.js';
import { listDemandHolds } from './career-demand.js';

type SqliteDb = DatabaseSync;

/** Soft seat cap (billing expansion later). */
export const VA_MEMBER_CAP = 8;
/**
 * Invites do not time-expire. One active code per company; renewing
 * revokes the previous. `expires_at_ms` stays in schema for revoke/unlist.
 * @deprecated Prefer {@link VA_INVITE_NEVER_EXPIRES_MS}; kept for callers.
 */
export const VA_INVITE_TTL_MS = 0;
/** Far-future marker written as expires_at_ms for active invites. */
export const VA_INVITE_NEVER_EXPIRES_MS = Number.MAX_SAFE_INTEGER;
/**
 * Soft use counter ceiling — roster {@link VA_MEMBER_CAP} is the real gate.
 * High enough that reuse after leave/kick does not exhaust the code.
 */
export const VA_INVITE_DEFAULT_MAX_USES = 1_000_000;
/** Ranking rolling window (calendar days). */
export const VA_RANKING_WINDOW_DAYS = 7;

/** Flight-quality rolling window (same as ranking). */
export const VA_FLIGHT_QUALITY_WINDOW_DAYS = VA_RANKING_WINDOW_DAYS;

/** Min settles in window before composite qualityScore is published. */
export const VA_FLIGHT_QUALITY_MIN_FLIGHTS = 3;

/** Weight of mean flight score vs on-time % in qualityScore. */
export const VA_FLIGHT_QUALITY_SCORE_WEIGHT = 0.7;
export const VA_FLIGHT_QUALITY_ONTIME_WEIGHT = 0.3;

/** Pilot share of Freights/Demand/Charter route net (payout − fuel). */
export const VA_MEMBER_ROUTE_CUT_DEFAULT_PCT = 30;
export const VA_MEMBER_ROUTE_CUT_MIN_PCT = 10;
export const VA_MEMBER_ROUTE_CUT_MAX_PCT = 50;

export function clampMemberRouteCutPct(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return VA_MEMBER_ROUTE_CUT_DEFAULT_PCT;
  return Math.max(
    VA_MEMBER_ROUTE_CUT_MIN_PCT,
    Math.min(VA_MEMBER_ROUTE_CUT_MAX_PCT, Math.round(n)),
  );
}

/** One listed VA membership per account (join / request gate). */
export const VA_ALREADY_IN_VA_MSG =
  'Already in a VA — leave it (or unlist if you own it) before joining another';

export function findAccountListedVaMembership(
  db: SqliteDb,
  accountId: string,
): { companyId: string; role: CareerAccountRole } | null {
  ensureV13Ddl(db);
  const row = db
    .prepare(
      `SELECT m.company_id, m.role
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.account_id = ? AND IFNULL(c.va_listed, 0) != 0
       ORDER BY m.created_at_ms ASC
       LIMIT 1`,
    )
    .get(accountId) as { company_id: string; role: string } | undefined;
  if (!row) return null;
  return {
    companyId: row.company_id,
    role: normalizeRole(row.role),
  };
}

/**
 * Block joining / requesting a different listed VA while already a member
 * of any `va_listed` company (including owning your own published VA).
 */
export function assertAccountCanJoinVa(
  db: SqliteDb,
  accountId: string,
  targetCompanyId: string,
): void {
  const current = findAccountListedVaMembership(db, accountId);
  if (!current) return;
  if (current.companyId === targetCompanyId.trim()) return;
  throw new Error(VA_ALREADY_IN_VA_MSG);
}

export function quoteMemberRouteCutUsd(
  payoutUsd: number,
  fuelDebitUsd: number,
  cutPct: number,
): number {
  const routeNet = Math.max(0, payoutUsd - Math.max(0, fuelDebitUsd));
  const pct = clampMemberRouteCutPct(cutPct);
  if (routeNet <= 0 || pct <= 0) return 0;
  return Math.round((routeNet * pct) / 100);
}

export type CareerCompanyInvite = {
  code: string;
  companyId: string;
  createdByAccountId: string;
  role: CareerAccountRole;
  createdAtMs: number;
  expiresAtMs: number;
  maxUses: number;
  uses: number;
};

export type VaMemberRow = CareerCompanyMember & {
  loginName: string;
  displayName: string;
};

export type VaFlightQualitySnapshot = {
  windowDays: number;
  flightCount: number;
  avgFlightScorePct: number | null;
  onTimePct: number | null;
  /** 0–100 composite, or null when sample below floor. */
  qualityScore: number | null;
};

export type VaCompanyRankRow = {
  companyId: string;
  displayName: string;
  hauls: number;
  nm: number;
  payUsd: number;
  flightQuality?: VaFlightQualitySnapshot | null;
};

export function summarizeVaFlightQuality(opts: {
  flightCount: number;
  scoreSum: number;
  onTimeCount: number;
  windowDays?: number;
}): VaFlightQualitySnapshot {
  const windowDays = opts.windowDays ?? VA_FLIGHT_QUALITY_WINDOW_DAYS;
  const flightCount = Math.max(0, Math.floor(opts.flightCount));
  if (flightCount <= 0) {
    return {
      windowDays,
      flightCount: 0,
      avgFlightScorePct: null,
      onTimePct: null,
      qualityScore: null,
    };
  }
  const avgFlightScorePct =
    Math.round((opts.scoreSum / flightCount) * 10) / 10;
  const onTimePct =
    Math.round(((100 * opts.onTimeCount) / flightCount) * 10) / 10;
  const qualityScore =
    flightCount >= VA_FLIGHT_QUALITY_MIN_FLIGHTS
      ? Math.round(
          (VA_FLIGHT_QUALITY_SCORE_WEIGHT * avgFlightScorePct +
            VA_FLIGHT_QUALITY_ONTIME_WEIGHT * onTimePct) *
            10,
        ) / 10
      : null;
  return {
    windowDays,
    flightCount,
    avgFlightScorePct,
    onTimePct,
    qualityScore,
  };
}

export function recordCompanyFlightQuality(
  db: SqliteDb,
  opts: {
    companyId: string;
    dayKey: number;
    scorePct: number;
    onTime: boolean;
  },
): void {
  ensureV15Ddl(db);
  const score = Math.max(0, Math.min(100, opts.scorePct));
  const onTime = opts.onTime ? 1 : 0;
  db.prepare(
    `INSERT INTO company_flight_quality_stats
       (company_id, day_key, flights, score_sum, on_time)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(company_id, day_key) DO UPDATE SET
       flights = flights + 1,
       score_sum = score_sum + excluded.score_sum,
       on_time = on_time + excluded.on_time`,
  ).run(opts.companyId, opts.dayKey, score, onTime);
}

export function getCompanyFlightQuality(
  db: SqliteDb,
  opts: { companyId: string; fromDayKey: number; toDayKey: number },
): VaFlightQualitySnapshot {
  ensureV15Ddl(db);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(flights), 0) AS flights,
              COALESCE(SUM(score_sum), 0) AS score_sum,
              COALESCE(SUM(on_time), 0) AS on_time
       FROM company_flight_quality_stats
       WHERE company_id = ? AND day_key >= ? AND day_key <= ?`,
    )
    .get(opts.companyId, opts.fromDayKey, opts.toDayKey) as {
    flights: number;
    score_sum: number;
    on_time: number;
  };
  return summarizeVaFlightQuality({
    flightCount: Number(row.flights) || 0,
    scoreSum: Number(row.score_sum) || 0,
    onTimeCount: Number(row.on_time) || 0,
    windowDays: Math.max(1, opts.toDayKey - opts.fromDayKey + 1),
  });
}

/** Batch flight-quality for many companies (directory / ranking). */
export function mapCompanyFlightQuality(
  db: SqliteDb,
  opts: { companyIds: string[]; fromDayKey: number; toDayKey: number },
): Map<string, VaFlightQualitySnapshot> {
  ensureV15Ddl(db);
  const out = new Map<string, VaFlightQualitySnapshot>();
  const ids = opts.companyIds.filter((id) => id.trim());
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT company_id,
              COALESCE(SUM(flights), 0) AS flights,
              COALESCE(SUM(score_sum), 0) AS score_sum,
              COALESCE(SUM(on_time), 0) AS on_time
       FROM company_flight_quality_stats
       WHERE company_id IN (${placeholders})
         AND day_key >= ? AND day_key <= ?
       GROUP BY company_id`,
    )
    .all(...ids, opts.fromDayKey, opts.toDayKey) as Array<{
    company_id: string;
    flights: number;
    score_sum: number;
    on_time: number;
  }>;
  const windowDays = Math.max(1, opts.toDayKey - opts.fromDayKey + 1);
  for (const id of ids) {
    out.set(
      id,
      summarizeVaFlightQuality({
        flightCount: 0,
        scoreSum: 0,
        onTimeCount: 0,
        windowDays,
      }),
    );
  }
  for (const row of rows) {
    out.set(
      row.company_id,
      summarizeVaFlightQuality({
        flightCount: Number(row.flights) || 0,
        scoreSum: Number(row.score_sum) || 0,
        onTimeCount: Number(row.on_time) || 0,
        windowDays,
      }),
    );
  }
  return out;
}

export type VaPilotRankRow = {
  accountId: string;
  loginName: string;
  displayName: string;
  hauls: number;
  nm: number;
  payUsd: number;
};

function normalizeRole(role: string | undefined): CareerAccountRole {
  if (role === 'dispatcher' || role === 'pilot' || role === 'owner') return role;
  return 'pilot';
}

function mintInviteCode(): string {
  return `VA-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Economy day key from tick (TICKS_PER_DAY = 96). */
export function vaDayKeyFromTick(tick: number): number {
  return Math.floor(Math.max(0, tick) / 96);
}

export function getCompanyMembership(
  db: SqliteDb,
  accountId: string,
  companyId: string,
): CareerCompanyMember | null {
  ensureV12Ddl(db);
  const row = db
    .prepare(
      `SELECT company_id, account_id, role, created_at_ms
       FROM company_members
       WHERE account_id = ? AND company_id = ?`,
    )
    .get(accountId, companyId) as
    | {
        company_id: string;
        account_id: string;
        role: string;
        created_at_ms: number;
      }
    | undefined;
  if (!row) return null;
  return {
    companyId: row.company_id,
    accountId: row.account_id,
    role: normalizeRole(row.role),
    createdAtMs: row.created_at_ms,
  };
}

export function listMembersForCompany(
  db: SqliteDb,
  companyId: string,
): VaMemberRow[] {
  ensureV12Ddl(db);
  const rows = db
    .prepare(
      `SELECT m.company_id, m.account_id, m.role, m.created_at_ms,
              a.login_name, a.display_name
       FROM company_members m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.company_id = ?
       ORDER BY
         CASE m.role WHEN 'owner' THEN 0 WHEN 'dispatcher' THEN 1 ELSE 2 END,
         m.created_at_ms ASC`,
    )
    .all(companyId) as Array<{
    company_id: string;
    account_id: string;
    role: string;
    created_at_ms: number;
    login_name: string;
    display_name: string;
  }>;
  return rows.map((row) => ({
    companyId: row.company_id,
    accountId: row.account_id,
    role: normalizeRole(row.role),
    createdAtMs: row.created_at_ms,
    loginName: row.login_name,
    displayName: row.display_name,
  }));
}

export function canManageVaRoster(role: CareerAccountRole): boolean {
  return role === 'owner' || role === 'dispatcher';
}

export function canCreateVaInvite(role: CareerAccountRole): boolean {
  return role === 'owner' || role === 'dispatcher';
}

/**
 * Home company for Internal Haul pilot pay: prefer owner membership
 * (register creates co_<login>), else first membership.
 */
export function homeCompanyIdForAccount(
  db: SqliteDb,
  accountId: string,
): string | null {
  const memberships = listMembershipsForAccount(db, accountId);
  const asOwner = memberships.find((m) => m.role === 'owner');
  if (asOwner) return asOwner.companyId;
  return memberships[0]?.companyId ?? null;
}

export function createCompanyInvite(
  db: SqliteDb,
  opts: {
    companyId: string;
    createdByAccountId: string;
    role?: CareerAccountRole;
    maxUses?: number;
    /** Optional timed expiry; omit for never-expires (default). */
    ttlMs?: number;
    nowMs?: number;
  },
): CareerCompanyInvite {
  ensureV12Ddl(db);
  const membership = getCompanyMembership(
    db,
    opts.createdByAccountId,
    opts.companyId,
  );
  if (!membership || !canCreateVaInvite(membership.role)) {
    throw new Error('Only owner or dispatcher can create invites');
  }
  const role = normalizeRole(opts.role ?? 'pilot');
  if (role === 'owner') throw new Error('Cannot invite as owner');
  const now = opts.nowMs ?? Date.now();
  const maxUses = Math.max(
    1,
    Math.min(
      VA_INVITE_DEFAULT_MAX_USES,
      Math.floor(opts.maxUses ?? VA_INVITE_DEFAULT_MAX_USES),
    ),
  );
  const expiresAtMs =
    opts.ttlMs != null && opts.ttlMs > 0
      ? now + opts.ttlMs
      : VA_INVITE_NEVER_EXPIRES_MS;
  // One active code: revoke any still-open invites for this company.
  db.prepare(
    `UPDATE company_invites
     SET expires_at_ms = ?
     WHERE company_id = ? AND expires_at_ms > ?`,
  ).run(now, opts.companyId, now);
  let code = mintInviteCode();
  for (let i = 0; i < 5; i++) {
    const existing = db
      .prepare(`SELECT 1 AS ok FROM company_invites WHERE code = ?`)
      .get(code) as { ok: number } | undefined;
    if (!existing) break;
    code = mintInviteCode();
  }
  db.prepare(
    `INSERT INTO company_invites
       (code, company_id, created_by_account_id, role, created_at_ms, expires_at_ms, max_uses, uses)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    code,
    opts.companyId,
    opts.createdByAccountId,
    role,
    now,
    expiresAtMs,
    maxUses,
  );
  return {
    code,
    companyId: opts.companyId,
    createdByAccountId: opts.createdByAccountId,
    role,
    createdAtMs: now,
    expiresAtMs,
    maxUses,
    uses: 0,
  };
}

export function listOpenCompanyInvites(
  db: SqliteDb,
  companyId: string,
  nowMs = Date.now(),
): CareerCompanyInvite[] {
  ensureV12Ddl(db);
  const rows = db
    .prepare(
      `SELECT code, company_id, created_by_account_id, role, created_at_ms,
              expires_at_ms, max_uses, uses
       FROM company_invites
       WHERE company_id = ? AND expires_at_ms > ? AND uses < max_uses
       ORDER BY created_at_ms DESC`,
    )
    .all(companyId, nowMs) as Array<{
    code: string;
    company_id: string;
    created_by_account_id: string;
    role: string;
    created_at_ms: number;
    expires_at_ms: number;
    max_uses: number;
    uses: number;
  }>;
  return rows.map((row) => ({
    code: row.code,
    companyId: row.company_id,
    createdByAccountId: row.created_by_account_id,
    role: normalizeRole(row.role),
    createdAtMs: row.created_at_ms,
    expiresAtMs: row.expires_at_ms,
    maxUses: row.max_uses,
    uses: row.uses,
  }));
}

export function joinCompanyWithInvite(
  db: SqliteDb,
  opts: { code: string; accountId: string; nowMs?: number },
): { member: CareerCompanyMember; companyId: string } {
  ensureV12Ddl(db);
  const code = opts.code.trim().toUpperCase();
  const now = opts.nowMs ?? Date.now();
  const row = db
    .prepare(
      `SELECT code, company_id, created_by_account_id, role, created_at_ms,
              expires_at_ms, max_uses, uses
       FROM company_invites WHERE code = ?`,
    )
    .get(code) as
    | {
        code: string;
        company_id: string;
        created_by_account_id: string;
        role: string;
        created_at_ms: number;
        expires_at_ms: number;
        max_uses: number;
        uses: number;
      }
    | undefined;
  if (!row) throw new Error('Invite code not found');
  if (row.expires_at_ms <= now) throw new Error('Invite code expired');
  if (row.uses >= row.max_uses) throw new Error('Invite code exhausted');
  if (getCompanyMembership(db, opts.accountId, row.company_id)) {
    throw new Error('Already a member of this company');
  }
  assertAccountCanJoinVa(db, opts.accountId, row.company_id);
  const count = countCompanyMembers(db, row.company_id);
  if (count >= VA_MEMBER_CAP) {
    throw new Error(`Company is full (max ${VA_MEMBER_CAP} members)`);
  }
  const role = normalizeRole(row.role);
  const member = addCompanyMember(db, {
    companyId: row.company_id,
    accountId: opts.accountId,
    role: role === 'owner' ? 'pilot' : role,
    nowMs: now,
  });
  db.prepare(
    `UPDATE company_invites SET uses = uses + 1 WHERE code = ?`,
  ).run(code);
  return { member, companyId: row.company_id };
}

export function leaveCompany(
  db: SqliteDb,
  opts: { companyId: string; accountId: string },
): void {
  ensureV12Ddl(db);
  const membership = getCompanyMembership(db, opts.accountId, opts.companyId);
  if (!membership) throw new Error('Not a member of this company');
  if (membership.role === 'owner') {
    throw new Error('Owner cannot leave — transfer ownership first (not yet)');
  }
  db.prepare(
    `DELETE FROM company_members WHERE company_id = ? AND account_id = ?`,
  ).run(opts.companyId, opts.accountId);
}

export function kickCompanyMember(
  db: SqliteDb,
  opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
  },
): void {
  ensureV12Ddl(db);
  const actor = getCompanyMembership(db, opts.actorAccountId, opts.companyId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Only owner can kick members');
  }
  if (opts.targetAccountId === opts.actorAccountId) {
    throw new Error('Cannot kick yourself');
  }
  const target = getCompanyMembership(db, opts.targetAccountId, opts.companyId);
  if (!target) throw new Error('Member not found');
  if (target.role === 'owner') throw new Error('Cannot kick another owner');
  db.prepare(
    `DELETE FROM company_members WHERE company_id = ? AND account_id = ?`,
  ).run(opts.companyId, opts.targetAccountId);
}

export function setCompanyMemberRole(
  db: SqliteDb,
  opts: {
    companyId: string;
    actorAccountId: string;
    targetAccountId: string;
    role: CareerAccountRole;
  },
): CareerCompanyMember {
  ensureV12Ddl(db);
  const actor = getCompanyMembership(db, opts.actorAccountId, opts.companyId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Only owner can change roles');
  }
  const role = normalizeRole(opts.role);
  if (role === 'owner') throw new Error('Cannot promote to owner this way');
  const target = getCompanyMembership(db, opts.targetAccountId, opts.companyId);
  if (!target) throw new Error('Member not found');
  if (target.role === 'owner') throw new Error('Cannot demote owner');
  return addCompanyMember(db, {
    companyId: opts.companyId,
    accountId: opts.targetAccountId,
    role,
  });
}

/** Open Internal Haul board: paid bridge holds still waiting for a pilot. */
export function listOpenInternalHaulHolds(
  state: CareerMissionsState,
): PlayerDemandHold[] {
  return listDemandHolds(state).filter(
    (h) =>
      (h.kind ?? 'demand') === 'bridge' &&
      (h.pilotPayUsd ?? 0) > 0 &&
      Boolean(h.destWarehouseId),
  );
}

/** Active Internal Haul missions for the VA desk. */
export function listInternalHaulMissions(
  state: CareerMissionsState,
): MissionIntent[] {
  return (state.missions ?? []).filter(
    (m) =>
      m.warehouseBridge === true &&
      m.internalHaul === true &&
      m.status !== 'settled' &&
      m.status !== 'cancelled',
  );
}

export function recordInternalHaulStats(
  db: SqliteDb,
  opts: {
    companyId: string;
    accountId?: string | null;
    dayKey: number;
    nm: number;
    payUsd: number;
  },
): void {
  ensureV12Ddl(db);
  const nm = Math.max(0, opts.nm);
  const pay = Math.max(0, opts.payUsd);
  db.prepare(
    `INSERT INTO company_haul_stats (company_id, day_key, hauls, nm, pay_usd)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(company_id, day_key) DO UPDATE SET
       hauls = hauls + 1,
       nm = nm + excluded.nm,
       pay_usd = pay_usd + excluded.pay_usd`,
  ).run(opts.companyId, opts.dayKey, nm, pay);
  if (opts.accountId?.trim()) {
    db.prepare(
      `INSERT INTO company_pilot_haul_stats
         (company_id, account_id, day_key, hauls, nm, pay_usd)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(company_id, account_id, day_key) DO UPDATE SET
         hauls = hauls + 1,
         nm = nm + excluded.nm,
         pay_usd = pay_usd + excluded.pay_usd`,
    ).run(opts.companyId, opts.accountId.trim(), opts.dayKey, nm, pay);
  }
}

export function listCompanyHaulRanking(
  db: SqliteDb,
  opts: { fromDayKey: number; toDayKey: number; limit?: number },
): VaCompanyRankRow[] {
  ensureV12Ddl(db);
  const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
  const rows = db
    .prepare(
      `SELECT s.company_id, c.display_name,
              SUM(s.hauls) AS hauls, SUM(s.nm) AS nm, SUM(s.pay_usd) AS pay_usd
       FROM company_haul_stats s
       JOIN companies c ON c.id = s.company_id
       WHERE s.day_key >= ? AND s.day_key <= ?
       GROUP BY s.company_id
       ORDER BY nm DESC, hauls DESC
       LIMIT ?`,
    )
    .all(opts.fromDayKey, opts.toDayKey, limit) as Array<{
    company_id: string;
    display_name: string;
    hauls: number;
    nm: number;
    pay_usd: number;
  }>;
  const quality = mapCompanyFlightQuality(db, {
    companyIds: rows.map((r) => r.company_id),
    fromDayKey: opts.fromDayKey,
    toDayKey: opts.toDayKey,
  });
  return rows.map((row) => ({
    companyId: row.company_id,
    displayName: row.display_name || row.company_id,
    hauls: Number(row.hauls) || 0,
    nm: Math.round(Number(row.nm) || 0),
    payUsd: Math.round((Number(row.pay_usd) || 0) * 100) / 100,
    flightQuality: quality.get(row.company_id) ?? null,
  }));
}

export function listPilotHaulRankingForCompany(
  db: SqliteDb,
  opts: {
    companyId: string;
    fromDayKey: number;
    toDayKey: number;
    limit?: number;
  },
): VaPilotRankRow[] {
  ensureV12Ddl(db);
  const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
  const rows = db
    .prepare(
      `SELECT s.account_id, a.login_name, a.display_name,
              SUM(s.hauls) AS hauls, SUM(s.nm) AS nm, SUM(s.pay_usd) AS pay_usd
       FROM company_pilot_haul_stats s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.company_id = ? AND s.day_key >= ? AND s.day_key <= ?
       GROUP BY s.account_id
       ORDER BY nm DESC, hauls DESC
       LIMIT ?`,
    )
    .all(opts.companyId, opts.fromDayKey, opts.toDayKey, limit) as Array<{
    account_id: string;
    login_name: string;
    display_name: string;
    hauls: number;
    nm: number;
    pay_usd: number;
  }>;
  return rows.map((row) => ({
    accountId: row.account_id,
    loginName: row.login_name,
    displayName: row.display_name,
    hauls: Number(row.hauls) || 0,
    nm: Math.round(Number(row.nm) || 0),
    payUsd: Math.round((Number(row.pay_usd) || 0) * 100) / 100,
  }));
}

export type VaDirectoryEntry = {
  companyId: string;
  displayName: string;
  homeHubIcao: string;
  memberCount: number;
  memberCap: number;
  aircraftCount: number;
  recruiting: boolean;
  listed: boolean;
  /** % of Freights/Demand/Charter route net paid to the flying member. */
  memberRouteCutPct: number;
  seatsOpen: number;
  /** Settle flight-quality rolling window (null qualityScore until sample floor). */
  flightQuality?: VaFlightQualitySnapshot | null;
  /** Pending request from the viewing account, if any. */
  myRequestStatus?: 'pending' | 'accepted' | 'rejected' | null;
  /** Roster role when the viewer is already a member of this VA. */
  myRole?: CareerAccountRole | null;
};

export type VaJoinRequestRow = {
  id: string;
  companyId: string;
  accountId: string;
  loginName: string;
  displayName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAtMs: number;
  decidedAtMs: number | null;
};

function mintJoinRequestId(): string {
  return `jr_${randomBytes(8).toString('hex')}`;
}

export function getCompanyMemberRouteCutPct(
  db: SqliteDb,
  companyId: string,
): number {
  ensureV14Ddl(db);
  const row = db
    .prepare(`SELECT member_route_cut_pct FROM companies WHERE id = ?`)
    .get(companyId) as { member_route_cut_pct: number } | undefined;
  if (!row) return VA_MEMBER_ROUTE_CUT_DEFAULT_PCT;
  return clampMemberRouteCutPct(row.member_route_cut_pct);
}

export function setCompanyMemberRouteCutPct(
  db: SqliteDb,
  opts: {
    companyId: string;
    actorAccountId: string;
    memberRouteCutPct: number;
  },
): number {
  ensureV14Ddl(db);
  const actor = getCompanyMembership(db, opts.actorAccountId, opts.companyId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Only owner can change member route cut');
  }
  const pct = clampMemberRouteCutPct(opts.memberRouteCutPct);
  db.prepare(`UPDATE companies SET member_route_cut_pct = ? WHERE id = ?`).run(
    pct,
    opts.companyId,
  );
  return pct;
}

export function isCompanyRecruiting(db: SqliteDb, companyId: string): boolean {
  ensureV12Ddl(db);
  const row = db
    .prepare(`SELECT recruiting FROM companies WHERE id = ?`)
    .get(companyId) as { recruiting: number } | undefined;
  if (!row) return false;
  return Number(row.recruiting) !== 0;
}

export function setCompanyRecruiting(
  db: SqliteDb,
  opts: { companyId: string; actorAccountId: string; recruiting: boolean },
): boolean {
  ensureV12Ddl(db);
  const actor = getCompanyMembership(db, opts.actorAccountId, opts.companyId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Only owner can change recruiting');
  }
  const value = opts.recruiting ? 1 : 0;
  db.prepare(`UPDATE companies SET recruiting = ? WHERE id = ?`).run(
    value,
    opts.companyId,
  );
  return opts.recruiting;
}

export type VaPublishResult = {
  companyId: string;
  displayName: string;
  homeHubIcao: string;
  homeCountryId: string;
  recruiting: boolean;
  listed: boolean;
  memberRouteCutPct: number;
};

/**
 * Fill empty `companies.home_country_id` from `home_hub_icao` (ICAO prefix map).
 * Idempotent — skips rows that already have a country.
 */
export function backfillCompanyHomeCountryIds(db: SqliteDb): number {
  ensureV13Ddl(db);
  const rows = db
    .prepare(
      `SELECT id, home_hub_icao, home_country_id FROM companies`,
    )
    .all() as Array<{
    id: string;
    home_hub_icao: string | null;
    home_country_id: string | null;
  }>;
  const upd = db.prepare(
    `UPDATE companies SET home_country_id = ? WHERE id = ?`,
  );
  let n = 0;
  for (const row of rows) {
    if ((row.home_country_id ?? '').trim()) continue;
    const hub = (row.home_hub_icao ?? '').trim().toUpperCase();
    if (!hub) continue;
    const country = countryIdForHubIcao(hub).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) continue;
    upd.run(country, row.id);
    n += 1;
  }
  return n;
}

/**
 * Owner turns the existing company into a listed VA (no second tenant).
 * Sets display name + home hub, marks va_listed, opens recruiting by default.
 */
export function publishCompanyAsVa(
  db: SqliteDb,
  opts: {
    companyId: string;
    actorAccountId: string;
    displayName: string;
    homeHubIcao: string;
    recruiting?: boolean;
    memberRouteCutPct?: number;
  },
): VaPublishResult {
  ensureV14Ddl(db);
  const companyId = opts.companyId.trim();
  if (!companyId) throw new Error('companyId required');
  const actor = getCompanyMembership(db, opts.actorAccountId, companyId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Only owner can publish this company as a VA');
  }
  const exists = db
    .prepare(`SELECT id FROM companies WHERE id = ?`)
    .get(companyId) as { id: string } | undefined;
  if (!exists) throw new Error('Unknown company');
  const displayName = opts.displayName.trim();
  if (!displayName) throw new Error('displayName required');
  if (displayName.length > 64) throw new Error('displayName too long');
  const homeHubIcao = opts.homeHubIcao.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(homeHubIcao)) {
    throw new Error('homeHubIcao must be a 3–4 letter ICAO');
  }
  const homeCountryId = countryIdForHubIcao(homeHubIcao).trim().toUpperCase();
  const recruiting = opts.recruiting !== false;
  const memberRouteCutPct = clampMemberRouteCutPct(
    opts.memberRouteCutPct ?? VA_MEMBER_ROUTE_CUT_DEFAULT_PCT,
  );
  db.prepare(
    `UPDATE companies SET display_name = ?, home_hub_icao = ?, home_country_id = ?, recruiting = ?, va_listed = 1, member_route_cut_pct = ? WHERE id = ?`,
  ).run(
    displayName,
    homeHubIcao,
    homeCountryId,
    recruiting ? 1 : 0,
    memberRouteCutPct,
    companyId,
  );
  return {
    companyId,
    displayName,
    homeHubIcao,
    homeCountryId,
    recruiting,
    listed: true,
    memberRouteCutPct,
  };
}

/**
 * Owner unlists the company as a VA. Wallet/fleet/owner stay.
 * Non-owner roster members are removed; pending requests rejected; invites expired.
 */
export function unpublishCompanyAsVa(
  db: SqliteDb,
  opts: {
    companyId: string;
    actorAccountId: string;
    nowMs?: number;
  },
): { companyId: string; listed: false; removedMembers: number } {
  ensureV13Ddl(db);
  const companyId = opts.companyId.trim();
  if (!companyId) throw new Error('companyId required');
  const actor = getCompanyMembership(db, opts.actorAccountId, companyId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Only owner can unlist this VA');
  }
  if (!isCompanyVaListed(db, companyId)) {
    throw new Error('Company is not listed as a VA');
  }
  const now = opts.nowMs ?? Date.now();
  db.prepare(
    `UPDATE company_join_requests
     SET status = 'rejected', decided_at_ms = ?, decided_by_account_id = ?
     WHERE company_id = ? AND status = 'pending'`,
  ).run(now, opts.actorAccountId, companyId);
  db.prepare(
    `UPDATE company_invites
     SET expires_at_ms = ?
     WHERE company_id = ? AND expires_at_ms > ?`,
  ).run(now, companyId, now);
  const removed = db
    .prepare(
      `DELETE FROM company_members
       WHERE company_id = ? AND role != 'owner'`,
    )
    .run(companyId);
  db.prepare(
    `UPDATE companies SET va_listed = 0, recruiting = 0 WHERE id = ?`,
  ).run(companyId);
  return {
    companyId,
    listed: false,
    removedMembers: Number(removed.changes ?? 0),
  };
}

export function isCompanyVaListed(db: SqliteDb, companyId: string): boolean {
  ensureV13Ddl(db);
  const row = db
    .prepare(`SELECT va_listed FROM companies WHERE id = ?`)
    .get(companyId) as { va_listed: number } | undefined;
  if (!row) return false;
  return Number(row.va_listed) !== 0;
}

export function listVaDirectory(
  db: SqliteDb,
  opts: {
    worldId?: string;
    accountId?: string;
    /** When true, include closed (not recruiting) listed VAs as read-only. */
    includeClosed?: boolean;
    limit?: number;
    /** Economy day window for flightQuality (defaults to last 7 keys ending at toDayKey). */
    fromDayKey?: number;
    toDayKey?: number;
  } = {},
): VaDirectoryEntry[] {
  ensureV14Ddl(db);
  const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
  const includeClosed = opts.includeClosed === true;
  const worldId = opts.worldId?.trim() || null;
  const rows = db
    .prepare(
      `SELECT c.id, c.display_name, c.home_hub_icao, c.recruiting, c.va_listed,
              c.member_route_cut_pct,
              (SELECT COUNT(*) FROM company_members m WHERE m.company_id = c.id) AS member_count,
              (SELECT COUNT(*) FROM fleet_aircraft f WHERE f.company_id = c.id) AS aircraft_count
       FROM companies c
       WHERE c.va_listed != 0
         AND (? IS NULL OR IFNULL(c.world_id, 'local') = ?)
         AND (? = 1 OR c.recruiting != 0)
       ORDER BY c.display_name ASC, c.id ASC
       LIMIT ?`,
    )
    .all(worldId, worldId ?? 'local', includeClosed ? 1 : 0, limit) as Array<{
    id: string;
    display_name: string;
    home_hub_icao: string;
    recruiting: number;
    va_listed: number;
    member_route_cut_pct: number;
    member_count: number;
    aircraft_count: number;
  }>;

  const out: VaDirectoryEntry[] = [];
  for (const row of rows) {
    const memberCount = Number(row.member_count) || 0;
    const aircraftCount = Number(row.aircraft_count) || 0;
    const recruiting = Number(row.recruiting) !== 0;
    let myRequestStatus: VaDirectoryEntry['myRequestStatus'] = null;
    let myRole: VaDirectoryEntry['myRole'] = null;
    if (opts.accountId) {
      const membership = getCompanyMembership(db, opts.accountId, row.id);
      if (membership) myRole = membership.role;
      const req = db
        .prepare(
          `SELECT status FROM company_join_requests
           WHERE company_id = ? AND account_id = ?
           ORDER BY created_at_ms DESC LIMIT 1`,
        )
        .get(row.id, opts.accountId) as { status: string } | undefined;
      if (
        req?.status === 'pending' ||
        req?.status === 'accepted' ||
        req?.status === 'rejected'
      ) {
        myRequestStatus = req.status;
      }
    }
    out.push({
      companyId: row.id,
      displayName: row.display_name || row.id,
      homeHubIcao: row.home_hub_icao || '',
      memberCount,
      memberCap: VA_MEMBER_CAP,
      aircraftCount,
      recruiting,
      listed: Number(row.va_listed) !== 0,
      memberRouteCutPct: clampMemberRouteCutPct(row.member_route_cut_pct),
      seatsOpen: Math.max(0, VA_MEMBER_CAP - memberCount),
      myRequestStatus,
      myRole,
    });
  }
  if (out.length > 0) {
    const toDay =
      typeof opts.toDayKey === 'number' && Number.isFinite(opts.toDayKey)
        ? Math.max(0, Math.floor(opts.toDayKey))
        : 0;
    const fromDay =
      typeof opts.fromDayKey === 'number' && Number.isFinite(opts.fromDayKey)
        ? Math.max(0, Math.floor(opts.fromDayKey))
        : Math.max(0, toDay - (VA_FLIGHT_QUALITY_WINDOW_DAYS - 1));
    const quality = mapCompanyFlightQuality(db, {
      companyIds: out.map((e) => e.companyId),
      fromDayKey: fromDay,
      toDayKey: toDay,
    });
    for (const entry of out) {
      entry.flightQuality = quality.get(entry.companyId) ?? null;
    }
  }
  return out;
}

export function createJoinRequest(
  db: SqliteDb,
  opts: { companyId: string; accountId: string; nowMs?: number },
): VaJoinRequestRow {
  ensureV12Ddl(db);
  const companyId = opts.companyId.trim();
  if (!companyId) throw new Error('companyId required');
  if (getCompanyMembership(db, opts.accountId, companyId)) {
    throw new Error('Already a member of this company');
  }
  assertAccountCanJoinVa(db, opts.accountId, companyId);
  if (!isCompanyRecruiting(db, companyId)) {
    throw new Error('This company is not recruiting');
  }
  if (!isCompanyVaListed(db, companyId)) {
    throw new Error('This company is not listed as a VA');
  }
  const count = countCompanyMembers(db, companyId);
  if (count >= VA_MEMBER_CAP) {
    throw new Error(`Company is full (max ${VA_MEMBER_CAP} members)`);
  }
  const pending = db
    .prepare(
      `SELECT id FROM company_join_requests
       WHERE company_id = ? AND account_id = ? AND status = 'pending'`,
    )
    .get(companyId, opts.accountId) as { id: string } | undefined;
  if (pending) throw new Error('Join request already pending');
  const now = opts.nowMs ?? Date.now();
  const id = mintJoinRequestId();
  db.prepare(
    `INSERT INTO company_join_requests
       (id, company_id, account_id, status, created_at_ms, decided_at_ms, decided_by_account_id)
     VALUES (?, ?, ?, 'pending', ?, NULL, NULL)`,
  ).run(id, companyId, opts.accountId, now);
  const account = db
    .prepare(`SELECT login_name, display_name FROM accounts WHERE id = ?`)
    .get(opts.accountId) as
    | { login_name: string; display_name: string }
    | undefined;
  return {
    id,
    companyId,
    accountId: opts.accountId,
    loginName: account?.login_name ?? '',
    displayName: account?.display_name ?? '',
    status: 'pending',
    createdAtMs: now,
    decidedAtMs: null,
  };
}

export function listPendingJoinRequests(
  db: SqliteDb,
  companyId: string,
): VaJoinRequestRow[] {
  ensureV12Ddl(db);
  const rows = db
    .prepare(
      `SELECT r.id, r.company_id, r.account_id, r.status, r.created_at_ms, r.decided_at_ms,
              a.login_name, a.display_name
       FROM company_join_requests r
       JOIN accounts a ON a.id = r.account_id
       WHERE r.company_id = ? AND r.status = 'pending'
       ORDER BY r.created_at_ms ASC`,
    )
    .all(companyId) as Array<{
    id: string;
    company_id: string;
    account_id: string;
    status: string;
    created_at_ms: number;
    decided_at_ms: number | null;
    login_name: string;
    display_name: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    accountId: row.account_id,
    loginName: row.login_name,
    displayName: row.display_name,
    status: 'pending' as const,
    createdAtMs: row.created_at_ms,
    decidedAtMs: row.decided_at_ms,
  }));
}

export function acceptJoinRequest(
  db: SqliteDb,
  opts: {
    requestId: string;
    actorAccountId: string;
    nowMs?: number;
  },
): { member: CareerCompanyMember; companyId: string } {
  ensureV12Ddl(db);
  const row = db
    .prepare(
      `SELECT id, company_id, account_id, status FROM company_join_requests WHERE id = ?`,
    )
    .get(opts.requestId) as
    | { id: string; company_id: string; account_id: string; status: string }
    | undefined;
  if (!row) throw new Error('Join request not found');
  if (row.status !== 'pending') throw new Error('Join request is not pending');
  const actor = getCompanyMembership(db, opts.actorAccountId, row.company_id);
  if (!actor || !canManageVaRoster(actor.role)) {
    throw new Error('Only owner or dispatcher can accept requests');
  }
  const now = opts.nowMs ?? Date.now();
  if (getCompanyMembership(db, row.account_id, row.company_id)) {
    db.prepare(
      `UPDATE company_join_requests
       SET status = 'accepted', decided_at_ms = ?, decided_by_account_id = ?
       WHERE id = ?`,
    ).run(now, opts.actorAccountId, row.id);
    return {
      companyId: row.company_id,
      member: getCompanyMembership(db, row.account_id, row.company_id)!,
    };
  }
  assertAccountCanJoinVa(db, row.account_id, row.company_id);
  const count = countCompanyMembers(db, row.company_id);
  if (count >= VA_MEMBER_CAP) {
    throw new Error(`Company is full (max ${VA_MEMBER_CAP} members)`);
  }
  const member = addCompanyMember(db, {
    companyId: row.company_id,
    accountId: row.account_id,
    role: 'pilot',
    nowMs: now,
  });
  db.prepare(
    `UPDATE company_join_requests
     SET status = 'accepted', decided_at_ms = ?, decided_by_account_id = ?
     WHERE id = ?`,
  ).run(now, opts.actorAccountId, row.id);
  return { member, companyId: row.company_id };
}

export function rejectJoinRequest(
  db: SqliteDb,
  opts: { requestId: string; actorAccountId: string; nowMs?: number },
): void {
  ensureV12Ddl(db);
  const row = db
    .prepare(
      `SELECT id, company_id, status FROM company_join_requests WHERE id = ?`,
    )
    .get(opts.requestId) as
    | { id: string; company_id: string; status: string }
    | undefined;
  if (!row) throw new Error('Join request not found');
  if (row.status !== 'pending') throw new Error('Join request is not pending');
  const actor = getCompanyMembership(db, opts.actorAccountId, row.company_id);
  if (!actor || !canManageVaRoster(actor.role)) {
    throw new Error('Only owner or dispatcher can reject requests');
  }
  const now = opts.nowMs ?? Date.now();
  db.prepare(
    `UPDATE company_join_requests
     SET status = 'rejected', decided_at_ms = ?, decided_by_account_id = ?
     WHERE id = ?`,
  ).run(now, opts.actorAccountId, row.id);
}
