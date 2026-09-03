/**
 * Haiti densify — commercial MT* airports (MSFS + SimBrief).
 * Merged into HT_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { HtCareerRegion } from './career-ht-hubs.js';

type HtDensifyHub = {
  icao: string;
  name: string;
  region: HtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.3, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.9 },
} as const;

/** HT densify (+3) → 6 total. */
export const HT_DENSIFY_HUBS: readonly HtDensifyHub[] = [
  {
    icao: 'MTJA',
    name: 'Jacmel',
    region: 'HT-C',
    hubTier: 'spoke',
    lat: 18.2411,
    lon: -72.5185,
    ...agroSpoke,
  },
  // Wave C densify (+2)
  {
    icao: 'MTJE',
    name: 'Jeremie',
    region: 'HT-C',
    hubTier: 'spoke',
    lat: 18.6631,
    lon: -74.1703,
    ...agroSpoke,
  },
  {
    icao: 'MTPX',
    name: 'Port-de-Paix',
    region: 'HT-C',
    hubTier: 'spoke',
    lat: 19.934,
    lon: -72.848,
    ...agroSpoke,
  },
];

export const HT_DENSIFY_HUB_COUNT = HT_DENSIFY_HUBS.length;
