/**
 * Port inventory restock + concession claim / renew / expire.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TICKS_PER_DAY } from './career-clock.js';
import {
  buyPortListing,
  ensurePortListings,
  listPortListings,
  quotePortListingUnitPriceUsd,
} from './career-ports.js';
import { acceptDemandOrder } from './career-demand.js';
import { departMission, settleMission } from './career-mission.js';
import { creditPortOperatorThroughputOnOutboundSettle } from './career-port-throughput.js';
import { depositCargoToWarehouse, WAREHOUSE_CAPACITY_KG } from './career-warehouse-stock.js';
import {
  PORT_CONCESSION_CLAIM_USD,
  PORT_CONCESSION_LEASE_DAYS,
  PORT_CONCESSION_LEASE_TICKS,
  PORT_CONCESSION_LEASE_USD_PER_DAY,
  PORT_CONCESSION_MAX_ACTIVE,
  PORT_CONCESSION_SHIPPED_KG,
  PORT_P2_CAP_MULT,
  PORT_P2_CHARTER_PAX,
  PORT_P2_THROUGHPUT_KG,
  PORT_P2_UPGRADE_USD,
  PORT_P3_ETA_MULT,
  PORT_P3_RESTOCK_FRAC_PER_DAY,
  PORT_P3_THROUGHPUT_KG,
  PORT_P3_UPGRADE_USD,
  PORT_OPERATOR_ETA_MULT,
  PORT_RESTOCK_FRAC_PER_DAY,
  claimPortConcession,
  debugForceUpgradePortConcession,
  concessionLeaseUsdPerDay,
  debitPortInventory,
  ensurePortInventories,
  ensurePortInventoryRestock,
  evaluatePortConcessionClaim,
  evaluatePortConcessionUpgrade,
  estimatePortInboundCargo,
  getPortInventoryStock,
  healMissingPortConcessionFromLedger,
  isPortOperator,
  hasPortOperatorBenefits,
  portInventoryCapKg,
  portListingSlotCap,
  portOperatorEtaMult,
  portRestockFracPerDay,
  renewPortConcession,
  surrenderPortConcession,
  tickPortConcessions,
  upgradePortConcession,
} from './career-port-concessions.js';
import {
  createSeedEconomyWorld,
  migrateEconomyWorld,
} from './career-economy.js';
import {
  emptyMissionsStateV2,
  normalizeMissionsState,
  selectStarterHub,
} from './career-fleet.js';
import { ensurePlayerWarehouses } from './career-warehouse.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';

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
    capacityKg: WAREHOUSE_CAPACITY_KG[3],
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
    world.tick += TICKS_PER_DAY; // 1 economy day
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

  it('claims with gates, buffs buy price, and allows one more Port FBO', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    grantT3PickupWarehouse(state, 'SBCT', PORT_CONCESSION_SHIPPED_KG);
    grantT3PickupWarehouse(state, 'SBRF', PORT_CONCESSION_SHIPPED_KG);
    const due =
      PORT_CONCESSION_CLAIM_USD +
      PORT_CONCESSION_LEASE_USD_PER_DAY * PORT_CONCESSION_LEASE_DAYS;
    state.walletUsd = due * 3 + 200_000;

    const beforeWallet = state.walletUsd;
    const conc = claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(conc.portId, 'BRSSZ');
    assert.ok(isPortOperator(world, 'BRSSZ'));
    assert.equal(state.walletUsd, beforeWallet - due);
    assert.equal(portListingSlotCap(world, 'BRSSZ'), 5);

    const second = claimPortConcession(state, world, { portId: 'BRPNG' });
    assert.equal(second.portId, 'BRPNG');
    assert.ok(isPortOperator(world, 'BRPNG'));

    assert.throws(
      () => claimPortConcession(state, world, { portId: 'BRSUA' }),
      /at most 2/i,
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
    assert.equal(
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0,
      0,
      'port buy must not credit FBO throughput (settle-only)',
    );
  });

  it('counts Port FBOs that exist only on the world index', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBRF', PORT_CONCESSION_SHIPPED_KG);
    const due =
      PORT_CONCESSION_CLAIM_USD +
      PORT_CONCESSION_LEASE_USD_PER_DAY * PORT_CONCESSION_LEASE_DAYS;
    state.walletUsd = due + 1;
    state.playerPortConcessions = [];
    world.portConcessions = [
      {
        portId: 'BRSSZ',
        companyId: LOCAL_COMPANY_ID,
        leasePaidThroughTick: world.tick + PORT_CONCESSION_LEASE_TICKS,
        level: 3,
      },
      {
        portId: 'BRPNG',
        companyId: LOCAL_COMPANY_ID,
        leasePaidThroughTick: world.tick + PORT_CONCESSION_LEASE_TICKS,
        level: 1,
      },
    ];
    assert.equal(PORT_CONCESSION_MAX_ACTIVE, 2);
    const gate = evaluatePortConcessionClaim(state, world, 'BRSUA');
    assert.equal(gate.ok, false);
    assert.ok(gate.reasons.some((r) => /at most 2/i.test(r)));
    assert.throws(
      () => claimPortConcession(state, world, { portId: 'BRSUA' }),
      /at most 2/i,
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
      through + 7 * TICKS_PER_DAY,
    );
  });

  it('surrender drops Port FBO without refund and blocks heal restore', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 500_000;
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const walletAfterClaim = state.walletUsd;
    state.portAutoBuyOrders = [
      {
        id: 'pabo_test',
        portId: 'BRSSZ',
        commodityId: 'general',
        maxPriceUsdPerKg: 1,
        maxKgPerDay: 1_000,
        warehouseId: 'wh_sbgr',
        walletFloorUsd: 0,
        paused: false,
        boughtKgToday: 0,
        boughtDayIndex: 0,
        createdAtTick: world.tick,
      },
    ];

    const dropped = surrenderPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(dropped.portId, 'BRSSZ');
    assert.equal(dropped.removedAutoBuyOrders, 1);
    assert.equal(state.playerPortConcessions?.length ?? 0, 0);
    assert.equal(state.portAutoBuyOrders?.length ?? 0, 0);
    assert.equal(state.walletUsd, walletAfterClaim, 'no refund');
    assert.equal(
      (world.portConcessions ?? []).some(
        (c) => c.portId === 'BRSSZ' && c.leasePaidThroughTick > world.tick,
      ),
      false,
    );
    assert.ok(
      (state.ledger ?? []).some((e) => e.kind === 'port_concession_surrender'),
    );
    assert.equal(
      healMissingPortConcessionFromLedger(state, world),
      'none',
      'heal must not restore a voluntary drop',
    );
    assert.equal(state.playerPortConcessions?.length ?? 0, 0);
    // WH remains
    assert.ok(
      ensurePlayerWarehouses(state).warehouses.some((w) => w.icao === 'SBGR'),
    );
  });

  it('ship follows pickup-hub pressure and ports do not share a clock', () => {
    const world = createSeedEconomyWorld({ seed: 'port-pressure-ship' });
    ensurePortInventories(world);
    const sbgr = world.airports.find((a) => a.icao === 'SBGR');
    assert.ok(sbgr);
    const general = sbgr!.inventory.general;
    const supplies = sbgr!.inventory.supplies;
    assert.ok(general && supplies && general.capacityKg > 0 && supplies.capacityKg > 0);
    general.stockKg = Math.floor(general.capacityKg * 0.9);
    supplies.stockKg = Math.floor(supplies.capacityKg * 0.1);
    for (const row of world.portInventories ?? []) {
      if (row.portId === 'BRSSZ' && (row.commodityId === 'general' || row.commodityId === 'supplies')) {
        row.stockKg = 0;
      }
    }

    const inbound = estimatePortInboundCargo(world, 'BRSSZ');
    assert.equal(
      inbound.find((c) => c.commodityId === 'general')?.kg ?? 0,
      0,
    );
    const suppliesCap = portInventoryCapKg('supplies', { world, portId: 'BRSSZ' });
    assert.equal(
      inbound.find((c) => c.commodityId === 'supplies')?.kg ?? 0,
      Math.floor(suppliesCap * PORT_RESTOCK_FRAC_PER_DAY),
    );

    ensurePortInventoryRestock(world);
    const ships = world.portInboundShips ?? [];
    assert.ok(ships.length > 2);
    const clocks = new Set(ships.map((s) => s.arrivesAtTick));
    assert.ok(clocks.size > 1);
    for (const ship of ships) {
      assert.ok(ship.arrivesAtTick > world.tick);
    }
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
    conc.throughputWindowDay = Math.floor(world.tick / TICKS_PER_DAY);
    conc.throughputWindowKg = [PORT_P2_THROUGHPUT_KG, 0, 0, 0, 0, 0, 0];
    const busyLease = concessionLeaseUsdPerDay(conc, world.tick);
    assert.ok(busyLease > idleLease);

    state.walletUsd = Math.max(state.walletUsd, PORT_P2_UPGRADE_USD + 1);
    const upgraded = upgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(upgraded.level, 2);
    const p2Cap = portInventoryCapKg('general', { world, portId: 'BRSSZ' });
    assert.equal(p2Cap, Math.floor(p1Cap * PORT_P2_CAP_MULT));
  });

  it('P2 opens on passengers flown without cargo throughput', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 1_000_000;
    const conc = claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(conc.lifetimeThroughputKg, 0);
    conc.lifetimeCharterPax = PORT_P2_CHARTER_PAX;
    const gate = evaluatePortConcessionUpgrade(state, world, 'BRSSZ');
    assert.equal(gate.ok, true);
    const upgraded = upgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(upgraded.level, 2);
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
    const sbgrGeneral = world.airports.find((a) => a.icao === 'SBGR')?.inventory
      .general;
    if (sbgrGeneral && sbgrGeneral.capacityKg > 0) {
      sbgrGeneral.stockKg = Math.floor(sbgrGeneral.capacityKg * 0.2);
    }
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

  it('normalizeMissionsState keeps Port FBO after claim (persist regression)', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state);
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(state.playerPortConcessions?.length, 1);
    const normalized = normalizeMissionsState(
      state as unknown as Record<string, unknown>,
    );
    assert.equal(normalized.playerPortConcessions?.length, 1);
    assert.equal(normalized.playerPortConcessions?.[0]?.portId, 'BRSSZ');
  });

  it('heals Port FBO from ledger when company JSON dropped the row', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state);
    const beforeWallet = state.walletUsd;
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.ok(state.walletUsd < beforeWallet);
    // Simulate the normalize bug wiping company concessions after debit.
    state.playerPortConcessions = [];
    world.portConcessions = [];
    const healed = healMissingPortConcessionFromLedger(state, world);
    assert.equal(healed, 'restored');
    assert.equal(state.playerPortConcessions?.length, 1);
    assert.equal(isPortOperator(world, 'BRSSZ'), true);
  });

  it('VA members inherit Port FBO buy/ETA benefits without desk ownership', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state);
    claimPortConcession(state, world, {
      portId: 'BRSSZ',
      companyId: 'co_va',
    });
    assert.equal(isPortOperator(world, 'BRSSZ', 'co_va'), true);
    assert.equal(isPortOperator(world, 'BRSSZ', 'co_home'), false);
    assert.equal(
      hasPortOperatorBenefits(world, 'BRSSZ', 'co_home', ['co_va']),
      true,
    );
    assert.equal(
      hasPortOperatorBenefits(world, 'BRSSZ', 'co_home', ['co_other']),
      false,
    );
    assert.equal(
      portOperatorEtaMult(world, 'BRSSZ', 'co_home', ['co_va']),
      PORT_OPERATOR_ETA_MULT,
    );
    assert.equal(portOperatorEtaMult(world, 'BRSSZ', 'co_home'), 1);
  });

  it('Demand settle credits FBO throughput; port buy does not', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 500_000;
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0, 0);

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.availableKg >= 400 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    buyPortListing(state, world, { listingId: listing!.id, kg: 400 });
    assert.equal(
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0,
      0,
    );

    // Force WH stock ready (inbound may still be transferring).
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 300,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });

    const dest = world.airports.find((a) => a.icao === 'SBKP');
    assert.ok(dest);
    dest!.inventory.general!.stockKg = Math.floor(
      dest!.inventory.general!.capacityKg * 0.05,
    );
    world.demandOrders = [
      {
        id: 'demand_tp_settle',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 4_000,
        remainingKg: 4_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    const accepted = acceptDemandOrder(state, world, {
      orderId: 'demand_tp_settle',
      originIcao: 'SBGR',
      aircraftId: aircraft.id,
      kg: 250,
    });
    const departed = departMission(world, accepted.mission, { fleet: state });
    settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    assert.equal(
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0,
      accepted.kg,
    );
    assert.ok(
      (state.playerPortConcessions?.[0]?.throughputWindowKg?.[0] ?? 0) >=
        accepted.kg,
    );
  });

  it('Demand settle credits when the world port index is empty', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 500_000;
    claimPortConcession(state, world, {
      portId: 'BRSSZ',
      companyId: 'co_va',
    });
    world.portConcessions = [];
    const before =
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0;

    creditPortOperatorThroughputOnOutboundSettle(state, world, {
      originIcao: 'SBGR',
      kg: 5_990,
      demandOrderId: 'demand_missing_from_slice',
    });

    assert.equal(
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0,
      before + 5_990,
    );
    assert.equal(
      state.playerPortConcessions?.[0]?.throughputWindowKg?.[0] ?? 0,
      5_990,
    );
  });

  it('Demand settle credits the origin port when the order names another port', () => {
    const { world, state } = missionsAtSantos();
    state.playerPortConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_va',
        level: 1,
        claimedAtTick: world.tick,
        leasePaidThroughTick: world.tick + 500,
        lifetimeThroughputKg: 39_054,
      },
    ];
    world.portConcessions = [];
    world.demandOrders = [
      {
        id: 'demand_other_port',
        destIcao: 'MKTP',
        commodityId: 'general',
        wantedKg: 6_000,
        remainingKg: 0,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'filled',
        portId: 'BRSSZ',
      },
    ];

    creditPortOperatorThroughputOnOutboundSettle(state, world, {
      originIcao: 'KMIA',
      kg: 5_990,
      demandOrderId: 'demand_other_port',
    });

    assert.equal(
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg,
      39_054 + 5_990,
    );
  });

  it('credits the 7d window when a zero week was already saved', () => {
    const { world, state } = missionsAtSantos();
    const day = Math.floor(world.tick / TICKS_PER_DAY);
    state.playerPortConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_va',
        level: 1,
        claimedAtTick: world.tick,
        leasePaidThroughTick: world.tick + 500,
        lifetimeThroughputKg: 39_054,
        throughputWindowDay: day,
        throughputWindowKg: [0, 0, 0, 0, 0, 0, 0],
      },
    ];
    world.portConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_va',
        leasePaidThroughTick: world.tick + 500,
        level: 1,
      },
    ];
    creditPortOperatorThroughputOnOutboundSettle(state, world, {
      originIcao: 'KMIA',
      kg: 19_962,
      demandOrderId: 'demand_same_day',
    });
    const conc = state.playerPortConcessions?.[0];
    assert.equal(conc?.lifetimeThroughputKg, 39_054 + 19_962);
    assert.equal(conc?.throughputWindowKg?.[0], 19_962);
    assert.equal(
      (conc?.throughputWindowKg ?? []).reduce((sum, n) => sum + n, 0),
      19_962,
    );
  });

  it('does not credit a company when another operator holds the port', () => {
    const { world, state } = missionsAtSantos();
    state.playerPortConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_va',
        level: 1,
        claimedAtTick: world.tick,
        leasePaidThroughTick: world.tick + 500,
        lifetimeThroughputKg: 100,
      },
    ];
    world.portConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_rival',
        leasePaidThroughTick: world.tick + 500,
        level: 1,
      },
    ];

    creditPortOperatorThroughputOnOutboundSettle(state, world, {
      originIcao: 'KMIA',
      kg: 5_990,
      demandOrderId: 'demand_rival',
    });

    assert.equal(state.playerPortConcessions?.[0]?.lifetimeThroughputKg, 100);
  });

  it('Demand settle credits a warehouse-bridge leg when the port index is empty', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 500_000;
    claimPortConcession(state, world, {
      portId: 'BRSSZ',
      companyId: 'co_va',
    });
    world.portConcessions = [];
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 300,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    const dest = world.airports.find((a) => a.icao === 'SBKP');
    assert.ok(dest);
    dest!.inventory.general!.stockKg = Math.floor(
      dest!.inventory.general!.capacityKg * 0.05,
    );
    world.demandOrders = [
      {
        id: 'demand_bridge_settle',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 4_000,
        remainingKg: 4_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const accepted = acceptDemandOrder(state, world, {
      orderId: 'demand_bridge_settle',
      originIcao: 'SBGR',
      aircraftId: aircraft.id,
      kg: 250,
    });
    const departed = departMission(world, accepted.mission, { fleet: state });
    departed.mission.warehouseBridge = true;
    world.portConcessions = [];
    settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    assert.equal(
      state.playerPortConcessions?.[0]?.lifetimeThroughputKg ?? 0,
      accepted.kg,
    );
  });

  it('debug evolve raises P1→P2→P3 without cash or throughput', () => {
    const { world, state } = missionsAtSantos();
    grantT3PickupWarehouse(state, 'SBGR', PORT_CONCESSION_SHIPPED_KG);
    state.walletUsd = 1_000_000;
    const claimed = claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(claimed.level ?? 1, 1);
    const wallet = state.walletUsd;

    const p2 = debugForceUpgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(p2.level, 2);
    assert.equal(state.walletUsd, wallet);
    const p3 = debugForceUpgradePortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(p3.level, 3);
    assert.equal(state.walletUsd, wallet);
    assert.throws(
      () => debugForceUpgradePortConcession(state, world, { portId: 'BRSSZ' }),
      /already P3/i,
    );
    assert.throws(
      () => debugForceUpgradePortConcession(state, world, { portId: 'BRSUA' }),
      /claim it first/i,
    );
  });
});
