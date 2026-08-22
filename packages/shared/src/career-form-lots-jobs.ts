/**
 * Deterministic country job split / lot merge for formLots.
 * Workers (later) fill lotsByCountry; main flushes in listWorldCountryIds order.
 */

import type { ShipmentLot } from './types/career-economy.js';

/** Round-robin country ids across N workers. Empty workerCount → one bucket. */
export function splitCountryJobs(
  countryIds: readonly string[],
  workerCount: number,
): string[][] {
  const n = Math.max(1, Math.floor(workerCount) || 1);
  const buckets: string[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < countryIds.length; i++) {
    buckets[i % n]!.push(countryIds[i]!);
  }
  return buckets;
}

/** Concatenate per-country lot buffers in the same order as sequential formLots. */
export function mergeLotsByCountryOrder(
  countryIds: readonly string[],
  lotsByCountry: ReadonlyMap<string, readonly ShipmentLot[]>,
): ShipmentLot[] {
  const out: ShipmentLot[] = [];
  for (const id of countryIds) {
    const rows = lotsByCountry.get(id);
    if (rows && rows.length > 0) out.push(...rows);
  }
  return out;
}
