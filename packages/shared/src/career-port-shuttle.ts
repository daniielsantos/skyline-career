/**
 * Port FBO shuttle — NPC flies WH→WH bridge only (costs, no freight pay).
 * Reuses crewOperated wall-clock settle; does not re-enable company Market crew.
 */

import { estimateMissionBlockHours } from './career-aircraft-market.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { routeDistanceNm } from './career-economy.js';
import { applyWalletDelta } from './career-ledger.js';
import { departMission, listActivePlayerMissions } from './career-mission.js';
import { isPortOperator } from './career-port-concessions.js';
import { careerPortIdForPickupHub } from './career-ports.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { dispatchWarehouseBridgeHold } from './career-warehouse-bridge.js';
import { findPlayerAircraft } from './career-fleet.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  FreighterClassId,
  MissionIntent,
} from './types/career-economy.js';

/** Product on — scoped bridge shuttle only. */
export const PORT_SHUTTLE_ENABLED = true;

/** Max simultaneous port-shuttle airborne legs. */
export const PORT_SHUTTLE_MAX_ACTIVE = 1;

/** Classes allowed (anti-snowball vs wide Demand). */
export const PORT_SHUTTLE_ALLOWED_CLASSES: readonly FreighterClassId[] = [
  'light_ga',
  'light_turboprop',
];

/** Floor fee USD. */
export const PORT_SHUTTLE_FEE_MIN_USD = 100;

/** $/kg component of shuttle fee. */
export const PORT_SHUTTLE_FEE_USD_PER_KG = 0.04;

/** $/nm component of shuttle fee. */
export const PORT_SHUTTLE_FEE_USD_PER_NM = 0.35;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function distanceNm(
  world: CareerEconomyWorld,
  from: string,
  to: string,
): number {
  return hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to) ?? 0;
}

export function quotePortShuttleFeeUsd(opts: {
  kg: number;
  distanceNm: number;
}): number {
  const kg = Math.max(0, opts.kg);
  const nm = Math.max(0, opts.distanceNm);
  return money(
    Math.max(
      PORT_SHUTTLE_FEE_MIN_USD,
      kg * PORT_SHUTTLE_FEE_USD_PER_KG + nm * PORT_SHUTTLE_FEE_USD_PER_NM,
    ),
  );
}

/** Quote fee for an existing bridge hold (UI preview). */
export function quotePortShuttleBridgeHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; companyId?: string },
): {
  holdId: string;
  originIcao: string;
  destIcao: string;
  kg: number;
  distanceNm: number;
  feeUsd: number;
  activeShuttles: number;
  maxActive: number;
} {
  if (!PORT_SHUTTLE_ENABLED) {
    throw new Error('Port shuttle is disabled');
  }
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const holds = state.playerWarehouses?.demandHolds ?? [];
  const hold = holds.find((h) => h.id === opts.holdId.trim());
  if (!hold || (hold.kind ?? 'demand') !== 'bridge') {
    throw new Error('Bridge hold not found');
  }
  const holdPilotPay =
    hold.pilotPayUsd != null
      ? hold.pilotPayUsd
      : hold.unitPriceUsd > 0
        ? Math.round(hold.unitPriceUsd * hold.kg * 100) / 100
        : 0;
  if (holdPilotPay > 0) {
    throw new Error(
      'Port shuttle only flies unpaid WH bridges — set Internal Haul pay to $0 or fly it yourself',
    );
  }
  const origin = hold.originIcao.trim().toUpperCase();
  const portId = careerPortIdForPickupHub(origin);
  if (!portId || !isPortOperator(world, portId, companyId)) {
    throw new Error(
      'Port shuttle requires an active Port FBO on the origin hub’s port',
    );
  }
  const nm = distanceNm(world, origin, hold.destIcao);
  return {
    holdId: hold.id,
    originIcao: origin,
    destIcao: hold.destIcao.trim().toUpperCase(),
    kg: hold.kg,
    distanceNm: Math.round(nm * 10) / 10,
    feeUsd: quotePortShuttleFeeUsd({ kg: hold.kg, distanceNm: nm }),
    activeShuttles: countActivePortShuttles(state),
    maxActive: PORT_SHUTTLE_MAX_ACTIVE,
  };
}

export function countActivePortShuttles(
  state: CareerMissionsState,
): number {
  return (state.missions ?? []).filter(
    (m) =>
      m.portShuttle === true &&
      m.crewOperated === true &&
      (m.status === 'accepted' ||
        m.status === 'dispatched' ||
        m.status === 'in_flight'),
  ).length;
}

