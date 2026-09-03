/**
 * Kenya densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into KE_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { KeCareerRegion } from './career-ke-hubs.js';

type KeDensifyHub = {
  icao: string;
  name: string;
  region: KeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** KE densify (+5). */
export const KE_DENSIFY_HUBS: readonly KeDensifyHub[] = [
  {
    icao: 'HKEL',
    name: "Eldoret International Airport",
    region: 'KE-C',
    hubTier: 'regional',
    lat: 0.40446,
    lon: 35.2389,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HKKI',
    name: "Kisumu International Airport",
    region: 'KE-C',
    hubTier: 'regional',
    lat: -0.08614,
    lon: 34.7289,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HKAM',
    name: "Amboseli Airport",
    region: 'KE-C',
    hubTier: 'regional',
    lat: -2.64479,
    lon: 37.25292,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HKML',
    name: "Malindi International Airport",
    region: 'KE-E',
    hubTier: 'regional',
    lat: -3.22931,
    lon: 40.1017,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HKLU',
    name: "Manda Airport",
    region: 'KE-E',
    hubTier: 'regional',
    lat: -2.25243,
    lon: 40.91289,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const KE_DENSIFY_HUB_COUNT = KE_DENSIFY_HUBS.length;
