/**
 * Player FBO — company base + bonded contract warehouse.
 * Spot inventory removed (Warehouses + Demand Board).
 */

import {
  getCommodity,
  hubTierOf,
  routeDistanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import {
  cargoOpsIsUnlocked,
  cargoOpsPayMult,
  isCargoOpsCommodityId,
  normalizeCareerCargoOps,
} from './career-cargo-ops.js';
import {
  FBO_PARKING_FEE_MULT,
  FBO_SERVICE_COST_MULT,
  findPlayerFboAtIcao,
} from './career-fbo-perks.js';
import { ensureCompanyCrew, refreshCrewHirePool } from './career-crew.js';
import { applyWalletDelta } from './career-ledger.js';
import {
  getAircraftClass,
  recomputeMissionTotals,
  releaseShipmentReservation,
  reserveShipmentLot,
  clearPlayerInbound,
  syncPlayerInbound,
} from './career-mission.js';
import {
  assignAircraftToMission,
  findPlayerAircraft,
  releaseAircraftOnCancel,
} from './career-fleet.js';
import {
  findCareerPlayerAirframe,
  resolveAirframeMaxRangeNm,
} from './career-player-airframes.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerMissionsState,
  CommodityId,
  FreighterClassId,
  HubTier,
  MissionIntent,
  MissionLotLine,
  PlayerAircraft,
  PlayerFbo,
  PlayerFboHold,
  PlayerFboState,
  PlayerFboStockPile,
  PlayerFboTier,
  ShipmentLot,
} from './types/career-economy.js';

/** Bonded warehouse capacity by FBO tier. */
export const FBO_CAPACITY_KG: Record<PlayerFboTier, number> = {
  1: 3_000,
  2: 8_000,
};

/** @deprecated use FBO_CAPACITY_KG[1] */
export const FBO_T1_CAPACITY_KG = FBO_CAPACITY_KG[1];

/** Max owned FBOs (Phase 4c: three bases). */
export const FBO_MAX_OWNED = 3;

/** @deprecated alias */
export const FBO_PHASE1_MAX_OWNED = FBO_MAX_OWNED;

/** Premium on base T1 CAPEX for a second (non-home) FBO. */
export const FBO_SECOND_BUY_MULT = 1.4;

/** Premium on base T1 CAPEX for a third FBO. */
export const FBO_THIRD_BUY_MULT = 1.8;

/** Owned airframes required before buying a second FBO. */
export const FBO_SECOND_MIN_OWNED_AIRCRAFT = 2;

/** Owned airframes required before buying a third FBO. */
export const FBO_THIRD_MIN_OWNED_AIRCRAFT = 3;

/** CAPEX for T1 by hub tier. */
export const FBO_T1_BUY_USD: Record<HubTier, number> = {
  spoke: 25_000,
  regional: 45_000,
  major: 80_000,
};

/** CAPEX to upgrade T1 → T2 by hub tier. */
export const FBO_T2_UPGRADE_USD: Record<HubTier, number> = {
  spoke: 18_000,
  regional: 32_000,
  major: 55_000,
};

/** Storage USD per kg per economy day (Dry). */
export const FBO_STORAGE_USD_PER_KG_DAY = 0.02;

/** Electronics / machinery storage multiplier vs Dry. */
export const FBO_STORAGE_VALUE_MULT = 2;

/** Wallet penalty fraction of hold pay when the bonded deadline expires. */
export const FBO_HOLD_EXPIRE_PENALTY_FRAC = 0.1;

/** Floor penalty USD on expired hold. */
export const FBO_HOLD_EXPIRE_PENALTY_MIN_USD = 50;

/** Reroute fee as a fraction of hold pay. */
export const FBO_REROUTE_FEE_FRAC = 0.12;

/** Minimum reroute fee USD. */
export const FBO_REROUTE_FEE_MIN_USD = 75;

/** Contract pay haircut when rerouting to a same-or-shorter leg (convenience tax). */
export const FBO_REROUTE_PAY_HAIRCUT = 0.08;

/** Extra reroute fee per nm when the new leg is longer than the original. */
export const FBO_REROUTE_EXTRA_USD_PER_NM = 0.15;

/**
 * Longer-leg contract pay bump per extra nm (fraction of pay).
 * 0.00012 → +1.2% per 100 nm; hits the 12% cap at ~1,000 nm extra.
 */
export const FBO_REROUTE_LONGER_PAY_BUMP_PER_NM = 0.00012;

/** Cap on longer-leg pay bump as a fraction of current hold pay. */
export const FBO_REROUTE_LONGER_PAY_BUMP_CAP = 0.12;

/** Cargo Ops rep hit when a hold expires unused. */
export const FBO_HOLD_EXPIRE_REP_HIT = -3;

export {
  FBO_PARKING_FEE_MULT,
  FBO_SERVICE_COST_MULT,
  findPlayerFboAtIcao,
  fboParkingFeeMult,
  fboServiceCostMult,
} from './career-fbo-perks.js';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function holdRouteDistanceNm(
  world: Pick<CareerEconomyWorld, 'airports'>,
  originIcao: string,
  destIcao: string,
): number | undefined {
  const nm = routeDistanceNm(world, originIcao, destIcao);
  if (nm === undefined || !Number.isFinite(nm)) return undefined;
  return Math.round(nm);
}

