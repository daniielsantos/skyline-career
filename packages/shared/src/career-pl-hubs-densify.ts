/**
 * Poland densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into PL_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PlCareerRegion } from './career-pl-hubs.js';

type PlDensifyHub = {
  icao: string;
  name: string;
  region: PlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** PL densify (+4). */
export const PL_DENSIFY_HUBS: readonly PlDensifyHub[] = [
  {
    icao: 'EPMO',
    name: "Warsaw Modlin",
    region: 'PL-C',
    hubTier: 'regional',
    lat: 52.4511,
    lon: 20.6518,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'EPZG',
    name: "Zielona Gora Babimost",
    region: 'PL-N',
    hubTier: 'spoke',
    lat: 52.1385,
    lon: 15.7986,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'EPSY',
    name: "Olsztyn Mazury",
    region: 'PL-N',
    hubTier: 'spoke',
    lat: 53.4819,
    lon: 20.9378,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'EPRA',
    name: "Radom",
    region: 'PL-C',
    hubTier: 'spoke',
    lat: 51.3892,
    lon: 21.2136,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'EPBP',
    name: "Biala Podlaska",
    region: 'PL-C',
    hubTier: 'spoke',
    lat: 52.0753,
    lon: 23.1367,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const PL_DENSIFY_HUB_COUNT = PL_DENSIFY_HUBS.length;
