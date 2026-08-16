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
  | { kind: 'fulfill_demand'; matchCount: number }
  | { kind: 'wait_demand'; stockKg: number }
  | { kind: 'buy_port' };

export type PortsLoopSection = 'catalog' | 'warehouse' | 'demand';

export function portsLoopTargetSection(step: PortsLoopStep): PortsLoopSection {
  switch (step.kind) {
    case 'buy_warehouse':
    case 'store_yard':
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
  if (stockKg <= 0) {
    return { kind: 'buy_port' };
  }

  const stockCommodities = new Set(
    stockLots.map((s) => s.commodityId.trim().toLowerCase()),
  );
  let matchCount = 0;
  for (const order of input.demand) {
    if (order.remainingKg <= 0) continue;
    if (stockCommodities.has(order.commodityId.trim().toLowerCase())) {
      matchCount += 1;
    }
  }
  if (matchCount > 0) {
    return { kind: 'fulfill_demand', matchCount };
  }
  return { kind: 'wait_demand', stockKg };
}
