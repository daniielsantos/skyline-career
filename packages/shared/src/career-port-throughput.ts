/**
 * Port FBO throughput credit on outbound settle.
 * Kept free of career-mission / career-ports imports (cycle break).
 */

import { portIdForPickupHubBound } from './career-port-corridor.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  PlayerPortConcession,
} from './types/career-economy.js';

const THROUGHPUT_WINDOW_DAYS = 7;

function economyDayIndex(tick: number): number {
  return Math.floor(Math.max(0, tick) / 96);
}

function ensurePlayerPortConcessions(
  state: CareerMissionsState,
): PlayerPortConcession[] {
  if (!Array.isArray(state.playerPortConcessions)) {
    state.playerPortConcessions = [];
  }
  return state.playerPortConcessions;
}

function alignThroughputWindow(
  conc: PlayerPortConcession,
  tick: number,
): number[] {
  const day = economyDayIndex(tick);
  let window = Array.isArray(conc.throughputWindowKg)
    ? conc.throughputWindowKg.map((n) =>
        Math.max(0, Math.floor(Number(n) || 0)),
      )
    : [];
  if (window.length !== THROUGHPUT_WINDOW_DAYS) {
    window = Array.from({ length: THROUGHPUT_WINDOW_DAYS }, () => 0);
    conc.throughputWindowDay = day;
  } else {
    const prev = conc.throughputWindowDay ?? day;
    const shift = day - prev;
    if (shift > 0) {
      if (shift >= THROUGHPUT_WINDOW_DAYS) {
        window = Array.from({ length: THROUGHPUT_WINDOW_DAYS }, () => 0);
      } else {
        window = [
          ...Array.from({ length: shift }, () => 0),
          ...window.slice(0, THROUGHPUT_WINDOW_DAYS - shift),
        ];
      }
      conc.throughputWindowDay = day;
    } else if (conc.throughputWindowDay == null) {
      conc.throughputWindowDay = day;
    }
  }
  // Always store the array we return. A same-day align used to hand back a
  // copy, so the settle added kg to that copy and the saved 7d stayed 0.
  conc.throughputWindowKg = window;
  return window;
}

function creditOperator(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  portId: string,
  kg: number,
): boolean {
  const id = portId.trim().toUpperCase();
  const op = (world.portConcessions ?? []).find(
    (c) =>
      c.portId.trim().toUpperCase() === id &&
      c.leasePaidThroughTick > world.tick &&
      Boolean(c.companyId?.trim()),
  );
  const rows = ensurePlayerPortConcessions(state).filter(
    (c) =>
      c.portId.trim().toUpperCase() === id &&
      c.leasePaidThroughTick > world.tick,
  );
  // World index is who occupies the port. Settle often runs on a snapshot
  // that never loaded that index (command slice / RAM before a Ports write).
  // The company JSON is the lease. Credit it when nobody else is published
  // as the operator. A rival in the index still blocks the credit.
  const conc = op
    ? rows.find((c) => c.companyId === op.companyId.trim())
    : rows.length === 1
      ? rows[0]
      : undefined;
  if (!conc) return false;
  const add = Math.max(0, Math.floor(kg));
  if (add <= 0) return false;
  conc.lifetimeThroughputKg = (conc.lifetimeThroughputKg ?? 0) + add;
  const window = alignThroughputWindow(conc, world.tick);
  window[0] = (window[0] ?? 0) + add;
  return true;
}

/**
 * Credit operator throughput when freight leaves a port pickup WH
 * (Demand settle / WH haul). No-op if origin is not a port desk hub or
 * this missions state is not the active operator.
 */
export function creditPortOperatorThroughputOnOutboundSettle(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    kg: number;
    demandOrderId?: string | null;
  },
): void {
  const add = Math.max(0, Math.floor(opts.kg));
  if (add <= 0) return;

  let portId = '';
  if (opts.demandOrderId?.trim()) {
    const order = (world.demandOrders ?? []).find(
      (o) => o.id === opts.demandOrderId!.trim(),
    );
    portId = order?.portId?.trim().toUpperCase() || '';
  }
  const originPort =
    portIdForPickupHubBound(opts.originIcao)?.trim().toUpperCase() || '';
  if (portId && creditOperator(state, world, portId, add)) return;
  if (originPort && originPort !== portId) {
    creditOperator(state, world, originPort, add);
  }
}
