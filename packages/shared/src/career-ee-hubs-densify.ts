/**
 * Estonia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into EE_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { EeCareerRegion } from './career-ee-hubs.js';

type EeDensifyHub = {
  icao: string;
  name: string;
  region: EeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** EE densify (+2). */
export const EE_DENSIFY_HUBS: readonly EeDensifyHub[] = [
  {
    icao: 'EEKE',
    name: "Kuressaare",
    region: 'EE-C',
    hubTier: 'spoke',
    lat: 58.2299,
    lon: 22.5094,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'EEEI',
    name: "Amari",
    region: 'EE-C',
    hubTier: 'spoke',
    lat: 59.2603,
    lon: 24.2085,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
];

export const EE_DENSIFY_HUB_COUNT = EE_DENSIFY_HUBS.length;
