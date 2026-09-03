/**
 * Cameroon densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into CM_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CmCareerRegion } from './career-cm-hubs.js';

type CmDensifyHub = {
  icao: string;
  name: string;
  region: CmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** CM densify (+4). */
export const CM_DENSIFY_HUBS: readonly CmDensifyHub[] = [
  {
    icao: 'FKKR',
    name: "Garoua International Airport",
    region: 'CM-C',
    hubTier: 'regional',
    lat: 9.33479,
    lon: 13.37213,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FKKN',
    name: "N'Gaoundéré Airport",
    region: 'CM-C',
    hubTier: 'regional',
    lat: 7.35701,
    lon: 13.5592,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FKKL',
    name: "Salak Airport",
    region: 'CM-C',
    hubTier: 'regional',
    lat: 10.4514,
    lon: 14.2574,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FKKU',
    name: "Bafoussam Airport",
    region: 'CM-C',
    hubTier: 'regional',
    lat: 5.53692,
    lon: 10.3546,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const CM_DENSIFY_HUB_COUNT = CM_DENSIFY_HUBS.length;
