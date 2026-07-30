import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  continuousEconomyHours,
  createSeedEconomyWorld,
  ensureEconomyCaughtUp,
  listMarketLots,
  localPriceMultiplier,
  migrateEconomyWorld,
  MS_PER_TICK,
  routeDistanceNm,
  tickEconomyN,
} from './career-economy.js';

describe('career-economy seed', () => {
  it('creates 20 Brazilian hubs and 5 commodities of inventory', () => {
    const world = createSeedEconomyWorld({ seed: 'test-a' });
    assert.equal(world.version, 3);
    assert.ok(typeof world.lastBatchAtMs === 'number');
    assert.ok(Array.isArray(world.events));
    assert.equal(world.airports.length, 20);
    assert.ok(world.airports.every((airport) => airport.icao.startsWith('SB')));
    assert.deepEqual(
      new Set(world.airports.map((airport) => airport.region)),
      new Set(['BR-S', 'BR-SE', 'BR-NE']),
    );
    assert.equal(world.tick, 0);
    assert.equal(world.lots.length, 0);
    assert.equal(world.npcs.length, 10);
    assert.equal(world.npcFlights.length, 0);
    for (const ap of world.airports) {
      assert.ok(ap.inventory.electronics);
      assert.ok(ap.inventory.perishables);
      assert.ok(ap.inventory.machinery);
      assert.ok(ap.inventory.general);
      assert.ok(ap.inventory.fuel);
      assert.ok(ap.baseProduction?.electronics !== undefined);
      assert.ok(ap.baseProduction?.fuel !== undefined);
      assert.ok(Number.isFinite(ap.lat));
      assert.ok(Number.isFinite(ap.lon));
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

describe('routeDistanceNm', () => {
  it('calculates route distance from seeded airport coordinates', () => {
    const world = createSeedEconomyWorld({ seed: 'distance-test' });
    const distance = routeDistanceNm(world, 'SBGR', 'SBGL');
    assert.ok(distance !== undefined);
    assert.ok(distance > 150 && distance < 250, `got ${distance} nm`);
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
      assert.ok(
        row.originFillPct + 0.05 >= row.destFillPct,
        `${row.lot.reason} originFill=${row.originFillPct} destFill=${row.destFillPct}`,
      );
    }
  });

  it('keeps lots stable across identical seeds', () => {
    const a = createSeedEconomyWorld({ seed: 'same' });
    const b = createSeedEconomyWorld({ seed: 'same' });
    a.lastBatchAtMs = 1;
    b.lastBatchAtMs = 1;
    tickEconomyN(a, 10, { fromBatchAtMs: 1 });
    tickEconomyN(b, 10, { fromBatchAtMs: 1 });
    assert.equal(a.lots.length, b.lots.length);
    assert.deepEqual(
      a.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
      b.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
    );
  });
  it('spawns small LTL lots (400–2000 kg) alongside larger freight', () => {
    const world = createSeedEconomyWorld({ seed: 'ltl-lots' });
    tickEconomyN(world, 48);
    const market = listMarketLots(world);
    assert.ok(market.length > 0);
    const small = market.filter(
      (row) =>
        row.lot.quantityKg >= 400 &&
        row.lot.quantityKg <= 2_000 &&
        /LTL/i.test(row.lot.reason),
    );
    const large = market.filter((row) => row.lot.quantityKg >= 4_000);
    assert.ok(small.length > 0, 'expected LTL lots for light turboprop fills');
    assert.ok(large.length > 0, 'expected large lots to remain');
    for (const row of small) {
      assert.ok(row.lot.quantityKg <= 2_000);
      assert.ok(row.lot.quantityKg >= 400);
    }
  });
});

describe('migrateEconomyWorld / ensureEconomyCaughtUp', () => {
  it('migrates v1 without retroactive catch-up', () => {
    const v1 = {
      version: 1 as const,
      seed: 'legacy',
      tick: 12,
      airports: createSeedEconomyWorld({ seed: 'legacy' }).airports,
      lots: [],
    };
    const now = 1_700_000_000_000;
    const migrated = migrateEconomyWorld(v1, { nowMs: now });
    assert.equal(migrated.version, 3);
    assert.equal(migrated.tick, 12);
    assert.equal(migrated.lastBatchAtMs, now);
    assert.ok(migrated.airports[0]?.baseProduction);
  });

  it('migrates v2 tick timestamps to wall-clock ms', () => {
    const seeded = createSeedEconomyWorld({ seed: 'v2-ms' });
    const anchor = 1_700_000_000_000;
    const raw = {
      version: 2 as const,
      seed: 'v2-ms',
      tick: 100,
      lastSyncedAtMs: anchor,
      airports: seeded.airports,
      lots: [],
      events: [],
      npcs: seeded.npcs,
      npcFlights: [
        {
          id: 'f1',
          npcId: seeded.npcs[0]!.id,
          lotId: 'lot1',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general' as const,
          cargoKg: 5_000,
          payUsd: 1000,
          aircraftClassId: 'narrow_freighter' as const,
          departedAtTick: 98,
          arrivesAtTick: 102,
          status: 'in_flight' as const,
        },
      ],
    };
    const migrated = migrateEconomyWorld(raw, { nowMs: anchor });
    assert.equal(migrated.version, 3);
    assert.equal(migrated.lastBatchAtMs, anchor);
    const flight = migrated.npcFlights[0]!;
    assert.equal(flight.departedAtMs, anchor - 2 * MS_PER_TICK);
    assert.equal(flight.arrivesAtMs, anchor + 2 * MS_PER_TICK);
  });

  it('catches up whole hours 1:1 and preserves partial hour', () => {
    const world = createSeedEconomyWorld({ seed: 'catch-up' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    world.tick = 0;
    const threeHoursPlus = start + 3 * MS_PER_TICK + 1_800_000; // +3h 30m
    const { advancedTicks } = ensureEconomyCaughtUp(world, threeHoursPlus);
    assert.equal(advancedTicks, 3);
    assert.equal(world.tick, 3);
    assert.equal(world.lastBatchAtMs, threeHoursPlus - 1_800_000);
  });

  it('returns 0 when less than one hour elapsed', () => {
    const world = createSeedEconomyWorld({ seed: 'partial' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    const before = world.tick;
    const { advancedTicks } = ensureEconomyCaughtUp(world, start + 59 * 60 * 1000);
    assert.equal(advancedTicks, 0);
    assert.equal(world.tick, before);
  });

  it('exposes continuous fractional hours between batches', () => {
    const world = createSeedEconomyWorld({ seed: 'frac' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    world.tick = 10;
    const half = continuousEconomyHours(world, start + MS_PER_TICK / 2);
    assert.ok(Math.abs(half - 10.5) < 1e-9);
  });
});
