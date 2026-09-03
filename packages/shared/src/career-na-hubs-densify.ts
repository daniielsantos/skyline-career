/**
 * Namibia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into NA_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NaCareerRegion } from './career-na-hubs.js';

type NaDensifyHub = {
  icao: string;
  name: string;
  region: NaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** NA densify (+4). */
export const NA_DENSIFY_HUBS: readonly NaDensifyHub[] = [
  {
    icao: 'FYRU',
    name: "Rundu Airport",
    region: 'NA-C',
    hubTier: 'regional',
    lat: -17.9565,
    lon: 19.7194,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FYKM',
    name: "Katima Mulilo Airport",
    region: 'NA-C',
    hubTier: 'regional',
    lat: -17.63426,
    lon: 24.17669,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FYLZ',
    name: "Luderitz Airport",
    region: 'NA-C',
    hubTier: 'regional',
    lat: -26.6874,
    lon: 15.2429,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FYOA',
    name: "Ondangwa Airport",
    region: 'NA-C',
    hubTier: 'regional',
    lat: -17.8782,
    lon: 15.9526,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const NA_DENSIFY_HUB_COUNT = NA_DENSIFY_HUBS.length;
