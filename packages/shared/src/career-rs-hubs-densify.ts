/**
 * Serbia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into RS_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { RsCareerRegion } from './career-rs-hubs.js';

type RsDensifyHub = {
  icao: string;
  name: string;
  region: RsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** RS densify (+2). */
export const RS_DENSIFY_HUBS: readonly RsDensifyHub[] = [
  {
    icao: 'LYBT',
    name: "Batajnica",
    region: 'RS-C',
    hubTier: 'spoke',
    lat: 44.9353,
    lon: 20.2575,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LYUZ',
    name: "Uzice Ponikve",
    region: 'RS-C',
    hubTier: 'spoke',
    lat: 43.8989,
    lon: 19.6977,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
];

export const RS_DENSIFY_HUB_COUNT = RS_DENSIFY_HUBS.length;
