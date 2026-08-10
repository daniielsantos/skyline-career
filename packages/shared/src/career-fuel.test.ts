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
    // Trip-only strips run a frozen cargo economy (no production/stock) by design.
    for (const ap of world.airports.filter((a) => !a.bushTripOnly)) {
      assert.ok(ap.inventory.fuel, `${ap.icao} missing fuel`);
      assert.ok((ap.inventory.fuel?.capacityKg ?? 0) > 0);
      assert.ok((ap.baseProduction?.fuel ?? 0) > 0);
    }
    assert.ok((world.airports.find((a) => a.icao === 'SBGR')!.inventory.fuel!.capacityKg) >= 400_000);
  });

  it('treats US majors as Jet-A production hubs (not draining spokes)', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-us-hubs' });
    const usFuelHubs = [
      'KMIA',
      'KATL',
      'KJFK',
      'KORD',
      'KIAH',
      'KDFW',
      'KDEN',
      'KLAX',
      'KSEA',
    ];
    for (const icao of usFuelHubs) {
      const ap = world.airports.find((a) => a.icao === icao)!;
      assert.ok(ap, `${icao} missing`);
      assert.ok(
        (ap.inventory.fuel?.capacityKg ?? 0) >= 400_000,
        `${icao} should have hub fuel capacity`,
      );
      assert.ok(
        (ap.baseProduction?.fuel ?? 0) > (ap.baseConsumption?.fuel ?? 0),
        `${icao} should net-produce Jet-A`,
      );
    }
    // Spoke in a fuel-hub region stays a consumer spoke.
    const fll = world.airports.find((a) => a.icao === 'KFLL')!;
    assert.ok((fll.inventory.fuel?.capacityKg ?? 0) < 200_000);
    assert.ok((fll.baseConsumption?.fuel ?? 0) > (fll.baseProduction?.fuel ?? 0));
  });

  it('promotes legacy US majors from spoke fuel rates on migrate', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-us-promote' });
    const miami = world.airports.find((a) => a.icao === 'KMIA')!;
    // Simulate pre-fix spoke seed still sitting on a save.
    miami.inventory.fuel = {
      stockKg: 1_100,
      capacityKg: 120_000,
    };
    miami.baseProduction = { ...miami.baseProduction, fuel: 800 };
    miami.baseConsumption = { ...miami.baseConsumption, fuel: 1_500 };
    miami.production = { ...miami.production, fuel: 800 };
    miami.consumption = { ...miami.consumption, fuel: 1_500 };

    const migrated = migrateEconomyWorld(world);
    ensureWorldFuelInventory(migrated);
    const fixed = migrated.airports.find((a) => a.icao === 'KMIA')!;
    assert.ok((fixed.inventory.fuel?.capacityKg ?? 0) >= 400_000);
    assert.equal(fixed.baseProduction?.fuel, 2_000);
    assert.equal(fixed.baseConsumption?.fuel, 750);
    assert.equal(fixed.production.fuel, 2_000);
    assert.equal(fixed.consumption.fuel, 750);
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
    const uplift = deliverFuelUplift(world, quote);
    assert.equal(uplift.deliveredKg, quote.requestedKg);
    assert.equal(ap.inventory.fuel!.stockKg, 0);
  });
});
