/**
 * Cameroon career hub catalog — AF-1 Sub-Saharan core (Gulf of Guinea east).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { CM_DENSIFY_HUBS, CM_DENSIFY_HUB_COUNT } from './career-cm-hubs-densify.js';

export type CmCareerRegion = 'CM-L' | 'CM-C';

export type CmCareerHubDef = {
  icao: string;
  name: string;
  region: CmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Cameroon hubs. Douala cargo major is FKKD; Yaoundé is FKYS (not FKKY). */
export const CM_CAREER_HUBS: readonly CmCareerHubDef[] = [
  {
    icao: 'FKKD',
    name: 'Douala International',
    region: 'CM-L',
    hubTier: 'major',
    lat: 4.0061,
    lon: 9.7195,
    produce: { general: 1.4, machinery: 1.25, perishables: 1.2 },
    consume: { electronics: 1.0, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FKYS',
    name: 'Yaoundé Nsimalen',
    region: 'CM-C',
    hubTier: 'regional',
    lat: 3.7226,
    lon: 11.5533,
    produce: { general: 1.25, supplies: 1.15, perishables: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  ...CM_DENSIFY_HUBS,
];

export const CM_CAREER_HUB_COUNT = 2 + CM_DENSIFY_HUB_COUNT;

export function buildCmFeederCorridors(
  hubs: readonly CmCareerHubDef[] = CM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCmCareerHubCatalog(): void {
  if (CM_CAREER_HUBS.length !== CM_CAREER_HUB_COUNT) {
    throw new Error(
      `CM_CAREER_HUBS length ${CM_CAREER_HUBS.length} !== ${CM_CAREER_HUB_COUNT}`,
    );
  }
  if (!CM_CAREER_HUBS.some((h) => h.icao === 'FKKD' && h.hubTier === 'major')) {
    throw new Error('CM catalog must include major FKKD (Douala)');
  }
  if (!CM_CAREER_HUBS.some((h) => h.icao === 'FKYS')) {
    throw new Error('CM catalog must include FKYS Yaoundé Nsimalen');
  }
  if (CM_CAREER_HUBS.some((h) => h.icao === 'FKKY')) {
    throw new Error('CM catalog must use FKYS for Yaoundé, not FKKY');
  }
}
