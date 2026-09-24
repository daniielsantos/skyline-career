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
    conc.throughputWindowKg = window;
    return window;
  }
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
    conc.throughputWindowKg = window;
  } else if (conc.throughputWindowDay == null) {
    conc.throughputWindowDay = day;
  }
  return window;
}

function creditOperator(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  portId: string,
  kg: number,
): void {
  const id = portId.trim().toUpperCase();
  const op = (world.portConcessions ?? []).find(
    (c) =>
      c.portId === id &&
      c.leasePaidThroughTick > world.tick &&
      Boolean(c.companyId),
  );
  if (!op) return;
  const conc = ensurePlayerPortConcessions(state).find(
    (c) =>
      c.portId === op.portId &&
      c.companyId === op.companyId &&
      c.leasePaidThroughTick > world.tick,
  );
  if (!conc) return;
  const add = Math.max(0, Math.floor(kg));
  if (add <= 0) return;
  conc.lifetimeThroughputKg = (conc.lifetimeThroughputKg ?? 0) + add;
  const window = alignThroughputWindow(conc, world.tick);
  window[0] = (window[0] ?? 0) + add;
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
  if (!portId) {
    portId = portIdForPickupHubBound(opts.originIcao)?.trim().toUpperCase() || '';
  }
  if (!portId) return;
  creditOperator(state, world, portId, add);
}
