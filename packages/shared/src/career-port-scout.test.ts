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
  nmInPortScoutHaulBand,
  pickPortScoutHaulByBands,
  portScoutHaulBandTargets,
  PORT_SCOUT_HAUL_BAND_MID_NM,
  PORT_SCOUT_HAUL_BAND_NEAR_NM,
  PORT_SCOUT_HAUL_MAX_NM,
  PORT_SCOUT_MIN_KG,
} from './career-port-scout.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  ensurePlayerWarehouses,
  depositCargoToWarehouse,
  WAREHOUSE_CAPACITY_KG,
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
    capacityKg: WAREHOUSE_CAPACITY_KG[3],
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

  it('Haul scout skips high-fill dests even when room remains', () => {
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
      ap.inventory.general = {
        capacityKg: 80_000,
        stockKg: 80_000,
      };
    }
    const dest = world.airports.find((a) => a.icao === 'SBGL');
    assert.ok(dest);
    dest!.inventory.general = {
      capacityKg: 80_000,
      stockKg: 73_000, // 91% fill, 7t room — not a short-fill
    };
    const suggestions = listPortScoutHaulSuggestions(state, world);
    const hit = suggestions.find(
      (s) =>
        s.originIcao === 'SBGR' &&
        s.destIcao === 'SBGL' &&
        s.commodityId === 'general',
    );
    assert.equal(hit, undefined, 'high-fill dest must not appear on Haul scout');
  });

  it('Haul scout caps kg to dest need toward target fill', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 6_000,
      avgCostUsdPerKg: 1.0,
      tick: world.tick,
    });
    for (const ap of world.airports) {
      ap.inventory.general = {
        capacityKg: 20_000,
        stockKg: 20_000,
      };
    }
    const dest = world.airports.find((a) => a.icao === 'SBGL');
    assert.ok(dest);
    // 35% fill → need to 55% = 11_000 − 7_000 = 4_000 (not all 13t room / 6t free)
    dest!.inventory.general = {
      capacityKg: 20_000,
      stockKg: 7_000,
    };
    const suggestions = listPortScoutHaulSuggestions(state, world);
    const hit = suggestions.find(
      (s) =>
        s.originIcao === 'SBGR' &&
        s.destIcao === 'SBGL' &&
        s.commodityId === 'general',
    );
    assert.ok(hit, 'expected short-fill Haul row');
    assert.equal(hit!.kg, 4_000);
    assert.ok(hit!.destFillPct <= 40);
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
      ap.inventory.general = {
        capacityKg: 80_000,
        stockKg: 80_000,
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

  it('Haul scout band targets are 2/3/3 within 1800 nm', () => {
    const bands = portScoutHaulBandTargets(8);
    assert.deepEqual(
      bands.map((b) => b.targetSlots),
      [2, 3, 3],
    );
    assert.equal(bands[0]!.maxNm, PORT_SCOUT_HAUL_BAND_NEAR_NM);
    assert.equal(bands[1]!.maxNm, PORT_SCOUT_HAUL_BAND_MID_NM);
    assert.equal(bands[2]!.maxNm, PORT_SCOUT_HAUL_MAX_NM);
    assert.equal(nmInPortScoutHaulBand(500, bands[0]!), true);
    assert.equal(nmInPortScoutHaulBand(501, bands[1]!), true);
    assert.equal(nmInPortScoutHaulBand(1200, bands[1]!), true);
    assert.equal(nmInPortScoutHaulBand(1201, bands[2]!), true);
    assert.equal(nmInPortScoutHaulBand(1801, bands[2]!), false);
  });

  it('pickPortScoutHaulByBands does not steal empty rings', () => {
    const rows = [
      { id: 'f1', distanceNm: 1400, score: 100, payUsd: 100 },
      { id: 'f2', distanceNm: 1500, score: 90, payUsd: 90 },
      { id: 'f3', distanceNm: 1600, score: 80, payUsd: 80 },
      { id: 'f4', distanceNm: 1700, score: 70, payUsd: 70 },
      { id: 'm1', distanceNm: 800, score: 50, payUsd: 50 },
    ];
    const picked = pickPortScoutHaulByBands(rows, 8);
    assert.equal(
      picked.filter((r) => r.distanceNm <= 500).length,
      0,
      'near empty',
    );
    assert.equal(
      picked.filter(
        (r) => r.distanceNm > 500 && r.distanceNm <= 1200,
      ).length,
      1,
    );
    assert.equal(
      picked.filter((r) => r.distanceNm > 1200).length,
      3,
      'far capped at 3',
    );
    assert.ok(!picked.some((r) => r.id === 'f4'), '4th far must not steal near');
  });

  it('Haul scout board mixes near/mid/far when short-fill exists in each ring', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 8_000,
      avgCostUsdPerKg: 1.0,
      tick: world.tick,
    });
    for (const ap of world.airports) {
      ap.inventory.general = {
        capacityKg: 40_000,
        stockKg: 40_000,
      };
    }
    // SBGR→ SBGL ~182 near · SBRF ~1134 mid · SBEG ~1457 far (all ≤1800)
    for (const icao of ['SBGL', 'SBRF', 'SBEG', 'SCEL'] as const) {
      const ap = world.airports.find((a) => a.icao === icao);
      if (!ap) continue;
      ap.inventory.general = {
        capacityKg: 40_000,
        stockKg: 2_000,
      };
    }
    const suggestions = listPortScoutHaulSuggestions(state, world);
    const near = suggestions.filter((s) => s.distanceNm <= 500);
    const mid = suggestions.filter(
      (s) => s.distanceNm > 500 && s.distanceNm <= 1200,
    );
    const far = suggestions.filter(
      (s) => s.distanceNm > 1200 && s.distanceNm <= 1800,
    );
    assert.ok(
      suggestions.some((s) => s.destIcao === 'SBGL'),
      'expected near SBGL on board',
    );
    assert.ok(
      suggestions.some((s) => s.destIcao === 'SBRF'),
      'expected mid SBRF on board',
    );
    assert.ok(
      suggestions.some((s) => s.destIcao === 'SBEG' || s.destIcao === 'SCEL'),
      'expected far dest on board',
    );
    assert.ok(near.length <= 2);
    assert.ok(mid.length <= 3);
    assert.ok(far.length <= 3);
  });
});
