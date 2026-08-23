import type {
  Mission,
  MissionSettlement,
  FlightScoreSnapshot,
  WeatherOpsSnapshot,
  RunwayTouchdownSnapshot,
  CargoOpsDelta,
} from './api';

export type DispatchStepId =
  | 'manifest'
  | 'flight_plan'
  | 'fuel'
  | 'load'
  | 'ready'
  | 'en_route'
  | 'debrief';

export type LoadPath = 'inject' | 'efb' | 'manual';

export const DISPATCH_STEP_ORDER: DispatchStepId[] = [
  'manifest',
  'flight_plan',
  'fuel',
  'load',
  'ready',
  'en_route',
  'debrief',
];

export const DISPATCH_STEP_LABEL: Record<DispatchStepId, string> = {
  manifest: 'Manifest',
  flight_plan: 'Flight plan',
  fuel: 'Fuel',
  load: 'Load',
  ready: 'Ready',
  en_route: 'En route',
  debrief: 'Debrief',
};

export type FlightDebrief = {
  missionId: string;
  originIcao: string;
  destIcao: string;
  onTime: boolean;
  lateTicks: number;
  contractPayUsd: number;
  payoutUsd: number;
  penaltyUsd: number;
  fuelCostUsd: number;
  residualFuelKg: number | null;
  /** Touchdown vertical speed (fpm), typically negative. */
  landingFpm: number | null;
  /** Airborne duration (wheels-up → touchdown/settle), ms. */
  flightDurationMs: number | null;
  flightScore: FlightScoreSnapshot | null;
  weatherBonusUsd: number;
  weatherOps: WeatherOpsSnapshot | null;
  runwayTouch: RunwayTouchdownSnapshot | null;
  cargoOpsDeltas: CargoOpsDelta[];
  netUsd: number;
};

const CARGO_OPS_LABELS: Record<string, string> = {
  general: 'General',
  supplies: 'Supplies',
  electronics: 'Electronics',
  perishables: 'Perishables',
  machinery: 'Machinery',
};

/** Compact toast / debrief line for Cargo Ops rep deltas. */
export function formatCargoOpsDebriefLine(
  deltas: CargoOpsDelta[] | null | undefined,
): string {
  if (!deltas?.length) return '';
  return deltas
    .map((d) => {
      const name = CARGO_OPS_LABELS[d.commodityId] ?? d.commodityId;
      const sign = d.deltaRep > 0 ? '+' : '';
      const unlock = d.unlockedNow ? ' · unlocked' : '';
      const clean = d.clean ? ' · clean' : '';
      return `${name} ${sign}${d.deltaRep}→${d.repAfter}${clean}${unlock}`;
    })
    .join(' · ');
}

