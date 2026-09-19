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

  // Wave B Oceania densify (+6)
  {
    icao: 'NTAR',
    name: "Rurutu Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -22.4341,
    lon: -151.36099,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTAT',
    name: "Tubuai Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -23.3654,
    lon: -149.524,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTHE',
    name: "Ahe Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -14.4281,
    lon: -146.257,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTGA',
    name: "Anaa Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -17.3526,
    lon: -145.51,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTGB',
    name: "Fangatau Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -15.82004,
    lon: -140.88807,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NTGC',
    name: "Tikehau Airport",
    region: 'PF-I',
    hubTier: 'spoke',
    lat: -15.1196,
    lon: -148.231,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
];

export const PF_DENSIFY_HUB_COUNT = PF_DENSIFY_HUBS.length;
