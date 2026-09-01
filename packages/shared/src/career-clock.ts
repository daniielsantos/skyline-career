/**
 * Career economy clock: 15-minute batches on a 24h wall-clock day.
 * Physics (flight / rest / MX / fuel haul) uses real hours via MS_PER_HOUR.
 */

/** Real wall-clock hour in ms (physics). */
export const MS_PER_HOUR = 3_600_000;
/** Economy batches per wall-clock hour. */
export const TICKS_PER_HOUR = 4;
/** Batches per ~24h career day (4 × 24). */
export const TICKS_PER_DAY = 96;
/** 1 economy tick = 15 real minutes. */
export const MS_PER_TICK = MS_PER_HOUR / TICKS_PER_HOUR;
/** Cap catch-up per load so a long offline stretch stays responsive (14 days). */
export const MAX_CATCH_UP_TICKS = TICKS_PER_DAY * 14;
/**
 * Interactive load (profile open / timer pulse) only simulates this many batches
 * per call. When capped, lastBatchAtMs advances by the simulated ticks only so
 * the next pulse can drain the backlog (catch-up UX / 60s timer).
 */
export const MAX_LOAD_CATCH_UP_TICKS = 1;

/**
 * Background drain while the Career API is open: batches simulated per pulse
 * (full tickEconomyN — nothing skipped). Keep pulseMs above typical pulse wall
 * time on a large save so pulses do not pile up on the career lock.
 */
export const CATCH_UP_TICKS_PER_PULSE = 4;
/** Wall ms between background catch-up pulses (see CATCH_UP_TICKS_PER_PULSE). */
export const CATCH_UP_PULSE_MS = 25_000;

/**
 * Whole economy batches still owed vs wall clock (0 when within the current
 * 15-minute fraction). Used for catch-up UX / drain progress.
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
