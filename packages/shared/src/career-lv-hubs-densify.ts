/**
 * Latvia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into LV_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { LvCareerRegion } from './career-lv-hubs.js';

type LvDensifyHub = {
  icao: string;
  name: string;
  region: LvCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** LV densify (+2). */
export const LV_DENSIFY_HUBS: readonly LvDensifyHub[] = [
  {
    icao: 'EVRS',
    name: "Riga Spilve",
    region: 'LV-C',
    hubTier: 'spoke',
    lat: 56.9917,
    lon: 24.0781,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'EVDA',
    name: "Daugavpils",
    region: 'LV-C',
    hubTier: 'spoke',
    lat: 55.9447,
    lon: 26.665,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const LV_DENSIFY_HUB_COUNT = LV_DENSIFY_HUBS.length;
