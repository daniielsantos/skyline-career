/**
 * Mozambique densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into MZ_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MzCareerRegion } from './career-mz-hubs.js';

type MzDensifyHub = {
  icao: string;
  name: string;
  region: MzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** MZ densify (+5). */
export const MZ_DENSIFY_HUBS: readonly MzDensifyHub[] = [
  {
    icao: 'FQNP',
    name: "Nampula Airport",
    region: 'MZ-C',
    hubTier: 'regional',
    lat: -15.1056,
    lon: 39.2818,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FQTT',
    name: "Tete Airport",
    region: 'MZ-C',
    hubTier: 'regional',
    lat: -16.1048,
    lon: 33.6402,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FQCH',
    name: "Chimoio Airport",
    region: 'MZ-C',
    hubTier: 'regional',
    lat: -19.1513,
    lon: 33.429,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FQIN',
    name: "Inhambane Airport",
    region: 'MZ-S',
    hubTier: 'regional',
    lat: -23.8764,
    lon: 35.4085,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'FQLC',
    name: "Lichinga Airport",
    region: 'MZ-C',
    hubTier: 'regional',
    lat: -13.274,
    lon: 35.2663,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const MZ_DENSIFY_HUB_COUNT = MZ_DENSIFY_HUBS.length;
