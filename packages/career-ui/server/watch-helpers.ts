/**
 * Live MSFS watch helpers for career-ui — mirrors agent CLI `career watch`.
 */

import {
  createMissionFlightWatchState,
  applyWalletDelta,
  departMission,
  estimateMissionBlockHours,
  evaluateLoadVerification,
  evaluateMinAirborneElapsed,
  evaluateMissionFlightTransition,
  flightPhaseFromSample,
  loadVerificationDrifted,
  resolveLivePayloadLb,
  KG_TO_LB,
  resolveAirportCoords,
  resolveExpectedRouteMs,
  routeDistanceNm,
  settleMission,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type FlightGroundSample,
  type LoadVerificationWeights,
  type MissionFlightEvent,
  type MissionFlightWatchState,
  type MissionIntent,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { isOfpLoadActive } from './ofp-load-state.ts';
import { preflightBlocksDepart } from './preflight-helpers.ts';

export type WatchFlightTimePayload = {
  airborneAtMs: number;
  expectedRouteMs: number;
  requiredMs: number;
  elapsedMs: number;
  ratio: number;
  met: boolean;
};

export type WatchStatusPayload = {
  running: boolean;
  missionId: string | null;
  missionStatus: string | null;
  phase: string | null;
  onGround: boolean | null;
  enginesRunning: boolean | null;
  groundSpeedKt: number | null;
  position: { lat: number; lon: number } | null;
  /** Live fuel total (lb) sampled on the Watch pipe. */
  liveFuelLb: number | null;
  /** Live payload total (lb) — stations/mass-balance policy. */
  livePayloadLb: number | null;
  /**
   * Authoritative Loaded vs Due from the Watch owner (also persisted on mission).
   * UI should prefer this over inventing ready client-side.
   */
  loadVerification: {
    ready: boolean;
    fuel: { plannedLb?: number; liveLb: number; ok: boolean };
    payload: { plannedLb?: number; liveLb?: number; ok: boolean };
  } | null;
  sawAirborne: boolean;
  lastEvent: MissionFlightEvent | null;
  lastEventAtIso: string | null;
  lastError: string | null;
  settlement: {
    payoutUsd: number;
    penaltyUsd: number;
    lateTicks: number;
    onTime: boolean;
    deliveredKg: number;
    residualFuelKg: number | null;
  } | null;
  walletUsd: number | null;
  autoDepart: boolean;
  autoSettle: boolean;
  intervalSec: number;
  allowDepartOverride: boolean;
  /** Live airborne progress vs planned route (anti time-compression). */
  flightTime: WatchFlightTimePayload | null;
};

type WatchCallbacks = {
  /** Consistent world+missions snapshot (may run economy catch-up). */
  withCareerRead: <T>(
    fn: (
      world: CareerEconomyWorld,
      missions: CareerMissionsState,
    ) => Promise<T> | T,
  ) => Promise<T>;
  /** Atomic load → mutate → persist for economy + missions. */
  withCareerWrite: <T>(
    fn: (
      world: CareerEconomyWorld,
      missions: CareerMissionsState,
    ) => Promise<T> | T,
  ) => Promise<T>;
  /**
   * Reload missions under the career lock, then apply. Return false to skip
   * persist (e.g. mission already cancelled). Missions-only — do not nest
   * withCareerRead/Write (same non-reentrant lock).
   */
  updateOpenMission: (
    missionId: string,
    update: (
      missions: CareerMissionsState,
      mission: MissionIntent,
      idx: number,
    ) => Promise<boolean> | boolean,
  ) => Promise<boolean>;
};

type WatchOptions = {
  missionId: string;
  intervalSec?: number;
  autoDepart?: boolean;
  autoSettle?: boolean;
  requireEnginesOff?: boolean;
  requireDestProximity?: boolean;
  settleRadiusNm?: number;
  pipeName?: string;
  /** Allow auto-depart even when lastPreflightCheck verdict is fail. */
  allowDepartOverride?: boolean;
};

export async function sampleLiveFlight(
  bridge: NamedPipeSimBridge,
): Promise<FlightGroundSample> {
  const snap = await bridge.snapshot();
  let position: { lat: number; lon: number } | undefined;
  let groundSpeedKt: number | undefined;
  try {
    const lat = await bridge.readSimVar({ name: 'PLANE LATITUDE', unit: 'degrees' });
    const lon = await bridge.readSimVar({ name: 'PLANE LONGITUDE', unit: 'degrees' });
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      position = { lat, lon };
    }
  } catch {
    position = undefined;
  }
  try {
    const gs = await bridge.readSimVar({
      name: 'GROUND VELOCITY',
      unit: 'knots',
    });
    if (Number.isFinite(gs) && gs >= 0) {
      groundSpeedKt = gs;
    }
  } catch {
    groundSpeedKt = undefined;
  }
  return {
    onGround: snap.onGround,
    enginesRunning: snap.enginesRunning,
    position,
    groundSpeedKt,
  };
}

