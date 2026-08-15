/**
 * FBO spot inventory helpers with no career-mission import (avoids cycles).
 */

import type {
  CareerMissionsState,
  CommodityId,
  PlayerFbo,
  PlayerFboState,
  PlayerFboStockPile,
} from './types/career-economy.js';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function ensureState(state: CareerMissionsState): PlayerFboState {
  const raw = state.playerFbos;
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray(raw.fbos) &&
    Array.isArray(raw.holds)
  ) {
    if (!Array.isArray(raw.stock)) raw.stock = [];
    state.playerFbos = raw;
    return raw;
  }
  state.playerFbos = { fbos: [], holds: [], stock: [] };
  return state.playerFbos;
}

export function findOwnedFboAtIcao(
  state: CareerMissionsState,
  icao: string,
): PlayerFbo | undefined {
  const hub = icao.trim().toUpperCase();
  return ensureState(state).fbos.find((f) => f.icao.toUpperCase() === hub);
}

export function fboUsedKgLocal(state: CareerMissionsState, fboId: string): number {
  const fbos = ensureState(state);
  const bonded = fbos.holds
    .filter((h) => h.fboId === fboId)
    .reduce((s, h) => s + h.cargoKg, 0);
  const spot = fbos.stock
    .filter((s) => s.fboId === fboId)
    .reduce((s, p) => s + p.kg, 0);
  return bonded + spot;
}

export function fboFreeKgLocal(state: CareerMissionsState, fboId: string): number {
  const fbo = ensureState(state).fbos.find((f) => f.id === fboId);
  if (!fbo) return 0;
  return Math.max(0, fbo.capacityKg - fboUsedKgLocal(state, fboId));
}

/** Merge kg into FBO spot inventory (creates pile when missing). */
export function depositCargoToFboSpot(
  state: CareerMissionsState,
  opts: {
    icao: string;
    commodityId: CommodityId;
    kg: number;
    avgCostUsdPerKg: number;
    tick: number;
  },
): PlayerFboStockPile {
  const qty = Math.max(0, Math.floor(opts.kg));
  if (qty <= 0) throw new Error('Deposit amount must be positive');

  const fbo = findOwnedFboAtIcao(state, opts.icao);
  if (!fbo) {
    throw new Error(`No FBO at ${opts.icao.trim().toUpperCase()}`);
  }
  const free = fboFreeKgLocal(state, fbo.id);
  if (qty > free) {
    throw new Error(
      `FBO free capacity ${free.toLocaleString()} kg; need ${qty.toLocaleString()} kg`,
    );
  }

  const fbos = ensureState(state);
  const avg = Math.max(0, money(opts.avgCostUsdPerKg));
  let pile = fbos.stock.find(
    (s) => s.fboId === fbo.id && s.commodityId === opts.commodityId,
  );
  if (pile) {
    const totalKg = pile.kg + qty;
    pile.avgCostUsdPerKg = money(
      (pile.avgCostUsdPerKg * pile.kg + avg * qty) / totalKg,
    );
    pile.kg = totalKg;
    pile.acquiredAtTick = opts.tick;
  } else {
    pile = {
      id: nextId('fbospot', opts.tick),
      fboId: fbo.id,
      commodityId: opts.commodityId,
      kg: qty,
      avgCostUsdPerKg: avg,
      acquiredAtTick: opts.tick,
    };
    fbos.stock.push(pile);
  }
  return { ...pile };
}
