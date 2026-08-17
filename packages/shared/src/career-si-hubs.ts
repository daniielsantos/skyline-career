/**
 * Slovenia career hub catalog — EU-4 Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SiCareerRegion = 'SI-C';

export type SiCareerHubDef = {
  icao: string;
  name: string;
  region: SiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Slovenia hubs. */
export const SI_CAREER_HUBS: readonly SiCareerHubDef[] = [
  {
    icao: 'LJLJ',
    name: 'Ljubljana Joze Pucnik',
    region: 'SI-C',
    hubTier: 'major',
    lat: 46.2237,
    lon: 14.4576,
    produce: { electronics: 1.25, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.1, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LJMB',
    name: 'Maribor',
    region: 'SI-C',
    hubTier: 'spoke',
    lat: 46.4799,
    lon: 15.6861,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const SI_CAREER_HUB_COUNT = 2;

export function buildSiFeederCorridors(
  hubs: readonly SiCareerHubDef[] = SI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSiCareerHubCatalog(): void {
  if (SI_CAREER_HUBS.length !== SI_CAREER_HUB_COUNT) {
    throw new Error(
      `SI_CAREER_HUBS length ${SI_CAREER_HUBS.length} !== ${SI_CAREER_HUB_COUNT}`,
    );
  }
  if (!SI_CAREER_HUBS.some((h) => h.icao === 'LJLJ' && h.hubTier === 'major')) {
    throw new Error('SI catalog must include major LJLJ');
  }
}
