/**
 * Cumulative freight flow counters.
 *
 * Board snapshots (available / expired / delivered rows) only show the 12h
 * retention window, which made throughput something we had to infer. These
 * counters are monotonic; the pulse sweep diffs two samples to get rates.
 */

import type {
  CareerEconomyWorld,
  CommodityId,
  EconomyFlowStats,
  FlowCounter,
  FlowLotSizeBand,
} from './types/career-economy.js';

export const FLOW_LOT_SIZE_BANDS: readonly FlowLotSizeBand[] = [
  'ga_ltl',
  'ltl',
  'large',
  'xl',
];

function emptyCounter(): FlowCounter {
  return { lots: 0, kg: 0 };
}

function emptySizeBands(): Record<FlowLotSizeBand, number> {
  return { ga_ltl: 0, ltl: 0, large: 0, xl: 0 };
}

export function emptyFlowStats(sinceTick = 0): EconomyFlowStats {
  return {
    sinceTick,
    formed: emptyCounter(),
    expired: emptyCounter(),
    recycled: emptyCounter(),
    delivered: emptyCounter(),
    claimed: emptyCounter(),
    reserveRefundedKg: 0,
    byCommodity: {},
    formedBySize: emptySizeBands(),
    npc: { legs: 0, flightHours: 0, turnaroundHours: 0, restHours: 0 },
  };
}

export function ensureFlowStats(world: CareerEconomyWorld): EconomyFlowStats {
  const existing = world.flow;
  if (!existing || typeof existing !== 'object') {
    const fresh = emptyFlowStats(world.tick ?? 0);
    world.flow = fresh;
    return fresh;
  }
  // Migrate partially-shaped stats from older saves without losing totals.
  existing.formed ??= emptyCounter();
  existing.expired ??= emptyCounter();
  existing.recycled ??= emptyCounter();
  existing.delivered ??= emptyCounter();
  existing.claimed ??= emptyCounter();
  existing.reserveRefundedKg ??= 0;
  existing.byCommodity ??= {};
  existing.formedBySize ??= emptySizeBands();
  existing.npc ??= { legs: 0, flightHours: 0, turnaroundHours: 0, restHours: 0 };
  return existing;
}

type CommodityFlowKey = 'formed' | 'expired' | 'delivered' | 'claimed';

function bump(
  world: CareerEconomyWorld,
  key: CommodityFlowKey | 'recycled',
  commodityId: CommodityId,
  kg: number,
  lots: number,
): void {
  const stats = ensureFlowStats(world);
  const qty = Math.max(0, Math.round(kg));
  const counter = stats[key];
  counter.lots += lots;
  counter.kg += qty;
  if (key === 'recycled') return;

  const perCommodity = (stats.byCommodity[commodityId] ??= {
    formed: emptyCounter(),
    expired: emptyCounter(),
    delivered: emptyCounter(),
    claimed: emptyCounter(),
  });
  perCommodity[key].lots += lots;
  perCommodity[key].kg += qty;
}

export function noteLotFormed(
  world: CareerEconomyWorld,
  commodityId: CommodityId,
  kg: number,
  band: FlowLotSizeBand,
): void {
  bump(world, 'formed', commodityId, kg, 1);
  ensureFlowStats(world).formedBySize[band] += 1;
}

/** Unclaimed remainder that aged out of the board. */
export function noteLotExpired(
  world: CareerEconomyWorld,
  commodityId: CommodityId,
  kg: number,
): void {
  bump(world, 'expired', commodityId, kg, 1);
}

/** Stale heavy lot pulled early so the shelf turns over. */
export function noteLotRecycled(
  world: CareerEconomyWorld,
  commodityId: CommodityId,
  kg: number,
): void {
  bump(world, 'recycled', commodityId, kg, 1);
}

/** Cargo that actually landed at the destination (NPC or player). */
export function noteLotDelivered(
  world: CareerEconomyWorld,
  commodityId: CommodityId,
  kg: number,
): void {
  bump(world, 'delivered', commodityId, kg, 1);
}

/** Cargo taken off the board into a hold — the real competition signal. */
export function noteLotClaimed(
  world: CareerEconomyWorld,
  commodityId: CommodityId,
  kg: number,
): void {
  bump(world, 'claimed', commodityId, kg, 1);
}

export function noteReserveRefund(world: CareerEconomyWorld, kg: number): void {
  ensureFlowStats(world).reserveRefundedKg += Math.max(0, Math.round(kg));
}

/**
 * Hours committed by one NPC leg. Compared against sampled fleet occupancy this
 * tells us whether the fleet is dwelling longer than the schedule granted it.
 */
export function noteNpcLeg(
  world: CareerEconomyWorld,
  hours: { flightHours: number; turnaroundHours: number },
): void {
  const npc = ensureFlowStats(world).npc;
  npc.legs += 1;
  npc.flightHours += Math.max(0, hours.flightHours);
  npc.turnaroundHours += Math.max(0, hours.turnaroundHours);
}

export function noteNpcRest(world: CareerEconomyWorld, restHours: number): void {
  ensureFlowStats(world).npc.restHours += Math.max(0, restHours);
}

function diffCounter(a: FlowCounter, b: FlowCounter): FlowCounter {
  return { lots: b.lots - a.lots, kg: b.kg - a.kg };
}

/** Flow that happened between two cumulative samples. */
export function diffFlowStats(
  from: EconomyFlowStats,
  to: EconomyFlowStats,
): EconomyFlowStats {
  const byCommodity: EconomyFlowStats['byCommodity'] = {};
  const ids = new Set<string>([
    ...Object.keys(from.byCommodity ?? {}),
    ...Object.keys(to.byCommodity ?? {}),
  ]);
  for (const id of ids) {
    const commodityId = id as CommodityId;
    const a = from.byCommodity?.[commodityId];
    const b = to.byCommodity?.[commodityId];
    const zero = emptyCounter();
    byCommodity[commodityId] = {
      formed: diffCounter(a?.formed ?? zero, b?.formed ?? zero),
      expired: diffCounter(a?.expired ?? zero, b?.expired ?? zero),
      delivered: diffCounter(a?.delivered ?? zero, b?.delivered ?? zero),
      claimed: diffCounter(a?.claimed ?? zero, b?.claimed ?? zero),
    };
  }

  const formedBySize = emptySizeBands();
  for (const band of FLOW_LOT_SIZE_BANDS) {
    formedBySize[band] =
      (to.formedBySize?.[band] ?? 0) - (from.formedBySize?.[band] ?? 0);
  }

  return {
    sinceTick: from.sinceTick,
    formed: diffCounter(from.formed, to.formed),
    expired: diffCounter(from.expired, to.expired),
    recycled: diffCounter(from.recycled, to.recycled),
    delivered: diffCounter(from.delivered, to.delivered),
    claimed: diffCounter(from.claimed, to.claimed),
    reserveRefundedKg: to.reserveRefundedKg - from.reserveRefundedKg,
    byCommodity,
    formedBySize,
    npc: {
      legs: to.npc.legs - from.npc.legs,
      flightHours: to.npc.flightHours - from.npc.flightHours,
      turnaroundHours: to.npc.turnaroundHours - from.npc.turnaroundHours,
      restHours: to.npc.restHours - from.npc.restHours,
    },
  };
}

/** Deep copy so a sweep can hold a snapshot while the world keeps ticking. */
export function cloneFlowStats(stats: EconomyFlowStats): EconomyFlowStats {
  return JSON.parse(JSON.stringify(stats)) as EconomyFlowStats;
}
