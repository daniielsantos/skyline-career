/**
 * Serbia career hub catalog — EU-4 Balkans.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { RS_DENSIFY_HUBS, RS_DENSIFY_HUB_COUNT } from './career-rs-hubs-densify.js';

export type RsCareerRegion = 'RS-C';

export type RsCareerHubDef = {
  icao: string;
  name: string;
  region: RsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 3 curated Serbia hubs. */
export const RS_CAREER_HUBS: readonly RsCareerHubDef[] = [
  {
    icao: 'LYBE',
    name: 'Belgrade Nikola Tesla',
    region: 'RS-C',
    hubTier: 'major',
    lat: 44.8184,
    lon: 20.3091,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
  {
    icao: 'LYNI',
    name: 'Nis Constantine the Great',
    region: 'RS-C',
    hubTier: 'regional',
    lat: 43.3372,
    lon: 21.8537,
    produce: { general: 1.2, machinery: 1.15, perishables: 1.1 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'LYKV',
    name: 'Kraljevo Morava',
    region: 'RS-C',
    hubTier: 'spoke',
    lat: 43.8183,
    lon: 20.5872,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  ...RS_DENSIFY_HUBS,
];

export const RS_CAREER_HUB_COUNT = 3 + RS_DENSIFY_HUB_COUNT;

export function buildRsFeederCorridors(
  hubs: readonly RsCareerHubDef[] = RS_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertRsCareerHubCatalog(): void {
  if (RS_CAREER_HUBS.length !== RS_CAREER_HUB_COUNT) {
    throw new Error(
      `RS_CAREER_HUBS length ${RS_CAREER_HUBS.length} !== ${RS_CAREER_HUB_COUNT}`,
    );
  }
  if (!RS_CAREER_HUBS.some((h) => h.icao === 'LYBE' && h.hubTier === 'major')) {
    throw new Error('RS catalog must include major LYBE');
  }
}
