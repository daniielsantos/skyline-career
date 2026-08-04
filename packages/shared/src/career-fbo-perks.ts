/**
 * Read-only FBO perk helpers — no mission/fleet imports (avoids cycles).
 */

import type {
  CareerMissionsState,
  PlayerFbo,
  PlayerFboTier,
} from './types/career-economy.js';

/** Hangar parking fee multiplier when aircraft is parked at a company FBO. */
export const FBO_PARKING_FEE_MULT: Record<PlayerFboTier, number> = {
  1: 0.85,
  2: 0.7,
};

/** Jet-A / MRO cost multiplier at a company FBO ICAO. */
export const FBO_SERVICE_COST_MULT: Record<PlayerFboTier, number> = {
  1: 0.95,
  2: 0.9,
};

function readFbos(
  state: Pick<CareerMissionsState, 'playerFbos'>,
): PlayerFbo[] {
  const raw = state.playerFbos;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.fbos)) return [];
  const out: PlayerFbo[] = [];
  for (const row of raw.fbos) {
    if (!row || typeof row !== 'object') continue;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const icao = typeof row.icao === 'string' ? row.icao.trim().toUpperCase() : '';
    const tier: PlayerFboTier = row.tier === 2 ? 2 : 1;
    const capacityKg =
      typeof row.capacityKg === 'number' && Number.isFinite(row.capacityKg)
        ? Math.max(0, Math.floor(row.capacityKg))
        : 0;
    if (!id || !icao || capacityKg <= 0) continue;
    out.push({ id, icao, tier, capacityKg });
  }
  return out;
}

export function findPlayerFboAtIcao(
  state: Pick<CareerMissionsState, 'playerFbos'>,
  icao: string,
): PlayerFbo | undefined {
  const key = icao.trim().toUpperCase();
  return readFbos(state).find((f) => f.icao === key);
}

/** Parking fee mult at ICAO (1 = no FBO perk). */
export function fboParkingFeeMult(
  state: Pick<CareerMissionsState, 'playerFbos'>,
  icao: string,
): number {
  const fbo = findPlayerFboAtIcao(state, icao);
  if (!fbo) return 1;
  return FBO_PARKING_FEE_MULT[fbo.tier] ?? 1;
}

/** Fuel / MRO cost mult at ICAO (1 = no FBO perk). */
export function fboServiceCostMult(
  state: Pick<CareerMissionsState, 'playerFbos'>,
  icao: string,
): number {
  const fbo = findPlayerFboAtIcao(state, icao);
  if (!fbo) return 1;
  return FBO_SERVICE_COST_MULT[fbo.tier] ?? 1;
}
