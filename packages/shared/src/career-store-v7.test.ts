import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import {
  CAREER_STORE_SCHEMA_VERSION,
  HUB_ECONOMY_SAMPLE_RETENTION_DAYS,
  openCareerStore,
} from './career-store.js';
import {
  ensureV7Ddl,
  HUB_ECONOMY_SAMPLE_RETENTION_DAYS as RETENTION,
  pruneHubEconomySamples,
  readHubEconomySamples,
  upsertHubEconomySamples,
} from './career-store-v7.js';
import { maybeQueueHubEconomyDaySample } from './career-hub-economy-sample.js';
import type { HubEconomySample } from './types/career-economy.js';

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

function sampleRow(partial: Partial<HubEconomySample> & { icao: string; dayIndex: number }): HubEconomySample {
  return {
    icao: partial.icao,
    dayIndex: partial.dayIndex,
    tick: partial.tick ?? partial.dayIndex * 96,
    activityScore: partial.activityScore ?? 40,
    hubLevel: partial.hubLevel ?? 1,
    quiet: partial.quiet ?? false,
    jetAFill: partial.jetAFill ?? 0.5,
    outboundLots: partial.outboundLots ?? 2,
    outboundKg: partial.outboundKg ?? 1_000,
    payP50Usd: partial.payP50Usd ?? 500,
    kgGa: partial.kgGa ?? 200,
    kgTp: partial.kgTp ?? 800,
    kgMedium: partial.kgMedium ?? 0,
    kgNarrow: partial.kgNarrow ?? 0,
    kgWide: partial.kgWide ?? 0,
    commodities: partial.commodities ?? [
      { id: 'general', fill: 0.4, spotUsd: 1.2 },
    ],
  };
}

describe('career store v7 hub economy samples', () => {
  it('migrates schema to v7 and flushes pending samples on save', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v7-hub-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);
    assert.equal(CAREER_STORE_SCHEMA_VERSION, '7');
    assert.equal(HUB_ECONOMY_SAMPLE_RETENTION_DAYS, RETENTION);

    const world = createSeedEconomyWorld({ seed: 'v7-hub-stats' });
    world.lastBatchAtMs = Date.now();
    world.tick = 96;
    maybeQueueHubEconomyDaySample(world);
    assert.ok((world.pendingHubEconomySamples?.length ?? 0) > 0);
    const expected = world.pendingHubEconomySamples!.length;

    await store.saveEconomy(world);
    assert.equal(world.pendingHubEconomySamples, undefined);

    const anyIcao =
      world.airports.find((a) => !a.bushTripOnly)?.icao ?? 'SBGR';
    const anyRows = store.readHubEconomySamples({ icao: anyIcao, sinceDay: 0 });
    assert.ok(anyRows.length >= 1, `expected samples for ${anyIcao}`);
    assert.equal(anyRows[0]!.dayIndex, 1);

    const db = new DatabaseSync(store.sqlitePath!);
    try {
      const count = db
        .prepare(`SELECT COUNT(*) AS n FROM hub_economy_samples WHERE world_id = 'local'`)
        .get() as { n: number };
      assert.equal(Number(count.n), expected);
      const blob = JSON.parse(
        (db.prepare(`SELECT json FROM economy_json WHERE id = 1`).get() as { json: string })
          .json,
      ) as Record<string, unknown>;
      assert.equal(blob.pendingHubEconomySamples, undefined);
    } finally {
      db.close();
    }
    store.close();
  });

  it('prunes samples older than retention', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '7');
    `);
    ensureV7Ddl(db);
    const samples: HubEconomySample[] = [];
    for (let d = 0; d <= 40; d += 1) {
      samples.push(sampleRow({ icao: 'SBSP', dayIndex: d }));
    }
    upsertHubEconomySamples(db, samples);
    const removed = pruneHubEconomySamples(db, 40, 30);
    assert.ok(removed >= 11);
    const kept = readHubEconomySamples(db, { icao: 'SBSP', sinceDay: 0 });
    assert.equal(kept.length, 30);
    assert.equal(kept[0]!.dayIndex, 11);
    assert.equal(kept[kept.length - 1]!.dayIndex, 40);
  });
});
