/**
 * Ethiopia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into ET_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { EtCareerRegion } from './career-et-hubs.js';

type EtDensifyHub = {
  icao: string;
  name: string;
  region: EtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** ET densify (+4). */
export const ET_DENSIFY_HUBS: readonly EtDensifyHub[] = [
  {
    icao: 'HADR',
    name: "Aba Tenna Dejazmach Yilma International Airport",
    region: 'ET-C',
    hubTier: 'regional',
    lat: 9.62355,
    lon: 41.85503,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HAJJ',
    name: "Gerad Wilwal International Airport",
    region: 'ET-C',
    hubTier: 'regional',
    lat: 9.33191,
    lon: 42.91181,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HALA',
    name: "Hawassa International Airport",
    region: 'ET-C',
    hubTier: 'regional',
    lat: 7.10061,
    lon: 38.39646,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HAAM',
    name: "Arba Minch Airport",
    region: 'ET-C',
    hubTier: 'regional',
    lat: 6.03939,
    lon: 37.5905,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const ET_DENSIFY_HUB_COUNT = ET_DENSIFY_HUBS.length;
