/**
 * Portugal densify — commercial LP* mainland airports (MSFS + SimBrief).
 * Islands already covered (LPMA/LPPD). Merged into PT_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PtCareerRegion } from './career-pt-hubs.js';

type PtDensifyHub = {
  icao: string;
  name: string;
  region: PtCareerRegion;
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
  produce: { perishables: 1.3, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** PT densify (+12) → 21 total (incl. Wave 1 +4 Azores). */
export const PT_DENSIFY_HUBS: readonly PtDensifyHub[] = [
  {
    // Viseu = LPVZ (not LPVL Vilar de Luz / Maia — ~44 nm off)
    icao: 'LPVZ',
    name: 'Viseu Goncalves Lobato',
    region: 'PT-N',
    hubTier: 'spoke',
    lat: 40.7255,
    lon: -7.88899,
    ...agro,
  },
  {
    icao: 'LPOV',
    name: 'Ovar',
    region: 'PT-N',
    hubTier: 'spoke',
    lat: 40.9159,
    lon: -8.64583,
    ...drySpoke,
  },
  {
    icao: 'LPEV',
    name: 'Evora',
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 38.5333,
    lon: -7.88806,
    ...agro,
  },
  {
    // Portimão already LPPM in base catalog; densify fills Coimbra inland
    icao: 'LPCO',
    name: 'Coimbra',
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 40.1572,
    lon: -8.47083,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'LPCB',
    name: 'Castelo Branco',
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 39.8473,
    lon: -7.44139,
    ...drySpoke,
  },
  {
    icao: 'LPSO',
    name: "Ponte de Sor",
    region: 'PT-C',
    hubTier: 'regional',
    lat: 39.2116,
    lon: -8.05654,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'LPBG',
    name: "Bragança Airport",
    region: 'PT-N',
    hubTier: 'regional',
    lat: 41.8578,
    lon: -6.70713,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'LPFL',
    name: "Flores Airport",
    region: 'PT-C',
    hubTier: 'regional',
    lat: 39.4553,
    lon: -31.1314,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  // Wave 1 EU-1 densify (+4 Azores secondary; not LPPS)
  {
    icao: 'LPAZ',
    name: 'Santa Maria',
    region: 'PT-A',
    hubTier: 'regional',
    lat: 36.9714,
    lon: -25.1706,
    ...drySpoke,
  },
  {
    icao: 'LPHR',
    name: 'Horta',
    region: 'PT-A',
    hubTier: 'spoke',
    lat: 38.5199,
    lon: -28.7159,
    ...drySpoke,
  },
  {
    icao: 'LPPI',
    name: 'Pico',
    region: 'PT-A',
    hubTier: 'spoke',
    lat: 38.5543,
    lon: -28.4413,
    ...drySpoke,
  },
  {
    icao: 'LPGR',
    name: 'Graciosa',
    region: 'PT-A',
    hubTier: 'spoke',
    lat: 39.0922,
    lon: -28.0297,
    ...drySpoke,
  },


  // Wave 2 EU-1 densify (+6)
  {
    icao: 'LPSJ',
    name: "São Jorge Airport",
    region: 'PT-A',
    hubTier: 'spoke',
    lat: 38.6655,
    lon: -28.1758,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'LPAR',
    name: "Alverca Air Base",
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 38.8833,
    lon: -9.0301,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LPBR',
    name: "Braga Municipal Aerodrome",
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 41.587,
    lon: -8.44519,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LPMR',
    name: "Monte Real Air Base",
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 39.82834,
    lon: -8.8875,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LPMT',
    name: "Montijo Air Base",
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 38.70929,
    lon: -9.03368,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'LPST',
    name: "Sintra Air Base",
    region: 'PT-C',
    hubTier: 'spoke',
    lat: 38.8311,
    lon: -9.33955,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const PT_DENSIFY_HUB_COUNT = PT_DENSIFY_HUBS.length;
