/**
 * Netherlands densify — commercial EH* airports (MSFS + SimBrief).
 * Merged into NL_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NlCareerRegion } from './career-nl-hubs.js';

type NlDensifyHub = {
  icao: string;
  name: string;
  region: NlCareerRegion;
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

const industrial = {
  produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
  consume: { perishables: 1.05, supplies: 1.0 },
} as const;

/** NL densify (+11) → 15 total (incl. Wave 1 +3). */
export const NL_DENSIFY_HUBS: readonly NlDensifyHub[] = [
  {
    icao: 'EHBK',
    name: 'Maastricht Aachen',
    region: 'NL-C',
    hubTier: 'regional',
    lat: 50.9117,
    lon: 5.77014,
    ...industrial,
  },
  {
    icao: 'EHLE',
    name: 'Lelystad',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.4603,
    lon: 5.52722,
    ...drySpoke,
  },
  {
    icao: 'EHTW',
    name: 'Enschede Twente',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.2758,
    lon: 6.88917,
    ...drySpoke,
  },
  {
    icao: 'EHTE',
    name: 'Teuge',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.2447,
    lon: 6.04667,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHSE',
    name: 'Breda Seppe',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.5547,
    lon: 4.5525,
    ...drySpoke,
  },
  {
    icao: 'EHBD',
    name: 'Weert Budel',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.2553,
    lon: 5.60139,
    ...drySpoke,
  },
  {
    icao: 'EHKD',
    name: "De Kooy Airfield / Den Helder Naval Air Station",
    region: 'NL-C',
    hubTier: 'regional',
    lat: 52.9234,
    lon: 4.78062,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'EHDL',
    name: "Deelen Air Base",
    region: 'NL-C',
    hubTier: 'regional',
    lat: 52.0606,
    lon: 5.87306,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  // Wave 1 EU-1 densify (+3)
  {
    icao: 'EHTX',
    name: 'Texel',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 53.1153,
    lon: 4.83361,
    ...drySpoke,
  },
  {
    icao: 'EHAL',
    name: 'Ameland',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 53.4517,
    lon: 5.67722,
    ...drySpoke,
  },
  {
    icao: 'EHMZ',
    name: 'Midden-Zeeland',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.5122,
    lon: 3.73056,
    ...drySpoke,
  },


  // Wave 2 EU-1 densify (+8; 4 medium + 4 small fill)
  {
    icao: 'EHGR',
    name: "Gilze Rijen Air Base",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.5674,
    lon: 4.93183,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHLW',
    name: "Leeuwarden Air Base",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 53.2286,
    lon: 5.76056,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHVK',
    name: "Volkel Air Base",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.65722,
    lon: 5.70778,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHWO',
    name: "Woensdrecht Air Base",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 51.4491,
    lon: 4.34203,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },

  // Wave 2 EU-1 densify NL fill (+4 small/medium; part of +8)
  {
    icao: 'EHDR',
    name: "Drachten Airfield",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 53.11793,
    lon: 6.12732,
    produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHHO',
    name: "Hoogeveen Airfield",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.7308,
    lon: 6.51611,
    produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHHV',
    name: "Hilversum Airfield",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 52.1919,
    lon: 5.14694,
    produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EHOW',
    name: "Oostwold Airfield",
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 53.20878,
    lon: 7.03305,
    produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const NL_DENSIFY_HUB_COUNT = NL_DENSIFY_HUBS.length;
