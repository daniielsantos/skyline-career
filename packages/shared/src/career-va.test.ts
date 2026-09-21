import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  CAREER_STORE_SCHEMA_VERSION,
  openCareerStore,
  type CareerStore,
} from './career-store.js';
import {
  VA_MEMBER_CAP,
  listOpenAirlineDeskHolds,
  listOpenInternalHaulHolds,
  quoteMemberAirlineCutUsd,
  quoteMemberRouteCutUsd,
  vaDayKeyFromTick,
} from './career-va.js';
import { applySettleWalletDeltas } from './career-persist-commands.js';
import {
  acceptWarehouseBridge,
  holdWarehouseBridge,
} from './career-warehouse-bridge.js';
import {
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
} from './career-warehouse.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { departMission, settleMission } from './career-mission.js';
import { DatabaseSync } from 'node:sqlite';

describe('VA IH-2', () => {
  let dir: string;
  let store: CareerStore;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'career-va-'));
    store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
  });

  after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('bumps schema to v19 with VA airline cut', () => {
    assert.equal(CAREER_STORE_SCHEMA_VERSION, '19');
    const dbPath = store.sqlitePath!;
    const db = new DatabaseSync(dbPath);
    const row = db
      .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
      .get() as { value: string };
    assert.equal(row.value, '19');
    const cols = db.prepare(`PRAGMA table_info(companies)`).all() as Array<{
      name: string;
    }>;
    assert.ok(cols.some((c) => c.name === 'member_route_cut_pct'));
    assert.ok(cols.some((c) => c.name === 'member_airline_cut_pct'));
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('company_invites','company_haul_stats')`,
      )
      .all() as Array<{ name: string }>;
    assert.equal(tables.length, 2);
    db.close();
  });

  it('publish VA sets home_country_id from hub ICAO', async () => {
    const reg = await Promise.resolve(
      store.authRegister({
        loginName: 'va_country_pub',
        displayName: 'Country Pub',
        password: 'secret1',
      }),
    );
    const companyId = reg.company!.id;
    const published = await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: reg.account.id,
        displayName: 'Country Air',
        homeHubIcao: 'SBKP',
      }),
    );
    assert.equal(published.homeCountryId, 'BR');
    const db = new DatabaseSync(store.sqlitePath!);
    const row = db
      .prepare(
        `SELECT home_hub_icao, home_country_id FROM companies WHERE id = ?`,
      )
      .get(companyId) as {
      home_hub_icao: string;
      home_country_id: string;
    };
    assert.equal(row.home_hub_icao, 'SBKP');
    assert.equal(row.home_country_id, 'BR');
    db.close();
  });

  it('backfills empty home_country_id from home_hub_icao on open', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'career-va-bf-'));
    const store2 = await openCareerStore({ careerDir: dir2, backend: 'sqlite' });
    const dbPath = store2.sqlitePath!;
    store2.close();
    const db = new DatabaseSync(dbPath);
    db.prepare(
      `INSERT INTO companies (id, display_name, home_hub_icao, home_country_id, world_id, created_at_ms, va_listed, recruiting)
       VALUES ('co_bf_gap', 'Gap Air', 'SBKP', '', 'local', ?, 1, 1)`,
    ).run(Date.now());
    db.close();
    const reopened = await openCareerStore({
      careerDir: dir2,
      backend: 'sqlite',
    });
    const check = new DatabaseSync(reopened.sqlitePath!);
    const row = check
      .prepare(
        `SELECT home_country_id FROM companies WHERE id = 'co_bf_gap'`,
      )
      .get() as { home_country_id: string };
    assert.equal(row.home_country_id, 'BR');
    check.close();
    reopened.close();
    rmSync(dir2, { recursive: true, force: true });
  });

  it('invite join kick and member cap', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_owner1',
        displayName: 'VA Owner',
        password: 'secret1',
      }),
    );
    assert.ok(owner.company);
    const companyId = owner.company!.id;

    const invite = await Promise.resolve(
      store.vaCreateInvite({
        companyId,
        createdByAccountId: owner.account.id,
      }),
    );
    assert.match(invite.code, /^VA-/);

    const pilot = await Promise.resolve(
      store.authRegister({
        loginName: 'va_pilot1',
        displayName: 'VA Pilot',
        password: 'secret1',
      }),
    );

    const joined = await Promise.resolve(
      store.vaJoinInvite({ code: invite.code, accountId: pilot.account.id }),
    );
    assert.equal(joined.companyId, companyId);
    assert.equal(joined.member.role, 'pilot');

    const members = await Promise.resolve(store.vaListMembers(companyId));
    assert.ok(members.some((m) => m.accountId === pilot.account.id));

    await Promise.resolve(
      store.vaSetRole({
        companyId,
        actorAccountId: owner.account.id,
        targetAccountId: pilot.account.id,
        role: 'dispatcher',
      }),
    );
    const afterRole = await Promise.resolve(
      store.vaGetMembership(pilot.account.id, companyId),
    );
    assert.equal(afterRole?.role, 'dispatcher');

    await Promise.resolve(
      store.vaKick({
        companyId,
        actorAccountId: owner.account.id,
        targetAccountId: pilot.account.id,
      }),
    );
    assert.equal(
      await Promise.resolve(store.vaGetMembership(pilot.account.id, companyId)),
      null,
    );

    // Cap: fill to VA_MEMBER_CAP then reject
    const fillInvite = await Promise.resolve(
      store.vaCreateInvite({
        companyId,
        createdByAccountId: owner.account.id,
        maxUses: VA_MEMBER_CAP,
      }),
    );
    for (let i = 0; i < VA_MEMBER_CAP - 1; i++) {
      const acc = await Promise.resolve(
        store.authRegister({
          loginName: `va_fill${i}`,
          displayName: `Fill ${i}`,
          password: 'secret1',
        }),
      );
      await Promise.resolve(
        store.vaJoinInvite({
          code: fillInvite.code,
          accountId: acc.account.id,
        }),
      );
    }
    const overflow = await Promise.resolve(
      store.authRegister({
        loginName: 'va_overflow',
        displayName: 'Overflow',
        password: 'secret1',
      }),
    );
    await assert.rejects(
      async () =>
        store.vaJoinInvite({
          code: fillInvite.code,
          accountId: overflow.account.id,
        }),
      /full/i,
    );
  });

  it('invite never expires and renew revokes prior code', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_invite_ttl',
        displayName: 'Invite TTL',
        password: 'secret1',
      }),
    );
    assert.ok(owner.company);
    const companyId = owner.company!.id;

    const first = await Promise.resolve(
      store.vaCreateInvite({
        companyId,
        createdByAccountId: owner.account.id,
      }),
    );
    assert.ok(first.expiresAtMs > Date.now() + 365 * 24 * 60 * 60 * 1000);

    const second = await Promise.resolve(
      store.vaCreateInvite({
        companyId,
        createdByAccountId: owner.account.id,
      }),
    );
    assert.notEqual(first.code, second.code);

    const open = await Promise.resolve(store.vaListInvites(companyId));
    assert.equal(open.length, 1);
    assert.equal(open[0]?.code, second.code);

    const pilot = await Promise.resolve(
      store.authRegister({
        loginName: 'va_invite_ttl_p',
        displayName: 'Invite Pilot',
        password: 'secret1',
      }),
    );
    await assert.rejects(
      async () =>
        store.vaJoinInvite({
          code: first.code,
          accountId: pilot.account.id,
        }),
      /expired/i,
    );
    const joined = await Promise.resolve(
      store.vaJoinInvite({
        code: second.code,
        accountId: pilot.account.id,
      }),
    );
    assert.equal(joined.companyId, companyId);
  });

  it('lists open Internal Haul holds on the VA board', () => {
    const world = createSeedEconomyWorld({ seed: 'va-board' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Board',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 100,
    });
    const open = listOpenInternalHaulHolds(state);
    assert.equal(open.length, 1);
    assert.ok((open[0]!.pilotPayUsd ?? 0) > 0);
  });

  it('cross-company settle debits VA and credits pilot home', () => {
    const world = createSeedEconomyWorld({ seed: 'va-cross-pay' });
    const va = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    va.walletUsd = 800_000;
    buyWarehouseAtPickupHub(va, world, 'SBGR');
    buyWarehouseAtPickupHub(va, world, 'SBCT');
    depositCargoToWarehouse(va, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    const aircraft = va.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const accepted = acceptWarehouseBridge(va, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 100,
      pilotAccountId: 'acc_pilot',
      pilotHomeCompanyId: 'co_pilot_home',
    });
    assert.equal(accepted.mission.pilotHomeCompanyId, 'co_pilot_home');
    const departed = departMission(world, accepted.mission, { fleet: va });
    const settled = settleMission(world, departed.mission, {
      fleet: va,
      skipMinAirborneGate: true,
    });
    const before = va.walletUsd;
    const wallet = applySettleWalletDeltas(va, world.tick, settled, {
      companyId: 'co_va_ops',
    });
    assert.ok(wallet.pilotPayCredit);
    assert.equal(wallet.pilotPayCredit!.companyId, 'co_pilot_home');
    assert.equal(wallet.pilotPayCredit!.amountUsd, settled.walletCreditUsd);
    // VA only debited pay (+ fuel)
    assert.equal(
      va.walletUsd,
      before - settled.walletCreditUsd - settled.fuelDebitUsd,
    );
  });

  it('solo Internal Haul settle stays net 0 on pay', () => {
    const world = createSeedEconomyWorld({ seed: 'va-solo-pay' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Solo',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const before = state.walletUsd;
    const accepted = acceptWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 80,
      pilotAccountId: 'acc_solo',
      pilotHomeCompanyId: 'co_solo',
    });
    const departed = departMission(world, accepted.mission, { fleet: state });
    const settled = settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    applySettleWalletDeltas(state, world.tick, settled, {
      companyId: 'co_solo',
    });
    assert.equal(state.walletUsd, before - settled.fuelDebitUsd);
  });

  it('records haul ranking stats', async () => {
    const day = vaDayKeyFromTick(960);
    const reg = await Promise.resolve(
      store.authRegister({
        loginName: 'va_ranker',
        displayName: 'Ranker',
        password: 'secret1',
      }),
    );
    const companyId = reg.company!.id;
    await Promise.resolve(
      store.vaRecordHaulStats({
        companyId,
        accountId: reg.account.id,
        dayKey: day,
        nm: 400,
        payUsd: 250,
      }),
    );
    const ranking = await Promise.resolve(
      store.vaCompanyRanking({
        fromDayKey: day,
        toDayKey: day,
      }),
    );
    assert.ok(ranking.some((r) => r.companyId === companyId && r.nm >= 400));
    const pilots = await Promise.resolve(
      store.vaPilotRanking({
        companyId,
        fromDayKey: day,
        toDayKey: day,
      }),
    );
    assert.ok(pilots.some((p) => p.accountId === reg.account.id));
  });

  it('records flight quality and publishes composite after sample floor', async () => {
    const day = vaDayKeyFromTick(960);
    const reg = await Promise.resolve(
      store.authRegister({
        loginName: 'va_quality',
        displayName: 'Quality',
        password: 'secret1',
      }),
    );
    const companyId = reg.company!.id;
    await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: reg.account.id,
        displayName: 'Quality Air',
        homeHubIcao: 'SBGR',
      }),
    );
    const thin = await Promise.resolve(
      store.vaFlightQuality({
        companyId,
        fromDayKey: day,
        toDayKey: day,
      }),
    );
    assert.equal(thin.qualityScore, null);
    assert.equal(thin.flightCount, 0);

    await Promise.resolve(
      store.vaRecordFlightQuality({
        companyId,
        dayKey: day,
        scorePct: 90,
        onTime: true,
      }),
    );
    await Promise.resolve(
      store.vaRecordFlightQuality({
        companyId,
        dayKey: day,
        scorePct: 80,
        onTime: true,
      }),
    );
    const mid = await Promise.resolve(
      store.vaFlightQuality({
        companyId,
        fromDayKey: day,
        toDayKey: day,
      }),
    );
    assert.equal(mid.flightCount, 2);
    assert.equal(mid.qualityScore, null);
    assert.equal(mid.avgFlightScorePct, 85);
    assert.equal(mid.onTimePct, 100);

    await Promise.resolve(
      store.vaRecordFlightQuality({
        companyId,
        dayKey: day,
        scorePct: 70,
        onTime: false,
      }),
    );
    const full = await Promise.resolve(
      store.vaFlightQuality({
        companyId,
        fromDayKey: day,
        toDayKey: day,
      }),
    );
    assert.equal(full.flightCount, 3);
    assert.ok(full.qualityScore != null);
    // avg 80, on-time 66.7 → 0.7*80 + 0.3*66.7 ≈ 76
    assert.ok(full.qualityScore! >= 75 && full.qualityScore! <= 77);

    const dir = await Promise.resolve(
      store.vaDirectory({
        fromDayKey: day,
        toDayKey: day,
      }),
    );
    const entry = dir.find((e) => e.companyId === companyId);
    assert.ok(entry?.flightQuality?.qualityScore != null);
  });

  it('directory request accept and stop recruiting', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_dir_owner',
        displayName: 'Dir Owner',
        password: 'secret1',
      }),
    );
    const companyId = owner.company!.id;
    await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: owner.account.id,
        displayName: 'Dir Airways',
        homeHubIcao: 'SBGR',
      }),
    );
    const pilot = await Promise.resolve(
      store.authRegister({
        loginName: 'va_dir_pilot',
        displayName: 'Dir Pilot',
        password: 'secret1',
      }),
    );
    const open = await Promise.resolve(
      store.vaDirectory({ accountId: pilot.account.id }),
    );
    assert.ok(open.some((e) => e.companyId === companyId && e.recruiting));

    const req = await Promise.resolve(
      store.vaCreateJoinRequest({
        companyId,
        accountId: pilot.account.id,
      }),
    );
    assert.equal(req.status, 'pending');

    await Promise.resolve(
      store.vaAcceptJoinRequest({
        requestId: req.id,
        actorAccountId: owner.account.id,
      }),
    );
    assert.ok(
      await Promise.resolve(store.vaGetMembership(pilot.account.id, companyId)),
    );

    await Promise.resolve(
      store.vaSetRecruiting({
        companyId,
        actorAccountId: owner.account.id,
        recruiting: false,
      }),
    );
    const closed = await Promise.resolve(store.vaDirectory({}));
    assert.ok(!closed.some((e) => e.companyId === companyId));

    const other = await Promise.resolve(
      store.authRegister({
        loginName: 'va_dir_other',
        displayName: 'Other',
        password: 'secret1',
      }),
    );
    await assert.rejects(
      async () =>
        store.vaCreateJoinRequest({
          companyId,
          accountId: other.account.id,
        }),
      /not recruiting/i,
    );
  });

  it('blocks joining or requesting a second VA', async () => {
    const ownerA = await Promise.resolve(
      store.authRegister({
        loginName: 'va_one_a',
        displayName: 'Owner A',
        password: 'secret1',
      }),
    );
    const ownerB = await Promise.resolve(
      store.authRegister({
        loginName: 'va_one_b',
        displayName: 'Owner B',
        password: 'secret1',
      }),
    );
    const vaA = ownerA.company!.id;
    const vaB = ownerB.company!.id;
    await Promise.resolve(
      store.vaPublish({
        companyId: vaA,
        actorAccountId: ownerA.account.id,
        displayName: 'Airline A',
        homeHubIcao: 'SBGR',
      }),
    );
    await Promise.resolve(
      store.vaPublish({
        companyId: vaB,
        actorAccountId: ownerB.account.id,
        displayName: 'Airline B',
        homeHubIcao: 'SBSP',
      }),
    );
    const pilot = await Promise.resolve(
      store.authRegister({
        loginName: 'va_one_pilot',
        displayName: 'One Pilot',
        password: 'secret1',
      }),
    );
    const inviteA = await Promise.resolve(
      store.vaCreateInvite({
        companyId: vaA,
        createdByAccountId: ownerA.account.id,
      }),
    );
    await Promise.resolve(
      store.vaJoinInvite({
        code: inviteA.code,
        accountId: pilot.account.id,
      }),
    );
    const listed = await Promise.resolve(
      store.vaListedMembership(pilot.account.id),
    );
    assert.equal(listed?.companyId, vaA);

    const inviteB = await Promise.resolve(
      store.vaCreateInvite({
        companyId: vaB,
        createdByAccountId: ownerB.account.id,
      }),
    );
    await assert.rejects(
      async () =>
        store.vaJoinInvite({
          code: inviteB.code,
          accountId: pilot.account.id,
        }),
      /Already in a VA/i,
    );
    await assert.rejects(
      async () =>
        store.vaCreateJoinRequest({
          companyId: vaB,
          accountId: pilot.account.id,
        }),
      /Already in a VA/i,
    );

    // Owner of a listed VA also cannot join another.
    await assert.rejects(
      async () =>
        store.vaJoinInvite({
          code: inviteB.code,
          accountId: ownerA.account.id,
        }),
      /Already in a VA/i,
    );
  });

  it('publish lists existing company as VA', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_pub_owner',
        displayName: 'Pub Owner',
        password: 'secret1',
      }),
    );
    const companyId = owner.company!.id;
    const before = await Promise.resolve(store.vaDirectory({}));
    assert.ok(!before.some((e) => e.companyId === companyId));
    const published = await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: owner.account.id,
        displayName: 'Skyline Airbridge',
        homeHubIcao: 'sbgr',
      }),
    );
    assert.equal(published.displayName, 'Skyline Airbridge');
    assert.equal(published.homeHubIcao, 'SBGR');
    assert.equal(published.recruiting, true);
    assert.equal(published.listed, true);
    assert.equal(await Promise.resolve(store.vaIsListed(companyId)), true);
    const dir = await Promise.resolve(store.vaDirectory({}));
    const row = dir.find((e) => e.companyId === companyId);
    assert.ok(row);
    assert.equal(row!.displayName, 'Skyline Airbridge');
    assert.equal(row!.homeHubIcao, 'SBGR');
    assert.equal(row!.recruiting, true);
    assert.equal(row!.listed, true);
  });

  it('unpublish removes listing and non-owner members', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_unpub_owner',
        displayName: 'Unpub Owner',
        password: 'secret1',
      }),
    );
    const pilot = await Promise.resolve(
      store.authRegister({
        loginName: 'va_unpub_pilot',
        displayName: 'Unpub Pilot',
        password: 'secret1',
      }),
    );
    const companyId = owner.company!.id;
    await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: owner.account.id,
        displayName: 'Temp Bridge',
        homeHubIcao: 'SBSP',
      }),
    );
    const invite = await Promise.resolve(
      store.vaCreateInvite({
        companyId,
        createdByAccountId: owner.account.id,
      }),
    );
    await Promise.resolve(
      store.vaJoinInvite({
        code: invite.code,
        accountId: pilot.account.id,
      }),
    );
    const beforeMembers = await Promise.resolve(
      store.vaListMembers(companyId),
    );
    assert.ok(beforeMembers.length >= 2);

    const result = await Promise.resolve(
      store.vaUnpublish({
        companyId,
        actorAccountId: owner.account.id,
      }),
    );
    assert.equal(result.listed, false);
    assert.ok(result.removedMembers >= 1);
    assert.equal(await Promise.resolve(store.vaIsListed(companyId)), false);
    const dir = await Promise.resolve(store.vaDirectory({}));
    assert.ok(!dir.some((e) => e.companyId === companyId));
    const afterMembers = await Promise.resolve(store.vaListMembers(companyId));
    assert.equal(afterMembers.length, 1);
    assert.equal(afterMembers[0]!.role, 'owner');
    assert.equal(
      await Promise.resolve(
        store.vaGetMembership(pilot.account.id, companyId),
      ),
      null,
    );
  });

  it('owner can set member route cut; directory exposes it', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_cut_owner',
        displayName: 'Cut Owner',
        password: 'secret1',
      }),
    );
    const companyId = owner.company!.id;
    await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: owner.account.id,
        displayName: 'Cut Airways',
        homeHubIcao: 'SBGR',
      }),
    );
    assert.equal(
      await Promise.resolve(store.vaGetMemberRouteCutPct(companyId)),
      30,
    );
    const set = await Promise.resolve(
      store.vaSetMemberRouteCutPct({
        companyId,
        actorAccountId: owner.account.id,
        memberRouteCutPct: 40,
      }),
    );
    assert.equal(set, 40);
    assert.equal(
      await Promise.resolve(store.vaGetMemberRouteCutPct(companyId)),
      40,
    );
    const dir = await Promise.resolve(store.vaDirectory({}));
    const row = dir.find((e) => e.companyId === companyId);
    assert.ok(row);
    assert.equal(row!.memberRouteCutPct, 40);
    assert.equal(row!.memberAirlineCutPct, 50);
  });

  it('owner can set airline desk cut (40–60)', async () => {
    const owner = await Promise.resolve(
      store.authRegister({
        loginName: 'va_airline_cut_owner',
        displayName: 'Airline Cut Owner',
        password: 'secret1',
      }),
    );
    const companyId = owner.company!.id;
    await Promise.resolve(
      store.vaPublish({
        companyId,
        actorAccountId: owner.account.id,
        displayName: 'Airline Cut Airways',
        homeHubIcao: 'SBGR',
      }),
    );
    assert.equal(
      await Promise.resolve(store.vaGetMemberAirlineCutPct(companyId)),
      50,
    );
    const set = await Promise.resolve(
      store.vaSetMemberAirlineCutPct({
        companyId,
        actorAccountId: owner.account.id,
        memberAirlineCutPct: 55,
      }),
    );
    assert.equal(set, 55);
    assert.equal(
      await Promise.resolve(store.vaGetMemberAirlineCutPct(companyId)),
      55,
    );
    const clamped = await Promise.resolve(
      store.vaSetMemberAirlineCutPct({
        companyId,
        actorAccountId: owner.account.id,
        memberAirlineCutPct: 70,
      }),
    );
    assert.equal(clamped, 60);
  });

  it('quotes member route cut from route net', () => {
    assert.equal(quoteMemberRouteCutUsd(1000, 200, 30), 240);
    assert.equal(quoteMemberRouteCutUsd(100, 200, 30), 0);
    assert.equal(quoteMemberRouteCutUsd(1000, 0, 10), 100);
  });

  it('quotes airline desk cut from route net', () => {
    assert.equal(quoteMemberAirlineCutUsd(1000, 200, 50), 400);
    assert.equal(quoteMemberAirlineCutUsd(1000, 200, 30), 320); // clamps to 40
    assert.equal(quoteMemberAirlineCutUsd(100, 200, 50), 0);
  });

  it('freights settle applies member cut to pilot home', () => {
    const world = createSeedEconomyWorld({ seed: 'va-member-cut' });
    const va = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    va.walletUsd = 500_000;
    const mission = {
      id: 'msn_cut_test',
      lots: [],
      shipmentLotId: 'lot_x',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      cargoKg: 100,
      pax: 0,
      aircraftClassId: 'narrow_freighter',
      rolesPackRelPath: '',
      deadlineTick: world.tick + 100,
      payUsd: 1000,
      urgency: 'normal',
      reason: 'test',
      status: 'settled',
      acceptedAtTick: world.tick,
      pilotHomeCompanyId: 'co_pilot_home',
      pilotAccountId: 'acc_pilot',
      vaFlight: true,
    } as import('./types/career-economy.js').MissionIntent;
    const before = va.walletUsd;
    const wallet = applySettleWalletDeltas(
      va,
      world.tick,
      {
        mission,
        settlement: {
          missionId: mission.id,
          payoutUsd: 1000,
          penaltyUsd: 0,
          lateTicks: 0,
          deliveredKg: 100,
          onTime: true,
          originStockAfterKg: 0,
          destStockAfterKg: 100,
        },
        walletCreditUsd: 1000,
        fuelDebitUsd: 200,
      },
      { companyId: 'co_va_ops', memberRouteCutPct: 30 },
    );
    assert.ok(wallet.pilotPayCredit);
    assert.equal(wallet.pilotPayCredit!.companyId, 'co_pilot_home');
    assert.equal(wallet.pilotPayCredit!.amountUsd, 240);
    assert.equal(va.walletUsd, before + 1000 - 200 - 240);
  });

  it('demand settle applies airline cut (not market hire)', () => {
    const world = createSeedEconomyWorld({ seed: 'va-airline-cut' });
    const va = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    va.walletUsd = 500_000;
    const mission = {
      id: 'msn_airline_cut',
      lots: [],
      demandOrderId: 'ord_x',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      cargoKg: 100,
      pax: 0,
      aircraftClassId: 'narrow_freighter',
      rolesPackRelPath: '',
      deadlineTick: world.tick + 100,
      payUsd: 1000,
      urgency: 'normal',
      reason: 'test',
      status: 'settled',
      acceptedAtTick: world.tick,
      pilotHomeCompanyId: 'co_pilot_home',
      pilotAccountId: 'acc_pilot',
      vaFlight: true,
    } as import('./types/career-economy.js').MissionIntent;
    const before = va.walletUsd;
    const wallet = applySettleWalletDeltas(
      va,
      world.tick,
      {
        mission,
        settlement: {
          missionId: mission.id,
          payoutUsd: 1000,
          penaltyUsd: 0,
          lateTicks: 0,
          deliveredKg: 100,
          onTime: true,
          originStockAfterKg: 0,
          destStockAfterKg: 100,
        },
        walletCreditUsd: 1000,
        fuelDebitUsd: 200,
      },
      {
        companyId: 'co_va_ops',
        memberRouteCutPct: 30,
        memberAirlineCutPct: 50,
      },
    );
    assert.ok(wallet.pilotPayCredit);
    assert.equal(wallet.pilotPayCredit!.amountUsd, 400);
    assert.equal(va.walletUsd, before + 1000 - 200 - 400);
  });

  it('airline desk holds include demand and haul kinds', () => {
    const state = emptyMissionsStateV2();
    state.playerWarehouses = {
      warehouses: [],
      stock: [],
      demandHolds: [
        {
          id: 'h_bridge',
          kind: 'bridge',
          warehouseId: 'wh_a',
          originIcao: 'SBGR',
          destIcao: 'SBSP',
          destWarehouseId: 'wh_b',
          commodityId: 'general',
          kg: 500,
          unitPriceUsd: 1,
          pilotPayUsd: 200,
          heldAtTick: 1,
          expiresAtTick: 100,
        },
        {
          id: 'h_demand',
          kind: 'demand',
          orderId: 'ord_1',
          warehouseId: 'wh_a',
          originIcao: 'SBGR',
          destIcao: 'SBCT',
          commodityId: 'general',
          kg: 300,
          unitPriceUsd: 2,
          heldAtTick: 1,
          expiresAtTick: 100,
        },
        {
          id: 'h_haul',
          kind: 'haul',
          warehouseId: 'wh_a',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general',
          kg: 800,
          unitPriceUsd: 1.5,
          heldAtTick: 1,
          expiresAtTick: 100,
        },
      ],
    };
    const bridges = listOpenInternalHaulHolds(state);
    assert.equal(bridges.length, 1);
    const desk = listOpenAirlineDeskHolds(state);
    assert.equal(desk.length, 3);
  });
});