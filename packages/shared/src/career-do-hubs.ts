/**
 * Dominican Republic career hub catalog — intl-first island pattern.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type DoCareerRegion = 'DO-C';

export type DoCareerHubDef = {
  icao: string;
  name: string;
  region: DoCareerRegion;
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

/** 6 curated DR hubs — Santo Domingo / Punta Cana corridor. */
export const DO_CAREER_HUBS: readonly DoCareerHubDef[] = [
  {
    icao: 'MDSD',
    name: 'Santo Domingo Las Americas',
    region: 'DO-C',
    hubTier: 'major',
    lat: 18.4297,
    lon: -69.6689,
    produce: { general: 1.45, electronics: 1.2, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MDPC',
    name: 'Punta Cana',
    region: 'DO-C',
    hubTier: 'regional',
    lat: 18.5674,
    lon: -68.3634,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 1.1, machinery: 0.95 },
  },
  {
    icao: 'MDST',
    name: 'Santiago Cibao',
    region: 'DO-C',
    hubTier: 'regional',
    lat: 19.4061,
    lon: -70.6047,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'MDPP',
    name: 'Puerto Plata Gregorio Luperon',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 19.7579,
    lon: -70.5701,
    ...agroSpoke,
  },
  {
    icao: 'MDLR',
    name: 'La Romana Casa de Campo',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 18.4507,
    lon: -68.9118,
    ...agroSpoke,
  },
  {
    icao: 'MDCY',
    name: 'Samana El Catey Presidente Juan Bosch',
    region: 'DO-C',
    hubTier: 'spoke',
    lat: 19.2676,
    lon: -69.742,
    ...drySpoke,
  },
];

export const DO_CAREER_HUB_COUNT = 6;

export function buildDoFeederCorridors(
  hubs: readonly DoCareerHubDef[] = DO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertDoCareerHubCatalog(): void {
  if (DO_CAREER_HUBS.length !== DO_CAREER_HUB_COUNT) {
    throw new Error(
      `DO_CAREER_HUBS length ${DO_CAREER_HUBS.length} !== ${DO_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  let n = 0;
  for (const h of DO_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate DO hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    if (h.region === 'DO-C') n += 1;
  }
  if (n !== 6) throw new Error(`DO-C has ${n} hubs, expected 6`);
}
