/**
 * Port FBO shuttle — NPC wall-clock WH→WH bridge (fee + fuel, no freight pay).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import {
  countActivePortShuttles,
  dispatchPortShuttleBridgeHold,
  PORT_SHUTTLE_FEE_MIN_USD,
  quotePortShuttleBridgeHold,
  quotePortShuttleFeeUsd,
} from './career-port-shuttle.js';
import { settleCrewOpsDue } from './career-crew.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
  warehouseFreeCommodityKg,
} from './career-warehouse-stock.js';
import { holdWarehouseBridge } from './career-warehouse-bridge.js';

function missionsAtSantos() {
  const world = createSeedEconomyWorld({ seed: 'port-shuttle' });
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Shuttle',
    airframeTypeId: 'asobo-c172sp-cargo',
  });
  state.walletUsd = 800_000;
  return { world, state };
}

function grantWh(
  state: ReturnType<typeof emptyMissionsStateV2>,
  icao: string,
) {
  const warehouses = ensurePlayerWarehouses(state);
  const id = `wh_${icao.toLowerCase()}_t3`;
  warehouses.warehouses.push({
    id,
    icao,
    capacityKg: 6_804,
    tier: 3,
    lifetimeShippedKg: PORT_CONCESSION_SHIPPED_KG,
  });
  return id;
}

describe('port shuttle', () => {
  it('quotes a floor fee from kg + nm', () => {
    assert.equal(
      quotePortShuttleFeeUsd({ kg: 0, distanceNm: 0 }),
      PORT_SHUTTLE_FEE_MIN_USD,
    );
    assert.equal(
      quotePortShuttleFeeUsd({ kg: 1_000, distanceNm: 400 }),
      40 + 140,
    );
  });

  it('rejects without Port FBO', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    grantWh(state, 'SBKP');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1.2,
      tick: world.tick,
    });
    const held = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 200,
    });
    assert.throws(
      () =>
        quotePortShuttleBridgeHold(state, world, { holdId: held.hold.id }),
      /Port FBO/,
    );
  });

  it('rejects heavier freighter classes', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    grantWh(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1.2,
      tick: world.tick,
    });
    const held = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 200,
    });
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    aircraft.aircraftClassId = 'narrow_freighter';
    assert.throws(
      () =>
        dispatchPortShuttleBridgeHold(state, world, {
          holdId: held.hold.id,
          aircraftId: aircraft.id,
        }),
      /Light GA \/ Light TP/,
    );
  });

  it('dispatches wall-clock bridge, charges fee, settles dest WH with $0 pay', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    grantWh(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 500,
      avgCostUsdPerKg: 1.5,
      tick: world.tick,
    });
    const held = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
      kg: 150,
    });
    const quote = quotePortShuttleBridgeHold(state, world, {
      holdId: held.hold.id,
    });
    assert.ok(quote.feeUsd >= PORT_SHUTTLE_FEE_MIN_USD);
    assert.equal(quote.kg, 150);

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    aircraft.fuelKg = 500;
    const beforeWallet = state.walletUsd;

    const nowMs = 1_700_000_000_000;
    const result = dispatchPortShuttleBridgeHold(state, world, {
      holdId: held.hold.id,
      aircraftId: aircraft.id,
      nowMs,
    });
    assert.equal(result.mission.portShuttle, true);
    assert.equal(result.mission.crewOperated, true);
    assert.equal(result.mission.warehouseBridge, true);
    assert.equal(result.mission.payUsd, 0);
    assert.equal(result.mission.status, 'in_flight');
    assert.equal(result.feeUsd, quote.feeUsd);
    assert.equal(countActivePortShuttles(state), 1);
    assert.ok(state.walletUsd <= beforeWallet - result.feeUsd);

    const dueAt =
      (result.mission.airborneAtMs ?? nowMs) +
      (result.mission.expectedRouteMs ?? 1);
    const settled = settleCrewOpsDue(state, world, dueAt + 1);
    assert.ok(settled.settled.includes(result.mission.id));
    assert.equal(countActivePortShuttles(state), 0);
    assert.ok(warehouseFreeCommodityKg(state, 'SBKP', 'general') >= 150);
    const mission = state.missions.find((m) => m.id === result.mission.id)!;
    assert.equal(mission.status, 'settled');
    assert.equal(mission.payUsd, 0);
  });
});
