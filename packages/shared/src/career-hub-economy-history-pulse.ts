/**
 * Aggregate daily hub_economy_samples into a network history pulse
 * (country / tier / world series over saved days).
 */

import type { HubEconomySample, HubTier } from './types/career-economy.js';

export type HubEconomyHistoryWindow = 7 | 30 | 90;

export type HubEconomyHistoryBucket = {
  hubs: number;
  liveHubs: number;
  liveHubPct: number;
  quietHubs: number;
  quietHubPct: number;
  outboundLots: number;
  outboundKg: number;
  /** Across hubs that posted a board: p10 / median / p90 of each hub's pay p50. */
  payP10Usd: number | null;
  payP50Usd: number | null;
  payP90Usd: number | null;
  avgCargoFillPct: number | null;
  jetAFillPct: number | null;
  softFillPct: number | null;
  inboundKg: number;
  sizeMixKg: {
    ga: number;
    tp: number;
    medium: number;
    narrow: number;
    wide: number;
  };
  sizeMixLots: {
    ga: number;
    tp: number;
    medium: number;
    narrow: number;
    wide: number;
  };
  /** Spot p50 across hubs for selected cargo ids. */
  spotGeneralUsd: number | null;
  spotElectronicsUsd: number | null;
};

export type HubEconomyHistoryDay = {
  dayIndex: number;
  tick: number;
  world: HubEconomyHistoryBucket;
  byCountry: Record<string, HubEconomyHistoryBucket>;
  byTier: Record<HubTier, HubEconomyHistoryBucket>;
};

export type HubEconomyHistoryPulse = {
  retentionDays: number;
  sampleDays: number;
  hubSamples: number;
  days: HubEconomyHistoryDay[];
  /** Focus countries always present when any samples exist. */
  focusCountries: string[];
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Linear-interpolated percentile on a copy (p in 0..1). */
function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0]!;
  const sorted = [...nums].sort((a, b) => a - b);
  const clamped = Math.min(1, Math.max(0, p));
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const t = idx - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

function emptyBucket(): HubEconomyHistoryBucket {
  return {
    hubs: 0,
    liveHubs: 0,
    liveHubPct: 0,
    quietHubs: 0,
    quietHubPct: 0,
    outboundLots: 0,
    outboundKg: 0,
    payP10Usd: null,
    payP50Usd: null,
    payP90Usd: null,
    avgCargoFillPct: null,
    jetAFillPct: null,
    softFillPct: null,
    inboundKg: 0,
    sizeMixKg: { ga: 0, tp: 0, medium: 0, narrow: 0, wide: 0 },
    sizeMixLots: { ga: 0, tp: 0, medium: 0, narrow: 0, wide: 0 },
    spotGeneralUsd: null,
    spotElectronicsUsd: null,
  };
}

function avgCargoFill(sample: HubEconomySample): number | null {
  const fills = sample.commodities
    .filter((c) => c.id !== 'fuel' && c.id !== 'mro_parts')
    .map((c) => c.fill)
    .filter((f) => Number.isFinite(f));
  if (fills.length === 0) return null;
  return fills.reduce((s, f) => s + f, 0) / fills.length;
}

function spotOf(sample: HubEconomySample, id: string): number | null {
  const row = sample.commodities.find((c) => c.id === id);
  if (!row || !Number.isFinite(row.spotUsd)) return null;
  return row.spotUsd;
}

