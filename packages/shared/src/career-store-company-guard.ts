/**
 * Guard: refuse persisting an empty company shell over existing progress.
 * Prevents ambient thrash / bad hydrate from DELETE+INSERT wiping wallet/fleet/ledger.
 */

import type { CareerMissionsState } from './types/career-economy.js';

export type CompanyProgressCounts = {
  walletUsd: number;
  fleetCount: number;
  ledgerCount: number;
  missionCount: number;
  /** Existing fleet row ids (when known). */
  fleetIds?: string[];
  /** Incoming fleet row ids (when known). */
  incomingFleetIds?: string[];
};

export function companyProgressFromState(
  state: Pick<
    CareerMissionsState,
    'walletUsd' | 'fleet' | 'ledger' | 'missions'
  >,
): CompanyProgressCounts {
  return {
    walletUsd:
      typeof state.walletUsd === 'number' && Number.isFinite(state.walletUsd)
        ? state.walletUsd
        : 0,
    fleetCount: state.fleet?.length ?? 0,
    ledgerCount: state.ledger?.length ?? 0,
    missionCount: state.missions?.length ?? 0,
    incomingFleetIds: (state.fleet ?? [])
      .map((a) => a.id?.trim())
      .filter((id): id is string => Boolean(id)),
  };
}

/** True when the payload looks like a fresh/empty company shell. */
export function isEmptyCompanyShell(counts: CompanyProgressCounts): boolean {
  return (
    counts.walletUsd <= 0 &&
    counts.fleetCount === 0 &&
    counts.ledgerCount === 0 &&
    counts.missionCount === 0
  );
}

export function existingCompanyHasProgress(
  counts: CompanyProgressCounts,
): boolean {
  return (
    counts.walletUsd > 0 ||
    counts.fleetCount > 0 ||
    counts.ledgerCount > 0 ||
    counts.missionCount > 0
  );
}

/**
 * Refuse overwrite when existing progress would be replaced by an empty shell,
 * or when fleet/ledger would be cleared while the other side still has rows
 * (partial wipe that still destroys career history).
 */
export function assertCompanyPersistSafe(opts: {
  companyId: string;
  existing: CompanyProgressCounts;
  incoming: CompanyProgressCounts;
}): void {
  const { companyId, existing, incoming } = opts;
  if (!existingCompanyHasProgress(existing)) return;

  if (isEmptyCompanyShell(incoming)) {
    throw new Error(
      `Refusing to overwrite company ${companyId} progress with empty shell ` +
        `(had wallet=${existing.walletUsd} fleet=${existing.fleetCount} ` +
        `ledger=${existing.ledgerCount} missions=${existing.missionCount})`,
    );
  }

  if (existing.fleetCount > 0 && incoming.fleetCount === 0) {
    throw new Error(
      `Refusing to clear fleet for company ${companyId} ` +
        `(had ${existing.fleetCount} aircraft, incoming fleet empty)`,
    );
  }

  if (existing.ledgerCount > 0 && incoming.ledgerCount === 0) {
    throw new Error(
      `Refusing to clear ledger for company ${companyId} ` +
        `(had ${existing.ledgerCount} entries, incoming ledger empty)`,
    );
  }

  const existingIds = existing.fleetIds ?? [];
  const incomingIds = incoming.incomingFleetIds ?? [];
  if (
    existingIds.length > 0 &&
    incomingIds.length > 0 &&
    !existingIds.some((id) => incomingIds.includes(id))
  ) {
    throw new Error(
      `Refusing to replace entire fleet identity for company ${companyId} ` +
        `(had ids [${existingIds.join(', ')}], incoming [${incomingIds.join(', ')}])`,
    );
  }
}
