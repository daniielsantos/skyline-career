/**
 * Costa Rica densify — commercial MR* airports (MSFS + SimBrief).
 * Merged into CR_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CrCareerRegion } from './career-cr-hubs.js';

type CrDensifyHub = {
  icao: string;
  name: string;
  region: CrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.4, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
} as const;

const tourismSpoke = {
  produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

/** CR densify (+7) → 14 total. Skip MRQP (remaps MRNS). */
export const CR_DENSIFY_HUBS: readonly CrDensifyHub[] = [
  {
    icao: 'MRCR',
    name: 'Carrillo Guanacaste',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 9.8667,
    lon: -85.4814,
    ...tourismSpoke,
  },
  {
    icao: 'MRTM',
    name: 'Tamarindo',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 10.3145,
    lon: -85.8147,
    ...tourismSpoke,
  },
  {
    icao: 'MRBT',
    name: 'Tortuguero',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 10.5694,
    lon: -83.5153,
    ...agroSpoke,
  },
  // Wave C densify (+4)
  {
    icao: 'MRAN',
    name: 'La Fortuna Arenal',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 10.4693,
    lon: -84.5791,
    ...tourismSpoke,
  },
  {
    icao: 'MRPJ',
    name: 'Puerto Jimenez',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 8.5333,
    lon: -83.3,
    ...tourismSpoke,
  },
  {
    icao: 'MRDK',
    name: 'Drake Bay',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 8.7189,
    lon: -83.6417,
    ...tourismSpoke,
  },
  {
    icao: 'MRSI',
    name: 'San Isidro del General',
    region: 'CR-C',
    hubTier: 'spoke',
    lat: 9.3487,
    lon: -83.7123,
    ...agroSpoke,
  },
];

export const CR_DENSIFY_HUB_COUNT = CR_DENSIFY_HUBS.length;
