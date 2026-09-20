import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  CAREER_STORE_SCHEMA_VERSION,
  emptyMissionsStateV2,
  hashPassword,
  isCareerAuthRequired,
  isCareerWorldFixed,
  openCareerStore,
  verifyPassword,
} from './index.js';
import { migrateV9toV10IfNeeded } from './career-store-v10.js';
import { DatabaseSync } from 'node:sqlite';

describe('career auth', () => {
  it('hashes and verifies passwords', () => {
    const encoded = hashPassword('secret12');
    assert.equal(verifyPassword('secret12', encoded), true);
    assert.equal(verifyPassword('wrong', encoded), false);
  });

  it('isCareerAuthRequired reads CAREER_AUTH', () => {
    assert.equal(isCareerAuthRequired({}), false);
    assert.equal(isCareerAuthRequired({ CAREER_AUTH: '1' }), true);
    assert.equal(isCareerAuthRequired({ CAREER_AUTH: 'off' }), false);
  });

  it('isCareerWorldFixed reads CAREER_WORLD_FIXED', () => {
    assert.equal(isCareerWorldFixed({}), false);
    assert.equal(isCareerWorldFixed({ CAREER_WORLD_FIXED: '1' }), true);
    assert.equal(isCareerWorldFixed({ CAREER_WORLD_FIXED: 'off' }), false);
  });

  it('migrates schema to v10 and registers account→company', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-auth-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(CAREER_STORE_SCHEMA_VERSION, '14');
    assert.equal(store.supportsAuth, true);

    const registered = await Promise.resolve(
      store.authRegister({
        loginName: 'Alice_1',
        displayName: 'Alice Co',
        password: 'secret12',
      }),
    );
    assert.equal(registered.account.loginName, 'alice_1');
    assert.ok(registered.company);
    assert.equal(registered.company!.id, 'co_alice_1');
    assert.ok(registered.session.token.length > 20);

    const session = await Promise.resolve(
      store.authResolveSession(registered.session.token),
    );
    assert.ok(session);
    assert.equal(session!.account.id, registered.account.id);
    assert.equal(session!.companies.length, 1);
    assert.equal(session!.companies[0]!.id, registered.company!.id);

    assert.equal(
      await Promise.resolve(
        store.authAccountOwnsCompany(registered.account.id, registered.company!.id),
      ),
      true,
    );
    assert.equal(
      await Promise.resolve(
        store.authAccountOwnsCompany(registered.account.id, 'co_other'),
      ),
      false,
    );

    const login = await Promise.resolve(
      store.authLogin({ loginName: 'alice_1', password: 'secret12' }),
    );
    assert.equal(login.account.id, registered.account.id);
    assert.notEqual(login.session.token, registered.session.token);
    // Single-session: previous Bearer is revoked on login.
    assert.equal(
      await Promise.resolve(store.authResolveSession(registered.session.token)),
      null,
    );
    assert.ok(await Promise.resolve(store.authResolveSession(login.session.token)));

    const listed = await Promise.resolve(store.authListSessions());
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.accountId, registered.account.id);
    assert.equal(listed[0]!.online, true);
    assert.equal(listed[0]!.tokenHashPrefix.length, 8);

    assert.equal(
      await Promise.resolve(store.authRevokeSession(login.session.token)),
      true,
    );
    assert.equal(
      await Promise.resolve(store.authResolveSession(login.session.token)),
      null,
    );

    // Seed missions for the new company so store is usable.
    const missions = emptyMissionsStateV2();
    await store.saveMissions(missions, { companyId: registered.company!.id });
    store.close();
  });

  it('purges expired sessions and marks offline by last_seen window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-auth-purge-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const t0 = 1_700_000_000_000;
    const registered = await Promise.resolve(
      store.authRegister({
        loginName: 'purge_me',
        displayName: 'Purge',
        password: 'secret12',
        nowMs: t0,
        sessionTtlMs: 60_000,
      }),
    );
    assert.ok(
      await Promise.resolve(
        store.authResolveSession(registered.session.token, {
          nowMs: t0 + 1_000,
          touch: false,
        }),
      ),
    );
    // Past TTL → resolve + opportunistic purge leave zero rows.
    assert.equal(
      await Promise.resolve(
        store.authResolveSession(registered.session.token, {
          nowMs: t0 + 120_000,
        }),
      ),
      null,
    );
    assert.equal(
      (await Promise.resolve(store.authListSessions({ nowMs: t0 + 120_000 }))).length,
      0,
    );

    const again = await Promise.resolve(
      store.authLogin({
        loginName: 'purge_me',
        password: 'secret12',
        nowMs: t0 + 200_000,
        sessionTtlMs: 86_400_000,
      }),
    );
    const online = await Promise.resolve(
      store.authListSessions({
        nowMs: t0 + 200_000 + 30_000,
        onlineWindowMs: 60_000,
      }),
    );
    assert.equal(online.length, 1);
    assert.equal(online[0]!.online, true);

    const stale = await Promise.resolve(
      store.authListSessions({
        nowMs: t0 + 200_000 + 120_000,
        onlineWindowMs: 60_000,
      }),
    );
    assert.equal(stale.length, 1);
    assert.equal(stale[0]!.online, false);

    assert.equal(
      await Promise.resolve(store.authRevokeSession(again.session.token)),
      true,
    );
    store.close();
  });

  it('rejects spoof: second account cannot resolve foreign company membership', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-auth2-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const a = await Promise.resolve(
      store.authRegister({
        loginName: 'pilot_a',
        displayName: 'Pilot A',
        password: 'secret12',
      }),
    );
    const b = await Promise.resolve(
      store.authRegister({
        loginName: 'pilot_b',
        displayName: 'Pilot B',
        password: 'secret12',
      }),
    );
    assert.ok(a.company && b.company);
    assert.notEqual(a.company!.id, b.company!.id);
    assert.equal(
      await Promise.resolve(
        store.authAccountOwnsCompany(b.account.id, a.company!.id),
      ),
      false,
    );
    const bSession = (await Promise.resolve(
      store.authResolveSession(b.session.token),
    ))!;
    assert.equal(
      bSession.companies.some((c) => c.id === a.company!.id),
      false,
    );
    store.close();
  });

  it('claims orphan company with zero members', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-auth-orphan-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    await Promise.resolve(
      store.ensureCompany({ id: 'co_labubu', displayName: 'Labubu' }),
    );
    const registered = await Promise.resolve(
      store.authRegister({
        loginName: 'labubu',
        displayName: 'Labubu Owner',
        password: 'secret12',
        createCompany: false,
        claimCompanyId: 'co_labubu',
      }),
    );
    assert.equal(registered.company?.id, 'co_labubu');
    assert.equal(
      await Promise.resolve(
        store.authAccountOwnsCompany(registered.account.id, 'co_labubu'),
      ),
      true,
    );
    store.close();
  });

  it('migrateV9toV10IfNeeded is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '9');
      CREATE TABLE companies (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        home_hub_icao TEXT NOT NULL DEFAULT '',
        home_country_id TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        world_id TEXT
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
    migrateV9toV10IfNeeded(db, metaSet, '10');
    migrateV9toV10IfNeeded(db, metaSet, '10');
    const version = db
      .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
      .get() as { value: string };
    assert.equal(version.value, '10');
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`)
      .get() as { name: string } | undefined;
    assert.equal(tables?.name, 'accounts');
    db.close();
  });
});
