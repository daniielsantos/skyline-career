/**
 * Port FBO Jet-A tank + rare restricted haul.
 *
 * The tank is company stock at a port the player already operates.
 * Dispatch at that pickup hub draws aircraft residual, then the tank
 * (already paid), then airport spot. Surplus OFP sales stay on the
 * hangar and are not routed through the tank.
 *
 * A quiet field that is short posts one line on the nearest port Demand
 * desk. The fee is for the flight. The Jet-A itself is a pass-through.
 */

import { recordFuelUpliftActivity } from './career-hub-level.js';
import {
  airportByIcao,
  FUEL_HUB_ICAOS,
  localUnitPriceUsd,
} from './career-economy.js';
import {
  creditAirportFuelStock,
  fuelTerminalSellableKg,
} from './career-fuel.js';
import { appendLedgerMarker, applyWalletDelta } from './career-ledger.js';
import {
  distanceHubsNm,
  listBoundCareerPorts,
  portPickupHubsBound,
} from './career-port-corridor.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CareerMissionsState,
  DemandOrder,
  HubTier,
  MissionIntent,
  PlayerPortConcession,
  PortConcessionLevel,
} from './types/career-economy.js';

/** Company tank at the Port FBO (kg). P1 small, P2/P3 larger. */
export const PORT_JET_A_TANK_KG: Record<PortConcessionLevel, number> = {
  1: 4_000,
  2: 12_000,
  3: 28_000,
};

/**
 * Old per-level Stock cap (kg). Stock no longer uses it — the flight is
 * limited by tank room, what the aircraft lifts, and what the origin sells.
 * Demand haul ceilings stay on `fuelHaulCeilingKg`.
 */
export const PORT_JET_A_TRIP_KG: Record<PortConcessionLevel, number> = {
  1: 2_500,
  2: 5_000,
  3: 8_000,
};

/** Open restricted lines worldwide. Rare on purpose. */
export const PORT_JET_A_HAUL_CAP = 18;

/** Gap below this does not spawn a line. */
export const PORT_JET_A_HAUL_FLOOR_KG = 1_500;

/** Cover the terminal wants before it stops asking. */
const COVER_FILL = 0.4;

/** A field counts as surplus for pickup. */
const SURPLUS_FILL = 0.7;

const HAUL_TTL_TICKS = 96 * 3;

const HAUL_MIN_NM = 80;
const HAUL_MAX_NM = 2_200;

export function portJetATankCapacityKg(level: PortConcessionLevel): number {
  return PORT_JET_A_TANK_KG[level] ?? PORT_JET_A_TANK_KG[1];
}

export function portJetATripCeilingKg(level: PortConcessionLevel): number {
  return PORT_JET_A_TRIP_KG[level] ?? PORT_JET_A_TRIP_KG[1];
}

/** Remote asks less. A larger quiet field asks more. Not a dice roll. */
export function fuelHaulCeilingKg(tier: HubTier | undefined): number {
  if (tier === 'major') return 8_000;
  if (tier === 'regional') return 5_000;
  return 2_500;
}

/**
 * Transport fee only. Deliberately not a markup on the Jet-A spot price.
 */
export function fuelHaulFeeUsd(kg: number, distanceNm: number): number {
  const mass = Math.max(0, Math.floor(kg));
  const nm = Math.max(0, distanceNm);
  const perKg = 0.4 + Math.min(nm, 1_800) * 0.0012;
  return Math.round(mass * perKg);
}

export function fuelHaulGapKg(
  stockKg: number,
  capacityKg: number,
  tier: HubTier | undefined,
): number | null {
  if (!(capacityKg > 0)) return null;
  const gap = COVER_FILL * capacityKg - Math.max(0, stockKg);
  if (gap < PORT_JET_A_HAUL_FLOOR_KG) return null;
  return Math.floor(Math.min(gap, fuelHaulCeilingKg(tier)));
}

