/**
 * Career persist commands — one business action, idempotent, ready for SQL later.
 * Settle still uses in-memory settleMission; callers must not double-pay.
 */

import { applyWalletDelta } from './career-ledger.js';
import {
  settleMission,
  type SettleMissionOpts,
  type SettleMissionResult,
} from './career-mission.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  MissionIntent,
  MissionSettlement,
} from './types/career-economy.js';

export type CareerWriteHousekeeping = {
  /** Crew due + orphan cancel. Off on SettleFlight so parking brake is not extra work. */
  housekeeping?: boolean;
};

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
