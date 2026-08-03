import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  ensureSeedMarketFormed,
  tickEconomyN,
} from './career-economy.js';
import { computeEconomyPulse, median } from './career-economy-pulse.js';
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
  });

  it('returns zeros when no available lots', () => {
    const world = createSeedEconomyWorld({ seed: 'pulse-empty' });
    world.lots = [];
    const pulse = computeEconomyPulse(world);
    assert.equal(pulse.availableLots, 0);
    assert.equal(pulse.intlSharePct, 0);
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
    const world = createSeedEconomyWorld({ seed: 'pulse-intl' }) as CareerEconomyWorld;
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
    const intl = pulse.countries.find((c) => c.countryId === 'INTL');
    assert.ok(intl);
    assert.equal(intl!.availableLots, 1);
    assert.ok(intl!.payPerKgP50 !== null);
    assert.equal(intl!.payPerKgP50, 2);
  });
});