function clampLevel(level: number | undefined): PortConcessionLevel {
  if (level === 2 || level === 3) return level;
  return 1;
}

function activeConcessions(
  state: CareerMissionsState,
  tick: number,
): PlayerPortConcession[] {
  return (state.playerPortConcessions ?? []).filter(
    (c) => c.leasePaidThroughTick > tick,
  );
}

export function concessionForPickupHub(
  state: CareerMissionsState,
  tick: number,
  icao: string,
): PlayerPortConcession | undefined {
  const hub = icao.trim().toUpperCase();
  if (!hub) return undefined;
  return activeConcessions(state, tick).find((c) =>
    portPickupHubsBound(c.portId).some((h) => h.trim().toUpperCase() === hub),
  );
}

export function peekPortJetAKg(
  state: CareerMissionsState,
  tick: number,
  originIcao: string,
): number {
  const conc = concessionForPickupHub(state, tick, originIcao);
  if (!conc) return 0;
  return Math.max(0, Math.floor(conc.jetAKg ?? 0));
}

/** Draw already-paid tank kg. Returns kg actually taken. */
export function takePortJetAForUplift(
  state: CareerMissionsState,
  tick: number,
  originIcao: string,
  kg: number,
): number {
  const want = Math.max(0, Math.floor(kg));
  if (want <= 0) return 0;
  const conc = concessionForPickupHub(state, tick, originIcao);
  if (!conc) return 0;
  const have = Math.max(0, Math.floor(conc.jetAKg ?? 0));
  const take = Math.min(want, have);
  conc.jetAKg = have - take;
  return take;
}

/** Audit row when already-paid tank kg goes into an aircraft. Does not move cash. */
export function recordPortJetATankDraw(
  state: CareerMissionsState,
  opts: {
    kg: number;
    atTick: number;
    originIcao: string;
    destIcao?: string;
    missionId?: string;
  },
): void {
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) return;
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao?.trim().toUpperCase();
  const route = dest ? `${origin}→${dest}` : origin;
  appendLedgerMarker(state, {
    kind: 'port_fbo_jet_a',
    atTick: opts.atTick,
    missionId: opts.missionId,
    icao: origin,
    note: `From tank · ${kg} kg · ${route}`,
  });
}

function fuelPileOf(ap: AirportTerminal | undefined) {
  const pile = ap?.inventory?.fuel;
  if (!pile || !(pile.capacityKg > 0)) return null;
  return pile;
}

export function buyPortFboJetA(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { portId: string; kg: number; companyId?: string },
): { kg: number; costUsd: number; concession: PlayerPortConcession } {
  const portId = opts.portId.trim().toUpperCase();
  const companyId = opts.companyId?.trim();
  const conc = activeConcessions(state, world.tick).find(
    (c) =>
      c.portId.trim().toUpperCase() === portId &&
      (!companyId || c.companyId === companyId),
  );
  if (!conc) throw new Error('No active Port FBO on this port');
  const hub = portPickupHubsBound(portId)[0]?.trim().toUpperCase();
  if (!hub) throw new Error('This port has no pickup airport');
  const level = clampLevel(conc.level);
  const room = Math.max(
    0,
    portJetATankCapacityKg(level) - Math.floor(conc.jetAKg ?? 0),
  );
  if (room <= 0) throw new Error('Port FBO Jet-A tank is full');
  const ap = airportByIcao(world, hub);
  const pile = fuelPileOf(ap);
  if (!ap || !pile) throw new Error(`No Jet-A price at ${hub}`);
  const sellable = fuelTerminalSellableKg(ap);
  const take = Math.min(
    Math.max(0, Math.floor(opts.kg)),
    room,
    sellable,
  );
  if (take <= 0) throw new Error(`No Jet-A for sale at ${hub}`);
  const unit = localUnitPriceUsd('fuel', pile);
  const costUsd = Math.round(take * unit);
  if ((state.walletUsd ?? 0) < costUsd) {
    throw new Error('Not enough cash to buy Jet-A into the Port FBO tank');
  }
  pile.stockKg = Math.max(0, pile.stockKg - take);
  recordFuelUpliftActivity(world, hub, take);
  conc.jetAKg = Math.floor(conc.jetAKg ?? 0) + take;
  applyWalletDelta(state, {
    amountUsd: -costUsd,
    kind: 'port_fbo_jet_a',
    atTick: world.tick,
    icao: hub,
    note: `Port FBO tank · ${hub}`,
  });
  return { kg: take, costUsd, concession: conc };
}

