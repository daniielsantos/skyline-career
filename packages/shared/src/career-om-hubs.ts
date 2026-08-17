/**
 * Oman career hub catalog — MENA-2 Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type OmCareerRegion = 'OM-N' | 'OM-S';

export type OmCareerHubDef = {
  icao: string;
  name: string;
  region: OmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const northCoast = {
  produce: { general: 1.2, supplies: 1.1, perishables: 1.15 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 4 curated Oman hubs. */
export const OM_CAREER_HUBS: readonly OmCareerHubDef[] = [
  {
    icao: 'OOMS',
    name: 'Muscat International',
    region: 'OM-N',
    hubTier: 'major',
    lat: 23.5933,
    lon: 58.2844,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'OOSH',
    name: 'Sohar',
    region: 'OM-N',
    hubTier: 'regional',
    lat: 24.386,
    lon: 56.6254,
    produce: { machinery: 1.25, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.05, electronics: 0.95, fuel: 1.1 },
  },
  {
    icao: 'OOKB',
    name: 'Khasab',
    region: 'OM-N',
    hubTier: 'spoke',
    lat: 26.171,
    lon: 56.2406,
    ...northCoast,
  },
  {
    icao: 'OOSA',
    name: 'Salalah',
    region: 'OM-S',
    hubTier: 'regional',
    lat: 17.0387,
    lon: 54.0913,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const OM_CAREER_HUB_COUNT = 4;

export function buildOmFeederCorridors(
  hubs: readonly OmCareerHubDef[] = OM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertOmCareerHubCatalog(): void {
  if (OM_CAREER_HUBS.length !== OM_CAREER_HUB_COUNT) {
    throw new Error(
      `OM_CAREER_HUBS length ${OM_CAREER_HUBS.length} !== ${OM_CAREER_HUB_COUNT}`,
    );
  }
  if (!OM_CAREER_HUBS.some((h) => h.icao === 'OOMS' && h.hubTier === 'major')) {
    throw new Error('OM catalog must include major OOMS');
  }
  if (!OM_CAREER_HUBS.some((h) => h.icao === 'OOSA')) {
    throw new Error('OM catalog must include OOSA Salalah');
  }
}
