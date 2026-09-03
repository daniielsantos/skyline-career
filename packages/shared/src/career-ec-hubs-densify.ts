/**
 * Ecuador densify — commercial SE* airports (MSFS + SimBrief).
 * Merged into EC_CAREER_HUBS. No bush strips.
 * Keep Quito as SEQU only (do not add SEQM).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { EcCareerRegion } from './career-ec-hubs.js';

type EcDensifyHub = {
  icao: string;
  name: string;
  region: EcCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

const amazonSpoke = {
  produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

/** EC densify (+11) → 20 total. Skip SETR. */
export const EC_DENSIFY_HUBS: readonly EcDensifyHub[] = [
  {
    icao: 'SEMC',
    name: 'Macas',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -2.2992,
    lon: -78.1208,
    ...agroSpoke,
  },
  {
    icao: 'SENL',
    name: 'Nueva Loja Lago Agrio',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: 0.0931,
    lon: -76.8678,
    produce: { machinery: 1.25, general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.1, electronics: 0.9 },
  },
  {
    icao: 'SECO',
    name: 'Francisco de Orellana Coca',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -0.4622,
    lon: -76.9867,
    ...amazonSpoke,
  },
  {
    icao: 'SEST',
    name: 'San Cristobal Galapagos',
    region: 'EC-C',
    hubTier: 'spoke',
    lat: -0.9102,
    lon: -89.6174,
    produce: { general: 1.1, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.9 },
  },
  // Wave C densify (+7)
  {
    icao: 'SETN',
    name: 'Esmeraldas Carlos Concha Torres',
    region: 'EC-C',
    hubTier: 'regional',
    lat: 0.9785,
    lon: -79.6266,
    ...agroSpoke,
  },
  {
    icao: 'SEII',
    name: 'Isabela General Villamil',
    region: 'EC-C',
    hubTier: 'spoke',
    lat: -0.9426,
    lon: -90.953,
    produce: { general: 1.1, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.9 },
  },
  {
    icao: 'SEAM',
    name: 'Ambato Chachoan',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -1.2121,
    lon: -78.5746,
    ...agroSpoke,
  },
  {
    icao: 'SECA',
    name: 'Catamayo Ciudad de Catamayo',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -3.9956,
    lon: -79.3719,
    ...agroSpoke,
  },
  {
    icao: 'SEMA',
    name: 'Macara Jose Maria Velasco Ibarra',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -4.3782,
    lon: -79.941,
    ...agroSpoke,
  },
  {
    icao: 'SEJD',
    name: 'Ahuano Jumandy',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -1.0602,
    lon: -77.5805,
    ...amazonSpoke,
  },
  {
    icao: 'SESM',
    name: 'Shell Mera Rio Amazonas',
    region: 'EC-S',
    hubTier: 'spoke',
    lat: -1.5052,
    lon: -78.0627,
    ...amazonSpoke,
  },
];

export const EC_DENSIFY_HUB_COUNT = EC_DENSIFY_HUBS.length;
