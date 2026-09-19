/**
 * LY densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into LY_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { LyCareerRegion } from './career-ly-hubs.js';

type LyDensifyHub = {
  icao: string;
  name: string;
  region: LyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+2). */
export const LY_DENSIFY_HUBS: readonly LyDensifyHub[] = [
  {
    icao: 'HLGT',
    name: "Ghat Airport",
    region: 'LY-W',
    hubTier: 'spoke',
    lat: 25.1456,
    lon: 10.1426,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'HLKF',
    name: "Kufra Airport",
    region: 'LY-E',
    hubTier: 'spoke',
    lat: 24.1787,
    lon: 23.314,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const LY_DENSIFY_HUB_COUNT = LY_DENSIFY_HUBS.length;
