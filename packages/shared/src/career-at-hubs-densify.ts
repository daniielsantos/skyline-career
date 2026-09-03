/**
 * Austria densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into AT_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { AtCareerRegion } from './career-at-hubs.js';

type AtDensifyHub = {
  icao: string;
  name: string;
  region: AtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** AT densify (+3). */
export const AT_DENSIFY_HUBS: readonly AtDensifyHub[] = [
  {
    icao: 'LOAN',
    name: "Wiener Neustadt Ost",
    region: 'AT-E',
    hubTier: 'spoke',
    lat: 47.8433,
    lon: 16.2602,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LOIJ',
    name: "St Johann in Tirol",
    region: 'AT-W',
    hubTier: 'spoke',
    lat: 47.5201,
    lon: 12.4508,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LOXZ',
    name: "Zeltweg",
    region: 'AT-E',
    hubTier: 'spoke',
    lat: 47.2033,
    lon: 14.745,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
];

export const AT_DENSIFY_HUB_COUNT = AT_DENSIFY_HUBS.length;
