/**
 * Botswana densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into BW_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { BwCareerRegion } from './career-bw-hubs.js';

type BwDensifyHub = {
  icao: string;
  name: string;
  region: BwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** BW densify (+3). */
export const BW_DENSIFY_HUBS: readonly BwDensifyHub[] = [
  {
    icao: 'FBKE',
    name: "Kasane International Airport",
    region: 'BW-C',
    hubTier: 'regional',
    lat: -17.83165,
    lon: 25.16619,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FBOR',
    name: "Orapa Airport",
    region: 'BW-C',
    hubTier: 'spoke',
    lat: -21.2667,
    lon: 25.3167,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FBFT',
    name: "Phillip Gaonwe Matante International Airport",
    region: 'BW-C',
    hubTier: 'regional',
    lat: -21.15918,
    lon: 27.46883,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const BW_DENSIFY_HUB_COUNT = BW_DENSIFY_HUBS.length;
