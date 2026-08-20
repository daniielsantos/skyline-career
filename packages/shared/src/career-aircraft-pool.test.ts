import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countryAircraftClassCap,
  countryScaleFactor,
  countInstancesBySkuGlobally,
  dealerInstancesForMarket,
  dealerInstancesWorldwide,
  ensureDealerSkuFloor,
  ensureAircraftPoolCatalogSync,
  ensureWorldAircraftPool,
} from './career-aircraft-pool.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { listCareerPlayerAirframes as listSkus } from './career-player-airframes.js';
import { countryIdFromRegion } from './career-partition.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import {
  listAircraftMarket,
  purchaseAircraftListing,
} from './career-aircraft-market.js';
import type { FreighterClassId } from './types/career-economy.js';

const CLASS_ORDER: FreighterClassId[] = [
  'light_ga',
  'light_turboprop',
  'light_jet',
  'medium_piston',
  'narrow_freighter',
  'wide_freighter',
];

describe('aircraft pool', () => {
  it('scales BR at factor 1.0 and caps US at 1.5×', () => {
    assert.equal(countryScaleFactor(62), 1);
    assert.equal(countryScaleFactor(166), 1.5);
    assert.ok(countryScaleFactor(21) < 0.4);
  });

  it('BR GA cap covers every enabled SKU (18)', () => {
    const gaSkus = listSkus('light_ga').length;
    assert.equal(gaSkus, 18);
    assert.equal(countryAircraftClassCap(60, 'light_ga', gaSkus), 18);
    assert.equal(countryAircraftClassCap(62, 'light_ga', gaSkus), 18);
  });

  it('seeds BR with one of each GA and equal global SKU counts', () => {
    const world = createSeedEconomyWorld({ seed: 'pool-br-ga' });
    ensureWorldAircraftPool(world);
    const brGa = dealerInstancesForMarket(world, 'BR').filter(
      (i) => i.aircraftClassId === 'light_ga',
    );
    const gaSkus = listSkus('light_ga').map((a) => a.typeId);
    assert.equal(brGa.length, gaSkus.length);
    assert.deepEqual(
      new Set(brGa.map((i) => i.airframeTypeId)),
      new Set(gaSkus),
    );

    const global = countInstancesBySkuGlobally(world, 'light_ga');
    const counts = [...global.values()];
    assert.ok(counts.length > 0);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    assert.ok(max - min <= 1, `GA global skew min=${min} max=${max}`);
  });

  it('seeds every enabled SKU at the global per-class quota (wide/narrow)', () => {
    const world = createSeedEconomyWorld({ seed: 'pool-sku-floor' });
    ensureWorldAircraftPool(world);
    const available = new Set(
      dealerInstancesWorldwide(world).map((i) => i.airframeTypeId),
    );
    for (const classId of CLASS_ORDER) {
      for (const sku of listSkus(classId)) {
        assert.ok(
          available.has(sku.typeId),
          `missing dealer stock for ${classId}/${sku.typeId}`,
        );
      }
    }
    const wideSkus = listSkus('wide_freighter');
    assert.ok(wideSkus.some((s) => s.typeId === 'tfdi-md11f-family'));
    assert.ok(available.has('tfdi-md11f-family'));
    const wideGlobal = countInstancesBySkuGlobally(world, 'wide_freighter');
    assert.equal(wideGlobal.size, wideSkus.length);
    const wideCounts = [...wideGlobal.values()];
    assert.equal(Math.min(...wideCounts), 3);
    assert.equal(Math.max(...wideCounts), 3);
    assert.equal(wideGlobal.get('tfdi-md11f-family'), 3);

    const narrowGlobal = countInstancesBySkuGlobally(world, 'narrow_freighter');
    const narrowCounts = [...narrowGlobal.values()];
    assert.equal(Math.min(...narrowCounts), 3);
    assert.equal(Math.max(...narrowCounts), 3);
  });

  it('backfills missing SKUs on existing worlds without wipe', () => {
    const world = createSeedEconomyWorld({ seed: 'pool-backfill' });
    ensureWorldAircraftPool(world);
    world.aircraftInstances = (world.aircraftInstances ?? []).filter(
      (i) => i.airframeTypeId !== 'tfdi-md11f-family',
    );
    assert.ok(
      !(world.aircraftInstances ?? []).some(
        (i) => i.airframeTypeId === 'tfdi-md11f-family',
      ),
    );
    assert.equal(ensureDealerSkuFloor(world), true);
    const md11 = (world.aircraftInstances ?? []).filter(
      (i) => i.airframeTypeId === 'tfdi-md11f-family' && i.status === 'available',
    );
    assert.equal(md11.length, 3);
    assert.equal(ensureAircraftPoolCatalogSync(world), false);
  });

  it('purchase removes the dealer instance from the board', () => {
    const world = createSeedEconomyWorld({ seed: 'pool-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PoolBuyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const before = listAircraftMarket(state, world);
    const buy = before.find(
      (l) => l.kind !== 'lease' && l.aircraftClassId === 'light_ga',
    );
    assert.ok(buy, 'expected GA sale listing in BR pool');
    state.walletUsd = buy!.askingUsd + 10_000;
    const { aircraft } = purchaseAircraftListing(state, world, buy!.id);
    assert.equal(aircraft.registration, buy!.registration);
    const inst = world.aircraftInstances?.find((row) => row.id === buy!.id);
    assert.equal(inst?.status, 'sold');
    const after = listAircraftMarket(state, world);
    assert.ok(!after.some((l) => l.id === buy!.id));
  });

  it('tiny countries still get at least one GA', () => {
    const world = createSeedEconomyWorld({ seed: 'pool-ki' });
    ensureWorldAircraftPool(world);
    const kiHubs = world.airports.filter(
      (a) => countryIdFromRegion(a.region ?? '') === 'KI',
    ).length;
    assert.ok(kiHubs >= 1);
    const kiGa = dealerInstancesForMarket(world, 'KI').filter(
      (i) => i.aircraftClassId === 'light_ga',
    );
    assert.equal(kiGa.length, 1);
  });

  it('seeds BR GA in every sub-region, not only SE', () => {
    const world = createSeedEconomyWorld({ seed: 'pool-br-ga' });
    ensureWorldAircraftPool(world);
    const brGa = dealerInstancesForMarket(world, 'BR').filter(
      (i) => i.aircraftClassId === 'light_ga',
    );
    const regions = new Set<string>();
    for (const inst of brGa) {
      const ap = world.airports.find(
        (a) => a.icao.toUpperCase() === inst.basedIcao.toUpperCase(),
      );
      if (ap?.region) regions.add(ap.region.toUpperCase());
    }
    assert.ok(regions.has('BR-SE'), `missing SE, got ${[...regions].join(',')}`);
    assert.ok(regions.has('BR-N'), `missing North, got ${[...regions].join(',')}`);
    assert.ok(
      regions.size >= 4,
      `expected most BR sub-regions, got ${[...regions].join(',')}`,
    );
  });
});
