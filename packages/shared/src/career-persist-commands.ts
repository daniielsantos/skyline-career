/**
 * Career persist commands — one business action, idempotent, ready for SQL later.
 * Pure rules stay in mission/market; callers must not double-pay or double-reserve.
 */

import {
  purchaseAircraftListing,
  type AircraftAcquireOpts,
} from './career-aircraft-market.js';
import { applyWalletDelta } from './career-ledger.js';
import { normalizeAircraftRegistration } from './career-aircraft-registration.js';
import { releaseCompanyCrewFromMission } from './career-crew.js';
import {
  acceptMission,
  cancelMission,
  commitStagedManifest,
  departMission,
  settleMission,
  type DepartMissionResult,
  type StagedManifestLine,
  type SettleMissionOpts,
  type SettleMissionResult,
} from './career-mission.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  FreighterClassId,
  MissionIntent,
  MissionSettlement,
  PlayerAircraft,
} from './types/career-economy.js';

export type CareerWriteHousekeeping = {
  /** Crew due + orphan cancel. Off on command hot paths. */
  housekeeping?: boolean;
};

function isOpenMissionStatus(status: MissionIntent['status']): boolean {
  return (
    status === 'accepted' ||
    status === 'dispatched' ||
    status === 'in_flight'
  );
}

function upsertCompanyMission(
  missions: CareerMissionsState,
  mission: MissionIntent,
): void {
  const idx = missions.missions.findIndex((row) => row.id === mission.id);
  if (idx >= 0) missions.missions[idx] = mission;
  else missions.missions.push(mission);
}

function missionHoldsLotIds(mission: MissionIntent, lotIds: string[]): boolean {
  const have = new Set(
    (mission.lots ?? []).map((line) => line.shipmentLotId).filter(Boolean),
  );
  return lotIds.every((id) => have.has(id));
}

function findOpenMissionHoldingLots(
  missions: CareerMissionsState,
  lotIds: string[],
): MissionIntent | undefined {
  const ids = lotIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return undefined;
  return missions.missions.find(
    (row) => isOpenMissionStatus(row.status) && missionHoldsLotIds(row, ids),
  );
}

function fleetAircraftForListing(
  missions: CareerMissionsState,
  world: CareerEconomyWorld,
  listingId: string,
): PlayerAircraft | undefined {
  const inst = world.aircraftInstances?.find((row) => row.id === listingId);
  const instReg = normalizeAircraftRegistration(inst?.registration);
  if (instReg) {
    const owned = missions.fleet.find(
      (row) => normalizeAircraftRegistration(row.registration) === instReg,
    );
    if (owned) return owned;
  }
  const listing = missions.aircraftMarket?.find((row) => row.id === listingId);
  const listReg = normalizeAircraftRegistration(listing?.registration);
  if (listReg && listing?.status === 'sold') {
    return missions.fleet.find(
      (row) => normalizeAircraftRegistration(row.registration) === listReg,
    );
  }
  return undefined;
}

function settlementFromSettledMission(mission: MissionIntent): MissionSettlement {
  const lateTicks = mission.lateTicks ?? 0;
  const payoutUsd = mission.payoutUsd ?? 0;
  const penaltyUsd = mission.penaltyUsd ?? 0;
  return {
    missionId: mission.id,
    deliveredKg: mission.cargoKg,
    payoutUsd,
    penaltyUsd,
    lateTicks,
    onTime: lateTicks === 0,
    originStockAfterKg: 0,
    destStockAfterKg: 0,
    ...(typeof mission.settledWeatherBonusUsd === 'number' &&
    Number.isFinite(mission.settledWeatherBonusUsd) &&
    mission.settledWeatherBonusUsd > 0
      ? { weatherBonusUsd: mission.settledWeatherBonusUsd }
      : {}),
    ...(mission.settledRunwayTouch
      ? { runwayTouch: mission.settledRunwayTouch }
      : {}),
  };
}

export function applySettleWalletDeltas(
  missions: CareerMissionsState,
  atTick: number,
  result: SettleMissionResult,
): void {
  const mission = result.mission;
  if (result.walletCreditUsd > 0) {
    applyWalletDelta(missions, {
      amountUsd: result.walletCreditUsd,
      kind: mission.demandOrderId ? 'demand_payout' : 'freight_payout',
      atTick,
      missionId: mission.id,
      icao: mission.destIcao,
      note: mission.contractPilot
        ? `Contract pilot · ${mission.originIcao}→${mission.destIcao}`
        : mission.demandOrderId
          ? `Demand · ${mission.originIcao}→${mission.destIcao}`
          : `${mission.originIcao}→${mission.destIcao}`,
    });
  }
  if (result.fuelDebitUsd > 0) {
    applyWalletDelta(missions, {
      amountUsd: -result.fuelDebitUsd,
      kind: 'fuel',
      atTick,
      missionId: mission.id,
      icao: mission.destIcao,
      note: 'settlement fuel',
    });
  }
}

export type ExecuteSettleFlightOpts = SettleMissionOpts & {
  missionId: string;
};

