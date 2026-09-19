/**
 * Pakistan densify Wave A — commercial OP* spokes (MSFS + SimBrief).
 * Merged into PK_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PkCareerRegion } from './career-pk-hubs.js';

type PkDensifyHub = {
  icao: string;
  name: string;
  region: PkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Asia densify (+4). */
export const PK_DENSIFY_HUBS: readonly PkDensifyHub[] = [
  {
    icao: 'OPFA',
    name: "Faisalabad International Airport",
    region: 'PK-N',
    hubTier: 'spoke',
    lat: 31.36492,
    lon: 72.99532,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'OPST',
    name: "Sialkot International Airport",
    region: 'PK-N',
    hubTier: 'spoke',
    lat: 32.53594,
    lon: 74.36462,
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1 },
  },
  {
    icao: 'OPSK',
    name: "Begum Nusrat Bhutto International Airport Sukkur",
    region: 'PK-S',
    hubTier: 'spoke',
    lat: 27.722,
    lon: 68.7917,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'OPGD',
    name: "New Gwadar International Airport",
    region: 'PK-S',
    hubTier: 'spoke',
    lat: 25.29673,
    lon: 62.49882,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
];

export const PK_DENSIFY_HUB_COUNT = PK_DENSIFY_HUBS.length;
