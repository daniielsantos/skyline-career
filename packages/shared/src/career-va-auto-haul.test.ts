/**
 * IH-3 VA auto-haul desk — caps and gates.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import { airportByIcao, createSeedEconomyWorld } from './career-economy.js';
import {
  emptyMissionsStateV2,
  normalizeMissionsState,
  selectStarterHub,
} from './career-fleet.js';
import {
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
  WAREHOUSE_CAPACITY_KG,
} from './career-warehouse-stock.js';
import { listDemandHolds } from './career-demand.js';
import { holdWarehouseBridge } from './career-warehouse-bridge.js';
import { economyDayIndex } from './career-weather.js';
import {
  clampMaxHaulsPerDay,
  tickVaAutoHaul,
  upsertVaAutoHaul,
  VA_AUTO_HAUL_MAX_OPEN_HOLDS,
  VA_AUTO_HAUL_MAX_PER_DAY_MAX,
  VA_AUTO_HAUL_MIN_MEMBERS,
} from './career-va-auto-haul.js';
import type { CommodityId } from './types/career-economy.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';

function missionsAtSantos() {
  const world = createSeedEconomyWorld({ seed: 'va-auto-haul' });
  let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
    pilotName: 'Desk',
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

function setHubFill(
  world: ReturnType<typeof createSeedEconomyWorld>,
  icao: string,
  commodityId: CommodityId,
  fill: number,
) {
  const pile = airportByIcao(world, icao)?.inventory?.[commodityId];
  if (!pile || pile.capacityKg <= 0) {
    throw new Error(`no ${commodityId} pile at ${icao}`);
  }
  pile.stockKg = Math.floor(pile.capacityKg * fill);
}

describe('tickVaAutoHaul', () => {
  it('skips when disabled', () => {
    const { world, state } = missionsAtSantos();
    const result = tickVaAutoHaul(state, world, {
      companyId: LOCAL_COMPANY_ID,
      vaListed: true,
      memberCount: 3,
    });
    assert.equal(result.posted, 0);
    assert.equal(result.skipped, 'disabled');
  });

  it('requires listed VA with enough members', () => {
    const { world, state } = missionsAtSantos();
    upsertVaAutoHaul(state, { enabled: true });
    assert.equal(
      tickVaAutoHaul(state, world, {
        vaListed: false,
        memberCount: 3,
      }).skipped,
      'not_listed',
    );
    assert.equal(
      tickVaAutoHaul(state, world, {
        vaListed: true,
        memberCount: VA_AUTO_HAUL_MIN_MEMBERS - 1,
      }).skipped,
      'need_members',
    );
  });

  it('posts a paid bridge from Scout when stock + Port FBO exist', () => {
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
    setHubFill(world, 'SBGR', 'general', 0.95);
    setHubFill(world, 'SBKP', 'general', 0.1);
    upsertVaAutoHaul(state, { enabled: true, maxHaulsPerDay: 2 });

    const day = economyDayIndex(world.tick);
    const first = tickVaAutoHaul(state, world, {
      companyId: LOCAL_COMPANY_ID,
      vaListed: true,
      memberCount: 3,
    });
    assert.ok(first.posted >= 1, `expected post, got ${JSON.stringify(first)}`);
    const bridges = listDemandHolds(state).filter(
      (h) => (h.kind ?? 'demand') === 'bridge',
    );
    assert.ok(bridges.length >= 1);
    assert.ok((bridges[0]!.pilotPayUsd ?? 0) > 0);
    assert.equal(state.vaAutoHaul?.postedToday, first.posted);
    assert.equal(state.vaAutoHaul?.postedDayIndex, day);

    state.vaAutoHaul!.postedToday = state.vaAutoHaul!.maxHaulsPerDay;
    const capped = tickVaAutoHaul(state, world, {
      companyId: LOCAL_COMPANY_ID,
      vaListed: true,
      memberCount: 3,
    });
    assert.equal(capped.posted, 0);
    assert.equal(capped.skipped, 'daily_cap');
  });

  it('does not post a bridge toward the cheaper hub', () => {
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
    setHubFill(world, 'SBGR', 'general', 0.1);
    setHubFill(world, 'SBKP', 'general', 0.95);
    upsertVaAutoHaul(state, { enabled: true, maxHaulsPerDay: 2 });

    const result = tickVaAutoHaul(state, world, {
      companyId: LOCAL_COMPANY_ID,
      vaListed: true,
      memberCount: 3,
    });
    assert.equal(result.posted, 0);
    assert.equal(result.skipped, 'no_routes');
    assert.equal(
      listDemandHolds(state).filter((h) => (h.kind ?? 'demand') === 'bridge')
        .length,
      0,
    );
  });

  const deskOpts = {
    companyId: LOCAL_COMPANY_ID,
    vaListed: true,
    memberCount: 3,
  };

  it('replaces a stale auto hold without spending another daily post', () => {
    const { world, state } = missionsAtSantos();
    grantWh(state, 'SBGR');
    grantWh(state, 'SBKP');
    claimPortConcession(state, world, { portId: 'BRSSZ' });
    for (const commodityId of ['general', 'supplies'] as const) {
      depositCargoToWarehouse(state, {
        icao: 'SBGR',
        commodityId,
        kg: 1_500,
        avgCostUsdPerKg: 1.2,
        tick: world.tick,
      });
      setHubFill(world, 'SBGR', commodityId, 0.95);
      setHubFill(world, 'SBKP', commodityId, 0.1);
    }
    upsertVaAutoHaul(state, { enabled: true, maxHaulsPerDay: 1 });

    const first = tickVaAutoHaul(state, world, deskOpts);
    assert.equal(first.posted, 1);
    assert.equal(first.retired, 0);
    const posted = listDemandHolds(state).find(
      (h) => (h.kind ?? 'demand') === 'bridge' && h.heldByAuto === true,
    );
    assert.ok(posted);
    const staleCommodity = posted.commodityId;
    assert.equal(state.vaAutoHaul?.postedToday, 1);

    setHubFill(world, 'SBGR', staleCommodity, 0.1);
    setHubFill(world, 'SBKP', staleCommodity, 0.95);
    const swapped = tickVaAutoHaul(state, world, deskOpts);
    assert.equal(swapped.retired, 1);
    assert.equal(swapped.posted, 1);
    assert.equal(state.vaAutoHaul?.postedToday, 1);
    const bridges = listDemandHolds(state).filter(
      (h) => (h.kind ?? 'demand') === 'bridge',
    );
    assert.equal(bridges.length, 1);
    assert.equal(bridges[0]!.heldByAuto, true);
    assert.notEqual(bridges[0]!.commodityId, staleCommodity);
    assert.notEqual(bridges[0]!.id, posted.id);
  });

  it('drops a stale auto hold when nothing else qualifies and leaves a manual hold', () => {
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
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: 1_500,
      avgCostUsdPerKg: 1.2,
      tick: world.tick,
    });
    setHubFill(world, 'SBGR', 'general', 0.95);
    setHubFill(world, 'SBKP', 'general', 0.1);
    setHubFill(world, 'SBGR', 'supplies', 0.1);
    setHubFill(world, 'SBKP', 'supplies', 0.95);
    upsertVaAutoHaul(state, { enabled: true, maxHaulsPerDay: 1 });
    const manual = holdWarehouseBridge(state, world, {
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      commodityId: 'supplies',
      kg: 1_500,
    });

    const first = tickVaAutoHaul(state, world, deskOpts);
    assert.equal(first.posted, 1);
    setHubFill(world, 'SBGR', 'general', 0.1);
    setHubFill(world, 'SBKP', 'general', 0.95);
    const dropped = tickVaAutoHaul(state, world, deskOpts);
    assert.equal(dropped.retired, 1);
    assert.equal(dropped.posted, 0);
    assert.equal(dropped.skipped, 'no_routes');
    assert.equal(state.vaAutoHaul?.postedToday, 1);
    const bridges = listDemandHolds(state).filter(
      (h) => (h.kind ?? 'demand') === 'bridge',
    );
    assert.equal(bridges.length, 1);
    assert.equal(bridges[0]!.id, manual.hold.id);
    assert.notEqual(bridges[0]!.heldByAuto, true);
  });

  it('desk ceiling is 10 posts a day and 10 open bridge holds', () => {
    assert.equal(VA_AUTO_HAUL_MAX_PER_DAY_MAX, 10);
    assert.equal(VA_AUTO_HAUL_MAX_OPEN_HOLDS, 10);
    assert.equal(clampMaxHaulsPerDay(10), 10);
    assert.equal(clampMaxHaulsPerDay(11), 10);
    const { state } = missionsAtSantos();
    upsertVaAutoHaul(state, { maxHaulsPerDay: 10 });
    assert.equal(state.vaAutoHaul?.maxHaulsPerDay, 10);
    const loaded = normalizeMissionsState(state);
    assert.equal(loaded.vaAutoHaul?.maxHaulsPerDay, VA_AUTO_HAUL_MAX_PER_DAY_MAX);
  });
});
