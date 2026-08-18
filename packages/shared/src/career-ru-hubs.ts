/**
 * Russia career hub catalog — RU-1 core + RU-2 Arctic / Siberia / Pacific gaps.
 *
 * RU-3 densifies Volga / south / Siberia / Far East (stock MSFS only; URRR stays skipped).
 * Moscow cargo majors: UUEE and UUDD (UUWW Vnukovo is regional).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type RuCareerRegion =
  | 'RU-M'
  | 'RU-NW'
  | 'RU-N'
  | 'RU-V'
  | 'RU-S'
  | 'RU-SI'
  | 'RU-E'
  | 'RU-NE'
  | 'RU-FE';

export type RuCareerHubDef = {
  icao: string;
  name: string;
  region: RuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 40 curated Russia hubs from European Russia through Kamchatka / Sakhalin. */
export const RU_CAREER_HUBS: readonly RuCareerHubDef[] = [
  {
    icao: 'UUEE',
    name: 'Sheremetyevo',
    region: 'RU-M',
    hubTier: 'major',
    lat: 55.9726,
    lon: 37.4147,
    produce: { electronics: 1.45, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.05 },
  },
  {
    icao: 'UUDD',
    name: 'Domodedovo',
    region: 'RU-M',
    hubTier: 'regional',
    lat: 55.4088,
    lon: 37.9063,
    produce: { general: 1.35, electronics: 1.25, supplies: 1.1 },
    consume: { perishables: 1.15, machinery: 1.0 },
  },
  {
    icao: 'ULLI',
    name: 'Pulkovo',
    region: 'RU-NW',
    hubTier: 'major',
    lat: 59.8003,
    lon: 30.2625,
    produce: { machinery: 1.3, general: 1.35, electronics: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1 },
  },
  {
    icao: 'ULMM',
    name: 'Murmansk',
    region: 'RU-N',
    hubTier: 'regional',
    lat: 68.7817,
    lon: 32.7508,
    produce: { machinery: 1.2, general: 1.2, supplies: 1.15 },
    consume: { electronics: 0.95, perishables: 1.1, fuel: 1.1 },
  },
  {
    icao: 'UMKK',
    name: 'Kaliningrad Khrabrovo',
    region: 'RU-N',
    hubTier: 'regional',
    lat: 54.89,
    lon: 20.5926,
    produce: { general: 1.25, electronics: 1.15, perishables: 1.1 },
    consume: { machinery: 0.95, supplies: 1.05 },
  },
  {
    icao: 'UWGG',
    name: 'Nizhny Novgorod Strigino',
    region: 'RU-V',
    hubTier: 'spoke',
    lat: 56.2301,
    lon: 43.784,
    produce: { machinery: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'UWWW',
    name: 'Kurumoch Samara',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 53.5049,
    lon: 50.1643,
    produce: { general: 1.3, machinery: 1.2, fuel: 1.1 },
    consume: { electronics: 1.0, perishables: 1.1 },
  },
  {
    icao: 'USSS',
    name: 'Koltsovo Yekaterinburg',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 56.7431,
    lon: 60.8027,
    produce: { machinery: 1.35, general: 1.3, electronics: 1.15 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'URRP',
    name: 'Platov Rostov-on-Don',
    region: 'RU-S',
    hubTier: 'regional',
    lat: 47.4938,
    lon: 39.9353,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'URSS',
    name: 'Sochi Adler',
    region: 'RU-S',
    hubTier: 'regional',
    lat: 43.4499,
    lon: 39.9566,
    produce: { perishables: 1.2, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'UNNT',
    name: 'Tolmachevo Novosibirsk',
    region: 'RU-SI',
    hubTier: 'major',
    lat: 55.0126,
    lon: 82.6507,
    produce: { general: 1.4, machinery: 1.25, electronics: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.05 },
  },
  {
    icao: 'UNKL',
    name: 'Krasnoyarsk Yemelyanovo',
    region: 'RU-E',
    hubTier: 'major',
    lat: 56.1729,
    lon: 92.4933,
    produce: { machinery: 1.3, general: 1.35, electronics: 1.15 },
    consume: { perishables: 1.1, supplies: 1.1, fuel: 1.05 },
  },
  {
    icao: 'UIII',
    name: 'Irkutsk',
    region: 'RU-E',
    hubTier: 'regional',
    lat: 52.268,
    lon: 104.388,
    produce: { general: 1.25, machinery: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'UEEE',
    name: 'Yakutsk',
    region: 'RU-NE',
    hubTier: 'regional',
    lat: 62.0933,
    lon: 129.7707,
    produce: { machinery: 1.2, general: 1.2, supplies: 1.15 },
    consume: { electronics: 0.9, perishables: 1.1, fuel: 1.1 },
  },
  {
    icao: 'UHMM',
    name: 'Magadan Sokol',
    region: 'RU-NE',
    hubTier: 'spoke',
    lat: 59.91,
    lon: 150.72,
    produce: { general: 1.15, supplies: 1.1, machinery: 1.05 },
    consume: { electronics: 0.9, perishables: 1.05 },
  },
  {
    icao: 'UHPP',
    name: 'Petropavlovsk-Kamchatsky',
    region: 'RU-NE',
    hubTier: 'spoke',
    lat: 53.1679,
    lon: 158.4536,
    produce: { general: 1.15, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'UHHH',
    name: 'Khabarovsk Novy',
    region: 'RU-FE',
    hubTier: 'regional',
    lat: 48.528,
    lon: 135.1884,
    produce: { general: 1.25, machinery: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.1 },
  },
  {
    icao: 'UHWW',
    name: 'Vladivostok Knevichi',
    region: 'RU-FE',
    hubTier: 'major',
    lat: 43.399,
    lon: 132.148,
    produce: { general: 1.35, electronics: 1.2, perishables: 1.15 },
    consume: { machinery: 1.0, supplies: 1.1, fuel: 1.1 },
  },
  {
    icao: 'UUWW',
    name: 'Vnukovo',
    region: 'RU-M',
    hubTier: 'regional',
    lat: 55.5915,
    lon: 37.2615,
    produce: { general: 1.25, electronics: 1.15, supplies: 1.05 },
    consume: { perishables: 1.1, machinery: 0.95 },
  },
  {
    icao: 'ULAA',
    name: 'Arkhangelsk Talagi',
    region: 'RU-NW',
    hubTier: 'regional',
    lat: 64.6003,
    lon: 40.7167,
    produce: { machinery: 1.2, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.9, perishables: 1.05, fuel: 1.1 },
  },
  {
    icao: 'UWKD',
    name: 'Kazan',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 55.6062,
    lon: 49.2787,
    produce: { electronics: 1.3, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.1, supplies: 1.05 },
  },
  {
    icao: 'UWKE',
    name: 'Begishevo',
    region: 'RU-V',
    hubTier: 'spoke',
    lat: 55.5647,
    lon: 52.0925,
    produce: { machinery: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, perishables: 1.0 },
  },
  {
    icao: 'UWUU',
    name: 'Ufa',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 54.5575,
    lon: 55.8744,
    produce: { machinery: 1.25, general: 1.25, fuel: 1.1 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'USPP',
    name: 'Perm Bolshoye Savino',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 57.9146,
    lon: 56.0212,
    produce: { machinery: 1.25, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'USCC',
    name: 'Chelyabinsk Balandino',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 55.3058,
    lon: 61.5033,
    produce: { machinery: 1.3, general: 1.25, electronics: 1.1 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  {
    icao: 'USTR',
    name: 'Tyumen Roshchino',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 57.1896,
    lon: 65.3243,
    produce: { general: 1.25, machinery: 1.15, fuel: 1.15 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'USRR',
    name: 'Surgut',
    region: 'RU-V',
    hubTier: 'regional',
    lat: 61.3437,
    lon: 73.4018,
    produce: { machinery: 1.25, general: 1.2, fuel: 1.2 },
    consume: { electronics: 0.9, perishables: 1.1, supplies: 1.1 },
  },
  {
    icao: 'USNN',
    name: 'Nizhnevartovsk',
    region: 'RU-V',
    hubTier: 'spoke',
    lat: 60.9493,
    lon: 76.4836,
    produce: { machinery: 1.15, general: 1.15, fuel: 1.1 },
    consume: { electronics: 0.9, perishables: 1.05 },
  },
  {
    icao: 'URKK',
    name: 'Krasnodar Pashkovsky',
    region: 'RU-S',
    hubTier: 'regional',
    lat: 45.0347,
    lon: 39.1705,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'URWW',
    name: 'Volgograd Gumrak',
    region: 'RU-S',
    hubTier: 'regional',
    lat: 48.7825,
    lon: 44.3455,
    produce: { general: 1.25, machinery: 1.15, perishables: 1.15 },
    consume: { electronics: 0.95, supplies: 1.0 },
  },
  {
    icao: 'URMM',
    name: 'Mineralnye Vody',
    region: 'RU-S',
    hubTier: 'spoke',
    lat: 44.2251,
    lon: 43.0819,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'URWA',
    name: 'Astrakhan Narimanovo',
    region: 'RU-S',
    hubTier: 'spoke',
    lat: 46.2833,
    lon: 48.0063,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'UNOO',
    name: 'Omsk Tsentralny',
    region: 'RU-SI',
    hubTier: 'regional',
    lat: 54.967,
    lon: 73.3105,
    produce: { machinery: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'UNBB',
    name: 'Barnaul',
    region: 'RU-SI',
    hubTier: 'spoke',
    lat: 53.3638,
    lon: 83.5385,
    produce: { general: 1.2, perishables: 1.15, machinery: 1.1 },
    consume: { electronics: 0.9, supplies: 1.0 },
  },
  {
    icao: 'UNTT',
    name: 'Tomsk Bogashevo',
    region: 'RU-SI',
    hubTier: 'spoke',
    lat: 56.3803,
    lon: 85.2083,
    produce: { general: 1.2, electronics: 1.1, supplies: 1.05 },
    consume: { perishables: 1.05, machinery: 0.95 },
  },
  {
    icao: 'UIBB',
    name: 'Bratsk',
    region: 'RU-E',
    hubTier: 'spoke',
    lat: 56.3706,
    lon: 101.6981,
    produce: { machinery: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, perishables: 1.0 },
  },
  {
    icao: 'UIUU',
    name: 'Ulan-Ude Mukhino',
    region: 'RU-E',
    hubTier: 'regional',
    lat: 51.8078,
    lon: 107.4375,
    produce: { general: 1.2, machinery: 1.15, supplies: 1.05 },
    consume: { electronics: 0.9, perishables: 1.05 },
  },
  {
    icao: 'UOOO',
    name: 'Norilsk Alykel',
    region: 'RU-E',
    hubTier: 'regional',
    lat: 69.3111,
    lon: 87.3322,
    produce: { machinery: 1.25, general: 1.2, supplies: 1.15 },
    consume: { electronics: 0.9, perishables: 1.1, fuel: 1.15 },
  },
  {
    icao: 'UHBB',
    name: 'Blagoveshchensk Ignatyevo',
    region: 'RU-FE',
    hubTier: 'spoke',
    lat: 50.4254,
    lon: 127.4125,
    produce: { general: 1.15, machinery: 1.1, supplies: 1.05 },
    consume: { electronics: 0.9, perishables: 1.05 },
  },
  {
    icao: 'UHSS',
    name: 'Yuzhno-Sakhalinsk',
    region: 'RU-FE',
    hubTier: 'regional',
    lat: 46.8887,
    lon: 142.7175,
    produce: { general: 1.2, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.9, fuel: 1.1 },
  },
];

export const RU_CAREER_HUB_COUNT = 40;

export function buildRuFeederCorridors(
  hubs: readonly RuCareerHubDef[] = RU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertRuCareerHubCatalog(): void {
  if (RU_CAREER_HUBS.length !== RU_CAREER_HUB_COUNT) {
    throw new Error(
      `RU_CAREER_HUBS length ${RU_CAREER_HUBS.length} !== ${RU_CAREER_HUB_COUNT}`,
    );
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UUEE' && h.hubTier === 'major')) {
    throw new Error('RU catalog must include major UUEE (Sheremetyevo)');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'ULLI' && h.hubTier === 'major')) {
    throw new Error('RU catalog must include major ULLI (Pulkovo)');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UNNT' && h.hubTier === 'major')) {
    throw new Error('RU catalog must include major UNNT (Novosibirsk)');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UNKL' && h.hubTier === 'major')) {
    throw new Error('RU catalog must include major UNKL (Krasnoyarsk)');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UHWW' && h.hubTier === 'major')) {
    throw new Error('RU catalog must include major UHWW (Vladivostok)');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UMKK')) {
    throw new Error('RU catalog must include UMKK (Kaliningrad exclave)');
  }
  if (RU_CAREER_HUBS.some((h) => h.icao === 'URRR')) {
    throw new Error('RU catalog must not seed closed URRR (use URRP Platov)');
  }
  if (RU_CAREER_HUBS.some((h) => h.icao === 'UUWW' && h.hubTier === 'major')) {
    throw new Error('RU catalog must not treat UUWW Vnukovo as a cargo major');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UWKD')) {
    throw new Error('RU catalog must include UWKD Kazan');
  }
  if (!RU_CAREER_HUBS.some((h) => h.icao === 'UHSS')) {
    throw new Error('RU catalog must include UHSS Yuzhno-Sakhalinsk');
  }
}
