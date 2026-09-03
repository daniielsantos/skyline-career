/**
 * Nigeria career hub catalog — AF-1 Sub-Saharan core (Gulf of Guinea face).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { NG_DENSIFY_HUBS, NG_DENSIFY_HUB_COUNT } from './career-ng-hubs-densify.js';

export type NgCareerRegion = 'NG-SW' | 'NG-C' | 'NG-N';

export type NgCareerHubDef = {
  icao: string;
  name: string;
  region: NgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 4 curated Nigeria hubs. Lagos cargo major is DNMM (not DNAA). */
export const NG_CAREER_HUBS: readonly NgCareerHubDef[] = [
  {
    icao: 'DNMM',
    name: 'Lagos Murtala Muhammed',
    region: 'NG-SW',
    hubTier: 'major',
    lat: 6.5774,
    lon: 3.3212,
    produce: { electronics: 1.4, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, fuel: 1.2 },
  },
  {
    icao: 'DNPO',
    name: 'Port Harcourt International',
    region: 'NG-SW',
    hubTier: 'regional',
    lat: 5.0155,
    lon: 6.9496,
    produce: { machinery: 1.35, general: 1.35, supplies: 1.2 },
    consume: { perishables: 1.15, electronics: 0.95, fuel: 1.15 },
  },
  {
    icao: 'DNAA',
    name: 'Abuja Nnamdi Azikiwe',
    region: 'NG-C',
    hubTier: 'regional',
    lat: 9.0068,
    lon: 7.2632,
    produce: { electronics: 1.25, general: 1.35, supplies: 1.15 },
    consume: { perishables: 1.2, machinery: 0.95, fuel: 1.1 },
  },
  {
    icao: 'DNKN',
    name: 'Kano Mallam Aminu',
    region: 'NG-N',
    hubTier: 'regional',
    lat: 12.0476,
    lon: 8.5246,
    produce: { perishables: 1.25, general: 1.3, supplies: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  ...NG_DENSIFY_HUBS,
];

export const NG_CAREER_HUB_COUNT = 4 + NG_DENSIFY_HUB_COUNT;

export function buildNgFeederCorridors(
  hubs: readonly NgCareerHubDef[] = NG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNgCareerHubCatalog(): void {
  if (NG_CAREER_HUBS.length !== NG_CAREER_HUB_COUNT) {
    throw new Error(
      `NG_CAREER_HUBS length ${NG_CAREER_HUBS.length} !== ${NG_CAREER_HUB_COUNT}`,
    );
  }
  if (!NG_CAREER_HUBS.some((h) => h.icao === 'DNMM' && h.hubTier === 'major')) {
    throw new Error('NG catalog must include major DNMM (Lagos)');
  }
  if (!NG_CAREER_HUBS.some((h) => h.icao === 'DNPO')) {
    throw new Error('NG catalog must include DNPO Port Harcourt (port pickup)');
  }
  if (!NG_CAREER_HUBS.some((h) => h.icao === 'DNAA')) {
    throw new Error('NG catalog must include DNAA Abuja');
  }
  if (!NG_CAREER_HUBS.some((h) => h.icao === 'DNKN')) {
    throw new Error('NG catalog must include DNKN Kano (north face)');
  }
}
