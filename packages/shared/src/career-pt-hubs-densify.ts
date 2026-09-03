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

/** PT densify (+5) → 14 total. */
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
];

export const PT_DENSIFY_HUB_COUNT = PT_DENSIFY_HUBS.length;
