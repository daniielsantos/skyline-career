/**
 * Port FBO stevedore — yard → WH truck (cross-hub, same port).
 * With one pickup hub per port, cross-hub stevedore has no destinations.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import {
  listPortStevedoreDestinations,
  quotePortStevedoreHaul,
} from './career-port-stevedore.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { ensurePlayerPortPickups } from './career-ports.js';
import {
  ensurePlayerWarehouses,
  WAREHOUSE_CAPACITY_KG,
} from './career-warehouse-stock.js';

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
    capacityKg: WAREHOUSE_CAPACITY_KG[3],
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
    const whId = grantPickupWarehouse(state, 'SBGR');
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR' });
    assert.throws(
      () =>
        quotePortStevedoreHaul(state, world, {
          pickupId: pickup.id,
          destWarehouseId: whId,
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

  it('lists no cross-hub dests when port has a single pickup hub', () => {
    const { world, state } = missionsAtSantos();
    grantPickupWarehouse(state, 'SBGR');
    grantPickupWarehouse(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    const pickup = seedYardLot(state, world, { hubIcao: 'SBGR', kg: 500 });
    const dests = listPortStevedoreDestinations(state, world, pickup.id);
    assert.equal(dests.length, 0);
  });
});