/**
 * Lightweight fuel + payload totals on an already-open Watch bridge.
 * Stations + mass-balance via resolveLivePayloadLb (same policy as preflight/inject).
 */
export async function sampleLiveLoadLb(
  bridge: NamedPipeSimBridge,
  plannedPayloadLb?: number,
): Promise<{
  fuelLb: number | null;
  payloadLb: number | null;
  payloadSource: 'stations' | 'mass-balance' | 'none';
}> {
  let fuelLb: number | null = null;
  try {
    const fuel = await bridge.readSimVar({
      name: 'FUEL TOTAL QUANTITY WEIGHT',
      unit: 'pounds',
    });
    if (Number.isFinite(fuel) && fuel >= 0) fuelLb = fuel;
  } catch {
    try {
      const gal = await bridge.readSimVar({
        name: 'FUEL TOTAL QUANTITY',
        unit: 'gallons',
      });
      const dens = await bridge.readSimVar({
        name: 'FUEL WEIGHT PER GALLON',
        unit: 'pounds',
      });
      const fuel = gal * dens;
      if (Number.isFinite(fuel) && fuel >= 0) fuelLb = fuel;
    } catch {
      fuelLb = null;
    }
  }

  let stationSum = 0;
  let stationsRead = 0;
  for (let index = 1; index <= 16; index += 1) {
    try {
      const w = await bridge.readSimVar({
        name: `PAYLOAD STATION WEIGHT:${index}`,
        unit: 'pounds',
      });
      if (Number.isFinite(w) && w >= 0) {
        stationSum += w;
        stationsRead += 1;
      }
    } catch {
      /* station missing — stop after a gap of failures at the start */
      if (stationsRead === 0 && index >= 8) break;
    }
  }

  let massBalanceLb: number | undefined;
  if (fuelLb !== null) {
    try {
      const empty = await bridge.readSimVar({
        name: 'EMPTY WEIGHT',
        unit: 'pounds',
      });
      const gross = await bridge.readSimVar({
        name: 'TOTAL WEIGHT',
        unit: 'pounds',
      });
      if (
        Number.isFinite(empty) &&
        empty > 0 &&
        Number.isFinite(gross) &&
        gross > empty
      ) {
        massBalanceLb = Math.max(0, gross - empty - Math.max(0, fuelLb));
      }
    } catch {
      massBalanceLb = undefined;
    }
  }

  const resolved = resolveLivePayloadLb({
    stationSumLb: stationsRead > 0 ? stationSum : undefined,
    massBalanceLb,
    plannedLb: plannedPayloadLb,
  });

  return {
    fuelLb,
    payloadLb:
      resolved.payloadLb !== undefined ? resolved.payloadLb : null,
    payloadSource: resolved.source,
  };
}

