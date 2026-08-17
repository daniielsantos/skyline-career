/**
 * Samoa career hub catalog — Upolu + Savai'i.
 *
 * Apia cargo major is NSFA Faleolo; Savai'i is NSAU Asau.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type WsCareerRegion = 'WS-U' | 'WS-S';

export type WsCareerHubDef = {
  icao: string;
  name: string;
  region: WsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Samoa hubs — Upolu (WS-U) + Savai'i (WS-S). */
export const WS_CAREER_HUBS: readonly WsCareerHubDef[] = [
  {
    icao: 'NSFA',
    name: 'Faleolo International',
    region: 'WS-U',
    hubTier: 'major',
    lat: -13.83,
    lon: -172.008,
    produce: { perishables: 1.25, general: 1.3, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
  {
    icao: 'NSAU',
    name: 'Asau',
    region: 'WS-S',
    hubTier: 'major',
    lat: -13.5053,
    lon: -172.6279,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85, fuel: 1.1 },
  },
];

export const WS_CAREER_HUB_COUNT = 2;

export function buildWsFeederCorridors(
  hubs: readonly WsCareerHubDef[] = WS_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertWsCareerHubCatalog(): void {
  if (WS_CAREER_HUBS.length !== WS_CAREER_HUB_COUNT) {
    throw new Error(
      `WS_CAREER_HUBS length ${WS_CAREER_HUBS.length} !== ${WS_CAREER_HUB_COUNT}`,
    );
  }
  if (!WS_CAREER_HUBS.some((h) => h.icao === 'NSFA' && h.hubTier === 'major')) {
    throw new Error('WS catalog must include major NSFA (Faleolo)');
  }
  if (!WS_CAREER_HUBS.some((h) => h.icao === 'NSAU' && h.hubTier === 'major')) {
    throw new Error('WS catalog must include major NSAU (Asau)');
  }
}
