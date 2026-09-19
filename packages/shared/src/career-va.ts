/**
 * VA (virtual airline) — invites, roster, Internal Haul board helpers, ranking.
 * IH-2: multi-pilot without chat / company crew.
 */

import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  addCompanyMember,
  countCompanyMembers,
  listMembershipsForAccount,
  type CareerAccountRole,
  type CareerCompanyMember,
} from './career-auth.js';
import { ensureV12Ddl } from './career-store-v12.js';
import type {
  CareerMissionsState,
  MissionIntent,
  PlayerDemandHold,
} from './types/career-economy.js';
import { listDemandHolds } from './career-demand.js';

type SqliteDb = DatabaseSync;

/** Soft seat cap (billing expansion later). */
export const VA_MEMBER_CAP = 8;
/** Invite TTL. */
export const VA_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VA_INVITE_DEFAULT_MAX_USES = 8;
/** Ranking rolling window (calendar days). */
export const VA_RANKING_WINDOW_DAYS = 7;

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

export type VaCompanyRankRow = {
  companyId: string;
  displayName: string;
  hauls: number;
  nm: number;
  payUsd: number;
};

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
    Math.min(VA_MEMBER_CAP, Math.floor(opts.maxUses ?? VA_INVITE_DEFAULT_MAX_USES)),
  );
  const expiresAtMs = now + (opts.ttlMs ?? VA_INVITE_TTL_MS);
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
  return rows.map((row) => ({
    companyId: row.company_id,
    displayName: row.display_name || row.company_id,
    hauls: Number(row.hauls) || 0,
    nm: Math.round(Number(row.nm) || 0),
    payUsd: Math.round((Number(row.pay_usd) || 0) * 100) / 100,
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
  recruiting: boolean;
  seatsOpen: number;
  /** Pending request from the viewing account, if any. */
  myRequestStatus?: 'pending' | 'accepted' | 'rejected' | null;
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
  recruiting: boolean;
};

/**
 * Owner lists the existing company row as a VA (no second tenant).
 * Updates display name + home hub and opens recruiting by default.
 */
export function publishCompanyAsVa(
  db: SqliteDb,
  opts: {
    companyId: string;
    actorAccountId: string;
    displayName: string;
    homeHubIcao: string;
    recruiting?: boolean;
  },
): VaPublishResult {
  ensureV12Ddl(db);
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
  const recruiting = opts.recruiting !== false;
  db.prepare(
    `UPDATE companies SET display_name = ?, home_hub_icao = ?, recruiting = ? WHERE id = ?`,
  ).run(displayName, homeHubIcao, recruiting ? 1 : 0, companyId);
  return { companyId, displayName, homeHubIcao, recruiting };
}

export function listVaDirectory(
  db: SqliteDb,
  opts: {
    worldId?: string;
    accountId?: string;
    /** When true, include closed (not recruiting) VAs as read-only. */
    includeClosed?: boolean;
    limit?: number;
  } = {},
): VaDirectoryEntry[] {
  ensureV12Ddl(db);
  const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
  const includeClosed = opts.includeClosed === true;
  const worldId = opts.worldId?.trim() || null;
  const rows = db
    .prepare(
      `SELECT c.id, c.display_name, c.home_hub_icao, c.recruiting,
              (SELECT COUNT(*) FROM company_members m WHERE m.company_id = c.id) AS member_count
       FROM companies c
       WHERE (? IS NULL OR IFNULL(c.world_id, 'local') = ?)
         AND (? = 1 OR c.recruiting != 0)
       ORDER BY c.display_name ASC, c.id ASC
       LIMIT ?`,
    )
    .all(worldId, worldId ?? 'local', includeClosed ? 1 : 0, limit) as Array<{
    id: string;
    display_name: string;
    home_hub_icao: string;
    recruiting: number;
    member_count: number;
  }>;

  const out: VaDirectoryEntry[] = [];
  for (const row of rows) {
    const memberCount = Number(row.member_count) || 0;
    const recruiting = Number(row.recruiting) !== 0;
    let myRequestStatus: VaDirectoryEntry['myRequestStatus'] = null;
    if (opts.accountId) {
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
      recruiting,
      seatsOpen: Math.max(0, VA_MEMBER_CAP - memberCount),
      myRequestStatus,
    });
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
  if (!isCompanyRecruiting(db, companyId)) {
    throw new Error('This company is not recruiting');
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
