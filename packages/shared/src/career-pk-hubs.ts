/**
 * Pakistan career hub catalog — Asia-1 Indus / Arabian Sea face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PkCareerRegion = 'PK-N' | 'PK-S';

export type PkCareerHubDef = {
  icao: string;
  name: string;
  region: PkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const punjab = {
  produce: { general: 1.2, perishables: 1.2, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Pakistan hubs. Islamabad is OPIS (not OPRN); Karachi is OPKC. */
export const PK_CAREER_HUBS: readonly PkCareerHubDef[] = [
  {
    icao: 'OPIS',
    name: 'Islamabad International',
    region: 'PK-N',
    hubTier: 'major',
    lat: 33.549,
    lon: 72.8257,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OPLA',
    name: 'Lahore Allama Iqbal',
    region: 'PK-N',
    hubTier: 'regional',
    lat: 31.5216,
    lon: 74.4036,
    produce: { general: 1.35, perishables: 1.25, machinery: 1.15 },
    consume: { electronics: 1.05, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'OPPS',
    name: 'Peshawar Bacha Khan',
    region: 'PK-N',
    hubTier: 'spoke',
    lat: 33.9939,
    lon: 71.5146,
    ...punjab,
  },
  {
    icao: 'OPKC',
    name: 'Karachi Jinnah',
    region: 'PK-S',
    hubTier: 'major',
    lat: 24.9065,
    lon: 67.1608,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'OPQT',
    name: 'Quetta International',
    region: 'PK-S',
    hubTier: 'regional',
    lat: 30.2514,
    lon: 66.9378,
    produce: { machinery: 1.2, general: 1.2, supplies: 1.1 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
  {
    icao: 'OPMT',
    name: 'Multan International',
    region: 'PK-S',
    hubTier: 'spoke',
    lat: 30.2032,
    lon: 71.4191,
    ...punjab,
  },
];

export const PK_CAREER_HUB_COUNT = 6;

export function buildPkFeederCorridors(
  hubs: readonly PkCareerHubDef[] = PK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPkCareerHubCatalog(): void {
  if (PK_CAREER_HUBS.length !== PK_CAREER_HUB_COUNT) {
    throw new Error(
      `PK_CAREER_HUBS length ${PK_CAREER_HUBS.length} !== ${PK_CAREER_HUB_COUNT}`,
    );
  }
  if (!PK_CAREER_HUBS.some((h) => h.icao === 'OPIS' && h.hubTier === 'major')) {
    throw new Error('PK catalog must include major OPIS (Islamabad)');
  }
  if (!PK_CAREER_HUBS.some((h) => h.icao === 'OPKC' && h.hubTier === 'major')) {
    throw new Error('PK catalog must include major OPKC (Karachi Jinnah)');
  }
  if (!PK_CAREER_HUBS.some((h) => h.icao === 'OPLA')) {
    throw new Error('PK catalog must include OPLA Lahore');
  }
}
