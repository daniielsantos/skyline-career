/**
 * Nicaragua career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { NI_DENSIFY_HUBS, NI_DENSIFY_HUB_COUNT } from './career-ni-hubs-densify.js';

export type NiCareerRegion = 'NI-C';

export type NiCareerHubDef = {
  icao: string;
  name: string;
  region: NiCareerRegion;
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

/** 5 curated Nicaragua hubs — Managua + Caribbean coast. */
export const NI_CAREER_HUBS: readonly NiCareerHubDef[] = [
  {
    icao: 'MNMG',
    name: 'Managua Augusto C. Sandino',
    region: 'NI-C',
    hubTier: 'major',
    lat: 12.1415,
    lon: -86.1682,
    produce: { general: 1.4, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MNPC',
    name: 'Puerto Cabezas',
    region: 'NI-C',
    hubTier: 'regional',
    lat: 14.0472,
    lon: -83.3867,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'MNBL',
    name: 'Bluefields',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 11.991,
    lon: -83.7741,
    ...agroSpoke,
  },
  {
    icao: 'MNCI',
    name: 'Corn Island',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 12.1626,
    lon: -83.0638,
    ...agroSpoke,
  },
  {
    // Costa Esmeralda (MNCE/ECI) is not in default MSFS scenery — use Montelimar.
    icao: 'MNMR',
    name: 'Montelimar',
    region: 'NI-C',
    hubTier: 'spoke',
    lat: 11.7861,
    lon: -86.5114,
    ...drySpoke,
  },
  ...NI_DENSIFY_HUBS,
];

export const NI_CAREER_HUB_COUNT = 5 + NI_DENSIFY_HUB_COUNT;

export function buildNiFeederCorridors(
  hubs: readonly NiCareerHubDef[] = NI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertNiCareerHubCatalog(): void {
  if (NI_CAREER_HUBS.length !== NI_CAREER_HUB_COUNT) {
    throw new Error(
      `NI_CAREER_HUBS length ${NI_CAREER_HUBS.length} !== ${NI_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of NI_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate NI hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['NI-C'] !== NI_CAREER_HUB_COUNT) {
    throw new Error(
      `NI-C has ${byRegion['NI-C'] ?? 0} hubs, expected ${NI_CAREER_HUB_COUNT}`,
    );
  }
}
