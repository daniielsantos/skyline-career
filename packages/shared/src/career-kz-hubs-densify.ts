/**
 * Kz densify Wave B — commercial spokes (MSFS + SimBrief).
 * Merged into KZ_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { KzCareerRegion } from './career-kz-hubs.js';

type KzDensifyHub = {
  icao: string;
  name: string;
  region: KzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave B Asia densify (+1). */
export const KZ_DENSIFY_HUBS: readonly KzDensifyHub[] = [
  {
    icao: 'UACK',
    name: "Kokshetau International Airport",
    region: 'KZ-N',
    hubTier: 'spoke',
    lat: 53.3291,
    lon: 69.5946,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const KZ_DENSIFY_HUB_COUNT = KZ_DENSIFY_HUBS.length;
