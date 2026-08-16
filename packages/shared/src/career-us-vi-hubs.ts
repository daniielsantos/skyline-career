/**
 * U.S. Virgin Islands career hubs (region US-VI under country US).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';

export type UsViCareerHubDef = {
  icao: string;
  name: string;
  region: 'US-VI';
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated USVI hubs — St. Thomas + St. Croix. */
export const US_VI_CAREER_HUBS: readonly UsViCareerHubDef[] = [
  {
    icao: 'TIST',
    name: 'St Thomas Cyril E King',
    region: 'US-VI',
    hubTier: 'major',
    lat: 18.3373,
    lon: -64.9734,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TISX',
    name: 'St Croix Henry E Rohlsen',
    region: 'US-VI',
    hubTier: 'regional',
    lat: 17.7016,
    lon: -64.7986,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 0.95 },
  },
];

export const US_VI_CAREER_HUB_COUNT = 2;

export function assertUsViCareerHubCatalog(): void {
  if (US_VI_CAREER_HUBS.length !== US_VI_CAREER_HUB_COUNT) {
    throw new Error(
      `US_VI_CAREER_HUBS length ${US_VI_CAREER_HUBS.length} !== ${US_VI_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of US_VI_CAREER_HUBS) {
    if (h.region !== 'US-VI') {
      throw new Error(`USVI hub ${h.icao} must use region US-VI`);
    }
  }
}
