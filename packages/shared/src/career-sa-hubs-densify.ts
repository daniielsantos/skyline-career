/**
 * SA densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into SA_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SaCareerRegion } from './career-sa-hubs.js';

type SaDensifyHub = {
  icao: string;
  name: string;
  region: SaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+6). */
export const SA_DENSIFY_HUBS: readonly SaDensifyHub[] = [
  {
    icao: 'OETB',
    name: "Prince Sultan bin Abdulaziz International Airport",
    region: 'SA-W',
    hubTier: 'spoke',
    lat: 28.3711,
    lon: 36.62486,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'OEGN',
    name: "Jizan Regional Airport / King Abdullah bin Abdulaziz Airport",
    region: 'SA-W',
    hubTier: 'spoke',
    lat: 16.9011,
    lon: 42.5858,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'OEPA',
    name: "Qaisumah–Hafar Al-Batin International Airport",
    region: 'SA-E',
    hubTier: 'spoke',
    lat: 28.33573,
    lon: 46.12711,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'OERR',
    name: "Arar Domestic Airport",
    region: 'SA-C',
    hubTier: 'spoke',
    lat: 30.9066,
    lon: 41.1382,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'OEWD',
    name: "Wadi Al Dawasir Domestic Airport",
    region: 'SA-C',
    hubTier: 'spoke',
    lat: 20.5043,
    lon: 45.1996,
    produce: { perishables: 1.35, general: 1.1, supplies: 1 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'OEJB',
    name: "Jubail Airport",
    region: 'SA-E',
    hubTier: 'spoke',
    lat: 27.039,
    lon: 49.4051,
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1 },
  },
];

export const SA_DENSIFY_HUB_COUNT = SA_DENSIFY_HUBS.length;
