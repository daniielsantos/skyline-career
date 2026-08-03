import type {
  Mission,
  MissionSettlement,
  FlightScoreSnapshot,
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
    cargoOpsDeltas: opts.settlement.cargoOpsDeltas ?? [],
    netUsd: opts.settlement.payoutUsd - fuelCostUsd,
  };
}

export function resolveLoadPath(
  mission: Mission,
  preferManualLoad: boolean,
): LoadPath {
  if (preferManualLoad) return 'manual';
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

export function ofpAccepted(mission: Mission): boolean {
  const v = mission.lastOfpCheck?.verdict;
  return v === 'pass' || v === 'warn';
}

export function fuelAuthorizedForOfp(mission: Mission): boolean {
  const ofp = mission.lastOfpCheck;
  if (!ofp?.ofpId) return false;
  if (!ofpAccepted(mission)) return false;
  return mission.fuelAuthorizedOfpId === ofp.ofpId;
}

export function loadVerificationReady(mission: Mission): boolean {
  return Boolean(mission.lastPreflightCheck?.loadVerification?.ready);
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
  if (fuelAuthorizedForOfp(mission) && loadVerificationReady(mission)) {
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
      if (input.loadPath === 'inject') {
        if (input.loadOfpAutoStatus === 'failed') {
          return (
            input.loadOfpAutoError ??
            'Aircraft load failed — enable Skyline inject in Preflight to retry, or continue manually.'
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
        return 'Import the OFP in the aircraft EFB/FMC. Waiting for live preflight…';
      }
      return 'Set fuel and payload in Mass & Balance / EFB. Waiting for live preflight…';
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
      return 'Preflight ready — take off in MSFS when Watch is connected. Manual depart is under Advanced.';
    case 'en_route':
      return input.watchRunning
        ? 'En route — Watch tracks the flight. Settle unlocks after ≥70% of planned route time (wall clock).'
        : 'En route — settle from Advanced only after ≥70% of planned route time, or when Watch is running.';
    case 'debrief':
      return 'Flight complete — review the P&L, then return to Freights.';
    default:
      return '';
  }
}
