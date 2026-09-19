/**
 * Vu densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into VU_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { VuCareerRegion } from './career-vu-hubs.js';

type VuDensifyHub = {
  icao: string;
  name: string;
  region: VuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Oceania densify (+2). */
export const VU_DENSIFY_HUBS: readonly VuDensifyHub[] = [
  {
    icao: 'NVSQ',
    name: "Gaua Island Airport",
    region: 'VU-C',
    hubTier: 'spoke',
    lat: -14.2181,
    lon: 167.58701,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NVVW',
    name: "Whitegrass Airport",
    region: 'VU-S',
    hubTier: 'spoke',
    lat: -19.4551,
    lon: 169.224,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
];

export const VU_DENSIFY_HUB_COUNT = VU_DENSIFY_HUBS.length;
