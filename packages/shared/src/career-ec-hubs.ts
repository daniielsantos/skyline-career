/**
 * Ecuador career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { EC_DENSIFY_HUBS, EC_DENSIFY_HUB_COUNT } from './career-ec-hubs-densify.js';

export type EcCareerRegion = 'EC-C' | 'EC-S';

export type EcCareerHubDef = {
  icao: string;
  name: string;
  region: EcCareerRegion;
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

/**
 * 9 curated Ecuador hubs — Sierra/Costa norte + Sur costero.
 */
export const EC_CAREER_HUBS: readonly EcCareerHubDef[] = [
  // ── EC-C (5) ─────────────────────────────────────────────────────────────
  {
    icao: 'SEQU',
    name: 'Quito Mariscal Sucre',
    region: 'EC-C',
    hubTier: 'major',
    lat: -0.125,
    lon: -78.3575,
    produce: { general: 1.5, electronics: 1.25, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SELT',
    name: 'Latacunga Cotopaxi',
    region: 'EC-C',
    hubTier: 'spoke',
    lat: -0.9068,
    lon: -78.6158,
    ...drySpoke,
  },
  {
    icao: 'SETU',
    name: 'Tulcán Teniente Coronel Luis A. Mantilla',
    region: 'EC-C',
    hubTier: 'spoke',
    lat: 0.8095,
    lon: -77.7081,
    ...agroSpoke,
  },
  {
    icao: 'SEMT',
    name: 'Manta Eloy Alfaro',
    region: 'EC-C',
    hubTier: 'regional',
    lat: -0.9461,
    lon: -80.6788,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SEGS',
    name: 'Galápagos Baltra Seymour',
    region: 'EC-C',
    hubTier: 'regional',
    lat: -0.4538,
    lon: -90.2659,
    produce: { general: 0.95, supplies: 1.1 },
    consume: { perishables: 1.3, supplies: 1.25, electronics: 0.95 },
  },

  // ── EC-S (4) ─────────────────────────────────────────────────────────────
  {
    icao: 'SEGU',
    name: 'Guayaquil José Joaquín de Olmedo',
    region: 'EC-S',
    hubTier: 'major',
    lat: -2.1574,
    lon: -79.8836,
    produce: { general: 1.5, perishables: 1.25, machinery: 1.1 },
    consume: { electronics: 1.1, perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'SECU',
    name: 'Cuenca Mariscal Lamar',
    region: 'EC-S',
    hubTier: 'regional',
    lat: -2.8895,
    lon: -78.9844,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SERO',
    name: 'Santa Rosa',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -3.4418,
    lon: -79.9969,
    ...agroSpoke,
  },
  {
    icao: 'SESA',
    name: 'Salinas General Ulpiano Paez',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -2.2042,
    lon: -80.9889,
    ...agroSpoke,
  },
  ...EC_DENSIFY_HUBS,
];

export const EC_CAREER_HUB_COUNT = 9 + EC_DENSIFY_HUB_COUNT;

export function buildEcFeederCorridors(
  hubs: readonly EcCareerHubDef[] = EC_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertEcCareerHubCatalog(): void {
  if (EC_CAREER_HUBS.length !== EC_CAREER_HUB_COUNT) {
    throw new Error(
      `EC_CAREER_HUBS length ${EC_CAREER_HUBS.length} !== ${EC_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of EC_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate EC hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<EcCareerRegion, number> = {
    'EC-C': 8,
    'EC-S': 12,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `EC region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
