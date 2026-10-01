/**
 * Hand-posted Internal Haul daily cap. Auto-haul keeps its own counter.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { TICKS_PER_DAY } from './career-clock.js';
import { economyDayIndex } from './career-weather.js';
import {
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
  WAREHOUSE_CAPACITY_KG,
} from './career-warehouse-stock.js';
import { PORT_CONCESSION_SHIPPED_KG } from './career-port-concessions.js';
import {
  acceptWarehouseBridge,
  cancelWarehouseBridgeHold,
  holdWarehouseBridge,
} from './career-warehouse-bridge.js';
import {
  VA_AUTO_HAUL_MAX_PER_DAY_DEFAULT,
  VA_AUTO_HAUL_PAY_MULT_DEFAULT,
} from './career-va-auto-haul.js';
import {
  manualHaulDeskView,
  VA_MANUAL_HAUL_MAX_PER_DAY,
} from './career-va-haul-desk.js';

function deskWorld() {
  const world = createSeedEconomyWorld({ seed: 'va-manual-haul-cap' });
  const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Desk',
    airframeTypeId: 'asobo-c172sp-cargo',
  });
  state.walletUsd = 800_000;
  for (const icao of ['SBGR', 'SBKP', 'SBCT']) {
    ensurePlayerWarehouses(state).warehouses.push({
      id: `wh_${icao.toLowerCase()}_t3`,
      icao,
      capacityKg: WAREHOUSE_CAPACITY_KG[3],
      tier: 3,
      lifetimeShippedKg: PORT_CONCESSION_SHIPPED_KG,
    });
  }
  depositCargoToWarehouse(state, {
    icao: 'SBGR',
    commodityId: 'general',
    kg: 4_000,
    avgCostUsdPerKg: 1.2,
    tick: world.tick,
  });
  depositCargoToWarehouse(state, {
    icao: 'SBGR',
    commodityId: 'supplies',
    kg: 2_000,
    avgCostUsdPerKg: 1.2,
    tick: world.tick,
  });
  return { world, state };
}

describe('manual haul desk cap', () => {
  it('counts a hand post and refuses the next one at the cap', () => {
    const { world, state } = deskWorld();
    const held = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 200,
      pilotPayUsd: 0,
    });
    assert.equal(held.pilotPayUsd, 0);
    assert.equal(manualHaulDeskView(state, world.tick).postedToday, 1);
    assert.equal(
      state.vaAutoHaul?.maxHaulsPerDay,
      VA_AUTO_HAUL_MAX_PER_DAY_DEFAULT,
    );
    assert.equal(state.vaAutoHaul?.payMult, VA_AUTO_HAUL_PAY_MULT_DEFAULT);
    assert.equal(state.vaAutoHaul?.enabled, false);

    state.vaAutoHaul!.manualPostedToday = VA_MANUAL_HAUL_MAX_PER_DAY;
    assert.throws(
      () =>
        holdWarehouseBridge(state, world, {
          originIcao: 'SBGR',
          destIcao: 'SBCT',
          commodityId: 'supplies',
          kg: 200,
          pilotPayUsd: 0,
        }),
      /Haul desk is at 8 Internal Hauls today/,
    );
    assert.equal(
      manualHaulDeskView(state, world.tick).remaining,
      0,
    );
  });

  it('does not count Auto-haul posts or a duplicate route', () => {
    const { world, state } = deskWorld();
    holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 200,
      pilotPayUsd: 0,
      heldByAuto: true,
    });
    assert.equal(manualHaulDeskView(state, world.tick).postedToday, 0);

    holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'supplies',
      kg: 200,
      pilotPayUsd: 0,
    });
    assert.throws(
      () =>
        holdWarehouseBridge(state, world, {
          originIcao: 'SBGR',
          destIcao: 'SBKP',
          commodityId: 'supplies',
          kg: 100,
          pilotPayUsd: 0,
        }),
      /Already holding a bridge/,
    );
    assert.equal(manualHaulDeskView(state, world.tick).postedToday, 1);
  });

  it('opens again on the next economy day and does not refund a cancel', () => {
    const { world, state } = deskWorld();
    const held = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 200,
      pilotPayUsd: 0,
    });
    cancelWarehouseBridgeHold(state, world, { holdId: held.hold.id });
    assert.equal(manualHaulDeskView(state, world.tick).postedToday, 1);

    world.tick += TICKS_PER_DAY;
    assert.equal(economyDayIndex(world.tick) > 0, true);
    holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 200,
      pilotPayUsd: 0,
    });
    assert.equal(manualHaulDeskView(state, world.tick).postedToday, 1);
  });

  it('counts Fly now the same way as Hold', () => {
    const { world, state } = deskWorld();
    const aircraft = state.fleet.find((a) => a.status === 'parked');
    assert.ok(aircraft);
    aircraft.locationIcao = 'SBGR';
    acceptWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBCT',
      commodityId: 'general',
      aircraftId: aircraft.id,
      kg: 150,
      pilotPayUsd: 0,
    });
    assert.equal(manualHaulDeskView(state, world.tick).postedToday, 1);
    assert.equal(manualHaulDeskView(state, world.tick).maxPerDay, 8);
  });
});
