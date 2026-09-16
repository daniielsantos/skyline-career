/**
 * Postgres career store smoke.
 * Prefer CAREER_DATABASE_URL_TEST / CAREER_PG_TEST=1 → skyline_test.
 * Refuse mutating live lab DB `skyline` unless CAREER_PG_ALLOW_LAB_MUTATION=1.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyMissionsStateV2 } from './career-fleet.js';
import {
  assertCareerWorldSeedAllowed,
  careerDatabaseUrlFromEnv,
  careerTestDatabaseUrlFromEnv,
  isCareerWorldSeedAllowed,
  isCareerLabDatabaseUrl,
  openPostgresCareerStore,
} from './career-store-postgres.js';
import { PgEconomyRevisionConflictError } from './career-store-pg-world.js';

describe('career store postgres', () => {
  it('allows seed by default for dev and requires an explicit production opt-in', () => {
    assert.equal(isCareerWorldSeedAllowed({}), true);
    assert.equal(
      isCareerWorldSeedAllowed({ CAREER_WORLD_ALLOW_SEED: '1' }),
      true,
    );
    assert.equal(
      isCareerWorldSeedAllowed({ CAREER_WORLD_ALLOW_SEED: 'true' }),
      true,
    );
    assert.equal(
      isCareerWorldSeedAllowed({ CAREER_WORLD_ALLOW_SEED: '0' }),
      false,
    );
    assert.equal(
      isCareerWorldSeedAllowed({ CAREER_WORLD_ALLOW_SEED: 'typo' }),
      false,
    );
    assert.doesNotThrow(() =>
      assertCareerWorldSeedAllowed(true, {
        CAREER_WORLD_ALLOW_SEED: '0',
      }),
    );
    assert.throws(
      () =>
        assertCareerWorldSeedAllowed(false, {
          CAREER_WORLD_ALLOW_SEED: '0',
        }),
      /refusing automatic world creation/,
    );
  });

  it('careerDatabaseUrlFromEnv reads CAREER_PG', () => {
    assert.equal(careerDatabaseUrlFromEnv({}), null);
    assert.ok(
      careerDatabaseUrlFromEnv({ CAREER_PG: '1' })?.includes('postgres://'),
    );
  });

  it('careerTestDatabaseUrlFromEnv prefers test DB', () => {
    assert.equal(careerTestDatabaseUrlFromEnv({}), null);
    assert.ok(
      careerTestDatabaseUrlFromEnv({ CAREER_PG_TEST: '1' })?.includes(
        'skyline_test',
      ),
    );
    assert.equal(
      careerTestDatabaseUrlFromEnv({
        CAREER_DATABASE_URL_TEST: 'postgres://u:p@h/custom_test',
      }),
      'postgres://u:p@h/custom_test',
    );
  });

  it('isCareerLabDatabaseUrl detects skyline vs skyline_test', () => {
    assert.equal(
      isCareerLabDatabaseUrl('postgres://skyline:skyline@127.0.0.1:5432/skyline'),
      true,
    );
    assert.equal(
      isCareerLabDatabaseUrl(
        'postgres://skyline:skyline@127.0.0.1:5432/skyline_test',
      ),
      false,
    );
  });

  it('opens schema and registers an account when Postgres is up', async (t) => {
    const url =
      careerTestDatabaseUrlFromEnv(process.env) ||
      process.env.CAREER_DATABASE_URL?.trim() ||
      careerDatabaseUrlFromEnv({ CAREER_PG: '1' });
    if (!url) {
      t.skip('no CAREER_DATABASE_URL_TEST / CAREER_DATABASE_URL');
      return;
    }
    const allowLab =
      (process.env.CAREER_PG_ALLOW_LAB_MUTATION ?? '').trim() === '1';
    if (isCareerLabDatabaseUrl(url) && !allowLab) {
      t.skip(
        'refusing live lab DB skyline — set CAREER_DATABASE_URL_TEST or CAREER_PG_TEST=1 (or CAREER_PG_ALLOW_LAB_MUTATION=1)',
      );
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
    let companyId: string | undefined;
    try {
      const login = `pg_${Date.now().toString(36)}`;
      const registered = await store.authRegister({
        loginName: login,
        displayName: 'Pg Pilot',
        password: 'secret12',
      });
      assert.ok(registered.session.token);
      assert.ok(registered.company?.id);
      companyId = registered.company!.id;
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
      const economyJsonReg = await store['pool'].query(
        `SELECT to_regclass('public.economy_json') AS reg`,
      );
      assert.equal(
        economyJsonReg.rows[0]?.reg,
        null,
        'economy_json stub table should be dropped (schema v15)',
      );
      const companyMissionsReg = await store['pool'].query(
        `SELECT to_regclass('public.company_missions') AS reg`,
      );
      assert.equal(
        companyMissionsReg.rows[0]?.reg,
        null,
        'company_missions stub table should be dropped (schema v15)',
      );
      const miscRes = await store['pool'].query(
        `SELECT misc_json FROM economy_meta WHERE world_id = 'local'`,
      );
      const misc = miscRes.rows[0]?.misc_json;
      assert.ok(
        misc != null && typeof misc === 'object' && !Array.isArray(misc),
        'economy_meta.misc_json should be an object',
      );
      const missions = emptyMissionsStateV2();
      missions.pilotName = 'Pg Pilot';
      missions.walletUsd = 12_500;
      missions.hubSelected = true;
      missions.homeHubIcao = 'SBGR';
      missions.fleet = [
        {
          id: 'acf_test_1',
          aircraftClassId: 'light_ga',
          airframeTypeId: 'asobo-c172sp-cargo',
          label: 'C172',
          registration: 'PR-TST',
          locationIcao: 'SBGR',
          fuelKg: 100,
          fuelCapacityKg: 200,
          status: 'parked',
          ownership: 'owned',
          condition: 'good',
          hoursAirframe: 12,
          hoursEngine: 10,
          airframeConditionPct: 94,
          engineConditionPct: 96,
        },
      ];
      await store.saveMissions(missions, { companyId });
      const loaded = await store.loadMissions({ companyId });
      assert.equal(loaded.pilotName, 'Pg Pilot');
      assert.equal(loaded.walletUsd, 12_500);
      assert.equal(loaded.fleet[0]?.registration, 'PR-TST');
      assert.equal(loaded.fleet[0]?.hoursAirframe, 12);
      const companyState = await store['pool'].query(
        `SELECT wallet_usd FROM company_state WHERE company_id = $1`,
        [companyId],
      );
      assert.equal(
        Number((companyState.rows[0] as { wallet_usd: string | number }).wallet_usd),
        12_500,
        'company_state should persist wallet',
      );
      const fleetRow = await store['pool'].query(
        `SELECT registration, hours_airframe, payload_json
         FROM fleet_aircraft WHERE company_id = $1 AND id = $2`,
        [companyId, 'acf_test_1'],
      );
      const fr = fleetRow.rows[0] as {
        registration: string;
        hours_airframe: number;
        payload_json: unknown;
      };
      assert.equal(fr.registration, 'PR-TST');
      assert.equal(Number(fr.hours_airframe), 12);
      assert.ok(
        fr.payload_json == null ||
          (typeof fr.payload_json === 'object' &&
            !('registration' in (fr.payload_json as object))),
        'promoted fields should not remain in payload_json',
      );
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

      // Light slice persists must not rewrite the whole economy (smoke: demand board).
      const beforeDemand = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM demand_orders`,
      );
      const beforeLots = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM lots`,
      );
      await store.persistInboundPending(economy.world);
      const afterLots = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM lots`,
      );
      assert.equal(
        (afterLots.rows[0] as { n: number }).n,
        (beforeLots.rows[0] as { n: number }).n,
        'persistInboundPending must not rewrite lots',
      );
      await store.persistDemandBoardTables(economy.world);
      const afterDemand = await store['pool'].query(
        `SELECT COUNT(*)::int AS n FROM demand_orders`,
      );
      assert.equal(
        (afterDemand.rows[0] as { n: number }).n,
        (beforeDemand.rows[0] as { n: number }).n,
      );
      assert.equal(
        typeof store.settleWorldCompaniesPassiveFees,
        'function',
        'PostgresCareerStore should expose settleWorldCompaniesPassiveFees',
      );

      // Two processes must observe revision changes and reject stale writes.
      const peer = await openPostgresCareerStore(url);
      try {
        const peerSnapshot = await peer.loadEconomy({ maxCatchUpTicks: 0 });
        const beforeRevision = await store['pool'].query(
          `SELECT revision FROM economy_meta WHERE world_id = 'local'`,
        );
        await store.persistInboundPending(economy.world);
        const afterRevision = await store['pool'].query(
          `SELECT revision FROM economy_meta WHERE world_id = 'local'`,
        );
        assert.ok(
          Number(afterRevision.rows[0]?.revision) >
            Number(beforeRevision.rows[0]?.revision),
          'scoped persistence must advance economy revision',
        );
        await assert.rejects(
          () => peer.persistInboundPending(peerSnapshot.world),
          (error: unknown) => error instanceof PgEconomyRevisionConflictError,
          'stale peer must not overwrite a newer economy snapshot',
        );
        const refreshed = await peer.loadEconomy({ maxCatchUpTicks: 0 });
        assert.notEqual(
          refreshed.world,
          peerSnapshot.world,
          'peer should atomically replace its stale RAM snapshot',
        );
        assert.equal(refreshed.world.tick, economy.world.tick);
      } finally {
        peer.close();
      }
    } finally {
      // Always scrub the throwaway tenant.
      if (companyId) {
        const pool = store['pool'] as import('pg').Pool;
        const members = await pool.query(
          `SELECT account_id FROM company_members WHERE company_id = $1`,
          [companyId],
        );
        const accountIds = members.rows.map(
          (r) => (r as { account_id: string }).account_id,
        );
        await pool.query(`DELETE FROM fleet_aircraft WHERE company_id = $1`, [
          companyId,
        ]);
        await pool.query(`DELETE FROM ledger WHERE company_id = $1`, [companyId]);
        await pool.query(`DELETE FROM missions WHERE company_id = $1`, [
          companyId,
        ]);
        await pool.query(`DELETE FROM company_state WHERE company_id = $1`, [
          companyId,
        ]);
        await pool.query(`DELETE FROM company_members WHERE company_id = $1`, [
          companyId,
        ]);
        await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
        if (accountIds.length > 0) {
          await pool.query(
            `DELETE FROM account_sessions WHERE account_id = ANY($1::text[])`,
            [accountIds],
          );
          await pool.query(`DELETE FROM accounts WHERE id = ANY($1::text[])`, [
            accountIds,
          ]);
        }
      }
      store.close();
    }
  });
});
