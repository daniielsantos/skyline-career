/**
 * Wide / trunk haul from player warehouse → destination terminal.
 * Paid freight (Market-style quote); not Demand Board (no 8–12 t cap).
 */

import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { assertClassOpsUnlocked } from './career-class-ops.js';
import { TICKS_PER_HOUR } from './career-clock.js';
import {
  airportByIcao,
  getCommodity,
  isDomesticOd,
  quoteFreightLotPay,
  routeDistanceNm,
  XL_LOT_MIN_KG,
  XL_LOT_PAY_MULT,
  type CareerEconomyWorld,
} from './career-economy.js';
import {
  demandHoldTtlTicks,
  demandRouteMaxCargoKg,
  expireDemandHolds,
  listDemandHolds,
} from './career-demand.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { assignAircraftToMission, findPlayerAircraft } from './career-fleet.js';
import { isBushHub, isBushTripOnlyHub } from './career-bush.js';
import {
  getAircraftClass,
  listActivePlayerMissionsForPilot,
  recomputeMissionTotals,
  syncPlayerInbound,
} from './career-mission.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import {
  depositCargoToWarehouse,
  findPlayerWarehouseAtIcao,
  warehouseFreeCommodityKg,
  withdrawCargoFromWarehouse,
} from './career-warehouse-stock.js';
import {
  MAX_MANIFEST_LOTS,
  type CareerMissionsState,
  type CommodityId,
  type MissionIntent,
  type MissionLotLine,
  type PlayerDemandHold,
} from './types/career-economy.js';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function ensurePile(
  world: CareerEconomyWorld,
  icao: string,
  commodityId: CommodityId,
) {
  const ap = airportByIcao(world, icao);
  if (!ap) throw new Error(`Unknown hub ${icao}`);
  let pile = ap.inventory[commodityId];
  if (!pile) {
    pile = { stockKg: 0, capacityKg: 80_000 };
    ap.inventory[commodityId] = pile;
  }
  return pile;
}

export function quoteWarehouseHaulPayUsd(
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg: number;
  },
): number {
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) return 0;
  const originStock = ensurePile(world, origin, opts.commodityId);
  const destStock = ensurePile(world, dest, opts.commodityId);
  const distanceNm =
    hubDistanceNm(origin, dest) ?? routeDistanceNm(world, origin, dest);
  const originAp = airportByIcao(world, origin);
  const destAp = airportByIcao(world, dest);
  const international = !isDomesticOd(
    originAp?.region ?? '',
    destAp?.region ?? '',
  );
  const sizePayMult = kg >= XL_LOT_MIN_KG ? XL_LOT_PAY_MULT : 1;
  const quoted = quoteFreightLotPay({
    commodityId: opts.commodityId,
    quantityKg: kg,
    originStock,
    destStock,
    distanceNm: distanceNm ?? undefined,
    international,
    sizePayMult,
  });
  return money(quoted.payUsd);
}

function clampHaulKg(
  state: CareerMissionsState,
  originIcao: string,
  commodityId: CommodityId,
  requested?: number,
): number {
  const stockAvail = warehouseFreeCommodityKg(state, originIcao, commodityId);
  let kg = Math.max(0, Math.floor(requested ?? stockAvail));
  return Math.min(kg, stockAvail);
}

function assertHaulRoute(
  state: CareerMissionsState,
  origin: string,
  dest: string,
): NonNullable<ReturnType<typeof findPlayerWarehouseAtIcao>> {
  if (origin === dest) {
    throw new Error('Haul origin and destination must differ');
  }
  if (isBushHub(dest) || isBushTripOnlyHub(dest)) {
    throw new Error(
      `Cannot haul to bush strip ${dest} — SimBrief Dispatch needs a civil hub`,
    );
  }
  const originWh = findPlayerWarehouseAtIcao(state, origin);
  if (!originWh) throw new Error(`No warehouse at ${origin}`);
  return originWh;
}

function createHaulMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    origin: string;
    dest: string;
    commodityId: CommodityId;
    kg: number;
    payUsd: number;
    aircraft: {
      id: string;
      aircraftClassId: MissionIntent['aircraftClassId'];
      airframeTypeId: string;
    };
    warehouseId: string;
    avgCostUsdPerKg: number;
    pilotAccountId?: string;
    pilotHomeCompanyId?: string;
    vaFlight?: boolean;
    actorIsVaOwner?: boolean;
    /** Same-route holds already withdrawn. Omit = one line from the scalar fields. */
    lines?: Array<{
      commodityId: CommodityId;
      kg: number;
      payUsd: number;
      avgCostUsdPerKg: number;
    }>;
  },
): MissionIntent {
  const classDef = getAircraftClass(opts.aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(opts.aircraft.airframeTypeId);
  const distanceNm =
    hubDistanceNm(opts.origin, opts.dest) ??
    routeDistanceNm(world, opts.origin, opts.dest) ??
    0;
  const deadlineTick = world.tick + TICKS_PER_HOUR * 72;
  const lineInputs = opts.lines ?? [
    {
      commodityId: opts.commodityId,
      kg: opts.kg,
      payUsd: opts.payUsd,
      avgCostUsdPerKg: opts.avgCostUsdPerKg,
    },
  ];
  const lots: MissionLotLine[] = lineInputs.map((line, index) => {
    const sizeNote = line.kg >= XL_LOT_MIN_KG ? ' · Wide' : '';
    const lotId =
      lineInputs.length === 1
        ? `whhaul_${opts.origin}_${opts.dest}_${line.kg}`
        : `whhaul_${opts.origin}_${opts.dest}_${line.commodityId}_${index}_${line.kg}`;
    return {
      shipmentLotId: lotId,
      commodityId: line.commodityId,
      cargoKg: line.kg,
      payUsd: line.payUsd,
      urgency: 'normal',
      reason: `WH haul${sizeNote} · ${getCommodity(line.commodityId).name} → ${opts.dest}`,
      deadlineTick,
      avgCostUsdPerKg: line.avgCostUsdPerKg,
    };
  });
  const lotId = lots[0]!.shipmentLotId;
  const cargoKg = lots.reduce((sum, line) => sum + line.cargoKg, 0);
  const payUsd = money(lots.reduce((sum, line) => sum + line.payUsd, 0));
  const costKg = lots.reduce((sum, line) => sum + line.cargoKg, 0);
  const avgCostUsdPerKg =
    costKg > 0
      ? lots.reduce(
          (sum, line) => sum + (line.avgCostUsdPerKg ?? 0) * line.cargoKg,
          0,
        ) / costKg
      : opts.avgCostUsdPerKg;
  const mission = recomputeMissionTotals({
    id: `msn_whhaul_${world.tick}_${opts.origin}_${opts.dest}_${Math.floor(Math.random() * 1e6)}`,
    lots,
    shipmentLotId: lotId,
    commodityId: lots[0]!.commodityId,
    originIcao: opts.origin,
    destIcao: opts.dest,
    cargoKg,
    pax: 0,
    aircraftClassId: opts.aircraft.aircraftClassId,
    airframeTypeId: opts.aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick,
    payUsd,
    urgency: 'normal',
    reason: `Warehouse haul · ${opts.origin}→${opts.dest}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: opts.aircraft.id,
    warehouseHaul: true,
    warehouseId: opts.warehouseId,
    warehouseAvgCostUsdPerKg: avgCostUsdPerKg,
    distanceNm: Math.round(distanceNm),
    ...(opts.pilotAccountId?.trim()
      ? { pilotAccountId: opts.pilotAccountId.trim() }
      : {}),
    ...(opts.pilotHomeCompanyId?.trim()
      ? { pilotHomeCompanyId: opts.pilotHomeCompanyId.trim() }
      : {}),
    ...(opts.vaFlight === true ? { vaFlight: true as const } : {}),
  });
  assignAircraftToMission(state, opts.aircraft.id, mission.id, opts.origin, {
    actorAccountId: opts.pilotAccountId,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  state.missions = [...(state.missions ?? []), mission];
  syncPlayerInbound(world, mission);
  return mission;
}

function parkedAircraftAt(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  aircraftId: string,
  origin: string,
  dest: string,
  kg: number,
  pilotAccountId?: string | null,
  tripHostId?: string,
) {
  const hostId = tripHostId?.trim() || '';
  const open = listActivePlayerMissionsForPilot(
    state.missions ?? [],
    pilotAccountId,
  ).filter(
    (mission) =>
      !hostId ||
      (mission.id !== hostId && mission.throughHostId !== hostId),
  );
  if (open.length > 0) {
    throw new Error(
      `Finish or cancel ${open[0]!.id} before starting a warehouse haul`,
    );
  }
  const aircraft = findPlayerAircraft(state, aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  const airframeTypeId = aircraft.airframeTypeId;
  if (!airframeTypeId) {
    throw new Error(`Aircraft ${aircraft.id} has no airframe`);
  }
  if (aircraft.status !== 'parked') {
    const onThisFlight =
      hostId !== '' &&
      aircraft.status === 'assigned' &&
      aircraft.assignedMissionId === hostId;
    if (!onThisFlight) {
      throw new Error(`Aircraft ${aircraft.id} is not parked`);
    }
  }
  if (aircraft.locationIcao.trim().toUpperCase() !== origin) {
    throw new Error(
      `Aircraft is at ${aircraft.locationIcao}, not warehouse hub ${origin}`,
    );
  }
  const dispatchAircraft = {
    id: aircraft.id,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId,
  };
  const maxCargoKg = demandRouteMaxCargoKg(
    world,
    dispatchAircraft,
    origin,
    dest,
  );
  if (kg > maxCargoKg) {
    throw new Error(
      `Haul ${kg} kg exceeds this airframe's ${maxCargoKg} kg ops cap for ${origin}→${dest}`,
    );
  }
  return dispatchAircraft;
}

export function holdWarehouseHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg?: number;
    heldByAccountId?: string;
  },
): { hold: PlayerDemandHold; kg: number; payUsd: number } {
  expireDemandHolds(state, world);
  if (!cargoOpsIsUnlocked(state.cargoOps, opts.commodityId)) {
    const name = getCommodity(opts.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  if (!airportByIcao(world, dest)) {
    throw new Error(`Unknown destination ${dest}`);
  }
  const originWh = assertHaulRoute(state, origin, dest);
  const holds = listDemandHolds(state);
  if (
    holds.some(
      (h) =>
        h.kind === 'haul' &&
        h.warehouseId === originWh.id &&
        h.destIcao === dest &&
        h.commodityId === opts.commodityId,
    )
  ) {
    throw new Error(
      `Already holding a haul of ${opts.commodityId} from ${origin} to ${dest}`,
    );
  }
  const kg = clampHaulKg(state, origin, opts.commodityId, opts.kg);
  if (kg <= 0) {
    throw new Error(`No free ${opts.commodityId} at ${origin}`);
  }
  const payUsd = quoteWarehouseHaulPayUsd(world, {
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
  });
  const unitPriceUsd = money(payUsd / kg);
  const ttl = demandHoldTtlTicks(originWh.tier);
  const hold: PlayerDemandHold = {
    id: nextId('hold_haul', world.tick),
    kind: 'haul',
    warehouseId: originWh.id,
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
    unitPriceUsd,
    heldByAccountId: opts.heldByAccountId?.trim() || undefined,
    heldAtTick: world.tick,
    expiresAtTick: world.tick + ttl,
  };
  holds.push(hold);
  state.playerWarehouses!.demandHolds = holds;
  return { hold, kg, payUsd };
}

export function cancelWarehouseHaulHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string },
): { kg: number } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Haul hold not found');
  const hold = holds[idx]!;
  if (hold.kind !== 'haul') {
    throw new Error('Not a warehouse haul hold');
  }
  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;
  return { kg: hold.kg };
}

