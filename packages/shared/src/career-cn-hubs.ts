/**
 * China career hub catalog — Asia-13 Yellow Sea / Yangtze / Pearl face.
 *
 * Beijing cargo major is ZBAA Capital (not ZBAD Daxing). Shanghai cargo major
 * is ZSPD Pudong (not ZSSS Hongqiao). Guangzhou is ZGGG Baiyun. Chengdu is
 * ZUUU Shuangliu (Tianfu ZUTF deferred). Inland west / northeast / Xiamen
 * added in Asia-15. Qingdao ZSQD and Urumqi ZWWW added Asia-32.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CnCareerRegion = 'CN-N' | 'CN-E' | 'CN-S' | 'CN-W';

export type CnCareerHubDef = {
  icao: string;
  name: string;
  region: CnCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 14 curated China hubs. Pudong pickup is ZSPD; Yantian ZGSZ; Dalian ZYTL; Xiamen ZSAM. */
export const CN_CAREER_HUBS: readonly CnCareerHubDef[] = [
  {
    icao: 'ZBAA',
    name: 'Beijing Capital',
    region: 'CN-N',
    hubTier: 'major',
    lat: 40.0773,
    lon: 116.5967,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'ZSPD',
    name: 'Shanghai Pudong',
    region: 'CN-E',
    hubTier: 'major',
    lat: 31.1434,
    lon: 121.805,
    produce: { electronics: 1.55, general: 1.5, machinery: 1.4 },
    consume: { perishables: 1.3, supplies: 1.25, general: 1.1, fuel: 1.3 },
  },
  {
    icao: 'ZSSS',
    name: 'Shanghai Hongqiao',
    region: 'CN-E',
    hubTier: 'regional',
    lat: 31.1981,
    lon: 121.3343,
    produce: { general: 1.3, electronics: 1.2, supplies: 1.1 },
    consume: { perishables: 1.15, machinery: 1.0, fuel: 1.1 },
  },
  {
    icao: 'ZGGG',
    name: 'Guangzhou Baiyun',
    region: 'CN-S',
    hubTier: 'major',
    lat: 23.3924,
    lon: 113.299,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.35 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'ZGSZ',
    name: "Shenzhen Bao'an",
    region: 'CN-S',
    hubTier: 'regional',
    lat: 22.6395,
    lon: 113.8033,
    produce: { electronics: 1.45, general: 1.4, machinery: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'ZUUU',
    name: 'Chengdu Shuangliu',
    region: 'CN-W',
    hubTier: 'regional',
    lat: 30.5583,
    lon: 103.946,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'ZLXY',
    name: "Xi'an Xianyang",
    region: 'CN-W',
    hubTier: 'regional',
    lat: 34.4422,
    lon: 108.7624,
    produce: { electronics: 1.3, machinery: 1.25, general: 1.25 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.2 },
  },
  {
    icao: 'ZPPP',
    name: 'Kunming Changshui',
    region: 'CN-W',
    hubTier: 'regional',
    lat: 25.1103,
    lon: 102.9367,
    produce: { perishables: 1.3, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.2 },
  },
  {
    icao: 'ZYTL',
    name: 'Dalian Zhoushuizi',
    region: 'CN-N',
    hubTier: 'regional',
    lat: 38.9657,
    lon: 121.5385,
    produce: { machinery: 1.3, general: 1.3, electronics: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.2 },
  },
  {
    icao: 'ZUCK',
    name: 'Chongqing Jiangbei',
    region: 'CN-W',
    hubTier: 'regional',
    lat: 29.7123,
    lon: 106.6519,
    produce: { machinery: 1.3, general: 1.3, electronics: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'ZHHH',
    name: 'Wuhan Tianhe',
    region: 'CN-E',
    hubTier: 'regional',
    lat: 30.7748,
    lon: 114.2137,
    produce: { electronics: 1.3, general: 1.3, machinery: 1.2 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'ZSAM',
    name: 'Xiamen Gaoqi',
    region: 'CN-S',
    hubTier: 'regional',
    lat: 24.5439,
    lon: 118.1275,
    produce: { electronics: 1.35, general: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'ZSQD',
    name: 'Qingdao Jiaodong',
    region: 'CN-E',
    hubTier: 'regional',
    lat: 36.362,
    lon: 120.088,
    produce: { machinery: 1.3, general: 1.3, electronics: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1, fuel: 1.15 },
  },
  {
    icao: 'ZWWW',
    name: 'Urumqi Tianshan',
    region: 'CN-W',
    hubTier: 'regional',
    lat: 43.9136,
    lon: 87.4794,
    produce: { general: 1.25, machinery: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, perishables: 1.05, fuel: 1.15 },
  },
];

export const CN_CAREER_HUB_COUNT = 14;

export function buildCnFeederCorridors(
  hubs: readonly CnCareerHubDef[] = CN_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCnCareerHubCatalog(): void {
  if (CN_CAREER_HUBS.length !== CN_CAREER_HUB_COUNT) {
    throw new Error(
      `CN_CAREER_HUBS length ${CN_CAREER_HUBS.length} !== ${CN_CAREER_HUB_COUNT}`,
    );
  }
  if (!CN_CAREER_HUBS.some((h) => h.icao === 'ZBAA' && h.hubTier === 'major')) {
    throw new Error('CN catalog must include major ZBAA (Beijing Capital)');
  }
  if (!CN_CAREER_HUBS.some((h) => h.icao === 'ZSPD' && h.hubTier === 'major')) {
    throw new Error('CN catalog must include major ZSPD (Pudong)');
  }
  if (CN_CAREER_HUBS.some((h) => h.icao === 'ZBAD' && h.hubTier === 'major')) {
    throw new Error('CN catalog must not treat ZBAD Daxing as the cargo major');
  }
  if (CN_CAREER_HUBS.some((h) => h.icao === 'ZSSS' && h.hubTier === 'major')) {
    throw new Error('CN catalog must not treat ZSSS Hongqiao as the cargo major');
  }
  if (CN_CAREER_HUBS.some((h) => ['ZUTF', 'ZBTJ', 'RCTP', 'ZLSN'].includes(h.icao))) {
    throw new Error('CN catalog must not seed ZUTF / ZBTJ / RCTP / ZLSN');
  }
  if (!CN_CAREER_HUBS.some((h) => h.icao === 'ZLXY')) {
    throw new Error('CN catalog must include ZLXY (Xianyang, not closed Xiguan)');
  }
}
