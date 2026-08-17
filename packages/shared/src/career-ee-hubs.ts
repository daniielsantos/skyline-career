/**
 * Estonia career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type EeCareerRegion = 'EE-C';

export type EeCareerHubDef = {
  icao: string;
  name: string;
  region: EeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Estonia hubs. */
export const EE_CAREER_HUBS: readonly EeCareerHubDef[] = [
  {
    icao: 'EETN',
    name: 'Tallinn Lennart Meri',
    region: 'EE-C',
    hubTier: 'major',
    lat: 59.4133,
    lon: 24.8328,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'EETU',
    name: 'Tartu',
    region: 'EE-C',
    hubTier: 'spoke',
    lat: 58.3075,
    lon: 26.6904,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'EEPU',
    name: 'Parnu',
    region: 'EE-C',
    hubTier: 'spoke',
    lat: 58.419,
    lon: 24.4728,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const EE_CAREER_HUB_COUNT = 3;

export function buildEeFeederCorridors(
  hubs: readonly EeCareerHubDef[] = EE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertEeCareerHubCatalog(): void {
  if (EE_CAREER_HUBS.length !== EE_CAREER_HUB_COUNT) {
    throw new Error(
      `EE_CAREER_HUBS length ${EE_CAREER_HUBS.length} !== ${EE_CAREER_HUB_COUNT}`,
    );
  }
  if (!EE_CAREER_HUBS.some((h) => h.icao === 'EETN' && h.hubTier === 'major')) {
    throw new Error('EE catalog must include major EETN');
  }
}
