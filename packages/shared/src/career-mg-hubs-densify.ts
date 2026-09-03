/**
 * Madagascar densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into MG_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MgCareerRegion } from './career-mg-hubs.js';

type MgDensifyHub = {
  icao: string;
  name: string;
  region: MgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** MG densify (+5). */
export const MG_DENSIFY_HUBS: readonly MgDensifyHub[] = [
  {
    icao: 'FMNM',
    name: "Amborovy Airport",
    region: 'MG-C',
    hubTier: 'regional',
    lat: -15.66684,
    lon: 46.35123,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FMNN',
    name: "Nosy Be International Airport",
    region: 'MG-E',
    hubTier: 'regional',
    lat: -13.3121,
    lon: 48.3148,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FMNA',
    name: "Arrachart Airport",
    region: 'MG-E',
    hubTier: 'regional',
    lat: -12.3494,
    lon: 49.2917,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FMNQ',
    name: "Besalampy Airport",
    region: 'MG-C',
    hubTier: 'regional',
    lat: -16.74453,
    lon: 44.48248,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FMSM',
    name: "Mananjary Airport",
    region: 'MG-E',
    hubTier: 'regional',
    lat: -21.2018,
    lon: 48.3583,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const MG_DENSIFY_HUB_COUNT = MG_DENSIFY_HUBS.length;
