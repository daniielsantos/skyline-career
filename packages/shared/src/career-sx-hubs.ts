/**
 * Sint Maarten career hub catalog — NL territory light (CW-style).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type SxCareerRegion = 'SX-C';

export type SxCareerHubDef = {
  icao: string;
  name: string;
  region: SxCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Sint Maarten hub — Princess Juliana. */
export const SX_CAREER_HUBS: readonly SxCareerHubDef[] = [
  {
    icao: 'TNCM',
    name: 'Sint Maarten Princess Juliana',
    region: 'SX-C',
    hubTier: 'major',
    lat: 18.041,
    lon: -63.1089,
    produce: { general: 1.35, electronics: 1.15, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
];

export const SX_CAREER_HUB_COUNT = 1;

export function buildSxFeederCorridors(
  hubs: readonly SxCareerHubDef[] = SX_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSxCareerHubCatalog(): void {
  if (SX_CAREER_HUBS.length !== SX_CAREER_HUB_COUNT) {
    throw new Error(
      `SX_CAREER_HUBS length ${SX_CAREER_HUBS.length} !== ${SX_CAREER_HUB_COUNT}`,
    );
  }
  const h = SX_CAREER_HUBS[0]!;
  if (h.icao !== 'TNCM' || h.region !== 'SX-C') {
    throw new Error('SX catalog must be TNCM / SX-C');
  }
}
