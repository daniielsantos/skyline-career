/**
 * Greece densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into GR_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GrCareerRegion } from './career-gr-hubs.js';

type GrDensifyHub = {
  icao: string;
  name: string;
  region: GrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** GR densify (+5). */
export const GR_DENSIFY_HUBS: readonly GrDensifyHub[] = [
  {
    icao: 'LGKL',
    name: "Kalamata",
    region: 'GR-S',
    hubTier: 'spoke',
    lat: 37.0683,
    lon: 22.0255,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LGLM',
    name: "Limnos",
    region: 'GR-N',
    hubTier: 'spoke',
    lat: 39.9171,
    lon: 25.2363,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LGZA',
    name: "Zakinthos",
    region: 'GR-S',
    hubTier: 'spoke',
    lat: 37.7509,
    lon: 20.8843,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LGKF',
    name: "Kefallinia",
    region: 'GR-S',
    hubTier: 'spoke',
    lat: 38.1201,
    lon: 20.5005,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LGSK',
    name: "Skiathos",
    region: 'GR-N',
    hubTier: 'spoke',
    lat: 39.1771,
    lon: 23.5037,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LGIO',
    name: "Ioannina",
    region: 'GR-N',
    hubTier: 'spoke',
    lat: 39.6964,
    lon: 20.8225,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const GR_DENSIFY_HUB_COUNT = GR_DENSIFY_HUBS.length;
