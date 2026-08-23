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
  PORT_P2_CAP_MULT,
  PORT_P2_THROUGHPUT_KG,
  PORT_P2_UPGRADE_USD,
  PORT_P3_ETA_MULT,
  PORT_P3_RESTOCK_FRAC_PER_DAY,
  PORT_P3_THROUGHPUT_KG,
  PORT_P3_UPGRADE_USD,
  PORT_OPERATOR_ETA_MULT,
  PORT_RESTOCK_FRAC_PER_DAY,
  claimPortConcession,
  concessionLeaseUsdPerDay,
  debitPortInventory,
  ensurePortInventories,
  ensurePortInventoryRestock,
  evaluatePortConcessionClaim,
  evaluatePortConcessionUpgrade,
  estimatePortInboundCargo,
  getPortInventoryStock,
  isPortOperator,
  portInventoryCapKg,
  portListingSlotCap,
  portOperatorEtaMult,
  portRestockFracPerDay,
  renewPortConcession,
  tickPortConcessions,
  upgradePortConcession,
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

  it('listing spawn does not restock the yard', () => {
    const world = createSeedEconomyWorld({ seed: 'port-no-get-restock' });
    ensurePortInventories(world);
    const row = (world.portInventories ?? []).find(
      (r) => r.portId === 'BRSSZ' && r.commodityId === 'general',
    )!;
    row.stockKg = 0;
    const before = getPortInventoryStock(world, 'BRSSZ', 'general');
    ensurePortListings(world);
    assert.equal(getPortInventoryStock(world, 'BRSSZ', 'general'), before);
  });

  it('P2 enlarges yard cap and lease scales with recent throughput', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 1_000_000;
    const conc = claimPortConcession(state, world, { portId: 'BRSSZ' });
    const p1Cap = portInventoryCapKg('general', { world, portId: 'BRSSZ' });
    const idleLease = concessionLeaseUsdPerDay(conc, world.tick);
    assert.equal(idleLease, PORT_CONCESSION_LEASE_USD_PER_DAY);

    conc.lifetimeThroughputKg = PORT_P2_THROUGHPUT_KG;
    conc.throughputWindowDay = Math.floor(world.tick / 96);
    conc.throughputWindowKg = [PORT_P2_THROUGHPUT_KG, 0, 0, 0, 0, 0, 0];
    const busyLease = concessionLeaseUsdPerDay(conc, world.tick);
    assert.ok(busyLease > idleLease);

    state.walletUsd = Math.max(state.walletUsd, PORT_P2_UPGRADE_USD + 1);
    const upgraded = upgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(upgraded.level, 2);
    const p2Cap = portInventoryCapKg('general', { world, portId: 'BRSSZ' });
    assert.equal(p2Cap, Math.floor(p1Cap * PORT_P2_CAP_MULT));
  });

  it('P3 raises restock cadence and listing slots without extra buy discount', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 2_000_000;
    const conc = claimPortConcession(state, world, { portId: 'BRSSZ' });
    conc.lifetimeThroughputKg = PORT_P2_THROUGHPUT_KG;
    upgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(portListingSlotCap(world, 'BRSSZ'), 5);
    assert.equal(
      portRestockFracPerDay(world, 'BRSSZ'),
      PORT_RESTOCK_FRAC_PER_DAY,
    );
    const p2Eta = portOperatorEtaMult(world, 'BRSSZ');
    assert.equal(p2Eta, PORT_OPERATOR_ETA_MULT);

    const row = (world.portInventories ?? []).find(
      (r) => r.portId === 'BRSSZ' && r.commodityId === 'general',
    );
    if (row) row.stockKg = 0;
    const p2Inbound = estimatePortInboundCargo(world, 'BRSSZ').find(
      (c) => c.commodityId === 'general',
    )!.kg;

    const p2Gate = evaluatePortConcessionUpgrade(state, world, 'BRSSZ');
    assert.equal(p2Gate.ok, false);
    assert.equal(p2Gate.toLevel, 3);
    conc.lifetimeThroughputKg = PORT_P3_THROUGHPUT_KG;
    state.walletUsd = Math.max(state.walletUsd, PORT_P3_UPGRADE_USD + 1);
    const p3 = upgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(p3.level, 3);
    assert.equal(portListingSlotCap(world, 'BRSSZ'), 6);
    assert.equal(
      portRestockFracPerDay(world, 'BRSSZ'),
      PORT_P3_RESTOCK_FRAC_PER_DAY,
    );
    assert.equal(portOperatorEtaMult(world, 'BRSSZ'), PORT_P3_ETA_MULT);
    const p3Cap = portInventoryCapKg('general', { world, portId: 'BRSSZ' });
    assert.equal(
      p3Cap,
      Math.floor(
        portInventoryCapKg('general') * PORT_P2_CAP_MULT,
      ),
    );
    if (row) row.stockKg = 0;
    const p3Inbound = estimatePortInboundCargo(world, 'BRSSZ').find(
      (c) => c.commodityId === 'general',
    )!.kg;
    assert.ok(p3Inbound > p2Inbound);

    const idleP3Lease = concessionLeaseUsdPerDay(conc, world.tick);
    assert.ok(
      idleP3Lease >=
        PORT_CONCESSION_LEASE_USD_PER_DAY * 1.4 - 0.01,
    );

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.availableKg >= 400 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 400,
    });
    assert.ok(bought.unitPriceUsd <= listing!.unitPriceUsd * 0.91);
    assert.ok(bought.unitPriceUsd >= listing!.unitPriceUsd * 0.85);
  });
});
