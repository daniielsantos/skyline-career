/**
 * Thailand densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into TH_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ThCareerRegion } from './career-th-hubs.js';

type ThDensifyHub = {
  icao: string;
  name: string;
  region: ThCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** TH densify (+10). */
export const TH_DENSIFY_HUBS: readonly ThDensifyHub[] = [
  {
    icao: 'VTSG',
    name: "Krabi International Airport",
    region: 'TH-S',
    hubTier: 'regional',
    lat: 8.09559,
    lon: 98.98896,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VTSM',
    name: "Samui International Airport",
    region: 'TH-S',
    hubTier: 'regional',
    lat: 9.54779,
    lon: 100.062,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VTUD',
    name: "Udon Thani International Airport",
    region: 'TH-N',
    hubTier: 'regional',
    lat: 17.38619,
    lon: 102.78858,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VTUO',
    name: "Buri Ram Airport",
    region: 'TH-C',
    hubTier: 'regional',
    lat: 15.2295,
    lon: 103.253,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VTSE',
    name: "Chumphon Airport",
    region: 'TH-S',
    hubTier: 'regional',
    lat: 10.7112,
    lon: 99.3617,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VTPH',
    name: "Hua Hin Airport",
    region: 'TH-C',
    hubTier: 'regional',
    lat: 12.6362,
    lon: 99.9515,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VTCL',
    name: "Lampang Airport",
    region: 'TH-N',
    hubTier: 'regional',
    lat: 18.2709,
    lon: 99.5042,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VTUL',
    name: "Loei Airport",
    region: 'TH-N',
    hubTier: 'regional',
    lat: 17.4391,
    lon: 101.722,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VTCH',
    name: "Mae Hong Son Airport",
    region: 'TH-N',
    hubTier: 'regional',
    lat: 19.3013,
    lon: 97.9758,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VTPM',
    name: "Mae Sot Airport",
    region: 'TH-C',
    hubTier: 'regional',
    lat: 16.6999,
    lon: 98.5451,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const TH_DENSIFY_HUB_COUNT = TH_DENSIFY_HUBS.length;
