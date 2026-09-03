/**
 * Denmark densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into DK_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { DkCareerRegion } from './career-dk-hubs.js';

type DkDensifyHub = {
  icao: string;
  name: string;
  region: DkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** DK densify (+3). */
export const DK_DENSIFY_HUBS: readonly DkDensifyHub[] = [
  {
    icao: 'EKOD',
    name: "Odense Hans Christian Andersen",
    region: 'DK-W',
    hubTier: 'spoke',
    lat: 55.4767,
    lon: 10.3309,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'EKSB',
    name: "Sonderborg",
    region: 'DK-W',
    hubTier: 'spoke',
    lat: 54.9644,
    lon: 9.79173,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'EKEB',
    name: "Esbjerg",
    region: 'DK-W',
    hubTier: 'spoke',
    lat: 55.5259,
    lon: 8.5534,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'EKKA',
    name: "Karup",
    region: 'DK-W',
    hubTier: 'spoke',
    lat: 56.2975,
    lon: 9.12472,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const DK_DENSIFY_HUB_COUNT = DK_DENSIFY_HUBS.length;
