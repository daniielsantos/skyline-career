/**
 * Northern Mariana Islands US career hubs (region US-MP under country US).
 *
 * Saipan cargo major is PGSN (not Guam PGUM / Andersen PGUA).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';

export type UsMpCareerHubDef = {
  icao: string;
  name: string;
  region: 'US-MP';
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated CNMI hub — domestic US region US-MP. Saipan pickup is PGSN. */
export const US_MP_CAREER_HUBS: readonly UsMpCareerHubDef[] = [
  {
    icao: 'PGSN',
    name: 'Saipan International',
    region: 'US-MP',
    hubTier: 'major',
    lat: 15.119,
    lon: 145.7293,
    produce: { general: 1.3, electronics: 1.1, supplies: 1.15 },
    consume: { perishables: 1.15, machinery: 1.0, fuel: 1.2 },
  },
];

export const US_MP_CAREER_HUB_COUNT = 1;

export function assertUsMpCareerHubCatalog(): void {
  if (US_MP_CAREER_HUBS.length !== US_MP_CAREER_HUB_COUNT) {
    throw new Error(
      `US_MP_CAREER_HUBS length ${US_MP_CAREER_HUBS.length} !== ${US_MP_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of US_MP_CAREER_HUBS) {
    if (h.region !== 'US-MP') {
      throw new Error(`${h.icao} must use region US-MP`);
    }
  }
  if (!US_MP_CAREER_HUBS.some((h) => h.icao === 'PGSN' && h.hubTier === 'major')) {
    throw new Error('US-MP catalog must include major PGSN (Saipan)');
  }
}
