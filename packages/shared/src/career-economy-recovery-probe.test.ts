import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  injectEconomyEventForProbe,
  regionCommodityFillP50,
  runRecoveryProbe,
  buildNpcOnlySoakReport,
  snapshotDemandBacklog,
  soakGateNotes,
} from './career-economy-recovery-probe.js';
import { createSeedEconomyWorld, tickEconomyN } from './career-economy.js';
import { computeEconomyPulse } from './career-economy-pulse.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  EconomyEvent,
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
      electronics: { stockKg: 10_000, capacityKg: 20_000 },
      machinery: { stockKg: 8_000, capacityKg: 20_000 },
      fuel: { stockKg: 40_000, capacityKg: 80_000 },
    },
    production: {
      electronics: 500,
    },
    consumption: {
      electronics: 200,
    },
  };
  return { ...base, ...overrides };
}

function makeTinyWorld(
  overrides: Partial<CareerEconomyWorld> = {},
): CareerEconomyWorld {
  const base: CareerEconomyWorld = {
    version: 3,
    seed: 'recovery-probe-tiny',
    tick: 100,
    lastBatchAtMs: 1,
    homeCountryId: 'BR',
    airports: [
      makeAirport(),
      makeAirport({
        icao: 'SBSP',
        name: 'Congonhas',
        hubTier: 'regional',
        inventory: {
          general: { stockKg: 5_000, capacityKg: 20_000 },
          electronics: { stockKg: 2_000, capacityKg: 10_000 },
          fuel: { stockKg: 10_000, capacityKg: 20_000 },
        },
        production: {},
        consumption: { electronics: 400 },
      }),
      makeAirport({
        icao: 'SBSJ',
        name: 'Sao Jose',
        hubTier: 'spoke',
        inventory: {
          general: { stockKg: 1_000, capacityKg: 5_000 },
          electronics: { stockKg: 500, capacityKg: 4_000 },
          fuel: { stockKg: 2_000, capacityKg: 8_000 },
        },
        production: {},
        consumption: { electronics: 100 },
      }),
    ],
    lots: [],
    events: [],
    npcs: [],
    npcFlights: [],
    demandOrders: [],
  };
  return { ...base, ...overrides };
}

describe('recovery probe helpers', () => {
  it('injects a deterministic EconomyEvent', () => {
    const world = makeTinyWorld();
    const ev = injectEconomyEventForProbe(world, {
      kind: 'factory_outage',
      region: 'BR-SE',
      commodityId: 'electronics',
      durationTicks: 96,
      id: 'recovery_test_1',
    });
    assert.equal(ev.id, 'recovery_test_1');
    assert.equal(ev.kind, 'factory_outage');
    assert.equal(ev.region, 'BR-SE');
    assert.equal(ev.commodityId, 'electronics');
    assert.equal(ev.startsAtTick, 100);
    assert.equal(ev.endsAtTick, 196);
    assert.equal(world.events.length, 1);
    assert.equal((world.events[0] as EconomyEvent).id, 'recovery_test_1');
  });

  it('computes region commodity fill p50', () => {
    const world = makeTinyWorld();
    const fill = regionCommodityFillP50(world, 'BR-SE', 'electronics');
    assert.ok(fill !== null);
    // 10k/20k, 2k/10k, 500/4k → 0.5, 0.2, 0.125 → median 0.2
    assert.ok(Math.abs(fill! - 0.2) < 1e-9);
  });

  it('runs a short probe without throwing (tiny world)', () => {
    const world = makeTinyWorld();
    const report = runRecoveryProbe(world, {
      region: 'BR-SE',
      kind: 'factory_outage',
      commodityId: 'electronics',
      baselineTicks: 2,
      durationTicks: 4,
      stableTicks: 2,
      timeoutTicksAfterEnd: 8,
      sampleEvery: 2,
      fromBatchAtMs: 1,
      eventId: 'recovery_short',
    });
    assert.equal(report.eventId, 'recovery_short');
    assert.equal(report.region, 'BR-SE');
    assert.ok(report.elapsedTicks > 0);
    assert.ok(report.samples.length >= 2);
    // Tiny world may noEffect / timeout / recover — all valid measure outcomes.
    assert.ok(
      report.recovered || report.noEffect || report.timeout,
      'expected a terminal probe status',
    );
  });

  it('skipEventSpawn leaves event list without RNG spawns during probe window', () => {
    const world = makeTinyWorld();
    world.events = [];
    tickEconomyN(world, 24, { skipEventSpawn: true, fromBatchAtMs: 1 });
    assert.equal(world.events.length, 0);
  });
});

describe('npc-only soak stubs', () => {
  it('snapshots demand backlog and builds a short soak report on seed', () => {
    const world = createSeedEconomyWorld({ seed: 'soak-short' });
    world.lastBatchAtMs = 1;
    const before = snapshotDemandBacklog(world);
    assert.ok(before.openOrders >= 0);
    const report = buildNpcOnlySoakReport(world, {
      days: 0,
      everyDays: 1,
      nowMs: 1,
    });
    assert.equal(report.days, 0);
    assert.equal(report.sweep.sampleCount, 1);
    assert.ok(Array.isArray(report.gateNotes));
    assert.ok(report.notes.length >= 1);
  });

  it('soakGateNotes stay advisory on identical pulses', () => {
    const world = createSeedEconomyWorld({ seed: 'soak-gates' });
    const pulse = computeEconomyPulse(world, 1);
    const notes = soakGateNotes(pulse, pulse);
    assert.ok(notes.every((n) => n.level === 'ok' || n.signal === 'skuFillShape'));
  });
});
