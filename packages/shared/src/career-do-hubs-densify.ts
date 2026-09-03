/**
 * Dominican Republic densify — commercial MD* airports (MSFS + SimBrief).
 * Merged into DO_CAREER_HUBS. No bush; skip MDJB.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { DoCareerRegion } from './career-do-hubs.js';

type DoDensifyHub = {
  icao: string;
  name: string;
  region: DoCareerRegion;
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

const tourismSpoke = {
  produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

/** DO densify (+4) → 10 total. */
export const DO_DENSIFY_HUBS: readonly DoDensifyHub[] = [
  {
    icao: 'MDBH',
    name: 'Barahona',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 18.2515,
    lon: -71.1204,
    ...agroSpoke,
  },
  {
    icao: 'MDAB',
    name: 'Arroyo Barril Samana',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 19.1986,
    lon: -69.4297,
    ...tourismSpoke,
  },
  // Wave C densify (+2)
  {
    icao: 'MDCZ',
    name: 'Constanza Expedicion 14 de Junio',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 18.9075,
    lon: -70.7219,
    ...agroSpoke,
  },
  {
    icao: 'MDCR',
    name: 'Cabo Rojo',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 17.929,
    lon: -71.6448,
    ...agroSpoke,
  },
];

export const DO_DENSIFY_HUB_COUNT = DO_DENSIFY_HUBS.length;
