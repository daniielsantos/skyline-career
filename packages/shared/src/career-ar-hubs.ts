/**
 * Argentina career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { AR_DENSIFY_HUBS, AR_DENSIFY_HUB_COUNT } from './career-ar-hubs-densify.js';

export type ArCareerRegion = 'AR-BA' | 'AR-CO' | 'AR-NO' | 'AR-PA';

export type ArCareerHubDef = {
  icao: string;
  name: string;
  region: ArCareerRegion;
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

const petroSpoke = {
  produce: { machinery: 1.25, general: 1.05, supplies: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, perishables: 0.85 } as Partial<
    Record<CommodityId, number>
  >,
};

const miningSpoke = {
  produce: { machinery: 1.35, general: 1.0, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, electronics: 0.9, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 40 curated Argentina hubs across BA / Centro-Cuyo / Norte / Patagonia.
 */
export const AR_CAREER_HUBS: readonly ArCareerHubDef[] = [
  // ── AR-BA (13) ───────────────────────────────────────────────────────────
  {
    icao: 'SAEZ',
    name: 'Buenos Aires/Ezeiza Ministro Pistarini',
    region: 'AR-BA',
    hubTier: 'major',
    lat: -34.8222,
    lon: -58.5358,
    produce: { general: 1.55, electronics: 1.25, machinery: 1.1 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SABE',
    name: 'Buenos Aires/Aeroparque Jorge Newbery',
    region: 'AR-BA',
    hubTier: 'major',
    lat: -34.5592,
    lon: -58.4156,
    produce: { general: 1.35, electronics: 1.15, supplies: 1.05 },
    consume: { perishables: 1.2, general: 1.05 },
  },
  {
    icao: 'SAAR',
    name: 'Rosario Islas Malvinas',
    region: 'AR-BA',
    hubTier: 'regional',
    lat: -32.9036,
    lon: -60.785,
    produce: { perishables: 1.35, machinery: 1.15, general: 1.1 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SAZM',
    name: 'Mar del Plata Astor Piazzolla',
    region: 'AR-BA',
    hubTier: 'regional',
    lat: -37.9342,
    lon: -57.5733,
    produce: { perishables: 1.25, general: 1.05 },
    consume: { electronics: 0.95, supplies: 1.05, general: 0.95 },
  },
  {
    icao: 'SAAV',
    name: 'Sauce Viejo (Santa Fe)',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -31.7117,
    lon: -60.8117,
    ...agroSpoke,
  },
  {
    icao: 'SAAP',
    name: 'Paraná General Urquiza',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -31.7947,
    lon: -60.4803,
    ...agroSpoke,
  },
  {
    icao: 'SAZR',
    name: 'Santa Rosa',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -36.5883,
    lon: -64.2756,
    ...agroSpoke,
  },
  {
    icao: 'SAZH',
    name: 'Tres Arroyos',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -38.3869,
    lon: -60.3297,
    ...agroSpoke,
  },
  {
    icao: 'SAZB',
    name: 'Bahía Blanca Comandante Espora',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -38.725,
    lon: -62.1692,
    ...petroSpoke,
  },
  {
    icao: 'SAZT',
    name: 'Tandil',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -37.2372,
    lon: -59.2278,
    ...drySpoke,
  },
  {
    icao: 'SAAJ',
    name: 'Junín',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -34.5458,
    lon: -60.9306,
    ...agroSpoke,
  },
  {
    icao: 'SAZV',
    name: 'Villa Gesell',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -37.2353,
    lon: -57.0292,
    produce: { general: 0.95, supplies: 0.9 },
    consume: { perishables: 1.15, supplies: 1.1, electronics: 0.9 },
  },
  {
    icao: 'SADF',
    name: 'San Fernando',
    region: 'AR-BA',
    hubTier: 'spoke',
    lat: -34.4531,
    lon: -58.5897,
    produce: { general: 1.15, electronics: 1.05, supplies: 1.0 },
    consume: { perishables: 1.05, general: 0.95 },
  },

  // ── AR-CO (9) ────────────────────────────────────────────────────────────
  {
    icao: 'SACO',
    name: 'Córdoba Ingeniero Ambrosio Taravella',
    region: 'AR-CO',
    hubTier: 'major',
    lat: -31.3236,
    lon: -64.2081,
    produce: { machinery: 1.35, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, general: 1.0 },
  },
  {
    icao: 'SAME',
    name: 'Mendoza El Plumerillo',
    region: 'AR-CO',
    hubTier: 'regional',
    lat: -32.8317,
    lon: -68.7928,
    produce: { perishables: 1.45, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SANL',
    name: 'San Luis Brigadier Mayor D. César Raúl Ojeda',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -33.2731,
    lon: -66.3564,
    ...agroSpoke,
  },
  {
    icao: 'SANU',
    name: 'San Juan Domingo Faustino Sarmiento',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -31.5715,
    lon: -68.4182,
    ...miningSpoke,
  },
  {
    icao: 'SAOC',
    name: 'Río Cuarto Area de Material',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -33.0853,
    lon: -64.2614,
    ...agroSpoke,
  },
  {
    icao: 'SAOR',
    name: 'Villa Reynolds (San Luis)',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -33.7297,
    lon: -65.3872,
    ...drySpoke,
  },
  {
    icao: 'SAOU',
    name: 'San Rafael',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -34.6092,
    lon: -68.4039,
    ...agroSpoke,
  },
  {
    icao: 'SAOD',
    name: 'Villa Dolores',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -31.9506,
    lon: -65.1464,
    ...agroSpoke,
  },
  {
    icao: 'SAMA',
    name: 'Malargüe',
    region: 'AR-CO',
    hubTier: 'spoke',
    lat: -35.4936,
    lon: -69.5742,
    ...miningSpoke,
  },

  // ── AR-NO (9) ────────────────────────────────────────────────────────────
  {
    icao: 'SANT',
    name: 'San Miguel de Tucumán Teniente Benjamín Matienzo',
    region: 'AR-NO',
    hubTier: 'regional',
    lat: -26.8409,
    lon: -65.1049,
    produce: { perishables: 1.4, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'SASA',
    name: 'Salta Martín Miguel de Güemes',
    region: 'AR-NO',
    hubTier: 'regional',
    lat: -24.8561,
    lon: -65.4862,
    produce: { perishables: 1.3, general: 1.1, machinery: 1.0 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SASJ',
    name: 'San Salvador de Jujuy Gobernador Horacio Guzmán',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -24.3928,
    lon: -65.0978,
    ...miningSpoke,
  },
  {
    icao: 'SANC',
    name: 'Catamarca Coronel Felipe Varela',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -28.5956,
    lon: -65.7517,
    ...miningSpoke,
  },
  {
    icao: 'SANR',
    name: 'Santiago del Estero',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -27.7656,
    lon: -64.3103,
    ...agroSpoke,
  },
  {
    icao: 'SARE',
    name: 'Resistencia',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -27.45,
    lon: -59.0561,
    ...agroSpoke,
  },
  {
    icao: 'SARC',
    name: 'Corrientes Doctor Fernando Piragine Niveyro',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -27.4455,
    lon: -58.7619,
    ...agroSpoke,
  },
  {
    icao: 'SARF',
    name: 'Formosa',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -26.2128,
    lon: -58.2281,
    ...agroSpoke,
  },
  {
    icao: 'SARP',
    name: 'Posadas Libertador General José de San Martín',
    region: 'AR-NO',
    hubTier: 'spoke',
    lat: -27.3858,
    lon: -55.9707,
    ...agroSpoke,
  },

  // ── AR-PA (10) ────────────────────────────────────────────────────────────
  {
    icao: 'SAZS',
    name: 'San Carlos de Bariloche',
    region: 'AR-PA',
    hubTier: 'regional',
    lat: -41.1512,
    lon: -71.1575,
    produce: { general: 1.05, supplies: 1.0 },
    consume: { perishables: 1.25, supplies: 1.15, electronics: 0.95 },
  },
  {
    // Was wrongly labeled Neuquén (real ICAO SAZN) — ~180 nm inland of MSFS SAVN.
    icao: 'SAVN',
    name: 'San Antonio Oeste Antoine de Saint Exupéry',
    region: 'AR-PA',
    hubTier: 'regional',
    lat: -40.7511,
    lon: -65.0343,
    produce: { general: 1.1, supplies: 1.05, perishables: 1.15 },
    consume: { machinery: 1.05, electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'SAZN',
    name: 'Neuquén Presidente Perón',
    region: 'AR-PA',
    hubTier: 'regional',
    lat: -38.949,
    lon: -68.1557,
    produce: { machinery: 1.3, general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.0, electronics: 0.95 },
  },
  {
    icao: 'SAVC',
    name: 'Comodoro Rivadavia General Enrique Mosconi',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -45.7853,
    lon: -67.4655,
    ...petroSpoke,
  },
  {
    icao: 'SAVT',
    name: 'Trelew Almirante Marcos A. Zar',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -43.2105,
    lon: -65.2703,
    ...petroSpoke,
  },
  {
    icao: 'SAVY',
    name: 'Puerto Madryn El Tehuelche',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -42.7592,
    lon: -65.1028,
    ...drySpoke,
  },
  {
    icao: 'SAWH',
    name: 'Ushuaia Malvinas Argentinas',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -54.8433,
    lon: -68.2958,
    produce: { general: 0.9, supplies: 0.95 },
    consume: { perishables: 1.3, supplies: 1.25, electronics: 0.9, general: 1.05 },
  },
  {
    icao: 'SAWG',
    name: 'Río Gallegos',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -51.6089,
    lon: -69.3126,
    ...petroSpoke,
  },
  {
    icao: 'SAWE',
    name: 'Río Grande',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -53.7777,
    lon: -67.7494,
    ...petroSpoke,
  },
  {
    icao: 'SAWC',
    name: 'El Calafate',
    region: 'AR-PA',
    hubTier: 'spoke',
    lat: -50.2803,
    lon: -72.0531,
    produce: { general: 0.95, supplies: 0.9 },
    consume: { perishables: 1.2, supplies: 1.15, electronics: 0.9 },
  },
  ...AR_DENSIFY_HUBS,
];

export const AR_CAREER_HUB_COUNT = 41 + AR_DENSIFY_HUB_COUNT;

export function buildArFeederCorridors(
  hubs: readonly ArCareerHubDef[] = AR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertArCareerHubCatalog(): void {
  if (AR_CAREER_HUBS.length !== AR_CAREER_HUB_COUNT) {
    throw new Error(
      `AR_CAREER_HUBS length ${AR_CAREER_HUBS.length} !== ${AR_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of AR_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate AR hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<ArCareerRegion, number> = {
    'AR-BA': 23,
    'AR-CO': 13,
    'AR-NO': 16,
    'AR-PA': 18,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `AR region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
