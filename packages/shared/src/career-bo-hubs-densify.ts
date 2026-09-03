/**
 * Bolivia densify — commercial SL* airports (MSFS + SimBrief).
 * Merged into BO_CAREER_HUBS. No bush strips.
 * Skip SLRI / SLET.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { BoCareerRegion } from './career-bo-hubs.js';

type BoDensifyHub = {
  icao: string;
  name: string;
  region: BoCareerRegion;
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

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** BO densify (+12) → 21 total. Skip SLRI/SLET; Potosi is SLPO (already seeded); Yacuiba is SLYA not SLYG. */
export const BO_DENSIFY_HUBS: readonly BoDensifyHub[] = [
  {
    icao: 'SLSB',
    name: 'Capitan German Quiroga San Borja',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -14.8592,
    lon: -66.7375,
    ...agroSpoke,
  },
  {
    icao: 'SLRQ',
    name: 'Rurrenabaque',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -14.4279,
    lon: -67.4979,
    produce: { general: 1.05, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SLBJ',
    name: 'Bermejo',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -22.7733,
    lon: -64.3128,
    ...agroSpoke,
  },
  {
    icao: 'SLYA',
    name: 'Yacuiba',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -21.9609,
    lon: -63.6517,
    ...agroSpoke,
  },
  {
    icao: 'SLPS',
    name: 'Puerto Suarez Capitan Av Salvador Ogaya',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -18.9753,
    lon: -57.8206,
    ...drySpoke,
  },
  // Wave C densify (+7)
  {
    icao: 'SLAL',
    name: 'Sucre Alcantari',
    region: 'BO-W',
    hubTier: 'regional',
    lat: -19.2468,
    lon: -65.1496,
    ...drySpoke,
  },
  {
    icao: 'SLUY',
    name: 'Uyuni Joya Andina',
    region: 'BO-W',
    hubTier: 'spoke',
    lat: -20.4413,
    lon: -66.8576,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SLHI',
    name: 'Chimore',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -16.9768,
    lon: -65.1456,
    ...agroSpoke,
  },
  {
    icao: 'SLSA',
    name: 'Santa Ana del Yacuma',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -13.7622,
    lon: -65.4352,
    ...agroSpoke,
  },
  {
    icao: 'SLVM',
    name: 'Villamontes Rafael Pabon',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -21.2552,
    lon: -63.4056,
    ...agroSpoke,
  },
  {
    icao: 'SLJE',
    name: 'San Jose de Chiquitos',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -17.8308,
    lon: -60.7431,
    ...agroSpoke,
  },
  {
    icao: 'SLSI',
    name: 'San Ignacio de Velasco Juan Cochamanidis',
    region: 'BO-E',
    hubTier: 'spoke',
    lat: -16.3872,
    lon: -60.9623,
    ...agroSpoke,
  },
];

export const BO_DENSIFY_HUB_COUNT = BO_DENSIFY_HUBS.length;
