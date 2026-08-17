/**
 * India west career hub catalog — Asia-2 Arabian Sea / Indus face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type InCareerRegion = 'IN-N' | 'IN-W';

export type InCareerHubDef = {
  icao: string;
  name: string;
  region: InCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const inland = {
  produce: { general: 1.2, perishables: 1.2, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 8 curated west-India hubs. Delhi is VIDP; Mumbai is VABB; Goa is VOGO (not VOGA). */
export const IN_CAREER_HUBS: readonly InCareerHubDef[] = [
  {
    icao: 'VIDP',
    name: 'Delhi Indira Gandhi',
    region: 'IN-N',
    hubTier: 'major',
    lat: 28.5556,
    lon: 77.0952,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.1 },
  },
  {
    icao: 'VIAR',
    name: 'Amritsar Sri Guru Ram Das Ji',
    region: 'IN-N',
    hubTier: 'regional',
    lat: 31.7096,
    lon: 74.7973,
    produce: { general: 1.3, perishables: 1.25, supplies: 1.15 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.1 },
  },
  {
    icao: 'VIJP',
    name: 'Jaipur International',
    region: 'IN-N',
    hubTier: 'spoke',
    lat: 26.8242,
    lon: 75.8122,
    ...inland,
  },
  {
    icao: 'VIJO',
    name: 'Jodhpur',
    region: 'IN-N',
    hubTier: 'spoke',
    lat: 26.2511,
    lon: 73.0489,
    ...inland,
  },
  {
    icao: 'VABB',
    name: 'Mumbai Chhatrapati Shivaji',
    region: 'IN-W',
    hubTier: 'major',
    lat: 19.0887,
    lon: 72.8679,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, fuel: 1.2 },
  },
  {
    icao: 'VAAH',
    name: 'Ahmedabad Sardar Vallabhbhai Patel',
    region: 'IN-W',
    hubTier: 'regional',
    lat: 23.0772,
    lon: 72.6347,
    produce: { machinery: 1.3, general: 1.3, electronics: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'VAPO',
    name: 'Pune International',
    region: 'IN-W',
    hubTier: 'spoke',
    lat: 18.5821,
    lon: 73.9197,
    ...inland,
  },
  {
    icao: 'VOGO',
    name: 'Goa Dabolim',
    region: 'IN-W',
    hubTier: 'spoke',
    lat: 15.3801,
    lon: 73.8333,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const IN_CAREER_HUB_COUNT = 8;

export function buildInFeederCorridors(
  hubs: readonly InCareerHubDef[] = IN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertInCareerHubCatalog(): void {
  if (IN_CAREER_HUBS.length !== IN_CAREER_HUB_COUNT) {
    throw new Error(
      `IN_CAREER_HUBS length ${IN_CAREER_HUBS.length} !== ${IN_CAREER_HUB_COUNT}`,
    );
  }
  if (!IN_CAREER_HUBS.some((h) => h.icao === 'VIDP' && h.hubTier === 'major')) {
    throw new Error('IN catalog must include major VIDP (Delhi)');
  }
  if (!IN_CAREER_HUBS.some((h) => h.icao === 'VABB' && h.hubTier === 'major')) {
    throw new Error('IN catalog must include major VABB (Mumbai)');
  }
  if (!IN_CAREER_HUBS.some((h) => h.icao === 'VOGO')) {
    throw new Error('IN catalog must include VOGO Goa Dabolim (not VOGA Mopa)');
  }
  if (IN_CAREER_HUBS.some((h) => h.icao === 'VOGA' || h.icao === 'VIDD')) {
    throw new Error('IN catalog must not use VOGA Mopa or VIDD Safdarjung');
  }
}
