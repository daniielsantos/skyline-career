/**
 * Pf densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into PF_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PfCareerRegion } from './career-pf-hubs.js';

type PfDensifyHub = {
  icao: string;
  name: string;
  region: PfCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Oceania densify (+4). */
export const PF_DENSIFY_HUBS: readonly PfDensifyHub[] = [
  {
    icao: 'NTMD',
    name: "Nuku Hiva Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -8.7956,
    lon: -140.229,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTMN',
    name: "Hiva Oa-Atuona Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -9.76879,
    lon: -139.011,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTTG',
    name: "Rangiroa Airport",
    region: 'PF-L',
    hubTier: 'spoke',
    lat: -14.9543,
    lon: -147.661,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTTH',
    name: "Huahine-Fare Airport",
    region: 'PF-L',
    hubTier: 'spoke',
    lat: -16.68708,
    lon: -151.02159,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
];

export const PF_DENSIFY_HUB_COUNT = PF_DENSIFY_HUBS.length;
