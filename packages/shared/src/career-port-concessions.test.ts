/**
 * Port inventory restock + concession claim / renew / expire.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buyPortListing,
  ensurePortListings,
  listPortListings,
  quotePortListingUnitPriceUsd,
} from './career-ports.js';
import {
  PORT_CONCESSION_CLAIM_USD,
  PORT_CONCESSION_LEASE_DAYS,
  PORT_CONCESSION_LEASE_TICKS,
  PORT_CONCESSION_LEASE_USD_PER_DAY,
  PORT_CONCESSION_SHIPPED_KG,
  claimPortConcession,
  debitPortInventory,
  ensurePortInventories,
  ensurePortInventoryRestock,
  evaluatePortConcessionClaim,
  getPortInventoryStock,
  isPortOperator,
  portListingSlotCap,
  renewPortConcession,
  tickPortConcessions,
} from './career-port-concessions.js';
import {
  createSeedEconomyWorld,
  migrateEconomyWorld,
} from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { ensurePlayerWarehouses } from './career-warehouse.js';

function missionsAtSantos() {
  const world = createSeedEconomyWorld({ seed: 'port-conc-base' });
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Conc',
    airframeTypeId: 'asobo-c172sp-cargo',
  });
  state.walletUsd = 500_000;
  return { world, state };
}

function grantT3PickupWarehouse(
  state: ReturnType<typeof emptyMissionsStateV2>,
  icao = 'SBGR',
  shippedKg = PORT_CONCESSION_SHIPPED_KG,
) {
  const warehouses = ensurePlayerWarehouses(state);
  warehouses.warehouses.push({
    id: `wh_${icao.toLowerCase()}_t3`,
    icao,
    capacityKg: 6_804,
    tier: 3,
    lifetimeShippedKg: shippedKg,
  });
}

describe('port inventory', () => {
  it('drains on listing spawn and restocks over ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'port-inv-drain' });
    ensurePortInventories(world);
    const before = getPortInventoryStock(world, 'BRSSZ', 'general');
    assert.ok(before > 0);
    const taken = debitPortInventory(world, 'BRSSZ', 'general', 10_000);
    assert.equal(taken, 10_000);
    assert.equal(
      getPortInventoryStock(world, 'BRSSZ', 'general'),
      before - 10_000,
    );

    const mid = getPortInventoryStock(world, 'BRSSZ', 'general');
    world.tick += 96; // 1 economy day
    ensurePortInventoryRestock(world);
    assert.ok(getPortInventoryStock(world, 'BRSSZ', 'general') > mid);
  });

  it('listing spawn pulls from inventory', () => {
    const world = createSeedEconomyWorld({ seed: 'port-inv-list' });
    ensurePortInventories(world);
    const beforeSum = (world.portInventories ?? []).reduce(
      (s, r) => (r.portId === 'BRSSZ' ? s + r.stockKg : s),
      0,
    );
    ensurePortListings(world);
    const afterSum = (world.portInventories ?? []).reduce(
      (s, r) => (r.portId === 'BRSSZ' ? s + r.stockKg : s),
      0,
    );
    const openKg = listPortListings(world, 'BRSSZ').reduce(
      (s, l) => s + l.availableKg,
      0,
    );
    assert.ok(openKg > 0);
    assert.ok(afterSum < beforeSum);
    assert.ok(beforeSum - afterSum >= openKg * 0.5);
  });

  it('quote rises when stock is low (same hub)', () => {
    const world = createSeedEconomyWorld({ seed: 'port-inv-price' });
    ensurePortInventories(world);
    const hub = 'SBGR';
    const commodityId = 'general' as const;
    const full = quotePortListingUnitPriceUsd(world, {
      commodityId,
      allocatedHubIcao: hub,
      portId: 'BRSSZ',
      rng: () => 0.5,
    });
    const row = (world.portInventories ?? []).find(
      (r) => r.portId === 'BRSSZ' && r.commodityId === commodityId,
    )!;
    row.stockKg = 0;
    const empty = quotePortListingUnitPriceUsd(world, {
      commodityId,
      allocatedHubIcao: hub,
      portId: 'BRSSZ',
      rng: () => 0.5,
    });
    assert.ok(empty.unitPriceUsd > full.unitPriceUsd);
  });

  it('migrateEconomyWorld keeps port inventories', () => {
    const world = createSeedEconomyWorld({ seed: 'port-inv-migrate' });
    ensurePortInventories(world);
    const before = structuredClone(world.portInventories);
    const migrated = migrateEconomyWorld(structuredClone(world));
    assert.deepEqual(migrated.portInventories, before);
  });
});

describe('port concessions', () => {
  it('blocks claim without T3 / shipped / cash', () => {
    const { world, state } = missionsAtSantos();
    state.walletUsd = 1_000;
    const gate = evaluatePortConcessionClaim(state, world, 'BRSSZ');
    assert.equal(gate.ok, false);
    assert.ok(gate.reasons.length >= 1);

    grantT3PickupWarehouse(state, 'SBGR', 100);
    const gate2 = evaluatePortConcessionClaim(state, world, 'BRSSZ');
    assert.equal(gate2.ok, false);
    assert.ok(
      gate2.reasons.some((r) => r.toLowerCase().includes('shipped')),
    );
  });

  it('claims with gates, buffs buy price, blocks second claim', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    const due =
      PORT_CONCESSION_CLAIM_USD +
      PORT_CONCESSION_LEASE_USD_PER_DAY * PORT_CONCESSION_LEASE_DAYS;
    state.walletUsd = due + 200_000;

    const beforeWallet = state.walletUsd;
    const conc = claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(conc.portId, 'BRSSZ');
    assert.ok(isPortOperator(world, 'BRSSZ'));
    assert.equal(state.walletUsd, beforeWallet - due);
    assert.equal(portListingSlotCap(world, 'BRSSZ'), 5);

    assert.throws(
      () => claimPortConcession(state, world, { portId: 'BRSUA' }),
      /already holds/i,
    );

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.availableKg >= 500 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 500,
    });
    assert.ok(bought.unitPriceUsd <= listing!.unitPriceUsd * 0.91);
    assert.ok(
      (state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0) >= 500,
    );
  });

  it('lease expiry clears operator buffs; non-operator can still buy', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 500_000;
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.ok(isPortOperator(world, 'BRSSZ'));

    world.tick += PORT_CONCESSION_LEASE_TICKS + 1;
    const dropped = tickPortConcessions(state, world);
    assert.equal(dropped, true);
    assert.equal(isPortOperator(world, 'BRSSZ'), false);
    assert.equal(portListingSlotCap(world, 'BRSSZ'), 4);

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.availableKg >= 200 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 200,
    });
    assert.ok(bought.kg === 200);
    assert.ok(
      ensurePlayerWarehouses(state).warehouses.some((w) => w.icao === 'SBGR'),
    );
  });

  it('renew extends leasePaidThroughTick', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 500_000;
    const conc = claimPortConcession(state, world, { portId: 'BRSSZ' });
    const through = conc.leasePaidThroughTick;
    renewPortConcession(state, world, { portId: 'BRSSZ', days: 7 });
    assert.equal(
      state.playerPortConcessions![0]!.leasePaidThroughTick,
      through + 7 * 96,
    );
  });
});
