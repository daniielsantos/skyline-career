/**
 * Senegal career hub catalog — AF-1 Sub-Saharan core (Atlantic hinge), densified in AF-3.
 *
 * Dakar cargo major is GOOY (Léopold Sédar Senghor) — stock MSFS ident.
 * GOBD Blaise Diagne is remapped to GOOY.
 * Tambacounda inland is GOTT (not GOTB Bakel).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { SN_DENSIFY_HUBS, SN_DENSIFY_HUB_COUNT } from './career-sn-hubs-densify.js';

export type SnCareerRegion = 'SN-W' | 'SN-E';

export type SnCareerHubDef = {
  icao: string;
  name: string;
  region: SnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Senegal hubs. Dakar is GOOY (not GOBD). Tambacounda is GOTT (not GOTB Bakel). */
export const SN_CAREER_HUBS: readonly SnCareerHubDef[] = [
  {
    icao: 'GOOY',
    name: 'Dakar Léopold Sédar Senghor',
    region: 'SN-W',
    hubTier: 'major',
    lat: 14.7397,
    lon: -17.4902,
    produce: { general: 1.35, electronics: 1.2, perishables: 1.2 },
    consume: { machinery: 0.95, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'GOTT',
    name: 'Tambacounda',
    region: 'SN-E',
    hubTier: 'regional',
    lat: 13.7368,
    lon: -13.6531,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.9, fuel: 1.1 },
  },
  ...SN_DENSIFY_HUBS,
];

export const SN_CAREER_HUB_COUNT = 2 + SN_DENSIFY_HUB_COUNT;

export function buildSnFeederCorridors(
  hubs: readonly SnCareerHubDef[] = SN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertSnCareerHubCatalog(): void {
  if (SN_CAREER_HUBS.length !== SN_CAREER_HUB_COUNT) {
    throw new Error(
      `SN_CAREER_HUBS length ${SN_CAREER_HUBS.length} !== ${SN_CAREER_HUB_COUNT}`,
    );
  }
  if (!SN_CAREER_HUBS.some((h) => h.icao === 'GOOY' && h.hubTier === 'major')) {
    throw new Error('SN catalog must include major GOOY (Dakar Senghor)');
  }
  if (SN_CAREER_HUBS.some((h) => h.icao === 'GOBD')) {
    throw new Error('SN catalog must use GOOY for Dakar, not GOBD');
  }
  if (!SN_CAREER_HUBS.some((h) => h.icao === 'GOTT')) {
    throw new Error('SN catalog must include GOTT Tambacounda (inland)');
  }
  if (SN_CAREER_HUBS.some((h) => h.icao === 'GOTB')) {
    throw new Error('SN catalog must use GOTT for Tambacounda, not GOTB Bakel');
  }
}
