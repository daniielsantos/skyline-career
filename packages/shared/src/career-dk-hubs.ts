/**
 * Denmark career hub catalog — EU-2 Nordics + Alps + IE.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type DkCareerRegion = 'DK-E' | 'DK-W';

export type DkCareerHubDef = {
  icao: string;
  name: string;
  region: DkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const agro = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Denmark hubs. */
export const DK_CAREER_HUBS: readonly DkCareerHubDef[] = [
  {
    icao: 'EKCH',
    name: 'Copenhagen Kastrup',
    region: 'DK-E',
    hubTier: 'major',
    lat: 55.6179,
    lon: 12.656,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EKRN',
    name: 'Bornholm',
    region: 'DK-E',
    hubTier: 'spoke',
    lat: 55.0633,
    lon: 14.7596,
    ...agro,
  },
  {
    icao: 'EKBI',
    name: 'Billund',
    region: 'DK-W',
    hubTier: 'regional',
    lat: 55.7403,
    lon: 9.15178,
    produce: { general: 1.25, perishables: 1.15, electronics: 1.1 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'EKYT',
    name: 'Aalborg',
    region: 'DK-W',
    hubTier: 'regional',
    lat: 57.0928,
    lon: 9.84916,
    produce: { machinery: 1.2, general: 1.2, electronics: 1.05 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'EKAH',
    name: 'Aarhus',
    region: 'DK-W',
    hubTier: 'spoke',
    lat: 56.3,
    lon: 10.619,
    ...agro,
  },
];

export const DK_CAREER_HUB_COUNT = 5;

export function buildDkFeederCorridors(
  hubs: readonly DkCareerHubDef[] = DK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertDkCareerHubCatalog(): void {
  if (DK_CAREER_HUBS.length !== DK_CAREER_HUB_COUNT) {
    throw new Error(
      `DK_CAREER_HUBS length ${DK_CAREER_HUBS.length} !== ${DK_CAREER_HUB_COUNT}`,
    );
  }
  if (!DK_CAREER_HUBS.some((h) => h.icao === 'EKCH' && h.hubTier === 'major')) {
    throw new Error('DK catalog must include major EKCH');
  }
}
