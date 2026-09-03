/**
 * Venezuela career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { VE_DENSIFY_HUBS, VE_DENSIFY_HUB_COUNT } from './career-ve-hubs-densify.js';

export type VeCareerRegion = 'VE-C' | 'VE-W';

export type VeCareerHubDef = {
  icao: string;
  name: string;
  region: VeCareerRegion;
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
 * 13 curated Venezuela hubs — Centro-este + Occidente.
 */
export const VE_CAREER_HUBS: readonly VeCareerHubDef[] = [
  // ── VE-C (7) ─────────────────────────────────────────────────────────────
  {
    icao: 'SVMI',
    name: 'Maiquetía Simón Bolívar',
    region: 'VE-C',
    hubTier: 'major',
    lat: 10.6012,
    lon: -66.9912,
    produce: { general: 1.5, electronics: 1.25, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SVVA',
    name: 'Valencia Arturo Michelena',
    region: 'VE-C',
    hubTier: 'regional',
    lat: 10.1497,
    lon: -67.9284,
    produce: { machinery: 1.25, general: 1.15, electronics: 1.05 },
    consume: { perishables: 1.05, supplies: 0.95 },
  },
  {
    icao: 'SVBC',
    name: 'Barcelona General José Antonio Anzoátegui',
    region: 'VE-C',
    hubTier: 'regional',
    lat: 10.1111,
    lon: -64.6892,
    produce: { general: 1.2, machinery: 1.1, perishables: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SVMT',
    name: 'Maturin Jose Tadeo Monagas',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 9.749,
    lon: -63.1534,
    ...agroSpoke,
  },
  {
    icao: 'SVMG',
    name: 'Margarita Del Caribe Santiago Mariño',
    region: 'VE-C',
    hubTier: 'regional',
    lat: 10.9126,
    lon: -63.9666,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.1 },
    consume: { electronics: 1.0, perishables: 1.15 },
  },
  {
    icao: 'SVPR',
    name: 'Puerto Ordaz Manuel Carlos Piar',
    region: 'VE-C',
    hubTier: 'regional',
    lat: 8.2885,
    lon: -62.7604,
    produce: { machinery: 1.3, general: 1.15, electronics: 1.05 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SVCS',
    name: 'Charallave Óscar Machado Zuloaga',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 10.2867,
    lon: -66.8161,
    ...drySpoke,
  },

  // ── VE-W (6) ─────────────────────────────────────────────────────────────
  {
    icao: 'SVMC',
    name: 'Maracaibo La Chinita',
    region: 'VE-W',
    hubTier: 'major',
    lat: 10.5582,
    lon: -71.7278,
    produce: { machinery: 1.3, general: 1.2, electronics: 1.05 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'SVBM',
    name: 'Barquisimeto Jacinto Lara',
    region: 'VE-W',
    hubTier: 'regional',
    lat: 10.0427,
    lon: -69.3586,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SVSO',
    name: 'Santo Domingo Mayor Buenaventura Vivas',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 7.5651,
    lon: -72.0351,
    ...miningSpoke,
  },
  {
    icao: 'SVSA',
    name: 'San Antonio del Táchira',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 7.8408,
    lon: -72.4397,
    ...drySpoke,
  },
  {
    icao: 'SVSP',
    name: 'San Felipe Subteniente Nestor Arias',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 10.2789,
    lon: -68.7552,
    ...agroSpoke,
  },
  {
    icao: 'SVSR',
    name: 'San Fernando de Apure',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 7.8833,
    lon: -67.444,
    ...agroSpoke,
  },
  ...VE_DENSIFY_HUBS,
];

export const VE_CAREER_HUB_COUNT = 13 + VE_DENSIFY_HUB_COUNT;

export function buildVeFeederCorridors(
  hubs: readonly VeCareerHubDef[] = VE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertVeCareerHubCatalog(): void {
  if (VE_CAREER_HUBS.length !== VE_CAREER_HUB_COUNT) {
    throw new Error(
      `VE_CAREER_HUBS length ${VE_CAREER_HUBS.length} !== ${VE_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of VE_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate VE hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<VeCareerRegion, number> = {
    'VE-C': 20,
    'VE-W': 11,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `VE region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
