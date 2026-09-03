/**
 * India densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into IN_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { InCareerRegion } from './career-in-hubs.js';

type InDensifyHub = {
  icao: string;
  name: string;
  region: InCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** IN densify (+17). */
export const IN_DENSIFY_HUBS: readonly InDensifyHub[] = [
  {
    icao: 'VOVI',
    name: "Alluri Sitarama Raju International Airport (Vizag)",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 17.97151,
    lon: 83.50362,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VEBD',
    name: "Bagdogra Airport",
    region: 'IN-E',
    hubTier: 'regional',
    lat: 26.6812,
    lon: 88.3286,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VEIM',
    name: "Bir Tikendrajit International Airport",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 24.76,
    lon: 93.8967,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VOCL',
    name: "Calicut International Airport",
    region: 'IN-S',
    hubTier: 'regional',
    lat: 11.136,
    lon: 75.95515,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VILK',
    name: "Chaudhary Charan Singh International Airport",
    region: 'IN-N',
    hubTier: 'regional',
    lat: 26.7606,
    lon: 80.8893,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VOCB',
    name: "Coimbatore International Airport",
    region: 'IN-S',
    hubTier: 'regional',
    lat: 11.03,
    lon: 77.0434,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VAID',
    name: "Devi Ahilya Bai Holkar International Airport",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 22.7214,
    lon: 75.80051,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VANP',
    name: "Dr. Babasaheb Ambedkar International Airport",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 21.0922,
    lon: 79.0472,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VIHX',
    name: "Halwara International Airport",
    region: 'IN-N',
    hubTier: 'regional',
    lat: 30.7485,
    lon: 75.6298,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VOKN',
    name: "Kannur International Airport",
    region: 'IN-S',
    hubTier: 'regional',
    lat: 11.91634,
    lon: 75.54498,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VEBN',
    name: "Lal Bahadur Shastri International Airport",
    region: 'IN-N',
    hubTier: 'regional',
    lat: 25.45217,
    lon: 82.86255,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VIHR',
    name: "Maharaja Agrasen International Airport",
    region: 'IN-N',
    hubTier: 'regional',
    lat: 29.18606,
    lon: 75.74142,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VOBZ',
    name: "Vijayawada International Airport",
    region: 'IN-S',
    hubTier: 'regional',
    lat: 16.5304,
    lon: 80.7968,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    // VOTR = Trichy; Tirupati civil is VOTP.
    icao: 'VOTP',
    name: "Tirupati Airport",
    region: 'IN-S',
    hubTier: 'regional',
    lat: 13.6325,
    lon: 79.5433,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VAOZ',
    name: "Nashik International Airport",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 20.1191,
    lon: 73.9129,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VABP',
    name: "Raja Bhoj International Airport",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 23.2875,
    lon: 77.3374,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'VAHS',
    name: "Rajkot International Airport",
    region: 'IN-W',
    hubTier: 'regional',
    lat: 22.37882,
    lon: 71.03939,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const IN_DENSIFY_HUB_COUNT = IN_DENSIFY_HUBS.length;
