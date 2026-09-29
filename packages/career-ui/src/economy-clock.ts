/**
 * Browser-safe career clock. Keep in sync with
 * packages/shared/src/career-clock.ts.
 * Do not import @msfs-compat/shared from the Vite client.
 * 1 tick = 10 wall minutes. A career day stays 24 wall hours.
 */
export const TICKS_PER_HOUR = 6;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;
export const MINUTES_PER_TICK = 60 / TICKS_PER_HOUR;
export const HOURS_PER_TICK = MINUTES_PER_TICK / 60;
export const MS_PER_TICK = MINUTES_PER_TICK * 60 * 1000;
export const TICKS_PER_WEEK = TICKS_PER_DAY * 7;