export type JetASurplusSource = {
  icao: string;
  name: string;
  distanceNm: number;
  sellableKg: number;
  unitUsd: number;
};

export function listJetASurplusSources(
  world: CareerEconomyWorld,
  nearIcao: string,
  limit = 5,
): JetASurplusSource[] {
  const near = nearIcao.trim().toUpperCase();
  const out: JetASurplusSource[] = [];
  for (const ap of world.airports) {
    const icao = ap.icao.trim().toUpperCase();
    if (!icao || icao === near || ap.bushTripOnly) continue;
    const pile = fuelPileOf(ap);
    if (!pile) continue;
    const fill = pile.stockKg / pile.capacityKg;
    const sellable = fuelTerminalSellableKg(ap);
    if (sellable < 400) continue;
    if (!FUEL_HUB_ICAOS.has(icao) && fill < SURPLUS_FILL) continue;
    const distanceNm = distanceHubsNm(near, icao);
    if (distanceNm == null || distanceNm < HAUL_MIN_NM) continue;
    out.push({
      icao,
      name: ap.name?.trim() || icao,
      distanceNm: Math.round(distanceNm),
      sellableKg: sellable,
      unitUsd: Math.round(localUnitPriceUsd('fuel', pile) * 1000) / 1000,
    });
  }
  out.sort(
    (a, b) => a.distanceNm - b.distanceNm || a.icao.localeCompare(b.icao),
  );
  return out.slice(0, Math.max(1, limit));
}

function hubAsksForFuel(ap: AirportTerminal): boolean {
  const icao = ap.icao.trim().toUpperCase();
  if (FUEL_HUB_ICAOS.has(icao) || ap.bushTripOnly) return false;
  const tier = ap.hubTier ?? 'spoke';
  const activity = ap.activityScore;
  if (tier === 'major') {
    return typeof activity === 'number' && activity < 8;
  }
  if (tier === 'regional') {
    return activity == null || activity < 18;
  }
  return true;
}

function nearestPortId(destIcao: string): string | null {
  let best: { id: string; nm: number } | null = null;
  for (const port of listBoundCareerPorts()) {
    const hub = port.pickupHubs[0]?.trim().toUpperCase();
    if (!hub) continue;
    const nm = distanceHubsNm(destIcao, hub);
    if (nm == null) continue;
    if (!best || nm < best.nm || (nm === best.nm && port.id < best.id)) {
      best = { id: port.id, nm };
    }
  }
  return best?.id ?? null;
}

function isOpenFuel(order: DemandOrder, tick: number): boolean {
  return (
    order.commodityId === 'fuel' &&
    order.fuelHaul != null &&
    order.status === 'open' &&
    order.remainingKg > 0 &&
    order.expiresAtTick > tick
  );
}

const fuelHaulScannedTick = new WeakMap<CareerEconomyWorld, number>();

/**
 * One restricted line per short field, on the nearest port desk.
 * Quantity is the gap under the cover target, clamped to one trip.
 * At most once per economy tick per world object.
 */
