/**
 * AE densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into AE_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { AeCareerRegion } from './career-ae-hubs.js';

type AeDensifyHub = {
  icao: string;
  name: string;
  region: AeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+3). */
export const AE_DENSIFY_HUBS: readonly AeDensifyHub[] = [
  {
    icao: 'OMDW',
    name: "Al Maktoum International Airport",
    region: 'AE-N',
    hubTier: 'spoke',
    lat: 24.89617,
    lon: 55.16235,
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1 },
  },
  {
    icao: 'OMAM',
    name: "Al Dhafra Air Base",
    region: 'AE-N',
    hubTier: 'spoke',
    lat: 24.2482,
    lon: 54.5477,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'OMBY',
    name: "Sir Bani Yas Airport",
    region: 'AE-N',
    hubTier: 'spoke',
    lat: 24.28361,
    lon: 52.58028,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const AE_DENSIFY_HUB_COUNT = AE_DENSIFY_HUBS.length;
