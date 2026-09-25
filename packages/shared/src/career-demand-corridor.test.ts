import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMAND_COMMODITIES,
  DEMAND_ORDERS_PER_PORT_BASE,
  DEMAND_ORDERS_PER_PORT_OPERATOR_EXTRA,
  DEMAND_STOCK_FRAC_THRESHOLD,
  corridorNmForLevel,
  demandSpawnBandIndexForDest,
  demandSpawnBandTargets,
  destWithinCorridorNm,
  ensureDemandOrders,
  listOpenDemandOrders,
  assertDemandPortCorridorReach,
  nmInDemandSpawnBand,
  resolvePlayerPortCorridorLevel,
  worldPortDeskCorridorLevel,
} from './career-demand.js';
import './career-ports.js';
import { airportByIcao, createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
  WAREHOUSE_CAPACITY_KG,
} from './career-warehouse-stock.js';
import type { CareerMissionsState } from './types/career-economy.js';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import { listPortScoutDemandSuggestions } from './career-port-scout.js';

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

function fillAllDemandStock(
  world: ReturnType<typeof createSeedEconomyWorld>,
  fill = 0.9,
) {
  for (const ap of world.airports) {
    for (const commodityId of DEMAND_COMMODITIES) {
      const pile = ap.inventory?.[commodityId];
      if (!pile || !(pile.capacityKg > 0)) continue;
      pile.stockKg = Math.floor(pile.capacityKg * fill);
    }
  }
}

function starveDemandHub(
  world: ReturnType<typeof createSeedEconomyWorld>,
  icao: string,
  commodityId: (typeof DEMAND_COMMODITIES)[number] = 'general',
) {
  const ap = airportByIcao(world, icao);
  if (!ap) return;
  for (const id of DEMAND_COMMODITIES) {
    const pile = ap.inventory?.[id];
    if (!pile || !(pile.capacityKg > 0)) continue;
    if (id === commodityId) {
      pile.capacityKg = Math.max(pile.capacityKg, 50_000);
      pile.stockKg = Math.floor(
        pile.capacityKg * (DEMAND_STOCK_FRAC_THRESHOLD * 0.1),
      );
    } else {
      pile.stockKg = Math.floor(pile.capacityKg * 0.9);
    }
  }
}

