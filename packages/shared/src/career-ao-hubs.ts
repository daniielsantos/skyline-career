/**
 * Angola career hub catalog — AF-1 Sub-Saharan core (Atlantic south).
 *
 * Luanda cargo major is FNLU (Quatro de Fevereiro) — stock MSFS ident.
 * FNUB Agostinho Neto is remapped to FNLU.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type AoCareerRegion = 'AO-N';

export type AoCareerHubDef = {
  icao: string;
  name: string;
  region: AoCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Angola hub. Luanda is FNLU (not FNUB). */
export const AO_CAREER_HUBS: readonly AoCareerHubDef[] = [
  {
    icao: 'FNLU',
    name: 'Luanda Quatro de Fevereiro',
    region: 'AO-N',
    hubTier: 'major',
    lat: -8.8584,
    lon: 13.2312,
    produce: { machinery: 1.35, general: 1.4, supplies: 1.2 },
    consume: { perishables: 1.15, electronics: 1.0, fuel: 1.2 },
  },
];

export const AO_CAREER_HUB_COUNT = 1;

export function buildAoFeederCorridors(
  hubs: readonly AoCareerHubDef[] = AO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAoCareerHubCatalog(): void {
  if (AO_CAREER_HUBS.length !== AO_CAREER_HUB_COUNT) {
    throw new Error(
      `AO_CAREER_HUBS length ${AO_CAREER_HUBS.length} !== ${AO_CAREER_HUB_COUNT}`,
    );
  }
  if (!AO_CAREER_HUBS.some((h) => h.icao === 'FNLU' && h.hubTier === 'major')) {
    throw new Error('AO catalog must include major FNLU (Luanda)');
  }
  if (AO_CAREER_HUBS.some((h) => h.icao === 'FNUB')) {
    throw new Error('AO catalog must use FNLU for Luanda, not FNUB');
  }
}
