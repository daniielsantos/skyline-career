/**
 * Fj densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into FJ_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { FjCareerRegion } from './career-fj-hubs.js';

type FjDensifyHub = {
  icao: string;
  name: string;
  region: FjCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Oceania densify (+2). */
export const FJ_DENSIFY_HUBS: readonly FjDensifyHub[] = [
  {
    icao: 'NFNL',
    name: "Labasa Airport",
    region: 'FJ-W',
    hubTier: 'spoke',
    lat: -16.4667,
    lon: 179.34,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'NFNA',
    name: "Nausori International Airport",
    region: 'FJ-W',
    hubTier: 'spoke',
    lat: -18.04423,
    lon: 178.56149,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const FJ_DENSIFY_HUB_COUNT = FJ_DENSIFY_HUBS.length;
