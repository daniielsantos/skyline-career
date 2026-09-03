/**
 * DR Congo densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into CD_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CdCareerRegion } from './career-cd-hubs.js';

type CdDensifyHub = {
  icao: string;
  name: string;
  region: CdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** CD densify (+4). */
export const CD_DENSIFY_HUBS: readonly CdDensifyHub[] = [
  {
    icao: 'FZWA',
    name: "Mbuji Mayi Airport",
    region: 'CD-S',
    hubTier: 'regional',
    lat: -6.12124,
    lon: 23.569,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FZBO',
    name: "Bandundu Airport",
    region: 'CD-W',
    hubTier: 'regional',
    lat: -3.31132,
    lon: 17.3817,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FZKA',
    name: "Bunia Airport",
    region: 'CD-N',
    hubTier: 'regional',
    lat: 1.56574,
    lon: 30.22068,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FZFD',
    name: "Gbadolite Airport",
    region: 'CD-N',
    hubTier: 'regional',
    lat: 4.25274,
    lon: 20.97527,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const CD_DENSIFY_HUB_COUNT = CD_DENSIFY_HUBS.length;
