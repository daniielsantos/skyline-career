/**
 * Postgres career store smoke (skipped when CAREER_PG / DATABASE unreachable).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  careerDatabaseUrlFromEnv,
  openPostgresCareerStore,
} from './career-store-postgres.js';

describe('career store postgres', () => {
  it('careerDatabaseUrlFromEnv reads CAREER_PG', () => {
    assert.equal(careerDatabaseUrlFromEnv({}), null);
    assert.ok(
      careerDatabaseUrlFromEnv({ CAREER_PG: '1' })?.includes('postgres://'),
    );
  });

  it('opens schema and registers an account when Postgres is up', async (t) => {
    const url =
      process.env.CAREER_DATABASE_URL?.trim() ||
      careerDatabaseUrlFromEnv({ CAREER_PG: '1' });
    if (!url) {
      t.skip('no CAREER_DATABASE_URL');
      return;
    }
    let store;
    try {
      store = await openPostgresCareerStore(url);
    } catch (err) {
      t.skip(
        `postgres unreachable: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }
    try {
      const login = `pg_${Date.now().toString(36)}`;
      const registered = await store.authRegister({
        loginName: login,
        displayName: 'Pg Pilot',
        password: 'secret12',
      });
      assert.ok(registered.session.token);
      assert.ok(registered.company?.id);
      const session = await store.authResolveSession(registered.session.token);
      assert.equal(session?.account.loginName, login);
      const economy = await store.loadEconomy({ maxCatchUpTicks: 0 });
      assert.ok(Array.isArray(economy.world.airports));
      assert.ok(economy.world.airports.length > 0);
      assert.ok(Array.isArray(economy.world.lots));
      const lots = await store['pool'].query(`SELECT COUNT(*)::int AS n FROM lots`);
      assert.ok((lots.rows[0] as { n: number }).n > 0, 'lots table should be populated');
      const airports = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM airports`,
      );
      assert.ok(
        (airports.rows[0] as { n: number }).n > 0,
        'airports table should be populated',
      );
      const npcs = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM npcs`,
      );
      assert.ok(
        (npcs.rows[0] as { n: number }).n > 0,
        'npcs table should be populated',
      );
      const thin = await store['pool'].query(
        `SELECT payload FROM economy_json WHERE id = 1`,
      );
      const payload = thin.rows[0]?.payload as {
        airports?: unknown[];
        npcs?: unknown[];
        aircraftInstances?: unknown[];
        charterOffers?: unknown[];
      };
      assert.equal(
        Array.isArray(payload?.airports) ? payload.airports.length : -1,
        0,
        'economy_json stub should have empty airports[]',
      );
      assert.equal(
        Array.isArray(payload?.npcs) ? payload.npcs.length : -1,
        0,
        'economy_json stub should have empty npcs[]',
      );
      assert.equal(
        Array.isArray(payload?.aircraftInstances)
          ? payload.aircraftInstances.length
          : -1,
        0,
        'economy_json stub should have empty aircraftInstances[]',
      );
      if (Array.isArray(payload?.charterOffers)) {
        assert.equal(
          payload.charterOffers.length,
          0,
          'economy_json stub should have empty charterOffers[]',
        );
      }
      const pool = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM aircraft_instances`,
      );
      // Fresh worlds may seed pool later; table must exist and hydrate path must run.
      assert.ok(
        typeof (pool.rows[0] as { n: number }).n === 'number',
        'aircraft_instances table should exist',
      );
      if ((economy.world.charterOffers?.length ?? 0) > 0) {
        const offers = await store['pool'].query(
          `SELECT COUNT(*)::int AS n FROM charter_offers`,
        );
        assert.ok(
          (offers.rows[0] as { n: number }).n > 0,
          'charter_offers table should be populated when world has offers',
        );
      }
      if ((economy.world.charterHubs?.length ?? 0) > 0) {
        const hubs = await store['pool'].query(
          `SELECT COUNT(*)::int AS n FROM charter_hubs`,
        );
        assert.ok(
          (hubs.rows[0] as { n: number }).n > 0,
          'charter_hubs table should be populated when world has hubs',
        );
      }
    } finally {
      store.close();
    }
  });
});
