import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import {
  CAREER_STORE_SCHEMA_VERSION,
  createSeedEconomyWorld,
  emptyMissionsStateV2,
  generateDailyCharterOffers,
  openCareerStore,
  reserveCharterOffer,
} from './index.js';
import { migrateV8toV9IfNeeded } from './career-store-v9.js';

describe('career store schema v9', () => {
  it('migrates v8 missions to canonical freight fields', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '8');
      CREATE TABLE missions (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL,
        status TEXT NOT NULL,
        origin_icao TEXT NOT NULL,
        dest_icao TEXT NOT NULL,
        aircraft_id TEXT,
        commodity_id TEXT NOT NULL,
        cargo_kg REAL NOT NULL,
        pay_usd REAL NOT NULL,
        accepted_at_tick INTEGER NOT NULL,
        deadline_tick INTEGER NOT NULL,
        departed_at_tick INTEGER,
        settled_at_tick INTEGER,
        urgency TEXT NOT NULL,
        reason TEXT NOT NULL,
        payload_json TEXT
      );
      INSERT INTO missions (
        id, company_id, status, origin_icao, dest_icao, commodity_id,
        cargo_kg, pay_usd, accepted_at_tick, deadline_tick, urgency, reason
      ) VALUES (
        'legacy', 'local', 'settled', 'SBGR', 'SBGL', 'general',
        100, 500, 1, 20, 'normal', 'legacy freight'
      );
    `);
    const metaSet = (target: DatabaseSync, key: string, value: string) => {
      target
        .prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(key, value);
    };
    migrateV8toV9IfNeeded(db, metaSet, '9');
    const row = db
      .prepare(
        `SELECT mission_type, charter_offer_id, pax, baggage_kg
         FROM missions WHERE id = 'legacy'`,
      )
      .get() as {
      mission_type: string;
      charter_offer_id: string | null;
      pax: number;
      baggage_kg: number;
    };
    assert.equal(row.mission_type, 'freight');
    assert.equal(row.charter_offer_id, null);
    assert.equal(row.pax, 0);
    assert.equal(row.baggage_kg, 0);
    const version = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as {
      value: string;
    };
    assert.equal(version.value, '9');
    db.close();
  });

  it('repairs an already-stamped v9 database missing baggage columns', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '9');
      CREATE TABLE missions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        mission_type TEXT NOT NULL DEFAULT 'freight',
        status TEXT NOT NULL,
        charter_offer_id TEXT,
        pax INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE charter_offers (
        world_id TEXT NOT NULL,
        id TEXT NOT NULL,
        demand_id TEXT NOT NULL,
        origin_icao TEXT NOT NULL,
        dest_icao TEXT NOT NULL,
        group_size INTEGER NOT NULL,
        distance_nm REAL NOT NULL,
        tier TEXT NOT NULL,
        urgency TEXT NOT NULL,
        international INTEGER NOT NULL DEFAULT 0,
        pay_usd REAL NOT NULL,
        created_at_tick INTEGER NOT NULL,
        expires_at_tick INTEGER NOT NULL,
        status TEXT NOT NULL,
        mission_id TEXT,
        PRIMARY KEY (world_id, id)
      );
    `);
    const metaSet = (target: DatabaseSync, key: string, value: string) => {
      target
        .prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(key, value);
    };
    migrateV8toV9IfNeeded(db, metaSet, '9');
    const missionColumns = db.prepare(`PRAGMA table_info(missions)`).all() as Array<{
      name: string;
    }>;
    const offerColumns = db.prepare(`PRAGMA table_info(charter_offers)`).all() as Array<{
      name: string;
    }>;
    assert.ok(missionColumns.some((column) => column.name === 'baggage_kg'));
    assert.ok(offerColumns.some((column) => column.name === 'baggage_kg'));
    db.close();
  });

  it('hydrates charter demand/offers and canonical charter missions from SQLite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v9-charter-'));
    let store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(CAREER_STORE_SCHEMA_VERSION, '16');
    const world = createSeedEconomyWorld({ seed: 'store-v9-charter' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers![0]!;
    const mission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_store_charter',
    });
    const missions = emptyMissionsStateV2();
    missions.missions.push(mission);
    await store.saveEconomy(world);
    await store.saveMissions(missions);
    const sqlitePath = store.sqlitePath!;
    store.close();

    store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const loadedWorld = (await store.loadEconomy({ maxCatchUpTicks: 0 })).world;
    const loadedMissions = await store.loadMissions();
    assert.equal(loadedWorld.charterDemand?.length, world.charterDemand?.length);
    assert.equal(loadedWorld.charterOffers?.length, world.charterOffers?.length);
    assert.ok((loadedWorld.charterHubs?.length ?? 0) > 0);
    assert.ok(
      (loadedWorld.charterHubs?.length ?? 0) <= (world.charterHubs?.length ?? 0),
    );
    assert.ok(
      loadedWorld.charterHubs?.some((hub) => hub.waitingPax > 0 || hub.attractPax > 0),
    );
    assert.equal(
      loadedWorld.charterOffers?.find((row) => row.id === offer.id)?.missionId,
      mission.id,
    );
    const loadedMission = loadedMissions.missions.find((row) => row.id === mission.id)!;
    assert.equal(loadedMission.missionType, 'charter');
    assert.equal(loadedMission.charterOfferId, offer.id);
    assert.equal(loadedMission.pax, offer.groupSize);
    assert.equal(loadedMission.baggageKg, offer.baggageKg);
    assert.equal(
      loadedWorld.charterOffers?.find((row) => row.id === offer.id)?.baggageKg,
      offer.baggageKg,
    );

    const db = new DatabaseSync(sqlitePath);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('charter_demand', 'charter_offers')
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((row) => row.name),
      ['charter_demand', 'charter_offers'],
    );
    const persistedBaggage = db
      .prepare(`SELECT baggage_kg FROM charter_offers WHERE id = ?`)
      .get(offer.id) as { baggage_kg: number };
    assert.equal(persistedBaggage.baggage_kg, offer.baggageKg);
    const persistedMissionBaggage = db
      .prepare(`SELECT baggage_kg FROM missions WHERE id = ?`)
      .get(mission.id) as { baggage_kg: number };
    assert.equal(persistedMissionBaggage.baggage_kg, offer.baggageKg);
    db.close();
    store.close();
  });
});
