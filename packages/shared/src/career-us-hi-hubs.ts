/**
 * Hawaii US career hubs (region US-HI under country US).
 *
 * Honolulu cargo major is PHNL (not Hickam PHIK / Kalaeloa PHJR).
 * Neighbor islands are the scheduled commercial fields.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';

export type UsHiCareerHubDef = {
  icao: string;
  name: string;
  region: 'US-HI';
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const drySpoke = {
  produce: { general: 1.05, supplies: 1.0, perishables: 1.15 },
  consume: { electronics: 0.85, machinery: 0.8, fuel: 0.95 },
} as const;

const dryRegional = {
  produce: { general: 1.2, supplies: 1.1, perishables: 1.2 },
  consume: { electronics: 0.95, machinery: 0.9, fuel: 1.05 },
} as const;

/** Scheduled Hawaii hubs — domestic US region US-HI. Honolulu seaport pickup is PHNL. */
export const US_HI_CAREER_HUBS: readonly UsHiCareerHubDef[] = [
  {
    icao: 'PHNL',
    name: 'Honolulu Daniel K Inouye',
    region: 'US-HI',
    hubTier: 'major',
    lat: 21.3184,
    lon: -157.9257,
    produce: { general: 1.4, perishables: 1.25, electronics: 1.15 },
    consume: { machinery: 1.1, supplies: 1.15, fuel: 1.25 },
  },
  {
    icao: 'PHHN',
    name: 'Hana',
    region: 'US-HI',
    hubTier: 'spoke',
    lat: 20.7956,
    lon: -156.014,
    ...drySpoke,
  },
  {
    icao: 'PHJH',
    name: 'Kapalua',
    region: 'US-HI',
    hubTier: 'spoke',
    lat: 20.9629,
    lon: -156.673,
    ...drySpoke,
  },
  {
    icao: 'PHKO',
    name: 'Kona',
    region: 'US-HI',
    hubTier: 'regional',
    lat: 19.7388,
    lon: -156.0456,
    ...dryRegional,
  },
  {
    icao: 'PHLI',
    name: 'Lihue',
    region: 'US-HI',
    hubTier: 'regional',
    lat: 21.9744,
    lon: -159.3371,
    ...dryRegional,
  },
  {
    icao: 'PHMK',
    name: 'Molokai',
    region: 'US-HI',
    hubTier: 'spoke',
    lat: 21.1529,
    lon: -157.096,
    ...drySpoke,
  },
  {
    icao: 'PHMU',
    name: 'Waimea Kohala',
    region: 'US-HI',
    hubTier: 'spoke',
    lat: 20.0013,
    lon: -155.668,
    ...drySpoke,
  },
  {
    icao: 'PHNY',
    name: 'Lanai',
    region: 'US-HI',
    hubTier: 'spoke',
    lat: 20.7857,
    lon: -156.9513,
    ...drySpoke,
  },
  {
    icao: 'PHOG',
    name: 'Kahului',
    region: 'US-HI',
    hubTier: 'regional',
    lat: 20.8963,
    lon: -156.4318,
    ...dryRegional,
  },
  {
    icao: 'PHTO',
    name: 'Hilo',
    region: 'US-HI',
    hubTier: 'spoke',
    lat: 19.7214,
    lon: -155.0454,
    ...drySpoke,
  },
];

export const US_HI_CAREER_HUB_COUNT = 10;

export function assertUsHiCareerHubCatalog(): void {
  if (US_HI_CAREER_HUBS.length !== US_HI_CAREER_HUB_COUNT) {
    throw new Error(
      `US_HI_CAREER_HUBS length ${US_HI_CAREER_HUBS.length} !== ${US_HI_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of US_HI_CAREER_HUBS) {
    if (h.region !== 'US-HI') {
      throw new Error(`${h.icao} must use region US-HI`);
    }
  }
  if (!US_HI_CAREER_HUBS.some((h) => h.icao === 'PHNL' && h.hubTier === 'major')) {
    throw new Error('US-HI catalog must include major PHNL (Honolulu)');
  }
  for (const icao of ['PHOG', 'PHKO', 'PHLI', 'PHTO']) {
    if (!US_HI_CAREER_HUBS.some((h) => h.icao === icao)) {
      throw new Error(`US-HI catalog must include ${icao}`);
    }
  }
  if (US_HI_CAREER_HUBS.some((h) => h.icao === 'PHIK' || h.icao === 'PHJR')) {
    throw new Error('US-HI catalog must not seed Hickam or Kalaeloa');
  }
}