describe('per-port Demand desk', () => {
  it('corridor ladder is 500 / 1800 / open', () => {
    assert.equal(corridorNmForLevel(1), 500);
    assert.equal(corridorNmForLevel(2), 1800);
    assert.equal(corridorNmForLevel(3), null);
  });

  it('spawn band targets: P1 all near, P2 half/half, P3 2/2/rest', () => {
    const p1 = demandSpawnBandTargets(1, 6);
    assert.equal(p1.length, 1);
    assert.equal(p1[0]!.targetSlots, 6);
    assert.equal(p1[0]!.maxNm, 500);

    const p2 = demandSpawnBandTargets(2, 7);
    assert.equal(p2.length, 2);
    assert.equal(p2[0]!.targetSlots, 4);
    assert.equal(p2[1]!.targetSlots, 3);
    assert.equal(
      p2.reduce((s, b) => s + b.targetSlots, 0),
      7,
    );

    const p3 = demandSpawnBandTargets(3, 7);
    assert.deepEqual(
      p3.map((b) => b.targetSlots),
      [2, 2, 3],
    );
    assert.equal(p3[2]!.maxNm, null);
    assert.equal(nmInDemandSpawnBand(500, p3[0]!), true);
    assert.equal(nmInDemandSpawnBand(501, p3[0]!), false);
    assert.equal(nmInDemandSpawnBand(501, p3[1]!), true);
    assert.equal(nmInDemandSpawnBand(1800, p3[1]!), true);
    assert.equal(nmInDemandSpawnBand(1801, p3[2]!), true);
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
          ? ['SBGR']
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

  it('P3 desk spawn respects 2/2/rest bands and does not steal empty rings', () => {
    const world = createSeedEconomyWorld({ seed: 'desk-bands-p3' });
    world.tick = 96;
    world.portConcessions = [
      {
        portId: 'BRSSZ',
        companyId: 'co_band',
        leasePaidThroughTick: world.tick + 10_000,
        level: 3,
      },
    ];
    world.demandOrders = [];
    fillAllDemandStock(world, 0.95);

    // Far-only shortages from SBGR — near/mid stay full → far slots fill, near stays empty.
    for (const icao of ['SKBO', 'KMIA', 'EGLL', 'YSSY', 'LFPG'] as const) {
      starveDemandHub(world, icao);
    }

    ensureDemandOrders(world);
    const pickups = ['SBGR'] as const;
    const bands = demandSpawnBandTargets(3, DEMAND_ORDERS_PER_PORT_BASE + 1);
    const santos = listOpenDemandOrders(world).filter(
      (o) => o.portId === 'BRSSZ',
    );
    const counts = [0, 0, 0];
    for (const o of santos) {
      const bi = demandSpawnBandIndexForDest(o.destIcao, pickups, bands);
      assert.ok(bi >= 0, `${o.destIcao} unclassified`);
      counts[bi]! += 1;
    }
    assert.equal(counts[0], 0, 'near must stay empty when no near shortage');
    assert.equal(counts[1], 0, 'mid must stay empty when no mid shortage');
    assert.ok(counts[2]! >= 1, 'expected far orders when far shortage exists');
    assert.ok(
      counts[2]! <= bands[2]!.targetSlots,
      `far over target: ${counts[2]}`,
    );
    assert.ok(
      santos.length <=
        DEMAND_ORDERS_PER_PORT_BASE + DEMAND_ORDERS_PER_PORT_OPERATOR_EXTRA,
    );

    // Refill with near shortages only — must not convert far targets into near.
    world.demandOrders = santos.map((o) => ({ ...o }));
    fillAllDemandStock(world, 0.95);
    for (const icao of ['SBGL', 'SBKP', 'SBCF'] as const) {
      starveDemandHub(world, icao);
    }
    // Keep existing far rows; free near slots should fill without exceeding near target.
    ensureDemandOrders(world);
    const after = listOpenDemandOrders(world).filter(
      (o) => o.portId === 'BRSSZ',
    );
    const nearAfter = after.filter(
      (o) => demandSpawnBandIndexForDest(o.destIcao, pickups, bands) === 0,
    );
    assert.ok(nearAfter.length >= 1, 'expected near orders after near shortage');
    assert.ok(
      nearAfter.length <= bands[0]!.targetSlots,
      `near over target: ${nearAfter.length}`,
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

  it('Scout Demand prefers shorter hop when pay is similar (uncapped nm penalty)', () => {
    const world = createSeedEconomyWorld({ seed: 'scout-demand-nm' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'ScoutNm',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 800_000;
    const warehouses = ensurePlayerWarehouses(state);
    warehouses.warehouses.push({
      id: 'wh_sbgr_t3',
      icao: 'SBGR',
      capacityKg: WAREHOUSE_CAPACITY_KG[3],
      tier: 3,
      lifetimeShippedKg: PORT_CONCESSION_SHIPPED_KG,
    });
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'general',
      kg: 5_000,
      avgCostUsdPerKg: 1.0,
      tick: world.tick,
    });

    // Same unit price + kg → pay equal; score = pay - nm*2 ranks SBGL over KMIA.
    world.demandOrders = [
      {
        id: 'dmd_near',
        portId: 'BRSSZ',
        destIcao: 'SBGL',
        commodityId: 'general',
        wantedKg: 1_000,
        remainingKg: 1_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 10_000,
        status: 'open',
      },
      {
        id: 'dmd_far',
        portId: 'BRSSZ',
        destIcao: 'KMIA',
        commodityId: 'general',
        wantedKg: 1_000,
        remainingKg: 1_000,
        maxUnitPriceUsd: 4,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 10_000,
        status: 'open',
      },
    ];

    // P3 so KMIA is Accept-reachable from Scout.
    const conc = (state.playerPortConcessions ?? []).find(
      (c) => c.portId === 'BRSSZ',
    );
    if (conc) conc.level = 3;

    const suggestions = listPortScoutDemandSuggestions(state, world);
    const near = suggestions.find((s) => s.orderId === 'dmd_near');
    const far = suggestions.find((s) => s.orderId === 'dmd_far');
    assert.ok(near && far, 'expected both Demand scout rows');
    assert.ok(
      near!.score > far!.score,
      `near score ${near!.score} should beat far ${far!.score}`,
    );
    assert.equal(suggestions[0]?.orderId, 'dmd_near');
  });
});
