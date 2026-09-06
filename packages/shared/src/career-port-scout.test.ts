/**
 * Port FBO Scout — WH→WH bridge + WH→Demand suggestions (confirm → hold).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import {
  confirmPortScoutBridge,
  confirmPortScoutDemand,
  confirmPortScoutHaul,
  listPortScoutBridgeSuggestions,
  listPortScoutDemandSuggestions,
  listPortScoutHaulSuggestions,
  PORT_SCOUT_MIN_KG,
} from './career-port-scout.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  ensurePlayerWarehouses,
  depositCargoToWarehouse,
} from './career-warehouse-stock.js';
import { listDemandHolds } from './career-demand.js';

function missionsAtSantos() {
  const world = createSeedEconomyWorld({ seed: 'port-scout' });
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Scout',
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

function seedDemandOrder(
  world: ReturnType<typeof createSeedEconomyWorld>,
  opts: {
    id?: string;
    destIcao: string;
    commodityId?: 'general' | 'supplies';
    remainingKg?: number;
    portId?: string;
  },
) {
  const order = {
    id: opts.id ?? `dmd_scout_${world.tick}`,
    portId: opts.portId ?? 'BRSSZ',
    destIcao: opts.destIcao,
    commodityId: opts.commodityId ?? ('general' as const),
    wantedKg: opts.remainingKg ?? 2_000,
    remainingKg: opts.remainingKg ?? 2_000,
    maxUnitPriceUsd: 3.5,
    arrivedAtTick: world.tick,
    expiresAtTick: world.tick + 10_000,
    status: 'open' as const,
  };
  world.demandOrders = [...(world.demandOrders ?? []), order];
  return order;
}

describe('port scout', () => {
  it('returns empty without Port FBO or second WH', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    assert.equal(listPortScoutBridgeSuggestions(state, world).length, 0);
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(listPortScoutBridgeSuggestions(state, world).length, 0);
  });

  it('suggests SBGR→SBKP when stock and dest room exist', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    grantWh(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 1_500,
      avgCostUsdPerKg: 1.2,
      tick: world.tick,
    });
    const suggestions = listPortScoutBridgeSuggestions(state, world);
    assert.ok(suggestions.length >= 1);
    const hit = suggestions.find(
      (s) =>
        s.originIcao === 'SBGR' &&
        s.destIcao === 'SBKP' &&
        s.commodityId === 'general',
    );
    assert.ok(hit);
    assert.ok(hit!.kg >= PORT_SCOUT_MIN_KG);
    assert.ok(hit!.distanceNm > 0);
  });

  it('confirm creates a bridge hold via holdWarehouseBridge', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    grantWh(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 1_000,
      avgCostUsdPerKg: 1.1,
      tick: world.tick,
    });
    const confirmed = confirmPortScoutBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'general',
    });
    assert.equal(confirmed.hold.kind, 'bridge');
    assert.equal(confirmed.hold.originIcao, 'SBGR');
    assert.equal(confirmed.hold.destIcao, 'SBKP');
    assert.ok(confirmed.kg >= PORT_SCOUT_MIN_KG);
    assert.equal(
      listDemandHolds(state).filter((h) => h.kind === 'bridge').length,
      1,
    );
    const again = listPortScoutBridgeSuggestions(state, world).filter(
      (s) =>
        s.originIcao === 'SBGR' &&
        s.destIcao === 'SBKP' &&
        s.commodityId === 'general',
    );
    assert.equal(again.length, 0);
  });

  it('Demand scout empty without Port FBO or matching stock', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    seedDemandOrder(world, { destIcao: 'SBGL', remainingKg: 1_000 });
    assert.equal(listPortScoutDemandSuggestions(state, world).length, 0);
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(listPortScoutDemandSuggestions(state, world).length, 0);
  });

  it('Demand scout suggests and confirms holdDemandOrder', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 1_200,
      avgCostUsdPerKg: 1.0,
      tick: world.tick,
    });
    const order = seedDemandOrder(world, {
      id: 'dmd_scout_sbgl',
      destIcao: 'SBGL',
      remainingKg: 800,
    });
    const suggestions = listPortScoutDemandSuggestions(state, world);
    const hit = suggestions.find(
      (s) => s.orderId === order.id && s.originIcao === 'SBGR',
    );
    assert.ok(hit, 'expected Demand scout row');
    assert.ok(hit!.kg >= PORT_SCOUT_MIN_KG);
    assert.ok(hit!.payUsd > 0);

    const confirmed = confirmPortScoutDemand(state, world, {
      orderId: order.id,
      originIcao: 'SBGR',
      kg: hit!.kg,
    });
    assert.equal(confirmed.hold.kind ?? 'demand', 'demand');
    assert.equal(confirmed.hold.orderId, order.id);
    assert.equal(confirmed.hold.originIcao, 'SBGR');
    assert.equal(confirmed.hold.destIcao, 'SBGL');
    assert.equal(
      listDemandHolds(state).filter(
        (h) => (h.kind ?? 'demand') === 'demand' && h.orderId === order.id,
      ).length,
      1,
    );
    assert.equal(
      listPortScoutDemandSuggestions(state, world).filter(
        (s) => s.orderId === order.id,
      ).length,
      0,
    );
  });

  it('Haul scout empty without Port FBO or matching stock', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    const dest = world.airports.find((a) => a.icao === 'SBGL');
    if (dest?.inventory.general) {
      dest.inventory.general.capacityKg = 50_000;
      dest.inventory.general.stockKg = 1_000;
    }
    assert.equal(listPortScoutHaulSuggestions(state, world).length, 0);
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    assert.equal(listPortScoutHaulSuggestions(state, world).length, 0);
  });

  it('Haul scout suggests and confirms holdWarehouseHaul', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 1_500,
      avgCostUsdPerKg: 1.0,
      tick: world.tick,
    });
    for (const ap of world.airports) {
      const pile = ap.inventory.general ?? {
        stockKg: 0,
        capacityKg: 80_000,
      };
      ap.inventory.general = {
        capacityKg: Math.max(pile.capacityKg, 80_000),
        stockKg: Math.max(pile.capacityKg, 80_000) * 0.9,
      };
    }
    const dest = world.airports.find((a) => a.icao === 'SBGL');
    assert.ok(dest);
    dest!.inventory.general = {
      capacityKg: 80_000,
      stockKg: 2_000,
    };
    const suggestions = listPortScoutHaulSuggestions(state, world);
    const hit = suggestions.find(
      (s) =>
        s.originIcao === 'SBGR' &&
        s.destIcao === 'SBGL' &&
        s.commodityId === 'general',
    );
    assert.ok(hit, 'expected Haul scout row');
    assert.ok(hit!.kg >= PORT_SCOUT_MIN_KG);
    assert.ok(hit!.payUsd > 0);

    const confirmed = confirmPortScoutHaul(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      commodityId: 'general',
      kg: hit!.kg,
    });
    assert.equal(confirmed.hold.kind, 'haul');
    assert.equal(confirmed.hold.originIcao, 'SBGR');
    assert.equal(confirmed.hold.destIcao, 'SBGL');
    assert.ok(confirmed.payUsd > 0);
    assert.equal(
      listDemandHolds(state).filter((h) => h.kind === 'haul').length,
      1,
    );
    assert.equal(
      listPortScoutHaulSuggestions(state, world).filter(
        (s) =>
          s.originIcao === 'SBGR' &&
          s.destIcao === 'SBGL' &&
          s.commodityId === 'general',
      ).length,
      0,
    );
  });
});
