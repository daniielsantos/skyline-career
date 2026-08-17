/**
 * Nepal career hub catalog — Asia-8 Himalaya / Ganges face.
 *
 * VNPR Pokhara intl omitted: not present in stock MSFS Facilities scenery.
 * VNLK Lukla omitted (STOL bush strip, not a cargo hub).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type NpCareerRegion = 'NP-C';

export type NpCareerHubDef = {
  icao: string;
  name: string;
  region: NpCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Nepal hubs. Pokhara in stock MSFS is VNPK (not VNPR intl). */
export const NP_CAREER_HUBS: readonly NpCareerHubDef[] = [
  {
    icao: 'VNKT',
    name: 'Kathmandu Tribhuvan',
    region: 'NP-C',
    hubTier: 'major',
    lat: 27.6966,
    lon: 85.3591,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.15 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'VNPK',
    name: 'Pokhara Domestic',
    region: 'NP-C',
    hubTier: 'regional',
    lat: 28.2006,
    lon: 83.9812,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'VNBW',
    name: 'Gautam Buddha International',
    region: 'NP-C',
    hubTier: 'regional',
    lat: 27.5046,
    lon: 83.4104,
    produce: { general: 1.25, perishables: 1.2, machinery: 1.1 },
    consume: { electronics: 0.95, supplies: 1.1, fuel: 1.1 },
  },
];

export const NP_CAREER_HUB_COUNT = 3;

export function buildNpFeederCorridors(
  hubs: readonly NpCareerHubDef[] = NP_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNpCareerHubCatalog(): void {
  if (NP_CAREER_HUBS.length !== NP_CAREER_HUB_COUNT) {
    throw new Error(
      `NP_CAREER_HUBS length ${NP_CAREER_HUBS.length} !== ${NP_CAREER_HUB_COUNT}`,
    );
  }
  if (!NP_CAREER_HUBS.some((h) => h.icao === 'VNKT' && h.hubTier === 'major')) {
    throw new Error('NP catalog must include major VNKT (Kathmandu)');
  }
  if (!NP_CAREER_HUBS.some((h) => h.icao === 'VNPK')) {
    throw new Error('NP catalog must include VNPK Pokhara (stock MSFS, not VNPR)');
  }
  if (NP_CAREER_HUBS.some((h) => h.icao === 'VNPR' || h.icao === 'VNLK')) {
    throw new Error('NP catalog must not seed VNPR intl or VNLK Lukla');
  }
}
