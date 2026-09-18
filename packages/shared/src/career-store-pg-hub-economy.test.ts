/**
 * Unit tests for PG hub_economy_samples helpers (no live DB required for
 * placeholder / row mapping; upsert/read covered when CAREER_PG_TEST=1).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HUB_ECONOMY_SAMPLES_PG_DDL,
  readHubEconomySamplesFromPg,
  readHubEconomySamplesSinceFromPg,
  upsertHubEconomySamplesToPg,
  flushPendingHubEconomySamplesToPg,
  ensurePgHubEconomySamplesDdl,
} from './career-store-pg-hub-economy.js';
import {
  careerTestDatabaseUrlFromEnv,
  openPostgresCareerStore,
} from './career-store-postgres.js';
import { maybeQueueHubEconomyDaySample } from './career-hub-economy-sample.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { economyDayIndex } from './career-weather.js';
import { TICKS_PER_DAY } from './career-clock.js';
import type { HubEconomySample } from './types/career-economy.js';

describe('career-store-pg-hub-economy', () => {
  it('ships CREATE TABLE DDL for hub_economy_samples', () => {
    assert.match(HUB_ECONOMY_SAMPLES_PG_DDL, /CREATE TABLE IF NOT EXISTS hub_economy_samples/);
    assert.match(HUB_ECONOMY_SAMPLES_PG_DDL, /PRIMARY KEY \(world_id, icao, day_index\)/);
  });

  const url = careerTestDatabaseUrlFromEnv();
  const runLive = Boolean(url) && process.env.CAREER_PG_TEST === '1';

  (runLive ? it : it.skip)(
    'flushes day-boundary samples and reads them back',
    async () => {
      const store = await openPostgresCareerStore(url!);
      try {
        const world = createSeedEconomyWorld({ seed: 'pg-hub-samples' });
        world.tick = TICKS_PER_DAY; // day 1 boundary from tick 0
        maybeQueueHubEconomyDaySample(world);
        const pending = world.pendingHubEconomySamples?.length ?? 0;
        assert.ok(pending > 100, `expected queued samples, got ${pending}`);

        await store.saveEconomy(world);
        assert.equal(world.pendingHubEconomySamples, undefined);

        const day = economyDayIndex(world.tick);
        const all = await store.readHubEconomySamplesSince({ sinceDay: day });
        assert.ok(all.length >= pending * 0.9, `read ${all.length} vs pending ${pending}`);

        const icao = all[0]!.icao;
        const one = await store.readHubEconomySamples({ icao, sinceDay: day });
        assert.ok(one.some((s: HubEconomySample) => s.icao === icao && s.dayIndex === day));
      } finally {
        store.close();
      }
    },
  );

  it('exports pool helpers used by the store', () => {
    assert.equal(typeof ensurePgHubEconomySamplesDdl, 'function');
    assert.equal(typeof upsertHubEconomySamplesToPg, 'function');
    assert.equal(typeof flushPendingHubEconomySamplesToPg, 'function');
    assert.equal(typeof readHubEconomySamplesFromPg, 'function');
    assert.equal(typeof readHubEconomySamplesSinceFromPg, 'function');
  });
});