/** Format touchdown rate for debrief/logbook (e.g. "−220 fpm"). */
export function formatLandingFpm(fpm: number | null | undefined): string {
  if (typeof fpm !== 'number' || !Number.isFinite(fpm)) return '—';
  const rounded = Math.round(fpm);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} fpm`;
}

/** Format airborne duration for debrief (e.g. "1h 09m"). */
export function formatFlightDurationMs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Compact debrief line for live weather-ops bonus. */
export function formatWeatherOpsDebriefLine(
  weatherOps: WeatherOpsSnapshot | null | undefined,
  weatherBonusUsd: number,
): string {
  if (!weatherOps || weatherOps.sampleCount <= 0) return '';
  const pct = Math.round(weatherOps.bonusFrac * 100);
  const parts: string[] = [];
  if (weatherBonusUsd > 0 && pct > 0) {
    parts.push(`Weather ops +${pct}%`);
  } else if (weatherOps.eligible) {
    parts.push(`Weather ops score ${Math.round(weatherOps.avgScore)}`);
  } else {
    parts.push(
      `Weather ops score ${Math.round(weatherOps.avgScore)} (not eligible)`,
    );
  }
  if (weatherOps.minApproachVisM != null) {
    parts.push(`vis ${(weatherOps.minApproachVisM / 1000).toFixed(1)} km app`);
  } else if (weatherOps.avgVisM != null) {
    parts.push(`vis ${(weatherOps.avgVisM / 1000).toFixed(1)} km avg`);
  }
  if (weatherOps.avgHeadwindKt >= 1) {
    parts.push(`HW ${Math.round(weatherOps.avgHeadwindKt)} kt`);
  }
  if (weatherOps.rainFraction >= 0.05) {
    parts.push(`rain ${Math.round(weatherOps.rainFraction * 100)}%`);
  }
  return parts.join(' · ');
}

/** Compact debrief line for runway touchdown (catalog projection). */
export function formatRunwayTouchdownDebriefLine(
  touch: RunwayTouchdownSnapshot | null | undefined,
): string {
  if (!touch) return '';
  const ident =
    touch.landingEnd === 'reciprocal' && touch.runwayIdentReciprocal
      ? touch.runwayIdentReciprocal
      : touch.runwayIdent;
  const thrLabel =
    touch.landingEnd === 'reciprocal' && touch.runwayIdentReciprocal
      ? Math.max(0, touch.lengthM - touch.pastThresholdM)
      : Math.max(0, touch.pastThresholdM);
  // lateralM is stored against the primary heading; facing the end you actually
  // landed on mirrors it. The diagram already flips, so skipping it here made
  // the text contradict the marker on every reciprocal approach.
  const lateralForPilot =
    touch.landingEnd === 'reciprocal' ? -touch.lateralM : touch.lateralM;
  const side =
    Math.abs(lateralForPilot) < 2
      ? 'centerline'
      : lateralForPilot > 0
        ? `${Math.abs(Math.round(lateralForPilot))} m right`
        : `${Math.abs(Math.round(lateralForPilot))} m left`;
  const pavement = touch.onPavement ? 'on pavement' : 'OFF runway';
  const light =
    touch.lighted === true
      ? ' · lighted'
      : touch.lighted === false
        ? ' · unlit'
        : '';
  return `RWY ${ident} · ${Math.round(thrLabel)} m past THR · ${side} · ${pavement}${light}`;
}

export function buildFlightDebrief(opts: {
  mission: Pick<
    Mission,
    | 'id'
    | 'originIcao'
    | 'destIcao'
    | 'payUsd'
    | 'fuelUplift'
    | 'settledLandingFpm'
    | 'settledFlightDurationMs'
    | 'settledFlightScore'
    | 'settledWeatherOps'
    | 'settledWeatherBonusUsd'
    | 'settledRunwayTouch'
  >;
  settlement: MissionSettlement;
}): FlightDebrief {
  const fuelCostUsd = opts.mission.fuelUplift?.costUsd ?? 0;
  const landingFpm =
    typeof opts.settlement.landingFpm === 'number' &&
    Number.isFinite(opts.settlement.landingFpm)
      ? Math.round(opts.settlement.landingFpm)
      : typeof opts.mission.settledLandingFpm === 'number' &&
          Number.isFinite(opts.mission.settledLandingFpm)
        ? Math.round(opts.mission.settledLandingFpm)
        : null;
  const flightDurationMs =
    typeof opts.settlement.flightDurationMs === 'number' &&
    Number.isFinite(opts.settlement.flightDurationMs)
      ? Math.round(opts.settlement.flightDurationMs)
      : typeof opts.mission.settledFlightDurationMs === 'number' &&
          Number.isFinite(opts.mission.settledFlightDurationMs)
        ? Math.round(opts.mission.settledFlightDurationMs)
        : null;
  const flightScore =
    opts.settlement.flightScore ?? opts.mission.settledFlightScore ?? null;
  const weatherOps =
    opts.settlement.weatherOps ?? opts.mission.settledWeatherOps ?? null;
  const weatherBonusUsd =
    typeof opts.settlement.weatherBonusUsd === 'number' &&
    Number.isFinite(opts.settlement.weatherBonusUsd)
      ? Math.round(opts.settlement.weatherBonusUsd)
      : typeof opts.mission.settledWeatherBonusUsd === 'number' &&
          Number.isFinite(opts.mission.settledWeatherBonusUsd)
        ? Math.round(opts.mission.settledWeatherBonusUsd)
        : 0;
  const runwayTouch =
    opts.settlement.runwayTouch ?? opts.mission.settledRunwayTouch ?? null;
  return {
    missionId: opts.mission.id,
    originIcao: opts.mission.originIcao,
    destIcao: opts.mission.destIcao,
    onTime: opts.settlement.onTime,
    lateTicks: opts.settlement.lateTicks,
    contractPayUsd: opts.mission.payUsd,
    payoutUsd: opts.settlement.payoutUsd,
    penaltyUsd: opts.settlement.penaltyUsd,
    fuelCostUsd,
    residualFuelKg: opts.settlement.residualFuelKg,
    landingFpm,
    flightDurationMs,
    flightScore,
    weatherBonusUsd,
    weatherOps,
    runwayTouch,
    cargoOpsDeltas: opts.settlement.cargoOpsDeltas ?? [],
    netUsd: opts.settlement.payoutUsd - fuelCostUsd,
  };
}

export function resolveLoadPath(
  mission: Mission,
  preferManualLoad: boolean,
): LoadPath {
  if (preferManualLoad) return 'manual';
  // Prefer server-stamped policy (withMissionLoadPolicy / airframe injectCapable).
  // Class fallback only when the mission never got a loadMethod.
  const method =
    mission.loadMethod === 'native-simbrief' ||
    mission.loadMethod === 'direct-injection'
      ? mission.loadMethod
      : mission.aircraftClassId === 'light_turboprop' ||
          mission.aircraftClassId === 'light_ga' ||
          mission.aircraftClassId === 'light_jet'
        ? 'direct-injection'
        : 'native-simbrief';
  const injectCapable =
    typeof mission.injectCapable === 'boolean'
      ? mission.injectCapable
      : method === 'direct-injection';
  if (method === 'direct-injection' && injectCapable) return 'inject';
  if (method === 'native-simbrief') return 'efb';
  return 'manual';
}

/** Copy when Load has no lastPreflightCheck yet (EFB / inject / manual). */
export function livePreflightWaitHint(input: {
  bootstrapError?: string | null;
  simBridgeConnected: boolean;
  onGround: boolean | null | undefined;
  watchRunning: boolean;
  aircraftLabel: string;
  liveAircraftTitle?: string | null;
}): string {
  if (input.bootstrapError?.trim()) {
    return `Preflight error: ${input.bootstrapError.trim()}`;
  }
  if (input.watchRunning) {
    return 'Stopping Watch so Preflight can sample…';
  }
  if (!input.simBridgeConnected) {
    return `SimBridge is offline — start the bridge, then load the ${input.aircraftLabel} at the origin.`;
  }
  if (input.onGround === false) {
    return 'MSFS reports airborne — Preflight only runs on the ground.';
  }
  const live = input.liveAircraftTitle?.trim();
  if (live) {
    return `Reading “${live}”… the Preflight card opens when the first sample lands (usually a few seconds).`;
  }
  return `SimBridge is up, but no aircraft title yet — load the ${input.aircraftLabel} at the gate (cold & dark is fine).`;
}

export function ofpAccepted(mission: Mission): boolean {
  const v = mission.lastOfpCheck?.verdict;
  return v === 'pass' || v === 'warn';
}

/** True when the only OFP fail is SimBrief cargo below the mission load. */
export function isOfpCargoUnderOnlyFailureUi(
  check: Mission['lastOfpCheck'] | undefined | null,
): boolean {
  if (!check || check.verdict !== 'fail') return false;
  const fails = check.findings.filter((f) => f.severity === 'fail');
  if (fails.length !== 1) return false;
  const f = fails[0]!;
  if (f.code !== 'INTENT_CARGO_MISMATCH') return false;
  if (
    typeof f.expected === 'number' &&
    typeof f.actual === 'number' &&
    Number.isFinite(f.expected) &&
    Number.isFinite(f.actual)
  ) {
    return f.actual < f.expected;
  }
  if (typeof f.delta === 'number' && Number.isFinite(f.delta)) {
    return f.delta < 0;
  }
  return /\bbelow\b/i.test(f.message);
}

/** OFP cargo kg from an under-cargo finding (actual), when present. */
export function ofpCargoKgFromUnderFinding(
  check: Mission['lastOfpCheck'] | undefined | null,
): number | undefined {
  if (!isOfpCargoUnderOnlyFailureUi(check)) return undefined;
  const f = check!.findings.find(
    (finding) =>
      finding.severity === 'fail' && finding.code === 'INTENT_CARGO_MISMATCH',
  );
  if (
    typeof f?.actual === 'number' &&
    Number.isFinite(f.actual) &&
    f.actual >= 1
  ) {
    return Math.floor(f.actual);
  }
  const match = f?.message.match(/OFP cargo\s+([\d.]+)\s*kg/i);
  if (match) {
    const kg = Number(match[1]);
    if (Number.isFinite(kg) && kg >= 1) return Math.floor(kg);
  }
  return undefined;
}

export function fuelAuthorizedForOfp(mission: Mission): boolean {
  const ofp = mission.lastOfpCheck;
  if (!ofp?.ofpId) return false;
  if (!ofpAccepted(mission)) return false;
  // Contract pilot: operator covers Jet-A — skip the player fuel purchase step.
  if (mission.contractPilot) return true;
  return mission.fuelAuthorizedOfpId === ofp.ofpId;
}

export function loadVerificationReady(mission: Mission): boolean {
  return Boolean(mission.lastPreflightCheck?.loadVerification?.ready);
}

/** Live MSFS must be near mission origin (or legacy check without location). */
export function originLocationAllowsDepart(mission: Mission): boolean {
  const loc = mission.lastPreflightCheck?.location;
  if (!loc) return true;
  return loc.ok !== false;
}

export function deriveDispatchStep(input: {
  hasDraft: boolean;
  hasDebrief: boolean;
  mission: Mission | null | undefined;
}): DispatchStepId {
  if (input.hasDebrief) return 'debrief';
  if (input.hasDraft) return 'manifest';
  const mission = input.mission;
  if (!mission) return 'manifest';
  if (mission.status === 'in_flight') return 'en_route';
  if (
    fuelAuthorizedForOfp(mission) &&
    loadVerificationReady(mission) &&
    originLocationAllowsDepart(mission)
  ) {
    return 'ready';
  }
  if (fuelAuthorizedForOfp(mission)) return 'load';
  if (ofpAccepted(mission)) return 'fuel';
  return 'flight_plan';
}

export function dispatchStepStatusLine(input: {
  step: DispatchStepId;
  mission: Mission | null | undefined;
  simbriefUser: string;
  ofpAutoStatus: 'idle' | 'waiting' | 'checking';
  missionFuelQuoteStatus: 'idle' | 'loading' | 'ready' | 'error';
  missionFuelQuoteError: string | null;
  loadOfpAutoStatus: 'idle' | 'waiting' | 'loading' | 'done' | 'failed';
  loadOfpAutoError: string | null;
  loadOfpProgress?: {
    phase: 'planning' | 'injecting' | 'balancing' | 'verifying' | 'done' | 'failed';
    message: string;
    cgAttempt?: number;
    cgMaxAttempts?: number;
    liveMac?: number;
  } | null;
  loadPath: LoadPath;
  simBridgeConnected: boolean;
  watchRunning: boolean;
  watchAutoStatus: 'idle' | 'waiting' | 'connecting' | 'blocked';
  /** Live Watch sample — used for post-landing settle hints. */
  watchOnGround?: boolean | null;
  watchEnginesRunning?: boolean | null;
  watchSawAirborne?: boolean;
  watchSettleBlockedReason?: string | null;
}): string {
  const { step, mission } = input;
  switch (step) {
    case 'manifest':
      return 'Stage cargo, then Accept & Dispatch.';
    case 'flight_plan':
      if (!input.simbriefUser.trim()) {
        return 'Set your SimBrief username in Settings, then open the flight plan.';
      }
      if (mission?.lastOfpCheck?.verdict === 'fail') {
        return input.ofpAutoStatus === 'checking'
          ? 'Checking for an updated OFP…'
          : 'OFP does not match yet — update SimBrief; auto-check every 10s.';
      }
      if (input.ofpAutoStatus === 'checking') {
        return 'Checking SimBrief for OFP…';
      }
      return mission?.status === 'accepted'
        ? 'Open SimBrief to generate the OFP. Auto-confirm runs every 10s after dispatch.'
        : 'Waiting for OFP — generate the plan in SimBrief; auto-check every 10s.';
    case 'fuel':
      if (input.missionFuelQuoteStatus === 'error') {
        return (
          input.missionFuelQuoteError ??
          'Could not calculate OFP fuel purchase — retry.'
        );
      }
      if (input.missionFuelQuoteStatus === 'loading' || !mission) {
        return 'Checking persisted aircraft fuel against OFP block fuel…';
      }
      return 'Buy Jet-A to cover the OFP shortfall, then continue to load.';
    case 'load':
      if (
        input.mission &&
        loadVerificationReady(input.mission) &&
        !originLocationAllowsDepart(input.mission)
      ) {
        const loc = input.mission.lastPreflightCheck!.location!;
        if (loc.distanceNm !== undefined) {
          return `Not at origin — aircraft is ${loc.distanceNm.toFixed(1)} nm from ${loc.originIcao} (need ≤${loc.radiusNm} nm). Relocate before takeoff; Watch will not auto-depart.`;
        }
        return `Not at origin ${loc.originIcao} — relocate within ${loc.radiusNm} nm before takeoff. Watch will not auto-depart.`;
      }
      if (input.loadPath === 'inject') {
        if (input.loadOfpAutoStatus === 'failed') {
          return (
            input.loadOfpAutoError ??
            'Aircraft load failed — enable Skyline inject in Preflight to retry.'
          );
        }
        if (!input.simBridgeConnected) {
          return 'Waiting for SimBridge — then enable Skyline inject in Preflight.';
        }
        if (input.loadOfpAutoStatus === 'loading') {
          if (input.loadOfpProgress?.message) {
            return `${input.loadOfpProgress.message} · Turn inject off to stop.`;
          }
          return 'Loading fuel/payload and balancing CG — turn Skyline inject off to stop.';
        }
        if (!input.mission?.lastPreflightCheck) {
          return 'Reading live fuel and payload from MSFS… Preflight opens when the first sample lands.';
        }
        return 'Enable Skyline inject in Preflight to write fuel & payload — Loaded vs Due updates live.';
      }
      if (input.loadPath === 'efb') {
        if (input.mission?.lastPreflightCheck) {
          return 'EFB import path — fix Loaded vs Due below (re-import weights if needed).';
        }
        return livePreflightWaitHint({
          bootstrapError: null,
          simBridgeConnected: input.simBridgeConnected,
          onGround: input.watchOnGround,
          watchRunning: input.watchRunning,
          aircraftLabel: 'aircraft',
        });
      }
      if (input.mission?.lastPreflightCheck) {
        return 'Manual load path — fix Loaded vs Due below.';
      }
      return livePreflightWaitHint({
        bootstrapError: null,
        simBridgeConnected: input.simBridgeConnected,
        onGround: input.watchOnGround,
        watchRunning: input.watchRunning,
        aircraftLabel: 'aircraft',
      });
    case 'ready':
      if (input.watchRunning) {
        return 'Preflight ready · Watch connected — take off in MSFS; departure is detected automatically.';
      }
      if (input.watchAutoStatus === 'connecting') {
        return 'Preflight ready · connecting Watch to MSFS…';
      }
      if (input.watchAutoStatus === 'waiting') {
        return 'Preflight ready · waiting for SimBridge to arm Watch.';
      }
      return 'Preflight ready — take off in MSFS when Watch is connected.';
    case 'en_route': {
      if (
        input.watchOnGround === true &&
        input.watchRunning &&
        !input.watchSawAirborne
      ) {
        return 'Still on the ground — take off in MSFS. Menu / variant swaps are not a departure.';
      }
      if (input.watchSettleBlockedReason) {
        return `Landed — settle blocked: ${input.watchSettleBlockedReason}`;
      }
      if (input.watchOnGround === true) {
        if (!input.watchRunning) {
          return input.watchEnginesRunning
            ? 'Landed — Watch is reconnecting. Shut down engines (or set parking brake) to settle.'
            : 'Landed · engines off — Watch is reconnecting to settle the flight…';
        }
        if (input.watchSawAirborne) {
          if (input.watchEnginesRunning) {
            return 'Landed — shut down engines (or set parking brake) in MSFS to settle the flight.';
          }
          return 'Landed · engines off — Watch is settling the flight…';
        }
      }
      return input.watchRunning
        ? 'En route — Watch tracks the flight. Settle unlocks after ≥70% of planned route time (≥50% under 100 nm).'
        : 'En route — keep Watch connected so touchdown can settle the flight.';
    }
    case 'debrief':
      return 'Flight complete — review the P&L, then return to Freights.';
    default:
      return '';
  }
}

/**
 * After a UI reload, open Dispatch once when the player is already airborne.
 * Do not consume the one-shot while missions are still hydrating as ground-only
 * (that used to stick Freights as the home tab mid-cruise).
 */
export function airborneResumeShouldOpenDispatch(opts: {
  alreadyDone: boolean;
  hubSelected: boolean;
  tab: string;
  airportIcao: string | null;
  playerMissionStatus: string | undefined;
}): 'wait' | 'mark-done' | 'open-dispatch' {
  if (!opts.hubSelected || opts.alreadyDone) return 'wait';
  if (opts.playerMissionStatus !== 'in_flight') return 'wait';
  if (opts.tab === 'staging' && !opts.airportIcao) return 'mark-done';
  return 'open-dispatch';
}

