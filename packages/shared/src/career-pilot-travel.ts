/**
 * Pilot hub position — deadhead travel between career hubs (cash only, instant MVP).
 */

import {
  CAREER_HUB_COORDS,
  routeDistanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import { applyWalletDelta } from './career-ledger.js';
import type { CareerMissionsState } from './types/career-economy.js';

/** Commercial / airline-style reposition (~cheaper than aircraft ferry). */
export const PILOT_TRAVEL_USD_PER_NM = 0.55;
export const PILOT_TRAVEL_MIN_USD = 75;

export type PilotTravelQuote = {
  originIcao: string;
  destIcao: string;
  distanceNm: number;
  costUsd: number;
};

export function resolvePilotIcao(
  raw: unknown,
  homeHubIcao: string,
  fleet: CareerMissionsState['fleet'],
): string {
  const fromRaw =
    typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (fromRaw && CAREER_HUB_COORDS[fromRaw]) return fromRaw;
  const home = homeHubIcao.trim().toUpperCase();
  if (home && CAREER_HUB_COORDS[home]) return home;
  const first = fleet[0]?.locationIcao?.trim().toUpperCase() ?? '';
  if (first && CAREER_HUB_COORDS[first]) return first;
  return home || first || '';
}

export function syncPilotIcaoTo(
  state: CareerMissionsState,
  icao: string,
): void {
  const next = icao.trim().toUpperCase();
  if (!next) return;
  state.pilotIcao = next;
}

/** Pilot must already be at this ICAO (usually aircraft / mission origin). */
export function assertPilotAtIcao(
  state: CareerMissionsState,
  icao: string,
): void {
  const dest = icao.trim().toUpperCase();
  const pilot = (state.pilotIcao ?? '').trim().toUpperCase();
  if (!pilot) {
    throw new Error('Pilot location unknown — travel to a career hub first');
  }
  if (pilot !== dest) {
    throw new Error(
      `Pilot is at ${pilot}, not ${dest} — travel there before dispatch`,
    );
  }
}

export function quotePilotTravel(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  destIcao: string,
): PilotTravelQuote {
  const origin = (state.pilotIcao ?? '').trim().toUpperCase();
  if (!origin || !CAREER_HUB_COORDS[origin]) {
    throw new Error('Pilot is not at a career hub');
  }
  const dest = destIcao.trim().toUpperCase();
  if (!CAREER_HUB_COORDS[dest]) {
    throw new Error(`Unknown career hub: ${dest}`);
  }
  if (dest === origin) {
    throw new Error(`Pilot is already at ${dest}`);
  }
  const distanceNm = routeDistanceNm(world, origin, dest);
  if (distanceNm === undefined) {
    throw new Error(`No route distance for ${origin}→${dest}`);
  }
  const costUsd = Math.max(
    PILOT_TRAVEL_MIN_USD,
    Math.round(distanceNm * PILOT_TRAVEL_USD_PER_NM),
  );
  return { originIcao: origin, destIcao: dest, distanceNm, costUsd };
}

export function executePilotTravel(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  destIcao: string,
  atTick = world.tick,
): { quote: PilotTravelQuote; walletDebitUsd: number } {
  const quote = quotePilotTravel(world, state, destIcao);
  if (state.walletUsd < quote.costUsd) {
    throw new Error(
      `Travel costs $${quote.costUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -quote.costUsd,
    kind: 'pilot_travel',
    atTick,
    icao: quote.destIcao,
    note: `${quote.originIcao}→${quote.destIcao}`,
  });
  state.pilotIcao = quote.destIcao;
  return { quote, walletDebitUsd: quote.costUsd };
}
