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
import { settleCrewDailyOps, settleCrewOpsDue } from './career-crew.js';
import { settleFboOps } from './career-fbo.js';
import { settleGroundStaffDailyOps } from './career-ground-staff.js';
import { settleHangarParkingFees } from './career-hangar-fees.js';
import { settlePortYardHoldFees } from './career-ports.js';
import { settleWarehouseStorageFees } from './career-warehouse.js';

/** Resolve billing window: persisted watermark, else legacy catch-up anchor. */
export function companySessionFromTick(
  missions: Pick<CareerMissionsState, 'lastSeenTick'>,
  fallbackFromTick: number,
  toTick: number,
): number {
  const persisted =
    typeof missions.lastSeenTick === 'number' && Number.isFinite(missions.lastSeenTick)
      ? missions.lastSeenTick
      : undefined;
  return Math.max(0, Math.floor(persisted ?? fallbackFromTick));
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
  settleCrewOpsDue(missions, world, nowMs);
  listAircraftMarket(missions, world);

  const passiveDebitUsd =
    hangarOps.debitUsd +
    (fboOps.storage?.debitUsd ?? 0) +
    whOps.debitUsd +
    yardOps.debitUsd +
    (crewDaily.salary?.debitUsd ?? 0) +
    (groundStaffDaily.salary?.debitUsd ?? 0);

  return buildOfflineFeeSummary({
    feeRange,
    passiveDebitUsd,
    debitUsdByKind: {
      hangar: hangarOps.debitUsd,
      warehouse: whOps.debitUsd,
      yard: yardOps.debitUsd,
      fboStorage: fboOps.storage?.debitUsd ?? 0,
      crewSalary: crewDaily.salary?.debitUsd ?? 0,
      groundStaffSalary: groundStaffDaily.salary?.debitUsd ?? 0,
    },
    lease: {
      installmentsPaid: leaseOps.installmentsPaid,
      overdueIds: leaseOps.overdueIds,
      termEndedSoftIds: leaseOps.termEndedSoft,
      repossessedIds: leaseOps.repossessed,
    },
  });
}
