/**
 * IH-3 VA auto-haul desk — caps and gates.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimPortConcession,
  PORT_CONCESSION_SHIPPED_KG,
} from './career-port-concessions.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
} from './career-warehouse-stock.js';
import { listDemandHolds } from './career-demand.js';
import { economyDayIndex } from './career-weather.js';
import {
  tickVaAutoHaul,
  upsertVaAutoHaul,
  VA_AUTO_HAUL_MIN_MEMBERS,
} from './career-va-auto-haul.js';
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
    capacityKg: 6_804,
    tier: 3,
    lifetimeShippedKg: PORT_CONCESSION_SHIPPED_KG,
  });
  return id;
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
});
