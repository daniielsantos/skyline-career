/**
 * India career hub catalog — Asia-2 west + Asia-3 south/east faces.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type InCareerRegion = 'IN-N' | 'IN-W' | 'IN-S' | 'IN-E';

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

/** 16 curated India hubs. Bengaluru is VOBL (not VOBG); Hyderabad is VOHS (not VOHY). */
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
  {
    icao: 'VOBL',
    name: 'Bengaluru Kempegowda',
    region: 'IN-S',
    hubTier: 'major',
    lat: 13.1979,
    lon: 77.7063,
    produce: { electronics: 1.5, general: 1.45, machinery: 1.3 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.1 },
  },
  {
    icao: 'VOMM',
    name: 'Chennai International',
    region: 'IN-S',
    hubTier: 'major',
    lat: 12.99,
    lon: 80.1693,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'VOHS',
    name: 'Hyderabad Rajiv Gandhi',
    region: 'IN-S',
    hubTier: 'regional',
    lat: 17.2313,
    lon: 78.4299,
    produce: { electronics: 1.35, general: 1.3, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'VOCI',
    name: 'Cochin International',
    region: 'IN-S',
    hubTier: 'spoke',
    lat: 10.151,
    lon: 76.4008,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'VECC',
    name: 'Kolkata Netaji Subhas Chandra Bose',
    region: 'IN-E',
    hubTier: 'major',
    lat: 22.654,
    lon: 88.4477,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'VEGT',
    name: 'Guwahati Lokpriya Gopinath Bordoloi',
    region: 'IN-E',
    hubTier: 'regional',
    lat: 26.1067,
    lon: 91.5852,
    produce: { general: 1.25, perishables: 1.2, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'VEBS',
    name: 'Bhubaneswar Biju Patnaik',
    region: 'IN-E',
    hubTier: 'spoke',
    lat: 20.251,
    lon: 85.8147,
    ...inland,
  },
  {
    icao: 'VEPT',
    name: 'Patna Jay Prakash Narayan',
    region: 'IN-E',
    hubTier: 'spoke',
    lat: 25.5913,
    lon: 85.088,
    ...inland,
  },
];

export const IN_CAREER_HUB_COUNT = 16;

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
  if (!IN_CAREER_HUBS.some((h) => h.icao === 'VOBL' && h.hubTier === 'major')) {
    throw new Error('IN catalog must include major VOBL (Bengaluru)');
  }
  if (!IN_CAREER_HUBS.some((h) => h.icao === 'VOMM' && h.hubTier === 'major')) {
    throw new Error('IN catalog must include major VOMM (Chennai)');
  }
  if (!IN_CAREER_HUBS.some((h) => h.icao === 'VECC' && h.hubTier === 'major')) {
    throw new Error('IN catalog must include major VECC (Kolkata)');
  }
  if (
    IN_CAREER_HUBS.some(
      (h) => h.icao === 'VOBG' || h.icao === 'VOHY' || h.icao === 'VOML',
    )
  ) {
    throw new Error('IN catalog must not use VOBG HAL, VOHY Begumpet, or VOML Mangalore as hubs');
  }
}
