/**
 * El Salvador career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SvCareerRegion = 'SV-C';

export type SvCareerHubDef = {
  icao: string;
  name: string;
  region: SvCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/**
 * 2 curated El Salvador hubs — only SimBrief-safe majors/regionals.
 * (Closed Santa Ana El Palmer MSSA deliberately omitted.)
 */
export const SV_CAREER_HUBS: readonly SvCareerHubDef[] = [
  {
    icao: 'MSLP',
    name: 'San Salvador Monsenor Oscar A. Romero',
    region: 'SV-C',
    hubTier: 'major',
    lat: 13.4409,
    lon: -89.0557,
    produce: { general: 1.4, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MSSS',
    name: 'San Salvador Ilopango',
    region: 'SV-C',
    hubTier: 'regional',
    lat: 13.6995,
    lon: -89.1199,
    produce: { general: 1.15, supplies: 1.1, perishables: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const SV_CAREER_HUB_COUNT = 2;

export function buildSvFeederCorridors(
  hubs: readonly SvCareerHubDef[] = SV_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSvCareerHubCatalog(): void {
  if (SV_CAREER_HUBS.length !== SV_CAREER_HUB_COUNT) {
    throw new Error(
      `SV_CAREER_HUBS length ${SV_CAREER_HUBS.length} !== ${SV_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of SV_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate SV hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['SV-C'] !== 2) {
    throw new Error(`SV-C has ${byRegion['SV-C'] ?? 0} hubs, expected 2`);
  }
}
