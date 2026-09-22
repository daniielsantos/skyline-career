import type { CareerEconomyWorld, CareerMissionsState } from './types/career-economy.js';
import { CAREER_HUB_COORDS } from './career-economy.js';
import { getCareerPort, listCareerPorts } from './career-ports.js';
import {
  ensurePlayerWarehouses,
  warehouseUsedKg,
} from './career-warehouse.js';

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

function hubCoords(
  icao: string,
  world: CareerEconomyWorld,
): { lat: number; lon: number } | null {
  const code = icao.trim().toUpperCase();
  const fromTable = CAREER_HUB_COORDS[code];
  if (
    fromTable &&
    Number.isFinite(fromTable.lat) &&
    Number.isFinite(fromTable.lon)
  ) {
    return { lat: fromTable.lat, lon: fromTable.lon };
  }
  const ap = world.airports.find((a) => a.icao.toUpperCase() === code);
  if (
    ap &&
    typeof ap.lat === 'number' &&
    typeof ap.lon === 'number' &&
    Number.isFinite(ap.lat) &&
    Number.isFinite(ap.lon)
  ) {
    return { lat: ap.lat, lon: ap.lon };
  }
  return null;
}

/**
 * Lightweight company footprint (Port FBOs + remote WHs) from missions + peek
 * world — no portSnapshot / withCareerWrite. Used by My VA Hauls.
 */
export function buildCompanyNetworkNodesFromState(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  companyId: string,
): CompanyNetworkNode[] {
  const cid = companyId.trim();
  if (!cid) return [];
  const tick = world.tick;
  const warehouses = ensurePlayerWarehouses(state).warehouses;
  const whByIcao = new Map(
    warehouses.map((w) => [w.icao.trim().toUpperCase(), w] as const),
  );

  const activeConcs = (state.playerPortConcessions ?? []).filter(
    (c) =>
      c.companyId === cid &&
      typeof c.leasePaidThroughTick === 'number' &&
      c.leasePaidThroughTick > tick,
  );

  const nodes: CompanyNetworkNode[] = [];

  for (const conc of activeConcs) {
    const port =
      getCareerPort(conc.portId) ??
      listCareerPorts().find(
        (p) => p.id.toUpperCase() === conc.portId.trim().toUpperCase(),
      );
    if (!port) continue;

    const hubs = (port.pickupHubs ?? [])
      .map((h) => h.trim().toUpperCase())
      .filter(Boolean);
    const primary =
      hubs.find((h) => whByIcao.has(h)) ?? hubs[0] ?? port.id.toUpperCase();
    // Map pin = geographic port; hold filter still uses hubIcaos / primaryHubIcao.
    const coords =
      Number.isFinite(port.lat) && Number.isFinite(port.lon)
        ? { lat: port.lat, lon: port.lon }
        : hubCoords(primary, world);
    if (!coords) continue;

    let freeKg = 0;
    let capacityKg = 0;
    let hasWh = false;
    for (const h of hubs) {
      const wh = whByIcao.get(h);
      if (!wh) continue;
      hasWh = true;
      const used = warehouseUsedKg(state, wh.id);
      freeKg += Math.max(0, wh.capacityKg - used);
      capacityKg += wh.capacityKg;
    }

    const level = conc.level ?? 1;
    const roomBit = hasWh
      ? `${formatMassKg(freeKg)} free / ${formatMassKg(capacityKg)}`
      : 'no WH at pickup yet';

    nodes.push({
      id: `fbo:${port.id.toUpperCase()}`,
      kind: 'fbo',
      title: port.name,
      subtitle: `Port FBO P${level} · ${roomBit}`,
      portId: port.id,
      hubIcaos: hubs.length > 0 ? hubs : [primary],
      primaryHubIcao: primary,
      lat: coords.lat,
      lon: coords.lon,
      level,
      freeKg: hasWh ? freeKg : null,
      capacityKg: hasWh ? capacityKg : null,
    });
  }

  const whIcaosAdded = new Set<string>();
  for (const wh of warehouses) {
    const icao = wh.icao.trim().toUpperCase();
    if (!icao || whIcaosAdded.has(icao)) continue;
    const coords = hubCoords(icao, world);
    if (!coords) continue;
    whIcaosAdded.add(icao);

    const linked = listCareerPorts().find((p) =>
      (p.pickupHubs ?? []).some((h) => h.trim().toUpperCase() === icao),
    );
    const used = warehouseUsedKg(state, wh.id);
    const freeKg = Math.max(0, wh.capacityKg - used);

    nodes.push({
      id: `wh:${icao}`,
      kind: 'wh',
      title: icao,
      subtitle: `Warehouse · ${formatMassKg(freeKg)} free / ${formatMassKg(wh.capacityKg)}${
        linked ? ` · ${linked.name}` : ''
      }`,
      portId: linked?.id ?? null,
      hubIcaos: [icao],
      primaryHubIcao: icao,
      lat: coords.lat,
      lon: coords.lon,
      level: null,
      freeKg,
      capacityKg: wh.capacityKg,
    });
  }

  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'fbo' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return nodes;
}
