import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld, tickEconomyN } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { applyWalletDelta } from './career-ledger.js';
import {
  CAREER_STORE_SCHEMA_VERSION,
  openCareerStore,
} from './career-store.js';
import type { ShipmentLot } from './types/career-economy.js';

function countLotsInDb(sqlitePath: string): number {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM lots`).get() as { n: number };
    return Number(row.n);
  } finally {
    db.close();
  }
}

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

function readLotStatus(sqlitePath: string, lotId: string): {
  status: string;
  reserved_kg: number;
} | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    return db
      .prepare(`SELECT status, reserved_kg FROM lots WHERE id = ?`)
      .get(lotId) as { status: string; reserved_kg: number } | undefined;
  } finally {
    db.close();
  }
}

describe('career store', () => {
  it('migrates JSON saves into SQLite and round-trips economy + ledger', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-store-'));
    const world = createSeedEconomyWorld({ seed: 'store-migrate' });
    world.tick = 48;
    const missions = emptyMissionsStateV2();
    missions.walletUsd = 5_000;
    missions.hubSelected = true;
    missions.pilotName = 'Test Pilot';
    missions.homeHubIcao = 'SBGR';
    applyWalletDelta(missions, {
      amountUsd: 800,
      kind: 'freight_payout',
      atTick: 48,
      note: 'SBGR→SBGL',
    });
    applyWalletDelta(missions, {
      amountUsd: -85,
      kind: 'hangar_parking',
      atTick: 48,
    });

    await writeFile(
      join(dir, 'local-economy.json'),
      `${JSON.stringify(world, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      join(dir, 'local-missions.json'),
      `${JSON.stringify(missions, null, 2)}\n`,
      'utf8',
    );

    const store = await openCareerStore({ careerDir: dir });
    assert.equal(store.kind, 'sqlite');
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);

    const loaded = await store.loadEconomy();
    assert.equal(loaded.world.seed, 'store-migrate');
    assert.equal(loaded.world.homeCountryId, 'BR');
    assert.equal(loaded.world.airports.length, world.airports.length);

    const m = await store.loadMissions();
    assert.equal(m.walletUsd, missions.walletUsd);
    assert.equal(m.ledger?.length, 2);

    const cash = await store.summarizeCashflow(48);
    assert.equal(cash.allTime.incomeUsd, 800);
    assert.equal(cash.allTime.expenseUsd, 85);
    assert.equal(cash.allTime.netUsd, 715);

    // JSON should be renamed aside after migrate.
    let jsonGone = false;
    try {
      await readFile(join(dir, 'local-economy.json'), 'utf8');
    } catch {
      jsonGone = true;
    }
    assert.equal(jsonGone, true);

    const bak = await readFile(join(dir, 'local-economy.json.migrated.bak'), 'utf8');
    assert.ok(bak.includes('store-migrate'));

    store.close();
  });

  it('dual-writes lots into the SQLite table and overlays them on load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-lots-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.ok(store.sqlitePath);

    const world = createSeedEconomyWorld({ seed: 'lots-table' });
    tickEconomyN(world, 36, { advanceWallClock: false });
    assert.ok(world.lots.length > 0, 'expected formed lots');

    await store.saveEconomy(world);
    assert.equal(countLotsInDb(store.sqlitePath), world.lots.length);

    const sample = world.lots[0]!;
    sample.status = 'reserved';
    sample.reservedKg = Math.min(sample.quantityKg, 500);
    await store.saveEconomy(world);

    const row = readLotStatus(store.sqlitePath, sample.id);
    assert.ok(row);
    assert.equal(row.status, 'reserved');
    assert.equal(row.reserved_kg, sample.reservedKg);

    // Corrupt blob lots but keep table — load should prefer table.
    const db = new DatabaseSync(store.sqlitePath);
    const blob = db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as {
      json: string;
    };
    const parsed = JSON.parse(blob.json) as { lots: ShipmentLot[] };
    parsed.lots = [];
    db.prepare(
      `UPDATE economy_json SET json = ?, updated_at_ms = ? WHERE id = 1`,
    ).run(JSON.stringify(parsed), Date.now());
    db.close();

    const reloaded = await store.loadEconomy();
    assert.ok(reloaded.world.lots.some((l) => l.id === sample.id));
    const fromTable = reloaded.world.lots.find((l) => l.id === sample.id)!;
    assert.equal(fromTable.status, 'reserved');
    assert.equal(fromTable.reservedKg, sample.reservedKg);

    store.close();
  });

  it('upgrades schema v1 DBs to v2 and fills lots on first save', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v1-'));
    const sqlitePath = join(dir, 'skyline.sqlite');
    const world = createSeedEconomyWorld({ seed: 'v1-upgrade' });
    tickEconomyN(world, 24, { advanceWallClock: false });

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
      INSERT INTO meta (key, value) VALUES ('schema_version', '1');
    `);
    db.prepare(
      `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(world), Date.now());
    db.prepare(
      `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(emptyMissionsStateV2()), Date.now());
    db.close();

    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), '2');

    const loaded = await store.loadEconomy();
    assert.equal(loaded.world.seed, 'v1-upgrade');
    assert.ok(loaded.world.airports.length >= 28);
    // Empty lots table + blob lots → dirty so API/persist path would rewrite.
    assert.equal(loaded.dirty, true);

    await store.saveEconomy(loaded.world);
    assert.equal(countLotsInDb(store.sqlitePath!), loaded.world.lots.length);
    assert.ok(loaded.world.lots.length > 0);

    store.close();
  });

  it('supports json backend via CAREER_STORE=json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-json-'));
    await mkdir(dir, { recursive: true });
    const prev = process.env.CAREER_STORE;
    process.env.CAREER_STORE = 'json';
    try {
      const store = await openCareerStore({ careerDir: dir, backend: 'json' });
      assert.equal(store.kind, 'json');
      const { world } = await store.loadEconomy();
      assert.ok(world.airports.length >= 20);
      world.lots = [
        {
          id: 'lot_json_1',
          commodityId: 'general',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          quantityKg: 1_000,
          reservedKg: 0,
          createdAtTick: 1,
          expiresAtTick: 20,
          payUsd: 400,
          urgency: 'normal',
          reason: 'test',
          status: 'available',
        },
      ];
      await store.saveEconomy(world);
      const again = await store.loadEconomy();
      assert.equal(again.world.lots.length, 1);
      assert.equal(again.world.lots[0]?.id, 'lot_json_1');
      const missions = await store.loadMissions();
      missions.walletUsd = 123;
      await store.saveMissions(missions);
      const m2 = await store.loadMissions();
      assert.equal(m2.walletUsd, 123);
      store.close();
    } finally {
      if (prev === undefined) delete process.env.CAREER_STORE;
      else process.env.CAREER_STORE = prev;
    }
  });
});