function finalizeBucket(
  samples: HubEconomySample[],
): HubEconomyHistoryBucket {
  const b = emptyBucket();
  if (samples.length === 0) return b;
  b.hubs = samples.length;
  const pays: number[] = [];
  const fills: number[] = [];
  const jetA: number[] = [];
  const soft: number[] = [];
  const spotG: number[] = [];
  const spotE: number[] = [];

  for (const s of samples) {
    if (s.outboundLots > 0) b.liveHubs += 1;
    if (s.quiet) b.quietHubs += 1;
    b.outboundLots += s.outboundLots;
    b.outboundKg += s.outboundKg;
    b.inboundKg += s.inboundKg;
    b.sizeMixKg.ga += s.kgGa;
    b.sizeMixKg.tp += s.kgTp;
    b.sizeMixKg.medium += s.kgMedium;
    b.sizeMixKg.narrow += s.kgNarrow;
    b.sizeMixKg.wide += s.kgWide;
    b.sizeMixLots.ga += s.lotsGa;
    b.sizeMixLots.tp += s.lotsTp;
    b.sizeMixLots.medium += s.lotsMedium;
    b.sizeMixLots.narrow += s.lotsNarrow;
    b.sizeMixLots.wide += s.lotsWide;
    if (typeof s.payP50Usd === 'number' && Number.isFinite(s.payP50Usd)) {
      pays.push(s.payP50Usd);
    }
    const fill = avgCargoFill(s);
    if (fill != null) fills.push(fill);
    if (Number.isFinite(s.jetAFill)) jetA.push(s.jetAFill);
    if (s.cargoCapacityKg > 0) {
      soft.push(
        clamp01((s.cargoStockKg + s.inboundKg) / s.cargoCapacityKg),
      );
    }
    const g = spotOf(s, 'general');
    if (g != null) spotG.push(g);
    const e = spotOf(s, 'electronics');
    if (e != null) spotE.push(e);
  }

  b.liveHubPct = b.hubs > 0 ? b.liveHubs / b.hubs : 0;
  b.quietHubPct = b.hubs > 0 ? b.quietHubs / b.hubs : 0;
  b.payP10Usd = percentile(pays, 0.1);
  b.payP50Usd = median(pays);
  b.payP90Usd = percentile(pays, 0.9);
  b.avgCargoFillPct =
    fills.length === 0
      ? null
      : Math.round((fills.reduce((s, f) => s + f, 0) / fills.length) * 1000) / 10;
  b.jetAFillPct =
    jetA.length === 0
      ? null
      : Math.round((jetA.reduce((s, f) => s + f, 0) / jetA.length) * 1000) / 10;
  b.softFillPct =
    soft.length === 0
      ? null
      : Math.round((soft.reduce((s, f) => s + f, 0) / soft.length) * 1000) / 10;
  b.spotGeneralUsd = median(spotG);
  b.spotElectronicsUsd = median(spotE);
  return b;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const FOCUS_COUNTRIES = ['BR', 'US'] as const;

/** EU-1 Western core — used for synthetic `EU` history aggregate. */
export const EU1_WEST_COUNTRY_IDS = [
  'PT',
  'ES',
  'FR',
  'GB',
  'DE',
  'NL',
  'BE',
  'IT',
] as const;

const EU1_WEST_SET = new Set<string>(EU1_WEST_COUNTRY_IDS);

/**
 * Collapse flat hub samples into one row per economy day with world /
 * country / tier buckets.
 */
export function aggregateHubEconomyHistoryPulse(
  samples: HubEconomySample[],
  opts?: { retentionDays?: number; focusCountries?: string[] },
): HubEconomyHistoryPulse {
  const retentionDays = opts?.retentionDays ?? 90;
  const focusCountries = opts?.focusCountries ?? [...FOCUS_COUNTRIES];
  const byDay = new Map<number, HubEconomySample[]>();
  for (const s of samples) {
    const list = byDay.get(s.dayIndex);
    if (list) list.push(s);
    else byDay.set(s.dayIndex, [s]);
  }
  const dayIndexes = [...byDay.keys()].sort((a, b) => a - b);
  const days: HubEconomyHistoryDay[] = dayIndexes.map((dayIndex) => {
    const daySamples = byDay.get(dayIndex) ?? [];
    const tick = daySamples.reduce((m, s) => Math.max(m, s.tick), 0);
    const byCountrySamples = new Map<string, HubEconomySample[]>();
    const byTierSamples: Record<HubTier, HubEconomySample[]> = {
      major: [],
      regional: [],
      spoke: [],
    };
    for (const s of daySamples) {
      const cid = s.countryId || 'XX';
      const cl = byCountrySamples.get(cid);
      if (cl) cl.push(s);
      else byCountrySamples.set(cid, [s]);
      byTierSamples[s.hubTier].push(s);
    }
    // UI pulse only needs focus countries — dumping every ISO bloated
    // the JSON (~80KB+/day) and made Network history flaky under lock contention.
    // Synthetic `EU` merges EU-1 Western core samples without listing every ISO.
    const byCountry: Record<string, HubEconomyHistoryBucket> = {};
    for (const id of focusCountries) {
      if (id === 'EU') {
        const euSamples: HubEconomySample[] = [];
        for (const [cid, list] of byCountrySamples) {
          if (EU1_WEST_SET.has(cid)) euSamples.push(...list);
        }
        byCountry.EU = finalizeBucket(euSamples);
        continue;
      }
      byCountry[id] = finalizeBucket(byCountrySamples.get(id) ?? []);
    }
    return {
      dayIndex,
      tick,
      world: finalizeBucket(daySamples),
      byCountry,
      byTier: {
        major: finalizeBucket(byTierSamples.major),
        regional: finalizeBucket(byTierSamples.regional),
        spoke: finalizeBucket(byTierSamples.spoke),
      },
    };
  });

  return {
    retentionDays,
    sampleDays: days.length,
    hubSamples: samples.length,
    days,
    focusCountries: [...focusCountries],
  };
}
