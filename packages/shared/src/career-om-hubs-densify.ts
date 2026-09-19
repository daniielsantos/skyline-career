/**
 * OM densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into OM_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { OmCareerRegion } from './career-om-hubs.js';

type OmDensifyHub = {
  icao: string;
  name: string;
  region: OmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+2). */
export const OM_DENSIFY_HUBS: readonly OmDensifyHub[] = [
  {
    icao: 'OOTH',
    name: "Thumrait Air Base",
    region: 'OM-S',
    hubTier: 'spoke',
    lat: 17.666,
    lon: 54.0246,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'OOMA',
    name: "RAFO Masirah",
    region: 'OM-N',
    hubTier: 'spoke',
    lat: 20.6754,
    lon: 58.8905,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const OM_DENSIFY_HUB_COUNT = OM_DENSIFY_HUBS.length;
