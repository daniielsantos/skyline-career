/**
 * Cuba densify — commercial MU* airports (MSFS + SimBrief).
 * Merged into CU_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CuCareerRegion } from './career-cu-hubs.js';

type CuDensifyHub = {
  icao: string;
  name: string;
  region: CuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.9 },
} as const;

const islandSpoke = {
  produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

/** CU densify (+10) → 17 total. */
export const CU_DENSIFY_HUBS: readonly CuDensifyHub[] = [
  {
    icao: 'MUCL',
    name: 'Cayo Largo del Sur',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 21.6165,
    lon: -81.545,
    ...islandSpoke,
  },
  {
    icao: 'MUBY',
    name: 'Bayamo',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.3964,
    lon: -76.6214,
    ...agroSpoke,
  },
  {
    icao: 'MUMZ',
    name: 'Manzanillo Sierra Maestra',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.2881,
    lon: -77.0875,
    ...agroSpoke,
  },
  {
    icao: 'MUNG',
    name: 'Nueva Gerona',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 21.8347,
    lon: -82.7839,
    ...islandSpoke,
  },
  // Wave C densify (+6)
  {
    icao: 'MUCC',
    name: 'Cayo Coco Jardines Del Rey',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 22.461,
    lon: -78.3284,
    ...islandSpoke,
  },
  {
    icao: 'MUTD',
    name: 'Trinidad Alberto Delgado',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 21.7883,
    lon: -79.9972,
    ...agroSpoke,
  },
  {
    icao: 'MUVT',
    name: 'Las Tunas Hermanos Ameijeiras',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.9876,
    lon: -76.9358,
    ...agroSpoke,
  },
  {
    icao: 'MUGT',
    name: 'Guantanamo Mariana Grajales',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.0853,
    lon: -75.1583,
    ...agroSpoke,
  },
  {
    icao: 'MUBA',
    name: 'Baracoa Gustavo Rizo',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.3653,
    lon: -74.5062,
    ...agroSpoke,
  },
  {
    icao: 'MUMO',
    name: 'Moa Orestes Acosta',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.6539,
    lon: -74.9222,
    produce: { machinery: 1.25, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
];

export const CU_DENSIFY_HUB_COUNT = CU_DENSIFY_HUBS.length;
