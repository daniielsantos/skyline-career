/**
 * Egypt career hub catalog — MENA-1 Mediterranean face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type EgCareerRegion = 'EG-N' | 'EG-S' | 'EG-R';

export type EgCareerHubDef = {
  icao: string;
  name: string;
  region: EgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const nile = {
  produce: { perishables: 1.25, general: 1.15, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const redSea = {
  produce: { perishables: 1.3, general: 1.2, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9, fuel: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Egypt hubs. Alexandria is HEBA (Borg El Arab), not HEAX. */
export const EG_CAREER_HUBS: readonly EgCareerHubDef[] = [
  {
    icao: 'HECA',
    name: 'Cairo International',
    region: 'EG-N',
    hubTier: 'major',
    lat: 30.1219,
    lon: 31.4056,
    produce: { electronics: 1.45, general: 1.5, machinery: 1.25 },
    consume: { perishables: 1.25, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'HEBA',
    name: 'Alexandria Borg El Arab',
    region: 'EG-N',
    hubTier: 'regional',
    lat: 30.9177,
    lon: 29.6964,
    produce: { general: 1.3, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'HELX',
    name: 'Luxor',
    region: 'EG-S',
    hubTier: 'spoke',
    lat: 25.671,
    lon: 32.7066,
    ...nile,
  },
  {
    icao: 'HESN',
    name: 'Aswan',
    region: 'EG-S',
    hubTier: 'spoke',
    lat: 23.9644,
    lon: 32.82,
    ...nile,
  },
  {
    icao: 'HESH',
    name: 'Sharm El Sheikh',
    region: 'EG-R',
    hubTier: 'regional',
    lat: 27.9773,
    lon: 34.395,
    ...redSea,
  },
  {
    icao: 'HEGN',
    name: 'Hurghada',
    region: 'EG-R',
    hubTier: 'regional',
    lat: 27.1783,
    lon: 33.7994,
    ...redSea,
  },
];

export const EG_CAREER_HUB_COUNT = 6;

export function buildEgFeederCorridors(
  hubs: readonly EgCareerHubDef[] = EG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertEgCareerHubCatalog(): void {
  if (EG_CAREER_HUBS.length !== EG_CAREER_HUB_COUNT) {
    throw new Error(
      `EG_CAREER_HUBS length ${EG_CAREER_HUBS.length} !== ${EG_CAREER_HUB_COUNT}`,
    );
  }
  if (!EG_CAREER_HUBS.some((h) => h.icao === 'HECA' && h.hubTier === 'major')) {
    throw new Error('EG catalog must include major HECA');
  }
  if (!EG_CAREER_HUBS.some((h) => h.icao === 'HEBA' && h.hubTier === 'regional')) {
    throw new Error('EG catalog must include regional HEBA (not HEAX)');
  }
  if (EG_CAREER_HUBS.some((h) => h.icao === 'HEAX')) {
    throw new Error('EG catalog must use HEBA for Alexandria, not HEAX');
  }
}
