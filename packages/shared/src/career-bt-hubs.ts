/**
 * Bhutan career hub catalog — Asia-9 Himalaya east face.
 *
 * Thailand (VT*) is deferred to the next South-East Asia slice.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type BtCareerRegion = 'BT-C';

export type BtCareerHubDef = {
  icao: string;
  name: string;
  region: BtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Bhutan hubs. Paro is VQPR (not Thailand Betong BTZ/VTSY). */
export const BT_CAREER_HUBS: readonly BtCareerHubDef[] = [
  {
    icao: 'VQPR',
    name: 'Paro International',
    region: 'BT-C',
    hubTier: 'major',
    lat: 27.4032,
    lon: 89.4246,
    produce: { electronics: 1.25, general: 1.35, machinery: 1.1 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05, fuel: 1.2 },
  },
  {
    icao: 'VQGP',
    name: 'Gelephu',
    region: 'BT-C',
    hubTier: 'regional',
    lat: 26.8846,
    lon: 90.4641,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
];

export const BT_CAREER_HUB_COUNT = 2;

export function buildBtFeederCorridors(
  hubs: readonly BtCareerHubDef[] = BT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertBtCareerHubCatalog(): void {
  if (BT_CAREER_HUBS.length !== BT_CAREER_HUB_COUNT) {
    throw new Error(
      `BT_CAREER_HUBS length ${BT_CAREER_HUBS.length} !== ${BT_CAREER_HUB_COUNT}`,
    );
  }
  if (!BT_CAREER_HUBS.some((h) => h.icao === 'VQPR' && h.hubTier === 'major')) {
    throw new Error('BT catalog must include major VQPR (Paro)');
  }
  if (BT_CAREER_HUBS.some((h) => h.icao.startsWith('VT'))) {
    throw new Error('BT catalog must not seed Thailand VT* ICAOs');
  }
}
