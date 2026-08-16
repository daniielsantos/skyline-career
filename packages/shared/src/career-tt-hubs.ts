/**
 * Trinidad and Tobago career hub catalog — intl-first island pattern.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type TtCareerRegion = 'TT-C';

export type TtCareerHubDef = {
  icao: string;
  name: string;
  region: TtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated TT hubs — Piarco + Tobago (domestic = one OD). */
export const TT_CAREER_HUBS: readonly TtCareerHubDef[] = [
  {
    icao: 'TTPP',
    name: 'Port of Spain Piarco',
    region: 'TT-C',
    hubTier: 'major',
    lat: 10.5954,
    lon: -61.3372,
    produce: { general: 1.4, electronics: 1.15, machinery: 1.15 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TTCP',
    name: 'Tobago A.N.R. Robinson',
    region: 'TT-C',
    hubTier: 'regional',
    lat: 11.1497,
    lon: -60.8322,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
];

export const TT_CAREER_HUB_COUNT = 2;

export function buildTtFeederCorridors(
  hubs: readonly TtCareerHubDef[] = TT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertTtCareerHubCatalog(): void {
  if (TT_CAREER_HUBS.length !== TT_CAREER_HUB_COUNT) {
    throw new Error(
      `TT_CAREER_HUBS length ${TT_CAREER_HUBS.length} !== ${TT_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  let n = 0;
  for (const h of TT_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate TT hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    if (h.region === 'TT-C') n += 1;
  }
  if (n !== 2) throw new Error(`TT-C has ${n} hubs, expected 2`);
}