function clampRep(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function lotAvailableKg(lot: ShipmentLot): number {
  if (lot.status !== 'available' && lot.status !== 'reserved') {
    return 0;
  }
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

export function emptyPlayerFboState(): PlayerFboState {
  return { fbos: [], holds: [], stock: [] };
}

export function normalizePlayerFboState(raw: unknown): PlayerFboState {
  if (!raw || typeof raw !== 'object') return emptyPlayerFboState();
  const r = raw as Record<string, unknown>;
  const fbos: PlayerFbo[] = [];
  if (Array.isArray(r.fbos)) {
    for (const row of r.fbos) {
      if (!row || typeof row !== 'object') continue;
      const f = row as Record<string, unknown>;
      const id = typeof f.id === 'string' ? f.id.trim() : '';
      const icao =
        typeof f.icao === 'string' ? f.icao.trim().toUpperCase() : '';
      const capacityKg =
        typeof f.capacityKg === 'number' && Number.isFinite(f.capacityKg)
          ? Math.max(0, Math.floor(f.capacityKg))
          : 0;
      const tier: PlayerFboTier = f.tier === 2 ? 2 : 1;
      if (!id || !icao || capacityKg <= 0) continue;
      fbos.push({
        id,
        icao,
        tier,
        capacityKg: Math.max(capacityKg, FBO_CAPACITY_KG[tier]),
      });
    }
  }
  const holds: PlayerFboHold[] = [];
  if (Array.isArray(r.holds)) {
    for (const row of r.holds) {
      if (!row || typeof row !== 'object') continue;
      const h = row as Record<string, unknown>;
      const id = typeof h.id === 'string' ? h.id.trim() : '';
      const fboId = typeof h.fboId === 'string' ? h.fboId.trim() : '';
      const lotId = typeof h.lotId === 'string' ? h.lotId.trim() : '';
      const commodityId =
        typeof h.commodityId === 'string' ? (h.commodityId as CommodityId) : null;
      const originIcao =
        typeof h.originIcao === 'string'
          ? h.originIcao.trim().toUpperCase()
          : '';
      const destIcao =
        typeof h.destIcao === 'string' ? h.destIcao.trim().toUpperCase() : '';
      const cargoKg =
        typeof h.cargoKg === 'number' && Number.isFinite(h.cargoKg)
          ? Math.max(0, Math.floor(h.cargoKg))
          : 0;
      const payUsd =
        typeof h.payUsd === 'number' && Number.isFinite(h.payUsd)
          ? Math.max(0, money(h.payUsd))
          : 0;
      const acceptedAtTick =
        typeof h.acceptedAtTick === 'number' && Number.isFinite(h.acceptedAtTick)
          ? Math.max(0, Math.floor(h.acceptedAtTick))
          : 0;
      const deadlineTick =
        typeof h.deadlineTick === 'number' && Number.isFinite(h.deadlineTick)
          ? Math.max(0, Math.floor(h.deadlineTick))
          : 0;
      const distanceNm =
        typeof h.distanceNm === 'number' && Number.isFinite(h.distanceNm)
          ? Math.max(0, Math.round(h.distanceNm))
          : undefined;
      if (
        !id ||
        !fboId ||
        !lotId ||
        !commodityId ||
        !originIcao ||
        !destIcao ||
        cargoKg <= 0
      ) {
        continue;
      }
      holds.push({
        id,
        fboId,
        lotId,
        commodityId,
        originIcao,
        destIcao,
        cargoKg,
        payUsd,
        urgency: h.urgency === 'urgent' ? 'urgent' : 'normal',
        reason: typeof h.reason === 'string' ? h.reason : '',
        acceptedAtTick,
        deadlineTick,
        ...(distanceNm !== undefined ? { distanceNm } : {}),
      });
    }
  }
  const stock: PlayerFboStockPile[] = [];
  return { fbos, holds, stock };
}

export function ensurePlayerFbos(state: CareerMissionsState): PlayerFboState {
  state.playerFbos = normalizePlayerFboState(state.playerFbos);
  return state.playerFbos;
}

export function quoteFboTier1BuyUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): number {
  const ap = world.airports.find(
    (a) => a.icao.toUpperCase() === icao.trim().toUpperCase(),
  );
  return FBO_T1_BUY_USD[hubTierOf(ap ?? { icao })];
}

/** CAPEX for buying a T1 FBO here (1st = base; 2nd/3rd = progressive premium). */
export function quoteFboBuyUsd(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): number {
  const base = quoteFboTier1BuyUsd(world, icao);
  const owned = ensurePlayerFbos(state).fbos.length;
  if (owned === 0) return base;
  if (owned === 1) return Math.round(base * FBO_SECOND_BUY_MULT);
  return Math.round(base * FBO_THIRD_BUY_MULT);
}

function ownedAircraftCount(state: CareerMissionsState): number {
  return state.fleet.filter((a) => (a.ownership ?? 'owned') === 'owned').length;
}

function cargoOpsAllowsSecondFbo(state: CareerMissionsState): boolean {
  const ops = normalizeCareerCargoOps(state.cargoOps);
  return ops.commodities.electronics.unlocked === true;
}

function cargoOpsAllowsThirdFbo(state: CareerMissionsState): boolean {
  const ops = normalizeCareerCargoOps(state.cargoOps);
  return ops.commodities.perishables.unlocked === true;
}

function hasTier2Fbo(state: CareerMissionsState): boolean {
  return ensurePlayerFbos(state).fbos.some((f) => f.tier >= 2);
}

/**
 * Whether the company may purchase a T1 FBO at this ICAO (and why not).
 */
export function canBuyFboAtIcao(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): { ok: boolean; reason?: string; buyUsd: number | null } {
  if (!state.hubSelected || !state.homeHubIcao) {
    return { ok: false, reason: 'Select a starter hub first', buyUsd: null };
  }
  const hub = icao.trim().toUpperCase();
  const airport = world.airports.find((a) => a.icao.toUpperCase() === hub);
  if (!airport) {
    return { ok: false, reason: `Unknown career hub: ${hub}`, buyUsd: null };
  }
  const fbos = ensurePlayerFbos(state);
  if (fbos.fbos.some((f) => f.icao === hub)) {
    return { ok: false, reason: `FBO already owned at ${hub}`, buyUsd: null };
  }
  if (fbos.fbos.length >= FBO_MAX_OWNED) {
    return {
      ok: false,
      reason: `Company already owns ${FBO_MAX_OWNED} FBOs`,
      buyUsd: null,
    };
  }
  const home = state.homeHubIcao.trim().toUpperCase();
  if (fbos.fbos.length === 0 && hub !== home) {
    return {
      ok: false,
      reason: `First FBO must be at home hub ${home}`,
      buyUsd: null,
    };
  }
  const buyUsd = quoteFboBuyUsd(state, world, hub);
  if (fbos.fbos.length === 1) {
    if (ownedAircraftCount(state) < FBO_SECOND_MIN_OWNED_AIRCRAFT) {
      return {
        ok: false,
        reason: `Need at least ${FBO_SECOND_MIN_OWNED_AIRCRAFT} owned aircraft for a second FBO`,
        buyUsd,
      };
    }
    if (!cargoOpsAllowsSecondFbo(state)) {
      return {
        ok: false,
        reason: 'Unlock Cargo Ops Value (electronics) before a second FBO',
        buyUsd,
      };
    }
  }
  if (fbos.fbos.length === 2) {
    if (ownedAircraftCount(state) < FBO_THIRD_MIN_OWNED_AIRCRAFT) {
      return {
        ok: false,
        reason: `Need at least ${FBO_THIRD_MIN_OWNED_AIRCRAFT} owned aircraft for a third FBO`,
        buyUsd,
      };
    }
    if (!hasTier2Fbo(state)) {
      return {
        ok: false,
        reason: 'Upgrade one FBO to Tier 2 before a third base',
        buyUsd,
      };
    }
    if (!cargoOpsAllowsThirdFbo(state)) {
      return {
        ok: false,
        reason: 'Unlock Cargo Ops Time (perishables) before a third FBO',
        buyUsd,
      };
    }
  }
  return { ok: true, buyUsd };
}

export function fboBondedUsedKg(state: CareerMissionsState, fboId: string): number {
  const fbos = ensurePlayerFbos(state);
  return fbos.holds
    .filter((h) => h.fboId === fboId)
    .reduce((sum, h) => sum + h.cargoKg, 0);
}

export function fboSpotUsedKg(_state: CareerMissionsState, _fboId: string): number {
  return 0;
}

export function fboUsedKg(state: CareerMissionsState, fboId: string): number {
  return fboBondedUsedKg(state, fboId);
}

export function fboFreeKg(state: CareerMissionsState, fboId: string): number {
  const fbos = ensurePlayerFbos(state);
  const fbo = fbos.fbos.find((f) => f.id === fboId);
  if (!fbo) return 0;
  return Math.max(0, fbo.capacityKg - fboUsedKg(state, fboId));
}

export function quoteFboTier2UpgradeUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): number {
  const ap = world.airports.find(
    (a) => a.icao.toUpperCase() === icao.trim().toUpperCase(),
  );
  return FBO_T2_UPGRADE_USD[hubTierOf(ap ?? { icao })];
}

