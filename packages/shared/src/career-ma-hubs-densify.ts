/**
 * MA densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into MA_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MaCareerRegion } from './career-ma-hubs.js';

type MaDensifyHub = {
  icao: string;
  name: string;
  region: MaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+3). */
export const MA_DENSIFY_HUBS: readonly MaDensifyHub[] = [
  {
    icao: 'GMMW',
    name: "Nador Al Aaroui International Airport",
    region: 'MA-N',
    hubTier: 'spoke',
    lat: 34.9888,
    lon: -3.02821,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'GMTA',
    name: "Cherif Al Idrissi Airport",
    region: 'MA-N',
    hubTier: 'spoke',
    lat: 35.1771,
    lon: -3.83952,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'GMMI',
    name: "Essaouira-Mogador Airport",
    region: 'MA-C',
    hubTier: 'spoke',
    lat: 31.3975,
    lon: -9.68167,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
];

export const MA_DENSIFY_HUB_COUNT = MA_DENSIFY_HUBS.length;
