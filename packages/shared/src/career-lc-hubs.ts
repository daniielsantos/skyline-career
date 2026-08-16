/**
 * Saint Lucia career hub catalog — intl-first light chain.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LcCareerRegion = 'LC-C';

export type LcCareerHubDef = {
  icao: string;
  name: string;
  region: LcCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated St Lucia hubs — Hewanorra + George F. L. Charles. */
export const LC_CAREER_HUBS: readonly LcCareerHubDef[] = [
  {
    icao: 'TLPL',
    name: 'Vieux Fort Hewanorra',
    region: 'LC-C',
    hubTier: 'major',
    lat: 13.7332,
    lon: -60.9526,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TLPC',
    name: 'Castries George F. L. Charles',
    region: 'LC-C',
    hubTier: 'regional',
    lat: 14.0202,
    lon: -60.9929,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const LC_CAREER_HUB_COUNT = 2;

export function buildLcFeederCorridors(
  hubs: readonly LcCareerHubDef[] = LC_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLcCareerHubCatalog(): void {
  if (LC_CAREER_HUBS.length !== LC_CAREER_HUB_COUNT) {
    throw new Error(
      `LC_CAREER_HUBS length ${LC_CAREER_HUBS.length} !== ${LC_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of LC_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate LC hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
  }
}
