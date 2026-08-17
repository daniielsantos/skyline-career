/**
 * Guam US career hubs (region US-GU under country US).
 *
 * Guam cargo major is PGUM Won Pat (not Andersen PGUA).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';

export type UsGuCareerHubDef = {
  icao: string;
  name: string;
  region: 'US-GU';
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Guam hub — domestic US region US-GU. Apra Harbor pickup is PGUM. */
export const US_GU_CAREER_HUBS: readonly UsGuCareerHubDef[] = [
  {
    icao: 'PGUM',
    name: 'Guam Antonio B Won Pat',
    region: 'US-GU',
    hubTier: 'major',
    lat: 13.485,
    lon: 144.7973,
    produce: { general: 1.35, electronics: 1.15, supplies: 1.15 },
    consume: { perishables: 1.2, machinery: 1.05, fuel: 1.25 },
  },
];

export const US_GU_CAREER_HUB_COUNT = 1;

export function assertUsGuCareerHubCatalog(): void {
  if (US_GU_CAREER_HUBS.length !== US_GU_CAREER_HUB_COUNT) {
    throw new Error(
      `US_GU_CAREER_HUBS length ${US_GU_CAREER_HUBS.length} !== ${US_GU_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of US_GU_CAREER_HUBS) {
    if (h.region !== 'US-GU') {
      throw new Error(`${h.icao} must use region US-GU`);
    }
  }
  if (!US_GU_CAREER_HUBS.some((h) => h.icao === 'PGUM' && h.hubTier === 'major')) {
    throw new Error('US-GU catalog must include major PGUM (Won Pat)');
  }
  if (US_GU_CAREER_HUBS.some((h) => ['PGUA', 'PGSN'].includes(h.icao))) {
    throw new Error('US-GU catalog must not seed Andersen or Saipan');
  }
}
