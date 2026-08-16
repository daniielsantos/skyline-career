/**
 * O(1) lane inbound kg for Market soft-fill / NPC saturation.
 * Same totals as scanning npcFlights + player inboundPending.
 */
import type { CareerEconomyWorld, CommodityId } from './types/career-economy.js';

export type LaneInboundIndex = {
  /** ORIGIN|DEST|commodity → kg */
  byOd: Map<string, number>;
  /** DEST|commodity → kg (all origins) */
  byDest: Map<string, number>;
};

const laneInboundIndexByWorld = new WeakMap<CareerEconomyWorld, LaneInboundIndex>();

function laneOdKey(origin: string, dest: string, commodityId: string): string {
  return `${origin}|${dest}|${commodityId}`;
}

function laneDestKey(dest: string, commodityId: string): string {
  return `${dest}|${commodityId}`;
}

function bumpLaneMap(map: Map<string, number>, key: string, deltaKg: number): void {
  if (deltaKg === 0) return;
  const next = (map.get(key) ?? 0) + deltaKg;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}

/** Drop cached lane index (settle, player inbound sync, bulk flight edits). */
export function invalidateLaneInboundIndex(
  world: Pick<CareerEconomyWorld, 'npcFlights' | 'inboundPending'>,
): void {
  laneInboundIndexByWorld.delete(world as CareerEconomyWorld);
}

export function bumpLaneInboundIndex(
  index: LaneInboundIndex,
  originIcao: string,
  destIcao: string,
  commodityId: CommodityId,
  deltaKg: number,
): void {
  if (!Number.isFinite(deltaKg) || deltaKg === 0) return;
  const origin = originIcao.trim().toUpperCase();
  const dest = destIcao.trim().toUpperCase();
  bumpLaneMap(index.byOd, laneOdKey(origin, dest, commodityId), deltaKg);
  bumpLaneMap(index.byDest, laneDestKey(dest, commodityId), deltaKg);
}

export function buildLaneInboundIndex(
  world: Pick<CareerEconomyWorld, 'npcFlights' | 'inboundPending'>,
): LaneInboundIndex {
  const byOd = new Map<string, number>();
  const byDest = new Map<string, number>();
  for (const flight of world.npcFlights ?? []) {
    if (flight.status !== 'in_flight') continue;
    const kg = Math.max(0, flight.cargoKg);
    if (kg <= 0) continue;
    const origin = flight.originIcao.trim().toUpperCase();
    const dest = flight.destIcao.trim().toUpperCase();
    bumpLaneMap(byOd, laneOdKey(origin, dest, flight.commodityId), kg);
    bumpLaneMap(byDest, laneDestKey(dest, flight.commodityId), kg);
  }
  for (const pending of world.inboundPending ?? []) {
    if (pending.source !== 'player') continue;
    const kg = Math.max(0, pending.cargoKg);
    if (kg <= 0) continue;
    const origin = pending.originIcao.trim().toUpperCase();
    const dest = pending.destIcao.trim().toUpperCase();
    bumpLaneMap(byOd, laneOdKey(origin, dest, pending.commodityId), kg);
    bumpLaneMap(byDest, laneDestKey(dest, pending.commodityId), kg);
  }
  return { byOd, byDest };
}

/** Build or reuse the per-world lane index. */
export function ensureLaneInboundIndex(
  world: CareerEconomyWorld,
): LaneInboundIndex {
  let index = laneInboundIndexByWorld.get(world);
  if (!index) {
    index = buildLaneInboundIndex(world);
    laneInboundIndexByWorld.set(world, index);
  }
  return index;
}

export function laneInboundKgFromIndex(
  index: LaneInboundIndex,
  originIcao: string | null | undefined,
  destIcao: string,
  commodityId: CommodityId,
): number {
  const dest = destIcao.trim().toUpperCase();
  const origin =
    typeof originIcao === 'string' && originIcao.length > 0
      ? originIcao.trim().toUpperCase()
      : null;
  if (origin) {
    return index.byOd.get(laneOdKey(origin, dest, commodityId)) ?? 0;
  }
  return index.byDest.get(laneDestKey(dest, commodityId)) ?? 0;
}
