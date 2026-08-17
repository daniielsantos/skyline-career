/**
 * Iraq career hub catalog — MENA-3 North Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type IqCareerRegion = 'IQ-C' | 'IQ-S' | 'IQ-N';

export type IqCareerHubDef = {
  icao: string;
  name: string;
  region: IqCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const inland = {
  produce: { general: 1.2, perishables: 1.15, supplies: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.95, machinery: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 6 curated Iraq hubs. Baghdad is ORBI (not ORBS). */
export const IQ_CAREER_HUBS: readonly IqCareerHubDef[] = [
  {
    icao: 'ORBI',
    name: 'Baghdad International',
    region: 'IQ-C',
    hubTier: 'major',
    lat: 33.2625,
    lon: 44.2346,
    produce: { electronics: 1.4, general: 1.45, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'ORNI',
    name: 'Najaf',
    region: 'IQ-C',
    hubTier: 'regional',
    lat: 31.9899,
    lon: 44.4043,
    ...inland,
  },
  {
    icao: 'ORMM',
    name: 'Basra International',
    region: 'IQ-S',
    hubTier: 'major',
    lat: 30.5491,
    lon: 47.6621,
    produce: { machinery: 1.4, general: 1.4, electronics: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'ORER',
    name: 'Erbil International',
    region: 'IQ-N',
    hubTier: 'major',
    lat: 36.2376,
    lon: 43.9632,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1 },
  },
  {
    icao: 'ORSU',
    name: 'Sulaymaniyah',
    region: 'IQ-N',
    hubTier: 'spoke',
    lat: 35.5608,
    lon: 45.3147,
    ...inland,
  },
  {
    icao: 'ORBM',
    name: 'Mosul',
    region: 'IQ-N',
    hubTier: 'spoke',
    lat: 36.3058,
    lon: 43.1474,
    ...inland,
  },
];

export const IQ_CAREER_HUB_COUNT = 6;

export function buildIqFeederCorridors(
  hubs: readonly IqCareerHubDef[] = IQ_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertIqCareerHubCatalog(): void {
  if (IQ_CAREER_HUBS.length !== IQ_CAREER_HUB_COUNT) {
    throw new Error(
      `IQ_CAREER_HUBS length ${IQ_CAREER_HUBS.length} !== ${IQ_CAREER_HUB_COUNT}`,
    );
  }
  for (const icao of ['ORBI', 'ORMM', 'ORER'] as const) {
    if (!IQ_CAREER_HUBS.some((h) => h.icao === icao && h.hubTier === 'major')) {
      throw new Error(`IQ catalog must include major ${icao}`);
    }
  }
  if (IQ_CAREER_HUBS.some((h) => h.icao === 'ORBS')) {
    throw new Error('IQ catalog must use ORBI for Baghdad, not ORBS');
  }
}
