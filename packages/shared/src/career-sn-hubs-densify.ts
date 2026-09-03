/**
 * Senegal densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into SN_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { SnCareerRegion } from './career-sn-hubs.js';

type SnDensifyHub = {
  icao: string;
  name: string;
  region: SnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** SN densify (+3). */
export const SN_DENSIFY_HUBS: readonly SnDensifyHub[] = [
  {
    // GOSM is not Saint-Louis in MSFS — civil Saint-Louis is GOSS.
    icao: 'GOSS',
    name: "Saint-Louis Airport",
    region: 'SN-W',
    hubTier: 'regional',
    lat: 16.0508,
    lon: -16.4632,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'GOGS',
    name: "Cap Skirring Airport",
    region: 'SN-W',
    hubTier: 'regional',
    lat: 12.39533,
    lon: -16.748,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'GOGG',
    name: "Ziguinchor Airport",
    region: 'SN-W',
    hubTier: 'regional',
    lat: 12.55559,
    lon: -16.2833,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const SN_DENSIFY_HUB_COUNT = SN_DENSIFY_HUBS.length;
