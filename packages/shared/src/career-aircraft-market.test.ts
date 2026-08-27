import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  __testApplyNpcDemand,
  applyAircraftHoursAfterMission,
  clearAircraftMaintenance,
  ensureAircraftConditionPcts,
  ensureAircraftMarket,
  generateAircraftMarketListings,
  listAircraftForLease,
  listAircraftForSale,
  listAircraftMarket,
  quoteAircraftImportForListing,
  quoteLeaseReturnRepositionFee,
  npcPlayerLeaseAcceptChance,
  npcPlayerSaleAcceptChance,
  clampPlayerLeaseMonthlyUsd,
  clampPlayerLeaseTermMonths,
  purchaseAircraftListing,
  quoteAircraftDelivery,
  quoteLeaseEarlyReturnUsd,
  leaseRemainingWeeks,
  resolveAircraftMsrpUsd,
  returnAircraftLeaseEarly,
  sellPlayerAircraft,
  settleAircraftMarketOps,
  signAircraftLease,
  seedDryCleanSettlesForTests,
  LEASE_UNLOCK_CLEAN_DRY_SETTLES,
  aircraftLeaseUnlockProgress,
  aircraftLeaseMonthlyUsd,
  unlistAircraftForLease,
  fairValueUsd,
  sellBackValueUsd,
} from './career-aircraft-market.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { ensureWorldAircraftPool } from './career-aircraft-pool.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { CONDITION_PRICE_MULT, ECONOMIC_LIFE_HOURS } from './career-aircraft-pricing.js';
import { economyDayIndex } from './career-weather.js';
import {
  findCareerPlayerAirframe,
  listCareerPlayerAirframes,
} from './career-player-airframes.js';

