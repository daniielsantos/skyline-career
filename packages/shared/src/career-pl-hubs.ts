/**
 * Poland career hub catalog — EU-3 Central-East + Baltics.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { PL_DENSIFY_HUBS, PL_DENSIFY_HUB_COUNT } from './career-pl-hubs-densify.js';

export type PlCareerRegion = 'PL-N' | 'PL-C' | 'PL-S';

export type PlCareerHubDef = {
  icao: string;
  name: string;
  region: PlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const industrial = {
  produce: { machinery: 1.3, electronics: 1.15, general: 1.2 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

const agro = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.9, machinery: 0.85, fuel: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 10 curated Poland hubs. */
export const PL_CAREER_HUBS: readonly PlCareerHubDef[] = [
  {
    icao: 'EPGD',
    name: 'Gdansk Lech Walesa',
    region: 'PL-N',
    hubTier: 'regional',
    lat: 54.3776,
    lon: 18.4662,
    produce: { general: 1.3, machinery: 1.2, perishables: 1.15 },
    consume: { electronics: 1.05, supplies: 1.05 },
  },
  {
    icao: 'EPSC',
    name: 'Szczecin Goleniow',
    region: 'PL-N',
    hubTier: 'spoke',
    lat: 53.5847,
    lon: 14.9023,
    ...agro,
  },
  {
    icao: 'EPBY',
    name: 'Bydgoszcz Ignacy Jan Paderewski',
    region: 'PL-N',
    hubTier: 'spoke',
    lat: 53.0968,
    lon: 17.9777,
    ...industrial,
  },
  {
    icao: 'EPWA',
    name: 'Warsaw Chopin',
    region: 'PL-C',
    hubTier: 'major',
    lat: 52.1657,
    lon: 20.9671,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.15, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EPPO',
    name: 'Poznan Lawica',
    region: 'PL-C',
    hubTier: 'regional',
    lat: 52.421,
    lon: 16.8263,
    ...industrial,
  },
  {
    icao: 'EPLL',
    name: 'Lodz Wladyslaw Reymont',
    region: 'PL-C',
    hubTier: 'spoke',
    lat: 51.7219,
    lon: 19.3981,
    ...industrial,
  },
  {
    icao: 'EPKK',
    name: 'Krakow John Paul II',
    region: 'PL-S',
    hubTier: 'regional',
    lat: 50.0777,
    lon: 19.7848,
    produce: { general: 1.3, electronics: 1.2, perishables: 1.15 },
    consume: { machinery: 1.0, supplies: 1.05 },
  },
  {
    icao: 'EPKT',
    name: 'Katowice Pyrzowice',
    region: 'PL-S',
    hubTier: 'regional',
    lat: 50.4743,
    lon: 19.08,
    ...industrial,
  },
  {
    icao: 'EPWR',
    name: 'Wroclaw Copernicus',
    region: 'PL-S',
    hubTier: 'regional',
    lat: 51.1027,
    lon: 16.8858,
    ...industrial,
  },
  {
    icao: 'EPRZ',
    name: 'Rzeszow Jasionka',
    region: 'PL-S',
    hubTier: 'spoke',
    lat: 50.11,
    lon: 22.019,
    ...agro,
  },
  ...PL_DENSIFY_HUBS,
];

export const PL_CAREER_HUB_COUNT = 10 + PL_DENSIFY_HUB_COUNT;

export function buildPlFeederCorridors(
  hubs: readonly PlCareerHubDef[] = PL_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPlCareerHubCatalog(): void {
  if (PL_CAREER_HUBS.length !== PL_CAREER_HUB_COUNT) {
    throw new Error(
      `PL_CAREER_HUBS length ${PL_CAREER_HUBS.length} !== ${PL_CAREER_HUB_COUNT}`,
    );
  }
  if (!PL_CAREER_HUBS.some((h) => h.icao === 'EPWA' && h.hubTier === 'major')) {
    throw new Error('PL catalog must include major EPWA');
  }
}
