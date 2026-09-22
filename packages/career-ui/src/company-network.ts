import type { PortsSnapshot } from './api';

export type CompanyNetworkNode = {
  id: string;
  kind: 'fbo' | 'wh';
  title: string;
  subtitle: string;
  portId: string | null;
  hubIcaos: string[];
  primaryHubIcao: string;
  lat: number;
  lon: number;
  level: number | null;
  freeKg: number | null;
  capacityKg: number | null;
};

function formatMassKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

function hasCoords(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  );
}

function asCoordPair(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } | null {
  if (!hasCoords(lat, lon)) return null;
  return { lat, lon: lon as number };
}

/**
 * Company logistics network: Port FBOs you operate + WHs outside those ports.
 * Used by My VA Hauls + Ports FBO focus so members see the VA footprint.
 */
export function buildCompanyNetworkNodes(
  snap: PortsSnapshot,
  companyId: string,
): CompanyNetworkNode[] {
  const cid = companyId.trim();
  const warehouses = snap.warehouses?.warehouses ?? [];
  const whByIcao = new Map(
    warehouses.map((w) => [w.icao.trim().toUpperCase(), w] as const),
  );

  const fboPorts = (snap.ports ?? []).filter((p) => {
    const st = p.concession?.status;
    if (st === 'yours') return true;
    const op = p.concession?.companyId?.trim();
    return Boolean(op && cid && op === cid);
  });

  const hubsCoveredByFbo = new Set<string>();
  const nodes: CompanyNetworkNode[] = [];

  for (const port of fboPorts) {
    const hubs = (port.pickupHubs ?? [])
      .map((h) => h.trim().toUpperCase())
      .filter(Boolean);
    for (const h of hubs) hubsCoveredByFbo.add(h);

    const details = port.pickupHubDetails ?? [];
    let primary =
      hubs.find((h) => whByIcao.has(h)) ?? hubs[0] ?? port.id.toUpperCase();
    // Prefer geographic port pin; hub details only if port coords missing.
    let lat = port.lat;
    let lon = port.lon;
    if (!hasCoords(lat, lon)) {
      const detail = details.find(
        (d) => d.icao.trim().toUpperCase() === primary,
      );
      if (detail && hasCoords(detail.lat, detail.lon)) {
        lat = detail.lat;
        lon = detail.lon;
      } else {
        continue;
      }
    }

    let freeKg = 0;
    let capacityKg = 0;
    let hasWh = false;
    for (const h of hubs) {
      const wh = whByIcao.get(h);
      if (!wh) continue;
      hasWh = true;
      freeKg += wh.freeKg ?? 0;
      capacityKg += wh.capacityKg ?? 0;
    }

    const level = port.concession?.level ?? null;
    const roomBit = hasWh
      ? `${formatMassKg(freeKg)} free / ${formatMassKg(capacityKg)}`
      : 'no WH at pickup yet';

    nodes.push({
      id: `fbo:${port.id.toUpperCase()}`,
      kind: 'fbo',
      title: port.name,
      subtitle: `Port FBO P${level ?? 1} · ${roomBit}`,
      portId: port.id,
      hubIcaos: hubs.length > 0 ? hubs : [primary],
      primaryHubIcao: primary,
      lat,
      lon,
      level,
      freeKg: hasWh ? freeKg : null,
      capacityKg: hasWh ? capacityKg : null,
    });
  }

  for (const wh of warehouses) {
    const icao = wh.icao.trim().toUpperCase();
    if (!icao || hubsCoveredByFbo.has(icao)) continue;

    const linked = (snap.ports ?? []).find((p) =>
      (p.pickupHubs ?? []).some((h) => h.trim().toUpperCase() === icao),
    );
    const detail = linked?.pickupHubDetails?.find(
      (d) => d.icao.trim().toUpperCase() === icao,
    );
    const coords = asCoordPair(
      detail?.lat ?? linked?.lat,
      detail?.lon ?? linked?.lon,
    );
    if (!coords) continue;

    nodes.push({
      id: `wh:${icao}`,
      kind: 'wh',
      title: icao,
      subtitle: `Warehouse · ${formatMassKg(wh.freeKg)} free / ${formatMassKg(wh.capacityKg)}${
        linked ? ` · ${linked.name}` : ''
      }`,
      portId: linked?.id ?? null,
      hubIcaos: [icao],
      primaryHubIcao: icao,
      lat: coords.lat,
      lon: coords.lon,
      level: null,
      freeKg: wh.freeKg,
      capacityKg: wh.capacityKg,
    });
  }

  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'fbo' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return nodes;
}

export function findNetworkNode(
  nodes: readonly CompanyNetworkNode[],
  id: string | null | undefined,
): CompanyNetworkNode | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/** null selected = whole network. */
export function hubInNetworkFocus(
  selected: CompanyNetworkNode | null,
  icao: string,
): boolean {
  if (!selected) return true;
  const code = icao.trim().toUpperCase();
  return selected.hubIcaos.includes(code);
}
