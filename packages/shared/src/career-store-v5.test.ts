import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { CAREER_STORE_SCHEMA_VERSION, openCareerStore } from './career-store.js';
import { ensureV3Ddl } from './career-store-v3.js';
import { ensureV4Ddl } from './career-store-v4.js';
import { ensureV5Ddl, readPortListings, replacePortListings, upsertPortListing } from './career-store-v5.js';

function schemaVersionInDb(sqlitePath: string): string {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
      | { value: string }
      | undefined;
    return row?.value ?? '';
  } finally {
    db.close();
  }
}

function countRows(sqlitePath: string, table: string): number {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    return Number(row.n);
  } finally {
    db.close();
  }
}

function readNpcRow(
  sqlitePath: string,
  id: string,
): { aircraft_class_id: string; home_region: string; status: string } | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    return db
      .prepare(
        `SELECT aircraft_class_id, home_region, status FROM npcs WHERE world_id = 'local' AND id = ?`,
      )
      .get(id) as
      | { aircraft_class_id: string; home_region: string; status: string }
      | undefined;
  } finally {
    db.close();
  }
}

function readTruckName(sqlitePath: string, id: string): string | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db
      .prepare(`SELECT name FROM fuel_trucks WHERE world_id = 'local' AND id = ?`)
      .get(id) as { name: string } | undefined;
    return row?.name;
  } finally {
    db.close();
  }
}

