/**
 * Morocco career hub catalog — MENA-1 Mediterranean face.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MaCareerRegion = 'MA-N' | 'MA-C' | 'MA-S';

export type MaCareerHubDef = {
  icao: string;
  name: string;
  region: MaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const city = {
  produce: { general: 1.2, electronics: 1.05, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.1, general: 1.0, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agri = {
  produce: { perishables: 1.3, general: 1.15, supplies: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 7 curated Morocco hubs. */
export const MA_CAREER_HUBS: readonly MaCareerHubDef[] = [
  {
    icao: 'GMTT',
    name: 'Tangier Ibn Battouta',
    region: 'MA-N',
    hubTier: 'regional',
    lat: 35.7269,
    lon: -5.9169,
    produce: { general: 1.3, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'GMFF',
    name: 'Fes Saiss',
    region: 'MA-N',
    hubTier: 'spoke',
    lat: 33.9273,
    lon: -4.978,
    ...city,
  },
  {
    icao: 'GMME',
    name: 'Rabat Sale',
    region: 'MA-N',
    hubTier: 'spoke',
    lat: 34.0515,
    lon: -6.7515,
    produce: { general: 1.2, electronics: 1.1, supplies: 1.05 },
    consume: { perishables: 1.1, machinery: 0.95 },
  },
  {
    icao: 'GMFO',
    name: 'Oujda Angads',
    region: 'MA-N',
    hubTier: 'spoke',
    lat: 34.7872,
    lon: -1.924,
    ...agri,
  },
  {
    icao: 'GMMN',
    name: 'Casablanca Mohammed V',
    region: 'MA-C',
    hubTier: 'major',
    lat: 33.3675,
    lon: -7.59,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'GMMX',
    name: 'Marrakech Menara',
    region: 'MA-C',
    hubTier: 'regional',
    lat: 31.6069,
    lon: -8.0363,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'GMAD',
    name: 'Agadir Al Massira',
    region: 'MA-S',
    hubTier: 'regional',
    lat: 30.325,
    lon: -9.4131,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const MA_CAREER_HUB_COUNT = 7;

export function buildMaFeederCorridors(
  hubs: readonly MaCareerHubDef[] = MA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMaCareerHubCatalog(): void {
  if (MA_CAREER_HUBS.length !== MA_CAREER_HUB_COUNT) {
    throw new Error(
      `MA_CAREER_HUBS length ${MA_CAREER_HUBS.length} !== ${MA_CAREER_HUB_COUNT}`,
    );
  }
  if (!MA_CAREER_HUBS.some((h) => h.icao === 'GMMN' && h.hubTier === 'major')) {
    throw new Error('MA catalog must include major GMMN');
  }
  if (MA_CAREER_HUBS.some((h) => h.icao === 'GMFI')) {
    throw new Error('MA catalog must use GMFF for Fes, not GMFI');
  }
}
