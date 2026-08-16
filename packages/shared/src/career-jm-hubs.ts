/**
 * Jamaica career hub catalog — intl-first island pattern.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type JmCareerRegion = 'JM-C';

export type JmCareerHubDef = {
  icao: string;
  name: string;
  region: JmCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.8, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.4, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Jamaica hubs — Kingston / Montego Bay corridor. */
export const JM_CAREER_HUBS: readonly JmCareerHubDef[] = [
  {
    icao: 'MKJP',
    name: 'Kingston Norman Manley',
    region: 'JM-C',
    hubTier: 'major',
    lat: 17.9357,
    lon: -76.7875,
    produce: { general: 1.4, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MKJS',
    name: 'Montego Bay Sangster',
    region: 'JM-C',
    hubTier: 'regional',
    lat: 18.5037,
    lon: -77.9134,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 0.95 },
  },
  {
    icao: 'MKTP',
    name: 'Kingston Tinson Pen',
    region: 'JM-C',
    hubTier: 'spoke',
    lat: 17.9886,
    lon: -76.8239,
    ...drySpoke,
  },
  {
    icao: 'MKKJ',
    name: 'Port Antonio Ken Jones',
    region: 'JM-C',
    hubTier: 'spoke',
    lat: 18.1988,
    lon: -76.5345,
    ...agroSpoke,
  },
  {
    icao: 'MKBS',
    name: 'Ocho Rios Ian Fleming',
    region: 'JM-C',
    hubTier: 'spoke',
    lat: 18.4042,
    lon: -76.9692,
    ...agroSpoke,
  },
];

export const JM_CAREER_HUB_COUNT = 5;

export function buildJmFeederCorridors(
  hubs: readonly JmCareerHubDef[] = JM_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertJmCareerHubCatalog(): void {
  if (JM_CAREER_HUBS.length !== JM_CAREER_HUB_COUNT) {
    throw new Error(
      `JM_CAREER_HUBS length ${JM_CAREER_HUBS.length} !== ${JM_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  let n = 0;
  for (const h of JM_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate JM hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    if (h.region === 'JM-C') n += 1;
  }
  if (n !== 5) throw new Error(`JM-C has ${n} hubs, expected 5`);
}
