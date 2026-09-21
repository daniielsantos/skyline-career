/**
 * Company session settlement — passive fees between economy ticks (SP catch-up + MP login).
 */

import type { CareerEconomyWorld, CareerMissionsState } from './types/career-economy.js';
import {
  buildOfflineFeeSummary,
  effectiveFeeTickRange,
  type OfflineFeeSummary,
} from './career-offline-fees.js';
import { listAircraftMarket, settleAircraftMarketOps } from './career-aircraft-market.js';
import { settleCompanyCredit } from './career-company-credit.js';
import { settleCrewDailyOps, settleCrewOpsDue } from './career-crew.js';
import { settleFboOps } from './career-fbo.js';
import { settleGroundStaffDailyOps } from './career-ground-staff.js';
import { settleHangarParkingFees } from './career-hangar-fees.js';
import { tickPortAutoBuyOrders } from './career-port-auto-buy.js';
import { tickPortConcessions } from './career-port-concessions.js';
import { settlePortYardHoldFees } from './career-ports.js';
import {
  settleWarehouseInboundTransfers,
  settleWarehouseStorageFees,
} from './career-warehouse.js';
import { listCompaniesForWorld } from './career-companies.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { finalizeStuckNpcFerries } from './career-va-line-crew.js';
import { finalizeAircraftOverhaulsDue } from './career-aircraft-overhaul.js';
import {
  assembleMissionsFromTables,
  persistCompanyTables,
  persistLedgerIncremental,
  type SqliteDb,
} from './career-store-v3.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';

/** Resolve billing window: persisted watermark, else legacy catch-up anchor. */
export function companySessionFromTick(
  missions: Pick<CareerMissionsState, 'lastSeenTick'>,
  fallbackFromTick: number,
  _toTick: number,
): number {
  const persisted =
    typeof missions.lastSeenTick === 'number' && Number.isFinite(missions.lastSeenTick)
      ? missions.lastSeenTick
      : undefined;
  return Math.max(0, Math.floor(persisted ?? fallbackFromTick));
}

/** Shift crew-operated airborne clocks when economy is force-advanced. */
export function applyEconomyAdvanceToCrewAirborne(
  missions: CareerMissionsState,
  economyAdvanceMs: number,
): void {
  const advanceMs = Math.max(0, Math.floor(economyAdvanceMs));
  if (advanceMs <= 0) return;
  for (const mission of missions.missions) {
    if (
      mission.crewOperated === true &&
      mission.status === 'in_flight' &&
      typeof mission.airborneAtMs === 'number' &&
      Number.isFinite(mission.airborneAtMs)
    ) {
      mission.airborneAtMs = Math.max(0, mission.airborneAtMs - advanceMs);
    }
  }
}

/**
 * Bill passive company fees for [fromTick, toTick) and run wall-clock crew ops due.
 * Mutates missions (wallet, lease, crew) in place.
 */
