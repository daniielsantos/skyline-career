/**
 * UK densify — commercial EG* airports (MSFS + SimBrief).
 * Regions: GB-S / GB-M / GB-N only. Merged into GB_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { GbCareerRegion } from './career-gb-hubs.js';

type GbDensifyHub = {
  icao: string;
  name: string;
  region: GbCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

const city = {
  produce: { general: 1.2, electronics: 1.1, supplies: 1.0 },
  consume: { perishables: 1.1, machinery: 0.9 },
} as const;

/** GB densify (+10) → 22 total. */
export const GB_DENSIFY_HUBS: readonly GbDensifyHub[] = [
  {
    icao: 'EGPK',
    name: 'Glasgow Prestwick',
    region: 'GB-N',
    hubTier: 'regional',
    lat: 55.5094,
    lon: -4.58667,
    produce: { general: 1.25, machinery: 1.1, perishables: 1.1 },
    consume: { electronics: 1.0, supplies: 1.0 },
  },
  {
    icao: 'EGAA',
    name: 'Belfast International',
    region: 'GB-N',
    hubTier: 'regional',
    lat: 54.6575,
    lon: -6.21583,
    ...city,
  },
  {
    icao: 'EGAC',
    name: 'Belfast City',
    region: 'GB-N',
    hubTier: 'spoke',
    lat: 54.6181,
    lon: -5.8725,
    ...drySpoke,
  },
  {
    icao: 'EGFF',
    name: 'Cardiff',
    region: 'GB-S',
    hubTier: 'regional',
    lat: 51.3967,
    lon: -3.34333,
    ...city,
  },
  {
    icao: 'EGGD',
    name: 'Bristol',
    region: 'GB-S',
    hubTier: 'regional',
    lat: 51.3827,
    lon: -2.71909,
    ...city,
  },
  {
    icao: 'EGTE',
    name: 'Exeter',
    region: 'GB-S',
    hubTier: 'spoke',
    lat: 50.7344,
    lon: -3.41389,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'EGMC',
    name: 'London Southend',
    region: 'GB-S',
    hubTier: 'spoke',
    lat: 51.5714,
    lon: 0.695556,
    ...drySpoke,
  },
  {
    icao: 'EGSH',
    name: 'Norwich',
    region: 'GB-S',
    hubTier: 'spoke',
    lat: 52.6758,
    lon: 1.28278,
    ...drySpoke,
  },
  {
    icao: 'EGCN',
    name: 'Doncaster Sheffield',
    region: 'GB-M',
    hubTier: 'spoke',
    lat: 53.4805,
    lon: -1.01066,
    ...drySpoke,
  },
  {
    icao: 'EGNM',
    name: 'Leeds Bradford',
    region: 'GB-M',
    hubTier: 'spoke',
    lat: 53.8659,
    lon: -1.66057,
    ...city,
  },
];

export const GB_DENSIFY_HUB_COUNT = GB_DENSIFY_HUBS.length;
