/**
 * YE densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into YE_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { YeCareerRegion } from './career-ye-hubs.js';

type YeDensifyHub = {
  icao: string;
  name: string;
  region: YeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+1). */
export const YE_DENSIFY_HUBS: readonly YeDensifyHub[] = [
  {
    icao: 'OYTZ',
    name: "Taiz International Airport",
    region: 'YE-S',
    hubTier: 'spoke',
    lat: 13.686,
    lon: 44.1391,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const YE_DENSIFY_HUB_COUNT = YE_DENSIFY_HUBS.length;
