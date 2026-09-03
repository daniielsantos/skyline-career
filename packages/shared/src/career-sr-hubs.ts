/**
 * Suriname career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { SR_DENSIFY_HUBS, SR_DENSIFY_HUB_COUNT } from './career-sr-hubs-densify.js';

export type SrCareerRegion = 'SR-C';

export type SrCareerHubDef = {
  icao: string;
  name: string;
  region: SrCareerRegion;
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
 * 5 curated Suriname hubs — Paramaribo corridor + coastal/interior spokes.
 */
export const SR_CAREER_HUBS: readonly SrCareerHubDef[] = [
  // ── SR-C (5) ─────────────────────────────────────────────────────────────
  {
    icao: 'SMJP',
    name: 'Paramaribo Johan Adolf Pengel',
    region: 'SR-C',
    hubTier: 'major',
    lat: 5.4528,
    lon: -55.1878,
    produce: { general: 1.45, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SMZO',
    name: 'Paramaribo Zorg en Hoop',
    region: 'SR-C',
    hubTier: 'regional',
    lat: 5.8111,
    lon: -55.1908,
    produce: { general: 1.2, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SMMO',
    name: 'Moengo',
    region: 'SR-C',
    hubTier: 'spoke',
    lat: 5.6131,
    lon: -54.4003,
    ...agroSpoke,
  },
  {
    icao: 'SMNI',
    name: 'Nieuw Nickerie',
    region: 'SR-C',
    hubTier: 'spoke',
    lat: 5.9556,
    lon: -57.0394,
    ...agroSpoke,
  },
  {
    icao: 'SMWA',
    name: 'Wageningen',
    region: 'SR-C',
    hubTier: 'spoke',
    lat: 5.8417,
    lon: -56.6733,
    ...drySpoke,
  },
  ...SR_DENSIFY_HUBS,
];

export const SR_CAREER_HUB_COUNT = 5 + SR_DENSIFY_HUB_COUNT;

export function buildSrFeederCorridors(
  hubs: readonly SrCareerHubDef[] = SR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSrCareerHubCatalog(): void {
  if (SR_CAREER_HUBS.length !== SR_CAREER_HUB_COUNT) {
    throw new Error(
      `SR_CAREER_HUBS length ${SR_CAREER_HUBS.length} !== ${SR_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of SR_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate SR hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<SrCareerRegion, number> = {
    'SR-C': SR_CAREER_HUB_COUNT,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `SR region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
