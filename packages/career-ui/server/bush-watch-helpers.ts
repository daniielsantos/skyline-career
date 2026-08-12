/**
 * Isolated bush-trip Watch — per-leg progress via SimConnect samples.
 * Does not share CareerWatchSession lifecycle (freight OFP / settle).
 */

import {
  advanceFlightPhase,
  watchIntervalMsForPhase,
  type CareerFlightPhase,
} from '@msfs-compat/shared';
import {
  clearInactiveBushTrip,
  createMissionFlightWatchState,
  departBushTripLeg,
  evaluateBushTripLegTransition,
  getBushTrip,
  isBushTripActive,
  settleBushTripLeg,
  type ActiveBushTrip,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type MissionFlightEvent,
  type MissionFlightWatchState,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { isOfpLoadActive } from './ofp-load-state.ts';
import { withSimBridgeExclusive } from './simbridge-gate.ts';
import { sampleLiveFlight } from './watch-helpers.ts';
import { watchDebugLog } from './debug-log.ts';

export type BushWatchStatusPayload = {
  running: boolean;
  tripId: string | null;
  title: string | null;
  legIndex: number | null;
  legs: number | null;
  fromIcao: string | null;
  toIcao: string | null;
  legStatus: ActiveBushTrip['legStatus'] | null;
  tripStatus: ActiveBushTrip['status'] | null;
  phase: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  groundSpeedKt: number | null;
  position: { lat: number; lon: number } | null;
  lastEvent: MissionFlightEvent | null;
  lastEventAtIso: string | null;
  lastError: string | null;
  pipeConnected: boolean;
  completed: boolean;
  payoutUsd: number | null;
  walletUsd: number | null;
  intervalMs: number;
};

type BushWatchCallbacks = {
  withCareerRead: <T>(
    fn: (
      world: CareerEconomyWorld,
      missions: CareerMissionsState,
    ) => Promise<T> | T,
  ) => Promise<T>;
  withCareerWrite: <T>(
    fn: (
      world: CareerEconomyWorld,
      missions: CareerMissionsState,
    ) => Promise<T> | T,
  ) => Promise<T>;
  /** Stop the freight Watch before opening the bush pipe. */
  stopMarketWatch?: () => Promise<void>;
};

export class BushTripWatchSession {
  private bridge: NamedPipeSimBridge | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchState: MissionFlightWatchState = createMissionFlightWatchState();
  private running = false;
  private tripId: string | null = null;
  private lastSample: Awaited<ReturnType<typeof sampleLiveFlight>> | null =
    null;
  private lastPhase: CareerFlightPhase | null = null;
  private intervalMs = 2_000;
  private lastEvent: MissionFlightEvent | null = null;
  private lastEventAtIso: string | null = null;
  private lastError: string | null = null;
  private completed = false;
  private payoutUsd: number | null = null;
  private walletUsd: number | null = null;
  private tickInFlight = false;
  private pipeRetryAtMs = 0;
  private pipeBackoffMs = 2_000;
  private consecutivePipeErrors = 0;
  private lastSuccessfulTickAtMs = 0;
  private opts = {
    intervalSec: 5,
    autoDepart: true,
    autoSettle: true,
    /** Bush legs settle on touchdown near hub — engines may stay running. */
    requireEnginesOff: false,
    settleRadiusNm: 12,
    pipeName: undefined as string | undefined,
  };

  constructor(private readonly cb: BushWatchCallbacks) {}

  getStatus(): BushWatchStatusPayload {
    let title: string | null = null;
    let legs: number | null = null;
    let fromIcao: string | null = null;
    let toIcao: string | null = null;
    let legIndex: number | null = null;
    let legStatus: ActiveBushTrip['legStatus'] | null = null;
    let tripStatus: ActiveBushTrip['status'] | null = null;
    if (this.tripId) {
      const trip = getBushTrip(this.tripId);
      if (trip) {
        title = trip.title;
        legs = trip.legs.length;
      }
    }
    // Snapshot fields filled async via last applied active — keep from last tick cache
    const cached = this.cachedActive;
    if (cached) {
      legIndex = cached.legIndex;
      legStatus = cached.legStatus;
      tripStatus = cached.status;
      const trip = getBushTrip(cached.tripId);
      const leg = trip ? trip.legs[cached.legIndex] : undefined;
      if (leg) {
        fromIcao = leg.fromIcao.toUpperCase();
        toIcao = leg.toIcao.toUpperCase();
      }
    }
    const hardDown =
      !this.bridge?.isPipeConnected &&
      Date.now() - this.lastSuccessfulTickAtMs > 12_000;
    return {
      running: this.running,
      tripId: this.tripId,
      title,
      legIndex,
      legs,
      fromIcao,
      toIcao,
      legStatus,
      tripStatus,
      phase: this.lastPhase,
      onGround: this.lastSample?.onGround ?? null,
      enginesRunning: this.lastSample?.enginesRunning ?? null,
      groundSpeedKt:
        typeof this.lastSample?.groundSpeedKt === 'number'
          ? this.lastSample.groundSpeedKt
          : null,
      position: this.lastSample?.position ?? null,
      lastEvent: this.lastEvent,
      lastEventAtIso: this.lastEventAtIso,
      lastError: this.lastError,
      pipeConnected: hardDown ? false : Boolean(this.bridge?.isPipeConnected),
      completed: this.completed,
      payoutUsd: this.payoutUsd,
      walletUsd: this.walletUsd,
      intervalMs: this.intervalMs,
    };
  }

  private cachedActive: ActiveBushTrip | null = null;

  async start(opts: {
    intervalSec?: number;
    autoDepart?: boolean;
    autoSettle?: boolean;
    requireEnginesOff?: boolean;
    settleRadiusNm?: number;
    pipeName?: string;
  } = {}): Promise<BushWatchStatusPayload> {
    const active = await this.cb.withCareerRead((_w, missions) =>
      isBushTripActive(missions),
    );
    if (!active) {
      throw new Error('No active bush trip to watch');
    }
    if (this.running && this.tripId === active.tripId) {
      return this.getStatus();
    }
    if (this.running) {
      await this.stop();
    }
    if (this.cb.stopMarketWatch) {
      await this.cb.stopMarketWatch();
    }

    this.opts = {
      intervalSec: Math.max(1, Math.floor(opts.intervalSec ?? 5)),
      autoDepart: opts.autoDepart !== false,
      autoSettle: opts.autoSettle !== false,
      requireEnginesOff: opts.requireEnginesOff === true,
      settleRadiusNm: opts.settleRadiusNm ?? 12,
      pipeName: opts.pipeName,
    };
    this.tripId = active.tripId;
    this.cachedActive = active;
    this.lastSample = null;
    this.lastPhase = null;
    this.intervalMs = watchIntervalMsForPhase('ground', {
      cruiseCapMs: this.opts.intervalSec * 1000,
    });
    this.lastEvent = null;
    this.lastEventAtIso = null;
    this.lastError = null;
    this.completed = false;
    this.payoutUsd = null;
    this.pipeRetryAtMs = 0;
    this.pipeBackoffMs = 2_000;
    this.consecutivePipeErrors = 0;
    this.lastSuccessfulTickAtMs = 0;
    this.watchState = createMissionFlightWatchState({
      sawAirborne: active.legStatus === 'departed',
      airborneAtMs: active.departedAtMs,
      // Mid-leg restart: next on-ground sample can settle (no need to re-land).
      // Still airborne: lastOnGround false stays correct until touchdown.
      ...(active.legStatus === 'departed' ? { lastOnGround: false as const } : {}),
    });

    const bridge = new NamedPipeSimBridge(
      this.opts.pipeName ? { pipeName: this.opts.pipeName } : {},
    );
    try {
      await withSimBridgeExclusive(async () => {
        await bridge.open('Skyline Career UI Bush Watch');
      });
    } catch (error) {
      this.tripId = null;
      this.cachedActive = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      watchDebugLog('bush-watch', 'start failed', { error: this.lastError });
      throw error;
    }
    this.bridge = bridge;
    this.running = true;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await this.tick();
    return this.getStatus();
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, Math.max(200, Math.round(delayMs)));
  }

  async stop(): Promise<BushWatchStatusPayload> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.bridge) {
      try {
        await this.bridge.close({ disconnectHost: false });
      } catch {
        /* ignore */
      }
      this.bridge = null;
    }
    return this.getStatus();
  }

  private async tick(): Promise<void> {
    if (!this.running || !this.bridge || !this.tripId || this.tickInFlight) {
      return;
    }
    if (isOfpLoadActive()) {
      this.scheduleNextTick(this.intervalMs);
      return;
    }
    if (Date.now() < this.pipeRetryAtMs) {
      this.scheduleNextTick(Math.max(500, this.pipeRetryAtMs - Date.now()));
      return;
    }
    this.tickInFlight = true;
    try {
      if (!this.bridge.isPipeConnected) {
        await withSimBridgeExclusive(async () => {
          await this.bridge!.open('Skyline Career UI Bush Watch');
        });
      }
      const sample = await sampleLiveFlight(this.bridge, {
        previousPosition: this.lastSample?.position ?? null,
      });
      this.lastSample = sample;
      this.lastSuccessfulTickAtMs = Date.now();
      this.consecutivePipeErrors = 0;
      this.pipeBackoffMs = 2_000;
      this.lastError = null;

      const active = await this.cb.withCareerRead((_w, missions) =>
        isBushTripActive(missions),
      );
      if (!active || active.tripId !== this.tripId) {
        this.lastError = 'Bush trip no longer active';
        await this.stop();
        return;
      }
      this.cachedActive = active;

      if (sample.paused === true || sample.slewActive === true) {
        return;
      }
      const { event, nextState } = evaluateBushTripLegTransition(
        active,
        sample,
        this.watchState,
        {
          nowMs: Date.now(),
          settleRadiusNm: this.opts.settleRadiusNm,
          requireEnginesOff: this.opts.requireEnginesOff,
        },
      );
      this.watchState = nextState;
      const postTouchdown = typeof nextState.airborneEndedAtMs === 'number';
      this.lastPhase = advanceFlightPhase(
        this.lastPhase,
        {
          onGround: sample.onGround,
          enginesRunning: sample.enginesRunning,
          groundSpeedKt: sample.groundSpeedKt,
          verticalSpeedFpm: sample.verticalSpeedFpm,
          altitudeFt: sample.altitudeFt,
          aglFt: sample.aglFt,
          sawAirborne: nextState.sawAirborne,
          postTouchdown,
        },
        {
          airborneAtMs: nextState.airborneAtMs,
          touchdownAtMs: nextState.airborneEndedAtMs,
          nowMs: Date.now(),
        },
      );
      this.intervalMs = watchIntervalMsForPhase(this.lastPhase ?? 'ground', {
        cruiseCapMs: this.opts.intervalSec * 1000,
      });
      if (event.type !== 'none') {
        this.lastEvent = event;
        this.lastEventAtIso = new Date().toISOString();
      }

      if (event.type === 'depart' && this.opts.autoDepart) {
        await this.cb.withCareerWrite((_w, missions) => {
          const result = departBushTripLeg(missions, { nowMs: Date.now() });
          this.cachedActive = result.active;
          this.watchState = {
            ...this.watchState,
            sawAirborne: true,
            airborneAtMs: result.active.departedAtMs,
            airborneEndedAtMs: undefined,
            landingFpm: undefined,
          };
        });
      }

      if (event.type === 'settle' && this.opts.autoSettle) {
        let done = false;
        await this.cb.withCareerWrite((world, missions) => {
          const result = settleBushTripLeg(missions, {
            tick: world.tick,
            nowMs: Date.now(),
          });
          this.cachedActive = result.active;
          this.walletUsd = missions.walletUsd;
          if (result.completed) {
            this.completed = true;
            this.payoutUsd = result.payoutUsd;
            clearInactiveBushTrip(missions);
            this.cachedActive = null;
            done = true;
          } else {
            // Reset watch state for the next leg
            this.watchState = createMissionFlightWatchState();
          }
        });
        if (done) {
          await this.stop();
          return;
        }
      }
    } catch (error) {
      this.consecutivePipeErrors += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.pipeRetryAtMs = Date.now() + this.pipeBackoffMs;
      this.pipeBackoffMs = Math.min(30_000, this.pipeBackoffMs * 2);
      watchDebugLog('bush-watch', 'tick error', { error: this.lastError });
    } finally {
      this.tickInFlight = false;
      if (this.running) this.scheduleNextTick(this.intervalMs);
    }
  }
}
