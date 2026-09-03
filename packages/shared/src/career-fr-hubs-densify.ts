/**
 * France densify — commercial LF* airports (MSFS + SimBrief).
 * Merged into FR_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { FrCareerRegion } from './career-fr-hubs.js';

type FrDensifyHub = {
  icao: string;
  name: string;
  region: FrCareerRegion;
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

const city = {
  produce: { general: 1.2, electronics: 1.1, supplies: 1.0 },
  consume: { perishables: 1.1, machinery: 0.9 },
} as const;

/** FR densify (+10) → 24 total. */
export const FR_DENSIFY_HUBS: readonly FrDensifyHub[] = [
  {
    icao: 'LFRN',
    name: 'Rennes Saint Jacques',
    region: 'FR-N',
    hubTier: 'spoke',
    lat: 48.0695,
    lon: -1.73479,
    ...agro,
  },
  {
    icao: 'LFQQ',
    name: 'Lille Lesquin',
    region: 'FR-N',
    hubTier: 'regional',
    lat: 50.5619,
    lon: 3.08944,
    ...city,
  },
  {
    icao: 'LFRH',
    name: 'Lorient Lann Bihoue',
    region: 'FR-N',
    hubTier: 'spoke',
    lat: 47.7606,
    lon: -3.44,
    ...drySpoke,
  },
  {
    icao: 'LFBI',
    name: 'Poitiers Biard',
    region: 'FR-C',
    hubTier: 'spoke',
    lat: 46.5877,
    lon: 0.306667,
    ...agro,
  },
  {
    icao: 'LFBH',
    name: 'La Rochelle Ile de Re',
    region: 'FR-C',
    hubTier: 'spoke',
    lat: 46.1792,
    lon: -1.19528,
    produce: { perishables: 1.25, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LFLS',
    name: 'Grenoble Isere',
    region: 'FR-C',
    hubTier: 'spoke',
    lat: 45.3629,
    lon: 5.32937,
    ...city,
  },
  {
    icao: 'LFMT',
    name: 'Montpellier Mediterranee',
    region: 'FR-S',
    hubTier: 'regional',
    lat: 43.5763,
    lon: 3.96301,
    ...agro,
  },
  {
    icao: 'LFBZ',
    name: 'Biarritz Pays Basque',
    region: 'FR-S',
    hubTier: 'spoke',
    lat: 43.4683,
    lon: -1.52333,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'LFJL',
    name: 'Metz Nancy Lorraine',
    region: 'FR-E',
    hubTier: 'spoke',
    lat: 48.9781,
    lon: 6.24861,
    ...city,
  },
  {
    icao: 'LFTH',
    name: 'Toulon Hyeres',
    region: 'FR-S',
    hubTier: 'spoke',
    lat: 43.0973,
    lon: 6.14603,
    ...drySpoke,
  },
  {
    icao: 'LFKB',
    name: "Bastia Poretta",
    region: 'FR-S',
    hubTier: 'regional',
    lat: 42.5527,
    lon: 9.48373,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'LFKF',
    name: "Figari Sud-Corse Airport",
    region: 'FR-S',
    hubTier: 'regional',
    lat: 41.50185,
    lon: 9.09709,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'LFKJ',
    name: "Ajaccio Napoléon Bonaparte airport",
    region: 'FR-S',
    hubTier: 'regional',
    lat: 41.9236,
    lon: 8.80292,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const FR_DENSIFY_HUB_COUNT = FR_DENSIFY_HUBS.length;
