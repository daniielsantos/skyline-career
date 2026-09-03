/**
 * South Korea densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into KR_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { KrCareerRegion } from './career-kr-hubs.js';

type KrDensifyHub = {
  icao: string;
  name: string;
  region: KrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** KR densify (+9). */
export const KR_DENSIFY_HUBS: readonly KrDensifyHub[] = [
  {
    icao: 'RKTU',
    name: "Cheongju International Airport/Cheongju Air Base (K-59/G-513)",
    region: 'KR-C',
    hubTier: 'regional',
    lat: 36.71556,
    lon: 127.50029,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RKTN',
    name: "Daegu International Airport",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.89439,
    lon: 128.65699,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RKPU',
    name: "Ulsan Airport",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.5935,
    lon: 129.352,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RKJY',
    name: "Yeosu Airport",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 34.8423,
    lon: 127.617,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RKNY',
    name: "Yangyang International Airport",
    region: 'KR-C',
    hubTier: 'regional',
    lat: 38.06048,
    lon: 128.66982,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RKJK',
    name: "Gunsan Airport / Gunsan Air Base",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.9038,
    lon: 126.616,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RKJJ',
    name: "Gwangju Airport",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.12317,
    lon: 126.80544,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RKTH',
    name: "Pohang Airport (G-815/K-3)",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.98795,
    lon: 129.42038,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'RKPS',
    name: "Sacheon Airport / Sacheon Air Base",
    region: 'KR-S',
    hubTier: 'regional',
    lat: 35.08859,
    lon: 128.07175,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const KR_DENSIFY_HUB_COUNT = KR_DENSIFY_HUBS.length;
