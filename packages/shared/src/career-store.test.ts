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
import type { MissionIntent, PlayerAircraft, ShipmentLot } from './types/career-economy.js';

function countAirportsInDb(sqlitePath: string): number {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM airports`).get() as { n: number };
    return Number(row.n);
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
  origin_country_id: string | null;
} | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    return db
      .prepare(
        `SELECT status, reserved_kg, origin_country_id FROM lots WHERE id = ?`,
      )
      .get(lotId) as
      | { status: string; reserved_kg: number; origin_country_id: string | null }
      | undefined;
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

function countLedgerInDb(sqlitePath: string): number {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ledger`).get() as { n: number };
    return Number(row.n);
  } finally {
    db.close();
  }
}

function companyLocalExists(sqlitePath: string): boolean {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db.prepare(`SELECT id FROM companies WHERE id = 'local'`).get() as
      | { id: string }
      | undefined;
    return Boolean(row);
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
      note: 'SBGRâ†’SBGL',
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
    assert.equal(companyLocalExists(store.sqlitePath!), true);

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

  it('persists lots as SoT without copying them into economy_json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-lots-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.ok(store.sqlitePath);

    const world = createSeedEconomyWorld({ seed: 'lots-table' });
    tickEconomyN(world, 36, { advanceWallClock: false });
    assert.ok(world.lots.length > 0, 'expected formed lots');

    await store.saveEconomy(world);
    assert.equal(countLotsInDb(store.sqlitePath), world.lots.length);

    const blob = readEconomyBlob(store.sqlitePath);
    assert.equal(Array.isArray(blob.lots) ? blob.lots.length : -1, 0);
    assert.equal(Array.isArray(blob.npcFlights) ? blob.npcFlights.length : -1, 0);
    assert.equal(Array.isArray(blob.events) ? blob.events.length : -1, 0);
    assert.equal(Array.isArray(blob.airports) ? blob.airports.length : -1, 0);
    assert.ok(countAirportsInDb(store.sqlitePath) >= world.airports.length);

    const sample = world.lots[0]!;
    sample.status = 'reserved';
    sample.reservedKg = Math.min(sample.quantityKg, 500);
    await store.saveEconomy(world);

    const row = readLotStatus(store.sqlitePath, sample.id);
    assert.ok(row);
    assert.equal(row.status, 'reserved');
    assert.equal(row.reserved_kg, sample.reservedKg);
    assert.ok(row.origin_country_id, 'lot origin_country_id stamped');

    // Corrupt blob lots but keep table â€” load should prefer table.
    const db = new DatabaseSync(store.sqlitePath);
    const blobRow = db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as {
      json: string;
    };
    const parsed = JSON.parse(blobRow.json) as { lots: ShipmentLot[] };
    parsed.lots = [
      {
        id: 'fake_blob_lot',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 1,
        reservedKg: 0,
        createdAtTick: 0,
        expiresAtTick: 1,
        payUsd: 1,
        urgency: 'normal',
        reason: 'should-not-load',
        status: 'available',
      },
    ];
    db.prepare(
      `UPDATE economy_json SET json = ?, updated_at_ms = ? WHERE id = 1`,
    ).run(JSON.stringify(parsed), Date.now());
    db.close();

    const reloaded = await store.loadEconomy();
    assert.ok(reloaded.world.lots.some((l) => l.id === sample.id));
    assert.ok(!reloaded.world.lots.some((l) => l.id === 'fake_blob_lot'));
    const fromTable = reloaded.world.lots.find((l) => l.id === sample.id)!;
    assert.equal(fromTable.status, 'reserved');
    assert.equal(fromTable.reservedKg, sample.reservedKg);

    store.close();
  });

  it('upgrades schema v1 DBs to v3 and materializes lots', async () => {
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
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);
    assert.equal(companyLocalExists(store.sqlitePath!), true);

    const loaded = await store.loadEconomy();
    assert.equal(loaded.world.seed, 'v1-upgrade');
    assert.ok(loaded.world.airports.length >= 60);
    // Migrate already filled lots table from blob.
    assert.ok(countLotsInDb(store.sqlitePath!) > 0);
    assert.equal(loaded.world.lots.length, countLotsInDb(store.sqlitePath!));

    const blob = readEconomyBlob(store.sqlitePath!);
    assert.equal(Array.isArray(blob.lots) ? blob.lots.length : -1, 0);

    store.close();
  });

  it('migrates v2 DB to v3 with company fleet/mission round-trip', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v2-'));
    const sqlitePath = join(dir, 'skyline.sqlite');
    const world = createSeedEconomyWorld({ seed: 'v2-upgrade' });
    tickEconomyN(world, 12, { advanceWallClock: false });
    world.inboundPending = [
      {
        id: 'inb_1',
        missionId: 'msn_1',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        commodityId: 'general',
        cargoKg: 500,
        expiresAtTick: 100,
        source: 'player',
      },
    ];
    world.events = [
      {
        id: 'evt_1',
        kind: 'harvest_boost',
        region: 'BR-SE',
        startsAtTick: 1,
        endsAtTick: 40,
        label: 'Test harvest',
      },
    ];

    const fleetAc: PlayerAircraft = {
      id: 'ac_test_1',
      aircraftClassId: 'light_turboprop',
      airframeTypeId: '208B',
      label: 'Test Caravan',
      locationIcao: 'SBGR',
      fuelKg: 800,
      fuelCapacityKg: 1_000,
      status: 'parked',
      ownership: 'owned',
    };
    const mission: MissionIntent = {
      id: 'msn_1',
      lots: [
        {
          shipmentLotId: 'lot_x',
          commodityId: 'general',
          cargoKg: 500,
          payUsd: 200,
          urgency: 'normal',
          reason: 'test',
          deadlineTick: 80,
        },
      ],
      shipmentLotId: 'lot_x',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      cargoKg: 500,
      pax: 0,
      aircraftClassId: 'light_turboprop',
      rolesPackRelPath: '',
      deadlineTick: 80,
      payUsd: 200,
      urgency: 'normal',
      reason: 'test',
      status: 'accepted',
      acceptedAtTick: 10,
      aircraftId: 'ac_test_1',
    };
    const missions = emptyMissionsStateV2();
    missions.walletUsd = 12_345;
    missions.hubSelected = true;
    missions.pilotName = 'V2 Pilot';
    missions.homeHubIcao = 'SBGR';
    missions.pilotIcao = 'SBGR';
    missions.fleet = [fleetAc];
    missions.missions = [mission];

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
      INSERT INTO meta (key, value) VALUES ('schema_version', '2');
    `);
    db.prepare(
      `INSERT INTO economy_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(world), Date.now());
    db.prepare(
      `INSERT INTO missions_json (id, json, updated_at_ms) VALUES (1, ?, ?)`,
    ).run(JSON.stringify(missions), Date.now());
    db.close();

    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);
    assert.equal(companyLocalExists(store.sqlitePath!), true);

    const m = await store.loadMissions();
    assert.equal(m.walletUsd, 12_345);
    assert.equal(m.fleet.length, 1);
    assert.equal(m.fleet[0]?.id, 'ac_test_1');
    assert.equal(m.missions.length, 1);
    assert.equal(m.missions[0]?.id, 'msn_1');
    assert.equal(m.homeHubIcao, 'SBGR');

    const loaded = await store.loadEconomy();
    assert.ok(loaded.world.inboundPending?.some((r) => r.id === 'inb_1'));
    assert.ok(loaded.world.events.some((e) => e.id === 'evt_1'));
    assert.ok(loaded.world.lots.length > 0);

    // Round-trip save/load company tables.
    m.walletUsd = 99_000;
    await store.saveMissions(m);
    const again = await store.loadMissions();
    assert.equal(again.walletUsd, 99_000);
    assert.equal(again.fleet[0]?.id, 'ac_test_1');
    assert.equal(again.missions[0]?.id, 'msn_1');

    again.portPickups = [
      {
        id: 'portpk_1',
        portId: 'BRSSZ',
        hubIcao: 'SBGR',
        commodityId: 'general',
        kg: 500,
        avgCostUsdPerKg: 0.48,
        purchasedAtTick: 10,
      },
      {
        id: 'portpk_2',
        portId: 'BRSSZ',
        hubIcao: 'SBGR',
        commodityId: 'general',
        kg: 500,
        avgCostUsdPerKg: 0.48,
        purchasedAtTick: 11,
      },
    ];
    await store.saveMissions(again);
    await store.saveMissions(again);
    const withPickups = await store.loadMissions();
    assert.equal(withPickups.portPickups?.length, 2);
    assert.equal(withPickups.portPickups?.[0]?.id, 'portpk_1');
    assert.equal(withPickups.portPickups?.[1]?.kg, 500);

    const ledgerBefore = countLedgerInDb(store.sqlitePath!);
    applyWalletDelta(withPickups, {
      amountUsd: 50,
      kind: 'freight_payout',
      atTick: 48,
      note: 'ledger-patch',
    });
    await store.saveMissions(withPickups);
    assert.equal(countLedgerInDb(store.sqlitePath!), ledgerBefore + 1);
    applyWalletDelta(withPickups, {
      amountUsd: -10,
      kind: 'hangar_parking',
      atTick: 48,
    });
    await store.saveMissions(withPickups);
    assert.equal(countLedgerInDb(store.sqlitePath!), ledgerBefore + 2);

    store.close();
  });

  it('persists awaiting_pilot NPC flights (crew-needed offers) across reload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-crew-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const { world } = await store.loadEconomy();
    const nowMs = world.lastBatchAtMs ?? Date.now();
    world.npcFlights = [
      {
        id: 'npcf-crew-1',
        npcId: 'npc-1',
        lotId: 'lot_crew_1',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        commodityId: 'general',
        cargoKg: 400,
        payUsd: 1_200,
        aircraftClassId: 'light_ga',
        departedAtTick: world.tick,
        arrivesAtTick: world.tick,
        departedAtMs: nowMs,
        arrivesAtMs: nowMs + 3 * 60 * 60 * 1000,
        status: 'awaiting_pilot',
        awaitingPilotUntilMs: nowMs + 3 * 60 * 60 * 1000,
        pilotFeeUsd: 480,
      },
      {
        id: 'npcf-air-1',
        npcId: 'npc-2',
        lotId: 'lot_air_1',
        originIcao: 'SBKP',
        destIcao: 'SBRF',
        commodityId: 'supplies',
        cargoKg: 800,
        payUsd: 2_000,
        aircraftClassId: 'light_turboprop',
        departedAtTick: world.tick,
        arrivesAtTick: world.tick + 4,
        departedAtMs: nowMs,
        arrivesAtMs: nowMs + 4 * 60 * 60 * 1000,
        status: 'in_flight',
      },
    ];
    await store.saveEconomy(world);
    const again = await store.loadEconomy();
    const crew = again.world.npcFlights.find((f) => f.id === 'npcf-crew-1');
    const air = again.world.npcFlights.find((f) => f.id === 'npcf-air-1');
    assert.ok(crew);
    assert.equal(crew!.status, 'awaiting_pilot');
    assert.equal(crew!.pilotFeeUsd, 480);
    assert.equal(crew!.awaitingPilotUntilMs, nowMs + 3 * 60 * 60 * 1000);
    assert.equal(air?.status, 'in_flight');
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