export function acceptWarehouseHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    aircraftId: string;
    kg?: number;
    pilotAccountId?: string;
    pilotHomeCompanyId?: string;
    vaFlight?: boolean;
    actorIsVaOwner?: boolean;
  },
): { mission: MissionIntent; kg: number; payUsd: number } {
  expireDemandHolds(state, world);
  if (!cargoOpsIsUnlocked(state.cargoOps, opts.commodityId)) {
    const name = getCommodity(opts.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  if (!airportByIcao(world, dest)) {
    throw new Error(`Unknown destination ${dest}`);
  }
  assertHaulRoute(state, origin, dest);
  const kg = clampHaulKg(state, origin, opts.commodityId, opts.kg);
  if (kg <= 0) {
    throw new Error(`No free ${opts.commodityId} at ${origin}`);
  }
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    origin,
    dest,
    kg,
    opts.pilotAccountId,
  );
  assertClassOpsUnlocked(state.classOps, aircraft.aircraftClassId);
  const payUsd = quoteWarehouseHaulPayUsd(world, {
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
  });
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: origin,
    commodityId: opts.commodityId,
    kg,
  });
  const mission = createHaulMission(state, world, {
    origin,
    dest,
    commodityId: opts.commodityId,
    kg,
    payUsd,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
    pilotAccountId: opts.pilotAccountId,
    pilotHomeCompanyId: opts.pilotHomeCompanyId,
    vaFlight: opts.vaFlight,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  return { mission, kg, payUsd };
}

export function dispatchWarehouseHaulHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    holdId: string;
    aircraftId: string;
    /** Partial load; omit = full hold. Remainder stays reserved on Open desk. */
    kg?: number;
    pilotAccountId?: string;
    pilotHomeCompanyId?: string;
    vaFlight?: boolean;
    actorIsVaOwner?: boolean;
    /** Join this accepted flight instead of starting another. */
    tripHostId?: string;
  },
): { mission: MissionIntent; kg: number; payUsd: number } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Haul hold not found');
  const hold = holds[idx]!;
  if (hold.kind !== 'haul') {
    throw new Error('Not a warehouse haul hold');
  }
  if (!cargoOpsIsUnlocked(state.cargoOps, hold.commodityId)) {
    const name = getCommodity(hold.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const takeKg = Math.max(
    0,
    Math.floor(
      opts.kg != null && Number.isFinite(opts.kg) ? Number(opts.kg) : hold.kg,
    ),
  );
  const kg = Math.min(hold.kg, takeKg);
  if (kg <= 0) {
    throw new Error('Dispatch amount must be positive');
  }
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    hold.originIcao,
    hold.destIcao,
    kg,
    opts.pilotAccountId,
    opts.tripHostId,
  );
  assertClassOpsUnlocked(state.classOps, aircraft.aircraftClassId);
  const payUsd = money(hold.unitPriceUsd * kg);
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: hold.originIcao,
    commodityId: hold.commodityId,
    kg,
  });
  const remainKg = hold.kg - kg;
  if (remainKg <= 0) {
    holds.splice(idx, 1);
  } else {
    holds[idx] = { ...hold, kg: remainKg };
  }
  state.playerWarehouses!.demandHolds = holds;
  const mission = createHaulMission(state, world, {
    origin: hold.originIcao,
    dest: hold.destIcao,
    commodityId: hold.commodityId,
    kg,
    payUsd,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
    pilotAccountId: opts.pilotAccountId,
    pilotHomeCompanyId: opts.pilotHomeCompanyId,
    vaFlight: opts.vaFlight,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  return { mission, kg, payUsd };
}

/** One flight for several haul holds that share origin and destination. */
export function dispatchWarehouseHaulHolds(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    aircraftId: string;
    holds: Array<{ holdId: string; kg?: number }>;
    pilotAccountId?: string;
    pilotHomeCompanyId?: string;
    vaFlight?: boolean;
    actorIsVaOwner?: boolean;
  },
): { mission: MissionIntent; kg: number; payUsd: number } {
  if (opts.holds.length === 1) {
    const only = opts.holds[0]!;
    return dispatchWarehouseHaulHold(state, world, {
      holdId: only.holdId,
      aircraftId: opts.aircraftId,
      kg: only.kg,
      pilotAccountId: opts.pilotAccountId,
      pilotHomeCompanyId: opts.pilotHomeCompanyId,
      vaFlight: opts.vaFlight,
      actorIsVaOwner: opts.actorIsVaOwner,
    });
  }
  if (opts.holds.length > MAX_MANIFEST_LOTS) {
    throw new Error(`At most ${MAX_MANIFEST_LOTS} holds on one flight`);
  }
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const seen = new Set<string>();
  const picked: Array<{ hold: PlayerDemandHold; kg: number }> = [];
  for (const row of opts.holds) {
    const holdId = row.holdId.trim();
    if (!holdId || seen.has(holdId)) {
      throw new Error('Each desk hold can be loaded once');
    }
    seen.add(holdId);
    const hold = holds.find((candidate) => candidate.id === holdId);
    if (!hold) throw new Error('Haul hold not found');
    if (hold.kind !== 'haul') throw new Error('Not a warehouse haul hold');
    if (!cargoOpsIsUnlocked(state.cargoOps, hold.commodityId)) {
      const name = getCommodity(hold.commodityId).name;
      throw new Error(
        `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
      );
    }
    const takeKg = Math.max(
      0,
      Math.floor(
        row.kg != null && Number.isFinite(row.kg) ? Number(row.kg) : hold.kg,
      ),
    );
    const kg = Math.min(hold.kg, takeKg);
    if (kg <= 0) throw new Error('Dispatch amount must be positive');
    picked.push({ hold, kg });
  }
  const origin = picked[0]!.hold.originIcao.trim().toUpperCase();
  const dest = picked[0]!.hold.destIcao.trim().toUpperCase();
  for (const row of picked) {
    if (
      row.hold.originIcao.trim().toUpperCase() !== origin ||
      row.hold.destIcao.trim().toUpperCase() !== dest
    ) {
      throw new Error(
        'Desk holds on one flight must share origin and destination',
      );
    }
  }
  const totalKg = picked.reduce((sum, row) => sum + row.kg, 0);
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    origin,
    dest,
    totalKg,
    opts.pilotAccountId,
  );
  assertClassOpsUnlocked(state.classOps, aircraft.aircraftClassId);
  const lines: Array<{
    commodityId: CommodityId;
    kg: number;
    payUsd: number;
    avgCostUsdPerKg: number;
  }> = [];
  let warehouseId = '';
  for (const row of picked) {
    const payUsd = money(row.hold.unitPriceUsd * row.kg);
    const withdrawn = withdrawCargoFromWarehouse(state, {
      icao: row.hold.originIcao,
      commodityId: row.hold.commodityId,
      kg: row.kg,
    });
    warehouseId = withdrawn.warehouseId;
    const remainKg = row.hold.kg - row.kg;
    const idx = holds.findIndex((candidate) => candidate.id === row.hold.id);
    if (idx < 0) throw new Error('Haul hold not found');
    if (remainKg <= 0) holds.splice(idx, 1);
    else holds[idx] = { ...holds[idx]!, kg: remainKg };
    lines.push({
      commodityId: row.hold.commodityId,
      kg: row.kg,
      payUsd,
      avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
    });
  }
  state.playerWarehouses!.demandHolds = holds;
  const payUsd = money(lines.reduce((sum, line) => sum + line.payUsd, 0));
  const mission = createHaulMission(state, world, {
    origin,
    dest,
    commodityId: lines[0]!.commodityId,
    kg: totalKg,
    payUsd,
    aircraft,
    warehouseId,
    avgCostUsdPerKg: lines[0]!.avgCostUsdPerKg,
    lines,
    pilotAccountId: opts.pilotAccountId,
    pilotHomeCompanyId: opts.pilotHomeCompanyId,
    vaFlight: opts.vaFlight,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  return { mission, kg: totalKg, payUsd };
}

/**
 * Edit an accepted warehouse haul or bridge. The lot id is synthetic
 * (`whhaul_` / `whbridge_`), not a market lot. Delta goes back to, or comes
 * out of, the origin warehouse. Later stops on the aircraft stay put.
 */
export function replaceWarehouseDeskMissionCargo(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: { cargoKg: number; maxCargoKg?: number },
): MissionIntent {
  const normalized = recomputeMissionTotals(mission);
  if (!normalized.warehouseHaul && !normalized.warehouseBridge) {
    throw new Error('Not a warehouse haul or bridge');
  }
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot edit mission in status=${normalized.status}`);
  }
  if (normalized.lots.length !== 1) {
    throw new Error('This warehouse flight has more than one cargo line');
  }

  const newKg = Math.floor(opts.cargoKg);
  if (!Number.isFinite(newKg) || newKg <= 0) {
    throw new Error('Edited cargo must be at least 1 kg');
  }
  const line = normalized.lots[0]!;
  const oldKg = Math.max(0, Math.floor(line.cargoKg));
  if (oldKg <= 0) throw new Error('Warehouse flight has no cargo to edit');

  const classDef = getAircraftClass(normalized.aircraftClassId);
  const airframeMax = findCareerPlayerAirframe(
    normalized.airframeTypeId,
  )?.maxCargoKg;
  const maxCargoKg =
    opts.maxCargoKg !== undefined &&
    Number.isFinite(opts.maxCargoKg) &&
    opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : (airframeMax ?? classDef.maxCargoKg);
  const throughKg = (normalized.throughLoads ?? []).reduce(
    (sum, row) => sum + Math.max(0, Math.floor(row.cargoKg)),
    0,
  );
  if (newKg + throughKg > maxCargoKg) {
    throw new Error(
      `Edited cargo ${newKg} kg exceeds aircraft capacity ${maxCargoKg} kg`,
    );
  }

  const commodityId = line.commodityId;
  const origin = normalized.originIcao.trim().toUpperCase();
  const delta = newKg - oldKg;
  let warehouseAvgCostUsdPerKg = normalized.warehouseAvgCostUsdPerKg ?? 0;
  if (delta < 0) {
    depositCargoToWarehouse(state, {
      icao: origin,
      commodityId,
      kg: -delta,
      avgCostUsdPerKg: warehouseAvgCostUsdPerKg,
      tick: normalized.acceptedAtTick ?? world.tick,
    });
  } else if (delta > 0) {
    const withdrawn = withdrawCargoFromWarehouse(state, {
      icao: origin,
      commodityId,
      kg: delta,
    });
    warehouseAvgCostUsdPerKg = money(
      (warehouseAvgCostUsdPerKg * oldKg + withdrawn.avgCostUsdPerKg * delta) /
        newKg,
    );
  }

  const payUsd = money((line.payUsd * newKg) / oldKg);
  const replaced = recomputeMissionTotals({
    ...normalized,
    lots: [{ ...line, cargoKg: newKg, payUsd }],
    shipmentLotId: line.shipmentLotId,
    commodityId,
    cargoKg: newKg,
    payUsd,
    warehouseAvgCostUsdPerKg,
    status: 'accepted',
    lastOfpCheck: undefined,
    lastPreflightCheck: undefined,
    fuelAuthorizedOfpId: undefined,
    tripFuelBurnKg: undefined,
    dispatchedAtTick: undefined,
  });
  const missionIdx = (state.missions ?? []).findIndex((row) => row.id === replaced.id);
  if (missionIdx >= 0) state.missions![missionIdx] = replaced;
  syncPlayerInbound(world, replaced);
  return replaced;
}
