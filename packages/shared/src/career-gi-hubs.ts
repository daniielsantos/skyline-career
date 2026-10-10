/**
 * Gibraltar career hub — one region, no road link into Spain.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GiCareerRegion = 'GI-C';

export type GiCareerHubDef = {
  icao: string;
  name: string;
  region: GiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

export const GI_CAREER_HUBS: readonly GiCareerHubDef[] = [
  {
    icao: 'LXGB',
    name: 'Gibraltar',
    region: 'GI-C',
    hubTier: 'major',
    lat: 36.1512,
    lon: -5.3497,
    produce: { general: 1.3, electronics: 1.15, supplies: 1.05 },
    consume: { perishables: 1.15, machinery: 0.95, fuel: 1.1 },
  },
];

export const GI_CAREER_HUB_COUNT = GI_CAREER_HUBS.length;

export function buildGiFeederCorridors(
  hubs: readonly GiCareerHubDef[] = GI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGiCareerHubCatalog(): void {
  if (GI_CAREER_HUBS.length !== GI_CAREER_HUB_COUNT) {
    throw new Error(
      `GI_CAREER_HUBS length ${GI_CAREER_HUBS.length} !== ${GI_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of GI_CAREER_HUBS) {
    if (h.region !== 'GI-C') throw new Error(`${h.icao} must use GI-C`);
  }
  if (!GI_CAREER_HUBS.some((h) => h.icao === 'LXGB' && h.hubTier === 'major')) {
    throw new Error('GI catalog must include major LXGB');
  }
}
