/**
 * Hungary densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into HU_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { HuCareerRegion } from './career-hu-hubs.js';

type HuDensifyHub = {
  icao: string;
  name: string;
  region: HuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** HU densify (+3). */
export const HU_DENSIFY_HUBS: readonly HuDensifyHub[] = [
  {
    icao: 'LHKE',
    name: "Kecskemet",
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 46.9175,
    lon: 19.7492,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LHBC',
    name: "Bekescsaba",
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 46.6853,
    lon: 21.1591,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'LHBS',
    name: "Budaors",
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 47.4511,
    lon: 18.9875,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'LHPP',
    name: "Pecs Pogany",
    region: 'HU-C',
    hubTier: 'spoke',
    lat: 45.9909,
    lon: 18.242,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const HU_DENSIFY_HUB_COUNT = HU_DENSIFY_HUBS.length;
