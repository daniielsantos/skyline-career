/**
 * American Samoa US career hubs (region US-AS under country US).
 *
 * Pago Pago cargo major is NSTU.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';

export type UsAsCareerHubDef = {
  icao: string;
  name: string;
  region: 'US-AS';
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated American Samoa hub — domestic US region US-AS. Pago Pago pickup is NSTU. */
export const US_AS_CAREER_HUBS: readonly UsAsCareerHubDef[] = [
  {
    icao: 'NSTU',
    name: 'Pago Pago International',
    region: 'US-AS',
    hubTier: 'major',
    lat: -14.331,
    lon: -170.71,
    produce: { perishables: 1.25, general: 1.3, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
];

export const US_AS_CAREER_HUB_COUNT = 1;

export function assertUsAsCareerHubCatalog(): void {
  if (US_AS_CAREER_HUBS.length !== US_AS_CAREER_HUB_COUNT) {
    throw new Error(
      `US_AS_CAREER_HUBS length ${US_AS_CAREER_HUBS.length} !== ${US_AS_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of US_AS_CAREER_HUBS) {
    if (h.region !== 'US-AS') {
      throw new Error(`${h.icao} must use region US-AS`);
    }
  }
  if (!US_AS_CAREER_HUBS.some((h) => h.icao === 'NSTU' && h.hubTier === 'major')) {
    throw new Error('US-AS catalog must include major NSTU (Pago Pago)');
  }
}
