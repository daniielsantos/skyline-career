/**
 * Vietnam densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into VN_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { VnCareerRegion } from './career-vn-hubs.js';

type VnDensifyHub = {
  icao: string;
  name: string;
  region: VnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** VN densify (+8). */
export const VN_DENSIFY_HUBS: readonly VnDensifyHub[] = [
  {
    icao: 'VVCR',
    name: "Cam Ranh International Airport / Cam Ranh Air Base",
    region: 'VN-S',
    hubTier: 'regional',
    lat: 11.9982,
    lon: 109.219,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VVPQ',
    name: "Phú Quốc International Airport",
    region: 'VN-S',
    hubTier: 'regional',
    lat: 10.16978,
    lon: 103.99353,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VVBM',
    name: "Buon Ma Thuot Airport",
    region: 'VN-S',
    hubTier: 'regional',
    lat: 12.6683,
    lon: 108.12,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VVCM',
    name: "Cà Mau Airport",
    region: 'VN-S',
    hubTier: 'regional',
    lat: 9.17767,
    lon: 105.17778,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VVCS',
    name: "Con Dao Airport",
    region: 'VN-S',
    hubTier: 'regional',
    lat: 8.73183,
    lon: 106.633,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VVDB',
    name: "Dien Bien Phu Airport",
    region: 'VN-N',
    hubTier: 'regional',
    lat: 21.3975,
    lon: 103.008,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VVDH',
    name: "Dong Hoi Airport",
    region: 'VN-N',
    hubTier: 'regional',
    lat: 17.515,
    lon: 106.59056,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VVTH',
    name: "Dong Tac Airport",
    region: 'VN-S',
    hubTier: 'regional',
    lat: 13.0496,
    lon: 109.334,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },






  // Wave A Asia densify (+2)
  {
    icao: 'VVPB',
    name: "Phu Bai International Airport",
    region: 'VN-S',
    hubTier: 'spoke',
    lat: 16.40063,
    lon: 107.70309,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'VVPC',
    name: "Phu Cat Airport",
    region: 'VN-S',
    hubTier: 'spoke',
    lat: 13.955,
    lon: 109.042,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },

  // Wave B Asia densify (+1)
  {
    icao: 'VVPK',
    name: "Pleiku Airport",
    region: 'VN-S',
    hubTier: 'spoke',
    lat: 14.0045,
    lon: 108.017,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const VN_DENSIFY_HUB_COUNT = VN_DENSIFY_HUBS.length;
