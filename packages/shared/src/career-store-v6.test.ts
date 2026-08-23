import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { ensureWorldAircraftPool, markDealerInstanceSold } from './career-aircraft-pool.js';
import { CAREER_STORE_SCHEMA_VERSION, openCareerStore } from './career-store.js';
import type { AircraftInstance } from './types/career-economy.js';

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

function readInstanceStatus(sqlitePath: string, id: string): string | undefined {
  const db = new DatabaseSync(sqlitePath);
  try {
    const row = db
      .prepare(
        `SELECT status FROM aircraft_instances WHERE world_id = 'local' AND id = ?`,
      )
      .get(id) as { status: string } | undefined;
    return row?.status;
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

describe('career store v6', () => {
  it('persists the dealer pool as SoT without copying it into economy_json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-v6-pool-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(schemaVersionInDb(store.sqlitePath!), CAREER_STORE_SCHEMA_VERSION);

    const world = createSeedEconomyWorld({ seed: 'v6-aircraft-pool' });
    world.lastBatchAtMs = Date.now();
    ensureWorldAircraftPool(world);
    const pool = world.aircraftInstances ?? [];
    assert.ok(pool.length > 0);
    const sample = pool.find((row: AircraftInstance) => row.status === 'available');
    assert.ok(sample);
    markDealerInstanceSold(world, sample.id);

    await store.saveEconomy(world);

    assert.equal(countRows(store.sqlitePath!, 'aircraft_instances'), pool.length);
    assert.equal(readInstanceStatus(store.sqlitePath!, sample.id), 'sold');

    const blob = readEconomyBlob(store.sqlitePath!);
    assert.equal(
      Array.isArray(blob.aircraftInstances) ? blob.aircraftInstances.length : -1,
      0,
    );
    assert.equal(blob.seed, 'v6-aircraft-pool');

    store.close();
    const again = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const loaded = await again.loadEconomy();
    assert.equal(loaded.world.aircraftInstances?.length, pool.length);
    const reloaded = loaded.world.aircraftInstances?.find(
      (row: AircraftInstance) => row.id === sample.id,
    );
    assert.ok(reloaded);
    assert.equal(reloaded.status, 'sold');
    assert.equal(reloaded.registration, sample.registration);
    const blob2 = readEconomyBlob(again.sqlitePath!);
    assert.equal(
      Array.isArray(blob2.aircraftInstances) ? blob2.aircraftInstances.length : -1,
      0,
    );
    again.close();
  });
});
