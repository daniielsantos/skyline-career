/**
 * Regression: pre-promotion fleet_aircraft (no registration column) must open.
 * CREATE INDEX on registration before ADD COLUMN used to abort ensureV3Ddl
 * (same class as historical demand_orders.port_id index-before-ALTER).
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { openCareerStore } from './career-store.js';

describe('fleet registration column migration', () => {
  it('opens legacy save missing fleet_aircraft.registration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-fleet-reg-'));
    const sqlitePath = join(dir, 'skyline.sqlite');
    const db = new DatabaseSync(sqlitePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE economy_json (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE missions_json (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE ledger (
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
      CREATE TABLE lots (
        id TEXT PRIMARY KEY NOT NULL,
        commodity_id TEXT NOT NULL,
        origin_icao TEXT NOT NULL,
        dest_icao TEXT NOT NULL,
        quantity_kg INTEGER NOT NULL,
        reserved_kg INTEGER NOT NULL,
        created_at_tick INTEGER NOT NULL,
        expires_at_tick INTEGER NOT NULL,
        pay_usd INTEGER NOT NULL,
        urgency TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE companies (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        home_hub_icao TEXT NOT NULL DEFAULT '',
        home_country_id TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL
      );
      CREATE TABLE company_state (
        company_id TEXT PRIMARY KEY NOT NULL,
        wallet_usd REAL NOT NULL DEFAULT 0,
        pilot_name TEXT NOT NULL DEFAULT '',
        pilot_icao TEXT NOT NULL DEFAULT '',
        hub_selected INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE fleet_aircraft (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL,
        aircraft_class_id TEXT NOT NULL,
        airframe_type_id TEXT,
        label TEXT NOT NULL,
        location_icao TEXT NOT NULL,
        fuel_kg REAL NOT NULL,
        fuel_capacity_kg REAL NOT NULL,
        status TEXT NOT NULL,
        assigned_mission_id TEXT,
        ownership TEXT,
        lease_json TEXT,
        payload_json TEXT
      );
      INSERT INTO meta (key, value) VALUES ('schema_version', '9');
      INSERT INTO companies (id, display_name, created_at_ms)
        VALUES ('local', 'Legacy', 1);
      INSERT INTO company_state (company_id, wallet_usd, updated_at_ms)
        VALUES ('local', 1000, 1);
      INSERT INTO fleet_aircraft (
        id, company_id, aircraft_class_id, label, location_icao,
        fuel_kg, fuel_capacity_kg, status, payload_json
      ) VALUES (
        'acf_legacy', 'local', 'light_ga', 'Legacy', 'SBGR',
        100, 200, 'idle', '{"registration":"PR-OLD"}'
      );
    `);
    const world = {
      seed: 'legacy-reg',
      tick: 1,
      lastBatchAtMs: Date.now(),
      airports: [],
      lots: [],
    };
    db.prepare(
      `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(world), 1);
    db.prepare(
      `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(emptyMissionsStateV2()), 1);
    db.close();

    // Before the fix, openCareerStore threw "no such column: registration"
    // while ensureV3Ddl tried CREATE INDEX before ADD COLUMN.
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.ok(store.sqlitePath);

    const check = new DatabaseSync(store.sqlitePath);
    try {
      const cols = check.prepare('PRAGMA table_info(fleet_aircraft)').all() as Array<{
        name: string;
      }>;
      assert.ok(
        cols.some((c) => c.name === 'registration'),
        'expected fleet_aircraft.registration after ensureV3Ddl',
      );
      const row = check
        .prepare(
          `SELECT registration FROM fleet_aircraft WHERE id = 'acf_legacy'`,
        )
        .get() as { registration: string | null };
      assert.equal(row.registration, 'PR-OLD');
    } finally {
      check.close();
    }
    store.close();
  });
});
