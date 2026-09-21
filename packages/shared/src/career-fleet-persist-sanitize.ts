/**
 * Harden fleet replace/insert: PK on fleet_aircraft.id is global (PG + SQLite).
 * Pulse settle must not die on duplicate ids in RAM or ids owned by another company.
 */

import type { PlayerAircraft } from './types/career-economy.js';

export type FleetPersistSanitizeResult = {
  kept: PlayerAircraft[];
  droppedDuplicateIds: string[];
  droppedForeign: Array<{ id: string; ownerCompanyId: string }>;
};

/**
 * Last row wins for duplicate ids. Skip ids owned by another company.
 */
export function sanitizeFleetForPersist(
  fleet: readonly PlayerAircraft[],
  foreignOwners: ReadonlyMap<string, string> = new Map(),
): FleetPersistSanitizeResult {
  const byId = new Map<string, PlayerAircraft>();
  const seenOnce = new Set<string>();
  const droppedDuplicateIds: string[] = [];
  for (const row of fleet) {
    const id = row.id?.trim();
    if (!id) continue;
    if (seenOnce.has(id)) droppedDuplicateIds.push(id);
    seenOnce.add(id);
    byId.set(id, row);
  }
  const droppedForeign: Array<{ id: string; ownerCompanyId: string }> = [];
  const kept: PlayerAircraft[] = [];
  for (const [id, row] of byId) {
    const owner = foreignOwners.get(id)?.trim();
    if (owner) {
      droppedForeign.push({ id, ownerCompanyId: owner });
      continue;
    }
    kept.push(row);
  }
  return { kept, droppedDuplicateIds, droppedForeign };
}

export function logFleetPersistSanitized(
  companyId: string,
  result: FleetPersistSanitizeResult,
): void {
  if (result.droppedDuplicateIds.length > 0) {
    const uniq = [...new Set(result.droppedDuplicateIds)];
    console.warn(
      `[career] fleet persist deduped company=${companyId} ids=${uniq.join(',')}`,
    );
  }
  if (result.droppedForeign.length > 0) {
    console.warn(
      `[career] fleet persist skipped foreign hulls company=${companyId} ` +
        result.droppedForeign
          .map((row) => `${row.id}@${row.ownerCompanyId}`)
          .join(','),
    );
  }
}
