/**
 * Career economy clock: 10-minute batches on a 24h wall-clock day.
 * Physics (flight / rest / MX / fuel haul) uses real hours via MS_PER_HOUR.
 * Per-tick budgets stay calibrated at 4 ticks/hour and are scaled at apply time.
 */

/** Real wall-clock hour in ms (physics). */
export const MS_PER_HOUR = 3_600_000;
/** Economy batches per wall-clock hour. 6 × 10 min. */
export const TICKS_PER_HOUR = 6;
/**
 * Batches per 24h career day. Kept as 24 × ticks/hour so a day stays 24 wall hours.
 * A fresh world is required. Saved tick numbers from the 15-minute clock are not rewritten.
 */
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;
/** 1 economy tick = 10 real minutes. */
export const MS_PER_TICK = MS_PER_HOUR / TICKS_PER_HOUR;
/**
 * Per-tick kg, XP and form-lot caps in data were calibrated at 4 ticks/hour.
 * Multiply a calibrated per-tick budget by this so the hour stays the same.
 */
export const ECONOMY_BUDGET_TICKS_PER_HOUR = 4;
export const ECONOMY_TICK_BUDGET_SCALE =
  ECONOMY_BUDGET_TICKS_PER_HOUR / TICKS_PER_HOUR;
/** Cap catch-up per load so a long offline stretch stays responsive (14 days). */
export const MAX_CATCH_UP_TICKS = TICKS_PER_DAY * 14;
/**
 * Interactive load (profile open / timer pulse) only simulates this many batches
 * per call. When capped, lastBatchAtMs advances by the simulated ticks only so
 * the next pulse can drain the backlog (catch-up UX / 60s timer).
 */
export const MAX_LOAD_CATCH_UP_TICKS = 1;

/**
 * First background pulse after profile login (store-warm). Larger burst drains
 * multi-day backlog faster without blocking profile-select.
 */
export const LOGIN_CATCH_UP_TICKS = 12;

/**
 * Background drain while the Career API is open: batches simulated per pulse
 * (full tickEconomyN — nothing skipped). Keep pulseMs above typical pulse wall
 * time on a large save so pulses do not pile up on the career lock.
 */
export const CATCH_UP_TICKS_PER_PULSE = 8;
/** Wall ms between background catch-up pulses (see CATCH_UP_TICKS_PER_PULSE). */
export const CATCH_UP_PULSE_MS = 15_000;

/**
 * Release the career write lock every N batches during a pulse so /api/state
 * reads can slip in between chunks (cooperative tick yields within each chunk).
 */
export const CATCH_UP_LOCK_CHUNK_TICKS = 2;

/**
 * Whole economy batches still owed vs wall clock (0 when within the current
 * 10-minute fraction). Used for catch-up UX / drain progress.
 */
export function economyTicksBehind(
  lastBatchAtMs: number,
  nowMs = Date.now(),
): number {
  if (!Number.isFinite(lastBatchAtMs) || !Number.isFinite(nowMs)) return 0;
  const elapsed = Math.max(0, nowMs - lastBatchAtMs);
  return Math.floor(elapsed / MS_PER_TICK);
}

export function hoursToMs(hours: number): number {
  return hours * MS_PER_HOUR;
}

export function msToHours(ms: number): number {
  return ms / MS_PER_HOUR;
}

/** Convert real hours to economy ticks (ceil, at least 1 when hours > 0). */
export function hoursToTicks(hours: number): number {
  if (!(hours > 0) || !Number.isFinite(hours)) return 0;
  return Math.max(1, Math.ceil(hours * TICKS_PER_HOUR));
}

const tickBudgetRemainder = new WeakMap<object, Map<string, number>>();

/**
 * Whole units of a per-tick cap this tick.
 * `calibrated` is the count tuned at 4 ticks/hour. Every tick takes its
 * 4/6 share; the fraction carries so the hour matches (2 per 15 min stays
 * 8 per hour). A tick is never skipped.
 */
export function takeCalibratedTickBudget(
  world: object,
  key: string,
  calibrated: number,
): number {
  const bag = tickBudgetRemainder.get(world) ?? new Map<string, number>();
  tickBudgetRemainder.set(world, bag);
  const next = (bag.get(key) ?? 0) + calibrated * ECONOMY_TICK_BUDGET_SCALE;
  const whole = Math.floor(next + 1e-9);
  bag.set(key, next - whole);
  return whole;
}
