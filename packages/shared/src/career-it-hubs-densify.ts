/**
 * Italy densify — commercial LI* airports (MSFS + SimBrief).
 * Merged into IT_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ItCareerRegion } from './career-it-hubs.js';

type ItDensifyHub = {
  icao: string;
  name: string;
  region: ItCareerRegion;
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
  produce: { perishables: 1.35, general: 1.15, supplies: 1.0 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

const industrial = {
  produce: { machinery: 1.3, electronics: 1.2, general: 1.15 },
  consume: { perishables: 1.05, supplies: 1.0 },
} as const;

/** IT densify (+10) → 22 total. */
export const IT_DENSIFY_HUBS: readonly ItDensifyHub[] = [
  {
    icao: 'LIMF',
    name: 'Turin Caselle',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 45.2008,
    lon: 7.64981,
    ...industrial,
  },
  {
    icao: 'LIPX',
    name: 'Verona Villafranca',
    region: 'IT-N',
    hubTier: 'spoke',
    lat: 45.3957,
    lon: 10.8885,
    ...agro,
  },
  {
    icao: 'LIPY',
    name: 'Ancona Falconara',
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 43.6163,
    lon: 13.3623,
    ...agro,
  },
  {
    icao: 'LIRP',
    name: 'Pisa',
    region: 'IT-C',
    hubTier: 'regional',
    lat: 43.6839,
    lon: 10.3927,
    produce: { general: 1.2, electronics: 1.1, perishables: 1.1 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LIBP',
    name: 'Pescara',
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 42.4317,
    lon: 14.1811,
    ...drySpoke,
  },
  {
    icao: 'LIBR',
    name: 'Brindisi',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 40.6576,
    lon: 17.947,
    ...agro,
  },
  {
    icao: 'LICA',
    name: 'Lamezia Terme',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 38.9054,
    lon: 16.2423,
    ...agro,
  },
  {
    icao: 'LIEE',
    name: 'Cagliari Elmas',
    region: 'IT-S',
    hubTier: 'regional',
    lat: 39.2515,
    lon: 9.05428,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LIEA',
    name: 'Alghero Fertilia',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 40.6321,
    lon: 8.29077,
    ...drySpoke,
  },
  {
    icao: 'LICD',
    name: 'Lampedusa',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 35.4979,
    lon: 12.6181,
    produce: { perishables: 1.15, general: 1.0, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const IT_DENSIFY_HUB_COUNT = IT_DENSIFY_HUBS.length;
