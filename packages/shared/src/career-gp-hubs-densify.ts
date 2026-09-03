/**
 * Guadeloupe densify — commercial TF* out-islands (MSFS + SimBrief).
 * Merged into GP_CAREER_HUBS. TFFM Marie-Galante already seeded.
 * TFFA = La Desireade; TFFS = Les Saintes Terre-de-Haut (not Saint-Francois — that is TFFC).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GpCareerRegion } from './career-gp-hubs.js';

type GpDensifyHub = {
  icao: string;
  name: string;
  region: GpCareerRegion;
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

/** GP densify (+3) → 5 total. */
export const GP_DENSIFY_HUBS: readonly GpDensifyHub[] = [
  {
    icao: 'TFFA',
    name: 'La Desireade Grande Anse',
    region: 'GP-C',
    hubTier: 'spoke',
    lat: 16.2969,
    lon: -61.0844,
    ...islandSpoke,
  },
  {
    icao: 'TFFS',
    name: 'Les Saintes Terre-de-Haut',
    region: 'GP-C',
    hubTier: 'spoke',
    lat: 15.8645,
    lon: -61.5808,
    ...islandSpoke,
  },
  // Wave C densify (+1)
  {
    icao: 'TFFC',
    name: 'Saint-Francois',
    region: 'GP-C',
    hubTier: 'spoke',
    lat: 16.2578,
    lon: -61.2625,
    ...islandSpoke,
  },
];

export const GP_DENSIFY_HUB_COUNT = GP_DENSIFY_HUBS.length;
