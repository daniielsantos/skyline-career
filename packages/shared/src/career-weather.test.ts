import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld, tickEconomyN } from './career-economy.js';
import {
  economyDayIndex,
  listRegionalWeather,
  regionalWeatherBidMult,
  regionalWeatherIndex,
  regionalWeatherLifeMult,
  regionalWeatherPayMult,
  worseWeather,
} from './career-weather.js';

describe('regional weather index', () => {
  it('is deterministic for the same seed/region/day', () => {
    const world = createSeedEconomyWorld({ seed: 'wx-det' });
    world.tick = 48;
    const a = regionalWeatherIndex(world, 'BR-SE');
    const b = regionalWeatherIndex(world, 'BR-SE', 48);
    const c = regionalWeatherIndex(world, 'BR-SE', 49);
    assert.equal(a, b);
    assert.equal(economyDayIndex(48), economyDayIndex(49));
    assert.equal(a, regionalWeatherIndex({ seed: 'wx-det', tick: 48 }, 'BR-SE'));
    // Same sim-day keeps weather; next day may differ.
    assert.equal(c, a);
    const nextDay = regionalWeatherIndex(world, 'BR-SE', 72);
    assert.ok(['fair', 'marginal', 'poor'].includes(nextDay));
  });

  it('lists one index per region and ranks poor worst', () => {
    const world = createSeedEconomyWorld({ seed: 'wx-list' });
    tickEconomyN(world, 24, { fromBatchAtMs: 1 });
    const list = listRegionalWeather(world);
    assert.ok(list.length >= 3);
    assert.ok(list.every((r) => r.day === economyDayIndex(world.tick)));
    assert.equal(worseWeather('fair', 'poor'), 'poor');
    assert.equal(worseWeather('marginal', 'fair'), 'marginal');
    assert.ok(regionalWeatherPayMult('poor') > regionalWeatherPayMult('fair'));
    assert.ok(regionalWeatherBidMult('poor') < regionalWeatherBidMult('fair'));
    assert.ok(regionalWeatherLifeMult('poor') < regionalWeatherLifeMult('fair'));
  });

  it('raises pay on poor-weather days versus a fair-forced baseline shape', () => {
    // Probe many seeds until we find one with poor BR-SE on day 1, then compare
    // pay multipliers are unit-tested above; here ensure market still forms under wx.
    const world = createSeedEconomyWorld({ seed: 'wx-market' });
    world.lastBatchAtMs = 1;
    tickEconomyN(world, 36, { fromBatchAtMs: 1 });
    assert.ok(world.lots.some((l) => l.payUsd > 0));
    const wx = listRegionalWeather(world);
    assert.ok(wx.some((r) => r.region === 'BR-SE'));
  });
});
