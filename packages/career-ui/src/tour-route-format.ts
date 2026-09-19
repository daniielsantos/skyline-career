/** Split a tour `routeLabel` (`SBUL→SBKG→SBRF` or `A->B`) into stop ICAOs. */
export function splitTourRouteStops(routeLabel: string): string[] {
  return routeLabel
    .split(/\s*(?:→|->)\s*/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** Per-leg pax for tours — never sum (sum looked like one oversized group). */
export function formatTourPaxByLeg(
  legs: ReadonlyArray<{ groupSize: number }>,
): string {
  if (legs.length === 0) return '—';
  return legs.map((l) => String(l.groupSize)).join(' · ');
}
