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
  listAircraftMarket,
  purchaseAircraftListing,
  quoteAircraftDelivery,
  quoteLeaseEarlyReturnUsd,
  leaseRemainingMonths,
  resolveAircraftMsrpUsd,
  returnAircraftLeaseEarly,
  sellPlayerAircraft,
  settleAircraftMarketOps,
  signAircraftLease,
  seedDryCleanSettlesForTests,
  LEASE_UNLOCK_CLEAN_DRY_SETTLES,
  aircraftLeaseUnlockProgress,
  unlistAircraftForLease,
} from './career-aircraft-market.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
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
        lease.leaseTermMonths === 6 || lease.leaseTermMonths === 12,
        'lease terms are short career contracts',
      );
      assert.equal(
        lease.askingUsd,
        Math.round((lease.leaseMonthlyUsd ?? 0) * 2),
        'lease deposit is two months',
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

  it('signs a lease with entry payment and monthly terms', () => {
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

  it('early-returns a lease with a remaining-month penalty and drops the airframe', () => {
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
    const monthly = aircraft.lease!.monthlyUsd;
    const remaining = leaseRemainingMonths(aircraft, world.tick);
    const expected = quoteLeaseEarlyReturnUsd(aircraft, world.tick);
    assert.equal(
      expected,
      Math.round(monthly * Math.min(3, Math.max(1, Math.ceil(remaining * 0.5)))),
    );
    const before = state.walletUsd;
    const result = returnAircraftLeaseEarly(state, aircraft.id, world.tick);
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
      () => returnAircraftLeaseEarly(state, aircraft.id, world.tick),
      /overdue/i,
    );
    aircraft.leaseOverdue = false;

    aircraft.status = 'assigned';
    assert.throws(
      () => returnAircraftLeaseEarly(state, aircraft.id, world.tick),
      /mission/i,
    );
  });

  it('sell-back credits wallet and relists used on the board', () => {
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
    const { creditUsd, listing } = sellPlayerAircraft(state, aircraft.id, world.tick);
    assert.ok(creditUsd > 0);
    assert.equal(state.walletUsd, before + creditUsd);
    assert.ok(!state.fleet.some((a) => a.id === aircraft.id));
    assert.equal(listing.source, 'player_sale');
    assert.equal(listing.status, 'available');
    assert.equal(listing.kind, 'used');
    assert.ok(state.aircraftMarket?.some((l) => l.id === listing.id));
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
      () => sellPlayerAircraft(state, only.id, world.tick),
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
    // Force a second owned airframe for list-lease rules, then sell the starter.
    state.fleet.push({
      ...starter,
      id: 'acf_bonanza_99',
      aircraftClassId: 'light_ga',
      label: 'Spare Bonanza',
      ownership: 'owned',
      status: 'parked',
    });
    const { listing } = sellPlayerAircraft(state, 'acf_bonanza_99', world.tick);
    assert.equal(listing.source, 'player_sale');

    world.tick += 24;
    state.aircraftMarketDemandDay = economyDayIndex(world.tick);
    ensureAircraftMarket(state, world);
    const stillThere = state.aircraftMarket?.find((l) => l.id === listing.id);
    assert.ok(stillThere);
    assert.equal(stillThere!.status, 'available');
    assert.equal(stillThere!.source, 'player_sale');
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
    const listed = state.fleet.find((a) => a.id === 'acf_bonanza_2')!;
    assert.equal(listed.status, 'listed');

    unlistAircraftForLease(state, 'acf_bonanza_2');
    assert.equal(listed.status, 'parked');
    assert.equal(
      state.aircraftMarket?.find((l) => l.id === listing.id)?.status,
      'expired',
    );
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
      termMonths: 12,
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
    assert.equal(
      state.aircraftMarket?.find((l) => l.id === listing.id)?.status,
      'sold',
    );
    assert.ok(state.walletUsd >= walletBefore + listing.askingUsd);
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
    listAircraftForLease(state, starter.id, world.tick, { termMonths: 12 });

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
});
