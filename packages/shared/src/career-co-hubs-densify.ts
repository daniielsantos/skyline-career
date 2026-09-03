/**
 * Colombia densify — commercial SK* airports (MSFS + SimBrief).
 * Merged into CO_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CoCareerRegion } from './career-co-hubs.js';

type CoDensifyHub = {
  icao: string;
  name: string;
  region: CoCareerRegion;
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

const citySpoke = {
  produce: { general: 1.2, electronics: 1.05, supplies: 1.0 },
  consume: { perishables: 1.1, machinery: 0.9 },
} as const;

/** CO densify (+26) → 42 total. SKPV remains Providencia (not Riohacha). */
export const CO_DENSIFY_HUBS: readonly CoDensifyHub[] = [
  {
    icao: 'SKMD',
    name: 'Enrique Olaya Herrera Medellin',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 6.2205,
    lon: -75.5906,
    ...citySpoke,
  },
  {
    icao: 'SKSP',
    name: 'Gustavo Rojas Pinilla San Andres',
    region: 'CO-N',
    hubTier: 'regional',
    lat: 12.5836,
    lon: -81.7112,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.9 },
  },
  {
    icao: 'SKPV',
    name: 'El Embrujo Providencia',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 13.3569,
    lon: -81.3583,
    ...drySpoke,
  },
  {
    icao: 'SKIB',
    name: 'Perales Ibague',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 4.4214,
    lon: -75.1333,
    ...agroSpoke,
  },
  {
    icao: 'SKNV',
    name: 'Benito Salas Neiva',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 2.9502,
    lon: -75.294,
    ...agroSpoke,
  },
  {
    icao: 'SKYP',
    name: 'El Yopal',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 5.3191,
    lon: -72.384,
    produce: { machinery: 1.2, general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SKFL',
    name: 'Gustavo Artunduaga Florencia',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 1.5892,
    lon: -75.5644,
    ...agroSpoke,
  },
  {
    icao: 'SKVP',
    name: 'Alfonso Lopez Valledupar',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 10.435,
    lon: -73.2494,
    ...agroSpoke,
  },
  {
    icao: 'SKVV',
    name: 'La Vanguardia Villavicencio',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 4.1679,
    lon: -73.6138,
    ...agroSpoke,
  },
  {
    icao: 'SKPP',
    name: 'Guillermo Leon Valencia Popayan',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 2.4544,
    lon: -76.6092,
    ...agroSpoke,
  },
  // Wave C densify (+16)
  {
    icao: 'SKCZ',
    name: 'Corozal Las Brujas',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 9.3327,
    lon: -75.2856,
    ...agroSpoke,
  },
  {
    icao: 'SKLM',
    name: 'Maicao Jorge Isaac',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 11.2325,
    lon: -72.4901,
    ...drySpoke,
  },
  {
    icao: 'SKCO',
    name: 'Tumaco La Florida',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 1.8144,
    lon: -78.7492,
    ...agroSpoke,
  },
  {
    icao: 'SKUI',
    name: 'Quibdo El Carano',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 5.6908,
    lon: -76.6412,
    ...agroSpoke,
  },
  {
    icao: 'SKLC',
    name: 'Carepa Antonio Roldan Betancur',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 7.812,
    lon: -76.7164,
    ...agroSpoke,
  },
  {
    icao: 'SKIP',
    name: 'Ipiales San Luis',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 0.8619,
    lon: -77.6718,
    ...agroSpoke,
  },
  {
    icao: 'SKGP',
    name: 'Guapi',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 2.5701,
    lon: -77.898,
    ...agroSpoke,
  },
  {
    icao: 'SKBS',
    name: 'Bahia Solano Jose Celestino Mutis',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 6.2029,
    lon: -77.3947,
    ...agroSpoke,
  },
  {
    icao: 'SKEJ',
    name: 'Barrancabermeja Yariguies',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 7.0243,
    lon: -73.8068,
    produce: { machinery: 1.25, general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SKPI',
    name: 'Pitalito',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 1.8578,
    lon: -76.0857,
    ...agroSpoke,
  },
  {
    icao: 'SKAS',
    name: 'Puerto Asis Tres De Mayo',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 0.5052,
    lon: -76.5008,
    ...agroSpoke,
  },
  {
    icao: 'SKUC',
    name: 'Arauca Santiago Perez',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 7.0689,
    lon: -70.7369,
    ...agroSpoke,
  },
  {
    icao: 'SKPC',
    name: 'Puerto Carreno German Olano',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 6.1847,
    lon: -67.4932,
    ...drySpoke,
  },
  {
    icao: 'SKPD',
    name: 'Puerto Inirida Obando Cesar Gaviria',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 3.8535,
    lon: -67.9062,
    ...drySpoke,
  },
  {
    icao: 'SKMU',
    name: 'Mitu Fabio Alberto Leon Bentley',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 1.2537,
    lon: -70.2339,
    ...agroSpoke,
  },
  {
    icao: 'SKSJ',
    name: 'San Jose del Guaviare Jorge E Gonzalez Torres',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 2.5797,
    lon: -72.6394,
    ...agroSpoke,
  },
];

export const CO_DENSIFY_HUB_COUNT = CO_DENSIFY_HUBS.length;
