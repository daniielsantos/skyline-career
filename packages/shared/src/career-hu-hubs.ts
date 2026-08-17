/**
 * Hungary career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type HuCareerRegion = 'HU-C';

export type HuCareerHubDef = {
  icao: string;
  name: string;
  region: HuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const agro = {
  produce: { perishables: 1.4, general: 1.15, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Hungary hubs. */
export const HU_CAREER_HUBS: readonly HuCareerHubDef[] = [
  {
    icao: 'LHBP',
    name: 'Budapest Ferenc Liszt',
    region: 'HU-C',
    hubTier: 'major',
    lat: 47.4298,
    lon: 19.2611,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'LHDC',
    name: 'Debrecen',
    region: 'HU-C',
    hubTier: 'regional',
    lat: 47.4889,
    lon: 21.6153,
    produce: { general: 1.25, perishables: 1.2, machinery: 1.1 },
    consume: { electronics: 1.0, supplies: 1.0 },
  },
  {
    icao: 'LHSM',
    name: 'Heviz Balaton',
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 46.6864,
    lon: 17.1591,
    ...agro,
  },
  {
    icao: 'LHPR',
    name: 'Gyor Per',
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 47.6283,
    lon: 17.8136,
    produce: { machinery: 1.2, general: 1.15, electronics: 1.05 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'LHNY',
    name: 'Nyiregyhaza',
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 47.984,
    lon: 21.6923,
    ...agro,
  },
];

export const HU_CAREER_HUB_COUNT = 5;

export function buildHuFeederCorridors(
  hubs: readonly HuCareerHubDef[] = HU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertHuCareerHubCatalog(): void {
  if (HU_CAREER_HUBS.length !== HU_CAREER_HUB_COUNT) {
    throw new Error(
      `HU_CAREER_HUBS length ${HU_CAREER_HUBS.length} !== ${HU_CAREER_HUB_COUNT}`,
    );
  }
  if (!HU_CAREER_HUBS.some((h) => h.icao === 'LHBP' && h.hubTier === 'major')) {
    throw new Error('HU catalog must include major LHBP');
  }
}