export async function readLiveResidualFuelKg(
  bridge: NamedPipeSimBridge,
): Promise<number> {
  let fuelLb: number;
  try {
    fuelLb = await bridge.readSimVar({
      name: 'FUEL TOTAL QUANTITY WEIGHT',
      unit: 'pounds',
    });
  } catch {
    const [quantityGal, poundsPerGal] = await Promise.all([
      bridge.readSimVar({ name: 'FUEL TOTAL QUANTITY', unit: 'gallons' }),
      bridge.readSimVar({ name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' }),
    ]);
    fuelLb = quantityGal * poundsPerGal;
  }
  if (!Number.isFinite(fuelLb) || fuelLb < 0) {
    throw new Error(`Invalid live residual fuel weight: ${fuelLb}`);
  }
  return fuelLb / KG_TO_LB;
}

export async function probeLiveResidualFuelKg(pipeName?: string): Promise<number> {
  const bridge = new NamedPipeSimBridge(pipeName ? { pipeName } : {});
  try {
    await bridge.open('Skyline Career UI Settle Fuel Sync');
    return await readLiveResidualFuelKg(bridge);
  } finally {
    try {
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
}

export class CareerWatchSession {
  private bridge: NamedPipeSimBridge | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private watchState: MissionFlightWatchState = createMissionFlightWatchState();
  private running = false;
  private missionId: string | null = null;
  private missionStatus: string | null = null;
  private lastSample: FlightGroundSample | null = null;
  /** Sticky display phase (taxi hysteresis). */
  private lastPhase: string | null = null;
  private lastLiveFuelLb: number | null = null;
  private lastLivePayloadLb: number | null = null;
  private lastLoadVerification: LoadVerificationWeights | null = null;
  private lastEvent: MissionFlightEvent | null = null;
  private lastEventAtIso: string | null = null;
  private lastError: string | null = null;
  private settlement: WatchStatusPayload['settlement'] = null;
  private walletUsd: number | null = null;
  private opts: Required<
    Pick<
      WatchOptions,
      | 'intervalSec'
      | 'autoDepart'
      | 'autoSettle'
      | 'requireEnginesOff'
      | 'requireDestProximity'
      | 'settleRadiusNm'
      | 'allowDepartOverride'
    >
  > & { pipeName?: string } = {
    intervalSec: 5,
    autoDepart: true,
    autoSettle: true,
    requireEnginesOff: true,
    requireDestProximity: true,
    settleRadiusNm: 12,
    allowDepartOverride: false,
  };
  private tickInFlight = false;
  private preflightDepartBlockedLogged = false;

  constructor(private readonly cb: WatchCallbacks) {}

  getStatus(): WatchStatusPayload {
    const nowMs = Date.now();
    const airborneAtMs = this.watchState.airborneAtMs;
    const expectedRouteMs = this.watchState.expectedRouteMs;
    let flightTime: WatchFlightTimePayload | null = null;
    if (
      typeof airborneAtMs === 'number' &&
      Number.isFinite(airborneAtMs) &&
      typeof expectedRouteMs === 'number' &&
      Number.isFinite(expectedRouteMs) &&
      expectedRouteMs > 0
    ) {
      const check = evaluateMinAirborneElapsed({
        airborneAtMs,
        expectedRouteMs,
        nowMs,
      });
      flightTime = {
        airborneAtMs,
        expectedRouteMs,
        requiredMs: check.requiredMs,
        elapsedMs: check.elapsedMs,
        ratio: check.elapsedMs / expectedRouteMs,
        met: check.ok,
      };
    }
    if (this.lastSample) {
      this.lastPhase = flightPhaseFromSample(this.lastSample, this.lastPhase);
    }
    return {
      running: this.running,
      missionId: this.missionId,
      missionStatus: this.missionStatus,
      phase: this.lastPhase,
      onGround: this.lastSample?.onGround ?? null,
      enginesRunning: this.lastSample?.enginesRunning ?? null,
      groundSpeedKt:
        typeof this.lastSample?.groundSpeedKt === 'number'
          ? this.lastSample.groundSpeedKt
          : null,
      position: this.lastSample?.position ?? null,
      liveFuelLb: this.lastLiveFuelLb,
      livePayloadLb: this.lastLivePayloadLb,
      loadVerification: this.lastLoadVerification,
      sawAirborne: this.watchState.sawAirborne,
      lastEvent: this.lastEvent,
      lastEventAtIso: this.lastEventAtIso,
      lastError: this.lastError,
      settlement: this.settlement,
      walletUsd: this.walletUsd,
      autoDepart: this.opts.autoDepart,
      autoSettle: this.opts.autoSettle,
      intervalSec: this.opts.intervalSec,
      allowDepartOverride: this.opts.allowDepartOverride,
      flightTime,
    };
  }

  async start(opts: WatchOptions): Promise<WatchStatusPayload> {
    if (this.running) {
      await this.stop();
    }

    this.opts = {
      intervalSec: Math.max(1, Math.floor(opts.intervalSec ?? 5)),
      autoDepart: opts.autoDepart !== false,
      autoSettle: opts.autoSettle !== false,
      requireEnginesOff: opts.requireEnginesOff !== false,
      requireDestProximity: opts.requireDestProximity !== false,
      settleRadiusNm: opts.settleRadiusNm ?? 12,
      allowDepartOverride: opts.allowDepartOverride === true,
      pipeName: opts.pipeName,
    };
    this.missionId = opts.missionId;
    this.lastSample = null;
    this.lastPhase = null;
    this.lastLiveFuelLb = null;
    this.lastLivePayloadLb = null;
    this.lastLoadVerification = null;
    this.lastEvent = null;
    this.lastEventAtIso = null;
    this.lastError = null;
    this.settlement = null;
    this.preflightDepartBlockedLogged = false;

    const loaded = await this.cb.withCareerRead((_world, missions) => {
      const mission = missions.missions.find((m) => m.id === opts.missionId);
      return mission
        ? { mission, walletUsd: missions.walletUsd }
        : null;
    });
    if (!loaded) {
      this.missionId = null;
      throw new Error(`Unknown mission ${opts.missionId}`);
    }
    const { mission } = loaded;
    if (!['accepted', 'dispatched', 'in_flight'].includes(mission.status)) {
      this.missionId = null;
      throw new Error(`Mission ${mission.id} is ${mission.status} — nothing to watch`);
    }
    this.missionStatus = mission.status;
    this.walletUsd = loaded.walletUsd;
    this.watchState = createMissionFlightWatchState({
      sawAirborne: mission.status === 'in_flight',
      airborneAtMs: mission.airborneAtMs,
      expectedRouteMs:
        mission.expectedRouteMs ??
        (mission.status === 'in_flight'
          ? resolveExpectedRouteMs(mission)
          : undefined),
    });

    const bridge = new NamedPipeSimBridge(
      opts.pipeName ? { pipeName: opts.pipeName } : {},
    );
    try {
      await bridge.open('Skyline Career UI Watch');
    } catch (error) {
      this.missionId = null;
      this.missionStatus = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
    this.bridge = bridge;
    this.running = true;

    // First sample immediately, then on interval.
    await this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.opts.intervalSec * 1000);

    return this.getStatus();
  }

  async stop(): Promise<WatchStatusPayload> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.bridge) {
      try {
        // Keep shared SimConnect alive for inject / preflight.
        await this.bridge.close({ disconnectHost: false });
      } catch {
        /* ignore */
      }
      this.bridge = null;
    }
    return this.getStatus();
  }

  private async tick(): Promise<void> {
    if (!this.running || !this.bridge || !this.missionId || this.tickInFlight) {
      return;
    }
    // OFP inject owns SimConnect traffic — concurrent Watch samples on a second
    // pipe client were a common trigger for STATUS_PIPE_DISCONNECTED (0xC00000B0).
    if (isOfpLoadActive()) {
      return;
    }
    this.tickInFlight = true;
    try {
      const sample = await sampleLiveFlight(this.bridge);
      this.lastSample = sample;
      this.lastError = null;

      const snap = await this.cb.withCareerRead((world, missions) => {
        const idx = missions.missions.findIndex((m) => m.id === this.missionId);
        if (idx < 0) return null;
        const current = missions.missions[idx]!;
        return { world, missions, idx, current };
      });
      if (!snap) {
        this.lastError = `Unknown mission ${this.missionId}`;
        await this.stop();
        return;
      }
      const { world, current } = snap;
      this.missionStatus = current.status;
      this.walletUsd = snap.missions.walletUsd;

      if (current.status === 'settled' || current.status === 'cancelled' || current.status === 'failed') {
        await this.stop();
        return;
      }

      // Loaded vs Due: Watch owns the pipe — sample + persist (single source of truth).
      const prevVerification = current.lastPreflightCheck?.loadVerification;
      if (
        prevVerification &&
        current.status === 'dispatched' &&
        sample.onGround
      ) {
        try {
          const load = await sampleLiveLoadLb(
            this.bridge,
            prevVerification.payload.plannedLb,
          );
          this.lastLiveFuelLb = load.fuelLb;
          this.lastLivePayloadLb = load.payloadLb;
          const nextWeights = evaluateLoadVerification({
            plannedFuelLb: prevVerification.fuel.plannedLb,
            liveFuelLb: load.fuelLb ?? undefined,
            plannedPayloadLb: prevVerification.payload.plannedLb,
            livePayloadLb: load.payloadLb ?? undefined,
          });
          this.lastLoadVerification = nextWeights;
          if (
            loadVerificationDrifted(
              {
                ready: prevVerification.ready,
                fuel: prevVerification.fuel,
                payload: prevVerification.payload,
              },
              nextWeights,
            )
          ) {
            await this.cb.updateOpenMission(
              this.missionId,
              (_missions, openMission, openIdx) => {
                const prev = openMission.lastPreflightCheck;
                if (!prev?.loadVerification) return false;
                openMission.lastPreflightCheck = {
                  ...prev,
                  checkedAtIso: new Date().toISOString(),
                  verdict: nextWeights.ready
                    ? prev.verdict === 'fail'
                      ? 'pass'
                      : prev.verdict
                    : 'fail',
                  loadVerification: {
                    ...prev.loadVerification,
                    ready: nextWeights.ready,
                    fuel: {
                      ...prev.loadVerification.fuel,
                      ...nextWeights.fuel,
                    },
                    payload: {
                      ...prev.loadVerification.payload,
                      ...nextWeights.payload,
                    },
                    aircraft: {
                      onGround: sample.onGround,
                      enginesRunning: sample.enginesRunning,
                    },
                  },
                };
                // Keep local mission snapshot in sync for depart gate below.
                current.lastPreflightCheck = openMission.lastPreflightCheck;
                return true;
              },
            );
          }
        } catch {
          /* keep previous live load / verification */
        }
      }

      const destTerminal = world.airports.find((a) => a.icao === current.destIcao);
      const destCoords = resolveAirportCoords(current.destIcao, destTerminal);
      const distanceNm = routeDistanceNm(
        world,
        current.originIcao,
        current.destIcao,
      );
      const fallbackHours = estimateMissionBlockHours(
        world,
        current.originIcao,
        current.destIcao,
        current.aircraftClassId,
      );
      const expectedRouteMs =
        current.expectedRouteMs ??
        resolveExpectedRouteMs(current, { distanceNm, fallbackHours });
      const nowMs = Date.now();
      const { event, nextState } = evaluateMissionFlightTransition(
        current,
        sample,
        this.watchState,
        {
          requireEnginesOffToSettle: this.opts.requireEnginesOff,
          requireDestProximity: this.opts.requireDestProximity,
          destCoords,
          settleRadiusNm: this.opts.settleRadiusNm,
          nowMs,
          expectedRouteMs,
          distanceNm,
          fallbackHours,
        },
      );
      this.watchState = nextState;
      this.lastEvent = event;
      this.lastEventAtIso = new Date().toISOString();

      // Persist airborne clock if Watch first saw wheels-up on an already in-flight mission.
      if (
        current.status === 'in_flight' &&
        nextState.airborneAtMs !== undefined &&
        (current.airborneAtMs !== nextState.airborneAtMs ||
          current.expectedRouteMs !== nextState.expectedRouteMs)
      ) {
        await this.cb.updateOpenMission(
          this.missionId,
          async (freshMissions, openMission, openIdx) => {
            if (openMission.status !== 'in_flight') return false;
            freshMissions.missions[openIdx] = {
              ...openMission,
              airborneAtMs: openMission.airborneAtMs ?? nextState.airborneAtMs,
              expectedRouteMs:
                openMission.expectedRouteMs ?? nextState.expectedRouteMs,
            };
            return true;
          },
        );
      }

      if (event.type === 'depart' && this.opts.autoDepart) {
        if (
          preflightBlocksDepart(current) &&
          !this.opts.allowDepartOverride
        ) {
          if (!this.preflightDepartBlockedLogged) {
            this.lastError =
              'Auto-depart blocked: Preflight not ready — fix load or restart Watch with override';
            this.preflightDepartBlockedLogged = true;
          }
        } else {
          const saved = await this.cb.withCareerWrite((worldFresh, freshMissions) => {
            const openIdx = freshMissions.missions.findIndex(
              (m) => m.id === this.missionId,
            );
            if (openIdx < 0) return false;
            const openMission = freshMissions.missions[openIdx]!;
            if (
              openMission.status !== 'accepted' &&
              openMission.status !== 'dispatched'
            ) {
              return false;
            }
            const departed = departMission(worldFresh, openMission, {
              fleet: freshMissions,
              nowMs: nextState.airborneAtMs ?? nowMs,
              distanceNm,
              expectedRouteMs: nextState.expectedRouteMs ?? expectedRouteMs,
            });
            freshMissions.missions[openIdx] = departed.mission;
            if (departed.fuelDebitUsd > 0) {
              applyWalletDelta(freshMissions, {
                amountUsd: -departed.fuelDebitUsd,
                kind: 'fuel',
                atTick: worldFresh.tick,
                missionId: departed.mission.id,
                icao: departed.mission.originIcao,
                note: `${departed.mission.originIcao}→${departed.mission.destIcao}`,
              });
            }
            this.missionStatus = departed.mission.status;
            this.walletUsd = freshMissions.walletUsd;
            this.watchState = {
              ...this.watchState,
              airborneAtMs: departed.mission.airborneAtMs,
              expectedRouteMs: departed.mission.expectedRouteMs,
            };
            return true;
          });
          if (!saved) {
            await this.stop();
            return;
          }
        }
      } else if (event.type === 'settle' && this.opts.autoSettle) {
        let residualFuelKg: number | undefined;
        try {
          residualFuelKg = await readLiveResidualFuelKg(this.bridge);
        } catch {
          residualFuelKg = undefined;
        }
        const saved = await this.cb.withCareerWrite((worldFresh, freshMissions) => {
          const openIdx = freshMissions.missions.findIndex(
            (m) => m.id === this.missionId,
          );
          if (openIdx < 0) return false;
          const openMission = freshMissions.missions[openIdx]!;
          if (
            openMission.status !== 'accepted' &&
            openMission.status !== 'dispatched' &&
            openMission.status !== 'in_flight'
          ) {
            return false;
          }
          const result = settleMission(worldFresh, openMission, {
            fleet: freshMissions,
            residualFuelKg,
          });
          freshMissions.missions[openIdx] = result.mission;
          if (result.walletCreditUsd > 0) {
            applyWalletDelta(freshMissions, {
              amountUsd: result.walletCreditUsd,
              kind: 'freight_payout',
              atTick: worldFresh.tick,
              missionId: result.mission.id,
              icao: result.mission.destIcao,
              note: `${result.mission.originIcao}→${result.mission.destIcao}`,
            });
          }
          if (result.fuelDebitUsd > 0) {
            applyWalletDelta(freshMissions, {
              amountUsd: -result.fuelDebitUsd,
              kind: 'fuel',
              atTick: worldFresh.tick,
              missionId: result.mission.id,
              icao: result.mission.destIcao,
              note: 'settlement fuel',
            });
          }
          this.missionStatus = result.mission.status;
          this.walletUsd = freshMissions.walletUsd;
          this.settlement = {
            payoutUsd: result.settlement.payoutUsd,
            penaltyUsd: result.settlement.penaltyUsd,
            lateTicks: result.settlement.lateTicks,
            onTime: result.settlement.onTime,
            deliveredKg: result.settlement.deliveredKg,
            residualFuelKg: result.mission.settledFuelKg ?? null,
          };
          return true;
        });
        if (!saved) {
          await this.stop();
          return;
        }
        await this.stop();
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      // Keep running so transient pipe blips can recover; UI surfaces lastError.
    } finally {
      this.tickInFlight = false;
    }
  }
}
