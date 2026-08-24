/**
 * Client-side Demand accept pull preview (mirrors shared FIFO withdraw).
 * Career UI must not import @msfs-compat/shared.
 */

import demandIntlCountryPairsRaw from '../../shared/src/data/demand-intl-country-pairs.json' with { type: 'json' };

export type DemandWithdrawLot = {
  kg: number;
  avgCostUsdPerKg: number;
  acquiredAtTick: number;
};

export type DemandAcceptPullPreview = {
  takeKg: number;
  avgCostUsdPerKg: number;
  costUsd: number;
  payUsd: number;
  marginUsd: number;
  limitedBy: 'order' | 'stock' | 'aircraft';
};

/** Keep in sync with DEMAND_INTL_PAY_MULT in packages/shared career-demand.ts */
export const DEMAND_INTL_PAY_MULT = 1.28;

const DEMAND_INTL_COUNTRY_PAIRS: ReadonlyArray<readonly [string, string]> =
  demandIntlCountryPairsRaw as unknown as ReadonlyArray<
    readonly [string, string]
  >;

const DEMAND_INTL_PAIR_SET = new Set(
  DEMAND_INTL_COUNTRY_PAIRS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
);

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Great-circle distance in nautical miles (WGS84 sphere). */
export function greatCircleDistanceNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const earthNm = 3440.065;
  return 2 * earthNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isDemandInternationalCountryPair(
  originCountryId: string | null | undefined,
  destCountryId: string | null | undefined,
): boolean {
  const a = originCountryId?.trim().toUpperCase() ?? '';
  const b = destCountryId?.trim().toUpperCase() ?? '';
  if (!a || !b || a === b) return false;
  return DEMAND_INTL_PAIR_SET.has(`${a}|${b}`);
}

export type DemandIntlRoutePreview = {
  international: boolean;
  allowed: boolean;
  unitPriceMult: number;
  /** Blocking reason when international but not accept-ready. */
  blockReason: string | null;
  originCountryId: string | null;
  destCountryId: string | null;
};

/**
 * Mirror assertDemandInternationalAccept for UI (no throw).
 * pickupHubSet = warehouses.pickupHubs from API.
 */
export function previewDemandInternationalRoute(opts: {
  originIcao: string;
  destIcao: string;
  originCountryId: string | null | undefined;
  destCountryId: string | null | undefined;
  pickupHubs: readonly string[];
}): DemandIntlRoutePreview {
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const originCountryId = opts.originCountryId?.trim().toUpperCase() || null;
  const destCountryId = opts.destCountryId?.trim().toUpperCase() || null;

  if (!origin || !dest || origin === dest) {
    return {
      international: false,
      allowed: true,
      unitPriceMult: 1,
      blockReason: null,
      originCountryId,
      destCountryId,
    };
  }

  if (!originCountryId || !destCountryId) {
    return {
      international: false,
      allowed: true,
      unitPriceMult: 1,
      blockReason: null,
      originCountryId,
      destCountryId,
    };
  }

  if (originCountryId === destCountryId) {
    return {
      international: false,
      allowed: true,
      unitPriceMult: 1,
      blockReason: null,
      originCountryId,
      destCountryId,
    };
  }

  if (!isDemandInternationalCountryPair(originCountryId, destCountryId)) {
    return {
      international: true,
      allowed: false,
      unitPriceMult: 1,
      blockReason: `International ${originCountryId}→${destCountryId} is not on the allowed country pairs`,
      originCountryId,
      destCountryId,
    };
  }

  const pickup = new Set(
    opts.pickupHubs.map((h) => h.trim().toUpperCase()).filter(Boolean),
  );
  if (!pickup.has(origin)) {
    return {
      international: true,
      allowed: false,
      unitPriceMult: DEMAND_INTL_PAY_MULT,
      blockReason: `International demand requires a warehouse at a port pickup hub (not ${origin})`,
      originCountryId,
      destCountryId,
    };
  }

  return {
    international: true,
    allowed: true,
    unitPriceMult: DEMAND_INTL_PAY_MULT,
    blockReason: null,
    originCountryId,
    destCountryId,
  };
}