export type ExecuteSettleFlightResult =
  | { kind: 'missing' }
  | { kind: 'closed' }
  | { kind: 'replay'; result: SettleMissionResult }
  | { kind: 'applied'; result: SettleMissionResult };

/**
 * SettleFlight: pay once. Replay if the mission is already `settled`.
 */
export function executeSettleFlight(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  opts: ExecuteSettleFlightOpts,
): ExecuteSettleFlightResult {
  const idx = missions.missions.findIndex((m) => m.id === opts.missionId);
  if (idx < 0) return { kind: 'missing' };
  const open = missions.missions[idx]!;
  if (open.status === 'cancelled' || open.status === 'failed') {
    return { kind: 'closed' };
  }
  if (open.status === 'settled') {
    const settlement = settlementFromSettledMission(open);
    return {
      kind: 'replay',
      result: {
        mission: open,
        settlement,
        walletCreditUsd: 0,
        fuelDebitUsd: 0,
      },
    };
  }
  const { missionId: _id, ...settleOpts } = opts;
  const result = settleMission(world, open, {
    ...settleOpts,
    fleet: settleOpts.fleet ?? missions,
  });
  missions.missions[idx] = result.mission;
  applySettleWalletDeltas(missions, world.tick, result);
  return { kind: 'applied', result };
}

export type ExecuteAcceptLotOpts = {
  lotId: string;
  cargoKg?: number;
  aircraftClassId?: FreighterClassId;
  missionId?: string;
  intoMissionId?: string;
  maxCargoKg?: number;
  cargoOps?: CareerMissionsState['cargoOps'];
  classOps?: CareerMissionsState['classOps'];
};

export type ExecuteAcceptLotResult =
  | { kind: 'missing_lot' }
  | { kind: 'missing_mission' }
  | { kind: 'replay'; mission: MissionIntent; appended: boolean }
  | { kind: 'applied'; mission: MissionIntent; appended: boolean };

/**
 * AcceptLot: reserve once. Replay if this company already holds the lot on an open flight.
 */
export function executeAcceptLot(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  opts: ExecuteAcceptLotOpts,
): ExecuteAcceptLotResult {
  const lotId = opts.lotId.trim();
  const lot = world.lots.find((row) => row.id === lotId);
  if (!lot) return { kind: 'missing_lot' };

  let intoMission: MissionIntent | undefined;
  if (opts.intoMissionId) {
    intoMission = missions.missions.find((row) => row.id === opts.intoMissionId);
    if (!intoMission) return { kind: 'missing_mission' };
  }

  const holding = findOpenMissionHoldingLots(missions, [lotId]);
  if (holding) {
    return { kind: 'replay', mission: holding, appended: holding.lots.length > 1 };
  }

  const beforeLots = intoMission?.lots.length ?? 0;
  const mission = acceptMission(world, {
    lotId,
    cargoKg: opts.cargoKg,
    aircraftClassId: opts.aircraftClassId,
    missionId: opts.missionId,
    maxCargoKg: opts.maxCargoKg,
    intoMission,
    cargoOps: opts.cargoOps,
    classOps: opts.classOps,
  });
  const appended = Boolean(intoMission) && mission.lots.length > beforeLots;
  upsertCompanyMission(missions, mission);
  return { kind: 'applied', mission, appended };
}

export type ExecuteAcceptManifestOpts = {
  lines: StagedManifestLine[];
  aircraftClassId?: FreighterClassId;
  maxCargoKg?: number;
  intoMissionId?: string;
  missionId?: string;
  airframeTypeId?: string;
  cargoOps?: CareerMissionsState['cargoOps'];
  classOps?: CareerMissionsState['classOps'];
};

export type ExecuteAcceptManifestResult =
  | { kind: 'missing_mission' }
  | {
      kind: 'replay';
      mission: MissionIntent;
      appended: boolean;
      lineCount: number;
    }
  | {
      kind: 'applied';
      mission: MissionIntent;
      appended: boolean;
      lineCount: number;
    };

/**
 * AcceptLot (staging): reserve the staged lines once.
 */
export function executeAcceptManifest(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  opts: ExecuteAcceptManifestOpts,
): ExecuteAcceptManifestResult {
  const lotIds = opts.lines.map((line) => line.lotId.trim()).filter(Boolean);
  let intoMission: MissionIntent | undefined;
  if (opts.intoMissionId) {
    intoMission = missions.missions.find((row) => row.id === opts.intoMissionId);
    if (!intoMission) return { kind: 'missing_mission' };
    if (missionHoldsLotIds(intoMission, lotIds)) {
      return {
        kind: 'replay',
        mission: intoMission,
        appended: false,
        lineCount: intoMission.lots?.length ?? 0,
      };
    }
  }
  const holding = findOpenMissionHoldingLots(missions, lotIds);
  if (holding) {
    return {
      kind: 'replay',
      mission: holding,
      appended: false,
      lineCount: holding.lots?.length ?? 0,
    };
  }
  const staged = commitStagedManifest(world, {
    lines: opts.lines,
    aircraftClassId: opts.aircraftClassId,
    maxCargoKg: opts.maxCargoKg,
    intoMission,
    missionId: opts.missionId,
    airframeTypeId: opts.airframeTypeId,
    cargoOps: opts.cargoOps,
    classOps: opts.classOps,
  });
  upsertCompanyMission(missions, staged.mission);
  return {
    kind: 'applied',
    mission: staged.mission,
    appended: staged.appended,
    lineCount: staged.lineCount,
  };
}

