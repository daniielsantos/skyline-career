/**
 * International Demand Board: country-pair allowlist + port pickup WH origin.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptDemandOrder,
  assertDemandInternationalAccept,
  DEMAND_INTL_PAY_MULT,
  DEMAND_ORDERS_GLOBAL_CAP,
  demandCountryOpenQuotas,
  demandEffectiveUnitPriceUsd,
  demandHubCountryId,
  demandOrdersGlobalCap,
  demandWantedKgBand,
  ensureDemandOrders,
  isDemandInternationalCountryPair,
  listOpenDemandOrders,
} from './career-demand.js';
import {
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
} from './career-warehouse.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import type { PlayerWarehouse } from './types/career-economy.js';

describe('demand international accept', () => {
  it('allowlists expected country pairs bidirectionally', () => {
    assert.equal(isDemandInternationalCountryPair('BR', 'US'), true);
    assert.equal(isDemandInternationalCountryPair('US', 'BR'), true);
    assert.equal(isDemandInternationalCountryPair('AR', 'CL'), true);
    assert.equal(isDemandInternationalCountryPair('US', 'MX'), true);
    assert.equal(isDemandInternationalCountryPair('BR', 'BR'), false);
    assert.equal(isDemandInternationalCountryPair('CL', 'CA'), false);
  });

  it('resolves hub countries from seed airports', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-countries' });
    assert.equal(demandHubCountryId(world, 'SAEZ'), 'AR');
    assert.equal(demandHubCountryId(world, 'KMIA'), 'US');
    assert.equal(demandHubCountryId(world, 'SBGR'), 'BR');
    assert.equal(demandHubCountryId(world, 'MMMX'), 'MX');
  });

  it('allows SAEZ port WH → KMIA with intl pay mult', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-saez-kmia' });
    const gate = assertDemandInternationalAccept(world, 'SAEZ', 'KMIA');
    assert.equal(gate.international, true);
    assert.equal(gate.unitPriceMult, DEMAND_INTL_PAY_MULT);
    assert.equal(gate.originCountryId, 'AR');
    assert.equal(gate.destCountryId, 'US');

    const order = {
      maxUnitPriceUsd: 2,
      destIcao: 'KMIA',
    };
    assert.equal(
      demandEffectiveUnitPriceUsd(world, order, 'SAEZ'),
      Math.round(2 * DEMAND_INTL_PAY_MULT * 100) / 100,
    );
  });

  it('keeps domestic SBGR → SBKP at mult 1', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-dom' });
    const gate = assertDemandInternationalAccept(world, 'SBGR', 'SBKP');
    assert.equal(gate.international, false);
    assert.equal(gate.unitPriceMult, 1);
  });

  it('rejects non-port WH origin on intl pair (MMMX → KIAH)', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-mmmx' });
    assert.throws(
      () => assertDemandInternationalAccept(world, 'MMMX', 'KIAH'),
      /port pickup hub/i,
    );
  });

  it('rejects country pairs outside the allowlist', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-pair' });
    // CL ↔ CA is not listed.
    assert.throws(
      () => assertDemandInternationalAccept(world, 'SCEL', 'CYVR'),
      /not on the allowed country pairs/i,
    );
  });

  it('accepts short intl CYVR → KSEA from port WH with premium pay', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-cyvr' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'CYVR', {
      pilotName: 'IntlDemand',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'CYVR');
    depositCargoToWarehouse(state, {
      icao: 'CYVR',
      commodityId: 'general',
      kg: 600,
      avgCostUsdPerKg: 1.5,
      tick: world.tick,
    });

    const dest = world.airports.find((a) => a.icao === 'KSEA');
    assert.ok(dest);
    const pile = dest!.inventory.general!;
    pile.stockKg = Math.floor(pile.capacityKg * 0.05);

    world.demandOrders = [
      {
        id: 'demand_intl_ksea',
        destIcao: 'KSEA',
        commodityId: 'general',
        wantedKg: 500,
        remainingKg: 500,
        maxUnitPriceUsd: 3,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
      },
    ];

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'CYVR';

    const accepted = acceptDemandOrder(state, world, {
      orderId: 'demand_intl_ksea',
      originIcao: 'CYVR',
      aircraftId: aircraft.id,
      kg: 200,
    });
    assert.ok(accepted.kg > 0 && accepted.kg <= 200);
    const expectedUnit = Math.round(3 * DEMAND_INTL_PAY_MULT * 100) / 100;
    assert.equal(
      accepted.payUsd,
      Math.round(expectedUnit * accepted.kg * 100) / 100,
    );
    assert.match(accepted.mission.reason ?? '', /Intl demand/i);
  });

  it('rejects accept from injected non-pickup WH on intl route', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-intl-fake-wh' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'MMMX', {
      pilotName: 'NoPortWh',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const whs = ensurePlayerWarehouses(state);
    const fake: PlayerWarehouse = {
      id: 'wh_mmmx_fake',
      icao: 'MMMX',
      capacityKg: 20_000,
      tier: 1,
      lifetimeShippedKg: 0,
    };
    whs.warehouses.push(fake);
    depositCargoToWarehouse(state, {
      icao: 'MMMX',
      commodityId: 'general',
      kg: 400,
      avgCostUsdPerKg: 1.2,
      tick: world.tick,
    });

    world.demandOrders = [
      {
        id: 'demand_intl_kiah',
        destIcao: 'KIAH',
        commodityId: 'general',
        wantedKg: 400,
        remainingKg: 400,
        maxUnitPriceUsd: 2.5,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
      },
    ];

    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'MMMX';
    // Wide freighter range so distance is not the failure mode.
    aircraft.aircraftClassId = 'wide_freighter';

    assert.throws(
      () =>
        acceptDemandOrder(state, world, {
          orderId: 'demand_intl_kiah',
          originIcao: 'MMMX',
          aircraftId: aircraft.id,
          kg: 200,
        }),
      /port pickup hub/i,
    );
  });
});

describe('demand country quotas', () => {
  it('splits global cap across countries so BR cannot monopolize the board', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-quota-split' });
    for (const ap of world.airports) {
      for (const id of [
        'general',
        'supplies',
        'machinery',
        'electronics',
      ] as const) {
        const pile = ap.inventory[id];
        if (pile) pile.stockKg = Math.floor(pile.capacityKg * 0.05);
      }
    }

    const quotas = demandCountryOpenQuotas(world);
    const cap = demandOrdersGlobalCap(world);
    assert.ok(cap >= DEMAND_ORDERS_GLOBAL_CAP);
    assert.ok(cap >= 640, `expected densify global cap ≥640, got ${cap}`);
    assert.ok((quotas.get('BR') ?? 0) < cap);
    assert.ok((quotas.get('US') ?? 0) >= 1);
    assert.equal(
      [...quotas.values()].reduce((s, n) => s + n, 0),
      cap,
    );
    // Port-weighted: US densify desks get a larger share than a 0-port country.
    assert.ok(
      (quotas.get('US') ?? 0) > (quotas.get('LU') ?? 0),
      `US quota ${quotas.get('US')} should beat thin-port LU ${quotas.get('LU')}`,
    );
    assert.ok(
      (quotas.get('US') ?? 0) >= 8,
      `US quota too thin after densify: ${quotas.get('US')}`,
    );

    const orders = ensureDemandOrders(world).filter(
      (o) =>
        o.status === 'open' &&
        o.remainingKg > 0 &&
        o.expiresAtTick > world.tick,
    );
    const byCountry = new Map<string, number>();
    for (const o of orders) {
      const c = demandHubCountryId(world, o.destIcao);
      assert.ok(c, o.destIcao);
      byCountry.set(c!, (byCountry.get(c!) ?? 0) + 1);
    }

    assert.ok((byCountry.get('BR') ?? 0) > 0, 'expected BR demand');
    assert.ok((byCountry.get('US') ?? 0) > 0, 'expected US demand');
    assert.ok((byCountry.get('AR') ?? 0) > 0, 'expected AR demand');
    assert.ok(
      (byCountry.get('BR') ?? 0) <= (quotas.get('BR') ?? 0),
      `BR open ${byCountry.get('BR')} over quota ${quotas.get('BR')}`,
    );
    assert.ok(
      (byCountry.get('US') ?? 0) <= (quotas.get('US') ?? 0),
      `US open ${byCountry.get('US')} over quota ${quotas.get('US')}`,
    );
  });

  it('trims an existing BR-only full board so other countries can spawn', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-quota-trim' });
    world.demandOrders = [];
    for (let i = 0; i < DEMAND_ORDERS_GLOBAL_CAP; i++) {
      world.demandOrders.push({
        id: `demand_br_flood_${i}`,
        destIcao: 'SBGR',
        commodityId: 'general',
        wantedKg: 500,
        remainingKg: 500,
        maxUnitPriceUsd: 2,
        arrivedAtTick: world.tick - DEMAND_ORDERS_GLOBAL_CAP + i,
        expiresAtTick: world.tick + 200,
        status: 'open',
      });
    }
    for (const ap of world.airports) {
      if (ap.icao === 'KMIA' || ap.icao === 'SAEZ') {
        const pile = ap.inventory.general!;
        pile.stockKg = Math.floor(pile.capacityKg * 0.05);
      }
    }

    ensureDemandOrders(world);
    const open = listOpenDemandOrders(world);
    const byCountry = new Map<string, number>();
    for (const o of open) {
      const c = demandHubCountryId(world, o.destIcao);
      if (!c) continue;
      byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
    }
    const quotas = demandCountryOpenQuotas(world);
    assert.ok(
      (byCountry.get('BR') ?? 0) <= (quotas.get('BR') ?? 0),
      'BR should be trimmed to quota',
    );
    assert.ok(
      (byCountry.get('US') ?? 0) > 0 || (byCountry.get('AR') ?? 0) > 0,
      'expected non-BR demand after trim',
    );
  });
});

describe('demand wanted kg band', () => {
  it('allows feeder-jet Demand sizes, not only 4 t general', () => {
    assert.equal(demandWantedKgBand('supplies').max, 12_000);
    assert.equal(demandWantedKgBand('electronics').max, 8_000);
  });
});
