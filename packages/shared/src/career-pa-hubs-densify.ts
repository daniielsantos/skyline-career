/**
 * Panama densify — commercial MP* airports (MSFS + SimBrief).
 * Merged into PA_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PaCareerRegion } from './career-pa-hubs.js';

type PaDensifyHub = {
  icao: string;
  name: string;
  region: PaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.05, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
} as const;

/** PA densify (+5) → 12 total. Skip MPSA (remaps MPSM). MPCE Chitre already Wave A. */
export const PA_DENSIFY_HUBS: readonly PaDensifyHub[] = [
  {
    icao: 'MPCE',
    name: 'Chitre',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 7.9878,
    lon: -80.4097,
    ...agroSpoke,
  },
  {
    icao: 'MPJE',
    name: 'Jaque',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 7.5178,
    lon: -78.1572,
    ...agroSpoke,
  },
  // Wave C densify (+3; MPCE already seeded)
  {
    icao: 'MPEJ',
    name: 'Colon Enrique Adolfo Jimenez',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 9.3566,
    lon: -79.8674,
    produce: { general: 1.2, machinery: 1.1, supplies: 1.0 },
    consume: { perishables: 1.05, electronics: 0.9 },
  },
  {
    icao: 'MPPD',
    name: 'Pedasi Capt J Montenegro',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 7.5348,
    lon: -80.0433,
    ...agroSpoke,
  },
  {
    icao: 'MPRA',
    name: 'Contadora Raul Arias Espinoza',
    region: 'PA-C',
    hubTier: 'spoke',
    lat: 8.6288,
    lon: -79.0347,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const PA_DENSIFY_HUB_COUNT = PA_DENSIFY_HUBS.length;