export function ensurePortJetAHaulOrders(world: CareerEconomyWorld): number {
  if (fuelHaulScannedTick.get(world) === world.tick) return 0;
  fuelHaulScannedTick.set(world, world.tick);
  if (!Array.isArray(world.demandOrders)) world.demandOrders = [];
  const orders = world.demandOrders;
  for (const order of orders) {
    if (order.commodityId !== 'fuel' || !order.fuelHaul) continue;
    if (order.status !== 'open') continue;
    if (order.remainingKg <= 0 || order.expiresAtTick <= world.tick) {
      order.status = order.remainingKg <= 0 ? 'filled' : 'expired';
    }
  }
  let open = orders.filter((o) => isOpenFuel(o, world.tick)).length;
  if (open >= PORT_JET_A_HAUL_CAP) return 0;
  const openDest = new Set(
    orders
      .filter((o) => isOpenFuel(o, world.tick))
      .map((o) => o.destIcao.trim().toUpperCase()),
  );
  const openPort = new Set(
    orders
      .filter((o) => isOpenFuel(o, world.tick))
      .map((o) => (o.portId ?? '').trim().toUpperCase())
      .filter(Boolean),
  );

  const sources = world.airports.flatMap((ap) => {
    const icao = ap.icao.trim().toUpperCase();
    const pile = fuelPileOf(ap);
    if (!pile || ap.bushTripOnly) return [];
    const fill = pile.stockKg / pile.capacityKg;
    const sellable = fuelTerminalSellableKg(ap);
    if (sellable < PORT_JET_A_HAUL_FLOOR_KG) return [];
    if (!FUEL_HUB_ICAOS.has(icao) && fill < SURPLUS_FILL) return [];
    return [{ icao, sellable }];
  });

  let spawned = 0;
  const dests = [...world.airports].sort((a, b) =>
    a.icao.localeCompare(b.icao),
  );
  for (const ap of dests) {
    if (open >= PORT_JET_A_HAUL_CAP) break;
    const dest = ap.icao.trim().toUpperCase();
    if (!hubAsksForFuel(ap) || openDest.has(dest)) continue;
    const pile = fuelPileOf(ap);
    if (!pile) continue;
    const kg = fuelHaulGapKg(pile.stockKg, pile.capacityKg, ap.hubTier);
    if (kg == null) continue;
    const portId = nearestPortId(dest);
    if (!portId || openPort.has(portId)) continue;
    let pickup: { icao: string; nm: number } | null = null;
    for (const source of sources) {
      if (source.icao === dest || source.sellable < kg) continue;
      const nm = distanceHubsNm(dest, source.icao);
      if (nm == null || nm < HAUL_MIN_NM || nm > HAUL_MAX_NM) continue;
      if (!pickup || nm < pickup.nm || (nm === pickup.nm && source.icao < pickup.icao)) {
        pickup = { icao: source.icao, nm };
      }
    }
    if (!pickup) continue;
    const fee = fuelHaulFeeUsd(kg, pickup.nm);
    const unit = Math.round((fee / kg) * 1000) / 1000;
    const id = `fj_${dest}`;
    const row: DemandOrder = {
      id,
      portId,
      destIcao: dest,
      commodityId: 'fuel',
      wantedKg: kg,
      remainingKg: kg,
      maxUnitPriceUsd: unit,
      arrivedAtTick: world.tick,
      expiresAtTick: world.tick + HAUL_TTL_TICKS,
      status: 'open',
      fuelHaul: { pickupIcao: pickup.icao },
    };
    const idx = orders.findIndex((o) => o.id === id);
    if (idx >= 0) orders[idx] = row;
    else orders.push(row);
    open += 1;
    spawned += 1;
    openDest.add(dest);
    openPort.add(portId);
  }
  return spawned;
}

