/**
 * Mexico career hub catalog (45 airports).
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type MxCareerRegion = 'MX-N' | 'MX-C' | 'MX-S' | 'MX-Y';

export type MxCareerHubDef = {
  icao: string;
  name: string;
  region: MxCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  /** Soft-field bush strip — no ferry; light_ga OD only vs same-country gateways. */
  bush?: true;
};

/** Soft-field bush: chronic supplies/general sink + weak electronics source. */
const bushSpoke = {
  produce: {
    electronics: 1.35,
    general: 0.35,
    supplies: 0.3,
    perishables: 0.55,
    machinery: 0.2,
  } as Partial<Record<CommodityId, number>>,
  consume: {
    supplies: 2.4,
    general: 2.1,
    perishables: 1.2,
    electronics: 0.35,
    machinery: 0.55,
  } as Partial<Record<CommodityId, number>>,
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.8, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const dryRegional = {
  produce: { general: 1.3, supplies: 1.15, perishables: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 1.0, machinery: 0.95, general: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
};

const maquilaSpoke = {
  produce: { machinery: 1.2, electronics: 1.1, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 0.85, general: 0.9, supplies: 0.85 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.0, supplies: 0.95 } as Partial<
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

const resortSpoke = {
  produce: { general: 0.95, supplies: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.2, supplies: 1.15, electronics: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 45 curated Mexico hubs. Majors preserved (MMMX/MMMY/MMGL/MMUN);
 * densifies N/C/S/Y holes for starter-friendly short-haul demand.
 */
export const MX_CAREER_HUBS: readonly MxCareerHubDef[] = [
  // ── MX-N (14) ────────────────────────────────────────────────────────────
  {
    icao: 'MMMY',
    name: 'Monterrey/Gen. Mariano Escobedo',
    region: 'MX-N',
    hubTier: 'major',
    lat: 25.7785,
    lon: -100.1069,
    produce: { machinery: 1.6, electronics: 1.1, general: 1.0 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'MMTJ',
    name: 'Tijuana International',
    region: 'MX-N',
    hubTier: 'regional',
    lat: 32.5411,
    lon: -116.9702,
    produce: { electronics: 1.25, machinery: 1.1, general: 1.0 },
    consume: { perishables: 0.9, supplies: 0.9 },
  },
  {
    icao: 'MMHO',
    name: 'Hermosillo International',
    region: 'MX-N',
    hubTier: 'regional',
    lat: 29.0959,
    lon: -111.0478,
    produce: { perishables: 1.3, general: 1.1, machinery: 1.0 },
    consume: { electronics: 0.9, supplies: 0.95 },
  },
  {
    icao: 'MMCS',
    name: 'Ciudad Juárez/Abraham González',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 31.6361,
    lon: -106.4288,
    ...maquilaSpoke,
  },
  {
    icao: 'MMCL',
    name: 'Culiacán International',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 24.7644,
    lon: -107.4747,
    ...agroSpoke,
  },
  {
    icao: 'MMCU',
    name: 'Chihuahua International',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 28.7028,
    lon: -105.9642,
    ...maquilaSpoke,
  },
  {
    icao: 'MMTC',
    name: 'Torreón/Francisco Sarabia',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 25.5683,
    lon: -103.4111,
    ...maquilaSpoke,
  },
  {
    icao: 'MMDO',
    name: 'Durango/Guadalupe Victoria',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 24.1244,
    lon: -104.5283,
    ...drySpoke,
  },
  {
    icao: 'MMML',
    name: 'Mexicali International',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 32.6306,
    lon: -115.2411,
    ...maquilaSpoke,
  },
  {
    icao: 'MMLM',
    name: 'Los Mochis/Federal del Valle del Fuerte',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 25.685,
    lon: -109.0808,
    ...agroSpoke,
  },
  {
    icao: 'MMNL',
    name: 'Nuevo Laredo/Quetzalcóatl',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 27.4439,
    lon: -99.5706,
    ...maquilaSpoke,
    produce: { general: 1.2, machinery: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MMRX',
    name: 'Reynosa/Gen. Lucio Blanco',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 26.0089,
    lon: -98.2286,
    ...maquilaSpoke,
  },
  {
    icao: 'MMMA',
    name: 'Matamoros/Gen. Servando Canales',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 25.7697,
    lon: -97.5253,
    ...maquilaSpoke,
  },
  {
    icao: 'MMIO',
    name: 'Saltillo/Plan de Guadalupe',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 25.5486,
    lon: -100.9289,
    ...maquilaSpoke,
    produce: { machinery: 1.3, electronics: 1.0, general: 0.95 },
  },

  // ── MX-C (14) ────────────────────────────────────────────────────────────
  {
    icao: 'MMMX',
    name: 'Mexico City International',
    region: 'MX-C',
    hubTier: 'major',
    lat: 19.4363,
    lon: -99.0721,
    produce: { general: 1.5, electronics: 1.2, machinery: 1.0 },
    consume: { perishables: 1.1, general: 1.0 },
  },
  {
    icao: 'MMGL',
    name: 'Guadalajara/Miguel Hidalgo y Costilla',
    region: 'MX-C',
    hubTier: 'major',
    lat: 20.5218,
    lon: -103.3111,
    produce: { electronics: 1.6, machinery: 1.1, general: 1.0 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'MMTO',
    name: 'Toluca International',
    region: 'MX-C',
    hubTier: 'regional',
    lat: 19.3371,
    lon: -99.5661,
    produce: { machinery: 1.25, general: 1.15, electronics: 1.0 },
    consume: { perishables: 0.95, supplies: 0.95 },
  },
  {
    icao: 'MMLO',
    name: 'León/Del Bajío',
    region: 'MX-C',
    hubTier: 'regional',
    lat: 20.9936,
    lon: -101.4811,
    produce: { machinery: 1.3, general: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, perishables: 0.95 },
  },
  {
    icao: 'MMQT',
    name: 'Querétaro/Intercontinental',
    region: 'MX-C',
    hubTier: 'regional',
    lat: 20.6173,
    lon: -100.1858,
    produce: { electronics: 1.2, machinery: 1.2, general: 1.0 },
    consume: { perishables: 0.95, supplies: 0.95 },
  },
  {
    icao: 'MMAS',
    name: 'Aguascalientes/Jesús Terán',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 21.7056,
    lon: -102.3178,
    produce: { machinery: 1.2, general: 1.1, electronics: 0.95 },
    consume: { perishables: 0.9, supplies: 0.9 },
  },
  {
    icao: 'MMSP',
    name: 'San Luis Potosí/Ponciano Arriaga',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 22.2542,
    lon: -100.9306,
    produce: { machinery: 1.2, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'MMPB',
    name: 'Puebla/Hermanos Serdán',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 19.1581,
    lon: -98.3717,
    ...drySpoke,
  },
  {
    icao: 'MMMM',
    name: 'Morelia/Gen. Francisco J. Mujica',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 19.8499,
    lon: -101.0253,
    ...agroSpoke,
  },
  {
    icao: 'MMZC',
    name: 'Zacatecas/Gen. Leobardo C. Ruiz',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 22.8971,
    lon: -102.6889,
    ...drySpoke,
  },
  {
    icao: 'MMIA',
    name: 'Colima/Licenciado Miguel de la Madrid',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 19.2769,
    lon: -103.5772,
    ...agroSpoke,
  },
  {
    icao: 'MMPR',
    name: 'Puerto Vallarta/Gustavo Díaz Ordaz',
    region: 'MX-C',
    hubTier: 'spoke',
    ...resortSpoke,
    lat: 20.6801,
    lon: -105.2544,
  },
  {
    icao: 'MMZO',
    name: 'Manzanillo/Playa de Oro',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 19.1448,
    lon: -104.5583,
    produce: { general: 1.15, supplies: 1.1, perishables: 1.0 },
    consume: { electronics: 0.85, machinery: 0.9 },
  },
  {
    icao: 'MMEP',
    name: 'Tepic/Amado Nervo',
    region: 'MX-C',
    hubTier: 'spoke',
    lat: 21.4194,
    lon: -104.8426,
    ...agroSpoke,
  },

  // ── MX-S (9) ─────────────────────────────────────────────────────────────
  {
    icao: 'MMVR',
    name: 'Veracruz/Gen. Heriberto Jara',
    region: 'MX-S',
    hubTier: 'regional',
    lat: 19.1458,
    lon: -96.1872,
    produce: { machinery: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, perishables: 1.0 },
  },
  {
    icao: 'MMVA',
    name: 'Villahermosa/Carlos Rovirosa Pérez',
    region: 'MX-S',
    hubTier: 'regional',
    lat: 17.9969,
    lon: -92.8178,
    ...dryRegional,
    produce: { machinery: 1.25, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'MMTM',
    name: 'Tampico/Gen. Francisco Javier Mina',
    region: 'MX-S',
    hubTier: 'spoke',
    lat: 22.2964,
    lon: -97.8658,
    ...petroSpoke,
  },
  {
    icao: 'MMMT',
    name: 'Minatitlán/Coatzacoalcos',
    region: 'MX-S',
    hubTier: 'spoke',
    lat: 18.1031,
    lon: -94.5806,
    ...petroSpoke,
  },
  {
    icao: 'MMOX',
    name: 'Oaxaca/Xoxocotlán',
    region: 'MX-S',
    hubTier: 'spoke',
    lat: 16.9998,
    lon: -96.7266,
    ...agroSpoke,
  },
  {
    icao: 'MMTG',
    name: 'Tuxtla Gutiérrez/Ángel Albino Corzo',
    region: 'MX-S',
    hubTier: 'spoke',
    lat: 16.5636,
    lon: -93.0224,
    ...agroSpoke,
  },
  {
    icao: 'MMTP',
    name: 'Tapachula International',
    region: 'MX-S',
    hubTier: 'spoke',
    lat: 14.7942,
    lon: -92.3697,
    ...agroSpoke,
    produce: { perishables: 1.4, general: 1.0, supplies: 0.95 },
  },
  {
    icao: 'MMAA',
    name: 'Acapulco/Gen. Juan N. Álvarez',
    region: 'MX-S',
    hubTier: 'spoke',
    ...resortSpoke,
    lat: 16.7571,
    lon: -99.7539,
  },
  {
    icao: 'MMZH',
    name: 'Ixtapa-Zihuatanejo International',
    region: 'MX-S',
    hubTier: 'spoke',
    ...resortSpoke,
    lat: 17.6017,
    lon: -101.4606,
  },

  // ── MX-Y (8) ─────────────────────────────────────────────────────────────
  {
    icao: 'MMUN',
    name: 'Cancún International',
    region: 'MX-Y',
    hubTier: 'major',
    lat: 21.0365,
    lon: -86.8771,
    produce: { general: 1.2, perishables: 0.9, supplies: 1.0 },
    consume: { supplies: 1.3, electronics: 1.1, machinery: 0.9 },
  },
  {
    icao: 'MMSD',
    name: 'Los Cabos International',
    region: 'MX-Y',
    hubTier: 'regional',
    lat: 23.1518,
    lon: -109.7211,
    produce: { general: 1.0, supplies: 0.95, perishables: 0.9 },
    consume: { supplies: 1.2, electronics: 1.0, perishables: 1.1 },
  },
  {
    icao: 'MMCZ',
    name: 'Cozumel International',
    region: 'MX-Y',
    hubTier: 'spoke',
    ...resortSpoke,
    lat: 20.5224,
    lon: -86.9256,
  },
  {
    icao: 'MMMD',
    name: 'Mérida/Manuel Crescencio Rejón',
    region: 'MX-Y',
    hubTier: 'spoke',
    lat: 20.937,
    lon: -89.6577,
    produce: { general: 1.15, machinery: 0.95, supplies: 1.0 },
    consume: { electronics: 0.9, perishables: 1.0 },
  },
  {
    icao: 'MMCP',
    name: 'Campeche International',
    region: 'MX-Y',
    hubTier: 'spoke',
    lat: 19.8169,
    lon: -90.5006,
    ...petroSpoke,
    produce: { machinery: 1.15, general: 1.0, supplies: 1.0 },
  },
  {
    icao: 'MMCE',
    name: 'Ciudad del Carmen International',
    region: 'MX-Y',
    hubTier: 'spoke',
    lat: 18.6536,
    lon: -91.7992,
    ...petroSpoke,
  },
  {
    icao: 'MMCM',
    name: 'Chetumal International',
    region: 'MX-Y',
    hubTier: 'spoke',
    ...agroSpoke,
    lat: 18.5045,
    lon: -88.3266,
  },
  {
    icao: 'MMLP',
    name: 'La Paz/Manuel Márquez de León',
    region: 'MX-Y',
    hubTier: 'spoke',
    ...resortSpoke,
    lat: 24.0728,
    lon: -110.3617,
  },

  // ── MX bush soft-fields — OA soft+ICAO is scarce; MMCG gravel + MM68 GRE gps ──
  {
    icao: 'MMCG',
    name: 'Nuevo Casas Grandes Municipal',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 30.3974,
    lon: -107.875,
    bush: true,
    ...bushSpoke,
  },
  {
    icao: 'MM68',
    name: 'Mina Hércules',
    region: 'MX-N',
    hubTier: 'spoke',
    lat: 28.0366,
    lon: -103.771,
    bush: true,
    ...bushSpoke,
  },
];

export const MX_CAREER_HUB_COUNT = 47;

/** Auto feeder corridors so every non-bush MX hub has ≥2 partners. */
export function buildMxFeederCorridors(
  hubs: readonly MxCareerHubDef[] = MX_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertMxCareerHubCatalog(): void {
  if (MX_CAREER_HUBS.length !== MX_CAREER_HUB_COUNT) {
    throw new Error(
      `MX_CAREER_HUBS length ${MX_CAREER_HUBS.length} !== ${MX_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of MX_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate MX hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<MxCareerRegion, number> = {
    'MX-N': 16,
    'MX-C': 14,
    'MX-S': 9,
    'MX-Y': 8,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `MX region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
