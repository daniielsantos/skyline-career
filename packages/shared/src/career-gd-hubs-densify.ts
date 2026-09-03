/**
 * Grenada densify — commercial TG* airports (MSFS + SimBrief).
 * Merged into GD_CAREER_HUBS. No bush strips.
 * Lauriston Carriacou is TGPZ (not TGCC — absent in stock MSFS).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GdCareerRegion } from './career-gd-hubs.js';

type GdDensifyHub = {
  icao: string;
  name: string;
  region: GdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const islandSpoke = {
  produce: { perishables: 1.3, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
} as const;

/** GD densify (+1) → 2 total. */
export const GD_DENSIFY_HUBS: readonly GdDensifyHub[] = [
  {
    icao: 'TGPZ',
    name: 'Lauriston Carriacou',
    region: 'GD-C',
    hubTier: 'spoke',
    lat: 12.4761,
    lon: -61.4728,
    ...islandSpoke,
  },
];

export const GD_DENSIFY_HUB_COUNT = GD_DENSIFY_HUBS.length;
