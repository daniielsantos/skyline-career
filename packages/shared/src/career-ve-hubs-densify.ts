/**
 * Venezuela densify — commercial SV* airports (MSFS + SimBrief).
 * Merged into VE_CAREER_HUBS. No bush strips.
 * Skip SVCP.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { VeCareerRegion } from './career-ve-hubs.js';

type VeDensifyHub = {
  icao: string;
  name: string;
  region: VeCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

const agroSpoke = {
  produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

const petroSpoke = {
  produce: { machinery: 1.3, general: 1.15, supplies: 1.05 },
  consume: { perishables: 1.05, electronics: 0.9 },
} as const;

/** VE densify (+18) → 31 total. Skip SVBI. */
export const VE_DENSIFY_HUBS: readonly VeDensifyHub[] = [
  {
    icao: 'SVCU',
    name: 'Antonio Jose de Sucre Cumana',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 10.4503,
    lon: -64.1305,
    ...drySpoke,
  },
  {
    icao: 'SVMD',
    name: 'Alberto Carnevalli Merida',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 8.5821,
    lon: -71.1612,
    produce: { general: 1.1, perishables: 1.15, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SVPA',
    name: 'Cacique Aramare Puerto Ayacucho',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 5.6199,
    lon: -67.6061,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'SVPC',
    name: 'Puerto Cabello',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 10.4805,
    lon: -68.073,
    produce: { general: 1.25, machinery: 1.15, supplies: 1.1 },
    consume: { perishables: 1.05, electronics: 0.95 },
  },
  {
    icao: 'SVAC',
    name: 'Oswaldo Guevara Mujica Acarigua',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 9.5533,
    lon: -69.2379,
    ...agroSpoke,
  },
  {
    icao: 'SVCB',
    name: 'Tomas de Heres Ciudad Bolivar',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 8.1222,
    lon: -63.5369,
    produce: { machinery: 1.25, general: 1.15, supplies: 1.05 },
    consume: { perishables: 1.1, electronics: 0.9 },
  },
  {
    icao: 'SVST',
    name: 'San Tome',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 8.9451,
    lon: -64.1511,
    ...petroSpoke,
  },
  // Wave C densify (+11)
  {
    icao: 'SVCR',
    name: 'Coro Jose Leonardo Chirinos',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 11.4149,
    lon: -69.6809,
    ...drySpoke,
  },
  {
    icao: 'SVJC',
    name: 'Paraguana Josefa Camejo',
    region: 'VE-C',
    hubTier: 'regional',
    lat: 11.7808,
    lon: -70.1515,
    ...petroSpoke,
  },
  {
    icao: 'SVVG',
    name: 'El Vigia Juan Pablo Perez Alfonso',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 8.6241,
    lon: -71.6727,
    ...agroSpoke,
  },
  {
    icao: 'SVVL',
    name: 'Valera Antonio Nicolas Briceno',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 9.3405,
    lon: -70.5841,
    ...agroSpoke,
  },
  {
    icao: 'SVGU',
    name: 'Guanare',
    region: 'VE-W',
    hubTier: 'spoke',
    lat: 9.0269,
    lon: -69.7552,
    ...agroSpoke,
  },
  {
    icao: 'SVCN',
    name: 'Canaima',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 6.232,
    lon: -62.8548,
    produce: { general: 1.15, perishables: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'SVSE',
    name: 'Santa Elena de Uairen',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 4.5547,
    lon: -61.1452,
    ...drySpoke,
  },
  {
    icao: 'SVTC',
    name: 'Tucupita',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 9.089,
    lon: -62.0942,
    ...agroSpoke,
  },
  {
    icao: 'SVVP',
    name: 'Valle de La Pascua',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 9.222,
    lon: -65.9936,
    ...agroSpoke,
  },
  {
    icao: 'SVGI',
    name: 'Guiria',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 10.5741,
    lon: -62.3127,
    ...drySpoke,
  },
  {
    icao: 'SVRS',
    name: 'Los Roques',
    region: 'VE-C',
    hubTier: 'spoke',
    lat: 11.9469,
    lon: -66.6683,
    produce: { general: 1.2, perishables: 1.15, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.9 },
  },
];

export const VE_DENSIFY_HUB_COUNT = VE_DENSIFY_HUBS.length;
