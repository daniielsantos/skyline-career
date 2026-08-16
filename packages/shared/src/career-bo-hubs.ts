/**
 * Bolivia career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BoCareerRegion = 'BO-W' | 'BO-E';

export type BoCareerHubDef = {
  icao: string;
  name: string;
  region: BoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.8, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.4, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const miningSpoke = {
  produce: { machinery: 1.4, electronics: 1.05, general: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 9 curated Bolivia hubs — Altiplano oeste + Oriente.
 */
export const BO_CAREER_HUBS: readonly BoCareerHubDef[] = [
  // ── BO-W (5) ─────────────────────────────────────────────────────────────
  {
    icao: 'SLLP',
    name: 'El Alto / La Paz',
    region: 'BO-W',
    hubTier: 'major',
    lat: -16.5133,
    lon: -68.1923,
    produce: { general: 1.45, electronics: 1.2, machinery: 1.15 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.05 },
  },
  {
    icao: 'SLCB',
    name: 'Cochabamba Jorge Wilstermann',
    region: 'BO-W',
    hubTier: 'regional',
    lat: -17.4211,
    lon: -66.1771,
    produce: { machinery: 1.2, general: 1.15, perishables: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SLTJ',
    name: 'Tarija Capitan Oriel Lea Plaza',
    region: 'BO-W',
    hubTier: 'spoke',
    lat: -21.5557,
    lon: -64.7013,
    ...miningSpoke,
  },
  {
    icao: 'SLOR',
    name: 'Oruro Juan Mendoza',
    region: 'BO-W',
    hubTier: 'spoke',
    lat: -17.9625,
    lon: -67.0763,
    ...miningSpoke,
  },
  {
    icao: 'SLPO',
    name: 'Potosí Capitan Nicolas Rojas',
    region: 'BO-W',
    hubTier: 'spoke',
    lat: -19.5431,
    lon: -65.7237,
    ...miningSpoke,
  },

  // ── BO-E (4) ─────────────────────────────────────────────────────────────
  {
    icao: 'SLVR',
    name: 'Santa Cruz Viru Viru',
    region: 'BO-E',
    hubTier: 'major',
    lat: -17.6448,
    lon: -63.1354,
    produce: { general: 1.5, perishables: 1.25, machinery: 1.1 },
    consume: { electronics: 1.1, perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'SLTR',
    name: 'Trinidad Teniente Av. Jorge Henrich Arauz',
    region: 'BO-E',
    hubTier: 'regional',
    lat: -14.8186,
    lon: -64.9181,
    produce: { perishables: 1.3, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SLRI',
    name: 'Riberalta',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -11.0102,
    lon: -66.0731,
    ...agroSpoke,
  },
  {
    icao: 'SLET',
    name: 'Santa Cruz El Trompillo',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -17.8116,
    lon: -63.1715,
    ...drySpoke,
  },
];

export const BO_CAREER_HUB_COUNT = 9;

export function buildBoFeederCorridors(
  hubs: readonly BoCareerHubDef[] = BO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBoCareerHubCatalog(): void {
  if (BO_CAREER_HUBS.length !== BO_CAREER_HUB_COUNT) {
    throw new Error(
      `BO_CAREER_HUBS length ${BO_CAREER_HUBS.length} !== ${BO_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of BO_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate BO hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<BoCareerRegion, number> = {
    'BO-W': 5,
    'BO-E': 4,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `BO region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
