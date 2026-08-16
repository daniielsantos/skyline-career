/**
 * Curacao career hub catalog — NL territory light (GF-style).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CwCareerRegion = 'CW-C';

export type CwCareerHubDef = {
  icao: string;
  name: string;
  region: CwCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Curacao hub — Hato International. */
export const CW_CAREER_HUBS: readonly CwCareerHubDef[] = [
  {
    icao: 'TNCC',
    name: 'Willemstad Hato',
    region: 'CW-C',
    hubTier: 'major',
    lat: 12.1889,
    lon: -68.9598,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
];

export const CW_CAREER_HUB_COUNT = 1;

export function buildCwFeederCorridors(
  hubs: readonly CwCareerHubDef[] = CW_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCwCareerHubCatalog(): void {
  if (CW_CAREER_HUBS.length !== CW_CAREER_HUB_COUNT) {
    throw new Error(
      `CW_CAREER_HUBS length ${CW_CAREER_HUBS.length} !== ${CW_CAREER_HUB_COUNT}`,
    );
  }
  const h = CW_CAREER_HUBS[0]!;
  if (h.icao !== 'TNCC' || h.region !== 'CW-C') {
    throw new Error('CW catalog must be TNCC / CW-C');
  }
}
