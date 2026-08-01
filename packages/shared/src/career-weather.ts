/**
 * Simulated regional weather index for Career economy.
 * One fair|marginal|poor value per region per sim-day — scales with regions, never NPCs.
 */

import { TICKS_PER_DAY } from './career-clock.js';
import type { CareerEconomyWorld } from './types/career-economy.js';

export type RegionalWeather = 'fair' | 'marginal' | 'poor';

export type RegionWeatherView = {
  region: string;
  weather: RegionalWeather;
  /** Sim-day index = floor(tick / TICKS_PER_DAY). */
  day: number;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function economyDayIndex(tick: number): number {
  return Math.max(0, Math.floor(tick / TICKS_PER_DAY));
}

/**
 * Deterministic regional weather for a sim-day.
 * Mild seasonal bias: NE/N more often fair; S/SE slightly worse in winter wave; CO in between.
 */
export function regionalWeatherIndex(
  world: Pick<CareerEconomyWorld, 'seed' | 'tick'>,
  region: string,
  tick = world.tick,
): RegionalWeather {
  const day = economyDayIndex(tick);
  const rng = mulberry32(hashSeed(`${world.seed}:wx:${region}:${day}`));
  const roll = rng();
  // day-of-year style wave from tick (96 ticks ≈ 1 day).
  const season = Math.sin((2 * Math.PI * (tick / TICKS_PER_DAY)) / 365);
  let fairCut = 0.55;
  let poorCut = 0.88;
  if (region === 'BR-NE' || region === 'BR-N') {
    // Tropical / equatorial: more often fair; mild wet-season wave.
    fairCut += season * 0.08;
    poorCut += season * 0.04;
  } else if (region === 'BR-S' || region === 'BR-SE') {
    fairCut -= season * 0.06;
    poorCut -= season * 0.05;
  } else if (region === 'BR-CO') {
    // Center-West: dry winters / wet summers — between SE and NE.
    fairCut += season * 0.04;
    poorCut -= season * 0.03;
  }
  fairCut = Math.min(0.72, Math.max(0.4, fairCut));
  poorCut = Math.min(0.95, Math.max(fairCut + 0.12, poorCut));

  if (roll < fairCut) return 'fair';
  if (roll < poorCut) return 'marginal';
  return 'poor';
}

/** Worse of two regional indexes (poor > marginal > fair). */
export function worseWeather(a: RegionalWeather, b: RegionalWeather): RegionalWeather {
  const rank = { fair: 0, marginal: 1, poor: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/** Freight pay multiplier when weather is bad on the lane. */
export function regionalWeatherPayMult(weather: RegionalWeather): number {
  if (weather === 'poor') return 1.12;
  if (weather === 'marginal') return 1.05;
  return 1;
}

/** Shortens lot life under poor weather (cargo more time-sensitive). */
export function regionalWeatherLifeMult(weather: RegionalWeather): number {
  if (weather === 'poor') return 0.85;
  if (weather === 'marginal') return 0.95;
  return 1;
}

/** NPC bid appetite: crews fly less when home region weather is poor. */
export function regionalWeatherBidMult(weather: RegionalWeather): number {
  if (weather === 'poor') return 0.72;
  if (weather === 'marginal') return 0.88;
  return 1;
}

export function listRegionalWeather(
  world: CareerEconomyWorld,
  tick = world.tick,
): RegionWeatherView[] {
  const regions = [
    ...new Set([
      ...(world.airports ?? []).map((a) => a.region),
      ...(world.npcs ?? []).map((n) => n.homeRegion),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const day = economyDayIndex(tick);
  return regions.map((region) => ({
    region,
    weather: regionalWeatherIndex(world, region, tick),
    day,
  }));
}
