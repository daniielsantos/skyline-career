/**
 * Croatia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into HR_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { HrCareerRegion } from './career-hr-hubs.js';

type HrDensifyHub = {
  icao: string;
  name: string;
  region: HrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** HR densify (+3). */
export const HR_DENSIFY_HUBS: readonly HrDensifyHub[] = [
  {
    icao: 'LDRI',
    name: "Rijeka",
    region: 'HR-N',
    hubTier: 'spoke',
    lat: 45.2169,
    lon: 14.5703,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LDLO',
    name: "Losinj",
    region: 'HR-S',
    hubTier: 'spoke',
    lat: 44.5657,
    lon: 14.3931,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LDOS',
    name: "Osijek",
    region: 'HR-N',
    hubTier: 'spoke',
    lat: 45.4627,
    lon: 18.8102,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const HR_DENSIFY_HUB_COUNT = HR_DENSIFY_HUBS.length;
