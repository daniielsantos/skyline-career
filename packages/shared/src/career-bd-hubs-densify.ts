/**
 * Bd densify Wave C — commercial spokes (MSFS + SimBrief).
 * Merged into BD_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { BdCareerRegion } from './career-bd-hubs.js';

type BdDensifyHub = {
  icao: string;
  name: string;
  region: BdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave C Asia densify (+1). */
export const BD_DENSIFY_HUBS: readonly BdDensifyHub[] = [
  {
    icao: 'VGBR',
    name: "Barisal Airport",
    region: 'BD-E',
    hubTier: 'spoke',
    lat: 22.801,
    lon: 90.3012,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const BD_DENSIFY_HUB_COUNT = BD_DENSIFY_HUBS.length;
