/**
 * Hawaii US career hubs (region US-HI under country US).
 *
 * Honolulu cargo major is PHNL (not Hickam PHIK / Kalaeloa PHJR). Kahului
 * PHOG deferred with the neighbor islands.
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

/** 1 curated Hawaii hub — domestic US region US-HI. Honolulu seaport pickup is PHNL. */
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
];

export const US_HI_CAREER_HUB_COUNT = 1;

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
  if (US_HI_CAREER_HUBS.some((h) => ['PHIK', 'PHJR', 'PHOG'].includes(h.icao))) {
    throw new Error('US-HI catalog must not seed Hickam, Kalaeloa, or Kahului');
  }
}
