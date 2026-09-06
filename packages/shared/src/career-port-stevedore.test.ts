/**
 * Port FBO stevedore — yard → WH truck (cross-hub, same port).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import {
  listPortStevedoreDestinations,
  PORT_STEVEDORE_USD_PER_KG,
  PORT_STEVEDORE_USD_PER_KG_NM,
  quotePortStevedoreHaul,
  startPortStevedoreHaul,
} from './career-port-stevedore.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { ensurePlayerPortPickups } from './career-ports.js';
import { ensurePlayerWarehouses } from './career-warehouse-stock.js';
import { settleWarehouseInboundTransfers } from './career-warehouse.js';

function missionsAtSantos() {
  const world = createSeedEconomyWorld({ seed: 'port-stevedore' });
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Stevedore',
    airframeTypeId: 'asobo-c172sp-cargo',
  });
  state.walletUsd = 800_000;
  return { world, state };
}

function grantPickupWarehouse(
  state: ReturnType<typeof emptyMissionsStateV2>,
  icao: string,
  shippedKg = PORT_CONCESSION_SHIPPED_KG,
) {
  const warehouses = ensurePlayerWarehouses(state);
  const id = `wh_${icao.toLowerCase()}_t3`;
  warehouses.warehouses.push({
    id,
    icao,
    capacityKg: 6_804,
    tier: 3,
    lifetimeShippedKg: shippedKg,
  });
  return id;
}

function seedYardLot(
  state: ReturnType<typeof emptyMissionsStateV2>,
  world: ReturnType<typeof createSeedEconomyWorld>,
  opts: { hubIcao: string; kg?: number },
) {
  const pickups = ensurePlayerPortPickups(state);
  const pickup = {
    id: `pp_stevedore_${world.tick}`,
    portId: 'BRSSZ',
    hubIcao: opts.hubIcao,
    commodityId: 'general' as const,
    kg: opts.kg ?? 2_000,
    avgCostUsdPerKg: 1.25,
    purchasedAtTick: world.tick,
  };
  pickups.push(pickup);
  return pickup;
}

describe('port stevedore', () => {
  it('rejects without Port FBO', () => {
    const { world, state } = missionsAtSantos();
    grantPickupWarehouse(state, 'SBGR');
    const destId = grantPickupWarehouse(state, 'SBKP');
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR' });
    assert.throws(
      () =>
        quotePortStevedoreHaul(state, world, {
          pickupId: pickup.id,
          destWarehouseId: destId,
        }),
      /active Port FBO/,
    );
  });

  it('rejects same-hub (Store path)', () => {
    const { world, state } = missionsAtSantos();
    const whId = grantPickupWarehouse(state, 'SBGR');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR' });
    assert.throws(
      () =>
        quotePortStevedoreHaul(state, world, {
          pickupId: pickup.id,
          destWarehouseId: whId,
        }),
      /Same hub/,
    );
  });

  it('quotes fee and starts inbound with source stevedore', () => {
    const { world, state } = missionsAtSantos();
    grantPickupWarehouse(state, 'SBGR');
    const destId = grantPickupWarehouse(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR', kg: 1_500 });

    const quote = quotePortStevedoreHaul(state, world, {
      pickupId: pickup.id,
      destWarehouseId: destId,
    });
    assert.equal(quote.fromHubIcao, 'SBGR');
    assert.equal(quote.destHubIcao, 'SBKP');
    assert.equal(quote.kg, 1_500);
    assert.ok(quote.distanceNm > 0);
    const expectedUnit =
      Math.round(
        (PORT_STEVEDORE_USD_PER_KG +
          PORT_STEVEDORE_USD_PER_KG_NM * quote.distanceNm) *
          100,
      ) / 100;
    assert.equal(quote.unitFeeUsd, expectedUnit);
    assert.equal(
      quote.feeUsd,
      Math.round(expectedUnit * 1_500 * 100) / 100,
    );
    assert.ok(quote.transferTicks >= 1);

    const walletBefore = state.walletUsd;
    const started = startPortStevedoreHaul(state, world, {
      pickupId: pickup.id,
      destWarehouseId: destId,
    });
    assert.equal(started.remainingYardKg, 0);
    assert.equal(state.walletUsd, walletBefore - quote.feeUsd);
    assert.equal(
      ensurePlayerPortPickups(state).find((p) => p.id === pickup.id),
      undefined,
    );
    assert.equal(started.inboundTransfer.source, 'stevedore');
    assert.equal(started.inboundTransfer.warehouseId, destId);
    assert.equal(started.inboundTransfer.unitCostUsd, 1.25);

    const ledger = (state.ledger ?? []).filter((e) => e.kind === 'port_drayage');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]!.amountUsd, -quote.feeUsd);

    const dests = listPortStevedoreDestinations(state, world, pickup.id);
    assert.equal(dests.length, 0);
  });

  it('lists SBKP when yard is at SBGR and both have WH', () => {
    const { world, state } = missionsAtSantos();
    grantPickupWarehouse(state, 'SBGR');
    const destId = grantPickupWarehouse(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR', kg: 500 });
    const dests = listPortStevedoreDestinations(state, world, pickup.id);
    assert.equal(dests.length, 1);
    assert.equal(dests[0]!.warehouseId, destId);
    assert.equal(dests[0]!.hubIcao, 'SBKP');
    assert.ok(dests[0]!.inboundFreeKg > 0);
  });

  it('settles stevedore inbound into dest WH stock', () => {
    const { world, state } = missionsAtSantos();
    grantPickupWarehouse(state, 'SBGR');
    const destId = grantPickupWarehouse(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR', kg: 800 });
    const started = startPortStevedoreHaul(state, world, {
      pickupId: pickup.id,
      destWarehouseId: destId,
      kg: 800,
    });
    world.tick = started.inboundTransfer.readyAtTick;
    const settled = settleWarehouseInboundTransfers(state, world);
    assert.ok(settled.deposited.some((t) => t.id === started.inboundTransfer.id));
    const pile = ensurePlayerWarehouses(state).stock.find(
      (s) => s.warehouseId === destId && s.commodityId === 'general',
    );
    assert.ok(pile);
    assert.equal(pile!.kg, 800);
  });

  it('clamps to inbound free at dest', () => {
    const { world, state } = missionsAtSantos();
    grantPickupWarehouse(state, 'SBGR');
    const destId = grantPickupWarehouse(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const pw = ensurePlayerWarehouses(state);
    pw.inboundTransfers!.push({
      id: 'whin_fill',
      warehouseId: destId,
      hubIcao: 'SBKP',
      portId: 'BRSSZ',
      commodityId: 'supplies',
      kg: 6_000,
      unitCostUsd: 1,
      purchasedAtTick: world.tick,
      readyAtTick: world.tick + 10,
    });
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR', kg: 2_000 });
    const quote = quotePortStevedoreHaul(state, world, {
      pickupId: pickup.id,
      destWarehouseId: destId,
    });
    assert.equal(quote.kg, 804);
    assert.equal(quote.remainingYardKg, 1_196);
  });
});
