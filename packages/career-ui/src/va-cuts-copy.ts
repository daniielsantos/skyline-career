/** Native `title` / aria for VA member cut chips (directory + Config). */
export const VA_CUTS_TOOLTIP =
  'Pilot share of route net (pay − Jet-A) → home Wallet. ' +
  'Market hire = Freights / Charter on an airline tail. ' +
  'Airline desk = Demand / Wide haul from company stock. ' +
  'Rest stays with the company.';

/** Compact pair for directory cards — order is market hire / airline desk. */
export function formatVaCutsPair(
  marketHirePct: number | null | undefined,
  airlineDeskPct: number | null | undefined,
): string {
  const mkt =
    typeof marketHirePct === 'number' && Number.isFinite(marketHirePct)
      ? `${Math.round(marketHirePct)}%`
      : null;
  const desk =
    typeof airlineDeskPct === 'number' && Number.isFinite(airlineDeskPct)
      ? `${Math.round(airlineDeskPct)}%`
      : null;
  if (mkt == null && desk == null) return '—';
  if (desk == null) return `Mkt ${mkt}`;
  if (mkt == null) return `Desk ${desk}`;
  return `Mkt ${mkt} · Desk ${desk}`;
}
