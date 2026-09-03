/**
 * Peru career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { PE_DENSIFY_HUBS, PE_DENSIFY_HUB_COUNT } from './career-pe-hubs-densify.js';

export type PeCareerRegion = 'PE-C' | 'PE-S';

export type PeCareerHubDef = {
  icao: string;
  name: string;
  region: PeCareerRegion;
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
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 14 curated Peru hubs — Costa/Centro-Norte + Sur andino.
 */
export const PE_CAREER_HUBS: readonly PeCareerHubDef[] = [
  // ── PE-C (8) ─────────────────────────────────────────────────────────────
  {
    icao: 'SPJC',
    name: 'Lima Jorge Chávez',
    region: 'PE-C',
    hubTier: 'major',
    lat: -12.0219,
    lon: -77.1143,
    produce: { general: 1.5, electronics: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SPRU',
    name: 'Trujillo Capitan FAP Carlos Martinez de Pinillos',
    region: 'PE-C',
    hubTier: 'regional',
    lat: -8.0817,
    lon: -79.1088,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SPHI',
    name: 'Chiclayo Capitan FAP Jose A. Quinones',
    region: 'PE-C',
    hubTier: 'regional',
    lat: -6.7875,
    lon: -79.8281,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SPCL',
    name: 'Pucallpa Capitan FAP David Abenzur Rengifo',
    region: 'PE-C',
    hubTier: 'regional',
    lat: -8.3779,
    lon: -74.5743,
    produce: { perishables: 1.3, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SPQT',
    name: 'Iquitos Coronel FAP Francisco Secada Vignetta',
    region: 'PE-C',
    hubTier: 'regional',
    lat: -3.7847,
    lon: -73.3088,
    produce: { perishables: 1.25, general: 1.05, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'SPST',
    name: 'Tarapoto Cadete FAP Guillermo del Castillo Paredes',
    region: 'PE-C',
    hubTier: 'regional',
    lat: -6.5087,
    lon: -76.3732,
    produce: { perishables: 1.2, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'SPNC',
    name: 'Huánuco Alférez FAP David Figueroa Fernandini',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -9.8788,
    lon: -76.2048,
    ...drySpoke,
  },
  {
    icao: 'SPJI',
    name: 'Juanjui',
    region: 'PE-C',
    hubTier: 'spoke',
    lat: -7.1691,
    lon: -76.7286,
    ...agroSpoke,
  },

  // ── PE-S (6) ─────────────────────────────────────────────────────────────
  {
    icao: 'SPZO',
    name: 'Cusco Alejandro Velasco Astete',
    region: 'PE-S',
    hubTier: 'regional',
    lat: -13.5357,
    lon: -71.9388,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.1 },
    consume: { electronics: 1.0, perishables: 1.15, supplies: 1.05 },
  },
  {
    icao: 'SPQU',
    name: 'Arequipa Rodríguez Ballón',
    region: 'PE-S',
    hubTier: 'regional',
    lat: -16.3411,
    lon: -71.5831,
    produce: { perishables: 1.25, general: 1.15, machinery: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SPJL',
    name: 'Juliaca Inca Manco Capac',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -15.4671,
    lon: -70.1582,
    ...agroSpoke,
  },
  {
    icao: 'SPTN',
    name: 'Tacna Coronel FAP Carlos Ciriani Santa Rosa',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -18.0533,
    lon: -70.2758,
    ...agroSpoke,
  },
  {
    icao: 'SPHO',
    name: 'Ayacucho Coronel FAP Alfredo Mendívil Duarte',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -13.1548,
    lon: -74.2044,
    ...agroSpoke,
  },
  {
    icao: 'SPHY',
    name: 'Andahuaylas',
    region: 'PE-S',
    hubTier: 'spoke',
    lat: -13.7064,
    lon: -73.3503,
    ...agroSpoke,
  },
  ...PE_DENSIFY_HUBS,
];

export const PE_CAREER_HUB_COUNT = 14 + PE_DENSIFY_HUB_COUNT;

export function buildPeFeederCorridors(
  hubs: readonly PeCareerHubDef[] = PE_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPeCareerHubCatalog(): void {
  if (PE_CAREER_HUBS.length !== PE_CAREER_HUB_COUNT) {
    throw new Error(
      `PE_CAREER_HUBS length ${PE_CAREER_HUBS.length} !== ${PE_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of PE_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate PE hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<PeCareerRegion, number> = {
    'PE-C': 22,
    'PE-S': 10,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `PE region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
