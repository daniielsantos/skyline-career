/**
 * Peru densify — commercial SP* airports (MSFS + SimBrief).
 * Merged into PE_CAREER_HUBS. No bush strips.
 * Skip SPIM (use SPJC) and SPMS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PeCareerRegion } from './career-pe-hubs.js';

type PeDensifyHub = {
  icao: string;
  name: string;
  region: PeCareerRegion;
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

const amazonRegional = {
  produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
  consume: { electronics: 1.0, machinery: 0.95 },
} as const;

/** PE densify (+18) → 32 total. Juanjui is SPJI (already seeded); SPJJ dropped. */
export const PE_DENSIFY_HUBS: readonly PeDensifyHub[] = [
  {
    icao: 'SPSO',
    name: 'Pisco',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -13.7448,
    lon: -76.2203,
    ...drySpoke,
  },
  {
    icao: 'SPYL',
    name: 'Talara',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -4.576,
    lon: -81.2541,
    produce: { machinery: 1.25, general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SPJR',
    name: 'Cajamarca',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -7.1392,
    lon: -78.4894,
    produce: { machinery: 1.2, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.1, electronics: 0.9 },
  },
  {
    icao: 'SPTU',
    name: 'Puerto Maldonado',
    region: 'PE-S',
    hubTier: 'regional',
    lat: -12.6136,
    lon: -69.2286,
    ...amazonRegional,
  },
  {
    icao: 'SPGM',
    name: 'Tingo Maria',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -9.133,
    lon: -75.95,
    ...agroSpoke,
  },
  {
    icao: 'SPZA',
    name: 'Nazca',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -14.8542,
    lon: -74.9617,
    produce: { general: 1.05, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SPHZ',
    name: 'Anta Huaraz',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -9.3472,
    lon: -77.5983,
    produce: { general: 1.1, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  // Wave C densify (+11)
  {
    icao: 'SPUR',
    name: 'Piura Guillermo Concha Iberico',
    region: 'PE-C',
    hubTier: 'regional',
    lat: -5.2058,
    lon: -80.6164,
    ...drySpoke,
  },
  {
    icao: 'SPEO',
    name: 'Chimbote Jaime Andres de Montreuil',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -9.1496,
    lon: -78.5238,
    ...agroSpoke,
  },
  {
    icao: 'SPME',
    name: 'Tumbes Pedro Canga Rodriguez',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -3.5521,
    lon: -80.3811,
    ...agroSpoke,
  },
  {
    icao: 'SPJE',
    name: 'Jaen Shumba',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -5.5925,
    lon: -78.774,
    ...agroSpoke,
  },
  {
    icao: 'SPPY',
    name: 'Chachapoyas',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -6.2019,
    lon: -77.8562,
    ...agroSpoke,
  },
  {
    icao: 'SPJA',
    name: 'Rioja Juan Simons Vela',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -6.0679,
    lon: -77.16,
    ...amazonRegional,
  },
  {
    icao: 'SPAY',
    name: 'Atalaya Gerardo Perez Pinedo',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -10.7291,
    lon: -73.7665,
    ...amazonRegional,
  },
  {
    icao: 'SPBC',
    name: 'Caballococha',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -3.9169,
    lon: -70.5082,
    ...amazonRegional,
  },
  {
    icao: 'SPMF',
    name: 'Mazamari Nancy Flores Paucar',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -11.3254,
    lon: -74.5356,
    ...agroSpoke,
  },
  {
    icao: 'SPLO',
    name: 'Ilo Jorge Fernandez Maldon',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -17.695,
    lon: -71.344,
    produce: { machinery: 1.2, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SPJN',
    name: 'San Juan de Marcona',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -15.3575,
    lon: -75.135,
    ...drySpoke,
  },
];

export const PE_DENSIFY_HUB_COUNT = PE_DENSIFY_HUBS.length;
