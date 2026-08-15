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

const MISSION_STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  dispatched: 'Dispatched',
  in_flight: 'In flight',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

function formatWatchPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return '—';
  return FLIGHT_PHASE_LABEL[phase] ?? phase;
}

function formatMissionStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return MISSION_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
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
          ? 'On ground · engines'
          : 'On ground'
        : bridgeOnGround === false
          ? 'Airborne'
          : 'Sampling…'
    : bridgePhase === 'taxi' ||
        (bridgeOnGround === true &&
          bridgeEngines &&
          typeof bridgeGs === 'number' &&
          bridgeGs >= 5)
      ? 'Taxiing'
      : bridgeOnGround === true
        ? bridgeEngines
          ? 'On ground · engines'
          : 'On ground'
        : bridgeOnGround === false
          ? 'Airborne'
          : bridgeConnected
            ? 'Sampling…'
            : '—';
  // Server already sticky-holds pipeConnected across single blips; trust it.
  const watchPipeLive =
    watchRunning && props.watch?.pipeConnected !== false;
  const statusLabel =
    props.loadOfpAutoStatus === 'loading'
      ? 'INJECTING…'
      : watchPipeLive
        ? 'MSFS'
        : watchRunning
          ? 'RECONNECTING…'
          : bridgeConnected
            ? 'SIMBRIDGE'
            : props.watchAutoStatus === 'connecting'
              ? 'CONNECTING…'
              : props.watchAutoPaused
                ? 'PAUSED'
                : 'WAITING…';

  const flightTime = watchRunning ? props.watch?.flightTime : null;
  const cruise = watchRunning ? props.watch?.cruiseSample : null;
  const needPct =
    flightTime && !flightTime.met
      ? Math.round(
          (flightTime.requiredMs /
            Math.max(1, flightTime.expectedRouteMs)) *
            100,
        )
      : null;

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
          <b>{formatMissionStatusLabel(props.missionStatus)}</b>
        </div>
      </div>
      <div className="watch-footer-secondary">
        {flightTime ? (
          <span
            className={
              flightTime.met
                ? 'watch-flight-time ok'
                : 'watch-flight-time pending'
            }
            title="Minimum airborne time: 70% of planned route (≥50% when route is under 100 nm). Plan may tighten after stable cruise TAS."
          >
            {Math.round(flightTime.elapsedMs / 60_000)}m/
            {Math.round(flightTime.expectedRouteMs / 60_000)}m ·{' '}
            {Math.round(flightTime.ratio * 100)}%
            {needPct != null ? ` · need ${needPct}%` : ''}
            {props.watch?.onGround && props.watch?.sawAirborne
              ? ' · frozen'
              : ''}
          </span>
        ) : null}
        {cruise && cruise.phase !== 'idle' ? (
          <span
            className={
              cruise.phase === 'locked'
                ? 'watch-flight-time ok'
                : 'watch-flight-time pending'
            }
            title="Stable cruise fuel flow + TAS (≥3 min level) updates this airframe's burn after settle. Timer freezes once locked."
          >
            {(() => {
              const burnKgH =
                typeof cruise.fuelFlowKgPerHour === 'number' &&
                Number.isFinite(cruise.fuelFlowKgPerHour) &&
                cruise.fuelFlowKgPerHour > 0 &&
                cruise.fuelFlowKgPerHour < 50_000
                  ? cruise.fuelFlowKgPerHour
                  : typeof cruise.committed?.cruiseFuelFlowKgPerHour ===
                        'number' &&
                      Number.isFinite(
                        cruise.committed.cruiseFuelFlowKgPerHour,
                      ) &&
                      cruise.committed.cruiseFuelFlowKgPerHour > 0 &&
                      cruise.committed.cruiseFuelFlowKgPerHour < 50_000
                    ? cruise.committed.cruiseFuelFlowKgPerHour
                    : null;
              const burnLabel =
                burnKgH != null
                  ? ` · ${burnKgH.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })} kg/h`
                  : '';
              return cruise.phase === 'locked'
                ? `Cruise · ${cruise.tasKt ?? cruise.committed?.cruiseSpeedKt ?? '—'} kt${burnLabel}`
                : `Cruise ${Math.round(cruise.elapsedMs / 1000)}s${burnLabel}`;
            })()}
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
          <span className="watch-footer-hint">Shut down engines to settle</span>
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
