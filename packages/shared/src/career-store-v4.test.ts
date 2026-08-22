import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld, ensureSeedMarketFormed } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import {
  persistAirportsToTables,
  ensureV4Ddl,
  LOCAL_WORLD_ID,
  diffAirportsForPersist,
} from './career-store-v4.js';
import { ensureV3Ddl } from './career-store-v3.js';
import { CAREER_STORE_SCHEMA_VERSION, openCareerStore } from './career-store.js';
import type { AirportTerminal } from './types/career-economy.js';

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

function airportRowid(
  sqlitePath: string,
  icao: string,
): number | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db
      .prepare(`SELECT rowid AS id FROM airports WHERE world_id = 'local' AND icao = ?`)
      .get(icao) as { id: number } | undefined;
    return row?.id;
  } finally {
    db.close();
  }
}

function countLotsInDb(sqlitePath: string): number {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM lots`).get() as { n: number };
    return Number(row.n);
  } finally {
    db.close();
  }
}

function countAirportsInDb(sqlitePath: string): number {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM airports`).get() as { n: number };
    return Number(row.n);
  } finally {
    db.close();
  }
}

function readAirportStockKg(
  sqlitePath: string,
  icao: string,
  commodityId: string,
): number | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db
      .prepare(
        `SELECT stock_kg FROM airport_stock WHERE world_id = 'local' AND icao = ? AND commodity_id = ?`,
      )
      .get(icao, commodityId) as { stock_kg: number } | undefined;
    return row?.stock_kg;
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

