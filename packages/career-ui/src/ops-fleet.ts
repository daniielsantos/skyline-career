/**
 * Dual-tenant ops fleet for Prepare / Accept surfaces.
 * Home chrome stays sticky; VA tails are available in pickers when the pilot
 * is a member of a listed VA.
 */

import type { PlayerAircraft } from './api.js';

export type OpsFleetOwner = 'home' | 'va';

export type OpsFleetEntry = {
  aircraft: PlayerAircraft;
  owner: OpsFleetOwner;
};

/** Match VA hangar / shared `VA_AIRCRAFT_RESERVE_TTL_MS` (4h). */
export const OPS_AIRCRAFT_RESERVE_TTL_MS = 4 * 60 * 60 * 1000;

export function isOpsAircraftReservationActive(
  aircraft: PlayerAircraft,
  nowMs: number = Date.now(),
): boolean {
  const by = aircraft.reservedByAccountId?.trim();
  const at = aircraft.reservedAtMs;
  if (!by) return false;
  if (at == null || !(at > 0)) return true;
  return nowMs - at < OPS_AIRCRAFT_RESERVE_TTL_MS;
}

/**
 * Manifest / Prepare picker: hide tails reserved by another pilot.
 * Owner of the VA may still select (server also bypasses).
 */
export function isOpsAircraftBlockedByReservation(
  aircraft: PlayerAircraft,
  opts: {
    accountId?: string | null;
    isVaOwner?: boolean;
    nowMs?: number;
  } = {},
): boolean {
  const nowMs = opts.nowMs ?? Date.now();
  if (!isOpsAircraftReservationActive(aircraft, nowMs)) return false;
  if (opts.isVaOwner === true) return false;
  const actor = opts.accountId?.trim() ?? '';
  const holder = aircraft.reservedByAccountId!.trim();
  if (actor && actor === holder) return false;
  return true;
}

export function filterOpsFleetForPrepare(
  entries: OpsFleetEntry[],
  opts: {
    accountId?: string | null;
    isVaOwner?: boolean;
    nowMs?: number;
  } = {},
): OpsFleetEntry[] {
  return entries.filter((e) => {
    // Owner bypass only applies to VA tails; home is always the pilot's.
    const isVaOwner = opts.isVaOwner === true && e.owner === 'va';
    return !isOpsAircraftBlockedByReservation(e.aircraft, {
      accountId: opts.accountId,
      isVaOwner,
      nowMs: opts.nowMs,
    });
  });
}

export function buildOpsFleet(
  homeFleet: PlayerAircraft[],
  vaFleet: PlayerAircraft[],
): OpsFleetEntry[] {
  const out: OpsFleetEntry[] = [];
  const seen = new Set<string>();
  for (const aircraft of homeFleet) {
    const id = aircraft.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ aircraft, owner: 'home' });
  }
  for (const aircraft of vaFleet) {
    const id = aircraft.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ aircraft, owner: 'va' });
  }
  return out;
}

export function opsFleetAircraft(entries: OpsFleetEntry[]): PlayerAircraft[] {
  return entries.map((e) => e.aircraft);
}

export function findOpsEntry(
  entries: OpsFleetEntry[],
  aircraftId: string | null | undefined,
): OpsFleetEntry | null {
  const id = aircraftId?.trim();
  if (!id) return null;
  return entries.find((e) => e.aircraft.id === id) ?? null;
}

/** Prefer parked at origin; else any parked (home or VA). */
export function pickOpsAircraftForOrigin(
  entries: OpsFleetEntry[],
  originIcao: string,
  preferId?: string | null,
): OpsFleetEntry | null {
  const origin = originIcao.trim().toUpperCase();
  const parked = entries.filter((e) => e.aircraft.status === 'parked');
  if (preferId) {
    const named = parked.find((e) => e.aircraft.id === preferId.trim());
    if (named) return named;
  }
  const atOrigin = parked.find(
    (e) => e.aircraft.locationIcao.trim().toUpperCase() === origin,
  );
  if (atOrigin) return atOrigin;
  return parked[0] ?? null;
}

export function opsAircraftSelectLabel(
  entry: OpsFleetEntry,
  originIcao: string,
): string {
  const { aircraft, owner } = entry;
  const prefix = owner === 'va' ? 'VA' : 'Yours';
  const atOrigin =
    aircraft.status === 'parked' &&
    aircraft.locationIcao.trim().toUpperCase() ===
      originIcao.trim().toUpperCase();
  const loc = atOrigin
    ? `@ ${aircraft.locationIcao}`
    : `ferry from ${aircraft.locationIcao}`;
  return `${prefix} · ${aircraft.label} · ${loc}`;
}
