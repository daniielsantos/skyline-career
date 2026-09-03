/**
 * Bulgaria densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into BG_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { BgCareerRegion } from './career-bg-hubs.js';

type BgDensifyHub = {
  icao: string;
  name: string;
  region: BgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** BG densify (+1) — Haskovo LBHS absent in stock MSFS. */
export const BG_DENSIFY_HUBS: readonly BgDensifyHub[] = [
  {
    icao: 'LBGO',
    name: "Gorna Oryahovitsa",
    region: 'BG-C',
    hubTier: 'spoke',
    lat: 43.1514,
    lon: 25.7129,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const BG_DENSIFY_HUB_COUNT = BG_DENSIFY_HUBS.length;