describe('career store v4', () => {
  it('dedupes duplicate ICAOs when writing airports', () => {
    const sqlitePath = join(tmpdir(), `skyline-v4-dedupe-${Date.now()}.sqlite`);
    const db = new DatabaseSync(sqlitePath);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE ledger (
        id TEXT PRIMARY KEY NOT NULL,
        at_tick INTEGER NOT NULL,
        day_index INTEGER NOT NULL,
        amount_usd REAL NOT NULL,
        kind TEXT NOT NULL
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
    `);
    ensureV3Ddl(db);
    ensureV4Ddl(db);
    const hub = {
      icao: 'SBGR',
      name: 'Guarulhos',
      region: 'BR-SE',
      lat: -23.4,
      lon: -46.4,
      level: 1,
      inventory: { general: { stockKg: 9, capacityKg: 100 } },
      production: {},
      consumption: {},
    };
    persistAirportsToTables(
      db,
      [hub, { ...hub, name: 'Guarulhos dup' }] as AirportTerminal[],
      LOCAL_WORLD_ID,
    );
    const n = db.prepare(`SELECT COUNT(*) AS n FROM airports`).get() as { n: number };
    assert.equal(Number(n.n), 1);
    const row = db.prepare(`SELECT name FROM airports WHERE icao = 'SBGR'`).get() as {
      name: string;
    };
    assert.equal(row.name, 'Guarulhos dup');
    db.close();
  });

  it('persists airports as SoT without copying them into economy_json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-airports-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);

    const world = createSeedEconomyWorld({ seed: 'v4-airports' });
    world.lastBatchAtMs = Date.now();
    const sbgr = world.airports.find((a) => a.icao === 'SBGR');
    assert.ok(sbgr);
    sbgr.inventory.general = { stockKg: 12_345, capacityKg: 50_000 };
    sbgr.level = 3;
    sbgr.levelXp = 400;
    await store.saveEconomy(world);

    assert.ok(countAirportsInDb(store.sqlitePath!) >= world.airports.length);
    assert.equal(readAirportStockKg(store.sqlitePath!, 'SBGR', 'general'), 12_345);

    const blob = readEconomyBlob(store.sqlitePath!);
    assert.equal(Array.isArray(blob.airports) ? blob.airports.length : -1, 0);
    assert.equal(blob.seed, 'v4-airports');

    const board = store.readAirportBoard('SBGR');
    assert.ok(board);
    assert.equal(board.airport.inventory.general?.stockKg, 12_345);
    assert.equal(board.airport.level, 3);
    assert.equal(board.worldId, 'local');

    const inventory = store.readAirportInventory('SBGR');
    assert.ok(inventory);
    assert.equal(inventory.airport.inventory.general?.stockKg, 12_345);
    assert.equal(inventory.meta.tick, world.tick);

    store.close();
    const again = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(readAirportStockKg(again.sqlitePath!, 'SBGR', 'general'), 12_345);
    const boardReload = again.readAirportBoard('SBGR');
    assert.equal(boardReload?.airport.inventory.general?.stockKg, 12_345);
    assert.equal(boardReload?.airport.level, 3);
    const blob2 = readEconomyBlob(again.sqlitePath!);
    assert.equal(Array.isArray(blob2.airports) ? blob2.airports.length : -1, 0);

    const db = new DatabaseSync(again.sqlitePath!);
    const companyWorld = db
      .prepare(`SELECT world_id FROM companies WHERE id = 'local'`)
      .get() as { world_id: string };
    const worldRow = db.prepare(`SELECT id FROM worlds WHERE id = 'local'`).get() as
      | { id: string }
      | undefined;
    const meta = db.prepare(`SELECT seed, tick FROM economy_meta WHERE world_id = 'local'`).get() as
      | { seed: string; tick: number }
      | undefined;
    db.close();
    assert.equal(companyWorld.world_id, 'local');
    assert.equal(worldRow?.id, 'local');
    assert.equal(meta?.seed, 'v4-airports');

    again.close();
  });

  it('upgrades schema v3 DBs to v4 and materializes airports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v3-'));
    const sqlitePath = join(dir, 'skyline.sqlite');
    const world = createSeedEconomyWorld({ seed: 'v3-upgrade' });
    world.lastBatchAtMs = Date.now();
    const sbgr = world.airports.find((a) => a.icao === 'SBGR');
    assert.ok(sbgr);
    sbgr.inventory.general = { stockKg: 777, capacityKg: 40_000 };

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
      INSERT INTO meta (key, value) VALUES ('schema_version', '3');
    `);
    db.prepare(
      `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(world), Date.now());
    db.prepare(
      `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(emptyMissionsStateV2()), Date.now());
    db.close();

    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);
    assert.ok(countAirportsInDb(store.sqlitePath!) >= 60);
    assert.equal(readAirportStockKg(store.sqlitePath!, 'SBGR', 'general'), 777);

    const blob = readEconomyBlob(store.sqlitePath!);
    assert.equal(Array.isArray(blob.airports) ? blob.airports.length : -1, 0);
    assert.equal(typeof blob.seed === 'string' ? blob.seed : '', 'v3-upgrade');
    assert.ok(store.readAirportBoard('SBGR'));
    store.close();
  });

  it('diffs airport persist as skip / patch / full', () => {
    const hub = (icao: string, stock: number): AirportTerminal =>
      ({
        icao,
        name: icao,
        region: 'BR-SE',
        lat: 0,
        lon: 0,
        level: 1,
        inventory: { general: { stockKg: stock, capacityKg: 100 } },
        production: {},
        consumption: {},
      }) as AirportTerminal;
    const a = hub('SBGR', 1);
    const b = hub('SBSP', 2);
    assert.equal(diffAirportsForPersist([a, b], [a, b]).mode, 'skip');
    const a2 = hub('SBGR', 9);
    const patch = diffAirportsForPersist([a, b], [a2, b]);
    assert.equal(patch.mode, 'patch');
    assert.equal(patch.upsert.length, 1);
    assert.equal(patch.upsert[0]?.icao, 'SBGR');
    assert.equal(diffAirportsForPersist(undefined, [a, b]).mode, 'full');
  });

  it('keeps unchanged airport rowids when one hub stock changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-patch-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const world = createSeedEconomyWorld({ seed: 'v4-patch' });
    world.lastBatchAtMs = Date.now();
    await store.saveEconomy(world);

    const other = world.airports.find((ap) => ap.icao !== 'SBGR');
    assert.ok(other);
    const otherIcao = other.icao;
    const otherRowid = airportRowid(store.sqlitePath!, otherIcao);
    const sbgr = world.airports.find((ap) => ap.icao === 'SBGR');
    assert.ok(sbgr);
    sbgr.inventory.general = {
      stockKg: (sbgr.inventory.general?.stockKg ?? 0) + 77,
      capacityKg: sbgr.inventory.general?.capacityKg ?? 50_000,
    };
    await store.saveEconomy(world);

    assert.equal(airportRowid(store.sqlitePath!, otherIcao), otherRowid);
    assert.equal(
      readAirportStockKg(store.sqlitePath!, 'SBGR', 'general'),
      sbgr.inventory.general.stockKg,
    );

    world.tick += 1;
    await store.saveEconomy(world);
    assert.equal(airportRowid(store.sqlitePath!, otherIcao), otherRowid);
    store.close();
  });

  it('skips hourly catch-up when maxCatchUpTicks is 0', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-ncu-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const world = createSeedEconomyWorld({ seed: 'v4-ncu' });
    world.lastBatchAtMs = Date.now();
    await store.saveEconomy(world);
    const loaded = await store.loadEconomy({ maxCatchUpTicks: 0 });
    const tick = loaded.world.tick;
    loaded.world.lastBatchAtMs = Date.now() - 12 * 3_600_000;
    const skipped = await store.loadEconomy({ maxCatchUpTicks: 0 });
    assert.equal(skipped.advancedTicks, 0);
    assert.equal(skipped.world.tick, tick);
    const caught = await store.loadEconomy();
    assert.ok(caught.advancedTicks > 0);
    store.close();
  });

  it('patches a single lot without dropping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-lot-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const world = createSeedEconomyWorld({ seed: 'v4-lot' });
    world.lastBatchAtMs = Date.now();
    ensureSeedMarketFormed(world);
    await store.saveEconomy(world);
    const n = countLotsInDb(store.sqlitePath!);
    assert.ok(n > 1);
    const keep = world.lots[1]!;
    const keepQty = keep.quantityKg;
    const touch = world.lots[0]!;
    touch.quantityKg = Math.max(0, touch.quantityKg - 10);
    await store.saveEconomy(world);
    assert.equal(countLotsInDb(store.sqlitePath!), n);
    const again = await store.loadEconomy({ maxCatchUpTicks: 0 });
    const kept = again.world.lots.find((l) => l.id === keep.id);
    assert.equal(kept?.quantityKg, keepQty);
    store.close();
  });

  it('loads a command slice without filling RAM or pruning the planet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-slice-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const world = createSeedEconomyWorld({ seed: 'v4-slice' });
    world.lastBatchAtMs = Date.now();
    ensureSeedMarketFormed(world);
    await store.saveEconomy(world);
    const nAirports = countAirportsInDb(store.sqlitePath!);
    const nLots = countLotsInDb(store.sqlitePath!);
    assert.ok(nLots > 1);
    const lot = world.lots[0]!;
    const originIcao = lot.originIcao;
    const destIcao = lot.destIcao;
    store.close();

    const cold = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(cold.peekEconomyWorld(), null);
    const slice = cold.loadCommandWorldSlice({
      icaos: [originIcao, destIcao],
      lotIds: [lot.id],
      missionId: 'slice-mission',
    });
    assert.ok(slice);
    assert.equal(
      slice.airports.length,
      new Set([originIcao, destIcao].map((c) => c.toUpperCase())).size,
    );
    assert.equal(cold.peekEconomyWorld(), null);
    const hub = slice.airports.find((ap) => ap.icao === originIcao);
    assert.ok(hub);
    hub.inventory.general = {
      stockKg: 4321,
      capacityKg: hub.inventory.general?.capacityKg ?? 50_000,
    };
    slice.lots = [];
    await cold.persistCommandWorldSlice(slice, {
      missionId: 'slice-mission',
      lotIds: [lot.id],
      icaos: [originIcao, destIcao],
    });
    assert.equal(countAirportsInDb(cold.sqlitePath!), nAirports);
    assert.equal(countLotsInDb(cold.sqlitePath!), nLots - 1);
    assert.equal(readAirportStockKg(cold.sqlitePath!, originIcao, 'general'), 4321);
    assert.equal(cold.peekEconomyWorld(), null);
    cold.close();
  });

  it('patches hot RAM settle without rewriting other airport rows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v4-hot-slice-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const world = createSeedEconomyWorld({ seed: 'v4-hot-slice' });
    world.lastBatchAtMs = Date.now();
    ensureSeedMarketFormed(world);
    await store.saveEconomy(world);
    const hot = (await store.loadEconomy({ maxCatchUpTicks: 0 })).world;
    const nAirports = countAirportsInDb(store.sqlitePath!);
    const nLots = countLotsInDb(store.sqlitePath!);
    const lot = hot.lots[0]!;
    const keep = hot.lots[1]!;
    const keepQty = keep.quantityKg;
    const origin =
      hot.airports.find((ap) => ap.icao === 'SBGR') ?? hot.airports[0]!;
    const dest = hot.airports.find((ap) => ap.icao !== origin.icao)!;
    const untouched = hot.airports.find(
      (ap) => ap.icao !== origin.icao && ap.icao !== dest.icao,
    );
    assert.ok(untouched);
    const untouchedRowid = airportRowid(store.sqlitePath!, untouched.icao);
    origin.inventory.general = {
      stockKg: 2222,
      capacityKg: origin.inventory.general?.capacityKg ?? 50_000,
    };
    hot.lots = hot.lots.filter((l) => l.id !== lot.id);
    await store.persistCommandWorldSlice(hot, {
      missionId: 'hot-mission',
      lotIds: [lot.id],
      icaos: [origin.icao, dest.icao],
    });
    assert.equal(countAirportsInDb(store.sqlitePath!), nAirports);
    assert.equal(airportRowid(store.sqlitePath!, untouched.icao), untouchedRowid);
    assert.equal(countLotsInDb(store.sqlitePath!), nLots - 1);
    assert.equal(readAirportStockKg(store.sqlitePath!, origin.icao, 'general'), 2222);
    const again = await store.loadEconomy({ maxCatchUpTicks: 0 });
    assert.equal(again.world.lots.find((l) => l.id === keep.id)?.quantityKg, keepQty);
    assert.equal(again.world.lots.some((l) => l.id === lot.id), false);
    store.close();
  });
});
