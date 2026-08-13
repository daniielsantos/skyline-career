import type { SimBridgeStatus, WatchStatus } from './api';

const FLIGHT_PHASE_LABEL: Record<string, string> = {
  ground: 'On ground',
  taxi_out: 'Taxi out',
  takeoff: 'Takeoff',
  climb: 'Climb',
  cruise: 'Cruise',
  descent: 'Descent',
  approach: 'Approach',
  landing: 'Landing',
  taxi_in: 'Taxi in',
  taxi: 'Taxi',
  airborne: 'Airborne',
  'ground+engines': 'On ground · engines',
};

function formatWatchPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return '—';
  return FLIGHT_PHASE_LABEL[phase] ?? phase;
}

type Props = {
  missionStatus?: string | null;
  simBridge: SimBridgeStatus | null;
  watch: WatchStatus | null;
  watchAutoStatus: 'idle' | 'waiting' | 'connecting' | 'blocked';
  watchAutoPaused: boolean;
  loadOfpAutoStatus: 'idle' | 'waiting' | 'loading' | 'done' | 'failed';
  /** When set, prefer Watch live samples for this mission only. */
  activeMissionId?: string | null;
};

/** App-shell SimConnect / Watch strip (phase, mission, airborne clock). */
export function WatchStatusFooter(props: Props) {
  const watchRunning = Boolean(
    props.watch?.running &&
      (!props.activeMissionId ||
        props.watch.missionId === props.activeMissionId),
  );
  const bridgeConnected = Boolean(
    props.loadOfpAutoStatus === 'loading' ||
      watchRunning ||
      props.simBridge?.connected,
  );
  const bridgeOnGround =
    watchRunning &&
    props.watch?.onGround !== null &&
    props.watch?.onGround !== undefined
      ? props.watch.onGround
      : (props.simBridge?.onGround ?? null);
  const bridgeEngines =
    watchRunning &&
    props.watch?.enginesRunning !== null &&
    props.watch?.enginesRunning !== undefined
      ? props.watch.enginesRunning
      : (props.simBridge?.enginesRunning ?? null);
  const bridgePhase =
    (watchRunning ? props.watch?.phase : null) ??
    props.simBridge?.phase ??
    null;
  const bridgeGs =
    watchRunning && props.watch?.groundSpeedKt != null
      ? props.watch.groundSpeedKt
      : (props.simBridge?.groundSpeedKt ?? null);
  const stageDetail = watchRunning
    ? formatWatchPhaseLabel(bridgePhase) !== '—'
      ? formatWatchPhaseLabel(bridgePhase)
      : bridgeOnGround === true
        ? bridgeEngines
          ? 'On ground · engines running'
          : 'On ground · engines off'
        : bridgeOnGround === false
          ? 'Airborne'
          : 'Sampling live aircraft…'
    : bridgePhase === 'taxi' ||
        (bridgeOnGround === true &&
          bridgeEngines &&
          typeof bridgeGs === 'number' &&
          bridgeGs >= 5)
      ? 'Taxiing'
      : bridgeOnGround === true
        ? bridgeEngines
          ? 'On ground · engines running'
          : 'On ground · engines off'
        : bridgeOnGround === false
          ? 'Airborne'
          : bridgeConnected
            ? 'Sampling live aircraft…'
            : 'SimBridge not connected yet';
  // Server already sticky-holds pipeConnected across single blips; trust it.
  const watchPipeLive =
    watchRunning && props.watch?.pipeConnected !== false;
  const statusLabel =
    props.loadOfpAutoStatus === 'loading'
      ? 'INJECTING…'
      : watchPipeLive
        ? 'MSFS CONNECTED'
        : watchRunning
          ? 'RECONNECTING…'
          : bridgeConnected
            ? 'SIMBRIDGE CONNECTED'
            : props.watchAutoStatus === 'connecting'
              ? 'CONNECTING…'
              : props.watchAutoPaused
                ? 'WATCH PAUSED'
                : 'WAITING FOR MSFS';

  return (
    <footer
      className={`watch-status-footer ${
        props.loadOfpAutoStatus === 'loading'
          ? 'watch-connected'
          : watchPipeLive || bridgeConnected
            ? 'watch-connected'
            : 'watch-waiting'
      }`}
    >
      <div className="watch-footer-primary">
        <span
          className={`watch-dot ${
            props.loadOfpAutoStatus === 'loading'
              ? 'checking'
              : watchRunning && !watchPipeLive
                ? 'checking'
                : !bridgeConnected && props.watchAutoStatus === 'connecting'
                  ? 'checking'
                  : watchPipeLive || bridgeConnected
                    ? 'on'
                    : 'off'
          }`}
        />
        <strong>{statusLabel}</strong>
        <div className="watch-footer-item">
          <span>Phase</span>
          <b>{stageDetail}</b>
        </div>
        <div className="watch-footer-item">
          <span>Mission</span>
          <b>{props.missionStatus ?? '—'}</b>
        </div>
      </div>
      <div className="watch-footer-secondary">
        <span>
          {bridgePhase ?? props.simBridge?.phase ?? 'idle'}
        </span>
        {watchRunning && props.watch?.flightTime ? (
          <span
            className={
              props.watch.flightTime.met
                ? 'watch-flight-time ok'
                : 'watch-flight-time pending'
            }
            title="Minimum airborne time: 70% of planned route (≥50% when route is under 100 nm). Plan may tighten after stable cruise TAS."
          >
            Airborne {Math.round(props.watch.flightTime.elapsedMs / 60_000)}m /{' '}
            {Math.round(props.watch.flightTime.expectedRouteMs / 60_000)}m air
            planned · {Math.round(props.watch.flightTime.ratio * 100)}%
            {props.watch.flightTime.met
              ? ' · settle unlocked'
              : ` · need ≥${Math.round(
                  (props.watch.flightTime.requiredMs /
                    Math.max(1, props.watch.flightTime.expectedRouteMs)) *
                    100,
                )}%`}
            {props.watch.onGround && props.watch.sawAirborne
              ? ' · clock frozen on ground'
              : ''}
          </span>
        ) : null}
        {watchRunning &&
        props.watch?.cruiseSample &&
        props.watch.cruiseSample.phase !== 'idle' ? (
          <span
            className={
              props.watch.cruiseSample.phase === 'locked'
                ? 'watch-flight-time ok'
                : 'watch-flight-time pending'
            }
            title="Stable cruise fuel flow + TAS (≥3 min level) updates this airframe's burn after settle"
          >
            Cruise{' '}
            {props.watch.cruiseSample.phase === 'locked'
              ? 'locked'
              : 'sampling'}{' '}
            {Math.round(props.watch.cruiseSample.elapsedMs / 1000)}s /{' '}
            {Math.round(props.watch.cruiseSample.requiredMs / 1000)}s
            {props.watch.cruiseSample.tasKt != null
              ? ` · ${props.watch.cruiseSample.tasKt} kt`
              : ''}
            {typeof props.watch.cruiseSample.fuelFlowKgPerHour === 'number' &&
            Number.isFinite(props.watch.cruiseSample.fuelFlowKgPerHour) &&
            props.watch.cruiseSample.fuelFlowKgPerHour > 0 &&
            props.watch.cruiseSample.fuelFlowKgPerHour < 50_000
              ? ` · ${props.watch.cruiseSample.fuelFlowKgPerHour.toLocaleString(
                  undefined,
                  { maximumFractionDigits: 1 },
                )} kg/h`
              : ''}
          </span>
        ) : null}
        {props.watch?.lastEvent?.type === 'settle_blocked' ? (
          <span className="watch-footer-error">
            {props.watch.lastEvent.reason}
          </span>
        ) : props.watch?.running &&
          props.missionStatus === 'in_flight' &&
          props.watch.onGround === true &&
          props.watch.sawAirborne &&
          props.watch.enginesRunning ? (
          <span className="watch-footer-hint">
            Shut down engines to settle
          </span>
        ) : null}
        {props.watch?.lastError ? (
          <span className="watch-footer-error">{props.watch.lastError}</span>
        ) : props.simBridge?.error && !bridgeConnected ? (
          <span className="watch-footer-error">{props.simBridge.error}</span>
        ) : null}
      </div>
    </footer>
  );
}

