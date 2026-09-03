/**
 * Czechia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into CZ_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CzCareerRegion } from './career-cz-hubs.js';

type CzDensifyHub = {
  icao: string;
  name: string;
  region: CzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** CZ densify (+3). */
export const CZ_DENSIFY_HUBS: readonly CzDensifyHub[] = [
  {
    icao: 'LKCS',
    name: "Ceske Budejovice",
    region: 'CZ-W',
    hubTier: 'spoke',
    lat: 48.9464,
    lon: 14.4275,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'LKKU',
    name: "Kunovice",
    region: 'CZ-E',
    hubTier: 'spoke',
    lat: 49.0294,
    lon: 17.4397,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LKVO',
    name: "Vodochody",
    region: 'CZ-W',
    hubTier: 'spoke',
    lat: 50.2166,
    lon: 14.3958,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LKHO',
    name: "Holesov",
    region: 'CZ-E',
    hubTier: 'spoke',
    lat: 49.3128,
    lon: 17.57,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const CZ_DENSIFY_HUB_COUNT = CZ_DENSIFY_HUBS.length;
