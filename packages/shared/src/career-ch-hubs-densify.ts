/**
 * Switzerland densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into CH_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ChCareerRegion } from './career-ch-hubs.js';

type ChDensifyHub = {
  icao: string;
  name: string;
  region: ChCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** CH densify (+2). */
export const CH_DENSIFY_HUBS: readonly ChDensifyHub[] = [
  {
    icao: 'LSZS',
    name: "Samedan Engadin",
    region: 'CH-C',
    hubTier: 'spoke',
    lat: 46.5341,
    lon: 9.88411,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LSZG',
    name: "Grenchen",
    region: 'CH-C',
    hubTier: 'spoke',
    lat: 47.1816,
    lon: 7.41719,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LSME',
    name: "Emmen",
    region: 'CH-C',
    hubTier: 'spoke',
    lat: 47.0925,
    lon: 8.305,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const CH_DENSIFY_HUB_COUNT = CH_DENSIFY_HUBS.length;
