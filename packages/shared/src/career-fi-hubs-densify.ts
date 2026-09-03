/**
 * Finland densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into FI_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { FiCareerRegion } from './career-fi-hubs.js';

type FiDensifyHub = {
  icao: string;
  name: string;
  region: FiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** FI densify (+3). */
export const FI_DENSIFY_HUBS: readonly FiDensifyHub[] = [
  {
    icao: 'EFOU',
    name: "Oulu",
    region: 'FI-N',
    hubTier: 'regional',
    lat: 64.9301,
    lon: 25.3546,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'EFIV',
    name: "Ivalo",
    region: 'FI-N',
    hubTier: 'spoke',
    lat: 68.6073,
    lon: 27.4053,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'EFJO',
    name: "Joensuu",
    region: 'FI-S',
    hubTier: 'spoke',
    lat: 62.6629,
    lon: 29.6075,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'EFKT',
    name: "Kittila",
    region: 'FI-N',
    hubTier: 'spoke',
    lat: 67.701,
    lon: 24.8468,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const FI_DENSIFY_HUB_COUNT = FI_DENSIFY_HUBS.length;
