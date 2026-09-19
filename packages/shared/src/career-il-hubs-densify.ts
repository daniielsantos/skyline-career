/**
 * IL densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into IL_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { IlCareerRegion } from './career-il-hubs.js';

type IlDensifyHub = {
  icao: string;
  name: string;
  region: IlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+1). */
export const IL_DENSIFY_HUBS: readonly IlDensifyHub[] = [
  {
    icao: 'LLEK',
    name: "Tel Nof Air Base",
    region: 'IL-C',
    hubTier: 'spoke',
    lat: 31.8395,
    lon: 34.8218,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const IL_DENSIFY_HUB_COUNT = IL_DENSIFY_HUBS.length;
