/**
 * Port FBO desk auto-buy — same price path as manual buyPortListing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buyPortListing,
  effectivePortBuyUnitPriceUsd,
} from './career-ports.js';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import {
  PORT_AUTO_BUY_MAX_ACTIVE,
  removePortAutoBuyOrder,
  setPortAutoBuyOrderPaused,
  tickPortAutoBuyOrders,
  upsertPortAutoBuyOrder,
} from './career-port-auto-buy.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { ensurePlayerWarehouses } from './career-warehouse-stock.js';
import { economyDayIndex } from './career-weather.js';

function missionsAtSantos() {
  const world = createSeedEconomyWorld({ seed: 'port-auto-buy' });
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Desk',
    airframeTypeId: 'asobo-c172sp-cargo',
  });
  state.walletUsd = 800_000;
  return { world, state };
}

function grantT3PickupWarehouse(
  state: ReturnType<typeof emptyMissionsStateV2>,
  icao = 'SBGR',
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

function claimSantosFbo(
  state: ReturnType<typeof emptyMissionsStateV2>,
  world: ReturnType<typeof createSeedEconomyWorld>,
) {
  const warehouseId = grantT3PickupWarehouse(state);
  claimPortConcession(state, world, { portId: 'BRSSZ' });
  return warehouseId;
}

describe('port auto-buy desk', () => {
  it('rejects upsert without Port FBO', () => {
    const { world, state } = missionsAtSantos();
    const warehouseId = grantT3PickupWarehouse(state);
    assert.throws(
      () =>
        upsertPortAutoBuyOrder(state, world, {
          portId: 'BRSSZ',
          commodityId: 'general',
          maxPriceUsdPerKg: 50,
          maxKgPerDay: 5_000,
          warehouseId,
        }),
      /active Port FBO/,
    );
  });

  function seedSbgrGeneralListing(
    world: ReturnType<typeof createSeedEconomyWorld>,
    availableKg = 5_000,
  ) {
    world.portListings = world.portListings ?? [];
    const listing = {
      id: `portlot_auto_${world.tick}_${availableKg}`,
      portId: 'BRSSZ',
      commodityId: 'general' as const,
      availableKg,
      unitPriceUsd: 1.5,
      allocatedHubIcao: 'SBGR',
      arrivedAtTick: world.tick,
      expiresAtTick: world.tick + 96 * 3,
      status: 'open' as const,
    };
    world.portListings.push(listing);
    return listing;
  }

  it('buys via buyPortListing at the same effective unit price', () => {
    const { world, state } = missionsAtSantos();
    const warehouseId = claimSantosFbo(state, world);
    const listing = seedSbgrGeneralListing(world, 5_000);

    const unit = effectivePortBuyUnitPriceUsd(state, world, listing);
    upsertPortAutoBuyOrder(state, world, {
      portId: 'BRSSZ',
      commodityId: 'general',
      maxPriceUsdPerKg: unit + 1,
      maxKgPerDay: 2_000,
      warehouseId,
      walletFloorUsd: 1_000,
    });

    const walletBefore = state.walletUsd;
    const availBefore = listing.availableKg;
    const result = tickPortAutoBuyOrders(state, world);
    assert.ok(result.buys >= 1);
    assert.ok(result.kg > 0);
    assert.ok(state.walletUsd < walletBefore);
    assert.ok(listing.availableKg < availBefore);

    if (listing.availableKg >= 1 && listing.status === 'open') {
      const expected = effectivePortBuyUnitPriceUsd(state, world, listing);
      const bought = buyPortListing(state, world, {
        listingId: listing.id,
        kg: 1,
      });
      assert.equal(bought.unitPriceUsd, expected);
    }
  });

  it('skips when unit exceeds maxPriceUsdPerKg', () => {
    const { world, state } = missionsAtSantos();
    const warehouseId = claimSantosFbo(state, world);
    const listing = seedSbgrGeneralListing(world);
    const unit = effectivePortBuyUnitPriceUsd(state, world, listing);
    upsertPortAutoBuyOrder(state, world, {
      portId: 'BRSSZ',
      commodityId: 'general',
      maxPriceUsdPerKg: Math.max(0.01, unit - 0.01),
      maxKgPerDay: 5_000,
      warehouseId,
    });
    const walletBefore = state.walletUsd;
    const result = tickPortAutoBuyOrders(state, world);
    assert.equal(result.buys, 0);
    assert.equal(state.walletUsd, walletBefore);
  });

  it('respects maxKgPerDay and resets on day rollover', () => {
    const { world, state } = missionsAtSantos();
    const warehouseId = claimSantosFbo(state, world);
    seedSbgrGeneralListing(world, 5_000);
    const listing = (world.portListings ?? []).find(
      (l) => l.id.startsWith('portlot_auto_'),
    )!;
    const unit = effectivePortBuyUnitPriceUsd(state, world, listing);
    const order = upsertPortAutoBuyOrder(state, world, {
      portId: 'BRSSZ',
      commodityId: 'general',
      maxPriceUsdPerKg: unit + 5,
      maxKgPerDay: 400,
      warehouseId,
    });
    const first = tickPortAutoBuyOrders(state, world);
    assert.ok(first.kg <= 400);
    assert.equal(order.boughtKgToday, first.kg);
    const second = tickPortAutoBuyOrders(state, world);
    assert.equal(second.buys, 0);

    world.tick += 96;
    seedSbgrGeneralListing(world, 5_000);
    assert.equal(economyDayIndex(world.tick), order.boughtDayIndex + 1);
    const third = tickPortAutoBuyOrders(state, world);
    assert.ok(third.kg > 0);
    assert.ok(order.boughtKgToday <= 400);
  });

  it('pause and remove work; caps active orders', () => {
    const { world, state } = missionsAtSantos();
    const warehouseId = claimSantosFbo(state, world);
    const commodities = ['general', 'supplies', 'machinery', 'electronics'] as const;
    const created = commodities.slice(0, PORT_AUTO_BUY_MAX_ACTIVE).map((c) =>
      upsertPortAutoBuyOrder(state, world, {
        portId: 'BRSSZ',
        commodityId: c,
        maxPriceUsdPerKg: 100,
        maxKgPerDay: 100,
        warehouseId,
      }),
    );
    assert.throws(
      () =>
        upsertPortAutoBuyOrder(state, world, {
          portId: 'BRSSZ',
          commodityId: 'electronics',
          maxPriceUsdPerKg: 100,
          maxKgPerDay: 100,
          warehouseId,
        }),
      /at most/,
    );
    setPortAutoBuyOrderPaused(state, created[0]!.id, true);
    upsertPortAutoBuyOrder(state, world, {
      portId: 'BRSSZ',
      commodityId: 'electronics',
      maxPriceUsdPerKg: 100,
      maxKgPerDay: 100,
      warehouseId,
    });
    removePortAutoBuyOrder(state, created[1]!.id);
    assert.equal(
      (state.portAutoBuyOrders ?? []).some((o) => o.id === created[1]!.id),
      false,
    );
  });
});
