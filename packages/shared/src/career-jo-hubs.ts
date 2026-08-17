/**
 * Jordan career hub catalog — MENA-4 Levant-east.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type JoCareerRegion = 'JO-C' | 'JO-S';

export type JoCareerHubDef = {
  icao: string;
  name: string;
  region: JoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const plateau = {
  produce: { general: 1.2, perishables: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 3 curated Jordan hubs. Amman intl is OJAI (Queen Alia), not OJAM alone. */
export const JO_CAREER_HUBS: readonly JoCareerHubDef[] = [
  {
    icao: 'OJAI',
    name: 'Amman Queen Alia',
    region: 'JO-C',
    hubTier: 'major',
    lat: 31.7226,
    lon: 35.9932,
    produce: { electronics: 1.4, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'OJAM',
    name: 'Amman Marka',
    region: 'JO-C',
    hubTier: 'spoke',
    lat: 31.9727,
    lon: 35.9916,
    ...plateau,
  },
  {
    icao: 'OJAQ',
    name: 'Aqaba King Hussein',
    region: 'JO-S',
    hubTier: 'regional',
    lat: 29.6117,
    lon: 35.0181,
    produce: { machinery: 1.25, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
];

export const JO_CAREER_HUB_COUNT = 3;

export function buildJoFeederCorridors(
  hubs: readonly JoCareerHubDef[] = JO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertJoCareerHubCatalog(): void {
  if (JO_CAREER_HUBS.length !== JO_CAREER_HUB_COUNT) {
    throw new Error(
      `JO_CAREER_HUBS length ${JO_CAREER_HUBS.length} !== ${JO_CAREER_HUB_COUNT}`,
    );
  }
  if (!JO_CAREER_HUBS.some((h) => h.icao === 'OJAI' && h.hubTier === 'major')) {
    throw new Error('JO catalog must include major OJAI (Queen Alia)');
  }
  if (!JO_CAREER_HUBS.some((h) => h.icao === 'OJAQ')) {
    throw new Error('JO catalog must include OJAQ Aqaba (port pickup)');
  }
  const markaMajor = JO_CAREER_HUBS.find((h) => h.icao === 'OJAM');
  if (markaMajor?.hubTier === 'major') {
    throw new Error('JO catalog must keep OJAM Marka non-major (use OJAI)');
  }
}
