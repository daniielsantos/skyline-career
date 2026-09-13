/**
 * Company registry — SP N=1 (`local`) and MP N companies on one world_id.
 * Auth/OAuth is out of scope; callers supply company ids.
 */

import {
  LOCAL_COMPANY_ID,
  LOCAL_WORLD_ID_V3,
  type SqliteDb,
} from './career-store-v3.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';

export type CareerCompanyRow = {
  id: string;
  displayName: string;
  homeHubIcao: string;
  homeCountryId: string;
  worldId: string;
  createdAtMs: number;
};

export type EnsureCompanyOpts = {
  id: string;
  worldId?: string;
  displayName?: string;
  homeHubIcao?: string;
  homeCountryId?: string;
};

function normalizeCompanyId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error('company id required');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    throw new Error('company id must be 1–64 chars [a-zA-Z0-9_-]');
  }
  return trimmed;
}

/** Upsert a company row on a world (shared world_id for MP). */
export function ensureCompany(db: SqliteDb, opts: EnsureCompanyOpts): CareerCompanyRow {
  const id = normalizeCompanyId(opts.id);
  const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
  const now = Date.now();
  const existing = db
    .prepare(
      `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
       FROM companies WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        display_name: string;
        home_hub_icao: string;
        home_country_id: string;
        world_id: string | null;
        created_at_ms: number;
      }
    | undefined;

  if (existing) {
    if (opts.displayName || opts.homeHubIcao || opts.homeCountryId || opts.worldId) {
      db.prepare(
        `UPDATE companies SET
           display_name = COALESCE(NULLIF(?, ''), display_name),
           home_hub_icao = COALESCE(NULLIF(?, ''), home_hub_icao),
           home_country_id = COALESCE(NULLIF(?, ''), home_country_id),
           world_id = COALESCE(NULLIF(?, ''), world_id)
         WHERE id = ?`,
      ).run(
        opts.displayName ?? '',
        opts.homeHubIcao ?? '',
        opts.homeCountryId ?? '',
        opts.worldId ?? '',
        id,
      );
    }
    const row = db
      .prepare(
        `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
         FROM companies WHERE id = ?`,
      )
      .get(id) as {
      id: string;
      display_name: string;
      home_hub_icao: string;
      home_country_id: string;
      world_id: string | null;
      created_at_ms: number;
    };
    return {
      id: row.id,
      displayName: row.display_name ?? '',
      homeHubIcao: row.home_hub_icao ?? '',
      homeCountryId: row.home_country_id ?? '',
      worldId: row.world_id?.trim() || worldId,
      createdAtMs: row.created_at_ms,
    };
  }

  db.prepare(
    `INSERT INTO companies (id, display_name, home_hub_icao, home_country_id, created_at_ms, world_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.displayName ?? '',
    opts.homeHubIcao ?? '',
    opts.homeCountryId ?? '',
    now,
    worldId,
  );
  return {
    id,
    displayName: opts.displayName ?? '',
    homeHubIcao: opts.homeHubIcao ?? '',
    homeCountryId: opts.homeCountryId ?? '',
    worldId,
    createdAtMs: now,
  };
}

export function getCompany(
  db: SqliteDb,
  companyId: string,
): CareerCompanyRow | null {
  const id = companyId.trim();
  if (!id) return null;
  const row = db
    .prepare(
      `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
       FROM companies WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        display_name: string;
        home_hub_icao: string;
        home_country_id: string;
        world_id: string | null;
        created_at_ms: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    homeHubIcao: row.home_hub_icao ?? '',
    homeCountryId: row.home_country_id ?? '',
    worldId: row.world_id?.trim() || LOCAL_WORLD_ID_V3,
    createdAtMs: row.created_at_ms,
  };
}

export function listCompaniesForWorld(
  db: SqliteDb,
  worldId = LOCAL_WORLD_ID,
): CareerCompanyRow[] {
  const wid = worldId.trim() || LOCAL_WORLD_ID;
  const rows = db
    .prepare(
      `SELECT id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms
       FROM companies
       WHERE world_id = ? OR (world_id IS NULL AND ? = ?)
       ORDER BY created_at_ms ASC, id ASC`,
    )
    .all(wid, wid, LOCAL_WORLD_ID_V3) as Array<{
    id: string;
    display_name: string;
    home_hub_icao: string;
    home_country_id: string;
    world_id: string | null;
    created_at_ms: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name ?? '',
    homeHubIcao: row.home_hub_icao ?? '',
    homeCountryId: row.home_country_id ?? '',
    worldId: row.world_id?.trim() || wid,
    createdAtMs: row.created_at_ms,
  }));
}

/** Resolve request company; default SP tenant. Validates membership on world when db given. */
export function resolveCompanyId(opts: {
  requested?: string | null;
  worldId?: string;
  db?: SqliteDb | null;
}): string {
  const requested = opts.requested?.trim();
  const id = requested || LOCAL_COMPANY_ID;
  if (!opts.db) return id;
  const row = getCompany(opts.db, id);
  if (!row) {
    if (id === LOCAL_COMPANY_ID) {
      ensureCompany(opts.db, {
        id: LOCAL_COMPANY_ID,
        worldId: opts.worldId ?? LOCAL_WORLD_ID,
      });
      return LOCAL_COMPANY_ID;
    }
    throw new Error(`Unknown company ${id}`);
  }
  const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
  if (row.worldId !== worldId) {
    throw new Error(`Company ${id} is not on world ${worldId}`);
  }
  return row.id;
}
