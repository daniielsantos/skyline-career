/**
 * Qatar career hub catalog — MENA-2 Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type QaCareerRegion = 'QA-C';

export type QaCareerHubDef = {
  icao: string;
  name: string;
  region: QaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Qatar hubs. Dispatch major is OTHH (Hamad), not OTBD. */
export const QA_CAREER_HUBS: readonly QaCareerHubDef[] = [
  {
    icao: 'OTHH',
    name: 'Doha Hamad International',
    region: 'QA-C',
    hubTier: 'major',
    lat: 25.2731,
    lon: 51.6081,
    produce: { electronics: 1.45, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OTBD',
    name: 'Doha International',
    region: 'QA-C',
    hubTier: 'spoke',
    lat: 25.2611,
    lon: 51.5651,
    produce: { general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
];

export const QA_CAREER_HUB_COUNT = 2;

export function buildQaFeederCorridors(
  hubs: readonly QaCareerHubDef[] = QA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertQaCareerHubCatalog(): void {
  if (QA_CAREER_HUBS.length !== QA_CAREER_HUB_COUNT) {
    throw new Error(
      `QA_CAREER_HUBS length ${QA_CAREER_HUBS.length} !== ${QA_CAREER_HUB_COUNT}`,
    );
  }
  if (!QA_CAREER_HUBS.some((h) => h.icao === 'OTHH' && h.hubTier === 'major')) {
    throw new Error('QA catalog must include major OTHH (Hamad), not OTBD');
  }
}