describe('aircraft market', () => {
  it('generates a stable new/used/lease board for a seed day', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-seed' });
    const marketAirframes = listCareerPlayerAirframes();
    const used = new Set<string>();
    const a = generateAircraftMarketListings({
      world,
      walletUsd: 10_000,
      dayIndex: 3,
      economyTick: world.tick,
      usedRegistrations: used,
    });
    const b = generateAircraftMarketListings({
      world,
      walletUsd: 10_000,
      dayIndex: 3,
      economyTick: world.tick,
      usedRegistrations: new Set<string>(),
    });
    assert.equal(a.length, marketAirframes.length);
    assert.deepEqual(
      a.map((l) => l.id),
      b.map((l) => l.id),
    );
    assert.ok(a.every((l) => ['new', 'used', 'lease'].includes(l.kind)));
    // With fewer Market SKUs after family merges, one day may miss a kind —
    // sample a few days from the same seed for coverage.
    const kinds = new Set<string>();
    for (let day = 0; day < 12; day++) {
      for (const listing of generateAircraftMarketListings({
        world,
        walletUsd: 10_000,
        dayIndex: day,
        economyTick: world.tick,
        usedRegistrations: new Set<string>(),
      })) {
        kinds.add(listing.kind);
      }
    }
    assert.ok(kinds.has('new'));
    assert.ok(kinds.has('used'));
    assert.ok(kinds.has('lease'));
    assert.ok(a.every((l) => Boolean(l.airframeTypeId)));
    assert.ok(a.every((l) => l.label.length > 0));
    assert.ok(a.every((l) => typeof l.registration === 'string' && l.registration.length >= 3));
    assert.equal(new Set(a.map((l) => l.registration)).size, a.length);
    for (const used of a.filter((l) => l.kind === 'used')) {
      const msrp = resolveAircraftMsrpUsd({
        aircraftClassId: used.aircraftClassId,
        maxCargoKg: findCareerPlayerAirframe(used.airframeTypeId)?.maxCargoKg,
      });
      assert.ok(
        used.askingUsd < msrp * 0.95,
        `${used.id} used should be below airframe new MSRP`,
      );
    }
    for (const lease of a.filter((l) => l.kind === 'lease')) {
      const msrp = resolveAircraftMsrpUsd({
        aircraftClassId: lease.aircraftClassId,
        maxCargoKg: findCareerPlayerAirframe(lease.airframeTypeId)?.maxCargoKg,
      });
      assert.ok(
        (lease.askingUsd ?? 0) < msrp * 0.2,
        'lease entry should be far below purchase',
      );
      assert.ok((lease.leaseMonthlyUsd ?? 0) > 0);
      assert.ok(
        lease.leaseTermMonths === 1 ||
          lease.leaseTermMonths === 2 ||
          lease.leaseTermMonths === 3,
        'lease terms are short career contracts (1–3 mo)',
      );
      assert.equal(
        lease.askingUsd,
        Math.round((lease.leaseMonthlyUsd ?? 0) * 4),
        'lease deposit is four weeks',
      );
    }
  });

  it('lists every enabled homologated airframe even on a low-wallet board', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-caps' });
    const listings = generateAircraftMarketListings({
      world,
      walletUsd: 5_000,
      dayIndex: 1,
      economyTick: world.tick,
      usedRegistrations: new Set<string>(),
    });
    assert.deepEqual(
      new Set(listings.map((listing) => listing.airframeTypeId)),
      new Set(listCareerPlayerAirframes().map((airframe) => airframe.typeId)),
    );
  });

  it('purchases a listing against wallet and parks at basedIcao', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Buyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    // Skip demand so a cheap GA remains available for the purchase path.
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const usedGa = listings.find(
      (l) => l.kind === 'used' && l.aircraftClassId === 'light_ga',
    );
    assert.ok(usedGa, 'expected a used light_ga listing');
    state.walletUsd = usedGa!.askingUsd;
    assert.throws(() => {
      const poor = {
        ...state,
        walletUsd: usedGa!.askingUsd - 1,
        aircraftMarket: state.aircraftMarket,
        aircraftMarketDay: state.aircraftMarketDay,
        aircraftMarketDemandDay: state.aircraftMarketDemandDay,
      };
      purchaseAircraftListing(poor, world, usedGa!.id);
    });
    const { aircraft, debitUsd } = purchaseAircraftListing(state, world, usedGa!.id);
    assert.equal(debitUsd, usedGa!.askingUsd);
    assert.equal(aircraft.ownership, 'owned');
    assert.equal(aircraft.locationIcao, usedGa!.basedIcao);
    assert.equal(aircraft.airframeTypeId, usedGa!.airframeTypeId);
    assert.equal(aircraft.label, usedGa!.label);
    assert.equal(aircraft.registration, usedGa!.registration);
    assert.equal(state.walletUsd, 0);
    assert.ok(state.fleet.some((a) => a.id === aircraft.id));
  });

  it('blocks lease until enough clean Dry settles; starter buy still cash-only', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease-lock' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      pilotName: 'ContractOnly',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const lease = listings.find(
      (l) => l.kind === 'lease' && (l.source ?? 'generated') === 'generated',
    );
    const buy = listings.find(
      (l) => l.kind !== 'lease' && l.aircraftClassId === 'light_ga',
    );
    const wideBuy = listings.find(
      (l) => l.kind !== 'lease' && l.aircraftClassId === 'wide_freighter',
    );
    assert.ok(lease);
    assert.ok(buy);

    const progress = aircraftLeaseUnlockProgress(state);
    assert.equal(progress.unlocked, false);
    assert.equal(progress.current, 0);
    assert.equal(progress.required, LEASE_UNLOCK_CLEAN_DRY_SETTLES);

    state.walletUsd = lease!.askingUsd + 50;
    assert.throws(
      () => signAircraftLease(state, world, lease!.id),
      /Lease unlocks after 8 clean Dry/i,
    );

    if (wideBuy) {
      state.walletUsd = wideBuy.askingUsd + 1_000_000;
      assert.throws(
        () => purchaseAircraftListing(state, world, wideBuy.id),
        /Class locked/i,
      );
    }

    state.walletUsd = buy!.askingUsd;
    const purchased = purchaseAircraftListing(state, world, buy!.id);
    assert.equal(purchased.aircraft.ownership, 'owned');
  });

  it('signs a lease with entry payment and weekly terms', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      pilotName: 'Lessee',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const lease = listings.find(
      (l) => l.kind === 'lease' && (l.source ?? 'generated') === 'generated',
    );
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 50;
    const { aircraft } = signAircraftLease(state, world, lease!.id);
    assert.equal(aircraft.ownership, 'leased');
    assert.ok(aircraft.lease);
    assert.ok((aircraft.lease!.monthlyUsd ?? 0) > 0);
    assert.ok(aircraft.lease!.termEndsTick > world.tick);
  });

  it('unlocks lease after seeding Dry settlesOk to the threshold', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease-unlock' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Unlocked',
    });
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES - 1);
    assert.equal(aircraftLeaseUnlockProgress(state).unlocked, false);
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    assert.equal(aircraftLeaseUnlockProgress(state).unlocked, true);
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const lease = listAircraftMarket(state, world).find(
      (l) => l.kind === 'lease' && (l.source ?? 'generated') === 'generated',
    );
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 50;
    const { aircraft } = signAircraftLease(state, world, lease!.id);
    assert.equal(aircraft.ownership, 'leased');
  });

  it('early-returns a lease with a remaining-week penalty and drops the airframe', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-early-return' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'EarlyReturn',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const lease = listings.find(
      (l) => l.kind === 'lease' && (l.source ?? 'generated') === 'generated',
    );
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 200_000;
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    const { aircraft } = signAircraftLease(state, world, lease!.id);
    const weekly = aircraft.lease!.monthlyUsd;
    const remaining = leaseRemainingWeeks(aircraft, world.tick);
    const expected = quoteLeaseEarlyReturnUsd(aircraft, world.tick);
    assert.equal(
      expected,
      Math.round(weekly * Math.min(4, Math.max(1, Math.ceil(remaining * 0.5)))),
    );
    const before = state.walletUsd;
    const result = returnAircraftLeaseEarly(state, aircraft.id, world.tick, world);
    assert.equal(result.debitUsd, expected);
    assert.equal(state.walletUsd, before - expected);
    assert.ok(!state.fleet.some((a) => a.id === aircraft.id));
    assert.ok(
      (state.ledger ?? []).some(
        (e) => e.kind === 'lease_early_return' && e.aircraftId === aircraft.id,
      ),
    );
  });

  it('rejects early return when lease is overdue or aircraft is assigned', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-early-block' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBRF', {
      pilotName: 'Blocked',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const lease = listings.find(
      (l) => l.kind === 'lease' && (l.source ?? 'generated') === 'generated',
    );
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 200_000;
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    const { aircraft } = signAircraftLease(state, world, lease!.id);

    aircraft.leaseOverdue = true;
    assert.throws(
      () => returnAircraftLeaseEarly(state, aircraft.id, world.tick, world),
      /overdue/i,
    );
    aircraft.leaseOverdue = false;

    aircraft.status = 'assigned';
    assert.throws(
      () => returnAircraftLeaseEarly(state, aircraft.id, world.tick, world),
      /mission/i,
    );
  });

  it('dealer trade-in credits 50% fair and restocks the same SKU', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-sell' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGL', {
      pilotName: 'Seller',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const buy = listings.find((l) => l.kind === 'used')!;
    state.walletUsd = buy.askingUsd;
    const { aircraft } = purchaseAircraftListing(state, world, buy.id);
    const before = state.walletUsd;
    const beforeSku = (world.aircraftInstances ?? []).filter(
      (i) =>
        i.airframeTypeId === aircraft.airframeTypeId &&
        i.countryId === 'BR',
    ).length;
    const { creditUsd, restockId } = sellPlayerAircraft(
      state,
      aircraft.id,
      world.tick,
      world,
    );
    assert.ok(creditUsd > 0);
    assert.equal(state.walletUsd, before + creditUsd);
    assert.ok(!state.fleet.some((a) => a.id === aircraft.id));
    assert.ok(!state.aircraftMarket?.some((l) => l.sellerAircraftId === aircraft.id));
    const restock = world.aircraftInstances?.find((i) => i.id === restockId);
    assert.ok(restock);
    assert.equal(restock!.airframeTypeId, aircraft.airframeTypeId);
    assert.equal(restock!.countryId, 'BR');
    assert.notEqual(restock!.registration, aircraft.registration);
    const afterSku = (world.aircraftInstances ?? []).filter(
      (i) =>
        i.airframeTypeId === aircraft.airframeTypeId &&
        i.countryId === 'BR',
    ).length;
    assert.equal(afterSku, beforeSku + 1);
  });

  it('rejects selling the last owned aircraft', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-last' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Solo',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const only = state.fleet[0]!;
    assert.equal(
      state.fleet.filter((a) => (a.ownership ?? 'owned') === 'owned').length,
      1,
    );
    assert.throws(
      () => sellPlayerAircraft(state, only.id, world.tick, world),
      /at least one owned aircraft/i,
    );
    assert.ok(state.fleet.some((a) => a.id === only.id));
  });

  it('preserves player listings across a day refresh', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-preserve' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Keep',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    listAircraftMarket(state, world);
    const starter = state.fleet[0]!;
    state.fleet.push({
      ...starter,
      id: 'acf_bonanza_99',
      aircraftClassId: 'light_ga',
      label: 'Spare Bonanza',
      ownership: 'owned',
      status: 'parked',
    });
    const { listing } = listAircraftForSale(
      state,
      'acf_bonanza_99',
      world.tick,
      40_000,
    );
    assert.equal(listing.source, 'player_sale');
    assert.equal(
      state.fleet.find((a) => a.id === 'acf_bonanza_99')?.status,
      'listed',
    );

    world.tick += 24;
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    ensureAircraftMarket(state, world);
    const stillThere = state.aircraftMarket?.find((l) => l.id === listing.id);
    assert.ok(stillThere);
    assert.equal(stillThere!.status, 'available');
    assert.equal(stillThere!.source, 'player_sale');
  });

  it('expired player sale listing returns the airframe to parked', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-sale-expire' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ExpireSale',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    state.fleet.push({
      ...starter,
      id: 'acf_spare_sale',
      aircraftClassId: 'light_ga',
      label: 'Spare',
      ownership: 'owned',
      status: 'parked',
    });
    const { listing } = listAircraftForSale(
      state,
      'acf_spare_sale',
      world.tick,
      50_000,
    );
    world.tick = listing.expiresAtTick;
    ensureAircraftMarket(state, world);
    assert.ok(
      !state.aircraftMarket?.some(
        (l) => l.id === listing.id && l.status === 'available',
      ),
    );
    assert.equal(
      state.fleet.find((a) => a.id === 'acf_spare_sale')?.status,
      'parked',
    );
  });

  it('lists spare for lease and unlists back to parked', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-list' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'Lessor',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    assert.throws(() => listAircraftForLease(state, starter.id, world.tick));

    state.fleet.push({
      ...starter,
      id: 'acf_bonanza_2',
      aircraftClassId: 'light_ga',
      label: 'Spare Bonanza',
      ownership: 'owned',
      status: 'parked',
    });
    const { listing } = listAircraftForLease(state, 'acf_bonanza_2', world.tick);
    assert.equal(listing.source, 'player_lease');
    assert.equal(listing.kind, 'lease');
    assert.equal(listing.leaseTermMonths, 3);
    assert.ok((listing.leaseMonthlyUsd ?? 0) > 0);
    assert.equal(
      listing.askingUsd,
      Math.round((listing.leaseMonthlyUsd ?? 0) * 4),
    );
    const listed = state.fleet.find((a) => a.id === 'acf_bonanza_2')!;
    assert.equal(listed.status, 'listed');

    unlistAircraftForLease(state, 'acf_bonanza_2');
    assert.equal(listed.status, 'parked');
    assert.equal(
      state.aircraftMarket?.find((l) => l.id === listing.id)?.status,
      'expired',
    );
  });

  it('lists a custom weekly and term within catalog bounds', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-flex-lease' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'Flex',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    state.fleet.push({
      ...starter,
      id: 'acf_flex',
      status: 'parked',
      ownership: 'owned',
    });
    const catalogWeekly = aircraftLeaseMonthlyUsd('light_ga', {
      airframeTypeId: starter.airframeTypeId,
    });
    const { listing } = listAircraftForLease(state, 'acf_flex', world.tick, {
      monthlyUsd: Math.round(catalogWeekly * 0.9),
      termMonths: 2,
    });
    assert.equal(listing.leaseTermMonths, 2);
    assert.equal(
      listing.leaseMonthlyUsd,
      clampPlayerLeaseMonthlyUsd(
        Math.round(catalogWeekly * 0.9),
        catalogWeekly,
      ),
    );
    assert.equal(
      listing.askingUsd,
      Math.round((listing.leaseMonthlyUsd ?? 0) * 4),
    );
    assert.equal(clampPlayerLeaseTermMonths(0), 1);
    assert.equal(clampPlayerLeaseTermMonths(99), 3);
  });

  it('NPC refuses a player lease outside weekly/term band', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease-refuse' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBRF', {
      pilotName: 'Greedy',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    state.fleet.push({
      ...starter,
      id: 'acf_greedy',
      status: 'parked',
      ownership: 'owned',
    });
    const catalogMonthly = aircraftLeaseMonthlyUsd('light_ga', {
      airframeTypeId: starter.airframeTypeId,
    });
    assert.equal(
      npcPlayerLeaseAcceptChance({
        monthlyUsd: Math.round(catalogMonthly * 1.8),
        termMonths: 1,
        catalogMonthlyUsd: catalogMonthly,
      }),
      0,
    );
    state.aircraftMarket = [];
    state.aircraftMarketDay = economyDayIndex(world.tick);
    listAircraftForLease(state, 'acf_greedy', world.tick, {
      monthlyUsd: Math.round(catalogMonthly * 1.8),
      termMonths: 1,
    });
    let taken = 0;
    for (let d = 0; d < 30 && taken === 0; d++) {
      world.tick += 96;
      taken = __testApplyNpcDemand(state, world, economyDayIndex(world.tick));
    }
    assert.equal(taken, 0);
    assert.equal(state.fleet.find((a) => a.id === 'acf_greedy')?.status, 'listed');
  });

  it('NPC demand can take a player lease and start lease-out income', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-npc' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBRF', {
      pilotName: 'NpcTake',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    state.fleet.push({
      ...starter,
      id: 'acf_bonanza_3',
      aircraftClassId: 'light_ga',
      label: 'Lease Me',
      ownership: 'owned',
      status: 'parked',
      condition: 'fair',
    });
    // Empty board so demand must pick the player lease.
    state.aircraftMarket = [];
    state.aircraftMarketDay = economyDayIndex(world.tick);
    const { listing } = listAircraftForLease(state, 'acf_bonanza_3', world.tick, {
      termMonths: 3,
    });
    const walletBefore = state.walletUsd;
    // Force demand to run; with only this listing it should take it when takeCount > 0.
    // Retry across days until demand takes at least one (seed may roll 0).
    let taken = 0;
    for (let d = 0; d < 20 && taken === 0; d++) {
      world.tick += 24;
      taken = __testApplyNpcDemand(state, world, economyDayIndex(world.tick));
    }
    assert.ok(taken >= 1, 'expected NPC demand to take the player lease');
    const acf = state.fleet.find((a) => a.id === 'acf_bonanza_3')!;
    assert.equal(acf.status, 'leased_out');
    assert.ok(acf.leaseOut);
    assert.ok(acf.leaseOut?.lesseeNpcId, 'expected named NPC lessee');
    assert.ok(acf.leaseOut?.lesseeName);
    const lessee = world.npcs.find((n) => n.id === acf.leaseOut!.lesseeNpcId);
    assert.ok(lessee);
    assert.equal(lessee!.leasedPlayerAircraftId, acf.id);
    assert.equal(state.walletUsd, walletBefore + listing.askingUsd);
    assert.equal(
      state.aircraftMarket?.find((l) => l.id === listing.id)?.status,
      'sold',
    );
  });

  it('npcPlayerSaleAcceptChance falls as ask rises above fair', () => {
    assert.ok(npcPlayerSaleAcceptChance(9_000, 10_000) >= 0.8);
    assert.ok(npcPlayerSaleAcceptChance(10_000, 10_000) >= 0.5);
    assert.ok(npcPlayerSaleAcceptChance(15_000, 10_000) < 0.05);
  });

  it('NPC demand buys a cheap player sale into the dealer pool (Option B)', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-npc-sale' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'NpcBuy',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    const spare = {
      ...starter,
      id: 'acf_sale_npc',
      aircraftClassId: 'light_ga' as const,
      label: 'Sale Me',
      ownership: 'owned' as const,
      status: 'parked' as const,
      condition: 'fair' as const,
      registration: 'PR-NPC',
      airframeTypeId: starter.airframeTypeId,
    };
    state.fleet.push(spare);
    ensureWorldAircraftPool(world);
    state.aircraftMarket = [];
    state.aircraftMarketDay = economyDayIndex(world.tick);
    const fair = resolveAircraftMsrpUsd({
      aircraftClassId: 'light_ga',
      maxCargoKg: findCareerPlayerAirframe(spare.airframeTypeId)?.maxCargoKg,
    }) * CONDITION_PRICE_MULT.fair;
    const { listing } = listAircraftForSale(
      state,
      'acf_sale_npc',
      world.tick,
      Math.round(fair * 0.5),
    );
    const walletBefore = state.walletUsd;
    const poolBefore = (world.aircraftInstances ?? []).filter(
      (i) => i.status === 'available' && i.countryId === 'BR',
    ).length;

    // Min 1 day on board, then retry until NPC takes (cheap ask).
    let taken = 0;
    for (let d = 0; d < 40 && taken === 0; d++) {
      world.tick += 96; // +1 economy day
      taken = __testApplyNpcDemand(state, world, economyDayIndex(world.tick));
    }
    assert.ok(taken >= 1, 'expected NPC to buy the cheap player sale');
    assert.ok(!state.fleet.some((a) => a.id === 'acf_sale_npc'));
    assert.equal(state.walletUsd, walletBefore + listing.askingUsd);
    assert.equal(
      state.aircraftMarket?.find((l) => l.id === listing.id)?.status,
      'sold',
    );
    const dealer = (world.aircraftInstances ?? []).find(
      (i) =>
        i.status === 'available' &&
        i.registration === 'PR-NPC' &&
        i.countryId === 'BR',
    );
    assert.ok(dealer, 'same registration should enter dealer pool');
    assert.equal(dealer!.airframeTypeId, spare.airframeTypeId);
    const poolAfter = (world.aircraftInstances ?? []).filter(
      (i) => i.status === 'available' && i.countryId === 'BR',
    ).length;
    assert.equal(poolAfter, poolBefore + 1);
  });

  it('lease-out return applies utilization wear and may AOG', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-wear' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      pilotName: 'WearLease',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const starter = state.fleet[0]!;
    ensureAircraftConditionPcts(starter);
    const afBefore = starter.airframeConditionPct!;
    const engBefore = starter.engineConditionPct!;
    const hoursBefore = starter.hoursAirframe ?? 0;

    // Second owned airframe so we can list the starter.
    state.fleet.push({
      ...starter,
      id: 'acf_spare_wear',
      label: 'Spare',
      status: 'parked',
    });
    state.aircraftMarket = [];
    state.aircraftMarketDay = economyDayIndex(world.tick);
    listAircraftForLease(state, starter.id, world.tick, { termMonths: 3 });

    let taken = 0;
    for (let d = 0; d < 20 && taken === 0; d++) {
      world.tick += 24;
      taken = __testApplyNpcDemand(state, world, economyDayIndex(world.tick));
    }
    assert.ok(taken >= 1);
    assert.equal(starter.status, 'leased_out');
    const lesseeId = starter.leaseOut!.lesseeNpcId!;
    const termEnd = starter.leaseOut!.termEndsTick;

    // Advance past term and settle.
    world.tick = termEnd + 1;
    settleAircraftMarketOps(state, world.tick, world);

    const returned = state.fleet.find((a) => a.id === starter.id)!;
    assert.ok(
      returned.status === 'parked' || returned.status === 'maintenance',
      `expected parked or maintenance, got ${returned.status}`,
    );
    assert.equal(returned.leaseOut, undefined);
    assert.ok((returned.hoursAirframe ?? 0) > hoursBefore);
    assert.ok((returned.airframeConditionPct ?? 100) < afBefore);
    assert.ok((returned.engineConditionPct ?? 100) < engBefore);
    const lessee = world.npcs.find((n) => n.id === lesseeId);
    assert.equal(lessee?.leasedPlayerAircraftId, undefined);
  });

  it('maintenance gate blocks until paid', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'Mx',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.hoursSinceInspection = 99;
    applyAircraftHoursAfterMission(acf, 2);
    assert.equal(acf.status, 'maintenance');
    state.walletUsd = 10;
    assert.throws(() => clearAircraftMaintenance(state, acf.id));
    state.walletUsd = 100_000;
    clearAircraftMaintenance(state, acf.id);
    assert.equal(acf.status, 'parked');
  });

  it('optional delivery parks at pilot hub for a capped fee', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-deliver' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DeliverMe',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    const listings = listAircraftMarket(state, world);
    const remote = listings.find(
      (l) =>
        l.kind === 'used' &&
        l.basedIcao !== 'SBGR' &&
        (l.source ?? 'generated') === 'generated',
    );
    assert.ok(remote, 'expected a listing based away from SBGR');
    const quote = quoteAircraftDelivery(world, state, remote!.id);
    assert.equal(quote.needed, true);
    assert.equal(quote.deliverToIcao, 'SBGR');
    assert.ok(quote.deliveryFeeUsd >= 200);
    assert.ok(quote.deliveryFeeUsd <= 2_500);
    state.walletUsd = remote!.askingUsd + quote.deliveryFeeUsd;
    const { aircraft, debitUsd, deliveryFeeUsd } = purchaseAircraftListing(
      state,
      world,
      remote!.id,
      { deliver: true },
    );
    assert.equal(aircraft.locationIcao, 'SBGR');
    assert.equal(deliveryFeeUsd, quote.deliveryFeeUsd);
    assert.equal(debitUsd, remote!.askingUsd + quote.deliveryFeeUsd);
    assert.equal(state.walletUsd, 0);
    assert.ok(
      (state.ledger ?? []).some((e) => e.kind === 'aircraft_delivery'),
    );
  });

  it('imports foreign dealer stock with optional reposition fee', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-import' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Importer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const abroad = listAircraftMarket(state, world, { browseCountryId: 'CL' });
    assert.ok(abroad.length > 0, 'expected Chilean dealer stock');
    const foreign = abroad.find((l) => l.kind !== 'lease');
    assert.ok(foreign);
    const importQuote = quoteAircraftImportForListing(world, state, foreign!);
    assert.equal(importQuote.crossBorder, true);
    assert.ok(importQuote.needed);
    assert.ok(importQuote.deliveryFeeUsd >= 1_000);

    state.walletUsd = foreign!.askingUsd + 1;
    const { aircraft: abroadOnly } = purchaseAircraftListing(
      state,
      world,
      foreign!.id,
    );
    assert.notEqual(abroadOnly.locationIcao.toUpperCase(), 'SBGR');
    assert.equal(abroadOnly.locationIcao.toUpperCase(), foreign!.basedIcao.toUpperCase());

    state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Importer2',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const abroad2 = listAircraftMarket(state, world, { browseCountryId: 'CL' });
    const foreign2 = abroad2.find((l) => l.kind !== 'lease');
    assert.ok(foreign2);
    const quote = quoteAircraftImportForListing(world, state, foreign2!);
    state.walletUsd = foreign2!.askingUsd + quote.deliveryFeeUsd;
    const { aircraft: imported, deliveryFeeUsd } = purchaseAircraftListing(
      state,
      world,
      foreign2!.id,
      { deliver: true },
    );
    assert.equal(imported.locationIcao.toUpperCase(), 'SBGR');
    assert.equal(deliveryFeeUsd, quote.deliveryFeeUsd);
    assert.ok(
      (state.ledger ?? []).some((e) => e.kind === 'aircraft_import'),
    );
  });

  it('lists worldwide dealer stock when browse country is WORLD', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-world-browse' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WorldShop',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    ensureAircraftMarket(state, world);
    const home = listAircraftMarket(state, world);
    const worldwide = listAircraftMarket(state, world, {
      browseCountryId: 'WORLD',
    });
    const brOnly = listAircraftMarket(state, world, { browseCountryId: 'BR' });
    assert.ok(worldwide.length > home.length);
    assert.ok(worldwide.length >= brOnly.length);
    for (const row of brOnly) {
      assert.ok(worldwide.some((w) => w.id === row.id));
    }
  });

  it('includes player lease listings when browsing WORLD', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-world-player-lease' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WorldLease',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    // Need a second owned parked airframe to list for lease.
    state.fleet.push({
      ...state.fleet[0]!,
      id: 'acf_lease_spare',
      label: 'Spare for lease',
      status: 'parked',
      ownership: 'owned',
      locationIcao: 'SBGR',
    });
    ensureAircraftMarket(state, world);
    const { listing } = listAircraftForLease(
      state,
      'acf_lease_spare',
      world.tick,
    );
    assert.equal(listing.source, 'player_lease');
    const worldwide = listAircraftMarket(state, world, {
      browseCountryId: 'WORLD',
    });
    assert.ok(
      worldwide.some((l) => l.id === listing.id),
      'player lease must appear on Worldwide board',
    );
  });

  it('cross-border lease with import parks at home', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-import-lease' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'LeaseAbroad',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    const abroad = listAircraftMarket(state, world, { browseCountryId: 'CL' });
    const lease = abroad.find((l) => l.kind === 'lease');
    assert.ok(lease);
    const quote = quoteAircraftImportForListing(world, state, lease!);
    state.walletUsd = lease!.askingUsd + quote.deliveryFeeUsd + 50_000;
    const { aircraft, deliveryFeeUsd } = signAircraftLease(state, world, lease!.id, {
      deliver: true,
    });
    assert.equal(aircraft.locationIcao.toUpperCase(), 'SBGR');
    assert.equal(aircraft.lease!.startIcao, 'SBGR');
    assert.equal(deliveryFeeUsd, quote.deliveryFeeUsd);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'aircraft_import'));
  });

  it('cross-border lease without import keeps at dealer', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-import-lease2' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'LeasePickUp',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    const abroad = listAircraftMarket(state, world, { browseCountryId: 'CL' });
    const lease = abroad.find((l) => l.kind === 'lease');
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 50_000;
    const { aircraft } = signAircraftLease(state, world, lease!.id);
    assert.equal(
      aircraft.locationIcao.toUpperCase(),
      lease!.basedIcao.toUpperCase(),
    );
    assert.equal(aircraft.lease!.startIcao, aircraft.locationIcao.toUpperCase());
    assert.ok(!(state.ledger ?? []).some((e) => e.kind === 'aircraft_import'));
  });

  it('charges return ferry when lease term ends away from start', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease-return-ferry' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ReturnFerry',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    const listings = listAircraftMarket(state, world);
    const lease = listings.find((l) => l.kind === 'lease');
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 500_000;
    const { aircraft } = signAircraftLease(state, world, lease!.id);
    const startIcao = aircraft.locationIcao.toUpperCase();
    aircraft.locationIcao = 'SBRF';
    const returnQuote = quoteLeaseReturnRepositionFee(world, state, aircraft);
    assert.ok(returnQuote.needed);
    assert.ok(returnQuote.feeUsd > 0);
    state.walletUsd = returnQuote.feeUsd;
    const termTick = aircraft.lease!.termEndsTick;
    const settled = settleAircraftMarketOps(state, termTick, world);
    assert.ok(settled.repossessed.includes(aircraft.id));
    assert.ok(
      (state.ledger ?? []).some(
        (e) =>
          e.kind === 'ferry' &&
          e.aircraftId === aircraft.id &&
          (e.note ?? '').includes('lease return'),
      ),
    );
    assert.equal(
      (state.ledger ?? [])
        .filter((e) => e.kind === 'ferry' && e.aircraftId === aircraft.id)
        .reduce((s, e) => s + Math.abs(e.amountUsd), 0),
      returnQuote.feeUsd,
    );
    assert.ok(!state.fleet.some((a) => a.id === aircraft.id));
    assert.equal(startIcao, returnQuote.toIcao);
  });

  it('charges return ferry on early return away from start', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease-early-ferry' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBCT', {
      pilotName: 'EarlyFerry',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    seedDryCleanSettlesForTests(state, LEASE_UNLOCK_CLEAN_DRY_SETTLES);
    const listings = listAircraftMarket(state, world);
    const lease = listings.find((l) => l.kind === 'lease');
    assert.ok(lease);
    state.walletUsd = lease!.askingUsd + 500_000;
    const { aircraft } = signAircraftLease(state, world, lease!.id);
    aircraft.locationIcao = 'SBRF';
    const penalty = quoteLeaseEarlyReturnUsd(aircraft, world.tick);
    const returnQuote = quoteLeaseReturnRepositionFee(world, state, aircraft);
    const before = state.walletUsd;
    const result = returnAircraftLeaseEarly(
      state,
      aircraft.id,
      world.tick,
      world,
    );
    assert.equal(result.returnFerryUsd, returnQuote.feeUsd);
    assert.equal(result.debitUsd, penalty + returnQuote.feeUsd);
    assert.equal(state.walletUsd, before - result.debitUsd);
    assert.ok(
      (state.ledger ?? []).some(
        (e) => e.kind === 'ferry' && e.aircraftId === aircraft.id,
      ),
    );
  });

  it('fair value and dealer sell-back drop with high hours', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'HoursValue',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const acf = state.fleet[0]!;
    acf.condition = 'good';
    acf.hoursAirframe = 0;
    acf.hoursEngine = 0;
    const freshFair = fairValueUsd(acf.aircraftClassId, 'good', {
      airframeTypeId: acf.airframeTypeId,
      hoursAirframe: 0,
      hoursEngine: 0,
    });
    const agedFair = fairValueUsd(acf.aircraftClassId, 'good', {
      airframeTypeId: acf.airframeTypeId,
      hoursAirframe: ECONOMIC_LIFE_HOURS.light_ga,
      hoursEngine: ECONOMIC_LIFE_HOURS.light_ga,
    });
    assert.equal(agedFair, Math.round(freshFair * 0.8));
    acf.hoursAirframe = ECONOMIC_LIFE_HOURS.light_ga;
    acf.hoursEngine = ECONOMIC_LIFE_HOURS.light_ga;
    const agedSell = sellBackValueUsd(acf);
    acf.hoursAirframe = 0;
    acf.hoursEngine = 0;
    const freshSell = sellBackValueUsd(acf);
    assert.equal(agedSell, Math.round(freshSell * 0.8));
  });
});
