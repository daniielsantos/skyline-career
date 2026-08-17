/**
 * Iran career hub catalog — MENA-3 North Gulf.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type IrCareerRegion = 'IR-N' | 'IR-C' | 'IR-S';

export type IrCareerHubDef = {
  icao: string;
  name: string;
  region: IrCareerRegion;
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

/** 8 curated Iran hubs. Tehran intl Dispatch major is OIIE (not OIII alone). */
export const IR_CAREER_HUBS: readonly IrCareerHubDef[] = [
  {
    icao: 'OIIE',
    name: 'Tehran Imam Khomeini',
    region: 'IR-C',
    hubTier: 'major',
    lat: 35.4161,
    lon: 51.1522,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.1 },
  },
  {
    icao: 'OIII',
    name: 'Tehran Mehrabad',
    region: 'IR-C',
    hubTier: 'regional',
    lat: 35.6892,
    lon: 51.3134,
    produce: { general: 1.3, electronics: 1.2, supplies: 1.15 },
    consume: { perishables: 1.15, machinery: 1.0 },
  },
  {
    icao: 'OIFM',
    name: 'Isfahan Shahid Beheshti',
    region: 'IR-C',
    hubTier: 'regional',
    lat: 32.7508,
    lon: 51.8613,
    ...plateau,
  },
  {
    icao: 'OITT',
    name: 'Tabriz',
    region: 'IR-N',
    hubTier: 'spoke',
    lat: 38.1339,
    lon: 46.235,
    ...plateau,
  },
  {
    icao: 'OIMM',
    name: 'Mashhad',
    region: 'IR-N',
    hubTier: 'regional',
    lat: 36.2352,
    lon: 59.641,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.15 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'OISS',
    name: 'Shiraz Shahid Dastghaib',
    region: 'IR-S',
    hubTier: 'major',
    lat: 29.5392,
    lon: 52.5898,
    produce: { electronics: 1.35, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1 },
  },
  {
    // MSFS / AIP: Bandar Abbas is OIKB (OIBA is Abu Musa Island ~108 nm SW).
    icao: 'OIKB',
    name: 'Bandar Abbas',
    region: 'IR-S',
    hubTier: 'regional',
    lat: 27.2183,
    lon: 56.3778,
    produce: { machinery: 1.3, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
  {
    icao: 'OIKK',
    name: 'Kerman',
    region: 'IR-S',
    hubTier: 'spoke',
    lat: 30.2744,
    lon: 56.9511,
    ...plateau,
  },
];

export const IR_CAREER_HUB_COUNT = 8;

export function buildIrFeederCorridors(
  hubs: readonly IrCareerHubDef[] = IR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertIrCareerHubCatalog(): void {
  if (IR_CAREER_HUBS.length !== IR_CAREER_HUB_COUNT) {
    throw new Error(
      `IR_CAREER_HUBS length ${IR_CAREER_HUBS.length} !== ${IR_CAREER_HUB_COUNT}`,
    );
  }
  if (!IR_CAREER_HUBS.some((h) => h.icao === 'OIIE' && h.hubTier === 'major')) {
    throw new Error('IR catalog must include major OIIE (Imam Khomeini)');
  }
  if (!IR_CAREER_HUBS.some((h) => h.icao === 'OISS' && h.hubTier === 'major')) {
    throw new Error('IR catalog must include major OISS');
  }
  if (!IR_CAREER_HUBS.some((h) => h.icao === 'OIKB')) {
    throw new Error('IR catalog must include OIKB Bandar Abbas (port pickup)');
  }
  if (!IR_CAREER_HUBS.some((h) => h.icao === 'OIKK')) {
    throw new Error('IR catalog must include OIKK Kerman');
  }
  if (IR_CAREER_HUBS.some((h) => h.icao === 'OIBA')) {
    throw new Error('IR catalog must use OIKB for Bandar Abbas, not OIBA (Abu Musa)');
  }
  const tehranMajor = IR_CAREER_HUBS.find((h) => h.icao === 'OIII');
  if (tehranMajor?.hubTier === 'major') {
    throw new Error('IR catalog must keep OIII Mehrabad non-major (use OIIE)');
  }
}
