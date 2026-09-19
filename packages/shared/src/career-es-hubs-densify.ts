/**
 * Spain densify — commercial LE* airports (MSFS + SimBrief).
 * Light inland/island fill. Merged into ES_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { EsCareerRegion } from './career-es-hubs.js';

type EsDensifyHub = {
  icao: string;
  name: string;
  region: EsCareerRegion;
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

const agro = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** ES densify (+18) → 33 total (incl. Wave 1 +7). */
export const ES_DENSIFY_HUBS: readonly EsDensifyHub[] = [
  {
    icao: 'LESO',
    name: 'San Sebastian',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 43.3565,
    lon: -1.79061,
    ...drySpoke,
  },
  {
    icao: 'LEST',
    name: 'Santiago',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 42.8963,
    lon: -8.41514,
    ...agro,
  },
  {
    icao: 'LEVC',
    name: 'Valencia',
    region: 'ES-E',
    hubTier: 'regional',
    lat: 39.4893,
    lon: -0.481625,
    produce: { perishables: 1.3, general: 1.25, electronics: 1.1 },
    consume: { machinery: 1.0, supplies: 1.05 },
  },
  {
    icao: 'LEIB',
    name: 'Ibiza',
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 38.8729,
    lon: 1.37312,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.9 },
  },
  {
    icao: 'LEMH',
    name: 'Menorca',
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 39.8626,
    lon: 4.21865,
    ...drySpoke,
  },
  {
    icao: 'LEAM',
    name: 'Almeria',
    region: 'ES-S',
    hubTier: 'spoke',
    lat: 36.8439,
    lon: -2.3701,
    ...agro,
  },
  {
    icao: 'LEJR',
    name: 'Jerez',
    region: 'ES-S',
    hubTier: 'spoke',
    lat: 36.7446,
    lon: -6.06011,
    ...agro,
  },
  {
    icao: 'LEAB',
    name: 'Albacete',
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 38.9485,
    lon: -1.86352,
    ...drySpoke,
  },
  {
    icao: 'GCRR',
    name: "César Manrique-Lanzarote Airport",
    region: 'ES-S',
    hubTier: 'regional',
    lat: 28.9455,
    lon: -13.6052,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'GCFV',
    name: "Fuerteventura Airport",
    region: 'ES-S',
    hubTier: 'regional',
    lat: 28.4527,
    lon: -13.8638,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'LEGE',
    name: "Girona-Costa Brava Airport",
    region: 'ES-N',
    hubTier: 'regional',
    lat: 41.90464,
    lon: 2.76177,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  // Wave 1 EU-1 densify (+7)
  {
    // Homolog: LEZG absent stock MSFS → Burgos commercial fill
    icao: 'LEBG',
    name: 'Burgos',
    region: 'ES-N',
    hubTier: 'regional',
    lat: 42.3575,
    lon: -3.61361,
    ...agro,
  },
  {
    icao: 'LEPP',
    name: 'Pamplona',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 42.77,
    lon: -1.6464,
    ...drySpoke,
  },
  {
    icao: 'LERJ',
    name: 'Logrono Agoncillo',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 42.4606,
    lon: -2.3206,
    ...agro,
  },
  {
    icao: 'LEVT',
    name: 'Vitoria',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 42.8828,
    lon: -2.7244,
    produce: { machinery: 1.25, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    // Homolog: LEBZ absent stock MSFS → Leon commercial fill
    icao: 'LELN',
    name: 'Leon',
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 42.5886,
    lon: -5.65611,
    ...drySpoke,
  },
  {
    icao: 'LECH',
    name: 'Castellon Costa Azahar',
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 40.2142,
    lon: 0.0736,
    ...agro,
  },
  {
    icao: 'LESA',
    name: 'Salamanca Matacan',
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 40.9519,
    lon: -5.5019,
    ...drySpoke,
  },


  // Wave 2 EU-1 densify (+12)
  {
    icao: 'LERS',
    name: "Reus Airport",
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 41.14751,
    lon: 1.16835,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    // Homolog: LELC San Javier absent stock MSFS → Teruel commercial fill
    icao: 'LETL',
    name: 'Teruel Airport',
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 40.41027,
    lon: -1.21737,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'LEMI',
    name: "Region of Murcia International Airport",
    region: 'ES-S',
    hubTier: 'regional',
    lat: 37.80285,
    lon: -1.12488,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'LEXJ',
    name: "Seve Ballesteros-Santander Airport",
    region: 'ES-N',
    hubTier: 'spoke',
    lat: 43.4271,
    lon: -3.82001,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'LECU',
    name: "Madrid-Cuatro Vientos Airport",
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 40.3707,
    lon: -3.78514,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'GCHI',
    name: "El Hierro Airport",
    region: 'ES-CN',
    hubTier: 'spoke',
    lat: 27.8148,
    lon: -17.8871,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'GCLA',
    name: "La Palma Airport",
    region: 'ES-CN',
    hubTier: 'spoke',
    lat: 28.6265,
    lon: -17.7556,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'GEML',
    name: "Melilla Airport",
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 35.2798,
    lon: -2.95626,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LEBA',
    name: "Córdoba Airport",
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 37.842,
    lon: -4.84888,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LEGA',
    name: "Armilla Air Base",
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 37.1332,
    lon: -3.63569,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LEGT',
    name: "Getafe Air Base",
    region: 'ES-C',
    hubTier: 'spoke',
    lat: 40.2941,
    lon: -3.72383,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    // Homolog: LELO wrong ICAO (Logroño is LERJ, already densify Wave 1) → Seu d'Urgell
    icao: 'LESU',
    name: "Pirineus - la Seu d'Urgel Airport",
    region: 'ES-E',
    hubTier: 'spoke',
    lat: 42.3386,
    lon: 1.40917,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const ES_DENSIFY_HUB_COUNT = ES_DENSIFY_HUBS.length;
