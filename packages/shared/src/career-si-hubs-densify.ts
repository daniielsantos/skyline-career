/**
 * Slovenia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into SI_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SiCareerRegion } from './career-si-hubs.js';

type SiDensifyHub = {
  icao: string;
  name: string;
  region: SiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** SI densify (+2). */
export const SI_DENSIFY_HUBS: readonly SiDensifyHub[] = [
  {
    icao: 'LJPZ',
    name: "Portoroz",
    region: 'SI-C',
    hubTier: 'spoke',
    lat: 45.4734,
    lon: 13.615,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LJCE',
    name: "Cerklje ob Krki",
    region: 'SI-C',
    hubTier: 'spoke',
    lat: 45.9,
    lon: 15.5302,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
];

export const SI_DENSIFY_HUB_COUNT = SI_DENSIFY_HUBS.length;
