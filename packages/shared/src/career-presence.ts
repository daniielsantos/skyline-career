/**
 * Lightweight MP presence: ring-buffer of player-visible world actions.
 * Not a chat feed — just enough for “who else is on this world?”.
 */

import type {
  CareerEconomyWorld,
  PresenceEvent,
  PresenceEventKind,
} from './types/career-economy.js';

export type { PresenceEvent, PresenceEventKind };

export const PRESENCE_LOG_MAX = 30;

export function ensurePresenceLog(
  world: CareerEconomyWorld,
): PresenceEvent[] {
  if (!Array.isArray(world.presenceLog)) {
    world.presenceLog = [];
  }
  return world.presenceLog;
}

export function listPresenceEvents(
  world: CareerEconomyWorld,
  limit = PRESENCE_LOG_MAX,
): PresenceEvent[] {
  const log = ensurePresenceLog(world);
  const n = Math.max(0, Math.min(PRESENCE_LOG_MAX, Math.floor(limit)));
  if (n <= 0) return [];
  return log.slice(-n).reverse();
}

export function pushPresenceEvent(
  world: CareerEconomyWorld,
  event: Omit<PresenceEvent, 'id'> & { id?: string },
): PresenceEvent {
  const log = ensurePresenceLog(world);
  const row: PresenceEvent = {
    id:
      event.id?.trim() ||
      `pres_${event.atTick}_${event.kind}_${event.companyId}_${log.length}`,
    kind: event.kind,
    atTick: event.atTick,
    atMs: event.atMs,
    companyId: event.companyId,
    companyDisplayName: event.companyDisplayName.trim() || event.companyId,
    summary: event.summary.trim() || event.kind,
  };
  log.push(row);
  while (log.length > PRESENCE_LOG_MAX) {
    log.shift();
  }
  return row;
}
