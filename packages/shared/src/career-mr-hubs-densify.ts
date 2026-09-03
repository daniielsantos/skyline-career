/**
 * Mauritania densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into MR_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MrCareerRegion } from './career-mr-hubs.js';

type MrDensifyHub = {
  icao: string;
  name: string;
  region: MrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** MR densify (+2). */
export const MR_DENSIFY_HUBS: readonly MrDensifyHub[] = [
  {
    icao: 'GQPA',
    name: "Atar International Airport",
    region: 'MR-W',
    hubTier: 'regional',
    lat: 20.5068,
    lon: -13.0432,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'GQPZ',
    name: "Tazadit Airport",
    region: 'MR-W',
    hubTier: 'regional',
    lat: 22.75735,
    lon: -12.48223,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const MR_DENSIFY_HUB_COUNT = MR_DENSIFY_HUBS.length;
