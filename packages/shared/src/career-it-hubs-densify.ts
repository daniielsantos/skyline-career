/**
 * Italy densify — commercial LI* airports (MSFS + SimBrief).
 * Merged into IT_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ItCareerRegion } from './career-it-hubs.js';

type ItDensifyHub = {
  icao: string;
  name: string;
  region: ItCareerRegion;
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
  produce: { perishables: 1.35, general: 1.15, supplies: 1.0 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

const industrial = {
  produce: { machinery: 1.3, electronics: 1.2, general: 1.15 },
  consume: { perishables: 1.05, supplies: 1.0 },
} as const;

/** IT densify (+19) → 31 total (incl. Wave 1 +6). */
export const IT_DENSIFY_HUBS: readonly ItDensifyHub[] = [
  {
    icao: 'LIMF',
    name: 'Turin Caselle',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 45.2008,
    lon: 7.64981,
    ...industrial,
  },
  {
    icao: 'LIPX',
    name: 'Verona Villafranca',
    region: 'IT-N',
    hubTier: 'spoke',
    lat: 45.3957,
    lon: 10.8885,
    ...agro,
  },
  {
    icao: 'LIPY',
    name: 'Ancona Falconara',
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 43.6163,
    lon: 13.3623,
    ...agro,
  },
  {
    icao: 'LIRP',
    name: 'Pisa',
    region: 'IT-C',
    hubTier: 'regional',
    lat: 43.6839,
    lon: 10.3927,
    produce: { general: 1.2, electronics: 1.1, perishables: 1.1 },
    consume: { machinery: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LIBP',
    name: 'Pescara',
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 42.4317,
    lon: 14.1811,
    ...drySpoke,
  },
  {
    icao: 'LIBR',
    name: 'Brindisi',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 40.6576,
    lon: 17.947,
    ...agro,
  },
  {
    icao: 'LICA',
    name: 'Lamezia Terme',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 38.9054,
    lon: 16.2423,
    ...agro,
  },
  {
    icao: 'LIEE',
    name: 'Cagliari Elmas',
    region: 'IT-S',
    hubTier: 'regional',
    lat: 39.2515,
    lon: 9.05428,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'LIEA',
    name: 'Alghero Fertilia',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 40.6321,
    lon: 8.29077,
    ...drySpoke,
  },
  {
    icao: 'LICD',
    name: 'Lampedusa',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 35.4979,
    lon: 12.6181,
    produce: { perishables: 1.15, general: 1.0, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'LIPR',
    name: "Federico Fellini International Airport",
    region: 'IT-N',
    hubTier: 'regional',
    lat: 44.02002,
    lon: 12.6122,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'LIMJ',
    name: "Genoa Cristoforo Colombo Airport",
    region: 'IT-N',
    hubTier: 'regional',
    lat: 44.41204,
    lon: 8.84073,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'LIEO',
    name: "Olbia Costa Smeralda Airport",
    region: 'IT-C',
    hubTier: 'regional',
    lat: 40.89895,
    lon: 9.51846,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  // Wave 1 EU-1 densify (+6)
  {
    icao: 'LIPH',
    name: 'Treviso Sant Angelo',
    region: 'IT-N',
    hubTier: 'regional',
    lat: 45.6484,
    lon: 12.1944,
    ...industrial,
  },
  {
    icao: 'LIMZ',
    name: 'Cuneo Levaldigi',
    region: 'IT-N',
    hubTier: 'spoke',
    lat: 44.547,
    lon: 7.62322,
    ...drySpoke,
  },
  {
    icao: 'LIPB',
    name: 'Bolzano',
    region: 'IT-N',
    hubTier: 'spoke',
    lat: 46.4602,
    lon: 11.3264,
    ...drySpoke,
  },
  {
    icao: 'LICR',
    name: 'Reggio Calabria',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 38.0712,
    lon: 15.6516,
    ...agro,
  },
  {
    icao: 'LIBC',
    name: 'Crotone',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 38.9972,
    lon: 17.0802,
    ...drySpoke,
  },
  {
    icao: 'LICG',
    name: 'Pantelleria',
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 36.8165,
    lon: 11.9689,
    ...drySpoke,
  },


  // Wave 2 EU-1 densify (+12)
  {
    icao: 'LIPQ',
    name: "Trieste Airport",
    region: 'IT-N',
    hubTier: 'spoke',
    lat: 45.82786,
    lon: 13.46667,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'LIRI',
    name: "Salerno Costa d'Amalfi Airport",
    region: 'IT-S',
    hubTier: 'spoke',
    lat: 40.6204,
    lon: 14.9113,
    produce: { perishables: 1.35, general: 1.1, supplies: 1 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LIRZ',
    name: "Perugia San Francesco d'Assisi – Umbria International Airport",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 43.0959,
    lon: 12.5132,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'LIBA',
    name: "Amendola Air Base",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 41.53844,
    lon: 15.71718,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LIBF',
    name: "Foggia Gino Lisa Airport",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 41.4336,
    lon: 15.53457,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LIBG',
    name: "Taranto-Grottaglie Marcello Arlotta Airport",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 40.5175,
    lon: 17.4032,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LIBN',
    name: "Lecce Galatina Air Base / Galatina Fortunato Cesari Airport",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 40.2392,
    lon: 18.1333,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LIBV',
    name: "Gioia del Colle Antonio Ramirez Air Base",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 40.7678,
    lon: 16.9333,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LICB',
    name: "Comiso Airport",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 36.99583,
    lon: 14.60889,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LICP',
    name: "Palermo-Boccadifalco Airport",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 38.11592,
    lon: 13.31337,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LICT',
    name: "Vincenzo Florio Airport Trapani-Birgi",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 37.9114,
    lon: 12.488,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LICZ',
    name: "Sigonella Navy Air Base",
    region: 'IT-C',
    hubTier: 'spoke',
    lat: 37.4017,
    lon: 14.9224,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const IT_DENSIFY_HUB_COUNT = IT_DENSIFY_HUBS.length;