export type ExecuteDepartFlightOpts = {
  missionId: string;
  nowMs?: number;
  distanceNm?: number;
  expectedRouteMs?: number;
};

export type ExecuteDepartFlightResult =
  | { kind: 'missing' }
  | { kind: 'closed' }
  | { kind: 'replay'; result: DepartMissionResult }
  | { kind: 'applied'; result: DepartMissionResult };

/**
 * DepartFlight: fuel debit once. Replay if already `in_flight`.
 */
export function executeDepartFlight(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  opts: ExecuteDepartFlightOpts,
): ExecuteDepartFlightResult {
  const idx = missions.missions.findIndex((row) => row.id === opts.missionId);
  if (idx < 0) return { kind: 'missing' };
  const open = missions.missions[idx]!;
  if (
    open.status === 'cancelled' ||
    open.status === 'failed' ||
    open.status === 'settled'
  ) {
    return { kind: 'closed' };
  }
  if (open.status === 'in_flight') {
    return {
      kind: 'replay',
      result: { mission: open, fuelDebitUsd: 0 },
    };
  }
  const result = departMission(world, open, {
    fleet: missions,
    nowMs: opts.nowMs,
    distanceNm: opts.distanceNm,
    expectedRouteMs: opts.expectedRouteMs,
  });
  missions.missions[idx] = result.mission;
  if (result.fuelDebitUsd > 0) {
    applyWalletDelta(missions, {
      amountUsd: -result.fuelDebitUsd,
      kind: 'fuel',
      atTick: world.tick,
      missionId: result.mission.id,
      icao: result.mission.originIcao,
      note: `${result.mission.originIcao}→${result.mission.destIcao}`,
    });
  }
  return { kind: 'applied', result };
}

export type ExecuteBuyAircraftOpts = AircraftAcquireOpts & {
  listingId: string;
};

export type ExecuteBuyAircraftResult =
  | { kind: 'unavailable' }
  | {
      kind: 'replay';
      aircraft: PlayerAircraft;
      debitUsd: number;
      deliveryFeeUsd: number;
    }
  | {
      kind: 'applied';
      aircraft: PlayerAircraft;
      debitUsd: number;
      deliveryFeeUsd: number;
    };

/**
 * BuyAircraft: wallet + instance sold once. Replay if this company already owns the casco.
 */
export function executeBuyAircraft(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  opts: ExecuteBuyAircraftOpts,
): ExecuteBuyAircraftResult {
  const listingId = opts.listingId.trim();
  const owned = fleetAircraftForListing(missions, world, listingId);
  if (owned) {
    return {
      kind: 'replay',
      aircraft: owned,
      debitUsd: 0,
      deliveryFeeUsd: 0,
    };
  }
  try {
    const purchased = purchaseAircraftListing(missions, world, listingId, {
      deliver: opts.deliver,
      ...(typeof opts.deliverToIcao === 'string'
        ? { deliverToIcao: opts.deliverToIcao }
        : {}),
    });
    return {
      kind: 'applied',
      aircraft: purchased.aircraft,
      debitUsd: purchased.debitUsd,
      deliveryFeeUsd: purchased.deliveryFeeUsd,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not available/i.test(message)) {
      return { kind: 'unavailable' };
    }
    throw error;
  }
}

export type ExecuteCancelMissionOpts = {
  missionId: string;
  nowMs?: number;
};

export type ExecuteCancelMissionResult =
  | { kind: 'missing' }
  | { kind: 'closed' }
  | { kind: 'replay'; mission: MissionIntent }
  | { kind: 'applied'; mission: MissionIntent };

/**
 * CancelMission: release lots/tail once. Replay if already `cancelled`.
 */
export function executeCancelMission(
  world: CareerEconomyWorld,
  missions: CareerMissionsState,
  opts: ExecuteCancelMissionOpts,
): ExecuteCancelMissionResult {
  const idx = missions.missions.findIndex((row) => row.id === opts.missionId);
  if (idx < 0) return { kind: 'missing' };
  const open = missions.missions[idx]!;
  if (open.status === 'settled' || open.status === 'failed') {
    return { kind: 'closed' };
  }
  if (open.status === 'cancelled') {
    return { kind: 'replay', mission: open };
  }
  const cancelled = cancelMission(world, open, {
    fleet: missions,
    nowMs: opts.nowMs,
  });
  if (open.crewOperated || open.crewMemberId) {
    releaseCompanyCrewFromMission(missions, cancelled.id);
  }
  missions.missions[idx] = cancelled;
  return { kind: 'applied', mission: cancelled };
}
