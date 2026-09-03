/**
 * Nigeria densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into NG_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NgCareerRegion } from './career-ng-hubs.js';

type NgDensifyHub = {
  icao: string;
  name: string;
  region: NgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** NG densify (+5). */
export const NG_DENSIFY_HUBS: readonly NgDensifyHub[] = [
  {
    icao: 'DNEN',
    name: "Akanu Ibiam International Airport",
    region: 'NG-C',
    hubTier: 'regional',
    lat: 6.47372,
    lon: 7.56046,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'DNAS',
    name: "Asaba International Airport",
    region: 'NG-SW',
    hubTier: 'regional',
    lat: 6.20417,
    lon: 6.66528,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'DNIL',
    name: "General Tunde Idiagbon International Airport",
    region: 'NG-SW',
    hubTier: 'regional',
    lat: 8.44021,
    lon: 4.49392,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'DNKA',
    name: "Kaduna International Airport",
    region: 'NG-N',
    hubTier: 'regional',
    lat: 10.696,
    lon: 7.32011,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'DNMA',
    name: "Maiduguri International Airport",
    region: 'NG-N',
    hubTier: 'regional',
    lat: 11.85416,
    lon: 13.0807,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
];

export const NG_DENSIFY_HUB_COUNT = NG_DENSIFY_HUBS.length;