function storageUsdPerKgDay(commodityId: CommodityId): number {
  if (commodityId === 'electronics' || commodityId === 'machinery') {
    return FBO_STORAGE_USD_PER_KG_DAY * FBO_STORAGE_VALUE_MULT;
  }
  return FBO_STORAGE_USD_PER_KG_DAY;
}

export function isFboHoldCommodityAllowed(commodityId: CommodityId): boolean {
  const def = getCommodity(commodityId);
  if (def.kind === 'fuel' || def.kind === 'mro') return false;
  if (commodityId === 'perishables' || def.perishable) return false;
  return true;
}

/** Alias — spot uses the same cargo allowlist as bonded holds. */
export const isFboSpotCommodityAllowed = isFboHoldCommodityAllowed;

/**
 * @deprecated FBO spot removed — Warehouses + Demand Board.
 */
export function buyFboSpot(
  _state: CareerMissionsState,
  _world: CareerEconomyWorld,
  _opts: { icao: string; commodityId: CommodityId; kg: number },
): never {
  throw new Error(
    'FBO spot trading removed — use Warehouses at port pickup hubs and the Demand Board',
  );
}

/**
 * @deprecated FBO spot removed — Warehouses + Demand Board.
 */
export function sellFboSpot(
  _state: CareerMissionsState,
  _world: CareerEconomyWorld,
  _opts: { icao: string; commodityId: CommodityId; kg: number },
): never {
  throw new Error(
    'FBO spot trading removed — use Warehouses at port pickup hubs and the Demand Board',
  );
}

/**
 * Purchase Tier-1 FBO. First must be home hub; 2nd/3rd may be other career hubs
 * (progressive CAPEX + fleet / Cargo Ops / T2 gates).
 */
export function buyFboTier1(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports' | 'tick'>,
  icao: string,
): { state: CareerMissionsState; debitUsd: number; fbo: PlayerFbo } {
  const hub = icao.trim().toUpperCase();
  const gate = canBuyFboAtIcao(state, world, hub);
  if (!gate.ok) {
    throw new Error(gate.reason ?? 'Cannot buy FBO here');
  }
  const debitUsd = gate.buyUsd ?? quoteFboBuyUsd(state, world, hub);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `FBO purchase $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  const fbos = ensurePlayerFbos(state);
  const fbo: PlayerFbo = {
    id: nextId('fbo', world.tick),
    icao: hub,
    tier: 1,
    capacityKg: FBO_CAPACITY_KG[1],
  };
  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'fbo_buy',
    atTick: world.tick,
    icao: hub,
    note: `FBO T1 · ${hub}`,
  });
  fbos.fbos.push(fbo);
  ensureCompanyCrew(state, { tick: world.tick });
  refreshCrewHirePool(state, world, { force: true });
  return { state, debitUsd, fbo };
}

/**
 * Upgrade an owned FBO from Tier 1 → Tier 2 (same ICAO).
 * Raises capacity and strengthens parking / fuel / MRO perks.
 */
export function upgradeFboToTier2(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports' | 'tick'>,
  fboId: string,
): { state: CareerMissionsState; debitUsd: number; fbo: PlayerFbo } {
  const fbos = ensurePlayerFbos(state);
  const fbo = fbos.fbos.find((f) => f.id === fboId);
  if (!fbo) throw new Error(`Unknown FBO ${fboId}`);
  if (fbo.tier >= 2) {
    throw new Error(`FBO at ${fbo.icao} is already Tier ${fbo.tier}`);
  }

  const debitUsd = quoteFboTier2UpgradeUsd(world, fbo.icao);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `FBO upgrade $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'fbo_buy',
    atTick: world.tick,
    icao: fbo.icao,
    note: `FBO T2 upgrade · ${fbo.icao}`,
  });
  fbo.tier = 2;
  fbo.capacityKg = Math.max(fbo.capacityKg, FBO_CAPACITY_KG[2]);
  return { state, debitUsd, fbo };
}

/**
 * Reserve a market lot into bonded FBO storage (no inboundPending).
 */
