/**
 * SY densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into SY_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SyCareerRegion } from './career-sy-hubs.js';

type SyDensifyHub = {
  icao: string;
  name: string;
  region: SyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+1). */
export const SY_DENSIFY_HUBS: readonly SyDensifyHub[] = [
  {
    icao: 'OSKL',
    name: "Qamishli International Airport",
    region: 'SY-N',
    hubTier: 'spoke',
    lat: 37.0206,
    lon: 41.1914,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const SY_DENSIFY_HUB_COUNT = SY_DENSIFY_HUBS.length;
