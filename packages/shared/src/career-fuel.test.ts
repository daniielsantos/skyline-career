import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  deliverFuelUplift,
  ensureWorldFuelInventory,
  estimateUpliftKg,
  listMarketLots,
  migrateEconomyWorld,
  quoteFuelUplift,
  tickEconomyN,
} from './index.js';

describe('career fuel commodity', () => {
  it('seeds Jet-A inventory on every hub', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-seed' });
    for (const ap of world.airports) {
      assert.ok(ap.inventory.fuel, `${ap.icao} missing fuel`);
      assert.ok((ap.inventory.fuel?.capacityKg ?? 0) > 0);
      assert.ok((ap.baseProduction?.fuel ?? 0) > 0);
    }
    assert.ok((world.airports.find((a) => a.icao === 'SBGR')!.inventory.fuel!.capacityKg) >= 400_000);
  });

  it('migrates legacy airports without fuel piles', () => {
    const seeded = createSeedEconomyWorld({ seed: 'fuel-migrate' });
    for (const ap of seeded.airports) {
      delete ap.inventory.fuel;
      if (ap.baseProduction) delete ap.baseProduction.fuel;
      if (ap.baseConsumption) delete ap.baseConsumption.fuel;
      delete ap.production.fuel;
      delete ap.consumption.fuel;
    }
    const migrated = migrateEconomyWorld(seeded);
    ensureWorldFuelInventory(migrated);
    for (const ap of migrated.airports) {
      assert.ok(ap.inventory.fuel);
    }
  });

  it('does not form freight lots for fuel', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-nolots' });
    tickEconomyN(world, 48);
    const fuelLots = listMarketLots(world).filter((row) => row.lot.commodityId === 'fuel');
    assert.equal(fuelLots.length, 0);
  });

  it('quotes and delivers uplift, draining terminal stock', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-uplift' });
    const before = world.airports.find((a) => a.icao === 'SBGR')!.inventory.fuel!.stockKg;
    const quote = quoteFuelUplift(world, {
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      aircraftClassId: 'narrow_freighter',
    });
    assert.ok(quote.requestedKg > 400);
    assert.equal(quote.scarcity, 'ok');
    assert.ok(quote.costUsd > 0);

    const uplift = deliverFuelUplift(world, quote);
    const after = world.airports.find((a) => a.icao === 'SBGR')!.inventory.fuel!.stockKg;
    assert.equal(uplift.deliveredKg, quote.requestedKg);
    assert.equal(after, before - uplift.deliveredKg);
  });

  it('applies dry surcharge when terminal is empty', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-dry' });
    const ap = world.airports.find((a) => a.icao === 'SBPS')!;
    ap.inventory.fuel!.stockKg = 0;
    const quote = quoteFuelUplift(world, {
      originIcao: 'SBPS',
      destIcao: 'SBSV',
      aircraftClassId: 'light_turboprop',
      distanceNm: 200,
    });
    assert.equal(quote.scarcity, 'dry');
    assert.equal(quote.availableKg, 0);
    const expected = Math.round(
      estimateUpliftKg('light_turboprop', 200) * quote.unitPriceUsd * 2,
    );
    assert.equal(quote.costUsd, expected);
  });
});
