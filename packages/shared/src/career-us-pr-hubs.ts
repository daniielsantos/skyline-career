/**
 * Puerto Rico US career hubs (region US-PR under country US).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';

export type UsPrCareerHubDef = {
  icao: string;
  name: string;
  region: 'US-PR';
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
  produce: { perishables: 1.35, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 5 curated Puerto Rico hubs — domestic US region US-PR. */
export const US_PR_CAREER_HUBS: readonly UsPrCareerHubDef[] = [
  {
    icao: 'TJSJ',
    name: 'San Juan Luis Munoz Marin',
    region: 'US-PR',
    hubTier: 'major',
    lat: 18.4394,
    lon: -66.0018,
    produce: { general: 1.45, electronics: 1.2, machinery: 1.1 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'TJBQ',
    name: 'Aguadilla Rafael Hernandez',
    region: 'US-PR',
    hubTier: 'regional',
    lat: 18.4949,
    lon: -67.1294,
    produce: { general: 1.2, perishables: 1.1, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'TJPS',
    name: 'Ponce Mercedita',
    region: 'US-PR',
    hubTier: 'regional',
    lat: 18.0083,
    lon: -66.563,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9 },
  },
  {
    icao: 'TJIG',
    name: 'San Juan Fernando Luis Ribas Dominicci',
    region: 'US-PR',
    hubTier: 'spoke',
    lat: 18.4568,
    lon: -66.0981,
    ...drySpoke,
  },
  {
    icao: 'TJMZ',
    name: 'Mayaguez Eugenio Maria de Hostos',
    region: 'US-PR',
    hubTier: 'spoke',
    lat: 18.2557,
    lon: -67.1485,
    ...agroSpoke,
  },
];

export const US_PR_CAREER_HUB_COUNT = 5;

export function assertUsPrCareerHubCatalog(): void {
  if (US_PR_CAREER_HUBS.length !== US_PR_CAREER_HUB_COUNT) {
    throw new Error(
      `US_PR_CAREER_HUBS length ${US_PR_CAREER_HUBS.length} !== ${US_PR_CAREER_HUB_COUNT}`,
    );
  }
  for (const h of US_PR_CAREER_HUBS) {
    if (h.region !== 'US-PR') {
      throw new Error(`${h.icao} must use region US-PR`);
    }
  }
}