export function liquidateConcessionJetA(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  conc: PlayerPortConcession,
): number {
  const kg = Math.max(0, Math.floor(conc.jetAKg ?? 0));
  conc.jetAKg = 0;
  if (kg <= 0) return 0;
  const hub = portPickupHubsBound(conc.portId)[0]?.trim().toUpperCase();
  if (!hub) return 0;
  const ap = airportByIcao(world, hub);
  const pile = fuelPileOf(ap);
  const unit = pile ? localUnitPriceUsd('fuel', pile) : 0.95;
  creditAirportFuelStock(world, hub, kg);
  const credit = Math.round(kg * unit);
  if (credit <= 0) return 0;
  applyWalletDelta(state, {
    amountUsd: credit,
    kind: 'port_fbo_jet_a',
    atTick: world.tick,
    icao: hub,
    note: `Port FBO tank sold · ${hub}`,
  });
  return credit;
}

export type BookedJetA = {
  fromTankKg: number;
  boughtKg: number;
  boughtUsd: number;
};

/** Buy or draw the haul kg at pickup. Checks cash and stock before mutating. */
export function bookJetAAtAirport(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { originIcao: string; kg: number; note: string },
): BookedJetA {
  const origin = opts.originIcao.trim().toUpperCase();
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) throw new Error('Jet-A amount must be positive');
  const conc = concessionForPickupHub(state, world.tick, origin);
  const tankHave = conc ? Math.max(0, Math.floor(conc.jetAKg ?? 0)) : 0;
  const fromTankKg = Math.min(kg, tankHave);
  const boughtKg = kg - fromTankKg;
  let boughtUsd = 0;
  const ap = airportByIcao(world, origin);
  const pile = fuelPileOf(ap);
  if (boughtKg > 0) {
    if (!ap || !pile) throw new Error(`No Jet-A at ${origin}`);
    if (fuelTerminalSellableKg(ap) < boughtKg) {
      throw new Error(`Not enough Jet-A at ${origin}`);
    }
    boughtUsd = Math.round(boughtKg * localUnitPriceUsd('fuel', pile));
    if ((state.walletUsd ?? 0) < boughtUsd) {
      throw new Error('Not enough cash to buy the Jet-A for this flight');
    }
  }
  if (conc && fromTankKg > 0) {
    conc.jetAKg = tankHave - fromTankKg;
  }
  if (boughtKg > 0 && pile) {
    pile.stockKg = Math.max(0, pile.stockKg - boughtKg);
    recordFuelUpliftActivity(world, origin, boughtKg);
    applyWalletDelta(state, {
      amountUsd: -boughtUsd,
      kind: 'port_fbo_jet_a',
      atTick: world.tick,
      icao: origin,
      note: opts.note,
    });
  }
  return { fromTankKg, boughtKg, boughtUsd };
}

export function deliverPortJetAHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
): void {
  const haul = mission.fuelHaul;
  if (!haul || haul.kg <= 0) return;
  if (haul.kind === 'demand') {
    creditAirportFuelStock(world, mission.destIcao, haul.kg);
    return;
  }
  const conc = activeConcessions(state, world.tick).find(
    (c) => c.portId.trim().toUpperCase() === haul.portId.trim().toUpperCase(),
  );
  const level = clampLevel(conc?.level);
  const have = Math.max(0, Math.floor(conc?.jetAKg ?? 0));
  const room = conc ? Math.max(0, portJetATankCapacityKg(level) - have) : 0;
  const add = Math.min(haul.kg, room);
  if (conc) conc.jetAKg = have + add;
  if (conc && add > 0 && haul.kind === 'reposition') {
    const origin = mission.originIcao.trim().toUpperCase();
    const dest = (
      portPickupHubsBound(haul.portId)[0]?.trim().toUpperCase() ||
      mission.destIcao.trim().toUpperCase()
    );
    appendLedgerMarker(state, {
      kind: 'port_fbo_jet_a',
      atTick: world.tick,
      missionId: mission.id,
      icao: dest,
      note: `Into tank · ${add} kg · ${origin}→${dest}`,
    });
  }
  const overflow = haul.kg - add;
  if (overflow <= 0) return;
  const hub =
    portPickupHubsBound(haul.portId)[0]?.trim().toUpperCase() ||
    mission.destIcao;
  const ap = airportByIcao(world, hub);
  const pile = fuelPileOf(ap);
  const unit =
    haul.boughtKg > 0
      ? haul.boughtUsd / haul.boughtKg
      : pile
        ? localUnitPriceUsd('fuel', pile)
        : 0.95;
  creditAirportFuelStock(world, hub, overflow);
  const credit = Math.round(overflow * unit);
  if (credit <= 0) return;
  applyWalletDelta(state, {
    amountUsd: credit,
    kind: 'port_fbo_jet_a',
    atTick: world.tick,
    icao: hub,
    missionId: mission.id,
    note: `Port FBO tank full · ${overflow} kg sold`,
  });
}

