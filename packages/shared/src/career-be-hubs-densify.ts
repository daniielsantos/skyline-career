/**
 * Belgium densify — commercial EB* airports (MSFS + SimBrief).
 * Merged into BE_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { BeCareerRegion } from './career-be-hubs.js';

type BeDensifyHub = {
  icao: string;
  name: string;
  region: BeCareerRegion;
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

const cargoRegional = {
  produce: { general: 1.35, machinery: 1.2, electronics: 1.1 },
  consume: { perishables: 1.1, supplies: 1.05 },
} as const;

/** BE densify (+5) → 8 total. */
export const BE_DENSIFY_HUBS: readonly BeDensifyHub[] = [
  {
    icao: 'EBLG',
    name: 'Liege',
    region: 'BE-C',
    hubTier: 'regional',
    lat: 50.6374,
    lon: 5.44333,
    ...cargoRegional,
  },
  {
    icao: 'EBOS',
    name: 'Ostend Bruges',
    region: 'BE-C',
    hubTier: 'regional',
    lat: 51.1989,
    lon: 2.86222,
    produce: { general: 1.25, perishables: 1.15, machinery: 1.1 },
    consume: { electronics: 1.0, supplies: 1.0 },
  },
  {
    icao: 'EBKT',
    name: 'Kortrijk Wevelgem',
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 50.8172,
    lon: 3.20472,
    ...drySpoke,
  },
  {
    icao: 'EBZR',
    name: 'Oostmalle',
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 51.2647,
    lon: 4.75333,
    ...drySpoke,
  },
  {
    icao: 'EBSP',
    name: 'Spa La Sauveniere',
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 50.4825,
    lon: 5.91028,
    produce: { perishables: 1.15, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },

  // Wave 2 EU-1 densify (+5)
  {
    icao: 'EBCV',
    name: "Chièvres Air Base",
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 50.5758,
    lon: 3.831,
    produce: { perishables: 1.35, general: 1.1, supplies: 1 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EBBE',
    name: "Beauvechain Air Base",
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 50.7586,
    lon: 4.76833,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EBBL',
    name: "Kleine Brogel Air Base",
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 51.1683,
    lon: 5.47,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EBFN',
    name: "Koksijde Air Base",
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 51.0903,
    lon: 2.65278,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EBFS',
    name: "Florennes Air Base",
    region: 'BE-C',
    hubTier: 'spoke',
    lat: 50.2433,
    lon: 4.64583,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const BE_DENSIFY_HUB_COUNT = BE_DENSIFY_HUBS.length;
