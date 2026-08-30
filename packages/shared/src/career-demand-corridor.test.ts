import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMAND_ORDERS_PER_PORT_BASE,
  corridorNmForLevel,
  destWithinCorridorNm,
  ensureDemandOrders,
  listOpenDemandOrders,
  assertDemandPortCorridorReach,
  resolvePlayerPortCorridorLevel,
  worldPortDeskCorridorLevel,
} from './career-demand.js';
import './career-ports.js';
import { airportByIcao, createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { WAREHOUSE_CAPACITY_KG } from './career-warehouse-stock.js';
import type { CareerMissionsState } from './types/career-economy.js';

function missionsWithSantosWh(): CareerMissionsState {
  const state = emptyMissionsStateV2();
  state.walletUsd = 1_000_000;
  state.playerWarehouses = {
    warehouses: [
      {
        id: 'wh_sbgr',
        icao: 'SBGR',
        capacityKg: WAREHOUSE_CAPACITY_KG[1],
        tier: 1,
      },
    ],
    stock: [],
    inboundTransfers: [],
  };
  return state;
}

describe('per-port Demand desk', () => {
  it('corridor ladder is 500 / 1800 / open', () => {
    assert.equal(corridorNmForLevel(1), 500);
    assert.equal(corridorNmForLevel(2), 1800);
    assert.equal(corridorNmForLevel(3), null);
  });

  it('vacant desk uses T1 reach for world spawn', () => {
    const world = createSeedEconomyWorld({ seed: 'desk-vacant' });
    world.portConcessions = [];
    const { level, source } = worldPortDeskCorridorLevel(world, 'BRSSZ');
    assert.equal(level, 1);
    assert.equal(source, 'vacant');
  });

  it('expires legacy open orders without portId and spawns tagged desks', () => {
    const world = createSeedEconomyWorld({ seed: 'desk-spawn' });
    world.demandOrders = [
      {
        id: 'legacy_1',
        destIcao: 'SBCT',
        commodityId: 'general',
        wantedKg: 1000,
        remainingKg: 1000,
        maxUnitPriceUsd: 2,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 10_000,
        status: 'open',
      },
    ];

    // Force short stock near Santos catchment.
    for (const icao of ['SBGL', 'SBCF', 'SBKP'] as const) {
      const ap = airportByIcao(world, icao);
      if (!ap?.inventory.general) continue;
      ap.inventory.general.capacityKg = 50_000;
      ap.inventory.general.stockKg = 500;
    }

    ensureDemandOrders(world);
    assert.equal(
      world.demandOrders.find((o) => o.id === 'legacy_1')?.status,
      'expired',
    );
    const open = listOpenDemandOrders(world);
    assert.ok(open.length > 0, 'expected open desk orders');
    for (const o of open) {
      assert.ok(o.portId, `order ${o.id} missing portId`);
      const pickups =
        o.portId === 'BRSSZ'
          ? ['SBGR', 'SBKP']
          : o.portId === 'BRPNG'
            ? ['SBCT']
            : [];
      if (pickups.length === 0) continue;
      const maxNm = corridorNmForLevel(
        worldPortDeskCorridorLevel(world, o.portId).level,
      );
      assert.equal(
        destWithinCorridorNm(o.destIcao, pickups, maxNm),
        true,
        `${o.destIcao} outside ${o.portId} desk`,
      );
    }
    const santos = open.filter((o) => o.portId === 'BRSSZ');
    assert.ok(
      santos.length <= DEMAND_ORDERS_PER_PORT_BASE + 1,
      `Santos desk over cap: ${santos.length}`,
    );
  });

  it('Accept gate requires desk pickup WH and blocks KMIA at T1', () => {
    const world = createSeedEconomyWorld({ seed: 'desk-gate' });
    const state = missionsWithSantosWh();
    assert.throws(
      () =>
        assertDemandPortCorridorReach(state, world, 'SBGR', 'KMIA', {
          portId: 'BRSSZ',
        }),
      /outside Corridor/,
    );
    assert.throws(
      () =>
        assertDemandPortCorridorReach(state, world, 'SBCT', 'SBGL', {
          portId: 'BRSSZ',
        }),
      /not a pickup hub for port BRSSZ/,
    );
    state.playerPortConcessions = [
      {
        portId: 'BRSSZ',
        companyId: 'local',
        claimedAtTick: world.tick,
        leasePaidThroughTick: world.tick + 10_000,
        level: 3,
        lifetimeThroughputKg: 0,
      },
    ];
    assert.doesNotThrow(() =>
      assertDemandPortCorridorReach(state, world, 'SBGR', 'KMIA', {
        portId: 'BRSSZ',
      }),
    );
  });

  it('operator concession overrides WH tier for player corridor', () => {
    const world = createSeedEconomyWorld({ seed: 'desk-p' });
    const state = missionsWithSantosWh();
    state.playerPortConcessions = [
      {
        portId: 'BRSSZ',
        companyId: 'local',
        claimedAtTick: world.tick,
        leasePaidThroughTick: world.tick + 10_000,
        level: 2,
        lifetimeThroughputKg: 0,
      },
    ];
    const resolved = resolvePlayerPortCorridorLevel(state, world, 'BRSSZ');
    assert.equal(resolved.level, 2);
    assert.equal(resolved.source, 'concession');
    assert.equal(corridorNmForLevel(resolved.level), 1800);
  });
});
