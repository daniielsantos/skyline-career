/**
 * Chile densify — commercial SC* airports (MSFS + SimBrief).
 * Merged into CL_CAREER_HUBS. No bush strips.
 * Never SCCD/SCSN/SCST/SCTC (remap traps — not Dispatch airports).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ClCareerRegion } from './career-cl-hubs.js';

type ClDensifyHub = {
  icao: string;
  name: string;
  region: ClCareerRegion;
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

const miningSpoke = {
  produce: { machinery: 1.35, electronics: 1.05, general: 1.05 },
  consume: { perishables: 1.1, supplies: 1.0 },
} as const;

const tourismRegional = {
  produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
  consume: { electronics: 1.0, machinery: 0.9 },
} as const;

/** CL densify (+21) → 42 total. */
export const CL_DENSIFY_HUBS: readonly ClDensifyHub[] = [
  {
    icao: 'SCIP',
    name: 'Mataveri Easter Island',
    region: 'CL-C',
    hubTier: 'regional',
    lat: -27.1645,
    lon: -109.422,
    ...tourismRegional,
  },
  {
    icao: 'SCGE',
    name: 'Maria Dolores Los Angeles',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -37.4017,
    lon: -72.4254,
    produce: { perishables: 1.3, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SCES',
    name: 'Ricardo Garcia Blanco El Salvador',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -26.3111,
    lon: -69.7652,
    ...miningSpoke,
  },
  {
    icao: 'SCLL',
    name: 'Vallenar',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -28.5964,
    lon: -70.7561,
    ...miningSpoke,
  },
  {
    icao: 'SCPC',
    name: 'Pucon',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -39.2928,
    lon: -71.9156,
    produce: { general: 1.05, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SCTL',
    name: 'Talca Panguilemo',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -35.3778,
    lon: -71.6017,
    produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SCRD',
    name: 'Rodelillo',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -33.0681,
    lon: -71.5578,
    ...drySpoke,
  },
  {
    icao: 'SCSF',
    name: 'San Felipe',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -32.7456,
    lon: -70.705,
    produce: { perishables: 1.25, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  // Wave C densify (+13)
  {
    icao: 'SCBE',
    name: 'Barriles Tocopilla',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -22.1411,
    lon: -70.0629,
    ...miningSpoke,
  },
  {
    icao: 'SCRA',
    name: 'Chanaral',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -26.3325,
    lon: -70.6073,
    ...miningSpoke,
  },
  {
    icao: 'SCTT',
    name: 'Las Breas Taltal',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -25.5643,
    lon: -70.3759,
    ...miningSpoke,
  },
  {
    icao: 'SCKP',
    name: 'Coposa Pica',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -20.7505,
    lon: -68.6835,
    ...miningSpoke,
  },
  {
    icao: 'SCOV',
    name: 'Ovalle El Tuqui',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -30.5592,
    lon: -71.1756,
    produce: { perishables: 1.3, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SCLN',
    name: 'Linares Municipal',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -35.8617,
    lon: -71.5486,
    produce: { perishables: 1.3, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SCTO',
    name: 'Victoria',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -38.2456,
    lon: -72.3486,
    produce: { perishables: 1.25, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SCTN',
    name: 'Nuevo Chaiten',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -42.7819,
    lon: -72.835,
    ...tourismRegional,
  },
  {
    icao: 'SCFT',
    name: 'Futaleufu',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -43.1892,
    lon: -71.8511,
    ...tourismRegional,
  },
  {
    icao: 'SCAS',
    name: 'Puerto Aysen Cabo Juan Roman',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -45.3992,
    lon: -72.6703,
    ...drySpoke,
  },
  {
    icao: 'SCCC',
    name: 'Chile Chico',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -46.5831,
    lon: -71.6863,
    ...drySpoke,
  },
  {
    icao: 'SCHR',
    name: 'Cochrane',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -47.2436,
    lon: -72.5881,
    ...drySpoke,
  },
  {
    icao: 'SCFM',
    name: 'Porvenir Captain Fuentes Martinez',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -53.2537,
    lon: -70.3192,
    ...drySpoke,
  },
];

export const CL_DENSIFY_HUB_COUNT = CL_DENSIFY_HUBS.length;
