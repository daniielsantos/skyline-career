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






  // Wave A Asia densify (+6)
  {
    icao: 'RJSN',
    name: "Niigata Airport",
    region: 'JP-E',
    hubTier: 'spoke',
    lat: 37.95417,
    lon: 139.11219,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJSS',
    name: "Sendai Airport",
    region: 'JP-E',
    hubTier: 'spoke',
    lat: 38.1397,
    lon: 140.91701,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJOT',
    name: "Takamatsu Airport",
    region: 'JP-W',
    hubTier: 'spoke',
    lat: 34.21496,
    lon: 134.01545,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJFM',
    name: "Miyazaki Airport",
    region: 'JP-S',
    hubTier: 'spoke',
    lat: 31.8772,
    lon: 131.449,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'RJFU',
    name: "Nagasaki Airport",
    region: 'JP-S',
    hubTier: 'spoke',
    lat: 32.9169,
    lon: 129.914,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJNS',
    name: "Mount Fuji Shizuoka Airport",
    region: 'JP-E',
    hubTier: 'spoke',
    lat: 34.79502,
    lon: 138.19098,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },

  // Wave B Asia densify (+6)
  {
    icao: 'RJOB',
    name: "Okayama Momotaro Airport",
    region: 'JP-W',
    hubTier: 'spoke',
    lat: 34.7569,
    lon: 133.855,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJAF',
    name: "Shinshu-Matsumoto Airport",
    region: 'JP-E',
    hubTier: 'spoke',
    lat: 36.1668,
    lon: 137.923,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJBD',
    name: "Nanki Shirahama Airport",
    region: 'JP-W',
    hubTier: 'spoke',
    lat: 33.6622,
    lon: 135.364,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJBT',
    name: "Konotori Tajima Airport",
    region: 'JP-W',
    hubTier: 'spoke',
    lat: 35.5128,
    lon: 134.787,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'RJCB',
    name: "Tokachi-Obihiro Airport",
    region: 'JP-N',
    hubTier: 'spoke',
    lat: 42.7333,
    lon: 143.217,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RJCK',
    name: "Kushiro Airport",
    region: 'JP-N',
    hubTier: 'spoke',
    lat: 43.041,
    lon: 144.19299,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const JP_DENSIFY_HUB_COUNT = JP_DENSIFY_HUBS.length;
