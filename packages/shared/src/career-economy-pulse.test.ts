import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  ensureSeedMarketFormed,
  tickEconomyN,
} from './career-economy.js';
import { computeEconomyPulse, mean, median, sweepEconomyPulse } from './career-economy-pulse.js';
import { TICKS_PER_DAY } from './career-clock.js';
import type { CareerEconomyWorld, ShipmentLot } from './types/career-economy.js';

describe('median', () => {
  it('returns null for empty', () => {
    assert.equal(median([]), null);
  });

  it('returns middle for odd length', () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it('averages middle pair for even length', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });
});

describe('mean', () => {
  it('returns null for empty', () => {
    assert.equal(mean([]), null);
  });

  it('averages values', () => {
    assert.equal(mean([1, 2, 3]), 2);
  });
});

describe('computeEconomyPulse', () => {
  it('reports BR, US, INTL after seed market forms', () => {
    const world = createSeedEconomyWorld({ seed: 'pulse-seed' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 24);

    const pulse = computeEconomyPulse(world);
    const ids = pulse.countries.map((c) => c.countryId);
    assert.ok(ids.includes('BR'));
    assert.ok(ids.includes('US'));
    assert.ok(ids.includes('INTL'));
    assert.equal(pulse.airportCount, world.airports.length);
    assert.equal(pulse.tick, world.tick);
    assert.ok(Array.isArray(pulse.notes));

    const sumLots = pulse.countries.reduce((n, c) => n + c.availableLots, 0);
    assert.equal(pulse.availableLots, sumLots);
    assert.ok(Number.isFinite(pulse.intlSharePct));
    assert.ok(pulse.intlSharePct >= 0 && pulse.intlSharePct <= 1);

    assert.ok(pulse.commodities.length >= 5);
    const commodityLots = pulse.commodities.reduce(
      (n, c) => n + c.availableLots,
      0,
    );
    assert.equal(commodityLots, pulse.availableLots);
    if (pulse.availableLots > 0) {
      assert.ok(pulse.payUsdP50 !== null);
      assert.ok(pulse.payUsdAvg !== null);
    }
    assert.equal(
      pulse.lotStatus.available +
        pulse.lotStatus.reserved +
        pulse.lotStatus.in_transit +
        pulse.lotStatus.expired +
        pulse.lotStatus.delivered +
        pulse.lotStatus.other,
      world.lots.length,
    );

    for (const c of pulse.countries) {
      assert.ok(Number.isFinite(c.availableLots));
      assert.ok(Number.isFinite(c.laneBusyPct));
      assert.ok(c.laneBusyPct >= 0 && c.laneBusyPct <= 1);
      if (c.countryId === 'INTL') {
        assert.equal(c.hubs, 0);
      } else {
        assert.ok(c.hubs > 0);
        assert.ok(c.liveHubPct >= 0 && c.liveHubPct <= 1);
        assert.ok(c.fillP50 === null || Number.isFinite(c.fillP50));
      }
      if (c.payPerKgP50 !== null) {
        assert.ok(Number.isFinite(c.payPerKgP50));
      }
    }

    assert.ok(pulse.npc);
    assert.equal(pulse.npc.fleetSize, world.npcs.length);
    assert.ok(pulse.npc.targetFleetSize > 0);
    assert.equal(
      pulse.npc.airborne +
        pulse.npc.idle +
        pulse.npc.resting +
        pulse.npc.maintenance +
        pulse.npc.turnaround,
      pulse.npc.fleetSize,
    );
    assert.ok(pulse.npc.readyPct >= 0 && pulse.npc.readyPct <= 1);
    assert.ok(pulse.npc.utilizationPct >= 0 && pulse.npc.utilizationPct <= 1);
    assert.ok(Array.isArray(pulse.npc.byRegion));
    assert.ok(Array.isArray(pulse.npc.byClass));
  });

  it('flags missing NPCs and empty home regions', () => {
    const world = createSeedEconomyWorld({ seed: 'pulse-npc-gap' });
    const kept = world.npcs.slice(0, 10);
    world.npcs = kept;
    world.npcFlights = [];
    const pulse = computeEconomyPulse(world);
    assert.equal(pulse.npc.fleetSize, 10);
    assert.ok(pulse.npc.fleetShortfall > 0);
    assert.ok(pulse.npc.emptyHomeRegions > 0);
    assert.ok(
      pulse.notes.some((n) => n.includes('NPC fleet short')),
    );
  });

  it('returns zeros when no available lots', () => {
    const world = createSeedEconomyWorld({ seed: 'pulse-empty' });
    world.lots = [];
    const pulse = computeEconomyPulse(world);
    assert.equal(pulse.availableLots, 0);
    assert.equal(pulse.intlSharePct, 0);
    assert.equal(pulse.payUsdP50, null);
    assert.equal(pulse.payUsdAvg, null);
    assert.equal(pulse.lotStatus.available, 0);
    for (const c of pulse.commodities) {
      assert.equal(c.availableLots, 0);
      assert.equal(c.payUsdP50, null);
      assert.equal(c.payUsdAvg, null);
    }
    for (const c of pulse.countries) {
      assert.equal(c.availableLots, 0);
      assert.equal(c.payPerKgP50, null);
      assert.equal(c.laneBusyPct, 0);
    }
    const br = pulse.countries.find((c) => c.countryId === 'BR');
    assert.ok(br);
    assert.equal(br!.deadHubs, br!.hubs);
    assert.equal(br!.liveHubPct, 0);
  });

  it('buckets cross-country lots as INTL', () => {
    const world = createSeedEconomyWorld({
      seed: 'pulse-intl',
    }) as CareerEconomyWorld;
    const br = world.airports.find((a) => a.icao.startsWith('SB'));
    const us = world.airports.find((a) => a.icao.startsWith('K'));
    assert.ok(br && us);
    const lot: ShipmentLot = {
      id: 'lot_pulse_intl',
      commodityId: 'general',
      originIcao: br!.icao,
      destIcao: us!.icao,
      quantityKg: 1000,
      reservedKg: 0,
      payUsd: 2000,
      urgency: 'normal',
      reason: 'pulse test intl',
      status: 'available',
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 48,
    };
    world.lots = [lot];
    const pulse = computeEconomyPulse(world);
    assert.equal(pulse.availableLots, 1);
    assert.equal(pulse.intlSharePct, 1);
    assert.equal(pulse.payUsdP50, 2000);
    assert.equal(pulse.payUsdAvg, 2000);
    assert.equal(pulse.lotStatus.available, 1);
    const general = pulse.commodities.find((c) => c.commodityId === 'general');
    assert.ok(general);
    assert.equal(general!.availableLots, 1);
    assert.equal(general!.payUsdP50, 2000);
    assert.equal(general!.payPerKgP50, 2);
    const intl = pulse.countries.find((c) => c.countryId === 'INTL');
    assert.ok(intl);
    assert.equal(intl!.availableLots, 1);
    assert.ok(intl!.payPerKgP50 !== null);
    assert.equal(intl!.payPerKgP50, 2);
  });

  it('counts reserved and surplus/shortage hubs', () => {
    const world = createSeedEconomyWorld({ seed: 'pulse-status' });
    ensureSeedMarketFormed(world);
    const ap = world.airports[0]!;
    const pile = ap.inventory.electronics;
    assert.ok(pile);
    pile.stockKg = pile.capacityKg;
    const empty = world.airports[1]!;
    const emptyPile = empty.inventory.electronics;
    assert.ok(emptyPile);
    emptyPile.stockKg = 0;

    world.lots = [
      {
        id: 'lot_avail',
        commodityId: 'electronics',
        originIcao: ap.icao,
        destIcao: empty.icao,
        quantityKg: 500,
        reservedKg: 0,
        payUsd: 900,
        urgency: 'normal',
        reason: 'pulse',
        status: 'available',
        createdAtTick: world.tick,
        expiresAtTick: world.tick + 48,
      },
      {
        id: 'lot_reserved',
        commodityId: 'electronics',
        originIcao: ap.icao,
        destIcao: empty.icao,
        quantityKg: 500,
        reservedKg: 500,
        payUsd: 800,
        urgency: 'normal',
        reason: 'pulse',
        status: 'reserved',
        createdAtTick: world.tick,
        expiresAtTick: world.tick + 48,
      },
      {
        id: 'lot_transit',
        commodityId: 'supplies',
        originIcao: ap.icao,
        destIcao: empty.icao,
        quantityKg: 400,
        reservedKg: 400,
        payUsd: 400,
        urgency: 'normal',
        reason: 'pulse',
        status: 'in_transit',
        createdAtTick: world.tick,
        expiresAtTick: world.tick + 48,
      },
    ];

    const pulse = computeEconomyPulse(world);
    assert.equal(pulse.lotStatus.available, 1);
    assert.equal(pulse.lotStatus.reserved, 1);
    assert.equal(pulse.lotStatus.in_transit, 1);
    assert.equal(pulse.availableLots, 1);
    const electronics = pulse.commodities.find(
      (c) => c.commodityId === 'electronics',
    );
    assert.ok(electronics);
    assert.equal(electronics!.availableLots, 1);
    assert.ok(electronics!.hubsSurplus >= 1);
    assert.ok(electronics!.hubsShortage >= 1);
  });
});

describe('sweepEconomyPulse', () => {
  it('advances ticks and reports start/end deltas', () => {
    const world = createSeedEconomyWorld({ seed: 'pulse-sweep' });
    ensureSeedMarketFormed(world);
    const start = world.tick;
    const report = sweepEconomyPulse(world, {
      ticks: TICKS_PER_DAY,
      every: TICKS_PER_DAY,
    });
    assert.equal(report.ticksAdvanced, TICKS_PER_DAY);
    assert.equal(report.sampleCount, 2);
    assert.equal(report.startTick, start);
    assert.equal(report.endTick, start + TICKS_PER_DAY);
    assert.equal(world.tick, start + TICKS_PER_DAY);
    assert.equal(report.first.tick, start);
    assert.equal(report.last.tick, start + TICKS_PER_DAY);
    assert.equal(
      report.delta.availableLots,
      report.last.availableLots - report.first.availableLots,
    );
    assert.equal(report.delta.commodities.length, report.last.commodities.length);
  });
});
