/**
 * Jamaica densify — commercial MK* airports (MSFS + SimBrief).
 * Merged into JM_CAREER_HUBS. No bush; MKNG Negril (homolog later if needed).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { JmCareerRegion } from './career-jm-hubs.js';

type JmDensifyHub = {
  icao: string;
  name: string;
  region: JmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const tourismSpoke = {
  produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

/** JM densify (+1) → 6 total. */
export const JM_DENSIFY_HUBS: readonly JmDensifyHub[] = [
  {
    icao: 'MKNG',
    name: 'Negril',
    region: 'JM-C',
    hubTier: 'spoke',
    lat: 18.34,
    lon: -78.3358,
    ...tourismSpoke,
  },
];

export const JM_DENSIFY_HUB_COUNT = JM_DENSIFY_HUBS.length;