function readEconomyBlob(sqlitePath: string): Record<string, unknown> {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as {
      json: string;
    };
    return JSON.parse(row.json) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

describe('career store v5', () => {
  it('persists world ops as SoT without copying them into economy_json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v5-ops-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);

    const world = createSeedEconomyWorld({ seed: 'v5-world-ops' });
    world.lastBatchAtMs = Date.now();
    const sampleNpc = world.npcs[0];
    const sampleTruck = world.fuelTrucks?.[0];
    assert.ok(sampleNpc);
    assert.ok(sampleTruck);
    sampleNpc.status = 'resting';
    sampleNpc.restUntilMs = Date.now() + 7 * 24 * 3600 * 1000;
    sampleTruck.name = 'Tanker Alpha';
    const npcCount = world.npcs.length;
    const truckCount = world.fuelTrucks?.length ?? 0;
    assert.ok(npcCount > 0);
    assert.ok(truckCount > 0);

    await store.saveEconomy(world);

    assert.equal(countRows(store.sqlitePath!, 'npcs'), npcCount);
    assert.equal(countRows(store.sqlitePath!, 'fuel_trucks'), truckCount);
    assert.equal(readNpcRow(store.sqlitePath!, sampleNpc.id)?.status, 'resting');
    assert.equal(readTruckName(store.sqlitePath!, sampleTruck.id), 'Tanker Alpha');

    const blob = readEconomyBlob(store.sqlitePath!);
    assert.equal(Array.isArray(blob.npcs) ? blob.npcs.length : -1, 0);
    assert.equal(Array.isArray(blob.fuelTrucks) ? blob.fuelTrucks.length : -1, 0);
    assert.equal(Array.isArray(blob.fuelHauls) ? blob.fuelHauls.length : -1, 0);
    assert.equal(Array.isArray(blob.demandOrders) ? blob.demandOrders.length : -1, 0);
    assert.equal(Array.isArray(blob.portListings) ? blob.portListings.length : -1, 0);
    assert.equal(Array.isArray(blob.portInventories) ? blob.portInventories.length : -1, 0);
    assert.equal(Array.isArray(blob.portConcessions) ? blob.portConcessions.length : -1, 0);
    assert.equal(blob.seed, 'v5-world-ops');

    store.close();
    const again = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const loaded = await again.loadEconomy();
    assert.equal(loaded.world.npcs.length, npcCount);
    const reloadedNpc = loaded.world.npcs.find((n) => n.id === sampleNpc.id);
    assert.ok(reloadedNpc);
    assert.equal(reloadedNpc.aircraftClassId, sampleNpc.aircraftClassId);
    assert.equal(reloadedNpc.homeRegion, sampleNpc.homeRegion);
    assert.equal(reloadedNpc.status, 'resting');
    assert.ok((reloadedNpc.restUntilMs ?? 0) > Date.now());
    const reloadedTruck = loaded.world.fuelTrucks?.find((t) => t.id === sampleTruck.id);
    assert.ok(reloadedTruck);
    assert.equal(reloadedTruck.name, 'Tanker Alpha');
    const blob2 = readEconomyBlob(again.sqlitePath!);
    assert.equal(Array.isArray(blob2.npcs) ? blob2.npcs.length : -1, 0);
    again.close();
  });

  it('upgrades schema v4 DBs to v5 and materializes world ops', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-ops-'));
    const sqlitePath = join(dir, 'skyline.sqlite');
    const world = createSeedEconomyWorld({ seed: 'v4-upgrade-ops' });
    world.lastBatchAtMs = Date.now();
    const sampleNpc = world.npcs[0];
    const sampleTruck = world.fuelTrucks?.[0];
    assert.ok(sampleNpc);
    assert.ok(sampleTruck);
    const npcCount = world.npcs.length;
    const truckCount = world.fuelTrucks?.length ?? 0;

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
        base_pay_usd INTEGER,
        urgency TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO meta (key, value) VALUES ('schema_version', '4');
    `);
    ensureV3Ddl(db);
    ensureV4Ddl(db);
    db.prepare(
      `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(world), Date.now());
    db.prepare(
      `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(emptyMissionsStateV2()), Date.now());
    db.close();

    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);
    assert.equal(countRows(store.sqlitePath!, 'npcs'), npcCount);
    assert.equal(countRows(store.sqlitePath!, 'fuel_trucks'), truckCount);
    assert.equal(readNpcRow(store.sqlitePath!, sampleNpc.id)?.home_region, sampleNpc.homeRegion);
    assert.equal(readTruckName(store.sqlitePath!, sampleTruck.id), sampleTruck.name);

    const blob = readEconomyBlob(store.sqlitePath!);
    assert.equal(Array.isArray(blob.npcs) ? blob.npcs.length : -1, 0);
    assert.equal(Array.isArray(blob.fuelTrucks) ? blob.fuelTrucks.length : -1, 0);
    assert.equal(typeof blob.seed === 'string' ? blob.seed : '', 'v4-upgrade-ops');

    const loaded = await store.loadEconomy();
    const reloadedNpc = loaded.world.npcs.find((n) => n.id === sampleNpc.id);
    assert.ok(reloadedNpc);
    assert.equal(reloadedNpc.aircraftClassId, sampleNpc.aircraftClassId);
    assert.equal(reloadedNpc.status, sampleNpc.status);
    store.close();
  });

  it('replacePortListings keeps the last row when ids collide', () => {
    const db = new DatabaseSync(':memory:');
    ensureV5Ddl(db);
    const listing = {
      id: 'portlot_dup',
      portId: 'BRSSZ',
      commodityId: 'general' as const,
      availableKg: 1000,
      unitPriceUsd: 1,
      allocatedHubIcao: 'SBGR',
      arrivedAtTick: 1,
      expiresAtTick: 100,
      status: 'open' as const,
    };
    replacePortListings(db, [
      listing,
      { ...listing, availableKg: 9000 },
      { ...listing, id: 'portlot_other', availableKg: 4000 },
    ]);
    const rows = readPortListings(db);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.id === 'portlot_dup')?.availableKg, 9000);
    assert.equal(rows.find((r) => r.id === 'portlot_other')?.availableKg, 4000);
  });

  it('upsertPortListing updates one row without wiping siblings', () => {
    const db = new DatabaseSync(':memory:');
    ensureV5Ddl(db);
    const a = {
      id: 'portlot_a',
      portId: 'BRSSZ',
      commodityId: 'general' as const,
      availableKg: 1000,
      unitPriceUsd: 1,
      allocatedHubIcao: 'SBGR',
      arrivedAtTick: 1,
      expiresAtTick: 100,
      status: 'open' as const,
    };
    const b = { ...a, id: 'portlot_b', availableKg: 4000 };
    replacePortListings(db, [a, b]);
    upsertPortListing(db, { ...a, availableKg: 250, status: 'sold_out' });
    const rows = readPortListings(db);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.id === 'portlot_a')?.availableKg, 250);
    assert.equal(rows.find((r) => r.id === 'portlot_a')?.status, 'sold_out');
    assert.equal(rows.find((r) => r.id === 'portlot_b')?.availableKg, 4000);
  });

  it('upgrades a v4 blob with duplicate port listing ids', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-dup-listings-'));
    const sqlitePath = join(dir, 'skyline.sqlite');
    const world = createSeedEconomyWorld({ seed: 'v4-dup-listings' });
    world.lastBatchAtMs = Date.now();
    const listing = {
      id: 'portlot_1_123',
      portId: 'BRSSZ',
      commodityId: 'general' as const,
      availableKg: 5000,
      unitPriceUsd: 1.1,
      allocatedHubIcao: 'SBGR',
      arrivedAtTick: world.tick,
      expiresAtTick: world.tick + 10_000,
      status: 'open' as const,
    };
    world.portListings = [listing, { ...listing, availableKg: 2500 }];

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
        base_pay_usd INTEGER,
        urgency TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO meta (key, value) VALUES ('schema_version', '4');
    `);
    ensureV3Ddl(db);
    ensureV4Ddl(db);
    db.prepare(
      `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(world), Date.now());
    db.prepare(
      `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(emptyMissionsStateV2()), Date.now());
    db.close();

    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);
    assert.equal(countRows(store.sqlitePath!, 'port_listings'), 1);
    const loaded = await store.loadEconomy();
    const kept = (loaded.world.portListings ?? []).filter((l) => l.id === listing.id);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.availableKg, 2500);
    store.close();
  });
});
