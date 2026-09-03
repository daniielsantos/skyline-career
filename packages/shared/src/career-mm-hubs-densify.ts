/**
 * Myanmar densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into MM_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { MmCareerRegion } from './career-mm-hubs.js';

type MmDensifyHub = {
  icao: string;
  name: string;
  region: MmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** MM densify (+5). */
export const MM_DENSIFY_HUBS: readonly MmDensifyHub[] = [
  {
    icao: 'VYDW',
    name: "Dawei Airport",
    region: 'MM-S',
    hubTier: 'regional',
    lat: 14.1039,
    lon: 98.2036,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VYHH',
    name: "Heho Airport",
    region: 'MM-N',
    hubTier: 'regional',
    lat: 20.74714,
    lon: 96.79203,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VYKT',
    name: "Kawthoung Airport",
    region: 'MM-S',
    hubTier: 'regional',
    lat: 10.0493,
    lon: 98.538,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VYKG',
    name: "Kengtung Airport",
    region: 'MM-N',
    hubTier: 'regional',
    lat: 21.3016,
    lon: 99.636,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
  {
    icao: 'VYKP',
    name: "Kyaukpyu Airport",
    region: 'MM-S',
    hubTier: 'regional',
    lat: 19.4264,
    lon: 93.5348,
    produce: {"general":1.1,"supplies":1,"perishables":1.05},
    consume: {"electronics":0.9,"machinery":0.85},
  },
];

export const MM_DENSIFY_HUB_COUNT = MM_DENSIFY_HUBS.length;
