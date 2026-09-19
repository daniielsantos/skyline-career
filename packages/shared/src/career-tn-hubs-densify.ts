/**
 * TN densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into TN_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { TnCareerRegion } from './career-tn-hubs.js';

type TnDensifyHub = {
  icao: string;
  name: string;
  region: TnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+2). */
export const TN_DENSIFY_HUBS: readonly TnDensifyHub[] = [
  {
    icao: 'DTTZ',
    name: "Tozeur Nefta International Airport",
    region: 'TN-S',
    hubTier: 'spoke',
    lat: 33.9397,
    lon: 8.11056,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'DTNH',
    name: "Enfidha - Hammamet International Airport",
    region: 'TN-N',
    hubTier: 'spoke',
    lat: 36.07583,
    lon: 10.43861,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const TN_DENSIFY_HUB_COUNT = TN_DENSIFY_HUBS.length;
