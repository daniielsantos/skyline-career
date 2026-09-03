/**
 * Netherlands densify — commercial EH* airports (MSFS + SimBrief).
 * Merged into NL_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NlCareerRegion } from './career-nl-hubs.js';

type NlDensifyHub = {
  icao: string;
  name: string;
  region: NlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

const industrial = {
  produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
  consume: { perishables: 1.05, supplies: 1.0 },
} as const;

/** NL densify (+6) → 10 total. */
export const NL_DENSIFY_HUBS: readonly NlDensifyHub[] = [
  {
    icao: 'EHBK',
    name: 'Maastricht Aachen',
    region: 'NL-C',
    hubTier: 'regional',
    lat: 50.9117,
    lon: 5.77014,
    ...industrial,
  },
  {
    icao: 'EHLE',
    name: 'Lelystad',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.4603,
    lon: 5.52722,
    ...drySpoke,
  },
  {
    icao: 'EHTW',
    name: 'Enschede Twente',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.2758,
    lon: 6.88917,
    ...drySpoke,
  },
  {
    icao: 'EHTE',
    name: 'Teuge',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.2447,
    lon: 6.04667,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHSE',
    name: 'Breda Seppe',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.5547,
    lon: 4.5525,
    ...drySpoke,
  },
  {
    icao: 'EHBD',
    name: 'Weert Budel',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.2553,
    lon: 5.60139,
    ...drySpoke,
  },
];

export const NL_DENSIFY_HUB_COUNT = NL_DENSIFY_HUBS.length;
