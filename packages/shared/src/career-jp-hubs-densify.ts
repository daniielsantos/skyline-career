/**
 * Japan densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into JP_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { JpCareerRegion } from './career-jp-hubs.js';

type JpDensifyHub = {
  icao: string;
  name: string;
  region: JpCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** JP densify (+13). */
export const JP_DENSIFY_HUBS: readonly JpDensifyHub[] = [
  {
    icao: 'RJSA',
    name: "Aomori Airport",
    region: 'JP-N',
    hubTier: 'regional',
    lat: 40.73378,
    lon: 140.68948,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJFO',
    name: "Oita Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 33.4794,
    lon: 131.737,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJCH',
    name: "Hakodate Airport",
    region: 'JP-N',
    hubTier: 'regional',
    lat: 41.77,
    lon: 140.82201,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJOA',
    name: "Hiroshima Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 34.4361,
    lon: 132.91901,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJAH',
    name: "Ibaraki Airport",
    region: 'JP-E',
    hubTier: 'regional',
    lat: 36.18146,
    lon: 140.41443,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJFK',
    name: "Kagoshima Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 31.8034,
    lon: 130.71899,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJFR',
    name: "Kitakyushu Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 33.8459,
    lon: 131.035,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJBE',
    name: "Kobe Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 34.6328,
    lon: 135.224,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJOK',
    name: "Kochi Ryoma Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 33.54522,
    lon: 133.67017,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJNK',
    name: "Komatsu Airport / JASDF Komatsu Air Base",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 36.39341,
    lon: 136.40689,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJFT',
    name: "Kumamoto Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 32.8373,
    lon: 130.855,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJFS',
    name: "Kyushu Saga International Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 33.1497,
    lon: 130.302,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RJOM',
    name: "Matsuyama Airport",
    region: 'JP-W',
    hubTier: 'regional',
    lat: 33.82689,
    lon: 132.70011,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const JP_DENSIFY_HUB_COUNT = JP_DENSIFY_HUBS.length;
