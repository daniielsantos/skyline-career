/**
 * Client-side Demand accept pull preview (mirrors shared FIFO withdraw).
 * Career UI must not import @msfs-compat/shared.
 */

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

function money(n: number): number {
  return Math.round(n * 100) / 100;
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
  const payUsd = money(opts.maxUnitPriceUsd * takeKg);
  return {
    takeKg,
    avgCostUsdPerKg: fifo.avgCostUsdPerKg,
    costUsd: fifo.costUsd,
    payUsd,
    marginUsd: money(payUsd - fifo.costUsd),
    limitedBy,
  };
}
