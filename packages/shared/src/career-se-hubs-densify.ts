/**
 * Sweden densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into SE_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SeCareerRegion } from './career-se-hubs.js';

type SeDensifyHub = {
  icao: string;
  name: string;
  region: SeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** SE densify (+4). */
export const SE_DENSIFY_HUBS: readonly SeDensifyHub[] = [
  {
    icao: 'ESMS',
    name: "Malmo Sturup",
    region: 'SE-S',
    hubTier: 'regional',
    lat: 55.5363,
    lon: 13.3762,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'ESSV',
    name: "Visby",
    region: 'SE-S',
    hubTier: 'spoke',
    lat: 57.6628,
    lon: 18.3462,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'ESNN',
    name: "Sundsvall Timra",
    region: 'SE-N',
    hubTier: 'spoke',
    lat: 62.5281,
    lon: 17.4439,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'ESOE',
    name: "Orebro",
    region: 'SE-S',
    hubTier: 'spoke',
    lat: 59.2237,
    lon: 15.038,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'ESMX',
    name: "Vaxjo Kronoberg",
    region: 'SE-S',
    hubTier: 'spoke',
    lat: 56.9291,
    lon: 14.728,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const SE_DENSIFY_HUB_COUNT = SE_DENSIFY_HUBS.length;
