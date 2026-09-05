/**
 * Player warehouses at port pickup hubs + Demand Board.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abandonWarehouseStock,
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
  normalizePlayerWarehouseState,
  previewWithdrawCargoCost,
  settleWarehouseStorageFees,
  settleWarehouseInboundTransfers,
  upgradeWarehouse,
  upgradeWarehouseToTier2,
  warehouseFreeKg,
  warehouseFreeCommodityKg,
  warehouseReservedCommodityKg,
  warehouseTier2Progress,
  withdrawCargoFromWarehouse,
  WAREHOUSE_T1_CAPACITY_KG,
  WAREHOUSE_T2_CAPACITY_KG,
  WAREHOUSE_T3_CAPACITY_KG,
  WAREHOUSE_T4_CAPACITY_KG,
  WAREHOUSE_T2_SHIPPED_KG,
  WAREHOUSE_T3_SHIPPED_KG,
  WAREHOUSE_T4_SHIPPED_KG,
} from './career-warehouse.js';
import {
  acceptDemandOrder,
  cancelDemandHold,
  demandSnapshot,
  dispatchDemandHold,
  ensureDemandOrders,
  expireDemandHolds,
  holdDemandOrder,
  listOpenDemandOrders,
  replaceDemandMissionCargo,
  demandMissionEditableMaxKg,
} from './career-demand.js';
import {
  acceptWarehouseBridge,
  holdWarehouseBridge,
} from './career-warehouse-bridge.js';
import {
  acceptWarehouseHaul,
  cancelWarehouseHaulHold,
  holdWarehouseHaul,
} from './career-warehouse-haul.js';
import {
  buyPortListing,
  depositPortPickupToWarehouse,
  ensurePortListings,
  listPortListings,
} from './career-ports.js';
import { cancelMission, departMission, settleMission } from './career-mission.js';
import { createSeedEconomyWorld, migrateEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { applyWalletDelta } from './career-ledger.js';
import { normalizePlayerFboState } from './career-fbo.js';

describe('career warehouse + demand', () => {
  it('keeps separate warehouse lots when buy costs differ', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-lots' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhLots',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'electronics',
      kg: 400,
      avgCostUsdPerKg: 4.0,
      tick: world.tick,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'electronics',
      kg: 300,
      avgCostUsdPerKg: 5.5,
      tick: world.tick + 1,
    });
    // Near-identical cost merges into the first lot.
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'electronics',
      kg: 100,
      avgCostUsdPerKg: 4.05,
      tick: world.tick + 2,
    });
    const piles = (state.playerWarehouses?.stock ?? []).filter(
      (s) => s.commodityId === 'electronics',
    );
    assert.equal(piles.length, 2);
    const cheap = piles.find((p) => p.avgCostUsdPerKg < 4.5)!;
    const dear = piles.find((p) => p.avgCostUsdPerKg > 5)!;
    assert.ok(cheap);
    assert.ok(dear);
    assert.equal(cheap.kg, 500);
    assert.equal(dear.kg, 300);
  });

  it('previewWithdrawCargoCost matches FIFO withdraw average', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-preview' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhPreview',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 4,
      tick: world.tick + 1,
    });
    const piles = (state.playerWarehouses?.stock ?? []).filter(
      (s) => s.commodityId === 'general',
    );
    const preview = previewWithdrawCargoCost(piles, 500);
    assert.ok(preview);
    // 400@2 + 100@4 = 1200 / 500 = 2.4
    assert.equal(preview!.avgCostUsdPerKg, 2.4);
    assert.equal(preview!.costUsd, 1200);
    const withdrawn = withdrawCargoFromWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 500,
    });
    assert.equal(withdrawn.avgCostUsdPerKg, preview!.avgCostUsdPerKg);
  });

  it('buys warehouse at pickup hub and rejects capacity overflow', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhBuyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    const bought = buyWarehouseAtPickupHub(state, world, 'SBGR');
    assert.equal(bought.warehouse.icao, 'SBGR');
    assert.equal(bought.warehouse.capacityKg, WAREHOUSE_T1_CAPACITY_KG);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'warehouse_buy'));

    assert.throws(
      () => buyWarehouseAtPickupHub(state, world, 'SBGR'),
      /already own/i,
    );
    assert.throws(
      () => buyWarehouseAtPickupHub(state, world, 'SBRJ'),
      /not a port pickup/i,
    );

    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: WAREHOUSE_T1_CAPACITY_KG,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    assert.equal(warehouseFreeKg(state, bought.warehouse.id), 0);
    assert.throws(
      () =>
        depositCargoToWarehouse(state, {
          icao: 'SBGR',
          commodityId: 'supplies',
          kg: 1,
          avgCostUsdPerKg: 1,
          tick: world.tick,
        }),
      /free capacity/i,
    );
  });

  it('abandons a warehouse stock lot without refund', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-abandon' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhAbandon',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    const bought = buyWarehouseAtPickupHub(state, world, 'SBGR');
    const walletBefore = state.walletUsd;
    const pile = depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 1_200,
      avgCostUsdPerKg: 1.5,
      tick: world.tick,
    });
    assert.equal(
      warehouseFreeKg(state, bought.warehouse.id),
      WAREHOUSE_T1_CAPACITY_KG - 1_200,
    );
    const abandoned = abandonWarehouseStock(state, { stockId: pile.id });
    assert.equal(abandoned.kg, 1_200);
    assert.equal(abandoned.hubIcao, 'SBGR');
    assert.equal(abandoned.commodityId, 'general');
    assert.equal(state.walletUsd, walletBefore);
    assert.equal((state.playerWarehouses?.stock ?? []).length, 0);
    assert.equal(
      warehouseFreeKg(state, bought.warehouse.id),
      WAREHOUSE_T1_CAPACITY_KG,
    );
    assert.throws(
      () => abandonWarehouseStock(state, { stockId: pile.id }),
      /not found/i,
    );
  });

  it('port buy queues inbound transfer when warehouse present', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-port' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhPort',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    ensurePortListings(world);
    let listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 500 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_wh_port_dry',
        portId: 'BRSSZ',
        commodityId: 'general',
        availableKg: 5_000,
        unitPriceUsd: 1,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
      });
      listing = listPortListings(world, 'BRSSZ').find(
        (l) => l.id === 'portlot_wh_port_dry',
      );
    }
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 500,
    });
    assert.equal(bought.pickup, null);
    assert.ok(bought.inboundTransfer);
    assert.equal(bought.inboundKg, 500);
    assert.equal((state.portPickups ?? []).length, 0);
    assert.equal((state.playerWarehouses?.stock ?? []).length, 0);
  });

  it('port pickup stores into warehouse manually', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-deposit' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhDep',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 400 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 400,
    });
    assert.ok(bought.pickup);
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    const deposited = depositPortPickupToWarehouse(state, world, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(deposited.kg, 400);
    assert.equal((state.portPickups ?? []).length, 0);
  });

  it('spawns demand when hub stock is short and expires past tick', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-spawn' });
    const ap = world.airports.find((a) => a.icao === 'SBCF');
    assert.ok(ap);
    const pile = ap!.inventory.general!;
    pile.stockKg = Math.floor(pile.capacityKg * 0.05);

    const orders = ensureDemandOrders(world);
    const open = listOpenDemandOrders(world, {
      destIcao: 'SBCF',
      commodityId: 'general',
    });
    assert.ok(open.length >= 1, `expected demand at SBCF, got ${orders.length}`);
    const order = open[0]!;
    order.expiresAtTick = world.tick;
    ensureDemandOrders(world);
    assert.equal(
      listOpenDemandOrders(world).some((o) => o.id === order.id),
      false,
    );
  });

  it('demand board hides Dest when it is the only owned warehouse hub', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-filter-wh' });
    world.demandOrders = [
      {
        id: 'demand_pin_sbct',
        destIcao: 'SBCT',
        commodityId: 'general',
        wantedKg: 2_000,
        remainingKg: 2_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
      {
        id: 'demand_pin_sbkp',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 2_000,
        remainingKg: 2_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    assert.ok(
      listOpenDemandOrders(world, { destIcao: 'SBCT', commodityId: 'general' })
        .length >= 1,
    );
    assert.ok(
      listOpenDemandOrders(world, { destIcao: 'SBKP', commodityId: 'general' })
        .length >= 1,
    );

    const onlySbct = demandSnapshot(world, { warehouseIcaos: ['SBCT'] });
    assert.equal(
      onlySbct.orders.some((o) => o.destIcao === 'SBCT'),
      false,
      'SBCT demand hidden when only WH is SBCT',
    );
    assert.ok(
      onlySbct.orders.some((o) => o.destIcao === 'SBKP'),
      'other Dest still visible',
    );

    const twoHubs = demandSnapshot(world, {
      warehouseIcaos: ['SBCT', 'SBGR'],
    });
    assert.ok(
      twoHubs.orders.some((o) => o.destIcao === 'SBCT'),
      'SBCT demand returns once another WH can originate',
    );
  });

  it('rejects demand accept when Cargo Ops commodity is locked', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-lock' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DemandLock',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'electronics',
      kg: 500,
      avgCostUsdPerKg: 4,
      tick: world.tick,
    });
    assert.equal(state.cargoOps!.commodities.electronics.unlocked, false);
    world.demandOrders = [
      {
        id: 'demand_lock_test',
        destIcao: 'SBKP',
        commodityId: 'electronics',
        wantedKg: 400,
        remainingKg: 400,
        maxUnitPriceUsd: 8,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    assert.throws(
      () =>
        acceptDemandOrder(state, world, {
          orderId: 'demand_lock_test',
          originIcao: 'SBGR',
          aircraftId: aircraft.id,
          kg: 200,
        }),
      /Cargo Ops: Electronics is locked/i,
    );
  });

  it('accept → settle pays demand and fills dest stock; cancel restores', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-fly' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DemandFlyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 800,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });

    const dest = world.airports.find((a) => a.icao === 'SBKP');
    assert.ok(dest);
    const destPile = dest!.inventory.general!;
    destPile.stockKg = Math.floor(destPile.capacityKg * 0.05);
    world.demandOrders = [
      {
        id: 'demand_pin_fly_sbkp',
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
    const order = listOpenDemandOrders(world, {
      destIcao: 'SBKP',
      commodityId: 'general',
    })[0];
    assert.ok(order, 'need demand at SBKP for general');

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    const accepted = acceptDemandOrder(state, world, {
      orderId: order!.id,
      originIcao: 'SBGR',
      aircraftId: aircraft.id,
      kg: 300,
    });
    assert.equal(accepted.mission.demandOrderId, order!.id);
    assert.ok(accepted.payUsd > 0);
    const lifted = accepted.kg;
    assert.ok(lifted > 0);
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800 - lifted,
    );

    const remainingAfterAccept = order!.remainingKg;
    cancelMission(world, accepted.mission, { fleet: state });
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800,
    );
    const reopened = (world.demandOrders ?? []).find((o) => o.id === order!.id);
    assert.ok(reopened);
    assert.equal(reopened!.remainingKg, remainingAfterAccept + lifted);

    // Fresh accept + settle
    destPile.stockKg = Math.floor(destPile.capacityKg * 0.05);
    ensureDemandOrders(world);
    const order2 = listOpenDemandOrders(world, {
      destIcao: 'SBKP',
      commodityId: 'general',
    })[0];
    assert.ok(order2);
    aircraft.status = 'parked';
    aircraft.locationIcao = 'SBGR';
    aircraft.assignedMissionId = undefined;
    state.missions = [];

    const accepted2 = acceptDemandOrder(state, world, {
      orderId: order2!.id,
      originIcao: 'SBGR',
      aircraftId: aircraft.id,
      kg: 250,
    });
    const beforeStock = destPile.stockKg;
    const beforeWallet = state.walletUsd;
    const departed = departMission(world, accepted2.mission, { fleet: state });
    const settled = settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    assert.equal(settled.mission.status, 'settled');
    assert.ok(settled.walletCreditUsd > 0);
    applyWalletDelta(state, {
      amountUsd: settled.walletCreditUsd,
      kind: 'demand_payout',
      atTick: world.tick,
      missionId: settled.mission.id,
      icao: settled.mission.destIcao,
    });
    assert.equal(state.walletUsd, beforeWallet + settled.walletCreditUsd);
    assert.ok(destPile.stockKg > beforeStock);
    const wh = state.playerWarehouses!.warehouses[0]!;
    assert.equal(wh.lifetimeShippedKg ?? 0, accepted2.kg);
  });

  it('edit demand cargo restores WH on reduce and withdraws on increase', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-edit' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DemandEditor',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 800,
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
        id: 'demand_pin_edit_sbkp',
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
    const order = listOpenDemandOrders(world, {
      destIcao: 'SBKP',
      commodityId: 'general',
    })[0];
    assert.ok(order, 'need demand at SBKP for general');
    assert.ok(order!.remainingKg >= 400, 'need enough demand remaining');

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    const accepted = acceptDemandOrder(state, world, {
      orderId: order!.id,
      originIcao: 'SBGR',
      aircraftId: aircraft.id,
      kg: 300,
    });
    const lifted = accepted.kg;
    assert.ok(lifted >= 100, `expected usable lift, got ${lifted}`);
    const remainingAfterAccept = order!.remainingKg;
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800 - lifted,
    );

    const reducedKg = 100;
    const reduced = replaceDemandMissionCargo(state, world, accepted.mission, {
      cargoKg: reducedKg,
    });
    assert.equal(reduced.cargoKg, reducedKg);
    assert.equal(
      Math.round(reduced.payUsd),
      Math.round(order!.maxUnitPriceUsd * reducedKg),
    );
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800 - reducedKg,
    );
    assert.equal(order!.remainingKg, remainingAfterAccept + (lifted - reducedKg));
    assert.equal(reduced.status, 'accepted');

    const maxEditable = demandMissionEditableMaxKg(state, world, reduced);
    assert.ok(maxEditable >= reducedKg);
    assert.ok(
      maxEditable <=
        reducedKg + Math.min(800 - reducedKg, order!.remainingKg),
    );

    const increased = replaceDemandMissionCargo(state, world, reduced, {
      cargoKg: lifted,
    });
    assert.equal(increased.cargoKg, lifted);
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800 - lifted,
    );
    assert.equal(order!.remainingKg, remainingAfterAccept);

    assert.throws(
      () =>
        replaceDemandMissionCargo(state, world, increased, {
          cargoKg: 10_000,
        }),
      /exceeds aircraft capacity/i,
    );

    // Persist edited mission on state for cancel restore check
    cancelMission(world, increased, { fleet: state });
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800,
    );
  });

  it('hybrid T2 upgrade needs shipped kg then CAPEX', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-upgrade' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhUpgrade',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const bought = buyWarehouseAtPickupHub(state, world, 'SBGR');
    assert.equal(bought.warehouse.tier, 1);
    assert.equal(bought.warehouse.capacityKg, WAREHOUSE_T1_CAPACITY_KG);

    assert.throws(
      () => upgradeWarehouseToTier2(state, world, bought.warehouse.id),
      /Ship .* kg from SBGR/i,
    );

    state.playerWarehouses!.warehouses[0]!.lifetimeShippedKg =
      WAREHOUSE_T2_SHIPPED_KG - 1;
    assert.equal(
      warehouseTier2Progress(state.playerWarehouses!.warehouses[0]!).unlocked,
      false,
    );
    assert.throws(
      () =>
        upgradeWarehouseToTier2(
          state,
          world,
          state.playerWarehouses!.warehouses[0]!.id,
        ),
      /Ship .* kg from SBGR/i,
    );

    // ensurePlayerWarehouses re-normalizes; always re-read the live row.
    const wh = state.playerWarehouses!.warehouses[0]!;
    wh.lifetimeShippedKg = WAREHOUSE_T2_SHIPPED_KG;
    assert.equal(warehouseTier2Progress(wh).unlocked, true);
    const before = state.walletUsd;
    const upgraded = upgradeWarehouseToTier2(state, world, wh.id);
    assert.equal(upgraded.warehouse.tier, 2);
    assert.equal(upgraded.warehouse.capacityKg, WAREHOUSE_T2_CAPACITY_KG);
    assert.ok(upgraded.debitUsd > 0);
    assert.equal(state.walletUsd, before - upgraded.debitUsd);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'warehouse_upgrade'));
    assert.equal(
      warehouseFreeKg(state, state.playerWarehouses!.warehouses[0]!.id),
      WAREHOUSE_T2_CAPACITY_KG,
    );
    assert.throws(
      () =>
        upgradeWarehouseToTier2(
          state,
          world,
          state.playerWarehouses!.warehouses[0]!.id,
        ),
      /already Tier 2/i,
    );
  });

  it('hybrid T3 upgrade after more shipped kg', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-upgrade-t3' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhUpgradeT3',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    const row = () => state.playerWarehouses!.warehouses[0]!;
    row().lifetimeShippedKg = WAREHOUSE_T2_SHIPPED_KG;
    upgradeWarehouse(state, world, whId);
    assert.equal(row().tier, 2);
    assert.equal(row().capacityKg, WAREHOUSE_T2_CAPACITY_KG);

    assert.throws(
      () => upgradeWarehouse(state, world, whId),
      /Ship .* kg from SBGR/i,
    );
    row().lifetimeShippedKg = WAREHOUSE_T3_SHIPPED_KG;
    const upgraded = upgradeWarehouse(state, world, whId);
    assert.equal(upgraded.warehouse.tier, 3);
    assert.equal(upgraded.warehouse.capacityKg, WAREHOUSE_T3_CAPACITY_KG);
    assert.throws(
      () => upgradeWarehouse(state, world, whId),
      /Ship .* kg from SBGR/i,
    );
    row().lifetimeShippedKg = WAREHOUSE_T4_SHIPPED_KG;
    const toT4 = upgradeWarehouse(state, world, whId);
    assert.equal(toT4.warehouse.tier, 4);
    assert.equal(toT4.warehouse.capacityKg, WAREHOUSE_T4_CAPACITY_KG);
    assert.throws(
      () => upgradeWarehouse(state, world, whId),
      /already Tier 4/i,
    );
  });

  it('migrates legacy 5 t T1 warehouse to T2 klb caps', () => {
    const migrated = normalizePlayerWarehouseState({
      warehouses: [
        {
          id: 'wh_legacy',
          icao: 'SBGR',
          tier: 1,
          capacityKg: 5_000,
          lifetimeShippedKg: 100,
        },
      ],
      stock: [
        {
          id: 'stk_1',
          warehouseId: 'wh_legacy',
          commodityId: 'general',
          kg: 4_800,
          avgCostUsdPerKg: 1,
          acquiredAtTick: 0,
        },
      ],
      inboundTransfers: [],
    });
    assert.equal(migrated.warehouses[0]!.tier, 2);
    assert.equal(migrated.warehouses[0]!.capacityKg, 4_800);
    assert.equal(migrated.stock[0]!.kg, 4_800);
  });

  it('charges warehouse storage fees', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-fee' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhFee',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 1_000,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });
    const before = state.walletUsd;
    const fees = settleWarehouseStorageFees(state, {
      fromTick: world.tick,
      toTick: world.tick + 96,
    });
    assert.ok(fees.debitUsd > 0);
    assert.equal(state.walletUsd, before - fees.debitUsd);
  });

  it('FBO normalize wipes spot stock; migrate keeps demandOrders', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-migrate' });
    world.demandOrders = [
      {
        id: 'demand_test',
        destIcao: 'SBGR',
        commodityId: 'general',
        wantedKg: 500,
        remainingKg: 500,
        maxUnitPriceUsd: 3,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    const migrated = migrateEconomyWorld(structuredClone(world));
    assert.equal(migrated.demandOrders?.length, 1);
    assert.equal(migrated.demandOrders?.[0]?.id, 'demand_test');

    const wiped = normalizePlayerFboState({
      fbos: [{ id: 'f1', icao: 'SBGR', tier: 1, capacityKg: 3000 }],
      holds: [],
      stock: [
        {
          id: 's1',
          fboId: 'f1',
          commodityId: 'general',
          kg: 100,
          avgCostUsdPerKg: 1,
          acquiredAtTick: 0,
        },
      ],
    });
    assert.equal(wiped.stock.length, 0);
  });

  it('inbound transfer settles into WH after readyAtTick', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-inbound-settle' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'WhInbound',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 500 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 500,
    });
    assert.ok(bought.inboundTransfer);
    assert.equal((state.playerWarehouses?.stock ?? []).length, 0);

    world.tick = bought.readyAtTick!;
    const settled = settleWarehouseInboundTransfers(state, world);
    assert.equal(settled.deposited.length, 1);
    assert.equal(settled.yardOverflow.length, 0);
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      500,
    );
    assert.equal((state.playerWarehouses?.inboundTransfers ?? []).length, 0);
  });

  it('hold pledges WH kg and claims board remaining without withdrawing stock', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-hold-partial' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DemandHold',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 800,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    world.demandOrders = [
      {
        id: 'demand_hold_sbkp',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 1_000,
        remainingKg: 1_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    const held = holdDemandOrder(state, world, {
      orderId: 'demand_hold_sbkp',
      originIcao: 'SBGR',
      kg: 300,
    });
    assert.equal(held.kg, 300);
    assert.equal(held.hold.orderId, 'demand_hold_sbkp');
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800,
    );
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 500);
    const order = world.demandOrders.find((o) => o.id === 'demand_hold_sbkp')!;
    assert.equal(order.remainingKg, 700);
    assert.equal(order.status, 'open');
  });

  it('expired hold restores remainingKg and frees warehouse kg', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-hold-ttl' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DemandHoldTtl',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    world.demandOrders = [
      {
        id: 'demand_hold_ttl',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 400,
        remainingKg: 400,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    const held = holdDemandOrder(state, world, {
      orderId: 'demand_hold_ttl',
      originIcao: 'SBGR',
      kg: 400,
    });
    assert.equal(
      world.demandOrders.find((o) => o.id === 'demand_hold_ttl')!.status,
      'filled',
    );
    world.tick = held.hold.expiresAtTick;
    const released = expireDemandHolds(state, world);
    assert.equal(released, 400);
    assert.equal((state.playerWarehouses?.demandHolds ?? []).length, 0);
    const restored = world.demandOrders.find((o) => o.id === 'demand_hold_ttl')!;
    assert.equal(restored.remainingKg, 400);
    assert.equal(restored.status, 'open');
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 400);
  });

  it('allows two holds and only one active demand mission', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-two-holds' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DemandTwoHolds',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 600,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    world.demandOrders = [
      {
        id: 'demand_hold_a',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 300,
        remainingKg: 300,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
      {
        id: 'demand_hold_b',
        destIcao: 'SBCT',
        commodityId: 'general',
        wantedKg: 300,
        remainingKg: 300,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    holdDemandOrder(state, world, {
      orderId: 'demand_hold_a',
      originIcao: 'SBGR',
      kg: 200,
    });
    holdDemandOrder(state, world, {
      orderId: 'demand_hold_b',
      originIcao: 'SBGR',
      kg: 150,
    });
    assert.equal((state.playerWarehouses?.demandHolds ?? []).length, 2);
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 250);

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const holdA = state.playerWarehouses!.demandHolds!.find(
      (h) => h.orderId === 'demand_hold_a',
    )!;
    dispatchDemandHold(state, world, {
      holdId: holdA.id,
      aircraftId: aircraft.id,
    });
    assert.equal((state.playerWarehouses?.demandHolds ?? []).length, 1);
    const holdB = state.playerWarehouses!.demandHolds![0]!;
    assert.throws(
      () =>
        dispatchDemandHold(state, world, {
          holdId: holdB.id,
          aircraftId: aircraft.id,
        }),
      /before dispatching a demand hold/i,
    );

    cancelDemandHold(state, world, { holdId: holdB.id });
    assert.equal(
      world.demandOrders.find((o) => o.id === 'demand_hold_b')!.remainingKg,
      300,
    );
  });

  it('bridge hold does not withdraw stock; expire restores free kg', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-bridge-hold' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'BridgeHold',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 500,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    const held = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 200,
    });
    assert.equal(held.kg, 200);
    assert.equal(held.hold.kind, 'bridge');
    assert.equal(held.hold.unitPriceUsd, 0);
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      500,
    );
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 300);
    world.tick = held.hold.expiresAtTick;
    const released = expireDemandHolds(state, world);
    assert.equal(released, 200);
    assert.equal((state.playerWarehouses?.demandHolds ?? []).length, 0);
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 500);
  });

  it('bridge dispatch settles dest WH with no payout; cancel restores origin only', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-bridge-fly' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'BridgeFly',
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
    const dest = world.airports.find((a) => a.icao === 'SBCT')!;
    const destPile = dest.inventory.general ?? {
      stockKg: 0,
      capacityKg: 80_000,
    };
    dest.inventory.general = destPile;
    destPile.stockKg = 1_000;
    const beforeWallet = state.walletUsd;
    const accepted = acceptWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 150,
    });
    assert.equal(accepted.mission.payUsd, 0);
    assert.equal(accepted.mission.warehouseBridge, true);
    assert.equal(accepted.mission.demandOrderId, undefined);
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 250);

    cancelMission(world, accepted.mission, { fleet: state });
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 400);
    assert.equal(destPile.stockKg, 1_000);
    assert.equal(state.walletUsd, beforeWallet);

    aircraft.status = 'parked';
    aircraft.locationIcao = 'SBGR';
    aircraft.assignedMissionId = undefined;
    state.missions = [];
    const accepted2 = acceptWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 150,
    });
    const departed = departMission(world, accepted2.mission, { fleet: state });
    const settled = settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    assert.equal(settled.mission.status, 'settled');
    assert.equal(settled.walletCreditUsd, 0);
    assert.equal(state.walletUsd, beforeWallet);
    assert.equal(destPile.stockKg, 1_000);
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 250);
    assert.equal(warehouseFreeCommodityKg(state, 'SBCT', 'general'), 150);
    const shipped = (state.playerWarehouses?.warehouses ?? []).reduce(
      (s, w) => s + (w.lifetimeShippedKg ?? 0),
      0,
    );
    assert.equal(shipped, 0);
  });

  it('bridge overflow goes to dest hub yard', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-bridge-yard' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'BridgeYard',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 150,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const accepted = acceptWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 150,
    });
    depositCargoToWarehouse(state, {
      icao: 'SBCT',
      commodityId: 'general',
      kg: WAREHOUSE_T1_CAPACITY_KG - 40,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    const departed = departMission(world, accepted.mission, { fleet: state });
    settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    const destWh = (state.playerWarehouses?.warehouses ?? []).find(
      (w) => w.icao === 'SBCT',
    )!;
    const destStock = (state.playerWarehouses?.stock ?? [])
      .filter((p) => p.warehouseId === destWh.id)
      .reduce((s, p) => s + p.kg, 0);
    assert.equal(destStock, WAREHOUSE_T1_CAPACITY_KG);
    const yard = (state.portPickups ?? []).filter((p) => p.hubIcao === 'SBCT');
    assert.equal(
      yard.reduce((s, p) => s + p.kg, 0),
      110,
    );
  });

  it('cannot fly a second cargo mission during an active bridge', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-bridge-one-msn' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'BridgeOne',
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
    acceptWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 100,
    });
    assert.throws(
      () =>
        acceptWarehouseBridge(state, world, {
          originIcao: 'SBGR',
          destIcao: 'SBCT',
          commodityId: 'general',
          aircraftId: aircraft.id,
          kg: 50,
        }),
      /before starting a warehouse bridge/i,
    );
  });

  it('demand hold plus bridge hold reserve the sum of kg', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-bridge-sum' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'BridgeSum',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    buyWarehouseAtPickupHub(state, world, 'SBCT');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 800,
      avgCostUsdPerKg: 2,
      tick: world.tick,
    });
    world.demandOrders = [
      {
        id: 'demand_plus_bridge',
        destIcao: 'SBKP',
        commodityId: 'general',
        wantedKg: 300,
        remainingKg: 300,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
        portId: 'BRSSZ',
      },
    ];
    holdDemandOrder(state, world, {
      orderId: 'demand_plus_bridge',
      originIcao: 'SBGR',
      kg: 200,
    });
    holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      kg: 150,
    });
    const originWh = (state.playerWarehouses?.warehouses ?? []).find(
      (w) => w.icao === 'SBGR',
    )!;
    assert.equal(
      warehouseReservedCommodityKg(state, originWh.id, 'general'),
      350,
    );
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 450);
  });

  it('warehouse haul pays freight and settles dest terminal + shipped kg', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-haul-wide' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'HaulWide',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    const wh = state.playerWarehouses!.warehouses[0]!;
    wh.tier = 4;
    wh.capacityKg = WAREHOUSE_T4_CAPACITY_KG;
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1.5,
      tick: world.tick,
    });
    const held = holdWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      kg: 200,
    });
    assert.equal(held.hold.kind, 'haul');
    assert.ok(held.payUsd > 0);
    cancelWarehouseHaulHold(state, world, { holdId: held.hold.id });

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const dest = world.airports.find((a) => a.icao === 'SBSP')!;
    const destPile = dest.inventory.general ?? {
      stockKg: 0,
      capacityKg: 80_000,
    };
    dest.inventory.general = destPile;
    const beforeStock = destPile.stockKg;
    const accepted = acceptWarehouseHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 150,
    });
    assert.equal(accepted.mission.warehouseHaul, true);
    assert.ok(accepted.payUsd > 0);
    assert.equal(accepted.mission.payUsd, accepted.payUsd);
    assert.equal(warehouseFreeCommodityKg(state, 'SBGR', 'general'), 250);

    const departed = departMission(world, accepted.mission, { fleet: state });
    const walletBeforeSettle = state.walletUsd;
    const settled = settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    assert.equal(settled.mission.status, 'settled');
    assert.ok(settled.walletCreditUsd > 0);
    assert.ok(state.walletUsd >= walletBeforeSettle);
    assert.equal(destPile.stockKg, beforeStock + 150);
    assert.equal(
      state.playerWarehouses!.warehouses[0]!.lifetimeShippedKg ?? 0,
      150,
    );
  });
});
