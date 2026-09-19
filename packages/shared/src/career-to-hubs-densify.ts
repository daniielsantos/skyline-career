/**
 * To densify Wave B Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into TO_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ToCareerRegion } from './career-to-hubs.js';

type ToDensifyHub = {
  icao: string;
  name: string;
  region: ToCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave B Oceania densify (+1). */
export const TO_DENSIFY_HUBS: readonly ToDensifyHub[] = [
  {
    icao: 'NFTL',
    name: "Lifuka Island Airport",
    region: 'TO-T',
    hubTier: 'spoke',
    lat: -19.777,
    lon: -174.341,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const TO_DENSIFY_HUB_COUNT = TO_DENSIFY_HUBS.length;
