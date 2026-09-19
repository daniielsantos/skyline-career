/**
 * SD densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into SD_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SdCareerRegion } from './career-sd-hubs.js';

type SdDensifyHub = {
  icao: string;
  name: string;
  region: SdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+1). */
export const SD_DENSIFY_HUBS: readonly SdDensifyHub[] = [
  {
    icao: 'HSNN',
    name: "Nyala Airport",
    region: 'SD-C',
    hubTier: 'spoke',
    lat: 12.0535,
    lon: 24.9562,
    produce: { perishables: 1.35, general: 1.1, supplies: 1 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const SD_DENSIFY_HUB_COUNT = SD_DENSIFY_HUBS.length;
