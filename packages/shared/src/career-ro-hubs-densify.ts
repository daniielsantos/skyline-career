/**
 * Romania densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into RO_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { RoCareerRegion } from './career-ro-hubs.js';

type RoDensifyHub = {
  icao: string;
  name: string;
  region: RoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** RO densify (+4). */
export const RO_DENSIFY_HUBS: readonly RoDensifyHub[] = [
  {
    icao: 'LRCK',
    name: "Constanta Mihail Kogalniceanu",
    region: 'RO-E',
    hubTier: 'regional',
    lat: 44.3622,
    lon: 28.4883,
    produce: {"machinery":1.25,"electronics":1.15,"general":1.15},
    consume: {"perishables":1.05,"supplies":1},
  },
  {
    icao: 'LRBV',
    name: "Brasov Ghimbav",
    region: 'RO-W',
    hubTier: 'spoke',
    lat: 45.7019,
    lon: 25.5211,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1,"machinery":0.85},
  },
  {
    icao: 'LRBS',
    name: "Bucharest Baneasa",
    region: 'RO-E',
    hubTier: 'spoke',
    lat: 44.5032,
    lon: 26.1021,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'LRTC',
    name: "Tulcea",
    region: 'RO-E',
    hubTier: 'spoke',
    lat: 45.0625,
    lon: 28.7143,
    produce: {"perishables":1.25,"general":1.1,"supplies":1},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'LRBM',
    name: "Baia Mare",
    region: 'RO-W',
    hubTier: 'spoke',
    lat: 47.6584,
    lon: 23.4673,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },

];

export const RO_DENSIFY_HUB_COUNT = RO_DENSIFY_HUBS.length;
