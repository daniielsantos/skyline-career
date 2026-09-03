/**
 * South Africa densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into ZA_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ZaCareerRegion } from './career-za-hubs.js';

type ZaDensifyHub = {
  icao: string;
  name: string;
  region: ZaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** ZA densify (+6). */
export const ZA_DENSIFY_HUBS: readonly ZaDensifyHub[] = [
  {
    icao: 'FABL',
    name: "Bram Fischer International Airport",
    region: 'ZA-G',
    hubTier: 'regional',
    lat: -29.0927,
    lon: 26.3024,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FAPE',
    name: "Chief Dawid Stuurman International Airport",
    region: 'ZA-G',
    hubTier: 'regional',
    lat: -33.98971,
    lon: 25.61735,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FAGG',
    name: "George Airport",
    region: 'ZA-G',
    hubTier: 'regional',
    lat: -34.0056,
    lon: 22.3789,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FAKM',
    name: "Kimberley Airport",
    region: 'ZA-G',
    hubTier: 'regional',
    lat: -28.8054,
    lon: 24.76487,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FAEL',
    name: "King Phalo Airport",
    region: 'ZA-G',
    hubTier: 'regional',
    lat: -33.0356,
    lon: 27.8259,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'FAKN',
    name: "Kruger Mpumalanga International Airport",
    region: 'ZA-E',
    hubTier: 'regional',
    lat: -25.38333,
    lon: 31.10533,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const ZA_DENSIFY_HUB_COUNT = ZA_DENSIFY_HUBS.length;
