/**
 * Suriname densify — commercial SM* airports (MSFS + SimBrief).
 * Merged into SR_CAREER_HUBS. No bush strips.
 * Wave A SMBN Albina dropped — SMWA already seeded; SMBN is a different MSFS facility.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SrCareerRegion } from './career-sr-hubs.js';

type SrDensifyHub = {
  icao: string;
  name: string;
  region: SrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** SR densify (+1) → 6 total. */
export const SR_DENSIFY_HUBS: readonly SrDensifyHub[] = [
  {
    icao: 'SMCO',
    name: 'Totness',
    region: 'SR-C',
    hubTier: 'spoke',
    lat: 5.8658,
    lon: -56.3275,
    ...agroSpoke,
  },
];

export const SR_DENSIFY_HUB_COUNT = SR_DENSIFY_HUBS.length;
