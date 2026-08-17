/**
 * Moldova career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MdCareerRegion = 'MD-C';

export type MdCareerHubDef = {
  icao: string;
  name: string;
  region: MdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Moldova hubs. */
export const MD_CAREER_HUBS: readonly MdCareerHubDef[] = [
  {
    icao: 'LUKK',
    name: 'Chisinau',
    region: 'MD-C',
    hubTier: 'major',
    lat: 46.9277,
    lon: 28.931,
    produce: { electronics: 1.2, general: 1.3, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LUBM',
    name: 'Balti',
    region: 'MD-C',
    hubTier: 'spoke',
    lat: 47.8384,
    lon: 27.7815,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
];

export const MD_CAREER_HUB_COUNT = 2;

export function buildMdFeederCorridors(
  hubs: readonly MdCareerHubDef[] = MD_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMdCareerHubCatalog(): void {
  if (MD_CAREER_HUBS.length !== MD_CAREER_HUB_COUNT) {
    throw new Error(
      `MD_CAREER_HUBS length ${MD_CAREER_HUBS.length} !== ${MD_CAREER_HUB_COUNT}`,
    );
  }
  if (!MD_CAREER_HUBS.some((h) => h.icao === 'LUKK' && h.hubTier === 'major')) {
    throw new Error('MD catalog must include major LUKK');
  }
}