export type DemandOriginHub = {
  icao: string;
  countryId?: string | null;
};

/** True if at least one warehouse can legally stage this dest (domestic or allowlisted intl). */
export function demandOrderReachableFromOrigins(opts: {
  destIcao: string;
  destCountryId?: string | null;
  origins: readonly DemandOriginHub[];
  pickupHubs: readonly string[];
}): boolean {
  const dest = opts.destIcao.trim().toUpperCase();
  if (!dest || opts.origins.length === 0) return false;
  for (const origin of opts.origins) {
    const icao = origin.icao.trim().toUpperCase();
    if (!icao || icao === dest) continue;
    const preview = previewDemandInternationalRoute({
      originIcao: icao,
      destIcao: dest,
      originCountryId: origin.countryId,
      destCountryId: opts.destCountryId,
      pickupHubs: opts.pickupHubs,
    });
    if (preview.allowed) return true;
  }
  return false;
}

/** FIFO weighted-average cost for withdrawing needKg (non-mutating). */
export function previewFifoWithdrawCost(
  lots: ReadonlyArray<DemandWithdrawLot>,
  needKg: number,
): { kg: number; avgCostUsdPerKg: number; costUsd: number } | null {
  const need = Math.max(0, Math.floor(needKg));
  if (need <= 0) return null;
  const ordered = [...lots]
    .filter((p) => p.kg > 0)
    .sort((a, b) => a.acquiredAtTick - b.acquiredAtTick);
  const available = ordered.reduce((s, p) => s + p.kg, 0);
  if (available < need) return null;
  let left = need;
  let costSum = 0;
  for (const pile of ordered) {
    if (left <= 0) break;
    const take = Math.min(pile.kg, left);
    costSum += pile.avgCostUsdPerKg * take;
    left -= take;
  }
  const avgCostUsdPerKg = money(costSum / need);
  return {
    kg: need,
    avgCostUsdPerKg,
    costUsd: money(avgCostUsdPerKg * need),
  };
}

export function previewDemandAcceptPull(opts: {
  remainingKg: number;
  stockKg: number;
  maxCargoKg: number;
  maxUnitPriceUsd: number;
  /** Applied after maxUnitPriceUsd (intl premium). Default 1. */
  unitPriceMult?: number;
  lots: ReadonlyArray<DemandWithdrawLot>;
}): DemandAcceptPullPreview | null {
  const remaining = Math.max(0, Math.floor(opts.remainingKg));
  const stock = Math.max(0, Math.floor(opts.stockKg));
  const maxCargo =
    opts.maxCargoKg > 0 ? Math.max(0, Math.floor(opts.maxCargoKg)) : stock;
  const takeKg = Math.min(remaining, stock, maxCargo);
  if (takeKg <= 0) return null;

  let limitedBy: DemandAcceptPullPreview['limitedBy'] = 'order';
  if (takeKg === stock && stock <= remaining && stock <= maxCargo) {
    limitedBy = 'stock';
  } else if (takeKg === maxCargo && maxCargo < remaining && maxCargo < stock) {
    limitedBy = 'aircraft';
  } else if (takeKg === remaining) {
    limitedBy = 'order';
  } else if (takeKg === stock) {
    limitedBy = 'stock';
  } else {
    limitedBy = 'aircraft';
  }

  const fifo = previewFifoWithdrawCost(opts.lots, takeKg);
  if (!fifo) return null;
  const mult =
    typeof opts.unitPriceMult === 'number' &&
    Number.isFinite(opts.unitPriceMult) &&
    opts.unitPriceMult > 0
      ? opts.unitPriceMult
      : 1;
  const unit = money(opts.maxUnitPriceUsd * mult);
  const payUsd = money(unit * takeKg);
  return {
    takeKg,
    avgCostUsdPerKg: fifo.avgCostUsdPerKg,
    costUsd: fifo.costUsd,
    payUsd,
    marginUsd: money(payUsd - fifo.costUsd),
    limitedBy,
  };
}
