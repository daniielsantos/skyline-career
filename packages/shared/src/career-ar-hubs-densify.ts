/**
 * Argentina densify — commercial SA* airports (MSFS + SimBrief).
 * Merged into AR_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ArCareerRegion } from './career-ar-hubs.js';

type ArDensifyHub = {
  icao: string;
  name: string;
  region: ArCareerRegion;
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

const tourismRegional = {
  produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
  consume: { electronics: 1.0, machinery: 0.9 },
} as const;

/** AR densify (+29) → 70 total. Skip Coronel Suarez SAZC — stock MSFS maps SAZC to Zarate. */
export const AR_DENSIFY_HUBS: readonly ArDensifyHub[] = [
  {
    icao: 'SARI',
    name: 'Cataratas del Iguazu',
    region: 'AR-NO',
    hubTier: 'regional',
    lat: -25.7373,
    lon: -54.4734,
    ...tourismRegional,
  },
  {
    icao: 'SAZY',
    name: 'Aviador Campos Chapelco',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -40.0754,
    lon: -71.1373,
    produce: { general: 1.05, perishables: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SADP',
    name: 'El Palomar',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -34.6099,
    lon: -58.6126,
    ...drySpoke,
  },
  {
    icao: 'SAAC',
    name: 'Concordia',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -31.2969,
    lon: -57.9966,
    ...agroSpoke,
  },
  {
    icao: 'SAAG',
    name: 'Gualeguaychu',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -33.0103,
    lon: -58.6131,
    ...agroSpoke,
  },
  {
    icao: 'SATU',
    name: 'Curuzu Cuatia',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -29.7706,
    lon: -57.9789,
    ...agroSpoke,
  },
  {
    icao: 'SAOL',
    name: 'Laboulaye',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -34.1354,
    lon: -63.3623,
    ...agroSpoke,
  },
  {
    icao: 'SATR',
    name: 'Reconquista',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -29.2103,
    lon: -59.68,
    ...agroSpoke,
  },
  {
    icao: 'SAZW',
    name: 'Cutral Co',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -38.9397,
    lon: -69.2647,
    produce: { machinery: 1.2, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  // Wave C densify (+20)
  {
    icao: 'SADL',
    name: 'La Plata',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -34.9722,
    lon: -57.8947,
    ...drySpoke,
  },
  {
    icao: 'SAZO',
    name: 'Necochea',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -38.4907,
    lon: -58.8163,
    ...agroSpoke,
  },
  {
    icao: 'SAZL',
    name: 'Santa Teresita',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -36.5423,
    lon: -56.7218,
    ...tourismRegional,
  },
  {
    icao: 'SAZP',
    name: 'Pehuajo Comodoro Pedro Zanni',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -35.8446,
    lon: -61.8576,
    ...agroSpoke,
  },
  {
    icao: 'SAZG',
    name: 'General Pico',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -35.6962,
    lon: -63.7583,
    ...agroSpoke,
  },
  {
    icao: 'SAZF',
    name: 'Olavarria',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -36.89,
    lon: -60.2166,
    ...agroSpoke,
  },
  {
    icao: 'SAFR',
    name: 'Rafaela',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -31.2825,
    lon: -61.5017,
    ...agroSpoke,
  },
  {
    icao: 'SAOV',
    name: 'Villa Maria Presidente Nestor Kirchner',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -32.3201,
    lon: -63.2266,
    ...agroSpoke,
  },
  {
    icao: 'SACT',
    name: 'Chamical Gobernador Gordillo',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -30.3453,
    lon: -66.2941,
    ...drySpoke,
  },
  {
    icao: 'SASO',
    name: 'Oran',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -23.1528,
    lon: -64.3292,
    ...agroSpoke,
  },
  {
    icao: 'SAST',
    name: 'Tartagal General Enrique Mosconi',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -22.6169,
    lon: -63.793,
    produce: { machinery: 1.2, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SATG',
    name: 'Goya',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -29.1058,
    lon: -59.2189,
    ...agroSpoke,
  },
  {
    icao: 'SARM',
    name: 'Monte Caseros',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -30.2719,
    lon: -57.6402,
    ...agroSpoke,
  },
  {
    icao: 'SARS',
    name: 'Presidencia Roque Saenz Pena Termal',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -26.7536,
    lon: -60.4922,
    ...agroSpoke,
  },
  {
    icao: 'SAVE',
    name: 'Esquel Brigadier Antonio Parodi',
    region: 'AR-PA',
    hubTier: 'regional',
    lat: -42.908,
    lon: -71.1395,
    ...tourismRegional,
  },
  {
    icao: 'SAVV',
    name: 'Viedma Gobernador Castello',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -40.8692,
    lon: -63.0004,
    ...drySpoke,
  },
  {
    icao: 'SAWD',
    name: 'Puerto Deseado',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -47.7353,
    lon: -65.9041,
    produce: { machinery: 1.15, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SAWP',
    name: 'Perito Moreno Jalil Hamer',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -46.5379,
    lon: -70.9787,
    ...drySpoke,
  },
  {
    icao: 'SAVH',
    name: 'Las Heras',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -46.5385,
    lon: -68.9653,
    produce: { machinery: 1.25, general: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'SAHZ',
    name: 'Zapala',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -38.9755,
    lon: -70.1136,
    ...drySpoke,
  },
];

export const AR_DENSIFY_HUB_COUNT = AR_DENSIFY_HUBS.length;
