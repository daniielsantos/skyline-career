/**
 * Spain densify — commercial LE* airports (MSFS + SimBrief).
 * Light inland/island fill. Merged into ES_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { EsCareerRegion } from './career-es-hubs.js';

type EsDensifyHub = {
  icao: string;
  name: string;
  region: EsCareerRegion;
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

const agro = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** ES densify (+8) → 23 total. */
export const ES_DENSIFY_HUBS: readonly EsDensifyHub[] = [
  {
    icao: 'LESO',
    name: 'San Sebastian',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 43.3565,
    lon: -1.79061,
    ...drySpoke,
  },
  {
    icao: 'LEST',
    name: 'Santiago',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 42.8963,
    lon: -8.41514,
    ...agro,
  },
  {
    icao: 'LEVC',
    name: 'Valencia',
    region: 'ES-E',
    hubTier: 'regional',
    lat: 39.4893,
    lon: -0.481625,
    produce: { perishables: 1.3, general: 1.25, electronics: 1.1 },
    consume: { machinery: 1.0, supplies: 1.05 },
  },
  {
    icao: 'LEIB',
    name: 'Ibiza',
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 38.8729,
    lon: 1.37312,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.9 },
  },
  {
    icao: 'LEMH',
    name: 'Menorca',
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 39.8626,
    lon: 4.21865,
    ...drySpoke,
  },
  {
    icao: 'LEAM',
    name: 'Almeria',
    region: 'ES-S',
    hubTier: 'spoke',
    lat: 36.8439,
    lon: -2.3701,
    ...agro,
  },
  {
    icao: 'LEJR',
    name: 'Jerez',
    region: 'ES-S',
    hubTier: 'spoke',
    lat: 36.7446,
    lon: -6.06011,
    ...agro,
  },
  {
    icao: 'LEAB',
    name: 'Albacete',
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 38.9485,
    lon: -1.86352,
    ...drySpoke,
  },
];

export const ES_DENSIFY_HUB_COUNT = ES_DENSIFY_HUBS.length;
