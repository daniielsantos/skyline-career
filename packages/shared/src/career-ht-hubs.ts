/**
 * Haiti career hub catalog — intl-first island pattern (minimal domestic).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { HT_DENSIFY_HUBS, HT_DENSIFY_HUB_COUNT } from './career-ht-hubs-densify.js';

export type HtCareerRegion = 'HT-C';

export type HtCareerHubDef = {
  icao: string;
  name: string;
  region: HtCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 3 curated Haiti hubs — Port-au-Prince + Cap-Haitien / Les Cayes. */
export const HT_CAREER_HUBS: readonly HtCareerHubDef[] = [
  {
    icao: 'MTPP',
    name: 'Port-au-Prince Toussaint Louverture',
    region: 'HT-C',
    hubTier: 'major',
    lat: 18.58,
    lon: -72.2925,
    produce: { general: 1.35, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.2, general: 1.1, supplies: 1.05 },
  },
  {
    icao: 'MTCH',
    name: 'Cap-Haitien',
    region: 'HT-C',
    hubTier: 'regional',
    lat: 19.7256,
    lon: -72.1947,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'MTCA',
    name: 'Les Cayes Antoine-Simon',
    region: 'HT-C',
    hubTier: 'spoke',
    lat: 18.2711,
    lon: -73.7883,
    ...agroSpoke,
  },
  ...HT_DENSIFY_HUBS,
];

export const HT_CAREER_HUB_COUNT = 3 + HT_DENSIFY_HUB_COUNT;

export function buildHtFeederCorridors(
  hubs: readonly HtCareerHubDef[] = HT_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertHtCareerHubCatalog(): void {
  if (HT_CAREER_HUBS.length !== HT_CAREER_HUB_COUNT) {
    throw new Error(
      `HT_CAREER_HUBS length ${HT_CAREER_HUBS.length} !== ${HT_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  let n = 0;
  for (const h of HT_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate HT hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    if (h.region === 'HT-C') n += 1;
  }
  if (n !== HT_CAREER_HUB_COUNT) {
    throw new Error(`HT-C has ${n} hubs, expected ${HT_CAREER_HUB_COUNT}`);
  }
}
