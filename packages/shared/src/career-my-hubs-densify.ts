/**
 * Malaysia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into MY_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MyCareerRegion } from './career-my-hubs.js';

type MyDensifyHub = {
  icao: string;
  name: string;
  region: MyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** MY densify (+8). */
export const MY_DENSIFY_HUBS: readonly MyDensifyHub[] = [
  {
    icao: 'WMKL',
    name: "Langkawi International Airport",
    region: 'MY-N',
    hubTier: 'regional',
    lat: 6.32973,
    lon: 99.7287,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'WMSA',
    name: "Sultan Abdul Aziz Shah International Airport",
    region: 'MY-C',
    hubTier: 'regional',
    lat: 3.13058,
    lon: 101.549,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'WBGZ',
    name: "Bario Airport",
    region: 'MY-K',
    hubTier: 'regional',
    lat: 3.73465,
    lon: 115.47855,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'WBGB',
    name: "Bintulu Airport",
    region: 'MY-K',
    hubTier: 'regional',
    lat: 3.12385,
    lon: 113.02,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'WMKD',
    name: "Kuantan Airport",
    region: 'MY-E',
    hubTier: 'regional',
    lat: 3.77539,
    lon: 103.209,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'WBKL',
    name: "Labuan Airport",
    region: 'MY-K',
    hubTier: 'regional',
    lat: 5.30167,
    lon: 115.24833,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'WBKD',
    name: "Lahad Datu Airport",
    region: 'MY-K',
    hubTier: 'regional',
    lat: 5.03241,
    lon: 118.32376,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'WBGJ',
    name: "Limbang Airport",
    region: 'MY-K',
    hubTier: 'regional',
    lat: 4.8083,
    lon: 115.01,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const MY_DENSIFY_HUB_COUNT = MY_DENSIFY_HUBS.length;