/**
 * Give back a slice of Jet-A already booked for a Stock flight.
 * Does not set `refunded` — cancel still uses `refundPortJetAHaul`.
 */
export function releaseBookedJetA(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    fromTankKg: number;
    boughtKg: number;
    boughtUsd: number;
    missionId?: string;
    note: string;
  },
): void {
  const origin = opts.originIcao.trim().toUpperCase();
  const fromTankKg = Math.max(0, Math.floor(opts.fromTankKg));
  const boughtKg = Math.max(0, Math.floor(opts.boughtKg));
  const boughtUsd = Math.max(0, Math.round(opts.boughtUsd));
  if (fromTankKg > 0) {
    const conc = concessionForPickupHub(state, world.tick, origin);
    if (conc) {
      const level = clampLevel(conc.level);
      const cap = portJetATankCapacityKg(level);
      conc.jetAKg = Math.min(
        cap,
        Math.floor(conc.jetAKg ?? 0) + fromTankKg,
      );
    } else {
      creditAirportFuelStock(world, origin, fromTankKg);
    }
  }
  if (boughtKg > 0) {
    creditAirportFuelStock(world, origin, boughtKg);
    if (boughtUsd > 0) {
      applyWalletDelta(state, {
        amountUsd: boughtUsd,
        kind: 'port_fbo_jet_a',
        atTick: world.tick,
        icao: origin,
        missionId: opts.missionId,
        note: opts.note,
      });
    }
  }
}

export function refundPortJetAHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
): void {
  const haul = mission.fuelHaul;
  if (!haul || haul.refunded) return;
  haul.refunded = true;
  const origin = mission.originIcao.trim().toUpperCase();
  if (haul.fromTankKg > 0) {
    const conc = concessionForPickupHub(state, world.tick, origin);
    if (conc) {
      const level = clampLevel(conc.level);
      const cap = portJetATankCapacityKg(level);
      conc.jetAKg = Math.min(
        cap,
        Math.floor(conc.jetAKg ?? 0) + haul.fromTankKg,
      );
    } else {
      creditAirportFuelStock(world, origin, haul.fromTankKg);
    }
  }
  if (haul.boughtKg > 0) {
    creditAirportFuelStock(world, origin, haul.boughtKg);
    if (haul.boughtUsd > 0) {
      applyWalletDelta(state, {
        amountUsd: haul.boughtUsd,
        kind: 'port_fbo_jet_a',
        atTick: world.tick,
        icao: origin,
        missionId: mission.id,
        note: `Jet-A haul cancelled · ${origin}`,
      });
    }
  }
  if (!haul.orderId) return;
  const order = (world.demandOrders ?? []).find((o) => o.id === haul.orderId);
  if (!order || order.commodityId !== 'fuel') return;
  if (order.status === 'filled' || order.remainingKg <= 0) {
    order.status = 'open';
    order.remainingKg = haul.kg;
    order.wantedKg = Math.max(order.wantedKg, haul.kg);
    if (order.expiresAtTick <= world.tick) {
      order.expiresAtTick = world.tick + 96;
    }
  }
}
