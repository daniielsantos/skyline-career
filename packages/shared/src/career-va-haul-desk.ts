/**
 * Daily cap on hand-posted WH→WH bridges (Hold, Fly now, Scout confirm).
 * Auto-haul keeps its own 1–3/day counter. Cancel does not refund a post.
 */

import { economyDayIndex } from './career-weather.js';
import type {
  CareerMissionsState,
  VaAutoHaulState,
} from './types/career-economy.js';

/** One Scout board (max 8) per economy day. Above the AI desk max of 3. */
export const VA_MANUAL_HAUL_MAX_PER_DAY = 8;

export type ManualHaulDeskView = {
  postedToday: number;
  maxPerDay: number;
  remaining: number;
};

function postedOnDay(state: CareerMissionsState, tick: number): number {
  const desk = state.vaAutoHaul;
  if (!desk) return 0;
  const day = economyDayIndex(tick);
  const storedDay = desk.manualPostedDayIndex ?? 0;
  if (storedDay !== day) return 0;
  const posted = desk.manualPostedToday ?? 0;
  return Number.isFinite(posted) ? Math.max(0, Math.floor(posted)) : 0;
}

export function manualHaulDeskView(
  state: CareerMissionsState,
  tick: number,
): ManualHaulDeskView {
  const postedToday = postedOnDay(state, tick);
  return {
    postedToday,
    maxPerDay: VA_MANUAL_HAUL_MAX_PER_DAY,
    remaining: Math.max(0, VA_MANUAL_HAUL_MAX_PER_DAY - postedToday),
  };
}

/**
 * First manual post creates the desk blob the Auto-haul column already
 * persists. Numbers match `defaultVaAutoHaulState` (enabled stays off).
 */
function ensureDesk(state: CareerMissionsState): VaAutoHaulState {
  if (!state.vaAutoHaul) {
    state.vaAutoHaul = {
      enabled: false,
      maxHaulsPerDay: 2,
      payMult: 1,
      walletFloorUsd: 0,
      postedToday: 0,
      postedDayIndex: 0,
      manualPostedToday: 0,
      manualPostedDayIndex: 0,
    };
  }
  return state.vaAutoHaul;
}

export function consumeManualHaulPost(
  state: CareerMissionsState,
  tick: number,
): void {
  const view = manualHaulDeskView(state, tick);
  if (view.remaining <= 0) {
    throw new Error(
      `Haul desk is at ${VA_MANUAL_HAUL_MAX_PER_DAY} Internal Hauls today. The next economy day opens more posts.`,
    );
  }
  const day = economyDayIndex(tick);
  const desk = ensureDesk(state);
  desk.manualPostedDayIndex = day;
  desk.manualPostedToday = view.postedToday + 1;
}
