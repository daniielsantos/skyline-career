/**
 * Martinique career hub catalog — FR territory light (GF-style).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MqCareerRegion = 'MQ-C';

export type MqCareerHubDef = {
  icao: string;
  name: string;
  region: MqCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Martinique hub — Fort-de-France Aimé Césaire. */
export const MQ_CAREER_HUBS: readonly MqCareerHubDef[] = [
  {
    icao: 'TFFF',
    name: 'Fort-de-France Aime Cesaire',
    region: 'MQ-C',
    hubTier: 'major',
    lat: 14.591,
    lon: -61.0032,
    produce: { general: 1.35, electronics: 1.1, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
];

export const MQ_CAREER_HUB_COUNT = 1;

export function buildMqFeederCorridors(
  hubs: readonly MqCareerHubDef[] = MQ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMqCareerHubCatalog(): void {
  if (MQ_CAREER_HUBS.length !== MQ_CAREER_HUB_COUNT) {
    throw new Error(
      `MQ_CAREER_HUBS length ${MQ_CAREER_HUBS.length} !== ${MQ_CAREER_HUB_COUNT}`,
    );
  }
  const h = MQ_CAREER_HUBS[0]!;
  if (h.icao !== 'TFFF' || h.region !== 'MQ-C') {
    throw new Error('MQ catalog must be TFFF / MQ-C');
  }
}