export function holdLotAtFbo(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { lotId: string; cargoKg?: number },
): { state: CareerMissionsState; hold: PlayerFboHold } {
  const lot = world.lots.find((l) => l.id === opts.lotId);
  if (!lot) throw new Error(`Unknown lot ${opts.lotId}`);
  if (lot.status !== 'available' && lot.status !== 'reserved') {
    throw new Error(`Lot ${opts.lotId} is not bookable (status=${lot.status})`);
  }
  if (!isFboHoldCommodityAllowed(lot.commodityId)) {
    throw new Error(
      'Perishables cannot be held at the FBO — accept and fly them promptly',
    );
  }
  if (!cargoOpsIsUnlocked(state.cargoOps, lot.commodityId)) {
    const name = getCommodity(lot.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — fly Dry freights to unlock`,
    );
  }

  const fbo = findPlayerFboAtIcao(state, lot.originIcao);
  if (!fbo) {
    throw new Error(
      `No FBO at ${lot.originIcao} — buy an FBO at your home hub first`,
    );
  }
  if (lot.originIcao.toUpperCase() !== fbo.icao) {
    throw new Error(`Lot origin must match FBO ${fbo.icao}`);
  }

  const avail = lotAvailableKg(lot);
  if (avail <= 0) throw new Error(`Lot ${lot.id} has no remaining cargo`);

  const used = fboUsedKg(state, fbo.id);
  const room = Math.max(0, fbo.capacityKg - used);
  if (room <= 0) {
    throw new Error(
      `FBO at ${fbo.icao} is full (${fbo.capacityKg.toLocaleString()} kg)`,
    );
  }

  const requested =
    opts.cargoKg !== undefined ? Math.floor(opts.cargoKg) : Math.min(avail, room);
  if (opts.cargoKg !== undefined && requested > room) {
    throw new Error(
      `FBO at ${fbo.icao} is full (${used.toLocaleString()}/${fbo.capacityKg.toLocaleString()} kg) — need ${requested} kg free`,
    );
  }
  const cargoKg = Math.min(requested, avail, room);
  if (cargoKg <= 0) {
    throw new Error(
      `Nothing to hold: requested=${requested} avail=${avail} room=${room}`,
    );
  }

  const { payUsd: reservedPay } = reserveShipmentLot(world, lot.id, cargoKg);
  const payMult = cargoOpsPayMult(state.cargoOps, lot.commodityId);
  const payUsd = Math.max(1, Math.round(reservedPay * payMult));

  const hold: PlayerFboHold = {
    id: nextId('fboh', world.tick),
    fboId: fbo.id,
    lotId: lot.id,
    commodityId: lot.commodityId,
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    cargoKg,
    payUsd,
    urgency: lot.urgency,
    reason: lot.reason,
    acceptedAtTick: world.tick,
    deadlineTick: lot.expiresAtTick,
    distanceNm: holdRouteDistanceNm(world, lot.originIcao, lot.destIcao),
  };
  ensurePlayerFbos(state).holds.push(hold);
  return { state, hold };
}

/** Cancel a bonded hold and release the lot reservation (no payout). */
export function cancelFboHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  holdId: string,
): { state: CareerMissionsState; releasedKg: number } {
  const fbos = ensurePlayerFbos(state);
  const idx = fbos.holds.findIndex((h) => h.id === holdId);
  if (idx < 0) throw new Error(`Unknown FBO hold ${holdId}`);
  const hold = fbos.holds[idx]!;
  const lot = world.lots.find((l) => l.id === hold.lotId);
  if (lot) {
    releaseShipmentReservation(world, hold.lotId, hold.cargoKg);
  }
  fbos.holds.splice(idx, 1);
  return { state, releasedKg: hold.cargoKg };
}

export function quoteFboRerouteUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  hold: Pick<PlayerFboHold, 'originIcao' | 'destIcao' | 'payUsd'>,
  newDestIcao: string,
): number {
  const dest = newDestIcao.trim().toUpperCase();
  const origin = hold.originIcao.trim().toUpperCase();
  const prevDest = hold.destIcao.trim().toUpperCase();
  if (!dest || dest === origin) {
    throw new Error('Reroute destination must be a different airport than origin');
  }
  if (dest === prevDest) {
    throw new Error(`Hold is already routed to ${dest}`);
  }
  const airport = world.airports.find((a) => a.icao.toUpperCase() === dest);
  if (!airport) {
    throw new Error(`Unknown career hub: ${dest}`);
  }

  const base = Math.max(
    FBO_REROUTE_FEE_MIN_USD,
    hold.payUsd * FBO_REROUTE_FEE_FRAC,
  );
  const oldNm = routeDistanceNm(world, origin, prevDest) ?? 0;
  const newNm = routeDistanceNm(world, origin, dest) ?? 0;
  const extraNm = Math.max(0, newNm - oldNm);
  return money(base + extraNm * FBO_REROUTE_EXTRA_USD_PER_NM);
}

/** True when the new OD is strictly longer than the bonded hold's current OD. */
export function fboRerouteIsLongerLeg(
  world: Pick<CareerEconomyWorld, 'airports'>,
  hold: Pick<PlayerFboHold, 'originIcao' | 'destIcao'>,
  newDestIcao: string,
): boolean {
  const origin = hold.originIcao.trim().toUpperCase();
  const prevDest = hold.destIcao.trim().toUpperCase();
  const dest = newDestIcao.trim().toUpperCase();
  const oldNm = routeDistanceNm(world, origin, prevDest) ?? 0;
  const newNm = routeDistanceNm(world, origin, dest) ?? 0;
  return newNm > oldNm;
}

/** Extra nm when rerouting to a longer OD (0 if same/shorter). */
export function fboRerouteExtraNm(
  world: Pick<CareerEconomyWorld, 'airports'>,
  hold: Pick<PlayerFboHold, 'originIcao' | 'destIcao'>,
  newDestIcao: string,
): number {
  const origin = hold.originIcao.trim().toUpperCase();
  const prevDest = hold.destIcao.trim().toUpperCase();
  const dest = newDestIcao.trim().toUpperCase();
  const oldNm = routeDistanceNm(world, origin, prevDest) ?? 0;
  const newNm = routeDistanceNm(world, origin, dest) ?? 0;
  return Math.max(0, newNm - oldNm);
}

/**
 * Contract pay after a reroute quote.
 * Longer leg: mild bump vs extra nm (capped) — can beat original pay.
 * Same/shorter leg: 8% convenience haircut.
 */
export function quoteFboReroutePayAfterUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  hold: Pick<PlayerFboHold, 'originIcao' | 'destIcao' | 'payUsd'>,
  newDestIcao: string,
): {
  payAfterUsd: number;
  haircutApplied: boolean;
  bumpApplied: boolean;
  bumpFrac: number;
} {
  // Validate destination the same way as the fee quote.
  quoteFboRerouteUsd(world, hold, newDestIcao);
  const extraNm = fboRerouteExtraNm(world, hold, newDestIcao);
  if (extraNm > 0) {
    const bumpFrac = Math.min(
      FBO_REROUTE_LONGER_PAY_BUMP_CAP,
      extraNm * FBO_REROUTE_LONGER_PAY_BUMP_PER_NM,
    );
    return {
      payAfterUsd: Math.max(1, money(hold.payUsd * (1 + bumpFrac))),
      haircutApplied: false,
      bumpApplied: bumpFrac > 0,
      bumpFrac,
    };
  }
  return {
    payAfterUsd: Math.max(
      1,
      money(hold.payUsd * (1 - FBO_REROUTE_PAY_HAIRCUT)),
    ),
    haircutApplied: true,
    bumpApplied: false,
    bumpFrac: 0,
  };
}

/**
 * Amend bonded hold destination for a fee.
 * Same/shorter leg: mild pay haircut. Longer leg: capped pay bump for extra nm.
 * Lot reservation stays; delivery OD follows the hold on release/settle.
 */
export function rerouteFboHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; destIcao: string },
): {
  state: CareerMissionsState;
  debitUsd: number;
  hold: PlayerFboHold;
  previousDestIcao: string;
  haircutApplied: boolean;
  bumpApplied: boolean;
} {
  const fbos = ensurePlayerFbos(state);
  const hold = fbos.holds.find((h) => h.id === opts.holdId);
  if (!hold) throw new Error(`Unknown FBO hold ${opts.holdId}`);

  const previousDestIcao = hold.destIcao;
  const debitUsd = quoteFboRerouteUsd(world, hold, opts.destIcao);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Reroute costs $${debitUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }

  const dest = opts.destIcao.trim().toUpperCase();
  const { payAfterUsd, haircutApplied, bumpApplied } = quoteFboReroutePayAfterUsd(
    world,
    hold,
    dest,
  );
  hold.destIcao = dest;
  hold.distanceNm = holdRouteDistanceNm(world, hold.originIcao, dest);
  hold.payUsd = payAfterUsd;
  hold.reason = `${hold.reason} · rerouted→${dest}`.slice(0, 120);

  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'fbo_reroute',
    atTick: world.tick,
    icao: hold.originIcao,
    note: `Reroute · ${hold.originIcao} ${previousDestIcao}→${dest}`,
  });

  return {
    state,
    debitUsd,
    hold,
    previousDestIcao,
    haircutApplied,
    bumpApplied,
  };
}

/**
 * Promote a bonded hold into a normal accepted mission (publishes inbound).
 * Lot reservation is already held — does not re-reserve.
 */
export function releaseFboHoldToMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    holdId: string;
    aircraftClassId?: FreighterClassId;
    maxCargoKg?: number;
    missionId?: string;
  },
): { state: CareerMissionsState; mission: MissionIntent } {
  const fbos = ensurePlayerFbos(state);
  const idx = fbos.holds.findIndex((h) => h.id === opts.holdId);
  if (idx < 0) throw new Error(`Unknown FBO hold ${opts.holdId}`);
  const hold = fbos.holds[idx]!;

  if (world.tick >= hold.deadlineTick) {
    throw new Error('Hold deadline has passed — it will expire on the next settle');
  }

  const lot = world.lots.find((l) => l.id === hold.lotId);
  if (!lot) {
    throw new Error(`Lot ${hold.lotId} no longer exists — cancel this hold`);
  }
  if (lot.status === 'expired' || lot.status === 'delivered') {
    throw new Error(`Lot ${hold.lotId} is ${lot.status}`);
  }
  if (lot.reservedKg < hold.cargoKg) {
    throw new Error(
      `Lot reservation mismatch (reserved ${lot.reservedKg} kg, hold ${hold.cargoKg} kg)`,
    );
  }

  const aircraft = getAircraftClass(opts.aircraftClassId ?? 'narrow_freighter');
  const maxCargoKg =
    opts.maxCargoKg !== undefined &&
    Number.isFinite(opts.maxCargoKg) &&
    opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : aircraft.maxCargoKg;
  if (hold.cargoKg > maxCargoKg) {
    throw new Error(
      `Hold ${hold.cargoKg} kg exceeds aircraft capacity ${maxCargoKg} kg`,
    );
  }

  const line: MissionLotLine = {
    shipmentLotId: hold.lotId,
    commodityId: hold.commodityId,
    cargoKg: hold.cargoKg,
    payUsd: hold.payUsd,
    urgency: hold.urgency,
    reason: hold.reason,
    deadlineTick: hold.deadlineTick,
  };

  const id =
    opts.missionId?.trim() ||
    `msn_${world.tick}_${hold.originIcao}_${hold.destIcao}_${Math.floor(Math.random() * 1e6)}`;

  const mission = recomputeMissionTotals({
    id,
    lots: [line],
    shipmentLotId: hold.lotId,
    commodityId: hold.commodityId,
    originIcao: hold.originIcao,
    destIcao: hold.destIcao,
    cargoKg: hold.cargoKg,
    pax: 0,
    aircraftClassId: aircraft.id,
    rolesPackRelPath: aircraft.rolesPackRelPath,
    deadlineTick: hold.deadlineTick,
    payUsd: hold.payUsd,
    urgency: hold.urgency,
    reason: hold.reason,
    status: 'accepted',
    acceptedAtTick: world.tick,
  });

  fbos.holds.splice(idx, 1);
  state.missions = [...state.missions, mission];
  syncPlayerInbound(world, mission);
  return { state, mission };
}

export type FboSplitLegInput = {
  aircraftId: string;
  cargoKg: number;
};

/** Catalog-first cargo/range ceilings for a fleet airframe. */
export function resolveFleetAirframeLimits(acf: PlayerAircraft): {
  maxCargoKg: number;
  maxRangeNm: number;
} {
  const cls = getAircraftClass(acf.aircraftClassId);
  const catalog = acf.airframeTypeId
    ? findCareerPlayerAirframe(acf.airframeTypeId)
    : undefined;
  const maxCargoKg =
    typeof catalog?.maxCargoKg === 'number' &&
    Number.isFinite(catalog.maxCargoKg) &&
    catalog.maxCargoKg > 0
      ? Math.floor(catalog.maxCargoKg)
      : cls.maxCargoKg;
  return {
    maxCargoKg,
    maxRangeNm: resolveAirframeMaxRangeNm(
      acf.airframeTypeId,
      acf.aircraftClassId,
    ),
  };
}

/**
 * Split a bonded hold into N accepted sister missions (1 airframe each).
 * Remainder stays bonded without inbound. Each leg publishes soft-fill now
 * (same as Dispatch release). Lot reservation is already held — not re-reserved.
 */
export function splitFboHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; legs: FboSplitLegInput[] },
): {
  state: CareerMissionsState;
  missions: MissionIntent[];
  hold: PlayerFboHold | null;
  allocatedKg: number;
  remainingKg: number;
} {
  const fbos = ensurePlayerFbos(state);
  const idx = fbos.holds.findIndex((h) => h.id === opts.holdId);
  if (idx < 0) throw new Error(`Unknown FBO hold ${opts.holdId}`);
  const hold = fbos.holds[idx]!;

  if (world.tick >= hold.deadlineTick) {
    throw new Error('Hold deadline has passed — it will expire on the next settle');
  }
  if (!opts.legs?.length) {
    throw new Error('Split requires at least one leg');
  }

  const lot = world.lots.find((l) => l.id === hold.lotId);
  if (!lot) {
    throw new Error(`Lot ${hold.lotId} no longer exists — cancel this hold`);
  }
  if (lot.status === 'expired' || lot.status === 'delivered') {
    throw new Error(`Lot ${hold.lotId} is ${lot.status}`);
  }
  if (lot.reservedKg < hold.cargoKg) {
    throw new Error(
      `Lot reservation mismatch (reserved ${lot.reservedKg} kg, hold ${hold.cargoKg} kg)`,
    );
  }

  const seen = new Set<string>();
  const prepared: Array<{
    acf: PlayerAircraft;
    cargoKg: number;
    maxCargoKg: number;
    maxRangeNm: number;
  }> = [];

  for (const leg of opts.legs) {
    const aircraftId = leg.aircraftId?.trim();
    if (!aircraftId) throw new Error('Each split leg needs aircraftId');
    if (seen.has(aircraftId)) {
      throw new Error(`Duplicate aircraft in split: ${aircraftId}`);
    }
    seen.add(aircraftId);

    const cargoKg = Math.floor(leg.cargoKg);
    if (!(cargoKg > 0)) {
      throw new Error('Each split leg needs cargoKg > 0');
    }

    const acf = findPlayerAircraft(state, aircraftId);
    if (!acf) throw new Error(`Unknown aircraft ${aircraftId}`);
    if (acf.status !== 'parked') {
      throw new Error(`Aircraft ${acf.label} must be parked to take a split leg`);
    }
    if (acf.locationIcao.toUpperCase() !== hold.originIcao.toUpperCase()) {
      throw new Error(
        `Aircraft ${acf.label} is at ${acf.locationIcao}, hold origin is ${hold.originIcao}`,
      );
    }
    if (acf.leaseOverdue) {
      throw new Error(`Aircraft ${acf.label} has an overdue lease payment`);
    }

    const limits = resolveFleetAirframeLimits(acf);
    if (cargoKg > limits.maxCargoKg) {
      throw new Error(
        `${acf.label} max cargo is ${limits.maxCargoKg.toLocaleString()} kg (leg ${cargoKg.toLocaleString()} kg)`,
      );
    }

    const distanceNm =
      hold.distanceNm ??
      holdRouteDistanceNm(world, hold.originIcao, hold.destIcao);
    if (
      distanceNm != null &&
      Number.isFinite(distanceNm) &&
      distanceNm > limits.maxRangeNm
    ) {
      throw new Error(
        `${acf.label} max range is ${limits.maxRangeNm.toLocaleString()} nm (route ${Math.round(distanceNm).toLocaleString()} nm)`,
      );
    }

    prepared.push({
      acf,
      cargoKg,
      maxCargoKg: limits.maxCargoKg,
      maxRangeNm: limits.maxRangeNm,
    });
  }

  const allocatedKg = prepared.reduce((sum, p) => sum + p.cargoKg, 0);
  if (allocatedKg > hold.cargoKg) {
    throw new Error(
      `Split allocates ${allocatedKg.toLocaleString()} kg but hold has ${hold.cargoKg.toLocaleString()} kg`,
    );
  }

  const totalKg = hold.cargoKg;
  const totalPay = hold.payUsd;
  const fullSplit = allocatedKg === totalKg;
  const missions: MissionIntent[] = [];
  let paySpent = 0;

  for (let i = 0; i < prepared.length; i++) {
    const { acf, cargoKg } = prepared[i]!;
    const cls = getAircraftClass(acf.aircraftClassId);
    const lastConsumesHold = fullSplit && i === prepared.length - 1;
    const payUsd = lastConsumesHold
      ? Math.max(1, money(totalPay - paySpent))
      : Math.max(1, money(totalPay * (cargoKg / totalKg)));
    paySpent = money(paySpent + payUsd);

    const line: MissionLotLine = {
      shipmentLotId: hold.lotId,
      commodityId: hold.commodityId,
      cargoKg,
      payUsd,
      urgency: hold.urgency,
      reason: hold.reason,
      deadlineTick: hold.deadlineTick,
    };
    const id = `msn_${world.tick}_${hold.originIcao}_${hold.destIcao}_${Math.floor(Math.random() * 1e6)}`;
    let mission = recomputeMissionTotals({
      id,
      lots: [line],
      shipmentLotId: hold.lotId,
      commodityId: hold.commodityId,
      originIcao: hold.originIcao,
      destIcao: hold.destIcao,
      cargoKg,
      pax: 0,
      aircraftClassId: cls.id,
      aircraftId: acf.id,
      airframeTypeId: acf.airframeTypeId,
      rolesPackRelPath: cls.rolesPackRelPath,
      deadlineTick: hold.deadlineTick,
      payUsd,
      urgency: hold.urgency,
      reason: `${hold.reason} · split`.slice(0, 120),
      status: 'accepted',
      acceptedAtTick: world.tick,
    });

    assignAircraftToMission(state, acf.id, mission.id, hold.originIcao, {
      requirePilotAtOrigin: false,
    });
    mission = {
      ...mission,
      aircraftId: acf.id,
      airframeTypeId: acf.airframeTypeId ?? mission.airframeTypeId,
    };

    state.missions = [...state.missions, mission];
    syncPlayerInbound(world, mission);
    missions.push(mission);
  }

  const remainingKg = totalKg - allocatedKg;
  let remaining: PlayerFboHold | null;
  if (remainingKg <= 0) {
    fbos.holds.splice(idx, 1);
    remaining = null;
  } else {
    hold.cargoKg = remainingKg;
    hold.payUsd = Math.max(1, money(totalPay - paySpent));
    remaining = hold;
  }

  return {
    state,
    missions,
    hold: remaining,
    allocatedKg,
    remainingKg: Math.max(0, remainingKg),
  };
}

/**
 * Cancel an Accepted/Dispatched mission and put its cargo back into bonded FBO
 * storage (same lot reservation — does not return cargo to the market).
 * Merges into an existing same-route hold when present.
 */
export function returnMissionToFboHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  missionId: string,
): {
  state: CareerMissionsState;
  mission: MissionIntent;
  hold: PlayerFboHold;
  merged: boolean;
} {
  const idx = state.missions.findIndex((m) => m.id === missionId);
  if (idx < 0) throw new Error(`Unknown mission ${missionId}`);
  const mission = state.missions[idx]!;

  if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
    throw new Error(
      `Cannot return mission to FBO in status=${mission.status}`,
    );
  }
  if (mission.crewOperated) {
    throw new Error(
      'This leg is crew-operated — wait for arrival or cancel from Dispatch',
    );
  }

  const cargoKg = Math.floor(mission.cargoKg);
  const payUsd = money(mission.payUsd);
  if (!(cargoKg > 0)) {
    throw new Error('Mission has no cargo to return');
  }

  const lotId =
    mission.shipmentLotId?.trim() ||
    mission.lots?.[0]?.shipmentLotId?.trim() ||
    '';
  if (!lotId) {
    throw new Error('Mission has no shipment lot to rebond');
  }

  const lot = world.lots.find((l) => l.id === lotId);
  if (!lot) {
    throw new Error(`Lot ${lotId} no longer exists — cancel the flight instead`);
  }
  if (lot.status === 'expired' || lot.status === 'delivered') {
    throw new Error(`Lot ${lotId} is ${lot.status}`);
  }

  const origin = mission.originIcao.trim().toUpperCase();
  const dest = mission.destIcao.trim().toUpperCase();
  const fbo = findPlayerFboAtIcao(state, origin);
  if (!fbo) {
    throw new Error(`No FBO at ${origin} — cannot rebond this cargo`);
  }

  const used = fboUsedKg(state, fbo.id);
  const room = Math.max(0, fbo.capacityKg - used);
  if (cargoKg > room) {
    throw new Error(
      `FBO at ${fbo.icao} is full (${used.toLocaleString()}/${fbo.capacityKg.toLocaleString()} kg) — need ${cargoKg.toLocaleString()} kg free`,
    );
  }

  // Keep market reservation; only move mission → hold.
  releaseAircraftOnCancel(state, mission);
  clearPlayerInbound(world, mission.id);
  const cancelled: MissionIntent = { ...mission, status: 'cancelled' };
  state.missions = state.missions.map((m, i) => (i === idx ? cancelled : m));

  const fbos = ensurePlayerFbos(state);
  const existingIdx = fbos.holds.findIndex(
    (h) =>
      h.fboId === fbo.id &&
      h.lotId === lotId &&
      h.originIcao.toUpperCase() === origin &&
      h.destIcao.toUpperCase() === dest,
  );

  let hold: PlayerFboHold;
  let merged = false;
  if (existingIdx >= 0) {
    const prev = fbos.holds[existingIdx]!;
    hold = {
      ...prev,
      cargoKg: prev.cargoKg + cargoKg,
      payUsd: money(prev.payUsd + payUsd),
      deadlineTick: Math.min(prev.deadlineTick, mission.deadlineTick),
      urgency:
        prev.urgency === 'urgent' || mission.urgency === 'urgent'
          ? 'urgent'
          : 'normal',
    };
    fbos.holds[existingIdx] = hold;
    merged = true;
  } else {
    hold = {
      id: nextId('fboh', world.tick),
      fboId: fbo.id,
      lotId,
      commodityId: mission.commodityId,
      originIcao: origin,
      destIcao: dest,
      cargoKg,
      payUsd: Math.max(1, payUsd),
      urgency: mission.urgency === 'urgent' ? 'urgent' : 'normal',
      reason: (mission.reason ?? lot.reason ?? 'Returned from Dispatch').slice(
        0,
        120,
      ),
      acceptedAtTick: world.tick,
      deadlineTick: mission.deadlineTick,
      distanceNm:
        holdRouteDistanceNm(world, origin, dest) ??
        routeDistanceNm(world, origin, dest) ??
        undefined,
    };
    fbos.holds.push(hold);
  }

  return { state, mission: cancelled, hold, merged };
}

function applyHoldExpireRepHit(
  state: CareerMissionsState,
  commodityId: CommodityId,
): void {
  if (!isCargoOpsCommodityId(commodityId)) return;
  const ops = normalizeCareerCargoOps(state.cargoOps);
  const before = ops.commodities[commodityId];
  ops.commodities[commodityId] = {
    ...before,
    rep: clampRep(before.rep + FBO_HOLD_EXPIRE_REP_HIT),
  };
  state.cargoOps = ops;
}

/**
 * Expire overdue / orphaned holds: release reservation, wallet penalty, rep hit.
 */
export function settleFboHoldExpiries(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): {
  expired: string[];
  penaltyUsd: number;
} {
  const fbos = ensurePlayerFbos(state);
  const expired: string[] = [];
  let penaltyUsd = 0;
  const keep: PlayerFboHold[] = [];

  for (const hold of fbos.holds) {
    const lot = world.lots.find((l) => l.id === hold.lotId);
    const pastDeadline = world.tick >= hold.deadlineTick;
    const lotDead =
      !lot ||
      lot.status === 'expired' ||
      lot.status === 'delivered' ||
      (lot.status === 'available' && lot.reservedKg < hold.cargoKg);

    if (!pastDeadline && !lotDead) {
      keep.push(hold);
      continue;
    }

    if (lot && lot.reservedKg > 0) {
      releaseShipmentReservation(world, hold.lotId, hold.cargoKg);
    }
    if (lot && pastDeadline && (lot.status === 'available' || lot.status === 'reserved')) {
      if (lot.reservedKg <= 0 && lot.quantityKg <= hold.cargoKg) {
        lot.status = 'expired';
      }
    }

    const rawPenalty = Math.max(
      FBO_HOLD_EXPIRE_PENALTY_MIN_USD,
      Math.round(hold.payUsd * FBO_HOLD_EXPIRE_PENALTY_FRAC),
    );
    const debit = Math.min(state.walletUsd, rawPenalty);
    if (debit > 0) {
      applyWalletDelta(state, {
        amountUsd: -debit,
        kind: 'fbo_hold_expire',
        atTick: world.tick,
        icao: hold.originIcao,
        note: `${hold.commodityId} · ${hold.originIcao}→${hold.destIcao}`,
      });
      penaltyUsd += debit;
    }
    applyHoldExpireRepHit(state, hold.commodityId);
    expired.push(hold.id);
  }

  fbos.holds = keep;
  return { expired, penaltyUsd: money(penaltyUsd) };
}

export type FboStorageSettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

/**
 * Daily bonded-storage fees for cargo sitting in FBOs.
 */
export function settleFboStorageFees(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): FboStorageSettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: FboStorageSettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;

  const fbos = ensurePlayerFbos(state);
  fbos.stock = [];
  if (fbos.holds.length === 0) {
    return { ...empty, daysCharged };
  }

  let requestedUsd = 0;
  for (const hold of fbos.holds) {
    const rate = storageUsdPerKgDay(hold.commodityId);
    requestedUsd += hold.cargoKg * rate * daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) {
    return { ...empty, daysCharged };
  }

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'fbo_storage',
      atTick: opts.toTick,
      note: `${daysCharged}d · ${fbos.holds.length} hold(s)`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

/** Run expiry then storage fees (tick / catch-up). */
export function settleFboOps(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { fromTick: number; toTick: number },
): {
  expired: string[];
  expirePenaltyUsd: number;
  storage: FboStorageSettleResult;
} {
  const exp = settleFboHoldExpiries(state, world);
  const storage = settleFboStorageFees(state, opts);
  return {
    expired: exp.expired,
    expirePenaltyUsd: exp.penaltyUsd,
    storage,
  };
}

/** Snapshot for API / Terminal UI. */
export function playerFboSnapshot(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'airports'>,
): {
  fbos: Array<
    PlayerFbo & {
      usedKg: number;
      bondedKg: number;
      spotKg: number;
      canUpgradeToTier2: boolean;
      upgradeUsd: number | null;
      parkingFeeMult: number;
      serviceCostMult: number;
    }
  >;
  holds: PlayerFboHold[];
  stock: PlayerFboStockPile[];
  canBuyAtHome: boolean;
  homeBuyUsd: number | null;
  /** Buy affordance for the ICAO currently being viewed (optional). */
  canBuyAtIcao?: boolean;
  buyAtIcaoUsd?: number | null;
  buyAtIcaoReason?: string | null;
  phase1MaxOwned: number;
  maxOwned: number;
} {
  const fbos = ensurePlayerFbos(state);
  const home = state.homeHubIcao?.trim().toUpperCase() || '';
  const homeGate =
    home && world ? canBuyFboAtIcao(state, world, home) : { ok: false, buyUsd: null };
  const canBuyAtHome = homeGate.ok;
  const homeBuyUsd = canBuyAtHome ? homeGate.buyUsd : null;
  return {
    fbos: fbos.fbos.map((f) => {
      const canUpgradeToTier2 = f.tier === 1;
      const upgradeUsd =
        canUpgradeToTier2 && world
          ? quoteFboTier2UpgradeUsd(world, f.icao)
          : canUpgradeToTier2
            ? FBO_T2_UPGRADE_USD.regional
            : null;
      return {
        ...f,
        usedKg: fboUsedKg(state, f.id),
        bondedKg: fboBondedUsedKg(state, f.id),
        spotKg: fboSpotUsedKg(state, f.id),
        canUpgradeToTier2,
        upgradeUsd,
        parkingFeeMult: FBO_PARKING_FEE_MULT[f.tier],
        serviceCostMult: FBO_SERVICE_COST_MULT[f.tier],
      };
    }),
    holds: fbos.holds.map((hold) => {
      if (hold.distanceNm != null || !world) return hold;
      const distanceNm = holdRouteDistanceNm(
        world,
        hold.originIcao,
        hold.destIcao,
      );
      if (distanceNm === undefined) return hold;
      hold.distanceNm = distanceNm;
      return hold;
    }),
    stock: fbos.stock.map((s) => ({ ...s })),
    canBuyAtHome,
    homeBuyUsd,
    phase1MaxOwned: FBO_MAX_OWNED,
    maxOwned: FBO_MAX_OWNED,
  };
}

/** Snapshot scoped to a terminal ICAO (adds local buy affordance). */
export function playerFboSnapshotAtIcao(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): ReturnType<typeof playerFboSnapshot> & {
  canBuyAtIcao: boolean;
  buyAtIcaoUsd: number | null;
  buyAtIcaoReason: string | null;
} {
  const base = playerFboSnapshot(state, world);
  const gate = canBuyFboAtIcao(state, world, icao);
  return {
    ...base,
    canBuyAtIcao: gate.ok,
    buyAtIcaoUsd: gate.buyUsd,
    buyAtIcaoReason: gate.ok ? null : gate.reason ?? null,
  };
}
