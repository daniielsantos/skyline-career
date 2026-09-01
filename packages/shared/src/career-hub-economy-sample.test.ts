import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHubEconomySampleForAirport,
  buildHubEconomySamples,
  maybeQueueHubEconomyDaySample,
} from './career-hub-economy-sample.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  HubEconomySample,
  ShipmentLot,
} from './types/career-economy.js';

function makeAirport(overrides: Partial<AirportTerminal> = {}): AirportTerminal {
  const base: AirportTerminal = {
    icao: 'SBGR',
    name: 'Guarulhos',
    region: 'BR-SE',
    hubTier: 'major',
    lat: -23.4,
    lon: -46.4,
    level: 2,
    activityScore: 40,
    inventory: {
      general: { stockKg: 25_000, capacityKg: 50_000 },
      electronics: { stockKg: 5_000, capacityKg: 20_000 },
      fuel: { stockKg: 40_000, capacityKg: 80_000 },
    },
    production: {},
    consumption: {},
  };
  return { ...base, ...overrides };
}

function makeWorld(
  overrides: Partial<CareerEconomyWorld> = {},
): CareerEconomyWorld {
  const base: CareerEconomyWorld = {
    version: 3,
    seed: 'hub-stats-test',
    tick: 96,
    lastBatchAtMs: Date.now(),
    airports: [makeAirport()],
    lots: [],
    events: [],
    npcs: [],
    npcFlights: [],
  };
  return { ...base, ...overrides };
}

function makeLot(overrides: Partial<ShipmentLot> = {}): ShipmentLot {
  const base: ShipmentLot = {
    id: 'lot-1',
    originIcao: 'SBGR',
    destIcao: 'SBSP',
    commodityId: 'general',
    quantityKg: 400,
    reservedKg: 0,
    payUsd: 2_000,
    basePayUsd: 2_000,
    urgency: 'normal',
    reason: 'test',
    status: 'available',
    createdAtTick: 1,
    expiresAtTick: 200,
  };
  return { ...base, ...overrides };
}

describe('buildHubEconomySamples', () => {
  it('snapshots fill, spot, outbound bands, and jet-a', () => {
    const world = makeWorld({
      lots: [
        makeLot({ id: 'ga', quantityKg: 400, payUsd: 1_000 }),
        makeLot({ id: 'tp', quantityKg: 1_200, payUsd: 3_000 }),
        makeLot({ id: 'med', quantityKg: 5_000, payUsd: 8_000 }),
      ],
    });
    const sample = buildHubEconomySampleForAirport(
      world,
      world.airports[0]!,
      world.lots.filter((l) => l.originIcao === 'SBGR'),
    );
    assert.ok(sample);
    assert.equal(sample.icao, 'SBGR');
    assert.equal(sample.dayIndex, 1);
    assert.equal(sample.outboundLots, 3);
    assert.equal(sample.kgGa, 400);
    assert.equal(sample.kgTp, 1_200);
    assert.equal(sample.kgMedium, 5_000);
    assert.ok(sample.payP50Usd != null);
    assert.equal(sample.countryId, 'BR');
    assert.equal(sample.hubTier, 'major');
    assert.ok(sample.cargoCapacityKg > 0);
    assert.equal(sample.lotsGa, 1);
    assert.equal(sample.lotsTp, 1);
    assert.equal(sample.lotsMedium, 1);
    assert.ok(sample.jetAFill > 0.4 && sample.jetAFill < 0.6);
    const general = sample.commodities.find((c) => c.id === 'general');
    assert.ok(general);
    assert.equal(general.fill, 0.5);
    assert.ok(general.spotUsd > 0);
  });

  it('skips bushTripOnly hubs', () => {
    const world = makeWorld({
      airports: [makeAirport({ icao: 'SBSN', bushTripOnly: true })],
    });
    assert.equal(buildHubEconomySamples(world).length, 0);
  });
});

describe('maybeQueueHubEconomyDaySample', () => {
  it('queues samples only on day boundary', () => {
    const world = makeWorld({ tick: 95, airports: [makeAirport()] });
    maybeQueueHubEconomyDaySample(world);
    assert.equal(world.pendingHubEconomySamples, undefined);

    world.tick = 96;
    maybeQueueHubEconomyDaySample(world);
    const pending: HubEconomySample[] = world.pendingHubEconomySamples ?? [];
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.dayIndex, 1);

    const before = pending.length;
    maybeQueueHubEconomyDaySample(world);
    assert.equal((world.pendingHubEconomySamples ?? []).length, before);
  });

  it('queues again on the next day', () => {
    const world = makeWorld({ tick: 96 });
    maybeQueueHubEconomyDaySample(world);
    assert.equal(world.pendingHubEconomySamples?.length, 1);

    world.tick = 192;
    maybeQueueHubEconomyDaySample(world);
    assert.equal(world.pendingHubEconomySamples?.length, 2);
    assert.equal(world.pendingHubEconomySamples?.[1]?.dayIndex, 2);
  });
});
