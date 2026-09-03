/**
 * Angola densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into AO_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { AoCareerRegion } from './career-ao-hubs.js';

type AoDensifyHub = {
  icao: string;
  name: string;
  region: AoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** AO densify (+4). */
export const AO_DENSIFY_HUBS: readonly AoDensifyHub[] = [
  {
    icao: 'FNBJ',
    name: "Dr. Antonio Agostinho Neto International Airport",
    region: 'AO-N',
    hubTier: 'regional',
    lat: -9.05073,
    lon: 13.49908,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FNHU',
    name: "Albano Machado Airport",
    region: 'AO-N',
    hubTier: 'regional',
    lat: -12.8089,
    lon: 15.7605,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FNCA',
    name: "Cabinda Airport",
    region: 'AO-N',
    hubTier: 'regional',
    lat: -5.59839,
    lon: 12.18815,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FNCT',
    name: "Catumbela Airport",
    region: 'AO-N',
    hubTier: 'regional',
    lat: -12.4792,
    lon: 13.4869,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const AO_DENSIFY_HUB_COUNT = AO_DENSIFY_HUBS.length;
