/**
 * Rwanda densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into RW_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { RwCareerRegion } from './career-rw-hubs.js';

type RwDensifyHub = {
  icao: string;
  name: string;
  region: RwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** RW densify (+2). */
export const RW_DENSIFY_HUBS: readonly RwDensifyHub[] = [
  {
    icao: 'HRZA',
    name: "Kamembe Airport",
    region: 'RW-C',
    hubTier: 'regional',
    lat: -2.46224,
    lon: 28.9079,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HRYG',
    name: "Gisenyi Airport",
    region: 'RW-C',
    hubTier: 'regional',
    lat: -1.6772,
    lon: 29.2589,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const RW_DENSIFY_HUB_COUNT = RW_DENSIFY_HUBS.length;
