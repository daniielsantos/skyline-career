/**
 * Antigua and Barbuda career hub catalog — intl-first light chain.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AgCareerRegion = 'AG-C';

export type AgCareerHubDef = {
  icao: string;
  name: string;
  region: AgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Antigua hubs — V.C. Bird + Barbuda Codrington. */
export const AG_CAREER_HUBS: readonly AgCareerHubDef[] = [
  {
    icao: 'TAPA',
    name: 'St Johns V.C. Bird',
    region: 'AG-C',
    hubTier: 'major',
    lat: 17.1367,
    lon: -61.7927,
    produce: { general: 1.3, electronics: 1.05, machinery: 1.05 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TAPH',
    name: 'Codrington Barbuda',
    region: 'AG-C',
    hubTier: 'spoke',
    lat: 17.6358,
    lon: -61.8286,
    produce: { perishables: 1.25, general: 1.05, supplies: 0.95 },
    consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 },
  },
];

export const AG_CAREER_HUB_COUNT = 2;

export function buildAgFeederCorridors(
  hubs: readonly AgCareerHubDef[] = AG_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAgCareerHubCatalog(): void {
  if (AG_CAREER_HUBS.length !== AG_CAREER_HUB_COUNT) {
    throw new Error(
      `AG_CAREER_HUBS length ${AG_CAREER_HUBS.length} !== ${AG_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of AG_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate AG hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
  }
}