export function settleCompanyPassiveFeesForTickRange(
  missions: CareerMissionsState,
  world: CareerEconomyWorld,
  fromTick: number,
  toTick: number,
  nowMs = Date.now(),
): OfflineFeeSummary | null {
  const from = Math.max(0, Math.floor(fromTick));
  const to = Math.max(from, Math.floor(toTick));
  if (to <= from) return null;

  const feeRange = effectiveFeeTickRange(from, to);
  // Same economy day: no hangar/salary/credit window. Still keep ferries/crew
  // wall-clock healthy without running port auto-buy for every +Nd chunk.
  if (feeRange.daysCrossed <= 0) {
    settleCrewOpsDue(missions, world, nowMs);
    listAircraftMarket(missions, world);
    finalizeStuckNpcFerries(missions, to);
    finalizeAircraftOverhaulsDue(missions, to);
    return null;
  }

  const leaseOps = settleAircraftMarketOps(missions, world.tick, world, {
    maxInstallments: feeRange.capped ? 1 : undefined,
    deferTermRepossess: feeRange.capped,
  });
  const hangarOps = settleHangarParkingFees(missions, world, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  const fboOps = settleFboOps(missions, world, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  const whOps = settleWarehouseStorageFees(missions, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  const yardOps = settlePortYardHoldFees(missions, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  const crewDaily = settleCrewDailyOps(missions, world, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  const groundStaffDaily = settleGroundStaffDailyOps(missions, world, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  const creditOps = settleCompanyCredit(missions, {
    fromTick: feeRange.fromTick,
    toTick: feeRange.toTick,
  });
  // Hygiene must not block the watermark — a throw here used to re-bill the
  // same day on the next +Nd chunk.
  try {
    settleWarehouseInboundTransfers(missions, world);
    tickPortConcessions(missions, world);
    tickPortAutoBuyOrders(missions, world);
  } catch (error) {
    console.error(
      '[career] company passive hygiene skipped:',
      error instanceof Error ? error.message : error,
    );
  }
  settleCrewOpsDue(missions, world, nowMs);
  listAircraftMarket(missions, world);
  finalizeStuckNpcFerries(missions, to);
  finalizeAircraftOverhaulsDue(missions, to);

  const passiveDebitUsd =
    hangarOps.debitUsd +
    (fboOps.storage?.debitUsd ?? 0) +
    whOps.debitUsd +
    yardOps.debitUsd +
    (crewDaily.salary?.debitUsd ?? 0) +
    (groundStaffDaily.salary?.debitUsd ?? 0) +
    (groundStaffDaily.vaLineCrewSalary?.debitUsd ?? 0) +
    (groundStaffDaily.baseDispatcherSalary?.debitUsd ?? 0) +
    creditOps.interestPaidUsd;

  return buildOfflineFeeSummary({
    feeRange,
    passiveDebitUsd,
    debitUsdByKind: {
      hangar: hangarOps.debitUsd,
      warehouse: whOps.debitUsd,
      yard: yardOps.debitUsd,
      fboStorage: fboOps.storage?.debitUsd ?? 0,
      crewSalary: crewDaily.salary?.debitUsd ?? 0,
      groundStaffSalary:
        (groundStaffDaily.salary?.debitUsd ?? 0) +
        (groundStaffDaily.baseDispatcherSalary?.debitUsd ?? 0),
    },
    lease: {
      installmentsPaid: leaseOps.installmentsPaid,
      overdueIds: leaseOps.overdueIds,
      termEndedSoftIds: leaseOps.termEndedSoft,
      repossessedIds: leaseOps.repossessed,
    },
  });
}

/**
 * Pulse settle-all: bill every company on the world independently.
 * Returns the preferred company's summary (for SP offline-fee banner).
 */
export function settleAllCompaniesPassiveFees(opts: {
  db: SqliteDb;
  world: CareerEconomyWorld;
  fromTick: number;
  toTick: number;
  worldId?: string;
  preferCompanyId?: string;
  nowMs?: number;
  /** Wall-clock shift for crew-operated airborne legs (debug +Nd). */
  economyAdvanceMs?: number;
}): OfflineFeeSummary | null {
  const worldId = (opts.worldId ?? LOCAL_WORLD_ID).trim() || LOCAL_WORLD_ID;
  const companies = listCompaniesForWorld(opts.db, worldId);
  if (companies.length === 0) return null;
  const nowMs = opts.nowMs ?? Date.now();
  const prefer = opts.preferCompanyId?.trim() || undefined;
  let preferred: OfflineFeeSummary | null = null;
  for (const company of companies) {
    try {
      const missions = assembleMissionsFromTables(
        opts.db,
        emptyMissionsStateV2(),
        company.id,
      );
      try {
        if (opts.economyAdvanceMs) {
          applyEconomyAdvanceToCrewAirborne(missions, opts.economyAdvanceMs);
        }
        const fromTick = companySessionFromTick(
          missions,
          opts.fromTick,
          opts.toTick,
        );
        const summary = settleCompanyPassiveFeesForTickRange(
          missions,
          opts.world,
          fromTick,
          opts.toTick,
          nowMs,
        );
        if (summary && prefer && company.id === prefer) {
          preferred = summary;
        }
      } finally {
        // Always advance watermark after an attempt so a mid-settle throw
        // cannot re-bill the same day on the next +Nd chunk.
        missions.lastSeenTick = Math.max(0, Math.floor(opts.toTick));
        persistCompanyTables(opts.db, missions, { companyId: company.id });
        persistLedgerIncremental(opts.db, missions.ledger ?? [], company.id);
      }
    } catch (error) {
      console.error(
        `[career] pulse company settle skipped company=${company.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  // Never surface another tenant's offline banner on the active company.
  return preferred;
}
