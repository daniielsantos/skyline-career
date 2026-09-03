/**
 * Tanzania densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into TZ_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { TzCareerRegion } from './career-tz-hubs.js';

type TzDensifyHub = {
  icao: string;
  name: string;
  region: TzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** TZ densify (+4). */
export const TZ_DENSIFY_HUBS: readonly TzDensifyHub[] = [
  {
    icao: 'HTZA',
    name: "Abeid Amani Karume International Airport",
    region: 'TZ-E',
    hubTier: 'regional',
    lat: -6.22202,
    lon: 39.2249,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HTMW',
    name: "Mwanza International Airport",
    region: 'TZ-N',
    hubTier: 'regional',
    lat: -2.44656,
    lon: 32.93605,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'HTAR',
    name: "Arusha Airport",
    region: 'TZ-N',
    hubTier: 'regional',
    lat: -3.36779,
    lon: 36.6333,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'HTDO',
    name: "Dodoma Airport",
    region: 'TZ-E',
    hubTier: 'regional',
    lat: -6.17056,
    lon: 35.75604,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const TZ_DENSIFY_HUB_COUNT = TZ_DENSIFY_HUBS.length;
