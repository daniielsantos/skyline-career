/**
 * World tick service — contract for SP local today and MP server tomorrow.
 *
 * SP: `LocalWorldTickService` (career-ui/server) wraps the timer + cooperative
 * catch-up currently in `api.ts`.
 * MP: remote implementation; clients never call `advance` — only read `getClock`.
 *
 * See docs/agent-context/14-mp-world-clock.md
 */

import type { OfflineFeeSummary } from './career-offline-fees.js';
import type { CareerEconomyWorld } from './types/career-economy.js';
import {
  CATCH_UP_PULSE_MS,
  CATCH_UP_TICKS_PER_PULSE,
  LOGIN_CATCH_UP_TICKS,
  MS_PER_TICK,
  economyTicksBehind,
} from './career-clock.js';
import { continuousEconomyHours } from './career-economy.js';

/** SP profile save uses `'local'`; MP shards use server-assigned ids. */
export type WorldId = string;

export type WorldTickMode = 'sp-local' | 'mp-remote';

/** Authoritative economy clock snapshot (world scope — not company wallet). */
export type WorldClockSnapshot = {
  worldId: WorldId;
  tick: number;
  /** Wall anchor of the last completed 15-min batch. */
  lastBatchAtMs: number;
  /** Fractional hours since lastBatch within the current batch. */
  continuousHours: number;
  /** Server/host wall clock used for crew holds and continuous ops. */
  serverNowMs: number;
  msPerTick: number;
  /** When the next batch boundary fires (derived). */
  nextPulseAtMs: number;
};

/** UI chip while SP still drains backlog on login (absent in MP client). */
export type WorldCatchUpProgress = {
  ticksBehind: number;
  elapsedHours: number;
  etaMinutes: number;
  ticksPerPulse: number;
  pulseMs: number;
  msPerTick: number;
};

export type WorldTickAdvanceOpts = {
  /** Batches to simulate this call (default: pulse size). */
  n?: number;
  /** SP background pulse: yield between countries + release lock in chunks. */
  cooperative?: boolean;
  /** Recovery cap (server startup); defaults to shared MAX_CATCH_UP_TICKS. */
  maxTicks?: number;
};

export type WorldTickAdvanceResult = {
  advancedTicks: number;
  wantedTicks: number;
  capped: boolean;
  settledFlights: number;
  wallMs: number;
};

/** Company reconnect settlement — uses world tick delta, not client catch-up. */
export type CompanySessionOpenOpts = {
  companyId: string;
  worldId: WorldId;
  /** Last economy tick this company was billed against (persist on company row). */
  lastSeenTick: number;
  serverNowMs?: number;
};

export type CompanySessionOpenResult = {
  worldClock: WorldClockSnapshot;
  tickDelta: number;
  offlineFeeSummary?: OfflineFeeSummary;
};

/**
 * Single writer for economy batches (`tickEconomyN` / cooperative variant).
 * Reads are always against persisted world state — never inferred after local sim.
 */
export interface WorldTickService {
  readonly mode: WorldTickMode;

  /** Read clock without advancing (safe on every GET / poll). */
  getClock(worldId: WorldId, nowMs?: number): Promise<WorldClockSnapshot>;

  /**
   * SP: drain backlog / timer pulse. MP server: cron + recovery only.
   * Clients in MP builds must not implement this (throw or no-op stub).
   */
  advance(
    worldId: WorldId,
    opts?: WorldTickAdvanceOpts,
  ): Promise<WorldTickAdvanceResult>;

  /**
   * SP-only progress for the ⟳ catch-up chip. MP returns null (world already current).
   */
  getCatchUpProgress(
    worldId: WorldId,
    nowMs?: number,
  ): Promise<WorldCatchUpProgress | null>;

  /** SP: start login burst + interval timer. MP: no-op on client. */
  startBackgroundPulse(worldId: WorldId): void;

  stopBackgroundPulse(): void;

  /**
   * Company login / reconnect — passive fees from tick delta, not simulated ticks on client.
   * World advance happens separately (server cron or SP timer).
   */
  openCompanySession(
    opts: CompanySessionOpenOpts,
  ): Promise<CompanySessionOpenResult>;
}

/** Derive header clock fields from an in-memory world (SP RAM / server job). */
export function worldClockFromEconomy(
  world: Pick<CareerEconomyWorld, 'tick' | 'lastBatchAtMs'>,
  worldId: WorldId,
  nowMs = Date.now(),
): WorldClockSnapshot {
  const lastBatchAtMs =
    typeof world.lastBatchAtMs === 'number' && Number.isFinite(world.lastBatchAtMs)
      ? world.lastBatchAtMs
      : nowMs;
  return {
    worldId,
    tick: world.tick,
    lastBatchAtMs,
    continuousHours: continuousEconomyHours(
      world as CareerEconomyWorld,
      nowMs,
    ),
    serverNowMs: nowMs,
    msPerTick: MS_PER_TICK,
    nextPulseAtMs: lastBatchAtMs + MS_PER_TICK,
  };
}

/** SP catch-up UX payload; null when within one batch of wall clock. */
export function catchUpProgressFromEconomy(
  world: Pick<CareerEconomyWorld, 'lastBatchAtMs'>,
  minTicksBehind = 2,
  nowMs = Date.now(),
  ticksPerPulse = CATCH_UP_TICKS_PER_PULSE,
  pulseMs = CATCH_UP_PULSE_MS,
): WorldCatchUpProgress | null {
  const last =
    typeof world.lastBatchAtMs === 'number' && Number.isFinite(world.lastBatchAtMs)
      ? world.lastBatchAtMs
      : nowMs;
  const ticksBehind = economyTicksBehind(last, nowMs);
  if (ticksBehind < minTicksBehind) return null;
  const elapsedMs = Math.max(0, nowMs - last);
  const pulsesRemaining = Math.ceil(ticksBehind / ticksPerPulse);
  const etaMinutes = Math.ceil((pulsesRemaining * pulseMs) / 60_000);
  return {
    ticksBehind,
    elapsedHours: Math.round((elapsedMs / 3_600_000) * 10) / 10,
    etaMinutes,
    ticksPerPulse,
    pulseMs,
    msPerTick: MS_PER_TICK,
  };
}

/** Defaults for SP background pulse (see career-clock.ts). */
export const SP_WORLD_TICK_DEFAULTS = {
  loginBurstTicks: LOGIN_CATCH_UP_TICKS,
  ticksPerPulse: CATCH_UP_TICKS_PER_PULSE,
  pulseMs: CATCH_UP_PULSE_MS,
} as const;
