/**
 * Myanmar career hub catalog — Asia-9 Bay of Bengal / Irrawaddy face.
 *
 * Country id is MM (region prefix). ICAOs are VY* — do not confuse with
 * Mexico MM* idents (country MX). Thailand VT* is deferred.
 * Military strips VYML / VYNP / VYST are omitted.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MmCareerRegion = 'MM-S' | 'MM-N';

export type MmCareerHubDef = {
  icao: string;
  name: string;
  region: MmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Myanmar hubs. Yangon is VYYY (river→sea port pickup). */
export const MM_CAREER_HUBS: readonly MmCareerHubDef[] = [
  {
    icao: 'VYYY',
    name: 'Yangon International',
    region: 'MM-S',
    hubTier: 'major',
    lat: 16.9073,
    lon: 96.1332,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05, fuel: 1.2 },
  },
  {
    icao: 'VYSW',
    name: 'Sittwe',
    region: 'MM-S',
    hubTier: 'regional',
    lat: 20.1332,
    lon: 92.8707,
    produce: { general: 1.25, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  {
    icao: 'VYMD',
    name: 'Mandalay International',
    region: 'MM-N',
    hubTier: 'regional',
    lat: 21.7022,
    lon: 95.9779,
    produce: { machinery: 1.25, general: 1.3, perishables: 1.15 },
    consume: { electronics: 1.0, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'VYNT',
    name: 'Nay Pyi Taw International',
    region: 'MM-N',
    hubTier: 'regional',
    lat: 19.6235,
    lon: 96.201,
    produce: { electronics: 1.2, general: 1.25, machinery: 1.1 },
    consume: { perishables: 1.1, supplies: 1.1, fuel: 1.1 },
  },
];

export const MM_CAREER_HUB_COUNT = 4;

export function buildMmFeederCorridors(
  hubs: readonly MmCareerHubDef[] = MM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMmCareerHubCatalog(): void {
  if (MM_CAREER_HUBS.length !== MM_CAREER_HUB_COUNT) {
    throw new Error(
      `MM_CAREER_HUBS length ${MM_CAREER_HUBS.length} !== ${MM_CAREER_HUB_COUNT}`,
    );
  }
  if (!MM_CAREER_HUBS.some((h) => h.icao === 'VYYY' && h.hubTier === 'major')) {
    throw new Error('MM catalog must include major VYYY (Yangon)');
  }
  if (!MM_CAREER_HUBS.some((h) => h.icao === 'VYMD')) {
    throw new Error('MM catalog must include VYMD Mandalay');
  }
  if (
    MM_CAREER_HUBS.some((h) =>
      ['VYML', 'VYNP', 'VYST'].includes(h.icao),
    )
  ) {
    throw new Error('MM catalog must not seed military VYML / VYNP / VYST');
  }
  if (MM_CAREER_HUBS.some((h) => h.icao.startsWith('VT'))) {
    throw new Error('MM catalog must not seed Thailand VT* ICAOs');
  }
}
