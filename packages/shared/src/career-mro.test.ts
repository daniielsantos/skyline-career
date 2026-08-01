import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  ensureWorldMroInventory,
  listMarketLots,
  migrateEconomyWorld,
  tickEconomyN,
} from './career-economy.js';
import {
  deliverMroParts,
  mroKgForInspection,
  quoteMroParts,
} from './career-mro.js';

describe('career MRO parts', () => {
  it('seeds aircraft-parts inventory on every hub', () => {
    const world = createSeedEconomyWorld({ seed: 'mro-seed' });
    for (const ap of world.airports) {
      assert.ok(ap.inventory.mro_parts, `${ap.icao} missing mro_parts`);
      assert.ok((ap.inventory.mro_parts?.capacityKg ?? 0) > 0);
      assert.ok((ap.baseProduction?.mro_parts ?? 0) > 0);
    }
    assert.ok(
      (world.airports.find((a) => a.icao === 'SBGR')!.inventory.mro_parts!
        .capacityKg) >= 80_000,
    );
  });

  it('migrates legacy airports without MRO piles', () => {
    const seeded = createSeedEconomyWorld({ seed: 'mro-migrate' });
    for (const ap of seeded.airports) {
      delete ap.inventory.mro_parts;
      if (ap.baseProduction) delete ap.baseProduction.mro_parts;
      if (ap.baseConsumption) delete ap.baseConsumption.mro_parts;
      delete ap.production.mro_parts;
      delete ap.consumption.mro_parts;
    }
    const migrated = migrateEconomyWorld(seeded);
    ensureWorldMroInventory(migrated);
    for (const ap of migrated.airports) {
      assert.ok(ap.inventory.mro_parts);
    }
  });

  it('does not form freight lots for mro_parts', () => {
    const world = createSeedEconomyWorld({ seed: 'mro-nolots' });
    tickEconomyN(world, 48);
    const mroLots = listMarketLots(world).filter(
      (row) => row.lot.commodityId === 'mro_parts',
    );
    assert.equal(mroLots.length, 0);
  });

  it('quotes and delivers parts, draining terminal stock', () => {
    const world = createSeedEconomyWorld({ seed: 'mro-deliver' });
    const before = world.airports.find((a) => a.icao === 'SBGR')!.inventory
      .mro_parts!.stockKg;
    const requestedKg = mroKgForInspection('narrow_freighter');
    const quote = quoteMroParts(world, { icao: 'SBGR', requestedKg });
    assert.equal(quote.scarcity, 'ok');
    assert.ok(quote.partsCostUsd > 0);
    const delivered = deliverMroParts(world, quote);
    const after = world.airports.find((a) => a.icao === 'SBGR')!.inventory
      .mro_parts!.stockKg;
    assert.equal(delivered.fromTerminalKg, requestedKg);
    assert.equal(after, before - delivered.fromTerminalKg);
  });

  it('applies dry surcharge when terminal is empty', () => {
    const world = createSeedEconomyWorld({ seed: 'mro-dry' });
    const ap = world.airports.find((a) => a.icao === 'SBPS')!;
    ap.inventory.mro_parts!.stockKg = 0;
    const quote = quoteMroParts(world, {
      icao: 'SBPS',
      requestedKg: 100,
    });
    assert.equal(quote.scarcity, 'dry');
    assert.equal(quote.fromTerminalKg, 0);
    assert.equal(quote.partsCostUsd, 0);
    assert.equal(quote.laborSurcharge, 2.4);
    const delivered = deliverMroParts(world, quote);
    assert.equal(delivered.fromTerminalKg, 0);
    assert.equal(ap.inventory.mro_parts!.stockKg, 0);
  });
});
