/**
 * Zambia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into ZM_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ZmCareerRegion } from './career-zm-hubs.js';

type ZmDensifyHub = {
  icao: string;
  name: string;
  region: ZmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** ZM densify (+3). */
export const ZM_DENSIFY_HUBS: readonly ZmDensifyHub[] = [
  {
    icao: 'FLLI',
    name: "Harry Mwanga Nkumbula International Airport",
    region: 'ZM-C',
    hubTier: 'regional',
    lat: -17.82152,
    lon: 25.81964,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    // FLHN = Livingstone (same as FLLI) — Solwezi civil is FLSW.
    icao: 'FLSW',
    name: "Solwezi Airport",
    region: 'ZM-C',
    hubTier: 'spoke',
    lat: -12.1737,
    lon: 26.3651,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FLMF',
    name: "Mfuwe International Airport",
    region: 'ZM-C',
    hubTier: 'regional',
    lat: -13.2589,
    lon: 31.9366,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const ZM_DENSIFY_HUB_COUNT = ZM_DENSIFY_HUBS.length;
