/**
 * Seaport catalog + factory buy → hub pickup / warehouse.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abandonPortPickup,
  buyPortListing,
  depositPortPickupToWarehouse,
  ensurePortListings,
  getCareerPort,
  listCareerPorts,
  listPortListings,
  quotePortListingUnitPriceUsd,
  resolvePortPickupHub,
  settlePortYardHoldFees,
  PORT_YARD_HOLD_USD_PER_KG_DAY,
  stagePortPickupToFbo,
} from './career-ports.js';
import {
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
  WAREHOUSE_T1_CAPACITY_KG,
} from './career-warehouse.js';
import {
  airportByIcao,
  createSeedEconomyWorld,
  getCommodity,
  localUnitPriceUsd,
  migrateEconomyWorld,
} from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';

describe('career ports', () => {
  it('charges yard hold fees on port pickups by economy day', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-yard' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'YardHold',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 50_000;
    state.portPickups = [
      {
        id: 'portpk_yard',
        portId: 'BRSSZ',
        hubIcao: 'SBGR',
        commodityId: 'general',
        kg: 1_000,
        avgCostUsdPerKg: 1,
        purchasedAtTick: world.tick,
      },
    ];
    const fromTick = world.tick;
    const toTick = world.tick + 96; // 1 economy day
    const fees = settlePortYardHoldFees(state, { fromTick, toTick });
    assert.equal(fees.daysCharged, 1);
    assert.ok(fees.debitUsd > 0);
    assert.equal(
      fees.requestedUsd,
      Math.round(1_000 * PORT_YARD_HOLD_USD_PER_KG_DAY * 100) / 100,
    );
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'port_yard_hold'));
  });

  it('rejects port buy when Cargo Ops commodity is locked', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-lock' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortLock',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    // Electronics starts locked on the Cargo Ops ladder.
    assert.equal(state.cargoOps!.commodities.electronics.unlocked, false);

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) => l.commodityId === 'electronics' && l.allocatedHubIcao === 'SBGR',
    );
    // Force an electronics listing if rng didn't spawn one.
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_lock_test',
        portId: 'BRSSZ',
        commodityId: 'electronics',
        availableKg: 5_000,
        unitPriceUsd: 4,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
      });
    }
    const id = listing?.id ?? 'portlot_lock_test';
    assert.throws(
      () => buyPortListing(state, world, { listingId: id, kg: 500 }),
      /Cargo Ops: Electronics is locked/i,
    );
  });

  it('catalogs Santos and Paranaguá with real pickup hubs', () => {
    const ports = listCareerPorts();
    assert.equal(ports.length, 2);
    const santos = getCareerPort('BRSSZ');
    const png = getCareerPort('BRPNG');
    assert.ok(santos);
    assert.ok(png);
    assert.equal(resolvePortPickupHub(santos!), 'SBGR');
    assert.equal(resolvePortPickupHub(png!), 'SBCT');
    assert.ok(santos!.pickupHubs.includes('SBKP'));
    assert.ok(santos!.lat < -23 && santos!.lat > -24);
    assert.ok(png!.lon < -48 && png!.lon > -49);
  });

  it('seeds dynamic factory listings cheaper than hub spot and base', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-seed' });
    const listings = ensurePortListings(world);
    assert.ok(listings.length >= 2);
    const sample = listPortListings(world, 'BRSSZ')[0];
    assert.ok(sample);
    const base = getCommodity(sample!.commodityId).basePricePerKg;
    assert.ok(sample!.unitPriceUsd < base);
    // Dynamic: must not equal the old static formula for every seed, but must
    // stay below live hub spot when the hub has inventory.
    const hub = airportByIcao(world, sample!.allocatedHubIcao);
    const pile = hub?.inventory[sample!.commodityId];
    if (pile) {
      const spot = localUnitPriceUsd(sample!.commodityId, pile);
      assert.ok(sample!.unitPriceUsd < spot);
      assert.ok(sample!.unitPriceUsd <= spot * 0.7 + 1e-6);
    }
    assert.ok(sample!.unitPriceUsd >= base * 0.35 - 1e-6);
  });

  it('quotes different listing prices when hub fill changes', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-dyn' });
    const hub = airportByIcao(world, 'SBGR');
    assert.ok(hub);
    const pile = hub!.inventory.general!;
    pile.stockKg = Math.floor(pile.capacityKg * 0.05);
    const low = quotePortListingUnitPriceUsd(world, {
      commodityId: 'general',
      allocatedHubIcao: 'SBGR',
      rng: () => 0.5,
    });
    pile.stockKg = Math.floor(pile.capacityKg * 0.95);
    const high = quotePortListingUnitPriceUsd(world, {
      commodityId: 'general',
      allocatedHubIcao: 'SBGR',
      rng: () => 0.5,
    });
    assert.ok(low.hubSpotUnitPriceUsd != null);
    assert.ok(high.hubSpotUnitPriceUsd != null);
    assert.ok(low.hubSpotUnitPriceUsd! > high.hubSpotUnitPriceUsd!);
    assert.ok(low.unitPriceUsd > high.unitPriceUsd);
  });

  it('buys listing into hub pickup then stores in warehouse', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortBuyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing, 'expected a Dry Santos listing allocated to SBGR');

    const before = state.walletUsd;
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 1_000,
    });
    assert.equal(bought.kg, 1_000);
    assert.equal(bought.storedKg, 0);
    assert.equal(bought.yardKg, 1_000);
    assert.ok(bought.debitUsd > 0);
    assert.equal(state.walletUsd, before - bought.debitUsd);
    assert.ok(bought.pickup);
    assert.equal(state.portPickups!.length, 1);
    assert.equal(state.portPickups![0]!.hubIcao, 'SBGR');
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'port_buy'));

    buyWarehouseAtPickupHub(state, world, 'SBGR');
    const deposited = depositPortPickupToWarehouse(state, world, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(deposited.kg, 1_000);
    assert.equal(deposited.remainingYardKg, 0);
    assert.equal(state.portPickups!.length, 0);
    assert.equal(
      state.playerWarehouses!.stock.reduce((s, p) => s + p.kg, 0),
      1_000,
    );
  });

  it('buy with WH free space stores what fits and yards the rest', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-split-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortSplit',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: WAREHOUSE_T1_CAPACITY_KG - 800,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 2_000 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);

    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 2_000,
    });
    assert.equal(bought.storedKg, 800);
    assert.equal(bought.yardKg, 1_200);
    assert.ok(bought.warehousePile);
    assert.ok(bought.pickup);
    assert.equal(bought.pickup!.kg, 1_200);
  });

  it('partial store leaves remainder in yard; abandon drops oversized hold', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-partial-abandon' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortAbandon',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');

    ensurePortListings(world);
    let listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= WAREHOUSE_T1_CAPACITY_KG + 2_000 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_oversized',
        portId: 'BRSSZ',
        commodityId: 'general',
        availableKg: 50_000,
        unitPriceUsd: 1,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
      });
      listing = listPortListings(world, 'BRSSZ').find(
        (l) => l.id === 'portlot_oversized',
      );
    }
    assert.ok(listing);

    const buyKg = WAREHOUSE_T1_CAPACITY_KG + 2_000;
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: buyKg,
    });
    assert.equal(bought.storedKg, WAREHOUSE_T1_CAPACITY_KG);
    assert.equal(bought.yardKg, 2_000);
    assert.equal(bought.pickup!.kg, 2_000);

    // Free some WH space by abandoning is not needed — empty via direct stock wipe
    // then partial-store after buying into a full WH again would be separate.
    // Here: fill free to 500, then deposit should take 500 and leave 1500 yard.
    state.playerWarehouses!.stock = [
      {
        id: 'whpile_fill',
        warehouseId: state.playerWarehouses!.warehouses[0]!.id,
        commodityId: 'supplies',
        kg: WAREHOUSE_T1_CAPACITY_KG - 500,
        avgCostUsdPerKg: 1,
        acquiredAtTick: world.tick,
      },
    ];
    const deposited = depositPortPickupToWarehouse(state, world, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(deposited.kg, 500);
    assert.equal(deposited.remainingYardKg, 1_500);
    assert.equal(state.portPickups![0]!.kg, 1_500);

    const abandoned = abandonPortPickup(state, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(abandoned.kg, 1_500);
    assert.equal((state.portPickups ?? []).length, 0);
  });

  it('rejects fly-to-FBO stage (removed)', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-stage' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortFlyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    assert.throws(
      () =>
        stagePortPickupToFbo(state, world, {
          pickupId: 'x',
          destIcao: 'SBCT',
          aircraftId: 'y',
        }),
      /Demand Board/i,
    );
  });

  it('stacks multiple buys as separate pickups without warehouse', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-stack' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortStack',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 2_000 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    buyPortListing(state, world, { listingId: listing!.id, kg: 1_000 });
    buyPortListing(state, world, { listingId: listing!.id, kg: 1_000 });
    assert.equal(state.portPickups!.length, 2);
    assert.equal(
      state.portPickups!.reduce((s, p) => s + p.kg, 0),
      2_000,
    );
  });

  it('migrateEconomyWorld keeps port listings', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-migrate' });
    ensurePortListings(world);
    const before = world.portListings!.map((l) => l.id).sort();
    assert.ok(before.length >= 2);
    const migrated = migrateEconomyWorld(structuredClone(world));
    const after = (migrated.portListings ?? []).map((l) => l.id).sort();
    assert.deepEqual(after, before);
  });
});
