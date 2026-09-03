/**
 * Malawi densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into MW_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MwCareerRegion } from './career-mw-hubs.js';

type MwDensifyHub = {
  icao: string;
  name: string;
  region: MwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** MW densify (+3). */
export const MW_DENSIFY_HUBS: readonly MwDensifyHub[] = [
  {
    icao: 'FWDW',
    name: "Dwangwa Airport",
    region: 'MW-C',
    hubTier: 'regional',
    lat: -12.51753,
    lon: 34.13188,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FWKA',
    name: "Karonga Airport",
    region: 'MW-C',
    hubTier: 'regional',
    lat: -9.95357,
    lon: 33.89326,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FWUU',
    name: "Mzuzu Airport",
    region: 'MW-C',
    hubTier: 'regional',
    lat: -11.4447,
    lon: 34.0118,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const MW_DENSIFY_HUB_COUNT = MW_DENSIFY_HUBS.length;
