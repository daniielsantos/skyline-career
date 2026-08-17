/**
 * Thailand career hub catalog — Asia-10 Gulf of Thailand / Andaman face.
 *
 * Suvarnabhumi is VTBS (IATA BKK). Don Mueang is VTBD, not the cargo major.
 * Military VTPI Takhli / VTBK Kamphaeng Saen omitted. Betong VTSY is not Bhutan.
 * Vietnam / Malaysia / Singapore deferred to later South-East slices.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ThCareerRegion = 'TH-C' | 'TH-N' | 'TH-S';

export type ThCareerHubDef = {
  icao: string;
  name: string;
  region: ThCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 8 curated Thailand hubs. U-Tapao VTBU is the Laem Chabang port pickup. */
export const TH_CAREER_HUBS: readonly ThCareerHubDef[] = [
  {
    icao: 'VTBS',
    name: 'Bangkok Suvarnabhumi',
    region: 'TH-C',
    hubTier: 'major',
    lat: 13.6811,
    lon: 100.747,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'VTBD',
    name: 'Bangkok Don Mueang',
    region: 'TH-C',
    hubTier: 'regional',
    lat: 13.9126,
    lon: 100.607,
    produce: { general: 1.3, electronics: 1.15, supplies: 1.1 },
    consume: { perishables: 1.15, machinery: 1.0, fuel: 1.1 },
  },
  {
    icao: 'VTBU',
    name: 'U-Tapao Rayong Pattaya',
    region: 'TH-C',
    hubTier: 'regional',
    lat: 12.6799,
    lon: 101.005,
    produce: { machinery: 1.35, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 1.0, fuel: 1.15 },
  },
  {
    icao: 'VTCC',
    name: 'Chiang Mai International',
    region: 'TH-N',
    hubTier: 'regional',
    lat: 18.7668,
    lon: 98.9626,
    produce: { perishables: 1.3, general: 1.3, electronics: 1.1 },
    consume: { machinery: 1.05, supplies: 1.1, fuel: 1.2 },
  },
  {
    icao: 'VTCT',
    name: 'Chiang Rai Mae Fah Luang',
    region: 'TH-N',
    hubTier: 'regional',
    lat: 19.9523,
    lon: 99.8829,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'VTUK',
    name: 'Khon Kaen',
    region: 'TH-N',
    hubTier: 'regional',
    lat: 16.4666,
    lon: 102.784,
    produce: { general: 1.25, machinery: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.05, fuel: 1.1 },
  },
  {
    icao: 'VTSP',
    name: 'Phuket International',
    region: 'TH-S',
    hubTier: 'regional',
    lat: 8.1133,
    lon: 98.3174,
    produce: { general: 1.35, electronics: 1.15, perishables: 1.15 },
    consume: { supplies: 1.15, machinery: 1.0, fuel: 1.2 },
  },
  {
    icao: 'VTSS',
    name: 'Hat Yai International',
    region: 'TH-S',
    hubTier: 'regional',
    lat: 6.9332,
    lon: 100.393,
    produce: { general: 1.25, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const TH_CAREER_HUB_COUNT = 8;

export function buildThFeederCorridors(
  hubs: readonly ThCareerHubDef[] = TH_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertThCareerHubCatalog(): void {
  if (TH_CAREER_HUBS.length !== TH_CAREER_HUB_COUNT) {
    throw new Error(
      `TH_CAREER_HUBS length ${TH_CAREER_HUBS.length} !== ${TH_CAREER_HUB_COUNT}`,
    );
  }
  if (!TH_CAREER_HUBS.some((h) => h.icao === 'VTBS' && h.hubTier === 'major')) {
    throw new Error('TH catalog must include major VTBS (Suvarnabhumi)');
  }
  if (!TH_CAREER_HUBS.some((h) => h.icao === 'VTBU')) {
    throw new Error('TH catalog must include VTBU U-Tapao (Laem Chabang pickup)');
  }
  if (!TH_CAREER_HUBS.some((h) => h.icao === 'VTSP')) {
    throw new Error('TH catalog must include VTSP Phuket (port pickup)');
  }
  if (TH_CAREER_HUBS.some((h) => ['VTPI', 'VTBK', 'VTSY'].includes(h.icao))) {
    throw new Error('TH catalog must not seed VTPI / VTBK / VTSY');
  }
}
