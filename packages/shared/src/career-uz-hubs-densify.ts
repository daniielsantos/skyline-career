/**
 * Uz densify Wave C — commercial spokes (MSFS + SimBrief).
 * Merged into UZ_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { UzCareerRegion } from './career-uz-hubs.js';

type UzDensifyHub = {
  icao: string;
  name: string;
  region: UzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave C Asia densify (+1). */
export const UZ_DENSIFY_HUBS: readonly UzDensifyHub[] = [
  {
    icao: 'UTFN',
    name: "Namangan International Airport",
    region: 'UZ-E',
    hubTier: 'spoke',
    lat: 40.98462,
    lon: 71.5578,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const UZ_DENSIFY_HUB_COUNT = UZ_DENSIFY_HUBS.length;
