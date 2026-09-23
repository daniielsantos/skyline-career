/** Native `title` / aria for VA member cut chips (directory + Config). */
export const VA_CUTS_TOOLTIP =
  'Pilot share of route net (pay − Jet-A) → home Wallet. ' +
  'Market hire = Freights / Charter on an airline tail. ' +
  'Airline desk = Demand / Wide haul from company stock. ' +
  'Rest stays with the company. ' +
  'Chip shows one % when both match, or a low–high range when they differ.';

/**
 * Compact Cuts chip for directory cards.
 * Same rates → `50%`. Different → `10%–50%` (low–high). Hover for Mkt vs Desk.
 */
export function formatVaCutsPair(
  marketHirePct: number | null | undefined,
  airlineDeskPct: number | null | undefined,
): string {
  const mkt =
    typeof marketHirePct === 'number' && Number.isFinite(marketHirePct)
      ? Math.round(marketHirePct)
      : null;
  const desk =
    typeof airlineDeskPct === 'number' && Number.isFinite(airlineDeskPct)
      ? Math.round(airlineDeskPct)
      : null;
  if (mkt == null && desk == null) return '—';
  if (desk == null) return `${mkt}%`;
  if (mkt == null) return `${desk}%`;
  if (mkt === desk) return `${mkt}%`;
  const lo = Math.min(mkt, desk);
  const hi = Math.max(mkt, desk);
  return `${lo}%–${hi}%`;
}
