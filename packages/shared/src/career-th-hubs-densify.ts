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






  // Wave A Asia densify (+3)
  {
    icao: 'VTSB',
    name: "Surat Thani Airport",
    region: 'TH-S',
    hubTier: 'spoke',
    lat: 9.1326,
    lon: 99.1356,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'VTPP',
    name: "Phitsanulok Airport",
    region: 'TH-N',
    hubTier: 'spoke',
    lat: 16.7829,
    lon: 100.279,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'VTPO',
    name: "Sukhothai Airport",
    region: 'TH-N',
    hubTier: 'spoke',
    lat: 17.238,
    lon: 99.8182,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },

  // Wave B Asia densify (+3)
  {
    icao: 'VTBO',
    name: "Trat Airport",
    region: 'TH-C',
    hubTier: 'spoke',
    lat: 12.2746,
    lon: 102.319,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'VTCN',
    name: "Nan Airport",
    region: 'TH-N',
    hubTier: 'spoke',
    lat: 18.8079,
    lon: 100.783,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'VTCP',
    name: "Phrae Airport",
    region: 'TH-N',
    hubTier: 'spoke',
    lat: 18.1322,
    lon: 100.165,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },

  // Wave C Asia densify (+3)
  {
    icao: 'VTSC',
    name: "Narathiwat Airport",
    region: 'TH-S',
    hubTier: 'spoke',
    lat: 6.51992,
    lon: 101.743,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'VTSF',
    name: "Nakhon Si Thammarat Airport",
    region: 'TH-S',
    hubTier: 'spoke',
    lat: 8.53962,
    lon: 99.9447,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'VTSH',
    name: "Songkhla Airport",
    region: 'TH-S',
    hubTier: 'spoke',
    lat: 7.18656,
    lon: 100.608,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const TH_DENSIFY_HUB_COUNT = TH_DENSIFY_HUBS.length;