function assertShuttleAircraftClass(
  state: CareerMissionsState,
  aircraftId: string,
): void {
  const acf = findPlayerAircraft(state, aircraftId);
  if (!acf) throw new Error(`Unknown aircraft ${aircraftId}`);
  if (
    !PORT_SHUTTLE_ALLOWED_CLASSES.includes(
      acf.aircraftClassId as FreighterClassId,
    )
  ) {
    throw new Error(
      'Port shuttle only flies Light GA / Light TP — Dispatch heavier freights yourself',
    );
  }
}

/**
 * Dispatch a bridge hold under Port shuttle (wall-clock). Charges fee + fuel.
 * Bridge settle deposits dest WH with $0 freight pay.
 */
export function dispatchPortShuttleBridgeHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; aircraftId: string; nowMs?: number; companyId?: string },
): {
  mission: MissionIntent;
  kg: number;
  feeUsd: number;
  fuelDebitUsd: number;
} {
  if (!PORT_SHUTTLE_ENABLED) {
    throw new Error('Port shuttle is disabled');
  }
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  if (countActivePortShuttles(state) >= PORT_SHUTTLE_MAX_ACTIVE) {
    throw new Error(
      `Port shuttle already active (max ${PORT_SHUTTLE_MAX_ACTIVE}) — wait for arrival`,
    );
  }

  const holds = state.playerWarehouses?.demandHolds ?? [];
  const hold = holds.find((h) => h.id === opts.holdId.trim());
  if (!hold || (hold.kind ?? 'demand') !== 'bridge') {
    throw new Error('Bridge hold not found');
  }
  const holdPilotPay =
    hold.pilotPayUsd != null
      ? hold.pilotPayUsd
      : hold.unitPriceUsd > 0
        ? Math.round(hold.unitPriceUsd * hold.kg * 100) / 100
        : 0;
  if (holdPilotPay > 0) {
    throw new Error(
      'Port shuttle only flies unpaid WH bridges — set Internal Haul pay to $0 or fly it yourself',
    );
  }
  const origin = hold.originIcao.trim().toUpperCase();
  const portId = careerPortIdForPickupHub(origin);
  if (!portId || !isPortOperator(world, portId, companyId)) {
    throw new Error(
      'Port shuttle requires an active Port FBO on the origin hub’s port',
    );
  }

  assertShuttleAircraftClass(state, opts.aircraftId);

  const playerWatch = listActivePlayerMissions(state.missions ?? []).find(
    (m) => m.status === 'in_flight' && m.crewOperated !== true,
  );
  if (playerWatch) {
    throw new Error(
      `Finish or cancel your Watch flight ${playerWatch.id} before Port shuttle`,
    );
  }

  const nm = distanceNm(world, origin, hold.destIcao);
  const feeUsd = quotePortShuttleFeeUsd({ kg: hold.kg, distanceNm: nm });
  if (state.walletUsd < feeUsd) {
    throw new Error(
      `Port shuttle fee $${feeUsd.toLocaleString()} exceeds wallet`,
    );
  }

  const { mission: accepted, kg } = dispatchWarehouseBridgeHold(state, world, {
    holdId: opts.holdId,
    aircraftId: opts.aircraftId,
    pilotPayUsd: 0,
  });

  const idx = state.missions.findIndex((m) => m.id === accepted.id);
  if (idx < 0) throw new Error('Bridge mission missing after dispatch');

  const nowMs = opts.nowMs ?? Date.now();
  const blockHours = estimateMissionBlockHours(
    world,
    accepted.originIcao,
    accepted.destIcao,
    accepted.aircraftClassId,
  );
  const expectedRouteMs = Math.max(1, Math.round(blockHours * 3_600_000));

  const departed = departMission(world, accepted, {
    fleet: state,
    nowMs,
    expectedRouteMs,
  });

  const next: MissionIntent = {
    ...departed.mission,
    crewOperated: true,
    portShuttle: true,
    crewFeeUsd: feeUsd,
    crewRoundTrip: false,
    reason: `Port shuttle · ${accepted.originIcao}→${accepted.destIcao}`,
  };
  state.missions[idx] = next;

  applyWalletDelta(state, {
    amountUsd: -feeUsd,
    kind: 'port_shuttle',
    atTick: world.tick,
    missionId: next.id,
    aircraftId: opts.aircraftId,
    icao: next.originIcao,
    note: `Port shuttle · ${next.originIcao}→${next.destIcao} · ${kg} kg`,
  });

  let fuelDebitUsd = departed.fuelDebitUsd;
  if (fuelDebitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -fuelDebitUsd,
      kind: 'fuel',
      atTick: world.tick,
      missionId: next.id,
      aircraftId: opts.aircraftId,
      icao: next.originIcao,
      note: `Port shuttle fuel · ${next.originIcao}→${next.destIcao}`,
    });
  }

  return { mission: next, kg, feeUsd, fuelDebitUsd };
}
