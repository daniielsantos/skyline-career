/**
 * Ki densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into KI_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { KiCareerRegion } from './career-ki-hubs.js';

type KiDensifyHub = {
  icao: string;
  name: string;
  region: KiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Oceania densify (+1). */
export const KI_DENSIFY_HUBS: readonly KiDensifyHub[] = [
  {
    icao: 'NGTE',
    name: "Tabiteuea North Airport",
    region: 'KI-T',
    hubTier: 'spoke',
    lat: -1.22447,
    lon: 174.776,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const KI_DENSIFY_HUB_COUNT = KI_DENSIFY_HUBS.length;
