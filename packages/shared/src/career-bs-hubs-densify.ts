/**
 * Bahamas densify — commercial MY* Family Islands (MSFS + SimBrief).
 * Merged into BS_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { BsCareerRegion } from './career-bs-hubs.js';

type BsDensifyHub = {
  icao: string;
  name: string;
  region: BsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const islandSpoke = {
  produce: { perishables: 1.3, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.9 },
} as const;

/** BS densify (+9) → 14 total. */
export const BS_DENSIFY_HUBS: readonly BsDensifyHub[] = [
  {
    icao: 'MYAM',
    name: 'Marsh Harbour',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 26.5114,
    lon: -77.0835,
    ...islandSpoke,
  },
  {
    icao: 'MYEF',
    name: 'Exuma George Town',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 23.5626,
    lon: -75.8779,
    ...islandSpoke,
  },
  {
    icao: 'MYER',
    name: 'Rock Sound Eleuthera',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 24.8917,
    lon: -76.1778,
    ...islandSpoke,
  },
  {
    icao: 'MYAT',
    name: 'Treasure Cay',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 26.7453,
    lon: -77.3913,
    ...islandSpoke,
  },
  {
    icao: 'MYBS',
    name: 'South Bimini',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 25.6999,
    lon: -79.2647,
    ...islandSpoke,
  },
  // Wave C densify (+4)
  {
    icao: 'MYEM',
    name: "Governor's Harbour",
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 25.2847,
    lon: -76.331,
    ...islandSpoke,
  },
  {
    icao: 'MYLD',
    name: "Deadman's Cay",
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 23.179,
    lon: -75.0936,
    ...islandSpoke,
  },
  {
    icao: 'MYLS',
    name: 'Stella Maris',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 23.5823,
    lon: -75.2686,
    ...islandSpoke,
  },
  {
    icao: 'MYIG',
    name: 'Matthew Town Inagua',
    region: 'BS-C',
    hubTier: 'spoke',
    lat: 20.975,
    lon: -73.6669,
    ...islandSpoke,
  },
];

export const BS_DENSIFY_HUB_COUNT = BS_DENSIFY_HUBS.length;
