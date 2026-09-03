/**
 * Germany densify — commercial ED* airports (MSFS + SimBrief).
 * Spoke/regional belt; no new majors. Merged into DE_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { DeCareerRegion } from './career-de-hubs.js';

type DeDensifyHub = {
  icao: string;
  name: string;
  region: DeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const industrial = {
  produce: { machinery: 1.3, electronics: 1.2, general: 1.15 },
  consume: { perishables: 1.05, supplies: 1.0 },
} as const;

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

const city = {
  produce: { general: 1.2, electronics: 1.1, supplies: 1.0 },
  consume: { perishables: 1.1, machinery: 0.9 },
} as const;

/** DE densify (+12) → 24 total. */
export const DE_DENSIFY_HUBS: readonly DeDensifyHub[] = [
  {
    icao: 'EDDG',
    name: 'Munster Osnabruck',
    region: 'DE-N',
    hubTier: 'spoke',
    lat: 52.1346,
    lon: 7.68483,
    ...industrial,
  },
  {
    icao: 'EDVE',
    name: 'Braunschweig Wolfsburg',
    region: 'DE-N',
    hubTier: 'spoke',
    lat: 52.3192,
    lon: 10.5561,
    ...industrial,
  },
  {
    icao: 'EDHL',
    name: 'Lubeck Blankensee',
    region: 'DE-N',
    hubTier: 'spoke',
    lat: 53.8054,
    lon: 10.7192,
    ...drySpoke,
  },
  {
    icao: 'EDLW',
    name: 'Dortmund',
    region: 'DE-W',
    hubTier: 'regional',
    lat: 51.5183,
    lon: 7.61224,
    ...industrial,
  },
  {
    icao: 'EDLV',
    name: 'Weeze',
    region: 'DE-W',
    hubTier: 'spoke',
    lat: 51.6024,
    lon: 6.14217,
    ...drySpoke,
  },
  {
    icao: 'EDFH',
    name: 'Frankfurt Hahn',
    region: 'DE-W',
    hubTier: 'regional',
    lat: 49.9487,
    lon: 7.26389,
    produce: { general: 1.35, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'EDDR',
    name: 'Saarbrucken',
    region: 'DE-W',
    hubTier: 'spoke',
    lat: 49.2146,
    lon: 7.10951,
    ...city,
  },
  {
    icao: 'EDNY',
    name: 'Friedrichshafen',
    region: 'DE-S',
    hubTier: 'spoke',
    lat: 47.6713,
    lon: 9.51149,
    ...drySpoke,
  },
  {
    icao: 'EDJA',
    name: 'Memmingen',
    region: 'DE-S',
    hubTier: 'spoke',
    lat: 47.9888,
    lon: 10.2395,
    ...drySpoke,
  },
  {
    icao: 'EDSB',
    name: 'Karlsruhe Baden-Baden',
    region: 'DE-S',
    hubTier: 'spoke',
    lat: 48.7794,
    lon: 8.0805,
    ...city,
  },
  {
    icao: 'EDDE',
    name: 'Erfurt Weimar',
    region: 'DE-E',
    hubTier: 'spoke',
    lat: 50.9798,
    lon: 10.9581,
    ...city,
  },
  {
    icao: 'EDAH',
    name: 'Heringsdorf',
    region: 'DE-E',
    hubTier: 'spoke',
    lat: 53.8787,
    lon: 14.1523,
    produce: { perishables: 1.2, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const DE_DENSIFY_HUB_COUNT = DE_DENSIFY_HUBS.length;
