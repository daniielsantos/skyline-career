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
  warehouseTier2Progress,
  withdrawCargoFromWarehouse,
  WAREHOUSE_T1_CAPACITY_KG,
  WAREHOUSE_T2_CAPACITY_KG,
  WAREHOUSE_T3_CAPACITY_KG,
  WAREHOUSE_T2_SHIPPED_KG,
  WAREHOUSE_T3_SHIPPED_KG,
} from './career-warehouse.js';
import {
  acceptDemandOrder,
  demandSnapshot,
  ensureDemandOrders,
  listOpenDemandOrders,
  replaceDemandMissionCargo,
  demandMissionEditableMaxKg,
} from './career-demand.js';
import {
  buyPortListing,
  depositPortPickupToWarehouse,
  ensurePortListings,
  listPortListings,
} from './career-ports.js';
import { createSeedEconomyWorld, migrateEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  cancelMission,
  departMission,
  settleMission,
} from './career-mission.js';
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
    for (const icao of ['SBCT', 'SBKP'] as const) {
      const ap = world.airports.find((a) => a.icao === icao);
      assert.ok(ap);
      ap!.inventory.general!.stockKg = Math.floor(
        ap!.inventory.general!.capacityKg * 0.05,
      );
    }
    ensureDemandOrders(world);
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
    ensureDemandOrders(world);
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
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      500,
    );

    const remainingAfterAccept = order!.remainingKg;
    cancelMission(world, accepted.mission, { fleet: state });
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      800,
    );
    const reopened = (world.demandOrders ?? []).find((o) => o.id === order!.id);
    assert.ok(reopened);
    assert.equal(reopened!.remainingKg, remainingAfterAccept + 300);

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
    assert.equal(wh.lifetimeShippedKg ?? 0, 250);
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
    ensureDemandOrders(world);
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
    const remainingAfterAccept = order!.remainingKg;
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      500,
    );

    const reduced = replaceDemandMissionCargo(state, world, accepted.mission, {
      cargoKg: 200,
    });
    assert.equal(reduced.cargoKg, 200);
    assert.equal(
      Math.round(reduced.payUsd),
      Math.round(order!.maxUnitPriceUsd * 200),
    );
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      600,
    );
    assert.equal(order!.remainingKg, remainingAfterAccept + 100);
    assert.equal(reduced.status, 'accepted');

    const maxEditable = demandMissionEditableMaxKg(state, world, reduced);
    assert.ok(maxEditable >= 200);
    assert.ok(maxEditable <= 200 + Math.min(600, order!.remainingKg));

    const increased = replaceDemandMissionCargo(state, world, reduced, {
      cargoKg: 350,
    });
    assert.equal(increased.cargoKg, 350);
    assert.equal(
      (state.playerWarehouses?.stock ?? []).reduce((s, p) => s + p.kg, 0),
      450,
    );
    assert.equal(order!.remainingKg, remainingAfterAccept + 100 - 150);

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
      /already Tier 3/i,
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
});
