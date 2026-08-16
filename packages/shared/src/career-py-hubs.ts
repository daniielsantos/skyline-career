/**
 * Paraguay career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PyCareerRegion = 'PY-C';

export type PyCareerHubDef = {
  icao: string;
  name: string;
  region: PyCareerRegion;
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
  consume: { electronics: 0.85, machinery: 0.8, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.45, fuel: 1.05, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.9, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 7 curated Paraguay hubs — single Central region (no ocean port). */
export const PY_CAREER_HUBS: readonly PyCareerHubDef[] = [
  {
    icao: 'SGAS',
    name: 'Asuncion Silvio Pettirossi',
    region: 'PY-C',
    hubTier: 'major',
    lat: -25.2397,
    lon: -57.5192,
    produce: { general: 1.4, perishables: 1.25, machinery: 1.1 },
    consume: { electronics: 1.1, supplies: 1.05, general: 1.0 },
  },
  {
    icao: 'SGES',
    name: 'Ciudad del Este Guarani',
    region: 'PY-C',
    hubTier: 'regional',
    lat: -25.4555,
    lon: -54.8436,
    produce: { electronics: 1.35, general: 1.2, machinery: 1.15 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'SGCO',
    name: 'Concepcion',
    region: 'PY-C',
    hubTier: 'spoke',
    lat: -23.4424,
    lon: -57.4273,
    ...agroSpoke,
  },
  {
    icao: 'SGME',
    name: 'Mariscal Estigarribia',
    region: 'PY-C',
    hubTier: 'spoke',
    lat: -22.045,
    lon: -60.6217,
    ...drySpoke,
  },
  {
    icao: 'SGEN',
    name: 'Encarnacion Teniente Amin Ayub Gonzalez',
    region: 'PY-C',
    hubTier: 'spoke',
    lat: -27.2397,
    lon: -55.8375,
    ...agroSpoke,
  },
  {
    icao: 'SGAY',
    name: 'Ayolas Juan de Ayolas',
    region: 'PY-C',
    hubTier: 'spoke',
    lat: -27.3705,
    lon: -56.8541,
    ...agroSpoke,
  },
  {
    icao: 'SGFI',
    name: 'Filadelfia',
    region: 'PY-C',
    hubTier: 'spoke',
    lat: -22.36,
    lon: -60.0536,
    ...drySpoke,
  },
];

export const PY_CAREER_HUB_COUNT = 7;

export function buildPyFeederCorridors(
  hubs: readonly PyCareerHubDef[] = PY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPyCareerHubCatalog(): void {
  if (PY_CAREER_HUBS.length !== PY_CAREER_HUB_COUNT) {
    throw new Error(
      `PY_CAREER_HUBS length ${PY_CAREER_HUBS.length} !== ${PY_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of PY_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate PY hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  if (byRegion['PY-C'] !== 7) {
    throw new Error(`PY-C has ${byRegion['PY-C'] ?? 0} hubs, expected 7`);
  }
}
