import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  listMarketLots,
  localPriceMultiplier,
  tickEconomyN,
} from './career-economy.js';

describe('career-economy seed', () => {
  it('creates 12 hubs and 4 commodities of inventory', () => {
    const world = createSeedEconomyWorld({ seed: 'test-a' });
    assert.equal(world.airports.length, 12);
    assert.equal(world.tick, 0);
    assert.equal(world.lots.length, 0);
    for (const ap of world.airports) {
      assert.ok(ap.inventory.electronics);
      assert.ok(ap.inventory.perishables);
      assert.ok(ap.inventory.machinery);
      assert.ok(ap.inventory.general);
    }
  });
});

describe('localPriceMultiplier', () => {
  it('raises price when stock is low', () => {
    const low = localPriceMultiplier({ stockKg: 5_000, capacityKg: 100_000 });
    const high = localPriceMultiplier({ stockKg: 95_000, capacityKg: 100_000 });
    assert.ok(low > high);
    assert.ok(low > 1);
    assert.ok(high < 1);
  });
});

describe('tickEconomyN market formation', () => {
  it('forms shipment lots with surplus→shortage reasons after ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'test-lanes' });
    tickEconomyN(world, 24);
    const market = listMarketLots(world);
    assert.ok(market.length > 0, 'expected market lots after ticks');

    for (const row of market.slice(0, 5)) {
      assert.ok(row.lot.originIcao !== row.lot.destIcao);
      assert.ok(row.availableKg > 0);
      assert.ok(row.lot.payUsd > 0);
      assert.match(row.lot.reason, /surplus|shortage/i);
      // Economic cause: origin fuller than destination for that commodity
      assert.ok(
        row.originFillPct + 0.05 >= row.destFillPct,
        `${row.lot.reason} originFill=${row.originFillPct} destFill=${row.destFillPct}`,
      );
    }
  });

  it('keeps lots stable across identical seeds', () => {
    const a = createSeedEconomyWorld({ seed: 'same' });
    const b = createSeedEconomyWorld({ seed: 'same' });
    tickEconomyN(a, 10);
    tickEconomyN(b, 10);
    assert.equal(a.lots.length, b.lots.length);
    assert.deepEqual(
      a.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
      b.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
    );
  });
});
