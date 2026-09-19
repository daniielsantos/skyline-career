/**
 * EG densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into EG_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { EgCareerRegion } from './career-eg-hubs.js';

type EgDensifyHub = {
  icao: string;
  name: string;
  region: EgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+4). */
export const EG_DENSIFY_HUBS: readonly EgDensifyHub[] = [
  {
    icao: 'HEMA',
    name: "Marsa Alam International Airport",
    region: 'EG-R',
    hubTier: 'spoke',
    lat: 25.55555,
    lon: 34.59245,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'HEAT',
    name: "Asyut International Airport",
    region: 'EG-S',
    hubTier: 'spoke',
    lat: 27.04596,
    lon: 31.01276,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'HESG',
    name: "Suhaj International Airport",
    region: 'EG-S',
    hubTier: 'spoke',
    lat: 26.34251,
    lon: 31.74302,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'HETB',
    name: "Taba International Airport",
    region: 'EG-R',
    hubTier: 'spoke',
    lat: 29.5945,
    lon: 34.77575,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
];

export const EG_DENSIFY_HUB_COUNT = EG_DENSIFY_HUBS.length;
