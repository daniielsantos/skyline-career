/**
 * Colombia career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CoCareerRegion = 'CO-C' | 'CO-N' | 'CO-W';

export type CoCareerHubDef = {
  icao: string;
  name: string;
  region: CoCareerRegion;
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
 * 16 curated Colombia hubs — Centro andino + Caribe + Occidente/Amazonas.
 */
export const CO_CAREER_HUBS: readonly CoCareerHubDef[] = [
  // ── CO-C (6) ─────────────────────────────────────────────────────────────
  {
    icao: 'SKBO',
    name: 'Bogotá El Dorado',
    region: 'CO-C',
    hubTier: 'major',
    lat: 4.7016,
    lon: -74.1469,
    produce: { general: 1.55, electronics: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SKBG',
    name: 'Bucaramanga Palonegro',
    region: 'CO-C',
    hubTier: 'regional',
    lat: 7.1265,
    lon: -73.1848,
    produce: { general: 1.2, machinery: 1.1, perishables: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SKPE',
    name: 'Pereira Matecaña',
    region: 'CO-C',
    hubTier: 'regional',
    lat: 4.8127,
    lon: -75.7395,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SKCC',
    name: 'Cúcuta Camilo Daza',
    region: 'CO-C',
    hubTier: 'regional',
    lat: 7.9276,
    lon: -72.5115,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SKMZ',
    name: 'Manizales La Nubia',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 5.03,
    lon: -75.465,
    ...agroSpoke,
  },
  {
    icao: 'SKAR',
    name: 'Armenia El Edén',
    region: 'CO-C',
    hubTier: 'spoke',
    lat: 4.4528,
    lon: -75.7664,
    ...agroSpoke,
  },

  // ── CO-N (5) ─────────────────────────────────────────────────────────────
  {
    icao: 'SKCG',
    name: 'Cartagena Rafael Núñez',
    region: 'CO-N',
    hubTier: 'regional',
    lat: 10.4424,
    lon: -75.513,
    produce: { general: 1.25, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 1.05, perishables: 1.1 },
  },
  {
    icao: 'SKBQ',
    name: 'Barranquilla Ernesto Cortissoz',
    region: 'CO-N',
    hubTier: 'regional',
    lat: 10.8896,
    lon: -74.7808,
    produce: { general: 1.3, machinery: 1.1, perishables: 1.1 },
    consume: { electronics: 1.0, supplies: 1.0 },
  },
  {
    icao: 'SKSM',
    name: 'Santa Marta Simón Bolívar',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 11.1196,
    lon: -74.2306,
    ...agroSpoke,
  },
  {
    icao: 'SKMR',
    name: 'Montería Los Garzones',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 8.8237,
    lon: -75.8258,
    ...agroSpoke,
  },
  {
    icao: 'SKRH',
    name: 'Riohacha Almirante Padilla',
    region: 'CO-N',
    hubTier: 'spoke',
    lat: 11.5262,
    lon: -72.926,
    ...drySpoke,
  },

  // ── CO-W (5) ─────────────────────────────────────────────────────────────
  {
    icao: 'SKRG',
    name: 'Medellín José María Córdova',
    region: 'CO-W',
    hubTier: 'regional',
    lat: 6.1645,
    lon: -75.4231,
    produce: { general: 1.35, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.1, supplies: 1.0 },
  },
  {
    icao: 'SKCL',
    name: 'Cali Alfonso Bonilla Aragón',
    region: 'CO-W',
    hubTier: 'regional',
    lat: 3.5432,
    lon: -76.3816,
    produce: { perishables: 1.25, general: 1.2, machinery: 1.05 },
    consume: { electronics: 1.0, supplies: 0.95 },
  },
  {
    icao: 'SKBU',
    name: 'Buenaventura',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 3.8196,
    lon: -76.9898,
    ...drySpoke,
  },
  {
    icao: 'SKPS',
    name: 'Pasto Antonio Nariño',
    region: 'CO-W',
    hubTier: 'spoke',
    lat: 1.3964,
    lon: -77.2915,
    ...agroSpoke,
  },
  {
    icao: 'SKLT',
    name: 'Leticia Alfredo Vásquez Cobo',
    region: 'CO-W',
    hubTier: 'regional',
    lat: -4.19355,
    lon: -69.9432,
    produce: { perishables: 1.2, general: 1.05, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.15, supplies: 1.1 },
  },
];

export const CO_CAREER_HUB_COUNT = 16;

export function buildCoFeederCorridors(
  hubs: readonly CoCareerHubDef[] = CO_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCoCareerHubCatalog(): void {
  if (CO_CAREER_HUBS.length !== CO_CAREER_HUB_COUNT) {
    throw new Error(
      `CO_CAREER_HUBS length ${CO_CAREER_HUBS.length} !== ${CO_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of CO_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate CO hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<CoCareerRegion, number> = {
    'CO-C': 6,
    'CO-N': 5,
    'CO-W': 5,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `CO region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
