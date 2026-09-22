/**
 * Browser-safe port desk pickup (mirrors shared resolvePortPickupHub).
 * One pickup hub per port in CAREER_PORTS.
 */

export function resolvePortDeskPickupHub(
  pickupHubs: readonly string[] | undefined,
): string | null {
  const first = pickupHubs?.[0]?.trim().toUpperCase();
  return first || null;
}

export function portDeskPickupHubList(
  pickupHubs: readonly string[] | undefined,
): string[] {
  const hub = resolvePortDeskPickupHub(pickupHubs);
  return hub ? [hub] : [];
}

export function formatPortDeskPickupLabel(
  pickupHubs: readonly string[] | undefined,
): string {
  return resolvePortDeskPickupHub(pickupHubs) ?? '—';
}
