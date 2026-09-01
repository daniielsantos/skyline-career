/**
 * SP implementation of WorldTickService — wrapper over career lock + store.
 * Wired from `createCareerApiServer` in api.ts.
 */

import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CareerStore,
  OfflineFeeSummary,
} from '@msfs-compat/shared';
import {
  CATCH_UP_LOCK_CHUNK_TICKS,
  CATCH_UP_PULSE_MS,
  CATCH_UP_TICKS_PER_PULSE,
  companySessionFromTick,
  economyTicksBehind,
  LOCAL_WORLD_ID,
  LOGIN_CATCH_UP_TICKS,
  catchUpProgressFromEconomy,
  worldClockFromEconomy,
  type CompanySessionOpenOpts,
  type CompanySessionOpenResult,
  type WorldCatchUpProgress,
  type WorldClockSnapshot,
  type WorldId,
  type WorldTickAdvanceOpts,
  type WorldTickAdvanceResult,
  type WorldTickService,
} from '@msfs-compat/shared';

/** Minimal hooks the Career API already exposes under `withCareerLock` / writes. */
export type LocalWorldTickDeps = {
  /** SP always `'local'` until profile picker maps saves → world rows. */
  defaultWorldId?: WorldId;

  requireStore(): CareerStore;
  loadMissions(): Promise<CareerMissionsState>;

  /**
   * Catch-up write path — today `withCareerWrite(() => undefined, {
   * catchUp: true, catchUpTicks, cooperative: true })`.
   */
  runCatchUpWrite(opts: {
    catchUpTicks: number;
    cooperative: boolean;
  }): Promise<void>;

  /**
   * Company passive fee settlement + lastSeenTick persist (MP session/open path).
   */
  applyCompanySessionSettlement(opts: {
    fromTick: number;
    toTick: number;
  }): Promise<OfflineFeeSummary | undefined>;

  peekWorld(): CareerEconomyWorld | undefined;

  /** Skip pulse when no profile is open (SP). */
  isReady?(): boolean;

  /** MSFS hub stamp etc. before the first chunk of a pulse. */
  beforeAdvance?(): Promise<void>;
};

export class LocalWorldTickService implements WorldTickService {
  readonly mode = 'sp-local' as const;

  private readonly worldId: WorldId;
  private pulseTimer: ReturnType<typeof setInterval> | undefined;
  private pulseInFlight = false;

  constructor(private readonly deps: LocalWorldTickDeps) {
    this.worldId = deps.defaultWorldId ?? LOCAL_WORLD_ID;
  }

  async getClock(worldId: WorldId, nowMs = Date.now()): Promise<WorldClockSnapshot> {
    this.assertWorld(worldId);
    const world = this.deps.peekWorld();
    if (!world) {
      const store = this.deps.requireStore();
      const { world: loaded } = await store.loadEconomy({ maxCatchUpTicks: 0 });
      return worldClockFromEconomy(loaded, worldId, nowMs);
    }
    return worldClockFromEconomy(world, worldId, nowMs);
  }

  async advance(
    worldId: WorldId,
    opts: WorldTickAdvanceOpts = {},
  ): Promise<WorldTickAdvanceResult> {
    this.assertWorld(worldId);
    if (this.deps.isReady?.() === false) {
      return {
        advancedTicks: 0,
        wantedTicks: 0,
        capped: false,
        settledFlights: 0,
        wallMs: 0,
      };
    }
    if (this.pulseInFlight) {
      return {
        advancedTicks: 0,
        wantedTicks: 0,
        capped: false,
        settledFlights: 0,
        wallMs: 0,
      };
    }
    const totalTicks = Math.max(1, Math.floor(opts.n ?? CATCH_UP_TICKS_PER_PULSE));
    const cooperative = opts.cooperative !== false;
    const t0 = performance.now();
    this.pulseInFlight = true;
    try {
      await this.deps.beforeAdvance?.();
      let remaining = totalTicks;
      let advancedTicks = 0;
      while (remaining > 0) {
        const chunk = cooperative
          ? Math.min(CATCH_UP_LOCK_CHUNK_TICKS, remaining)
          : remaining;
        await this.deps.runCatchUpWrite({ catchUpTicks: chunk, cooperative });
        advancedTicks += chunk;
        remaining -= chunk;
        if (remaining > 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
      const world = this.deps.peekWorld();
      const ticksBehind = world
        ? economyTicksBehind(world.lastBatchAtMs ?? Date.now(), Date.now())
        : 0;
      const wallMs = performance.now() - t0;
      console.log(
        `[career] economy-pulse ok ticks=${advancedTicks} ${Math.round(wallMs)}ms`,
      );
      return {
        advancedTicks,
        wantedTicks: advancedTicks + ticksBehind,
        capped: ticksBehind > 0,
        settledFlights: 0,
        wallMs,
      };
    } catch (error) {
      console.error(
        `[career] economy-pulse fail ticks=${totalTicks} ${Math.round(performance.now() - t0)}ms:`,
        error instanceof Error ? error.message : error,
      );
      return {
        advancedTicks: 0,
        wantedTicks: 0,
        capped: false,
        settledFlights: 0,
        wallMs: performance.now() - t0,
      };
    } finally {
      this.pulseInFlight = false;
    }
  }

  async getCatchUpProgress(
    worldId: WorldId,
    nowMs = Date.now(),
  ): Promise<WorldCatchUpProgress | null> {
    this.assertWorld(worldId);
    const world = this.deps.peekWorld();
    if (!world) return null;
    return catchUpProgressFromEconomy(world, 2, nowMs);
  }

  startBackgroundPulse(worldId: WorldId): void {
    this.assertWorld(worldId);
    this.stopBackgroundPulse();
    void this.advance(worldId, {
      n: LOGIN_CATCH_UP_TICKS,
      cooperative: true,
    });
    this.pulseTimer = setInterval(() => {
      void this.advance(worldId, {
        n: CATCH_UP_TICKS_PER_PULSE,
        cooperative: true,
      });
    }, CATCH_UP_PULSE_MS);
  }

  stopBackgroundPulse(): void {
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = undefined;
    }
  }

  async openCompanySession(
    opts: CompanySessionOpenOpts,
  ): Promise<CompanySessionOpenResult> {
    this.assertWorld(opts.worldId);
    const nowMs = opts.serverNowMs ?? Date.now();
    const worldClock = await this.getClock(opts.worldId, nowMs);
    const missions = await this.deps.loadMissions();
    const fallbackFrom =
      typeof opts.lastSeenTick === 'number' && Number.isFinite(opts.lastSeenTick)
        ? opts.lastSeenTick
        : worldClock.tick;
    const fromTick = companySessionFromTick(missions, fallbackFrom, worldClock.tick);
    const toTick = worldClock.tick;
    const tickDelta = Math.max(0, toTick - fromTick);
    let offlineFeeSummary: OfflineFeeSummary | undefined;
    if (tickDelta > 0) {
      offlineFeeSummary = await this.deps.applyCompanySessionSettlement({
        fromTick,
        toTick,
      });
    }
    return { worldClock, tickDelta, offlineFeeSummary };
  }

  private assertWorld(worldId: WorldId): void {
    if (worldId !== this.worldId) {
      throw new Error(`LocalWorldTickService only hosts world '${this.worldId}'`);
    }
  }
}
