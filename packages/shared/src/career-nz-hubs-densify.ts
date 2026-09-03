/**
 * New Zealand densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into NZ_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NzCareerRegion } from './career-nz-hubs.js';

type NzDensifyHub = {
  icao: string;
  name: string;
  region: NzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** NZ densify (+12). */
export const NZ_DENSIFY_HUBS: readonly NzDensifyHub[] = [
  {
    icao: 'NZRO',
    name: "Rotorua Airport",
    region: 'NZ-N',
    hubTier: 'regional',
    lat: -38.1092,
    lon: 176.317,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'NZPM',
    name: "Palmerston North Airport",
    region: 'NZ-S',
    hubTier: 'regional',
    lat: -40.3206,
    lon: 175.617,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZGS',
    name: "Gisborne Airport",
    region: 'NZ-N',
    hubTier: 'regional',
    lat: -38.6633,
    lon: 177.978,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZHN',
    name: "Hamilton International Airport",
    region: 'NZ-N',
    hubTier: 'regional',
    lat: -37.86696,
    lon: 175.33195,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZNR',
    name: "Hawke's Bay Airport",
    region: 'NZ-S',
    hubTier: 'regional',
    lat: -39.4658,
    lon: 176.86999,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZHK',
    name: "Hokitika Airfield",
    region: 'NZ-S',
    hubTier: 'regional',
    lat: -42.7136,
    lon: 170.985,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZCI',
    name: "Inia William Tuuta Memorial Airport",
    region: 'NZ-W',
    hubTier: 'regional',
    lat: -43.81189,
    lon: -176.46514,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZNV',
    name: "Invercargill Airport",
    region: 'NZ-W',
    hubTier: 'regional',
    lat: -46.4124,
    lon: 168.313,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZKT',
    name: "Kaitaia Airport",
    region: 'NZ-N',
    hubTier: 'regional',
    lat: -35.06984,
    lon: 173.28705,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZKK',
    name: "Kerikeri Airport",
    region: 'NZ-N',
    hubTier: 'regional',
    lat: -35.25915,
    lon: 173.91332,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZNS',
    name: "Nelson Airport",
    region: 'NZ-S',
    hubTier: 'regional',
    lat: -41.29671,
    lon: 173.22432,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'NZNP',
    name: "New Plymouth Airport",
    region: 'NZ-S',
    hubTier: 'regional',
    lat: -39.0086,
    lon: 174.179,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const NZ_DENSIFY_HUB_COUNT = NZ_DENSIFY_HUBS.length;
