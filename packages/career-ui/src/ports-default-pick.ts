import { greatCircleDistanceNm } from './demand-accept-preview';

export type PortPickCandidate = {
  id: string;
  countryId: string;
  lat: number;
  lon: number;
  pickupHubs?: readonly string[];
  deskPickupHub?: string;
  concession?: { status?: string } | null;
};

function nearestPortId(
  ports: readonly PortPickCandidate[],
  lat: number | null | undefined,
  lon: number | null | undefined,
): string | null {
  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }
  let bestId: string | null = null;
  let bestNm = Infinity;
  for (const port of ports) {
    if (!Number.isFinite(port.lat) || !Number.isFinite(port.lon)) continue;
    const nm = greatCircleDistanceNm(
      { lat, lon },
      { lat: port.lat, lon: port.lon },
    );
    if (nm < bestNm) {
      bestNm = nm;
      bestId = port.id;
    }
  }
  return bestId;
}

function portCoversHub(port: PortPickCandidate, hubIcao: string): boolean {
  const hub = hubIcao.trim().toUpperCase();
  if (!hub) return false;
  const desk = (port.deskPickupHub ?? port.pickupHubs?.[0] ?? '')
    .trim()
    .toUpperCase();
  if (desk === hub) return true;
  return (port.pickupHubs ?? []).some((h) => h.trim().toUpperCase() === hub);
}

/**
 * Initial Ports catalog selection when the panel has no remembered port.
 * Prefer owned FBO → port linked to owned WH → nearest to home → home country → catalog[0].
 */
export function pickDefaultPortId(opts: {
  ports: readonly PortPickCandidate[];
  homeLat?: number | null;
  homeLon?: number | null;
  homeCountryId?: string | null;
  ownedWarehouseHubs?: readonly string[];
}): string | null {
  const ports = opts.ports;
  if (ports.length === 0) return null;

  const yours = ports.filter((p) => p.concession?.status === 'yours');
  if (yours.length === 1) return yours[0]!.id;
  if (yours.length > 1) {
    return (
      nearestPortId(yours, opts.homeLat, opts.homeLon) ?? yours[0]!.id
    );
  }

  const whHubs = [
    ...new Set(
      (opts.ownedWarehouseHubs ?? [])
        .map((h) => h.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (whHubs.length > 0) {
    const linked = ports.filter((p) =>
      whHubs.some((hub) => portCoversHub(p, hub)),
    );
    if (linked.length === 1) return linked[0]!.id;
    if (linked.length > 1) {
      return (
        nearestPortId(linked, opts.homeLat, opts.homeLon) ?? linked[0]!.id
      );
    }
  }

  const nearest = nearestPortId(ports, opts.homeLat, opts.homeLon);
  if (nearest) return nearest;

  const country = opts.homeCountryId?.trim().toUpperCase() ?? '';
  if (country) {
    const sameCountry = ports.find(
      (p) => p.countryId.trim().toUpperCase() === country,
    );
    if (sameCountry) return sameCountry.id;
  }

  return ports[0]!.id;
}
