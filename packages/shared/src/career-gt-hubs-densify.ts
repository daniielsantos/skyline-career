/**
 * Guatemala densify — commercial MG* airports (MSFS + SimBrief).
 * Merged into GT_CAREER_HUBS. No bush strips.
 * Wave A candidates MGTK/MGAV dropped: MGTK duplicates MGMM; MGAV absent in stock MSFS.
 * Skip MGHT (remaps MGRT).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GtCareerRegion } from './career-gt-hubs.js';

type GtDensifyHub = {
  icao: string;
  name: string;
  region: GtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
} as const;

const coastalSpoke = {
  produce: { general: 1.2, machinery: 1.1, perishables: 1.05 },
  consume: { electronics: 0.95, supplies: 0.95 },
} as const;

/** GT densify (+4) → 10 total. */
export const GT_DENSIFY_HUBS: readonly GtDensifyHub[] = [
  {
    icao: 'MGPB',
    name: 'Puerto Barrios',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 15.7309,
    lon: -88.5838,
    ...coastalSpoke,
  },
  {
    icao: 'MGQC',
    name: 'Santa Cruz del Quiche',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 15.0122,
    lon: -91.1506,
    ...agroSpoke,
  },
  {
    icao: 'MGPP',
    name: 'Poptun',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 16.3258,
    lon: -89.4161,
    ...agroSpoke,
  },
  {
    icao: 'MGZA',
    name: 'Zacapa',
    region: 'GT-C',
    hubTier: 'spoke',
    lat: 14.96,
    lon: -89.53,
    ...agroSpoke,
  },
];

export const GT_DENSIFY_HUB_COUNT = GT_DENSIFY_HUBS.length;
