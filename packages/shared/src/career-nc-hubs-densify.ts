/**
 * Nc densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into NC_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { NcCareerRegion } from './career-nc-hubs.js';

type NcDensifyHub = {
  icao: string;
  name: string;
  region: NcCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Oceania densify (+2). */
export const NC_DENSIFY_HUBS: readonly NcDensifyHub[] = [
  {
    icao: 'NWWE',
    name: "Île des Pins Airport",
    region: 'NC-S',
    hubTier: 'spoke',
    lat: -22.5889,
    lon: 167.45599,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'NWWL',
    name: "Lifou Airport",
    region: 'NC-S',
    hubTier: 'spoke',
    lat: -20.77456,
    lon: 167.23933,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },

  // Wave B Oceania densify (+3)
  {
    icao: 'NWWR',
    name: "Maré Airport",
    region: 'NC-S',
    hubTier: 'spoke',
    lat: -21.48244,
    lon: 168.03847,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'NWWU',
    name: "Touho Airport",
    region: 'NC-S',
    hubTier: 'spoke',
    lat: -20.79013,
    lon: 165.25952,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'NWWV',
    name: "Ouvéa Airport",
    region: 'NC-S',
    hubTier: 'spoke',
    lat: -20.64093,
    lon: 166.57302,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const NC_DENSIFY_HUB_COUNT = NC_DENSIFY_HUBS.length;
