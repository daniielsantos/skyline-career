/** Client-only “next step” for the Port → Yard/WH → Demand loop. */

export type PortsLoopStep =
  | { kind: 'buy_warehouse' }
  | {
      kind: 'store_yard';
      pickupId: string;
      hubIcao: string;
      commodityId: string;
      commodityName?: string;
      kg: number;
      holdUsdPerDay: number;
    }
  | {
      kind: 'wait_inbound';
      kg: number;
      hubIcao: string;
      /** Economy ticks until earliest arrival; 0 = due any moment. */
      ticksLeft: number;
    }
  | { kind: 'fulfill_demand'; matchCount: number }
  | {
      kind: 'wait_demand';
      stockKg: number;
      /** Open board rows (any filter) — drives CTA / empty copy. */
      openDemandCount: number;
    }
  | { kind: 'buy_port' };

/** Top-level Ports tabs after network IA — warehouse/demand live under Network. */
export type PortsLoopSection = 'catalog' | 'network';

export function portsLoopTargetSection(step: PortsLoopStep): PortsLoopSection {
  switch (step.kind) {
    case 'buy_warehouse':
    case 'store_yard':
    case 'wait_inbound':
    case 'fulfill_demand':
    case 'wait_demand':
      return 'network';
    case 'buy_port':
      return 'catalog';
  }
}

export function derivePortsLoopStep(input: {
  warehouseCount: number;
  stock: Array<{ commodityId: string; kg: number; warehouseId?: string }>;
  pickups: Array<{
    id: string;
    hubIcao: string;
    commodityId: string;
    commodityName?: string;
    kg: number;
    holdUsdPerDay?: number;
  }>;
  demand: Array<{
    commodityId: string;
    remainingKg: number;
    /** Port desk that owns the row — used when focusPortId is set. */
    portId?: string;
  }>;
  /**
   * When set, only count Demand on this port's desk (not the world board).
   * Avoids "400+ matches" banners from commodity-only global scans.
   */
  focusPortId?: string;
  /** Port→WH transfers not yet in stock. */
  inboundTransfers?: Array<{
    hubIcao: string;
    kg: number;
    readyAtTick: number;
  }>;
  economyTick?: number;
  /** Desk holds reserve free kg — match banner should ignore reserved stock. */
  demandHolds?: Array<{
    commodityId: string;
    kg: number;
    warehouseId?: string;
  }>;
}): PortsLoopStep {
  if (input.warehouseCount <= 0) {
    return { kind: 'buy_warehouse' };
  }

  const yardLots = input.pickups.filter((p) => p.kg > 0);
  if (yardLots.length > 0) {
    let best = yardLots[0]!;
    for (let i = 1; i < yardLots.length; i++) {
      const row = yardLots[i]!;
      if (row.kg > best.kg) best = row;
    }
    return {
      kind: 'store_yard',
      pickupId: best.id,
      hubIcao: best.hubIcao.trim().toUpperCase(),
      commodityId: best.commodityId,
      commodityName: best.commodityName,
      kg: best.kg,
      holdUsdPerDay: Math.max(0, best.holdUsdPerDay ?? 0),
    };
  }

  const stockLots = input.stock.filter((s) => s.kg > 0);
  const freeByKey = new Map<string, { commodityId: string; kg: number }>();
  for (const s of stockLots) {
    const commodityId = s.commodityId.trim();
    const key = `${s.warehouseId?.trim() ?? '*'}|${commodityId.toLowerCase()}`;
    const cur = freeByKey.get(key);
    if (cur) cur.kg += Math.max(0, Math.floor(s.kg));
    else freeByKey.set(key, { commodityId, kg: Math.max(0, Math.floor(s.kg)) });
  }
  for (const hold of input.demandHolds ?? []) {
    const kg = Math.max(0, Math.floor(hold.kg));
    if (kg <= 0) continue;
    const commodityId = hold.commodityId.trim();
    const key = `${hold.warehouseId?.trim() ?? '*'}|${commodityId.toLowerCase()}`;
    const cur = freeByKey.get(key);
    if (!cur) continue;
    cur.kg = Math.max(0, cur.kg - kg);
  }
  const freeLots = [...freeByKey.values()].filter((s) => s.kg > 0);
  const stockKg = freeLots.reduce((sum, s) => sum + s.kg, 0);

  const inbound = (input.inboundTransfers ?? []).filter((t) => t.kg > 0);
  if (stockKg <= 0 && inbound.length > 0) {
    const kg = inbound.reduce((sum, t) => sum + t.kg, 0);
    const tick =
      typeof input.economyTick === 'number' && Number.isFinite(input.economyTick)
        ? input.economyTick
        : 0;
    let ticksLeft = Number.POSITIVE_INFINITY;
    let hubIcao = inbound[0]!.hubIcao.trim().toUpperCase();
    for (const t of inbound) {
      const left = Math.max(0, Math.round(t.readyAtTick) - Math.round(tick));
      if (left < ticksLeft) {
        ticksLeft = left;
        hubIcao = t.hubIcao.trim().toUpperCase();
      }
    }
    if (!Number.isFinite(ticksLeft)) ticksLeft = 0;
    return {
      kind: 'wait_inbound',
      kg,
      hubIcao,
      ticksLeft,
    };
  }

  if (stockKg <= 0) {
    return { kind: 'buy_port' };
  }

  const stockCommodities = new Set(
    freeLots.map((s) => s.commodityId.trim().toLowerCase()),
  );
  const focusPort = input.focusPortId?.trim().toUpperCase() ?? '';
  let matchCount = 0;
  let openDemandCount = 0;
  for (const order of input.demand) {
    if (order.remainingKg <= 0) continue;
    if (focusPort) {
      const orderPort = (order.portId ?? '').trim().toUpperCase();
      if (orderPort !== focusPort) continue;
    }
    openDemandCount += 1;
    if (stockCommodities.has(order.commodityId.trim().toLowerCase())) {
      matchCount += 1;
    }
  }
  if (matchCount > 0) {
    return { kind: 'fulfill_demand', matchCount };
  }
  return { kind: 'wait_demand', stockKg, openDemandCount };
}
