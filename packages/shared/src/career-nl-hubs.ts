/**
 * Netherlands career hub catalog — EU-1 Western core (light).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { NL_DENSIFY_HUBS, NL_DENSIFY_HUB_COUNT } from './career-nl-hubs-densify.js';

export type NlCareerRegion = 'NL-C';

export type NlCareerHubDef = {
  icao: string;
  name: string;
  region: NlCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated + densify Netherlands hubs. */
export const NL_CAREER_HUBS: readonly NlCareerHubDef[] = [
  {
    icao: 'EHAM',
    name: 'Amsterdam Schiphol',
    region: 'NL-C',
    hubTier: 'major',
    lat: 52.3086,
    lon: 4.76389,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.1, general: 1.05 },
  },
  {
    icao: 'EHRD',
    name: 'Rotterdam The Hague',
    region: 'NL-C',
    hubTier: 'regional',
    lat: 51.9569,
    lon: 4.43722,
    produce: { machinery: 1.25, general: 1.25, electronics: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'EHEH',
    name: 'Eindhoven',
    region: 'NL-C',
    hubTier: 'regional',
    lat: 51.4501,
    lon: 5.37453,
    produce: { electronics: 1.3, machinery: 1.2, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'EHGG',
    name: 'Groningen Eelde',
    region: 'NL-C',
    hubTier: 'spoke',
    lat: 53.1197,
    lon: 6.57944,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  ...NL_DENSIFY_HUBS,
];

export const NL_CAREER_HUB_COUNT = 4 + NL_DENSIFY_HUB_COUNT;

export function buildNlFeederCorridors(
  hubs: readonly NlCareerHubDef[] = NL_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNlCareerHubCatalog(): void {
  if (NL_CAREER_HUBS.length !== NL_CAREER_HUB_COUNT) {
    throw new Error(
      `NL_CAREER_HUBS length ${NL_CAREER_HUBS.length} !== ${NL_CAREER_HUB_COUNT}`,
    );
  }
  if (!NL_CAREER_HUBS.some((h) => h.icao === 'EHAM' && h.hubTier === 'major')) {
    throw new Error('NL catalog must include major EHAM');
  }
}
