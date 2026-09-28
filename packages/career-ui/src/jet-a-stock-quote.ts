/**
 * Cash a Jet-A stock slider selection will have spent after Buy this load.
 * Mirrors `setPortJetAStockKg`: fuel already in the company tank at the
 * origin is not charged again; the rest is origin spot, rounded once.
 */

export function quoteJetAStockCashUsd(opts: {
  bookedKg: number;
  nextKg: number;
  fromTankKg: number;
  boughtKg: number;
  boughtUsd: number;
  originTankKg: number;
  unitUsdPerKg: number;
}): { totalUsd: number; deltaUsd: number } {
  const current = Math.max(0, Math.floor(opts.bookedKg));
  const next = Math.max(0, Math.floor(opts.nextKg));
  const fromTankKg = Math.max(0, Math.floor(opts.fromTankKg));
  const boughtKg = Math.max(0, Math.floor(opts.boughtKg));
  const boughtUsd = Math.max(0, Math.round(opts.boughtUsd));
  const unit = opts.unitUsdPerKg > 0 ? opts.unitUsdPerKg : 0;
  if (next === current) return { totalUsd: boughtUsd, deltaUsd: 0 };
  if (next > current) {
    const extra = next - current;
    const draw = Math.min(extra, Math.max(0, Math.floor(opts.originTankKg)));
    const charge = Math.round((extra - draw) * unit);
    return { totalUsd: boughtUsd + charge, deltaUsd: charge };
  }
  const cut = current - next;
  const cutBought = cut - Math.min(cut, fromTankKg);
  const refund =
    boughtKg > 0 && cutBought > 0
      ? Math.round((boughtUsd * cutBought) / boughtKg)
      : 0;
  return { totalUsd: Math.max(0, boughtUsd - refund), deltaUsd: -refund };
}
