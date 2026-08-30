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

export type PortsLoopSection = 'catalog' | 'warehouse' | 'demand';

export function portsLoopTargetSection(step: PortsLoopStep): PortsLoopSection {
  switch (step.kind) {
    case 'buy_warehouse':
    case 'store_yard':
    case 'wait_inbound':
      return 'warehouse';
    case 'fulfill_demand':
    case 'wait_demand':
      return 'demand';
    case 'buy_port':
      return 'catalog';
  }
}

export function derivePortsLoopStep(input: {
  warehouseCount: number;
  stock: Array<{ commodityId: string; kg: number }>;
  pickups: Array<{
    id: string;
    hubIcao: string;
    commodityId: string;
    commodityName?: string;
    kg: number;
    holdUsdPerDay?: number;
  }>;
  demand: Array<{ commodityId: string; remainingKg: number }>;
  /** Port→WH transfers not yet in stock. */
  inboundTransfers?: Array<{
    hubIcao: string;
    kg: number;
    readyAtTick: number;
  }>;
  economyTick?: number;
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
  const stockKg = stockLots.reduce((sum, s) => sum + s.kg, 0);

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
    stockLots.map((s) => s.commodityId.trim().toLowerCase()),
  );
  let matchCount = 0;
  let openDemandCount = 0;
  for (const order of input.demand) {
    if (order.remainingKg <= 0) continue;
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
