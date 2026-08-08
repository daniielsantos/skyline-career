/**
 * Continental US career hub catalog (network + bush + bush-trip-only locals).
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import { US_BUSH_TRIP_ONLY_HUBS } from './career-us-bush-trip-hubs.js';

export type UsCareerRegion =
  | 'US-W'
  | 'US-MT'
  | 'US-MW'
  | 'US-SC'
  | 'US-SE'
  | 'US-NE';

export type UsCareerHubDef = {
  icao: string;
  name: string;
  region: UsCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  /** Soft-field bush strip — no ferry; light_ga OD only vs same-country gateways. */
  bush?: true;
  /**
   * FAA local / non-network strip used only as a bush-trip endpoint.
   * On map + trip legs; never Market freights, ferry, or starter home hub.
   */
  bushTripOnly?: true;
  /** Coords/name confirmed against MSFS (panel or parked sample), not OurAirports. */
  msfsValidated?: true;
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

export type CareerCorridorEdge = {
  a: string;
  b: string;
  weight: number;
};

/** Minimal hub shape for auto feeder corridor generation (BR or US). */
export type CareerFeederHub = {
  icao: string;
  region: string;
  hubTier: HubTier;
  lat: number;
  lon: number;
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

/**
 * 100 continental US hubs. Majors preserved; new entries fill Network map holes
 * with Dry-biased spokes/regionals for starter-friendly short-haul demand.
 */
export const US_CAREER_HUBS: readonly UsCareerHubDef[] = [
  // ── US-W (18) ────────────────────────────────────────────────────────────
  {
    icao: 'KLAX',
    name: 'Los Angeles International',
    region: 'US-W',
    hubTier: 'major',
    lat: 33.9416,
    lon: -118.4085,
    produce: { electronics: 1.6, general: 1.3, perishables: 1.1 },
    consume: { machinery: 1.0, general: 1.0 },
  },
  {
    icao: 'KSEA',
    name: 'Seattle/Tacoma',
    region: 'US-W',
    hubTier: 'major',
    lat: 47.4502,
    lon: -122.3088,
    produce: { electronics: 1.5, machinery: 1.2, general: 1.0 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'KSFO',
    name: 'San Francisco',
    region: 'US-W',
    hubTier: 'regional',
    lat: 37.6213,
    lon: -122.379,
    produce: { electronics: 1.4, general: 1.1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'KPDX',
    name: 'Portland International',
    region: 'US-W',
    hubTier: 'regional',
    lat: 45.5898,
    lon: -122.5951,
    ...dryRegional,
    produce: { general: 1.35, supplies: 1.2, perishables: 1.15, electronics: 0.9 },
    consume: { electronics: 1.0, machinery: 0.95, general: 1.0 },
  },
  {
    icao: 'KSMF',
    name: 'Sacramento International',
    region: 'US-W',
    hubTier: 'regional',
    lat: 38.6954,
    lon: -121.5908,
    ...dryRegional,
  },
  {
    icao: 'KSAN',
    name: 'San Diego',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 32.7336,
    lon: -117.1897,
    produce: { electronics: 1.1, general: 0.9 },
    consume: { perishables: 1.0, machinery: 0.8 },
  },
  {
    icao: 'KOAK',
    name: 'Oakland International',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 37.7213,
    lon: -122.2208,
    ...drySpoke,
  },
  {
    icao: 'KSJC',
    name: 'San Jose/Mineta',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 37.3626,
    lon: -121.929,
    produce: { electronics: 1.3, general: 1.0, supplies: 0.9 },
    consume: { perishables: 1.0, machinery: 0.85 },
  },
  {
    icao: 'KBUR',
    name: 'Burbank',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 34.2007,
    lon: -118.3587,
    ...drySpoke,
  },
  {
    icao: 'KONT',
    name: 'Ontario International',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 34.056,
    lon: -117.6012,
    produce: { general: 1.25, supplies: 1.2, electronics: 0.9 },
    consume: { perishables: 0.95, machinery: 0.9 },
  },
  {
    icao: 'KLGB',
    name: 'Long Beach',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 33.8177,
    lon: -118.1516,
    ...drySpoke,
  },
  {
    icao: 'KSNA',
    name: 'Orange County/John Wayne',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 33.6757,
    lon: -117.8682,
    ...drySpoke,
  },
  {
    icao: 'KGEG',
    name: 'Spokane International',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 47.6199,
    lon: -117.5338,
    ...drySpoke,
    produce: { general: 1.15, supplies: 1.05, perishables: 1.0 },
  },
  {
    icao: 'KBLI',
    name: 'Bellingham',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 48.7927,
    lon: -122.5375,
    ...drySpoke,
  },
  {
    icao: 'KEUG',
    name: 'Eugene',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 44.1246,
    lon: -123.2117,
    ...drySpoke,
  },
  {
    icao: 'KMFR',
    name: 'Medford',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 42.3742,
    lon: -122.8735,
    ...drySpoke,
  },
  {
    icao: 'KFAT',
    name: 'Fresno Yosemite',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 36.7762,
    lon: -119.7181,
    produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, machinery: 0.85 },
  },
  {
    icao: 'KRNO',
    name: 'Reno/Tahoe',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 39.4993,
    lon: -119.7681,
    ...drySpoke,
  },

  // ── US-MT (16) ───────────────────────────────────────────────────────────
  {
    icao: 'KDEN',
    name: 'Denver International',
    region: 'US-MT',
    hubTier: 'major',
    lat: 39.8561,
    lon: -104.6737,
    produce: { general: 1.3, machinery: 1.1, electronics: 1.0 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'KPHX',
    name: 'Phoenix Sky Harbor',
    region: 'US-MT',
    hubTier: 'regional',
    lat: 33.4342,
    lon: -112.0116,
    produce: { electronics: 1.1, general: 1.2 },
    consume: { perishables: 1.0, machinery: 0.9 },
  },
  {
    icao: 'KLAS',
    name: 'Las Vegas/Harry Reid',
    region: 'US-MT',
    hubTier: 'regional',
    lat: 36.084,
    lon: -115.1537,
    ...dryRegional,
    produce: { general: 1.4, supplies: 1.2, perishables: 1.1 },
  },
  {
    icao: 'KABQ',
    name: 'Albuquerque',
    region: 'US-MT',
    hubTier: 'regional',
    lat: 35.0402,
    lon: -106.6092,
    ...dryRegional,
  },
  {
    icao: 'KBOI',
    name: 'Boise',
    region: 'US-MT',
    hubTier: 'regional',
    lat: 43.5644,
    lon: -116.2228,
    ...dryRegional,
  },
  {
    icao: 'KSLC',
    name: 'Salt Lake City',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 40.7899,
    lon: -111.9791,
    produce: { general: 1.1, perishables: 0.9 },
    consume: { electronics: 0.9, machinery: 0.8 },
  },
  {
    icao: 'KTUS',
    name: 'Tucson',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 32.1161,
    lon: -110.941,
    ...drySpoke,
  },
  {
    icao: 'KELP',
    name: 'El Paso',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 31.8072,
    lon: -106.3776,
    ...drySpoke,
  },
  {
    icao: 'KCOS',
    name: 'Colorado Springs',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 38.8058,
    lon: -104.7008,
    ...drySpoke,
  },
  {
    icao: 'KBIL',
    name: 'Billings Logan',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 45.8077,
    lon: -108.5429,
    ...drySpoke,
  },
  {
    icao: 'KMSO',
    name: 'Missoula',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 46.9163,
    lon: -114.0906,
    ...drySpoke,
  },
  {
    icao: 'KHLN',
    name: 'Helena',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 46.6068,
    lon: -111.9827,
    ...drySpoke,
  },
  {
    icao: 'KJAC',
    name: 'Jackson Hole',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 43.6073,
    lon: -110.7377,
    ...drySpoke,
  },
  {
    icao: 'KCPR',
    name: 'Casper/Natrona',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 42.908,
    lon: -106.4644,
    ...drySpoke,
  },
  {
    icao: 'KGJT',
    name: 'Grand Junction',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 39.1224,
    lon: -108.5267,
    ...drySpoke,
  },
  {
    icao: 'KIDA',
    name: 'Idaho Falls',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 43.5146,
    lon: -112.0708,
    ...drySpoke,
  },

  // ── US-MW (20) ───────────────────────────────────────────────────────────
  {
    icao: 'KORD',
    name: "Chicago/O'Hare",
    region: 'US-MW',
    hubTier: 'major',
    lat: 41.9742,
    lon: -87.9073,
    produce: { machinery: 1.5, general: 1.3, electronics: 1.1 },
    consume: { perishables: 1.1, general: 1.0 },
  },
  {
    icao: 'KDTW',
    name: 'Detroit Metro',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 42.2162,
    lon: -83.3554,
    produce: { machinery: 1.4, general: 1.0 },
    consume: { electronics: 1.0, perishables: 0.9 },
  },
  {
    icao: 'KMSP',
    name: 'Minneapolis/St Paul',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 44.8848,
    lon: -93.2223,
    produce: { perishables: 1.3, general: 1.1 },
    consume: { electronics: 0.9, machinery: 1.0 },
  },
  {
    icao: 'KSTL',
    name: 'St. Louis Lambert',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 38.7487,
    lon: -90.37,
    ...dryRegional,
  },
  {
    icao: 'KMCI',
    name: 'Kansas City International',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 39.2976,
    lon: -94.7139,
    ...dryRegional,
  },
  {
    icao: 'KOMA',
    name: 'Omaha/Eppley',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 41.3032,
    lon: -95.8941,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.95 },
  },
  {
    icao: 'KIND',
    name: 'Indianapolis',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 39.7173,
    lon: -86.2944,
    produce: { general: 1.4, supplies: 1.25, electronics: 1.0 },
    consume: { perishables: 0.95, machinery: 0.95 },
  },
  {
    icao: 'KMKE',
    name: 'Milwaukee/General Mitchell',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 42.9472,
    lon: -87.8966,
    ...dryRegional,
  },
  {
    icao: 'KCLE',
    name: 'Cleveland Hopkins',
    region: 'US-MW',
    hubTier: 'regional',
    lat: 41.4117,
    lon: -81.8498,
    ...dryRegional,
  },
  {
    icao: 'KCVG',
    name: 'Cincinnati/Northern Kentucky',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 39.0488,
    lon: -84.6678,
    produce: { general: 1.2, machinery: 0.9 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'KMSN',
    name: 'Madison',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 43.1399,
    lon: -89.3375,
    ...drySpoke,
  },
  {
    icao: 'KDSM',
    name: 'Des Moines',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 41.534,
    lon: -93.6631,
    produce: { perishables: 1.3, general: 1.15, supplies: 1.0 },
    consume: { electronics: 0.85, machinery: 0.85 },
  },
  {
    icao: 'KCID',
    name: 'Cedar Rapids',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 41.8847,
    lon: -91.7108,
    ...drySpoke,
  },
  {
    icao: 'KGRR',
    name: 'Grand Rapids',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 42.8808,
    lon: -85.5228,
    ...drySpoke,
  },
  {
    icao: 'KDAY',
    name: 'Dayton',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 39.9024,
    lon: -84.2194,
    ...drySpoke,
  },
  {
    icao: 'KFSD',
    name: 'Sioux Falls',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 43.582,
    lon: -96.7419,
    produce: { perishables: 1.25, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, machinery: 0.85 },
  },
  {
    icao: 'KFAR',
    name: 'Fargo/Hector',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 46.9207,
    lon: -96.8158,
    ...drySpoke,
  },
  {
    icao: 'KBIS',
    name: 'Bismarck',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 46.7727,
    lon: -100.746,
    ...drySpoke,
  },
  {
    icao: 'KSPI',
    name: 'Springfield IL',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 39.8441,
    lon: -89.6779,
    ...drySpoke,
  },
  {
    icao: 'KSBN',
    name: 'South Bend',
    region: 'US-MW',
    hubTier: 'spoke',
    lat: 41.7083,
    lon: -86.3173,
    ...drySpoke,
  },

  // ── US-SC (16) ───────────────────────────────────────────────────────────
  {
    icao: 'KIAH',
    name: 'Houston/Intercontinental',
    region: 'US-SC',
    hubTier: 'major',
    lat: 29.9844,
    lon: -95.3414,
    produce: { machinery: 1.5, general: 1.1 },
    consume: { electronics: 1.0, perishables: 0.9 },
  },
  {
    icao: 'KDFW',
    name: 'Dallas/Fort Worth',
    region: 'US-SC',
    hubTier: 'major',
    lat: 32.8998,
    lon: -97.0403,
    produce: { electronics: 1.3, general: 1.4, machinery: 1.1 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'KMEM',
    name: 'Memphis',
    region: 'US-SC',
    hubTier: 'regional',
    lat: 35.0424,
    lon: -89.9767,
    produce: { general: 1.6, electronics: 1.1 },
    consume: { machinery: 0.9, perishables: 0.9 },
  },
  {
    icao: 'KSAT',
    name: 'San Antonio',
    region: 'US-SC',
    hubTier: 'regional',
    lat: 29.5337,
    lon: -98.4698,
    ...dryRegional,
  },
  {
    icao: 'KOKC',
    name: 'Oklahoma City',
    region: 'US-SC',
    hubTier: 'regional',
    lat: 35.3931,
    lon: -97.6007,
    ...dryRegional,
  },
  {
    icao: 'KMSY',
    name: 'New Orleans',
    region: 'US-SC',
    hubTier: 'regional',
    lat: 29.9934,
    lon: -90.258,
    produce: { perishables: 1.2, general: 1.25, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'KAUS',
    name: 'Austin-Bergstrom',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 30.1945,
    lon: -97.6699,
    produce: { electronics: 1.2, general: 0.9 },
    consume: { perishables: 0.9, machinery: 0.8 },
  },
  {
    icao: 'KLIT',
    name: 'Little Rock',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 34.7294,
    lon: -92.2243,
    ...drySpoke,
  },
  {
    icao: 'KTUL',
    name: 'Tulsa',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 36.1984,
    lon: -95.8881,
    ...drySpoke,
  },
  {
    icao: 'KSHV',
    name: 'Shreveport',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 32.4466,
    lon: -93.8256,
    ...drySpoke,
  },
  {
    icao: 'KBTR',
    name: 'Baton Rouge',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 30.5332,
    lon: -91.1496,
    ...drySpoke,
  },
  {
    icao: 'KCRP',
    name: 'Corpus Christi',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 27.7704,
    lon: -97.5012,
    ...drySpoke,
  },
  {
    icao: 'KHRL',
    name: 'Harlingen/Valley International',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 26.2285,
    lon: -97.6544,
    produce: { perishables: 1.3, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, machinery: 0.8 },
  },
  {
    icao: 'KAMA',
    name: 'Amarillo',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 35.2194,
    lon: -101.706,
    ...drySpoke,
  },
  {
    icao: 'KABI',
    name: 'Abilene',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 32.4113,
    lon: -99.6819,
    ...drySpoke,
  },
  {
    icao: 'KFSM',
    name: 'Fort Smith',
    region: 'US-SC',
    hubTier: 'spoke',
    lat: 35.3366,
    lon: -94.3674,
    ...drySpoke,
  },

  // ── US-SE (16) ───────────────────────────────────────────────────────────
  {
    icao: 'KMIA',
    name: 'Miami International',
    region: 'US-SE',
    hubTier: 'major',
    lat: 25.7959,
    lon: -80.287,
    produce: { electronics: 1.5, perishables: 1.3, general: 1.0 },
    consume: { machinery: 1.1, general: 1.0 },
  },
  {
    icao: 'KATL',
    name: 'Atlanta/Hartsfield',
    region: 'US-SE',
    hubTier: 'major',
    lat: 33.6407,
    lon: -84.4277,
    produce: { general: 1.5, electronics: 1.2, machinery: 1.0 },
    consume: { perishables: 1.1, general: 1.0 },
  },
  {
    icao: 'KCLT',
    name: 'Charlotte/Douglas',
    region: 'US-SE',
    hubTier: 'regional',
    lat: 35.214,
    lon: -80.9431,
    produce: { general: 1.2, machinery: 0.9 },
    consume: { electronics: 1.0, perishables: 0.9 },
  },
  {
    icao: 'KRDU',
    name: 'Raleigh-Durham',
    region: 'US-SE',
    hubTier: 'regional',
    lat: 35.8776,
    lon: -78.7875,
    produce: { electronics: 1.25, general: 1.2, supplies: 1.05 },
    consume: { perishables: 1.0, machinery: 0.9 },
  },
  {
    icao: 'KBNA',
    name: 'Nashville',
    region: 'US-SE',
    hubTier: 'regional',
    lat: 36.1245,
    lon: -86.6782,
    ...dryRegional,
  },
  {
    icao: 'KTPA',
    name: 'Tampa International',
    region: 'US-SE',
    hubTier: 'regional',
    lat: 27.9755,
    lon: -82.5332,
    produce: { perishables: 1.15, general: 1.2, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'KJAX',
    name: 'Jacksonville',
    region: 'US-SE',
    hubTier: 'regional',
    lat: 30.4941,
    lon: -81.6879,
    ...dryRegional,
  },
  {
    icao: 'KMCO',
    name: 'Orlando International',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 28.4294,
    lon: -81.309,
    produce: { perishables: 1.2, general: 0.9 },
    consume: { electronics: 1.0, machinery: 0.8 },
  },
  {
    icao: 'KFLL',
    name: 'Fort Lauderdale',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 26.0726,
    lon: -80.1527,
    produce: { perishables: 1.1, general: 0.9 },
    consume: { electronics: 1.0, machinery: 0.8 },
  },
  {
    icao: 'KCHS',
    name: 'Charleston SC',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 32.8986,
    lon: -80.0405,
    ...drySpoke,
  },
  {
    icao: 'KSAV',
    name: 'Savannah/Hilton Head',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 32.1276,
    lon: -81.2021,
    ...drySpoke,
  },
  {
    icao: 'KBHM',
    name: 'Birmingham',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 33.5629,
    lon: -86.7535,
    ...drySpoke,
  },
  {
    icao: 'KHSV',
    name: 'Huntsville',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 34.6372,
    lon: -86.7751,
    produce: { electronics: 1.2, general: 1.05, supplies: 1.0 },
    consume: { perishables: 0.9, machinery: 0.9 },
  },
  {
    icao: 'KTYS',
    name: 'Knoxville',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 35.811,
    lon: -83.994,
    ...drySpoke,
  },
  {
    icao: 'KGSP',
    name: 'Greenville-Spartanburg',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 34.8957,
    lon: -82.2189,
    ...drySpoke,
  },
  {
    icao: 'KRSW',
    name: 'Fort Myers/Southwest Florida',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 26.5362,
    lon: -81.7552,
    produce: { perishables: 1.2, general: 1.0, supplies: 0.95 },
    consume: { electronics: 0.9, machinery: 0.8 },
  },

  // ── US-NE (14) ───────────────────────────────────────────────────────────
  {
    icao: 'KJFK',
    name: 'New York/JFK',
    region: 'US-NE',
    hubTier: 'major',
    lat: 40.6398,
    lon: -73.7789,
    produce: { electronics: 1.4, general: 1.2 },
    consume: { perishables: 1.2, machinery: 1.0 },
  },
  {
    icao: 'KBOS',
    name: 'Boston/Logan',
    region: 'US-NE',
    hubTier: 'regional',
    lat: 42.3656,
    lon: -71.0096,
    produce: { electronics: 1.3, general: 1.0 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'KEWR',
    name: 'Newark Liberty',
    region: 'US-NE',
    hubTier: 'regional',
    lat: 40.6895,
    lon: -74.1745,
    produce: { general: 1.3, machinery: 1.1 },
    consume: { electronics: 1.0, perishables: 1.0 },
  },
  {
    icao: 'KBWI',
    name: 'Baltimore/Washington',
    region: 'US-NE',
    hubTier: 'regional',
    lat: 39.1754,
    lon: -76.6683,
    ...dryRegional,
  },
  {
    icao: 'KIAD',
    name: 'Washington Dulles',
    region: 'US-NE',
    hubTier: 'regional',
    lat: 38.9531,
    lon: -77.4565,
    produce: { electronics: 1.2, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.05, machinery: 0.95 },
  },
  {
    icao: 'KPHL',
    name: 'Philadelphia',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 39.8719,
    lon: -75.2411,
    produce: { general: 1.1, perishables: 0.9 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'KRIC',
    name: 'Richmond',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 37.5052,
    lon: -77.3197,
    ...drySpoke,
  },
  {
    icao: 'KORF',
    name: 'Norfolk',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 36.8946,
    lon: -76.2012,
    ...drySpoke,
  },
  {
    icao: 'KDCA',
    name: 'Ronald Reagan Washington National',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 38.8512,
    lon: -77.0402,
    ...drySpoke,
  },
  {
    icao: 'KBUF',
    name: 'Buffalo Niagara',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 42.9405,
    lon: -78.7322,
    ...drySpoke,
  },
  {
    icao: 'KALB',
    name: 'Albany',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 42.7483,
    lon: -73.8017,
    ...drySpoke,
  },
  {
    icao: 'KBDL',
    name: 'Bradley/Hartford',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 41.9389,
    lon: -72.6832,
    ...drySpoke,
  },
  {
    icao: 'KPVD',
    name: 'Providence/T.F. Green',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 41.724,
    lon: -71.4282,
    ...drySpoke,
  },
  {
    icao: 'KPWM',
    name: 'Portland ME',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 43.6462,
    lon: -70.3093,
    ...drySpoke,
  },

  // ── US bush-trip tour spokes (20) — K**** from Activities PLNs; normal spokes ──
  {
    icao: 'KRMG',
    name: 'Richard B Russell / Rome',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 34.3506,
    lon: -85.158,
    ...drySpoke,
  },
  {
    icao: 'KDZJ',
    name: 'Blairsville',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 34.8551,
    lon: -83.9969,
    ...drySpoke,
  },
  {
    icao: 'KAVL',
    name: 'Asheville',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 35.4355,
    lon: -82.5419,
    ...drySpoke,
  },
  {
    icao: 'KVJI',
    name: 'Virginia Highlands / Abingdon',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 36.6871,
    lon: -82.0333,
    ...drySpoke,
  },
  {
    icao: 'KLNP',
    name: 'Lonesome Pine / Wise',
    region: 'US-SE',
    hubTier: 'spoke',
    lat: 36.9875,
    lon: -82.53,
    ...drySpoke,
  },
  {
    icao: 'KCBE',
    name: 'Greater Cumberland',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 39.6154,
    lon: -78.7609,
    ...drySpoke,
  },
  {
    icao: 'KFDK',
    name: 'Frederick',
    region: 'US-NE',
    hubTier: 'spoke',
    lat: 39.4176,
    lon: -77.3743,
    ...drySpoke,
  },
  {
    icao: 'KAVX',
    name: 'Catalina / Avalon',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 33.4049,
    lon: -118.416,
    ...drySpoke,
  },
  {
    icao: 'KPMD',
    name: 'Palmdale / USAF Plant 42',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 34.6294,
    lon: -118.085,
    ...drySpoke,
  },
  {
    icao: 'KDAG',
    name: 'Barstow Daggett',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 34.8537,
    lon: -116.787,
    ...drySpoke,
  },
  {
    icao: 'KBIH',
    name: 'Eastern Sierra / Bishop',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 37.3731,
    lon: -118.364,
    ...drySpoke,
  },
  {
    icao: 'KMMH',
    name: 'Mammoth Yosemite',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 37.6254,
    lon: -118.8431,
    ...drySpoke,
  },
  {
    icao: 'KCCR',
    name: 'Buchanan Field / Concord',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 37.9897,
    lon: -122.057,
    ...drySpoke,
  },
  {
    icao: 'KIYK',
    name: 'Inyokern',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 35.6588,
    lon: -117.83,
    ...drySpoke,
  },
  {
    icao: 'KHTH',
    name: 'Hawthorne Industrial',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 38.5444,
    lon: -118.634,
    ...drySpoke,
  },
  {
    icao: 'KSPZ',
    name: 'Silver Springs',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 39.403,
    lon: -119.251,
    ...drySpoke,
  },
  {
    icao: 'KSVE',
    name: 'Susanville',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 40.3757,
    lon: -120.573,
    ...drySpoke,
  },
  {
    icao: 'KTRK',
    name: 'Truckee Tahoe',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 39.3186,
    lon: -120.1406,
    ...drySpoke,
  },
  {
    icao: 'KTVL',
    name: 'Lake Tahoe',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 38.8939,
    lon: -119.995,
    ...drySpoke,
  },
  {
    icao: 'KMPI',
    name: 'Mariposa Yosemite',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 37.5109,
    lon: -120.04,
    ...drySpoke,
  },

  // ── US bush soft-fields (3) — official ICAO; ferry blocked; OD vs US gateways ──
  {
    icao: 'KESW',
    name: 'Easton State',
    region: 'US-W',
    hubTier: 'spoke',
    lat: 47.2542,
    lon: -121.186,
    bush: true,
    ...bushSpoke,
  },
  {
    icao: 'KTCS',
    name: 'Truth or Consequences Municipal',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 33.2369,
    lon: -107.272,
    bush: true,
    ...bushSpoke,
  },
  {
    icao: 'KTAD',
    name: 'Trinidad / Perry Stokes',
    region: 'US-MT',
    hubTier: 'spoke',
    lat: 37.2594,
    lon: -104.341,
    bush: true,
    ...bushSpoke,
  },
  // FAA locals / trip-only endpoints (Activities PLN Airport nodes)
  ...US_BUSH_TRIP_ONLY_HUBS,
];

export const US_CAREER_HUB_COUNT = 155;

function haversineNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 3440.065; // Earth radius in NM
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function corridorKey(a: string, b: string): string {
  const left = a.toUpperCase();
  const right = b.toUpperCase();
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function feederWeight(from: HubTier, to: HubTier): number {
  if (from === 'spoke' && to === 'regional') return 1.35;
  if (from === 'spoke' && to === 'major') return 1.45;
  if (from === 'regional' && to === 'major') return 1.55;
  if (from === 'regional' && to === 'regional') return 1.4;
  if (from === 'spoke' && to === 'spoke') return 1.25;
  return 1.35;
}

/**
 * Auto feeder corridors so every hub has ≥2 partners.
 * Dedupes against existing manual trunks (caller merges).
 */
export function buildCareerFeederCorridors(
  hubs: readonly CareerFeederHub[],
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  const majors = hubs.filter((h) => h.hubTier === 'major');
  const seen = new Set(existing.map((e) => corridorKey(e.a, e.b)));
  const out: CareerCorridorEdge[] = [];

  const addEdge = (a: string, b: string, weight: number) => {
    if (a.toUpperCase() === b.toUpperCase()) return;
    const key = corridorKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ a: a.toUpperCase(), b: b.toUpperCase(), weight });
  };

  const partnerCount = (icao: string): number => {
    const id = icao.toUpperCase();
    let n = 0;
    for (const key of seen) {
      const [left, right] = key.split(':');
      if (left === id || right === id) n += 1;
    }
    return n;
  };

  for (const hub of hubs) {
    const need = Math.max(0, 2 - partnerCount(hub.icao));
    if (need === 0) continue;

    const sameRegion = hubs
      .filter((h) => h.icao !== hub.icao && h.region === hub.region)
      .map((h) => ({
        h,
        nm: haversineNm(hub, h),
        gate: h.hubTier === 'major' || h.hubTier === 'regional',
      }))
      .sort((a, b) => {
        if (a.gate !== b.gate) return a.gate ? -1 : 1;
        return a.nm - b.nm;
      });

    const picks: CareerFeederHub[] = [];
    for (const row of sameRegion) {
      if (picks.length >= need) break;
      // Prefer regional/major; allow spoke only if region is thin.
      if (row.gate || sameRegion.filter((r) => r.gate).length < 2) {
        picks.push(row.h);
      }
    }

    if (picks.length < need) {
      const nearestMajors = majors
        .filter((m) => m.icao !== hub.icao)
        .map((m) => ({ m, nm: haversineNm(hub, m) }))
        .sort((a, b) => a.nm - b.nm);
      for (const row of nearestMajors) {
        if (picks.length >= need) break;
        if (picks.some((p) => p.icao === row.m.icao)) continue;
        picks.push(row.m);
      }
    }

    for (const partner of picks.slice(0, need)) {
      addEdge(
        hub.icao,
        partner.icao,
        feederWeight(hub.hubTier, partner.hubTier),
      );
    }
  }

  // Safety: any hub still under 2 partners links to nearest majors.
  for (const hub of hubs) {
    while (partnerCount(hub.icao) < 2) {
      const nearest = majors
        .filter((m) => m.icao !== hub.icao)
        .map((m) => ({ m, nm: haversineNm(hub, m) }))
        .sort((a, b) => a.nm - b.nm)
        .find((row) => !seen.has(corridorKey(hub.icao, row.m.icao)));
      if (!nearest) break;
      addEdge(
        hub.icao,
        nearest.m.icao,
        feederWeight(hub.hubTier, nearest.m.hubTier),
      );
    }
  }

  return out;
}

/**
 * Auto feeder corridors so every non-bush US hub has ≥2 partners.
 * Dedupes against existing manual trunks (caller merges).
 */
export function buildUsFeederCorridors(
  hubs: readonly UsCareerHubDef[],
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true && h.bushTripOnly !== true),
    existing,
  );
}

/** Runtime assert helpers for tests / seed wiring. */
export function assertUsCareerHubCatalog(): void {
  if (US_CAREER_HUBS.length !== US_CAREER_HUB_COUNT) {
    throw new Error(
      `US_CAREER_HUBS length ${US_CAREER_HUBS.length} !== ${US_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  for (const h of US_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate US hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
  }
}
