/**
 * Ireland densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into IE_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { IeCareerRegion } from './career-ie-hubs.js';

type IeDensifyHub = {
  icao: string;
  name: string;
  region: IeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** IE densify (+3). */
export const IE_DENSIFY_HUBS: readonly IeDensifyHub[] = [
  {
    icao: 'EIDL',
    name: "Donegal",
    region: 'IE-W',
    hubTier: 'spoke',
    lat: 55.0442,
    lon: -8.34111,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'EIKY',
    name: "Kerry",
    region: 'IE-W',
    hubTier: 'spoke',
    lat: 52.1809,
    lon: -9.52378,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'EICA',
    name: "Connemara",
    region: 'IE-W',
    hubTier: 'spoke',
    lat: 53.2303,
    lon: -9.46778,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'EIIR',
    name: "Inisheer",
    region: 'IE-W',
    hubTier: 'spoke',
    lat: 53.0647,
    lon: -9.5108,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const IE_DENSIFY_HUB_COUNT = IE_DENSIFY_HUBS.length;
