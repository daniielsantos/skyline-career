import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AIRCRAFT_MSRP_USD,
  __testApplyNpcDemand,
  applyAircraftHoursAfterMission,
  clearAircraftMaintenance,
  ensureAircraftConditionPcts,
  ensureAircraftMarket,
  generateAircraftMarketListings,
  listAircraftForLease,
  listAircraftMarket,
  purchaseAircraftListing,
  sellPlayerAircraft,
  settleAircraftMarketOps,
  signAircraftLease,
  unlistAircraftForLease,
} from './career-aircraft-market.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { economyDayIndex } from './career-weather.js';
import { listCareerPlayerAirframes } from './career-player-airframes.js';

describe('aircraft market', () => {
  it('generates a stable new/used/lease board for a seed day', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-seed' });
    const marketAirframes = listCareerPlayerAirframes();
    const a = generateAircraftMarketListings({
      world,
      walletUsd: 10_000,
      dayIndex: 3,
      economyTick: world.tick,
    });
    const b = generateAircraftMarketListings({
      world,
      walletUsd: 10_000,
      dayIndex: 3,
      economyTick: world.tick,
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
      })) {
        kinds.add(listing.kind);
      }
    }
    assert.ok(kinds.has('new'));
    assert.ok(kinds.has('used'));
    assert.ok(kinds.has('lease'));
    assert.ok(a.every((l) => Boolean(l.airframeTypeId)));
    assert.ok(a.every((l) => l.label.length > 0));
    for (const used of a.filter((l) => l.kind === 'used')) {
      assert.ok(
        used.askingUsd < AIRCRAFT_MSRP_USD[used.aircraftClassId] * 0.95,
        `${used.id} used should be below new MSRP`,
      );
    }
    for (const lease of a.filter((l) => l.kind === 'lease')) {
      assert.ok(
        (lease.askingUsd ?? 0) < AIRCRAFT_MSRP_USD[lease.aircraftClassId] * 0.2,
        'lease entry should be far below purchase',
      );
      assert.ok((lease.leaseMonthlyUsd ?? 0) > 0);
    }
  });

  it('lists every enabled homologated airframe even on a low-wallet board', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-caps' });
    const listings = generateAircraftMarketListings({
      world,
      walletUsd: 5_000,
      dayIndex: 1,
      economyTick: world.tick,
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
    assert.equal(state.walletUsd, 0);
    assert.ok(state.fleet.some((a) => a.id === aircraft.id));
  });

  it('signs a lease with entry payment and monthly terms', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-lease' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      pilotName: 'Lessee',
    });
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

  it('sell-back credits wallet and relists used on the board', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-sell' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGL', {
      pilotName: 'Seller',
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

  it('preserves player listings across a day refresh', () => {
    const world = createSeedEconomyWorld({ seed: 'acf-mkt-preserve' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Keep',
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
});
