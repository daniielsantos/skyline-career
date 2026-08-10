import type { Mission, MissionFuelQuote, SimBridgeStatus, WatchStatus } from './api';
import { useRef } from 'react';
import {
  DISPATCH_STEP_LABEL,
  DISPATCH_STEP_ORDER,
  isOfpCargoUnderOnlyFailureUi,
  ofpCargoKgFromUnderFinding,
  type DispatchStepId,
  type LoadPath,
} from './dispatch-flow';
import { formatMassExact, formatWeightText, KG_TO_LB, type WeightSystem } from './weight-units';
import {
  CgEnvelopeSchematic,
  FuelTankSchematic,
  PayloadStationSchematic,
  formatMacPct,
} from './LoadSchematic';
import { DispatchRouteCard } from './DispatchRouteCard';
import { CrewFlyControls } from './CrewFlyControls';
import {
  formatPayloadDueLine,
  pickFuelTankBreakdown,
  pickLivePayloadLb,
  pickStableLiveFuelLb,
  stabilizeDisplayedFuel,
  matchFuelOk,
} from './load-verification';
import { mxFuelBurnAlertText } from './mx-fuel-burn';

export function DispatchStepper(props: { current: DispatchStepId }) {
  const currentIndex = DISPATCH_STEP_ORDER.indexOf(props.current);
  return (
    <ol className="dispatch-stepper" aria-label="Dispatch progress">
      {DISPATCH_STEP_ORDER.map((step, index) => {
        const state =
          index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <li key={step} className={`dispatch-step dispatch-step-${state}`}>
            <span className="dispatch-step-mark" aria-hidden="true">
              {state === 'done' ? '✓' : index + 1}
            </span>
            <span className="dispatch-step-label">{DISPATCH_STEP_LABEL[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function IcaoLink(props: {
  icao: string;
  onOpen: (icao: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icao-link"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onOpen(props.icao);
      }}
      title={`Open ${props.icao} terminal`}
    >
      {props.icao}
    </button>
  );
}

export function DispatchActivePanel(props: {
  mission: Mission;
  step: DispatchStepId;
  loadPath: LoadPath;
  busy: boolean;
  weightSystem: WeightSystem;
  /** When false, hide Dispatch Advanced cheats (depart/settle without MSFS, etc.). */
  devMode?: boolean;
  simbriefUser: string;
  continuousHours: number;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  formatDeadline: (tick: number, hours: number) => string;
  aircraftClassLabel: (id: string) => string;
  /** Structural/operational cargo ceiling for this mission (kg). */
  missionMaxCargoKg: (mission: Mission) => number;
  /** Route ops payload ceiling when known (kg) — shown under Capacity left. */
  missionOpsCapacityHint?: number | null;
  ofpAutoStatus: 'idle' | 'waiting' | 'checking';
  missionFuelQuote: {
    quote: MissionFuelQuote;
    walletUsd: number;
    walletAfterUsd: number;
  } | null;
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
    liveFuelLb?: number;
    livePayloadLb?: number;
  liveTanks?: {
    left: number;
    right: number;
    center: number;
    leftAux?: number;
    rightAux?: number;
    leftTip?: number;
    rightTip?: number;
  };
  tankCapacity?: {
    left: number;
    right: number;
    center: number;
    leftAux?: number;
    rightAux?: number;
    leftTip?: number;
    rightTip?: number;
  };
    liveStations?: Record<number, number>;
    stationMax?: Record<number, number>;
    plannedFuelLb?: number;
    plannedPayloadLb?: number;
  } | null;
  /** User-armed Skyline inject (default off). */
  skylineInjectEnabled: boolean;
  simBridge: SimBridgeStatus | null;
  watch: WatchStatus | null;
  /** Why the Preflight card has not opened yet (first sample failed). */
  preflightBootstrapError?: string | null;
  /** Worn airframe: extra fuel burn disclosed at fuel load / preflight. */
  mxFuelBurnAlert?: { excessPct: number; conditionPct: number } | null;
  onOpenAirport: (icao: string) => void;
  onSelectSettings: () => void;
  onDispatch: (mission: Mission) => void;
  onCancel: (mission: Mission) => void;
  onEditManifest: (mission: Mission) => void;
  onAcceptOfpCargo?: (mission: Mission) => void;
  onBuyFuel: (mission: Mission) => void;
  onRetryFuelQuote: () => void;
  onToggleSkylineInject: (enabled: boolean) => void;
  onContinueManually: () => void;
  onDepart: (mission: Mission) => void;
  onSettle: (mission: Mission) => void;
  /** Company crew AI dispatch (accepted/dispatched only). */
  onCrewDispatch?: (mission: Mission, crewMemberId: string) => void;
  /** Persist preferred crew on the mission before Crew fly. */
  onCrewAssign?: (mission: Mission, crewMemberId: string) => void;
  idleCrew?: Array<{ id: string; displayName: string; perkLabel?: string }>;
  crewSlotsFree?: number;
  /** Re-fetch SimBrief OFP to refresh briefing (incl. navlog waypoints). */
  onRefreshOfpBriefing: (mission: Mission) => Promise<void>;
}) {
  const {
    mission,
    step,
    loadPath,
    busy,
    weightSystem,
    simbriefUser,
    continuousHours,
  } = props;
  const devMode = props.devMode === true;

  const watchRunning = Boolean(
    props.watch?.running && props.watch.missionId === mission.id,
  );
  const lastAircraftRef = useRef<{ lat: number; lon: number } | null>(null);
  /** Hold last good fuel total + tip/aux map across inject/watch flicker frames. */
  const stickyFuelRef = useRef<{
    liveLb?: number;
    tanks?: {
      left: number;
      right: number;
      center: number;
      leftAux?: number;
      rightAux?: number;
      leftTip?: number;
      rightTip?: number;
    };
  }>({});
  const watchPos = props.watch?.position;
  if (
    watchRunning &&
    watchPos &&
    Number.isFinite(watchPos.lat) &&
    Number.isFinite(watchPos.lon) &&
    !(watchPos.lat === 0 && watchPos.lon === 0)
  ) {
    lastAircraftRef.current = watchPos;
  }
  if (!watchRunning) {
    lastAircraftRef.current = null;
  }
  const stickyAircraft =
    watchRunning && (watchPos ?? lastAircraftRef.current)
      ? (watchPos ?? lastAircraftRef.current)
      : null;
  const showOfpCard = Boolean(mission.lastOfpCheck);
  const showFuelCard =
    step === 'fuel' ||
    (mission.fuelUplift &&
      (step === 'load' || step === 'ready' || step === 'en_route'));
  const showLoadPanel = step === 'load';
  const showPreflight =
    Boolean(mission.lastPreflightCheck) &&
    (step === 'load' || step === 'ready' || step === 'en_route');

  const primaryCta = (() => {
    if (step === 'flight_plan') {
      if (!simbriefUser.trim()) {
        return (
          <button
            type="button"
            className="accept"
            disabled={busy}
            onClick={props.onSelectSettings}
          >
            Set SimBrief user
          </button>
        );
      }
      return (
        <button
          type="button"
          className="accept"
          disabled={busy}
          onClick={() => props.onDispatch(mission)}
          title="Open SimBrief with the current cargo"
        >
          {mission.status === 'accepted' ? 'Open SimBrief' : 'Re-open SimBrief'}
        </button>
      );
    }
    if (step === 'fuel') {
      if (props.missionFuelQuoteStatus === 'error') {
        return (
          <button
            type="button"
            className="accept"
            disabled={busy}
            onClick={props.onRetryFuelQuote}
          >
            Retry fuel quote
          </button>
        );
      }
      if (props.missionFuelQuote) {
        return (
          <button
            type="button"
            className="accept"
            disabled={busy || props.missionFuelQuoteStatus === 'loading'}
            onClick={() => props.onBuyFuel(mission)}
          >
            Buy fuel &amp; continue
          </button>
        );
      }
      return null;
    }
    return null;
  })();

  return (
    <>
      <DispatchStepper current={step} />

      <div className="panel-head missions-head">
        <div className="missions-head-spacer" aria-hidden="true" />
        <div className="missions-head-center">
          <h2>
            <IcaoLink
              icao={mission.originIcao}
              onOpen={props.onOpenAirport}
              disabled={busy}
            />{' '}
            →{' '}
            <IcaoLink
              icao={mission.destIcao}
              onOpen={props.onOpenAirport}
              disabled={busy}
            />
          </h2>
          <p>
            {props.aircraftClassLabel(mission.aircraftClassId)} ·{' '}
            <span className={`status status-${mission.status}`}>{mission.status}</span>
          </p>
        </div>
        <div className="missions-head-actions">
          {['accepted', 'dispatched', 'in_flight'].includes(mission.status) ? (
            <button
              type="button"
              className="action ghost danger missions-head-cancel"
              disabled={busy}
              title="Abort this flight — no payout; cargo returns to the market"
              onClick={() => props.onCancel(mission)}
            >
              Cancel flight
            </button>
          ) : null}
        </div>
      </div>

      <div className="cargo-capacity staging-capacity staging-ops-capacity">
        <span>
          Cargo
          <strong>{props.formatTonnes(mission.cargoKg)}</strong>
          <em>
            {(mission.lots?.length ?? 1) > 1
              ? `${mission.lots!.length} lots`
              : '1 lot'}
          </em>
        </span>
        <span>
          Contract
          <strong>{props.formatMoney(mission.payUsd)}</strong>
        </span>
        <span>
          Deadline
          <strong>
            {props.formatDeadline(mission.deadlineTick, continuousHours)}
          </strong>
        </span>
        <span>
          Capacity left
          <strong>
            {props.formatTonnes(
              Math.max(
                0,
                props.missionMaxCargoKg(mission) - mission.cargoKg,
              ),
            )}
          </strong>
          {typeof props.missionOpsCapacityHint === 'number' &&
          props.missionOpsCapacityHint > 0 ? (
            <em>
              of {props.formatTonnes(props.missionOpsCapacityHint)} ops
            </em>
          ) : null}
        </span>
        {mission.fuelUplift &&
        (mission.fuelUplift.costUsd > 0 ||
          mission.fuelUplift.requestedKg > 0.5) ? (
          <span>
            Fuel
            <strong>{props.formatMoney(mission.fuelUplift.costUsd)}</strong>
            <em>
              {props.formatTonnes(mission.fuelUplift.requestedKg)}
              {mission.fuelUplift.scarcity !== 'ok'
                ? ` · ${mission.fuelUplift.scarcity}`
                : ''}
            </em>
          </span>
        ) : null}
      </div>

      {(mission.lots?.length ?? 0) > 0 ||
      ['accepted', 'dispatched'].includes(mission.status) ? (
        <div className="staging-section">
          <div className="staging-section-head">
            <h3>Cargo</h3>
            {['accepted', 'dispatched'].includes(mission.status) &&
            !mission.contractPilot ? (
              <button
                type="button"
                className="action compact"
                disabled={busy}
                title="Adjust cargo lots, then regenerate the OFP"
                onClick={() => props.onEditManifest(mission)}
              >
                Edit cargo
              </button>
            ) : null}
          </div>
          {(mission.lots?.length ?? 0) > 0 ? (
            <ul className="staging-existing">
              {mission.lots!.map((line) => (
                <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                  {props.formatTonnes(line.cargoKg)} {line.commodityId} ·{' '}
                  {props.formatMoney(line.payUsd)}
                  {line.urgency === 'urgent' ? ' · urgent' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No cargo lots on this flight yet.</p>
          )}
        </div>
      ) : null}

      {(step === 'flight_plan' || showOfpCard) && showOfpCard
        ? (() => {
            const check = mission.lastOfpCheck!;
            const briefing = check.briefing;
            const actionableFindings = check.findings.filter(
              (finding) => finding.severity !== 'info',
            );
            const cruise =
              briefing?.cruiseAltitudeFt !== undefined
                ? briefing.cruiseAltitudeFt >= 18_000
                  ? `FL${String(
                      Math.round(briefing.cruiseAltitudeFt / 100),
                    ).padStart(3, '0')}`
                  : `${Math.round(briefing.cruiseAltitudeFt).toLocaleString('en-US')} FT`
                : undefined;
            const briefingItems = [
              briefing?.aircraftIcao ? ['Aircraft', briefing.aircraftIcao] : null,
              briefing?.tailNumber ? ['Tail number', briefing.tailNumber] : null,
              briefing?.distanceNm !== undefined
                ? ['Distance', `${Math.round(briefing.distanceNm)} NM`]
                : null,
              briefing?.blockTime ? ['Block time', briefing.blockTime] : null,
              briefing?.airTime ? ['Air time', briefing.airTime] : null,
              cruise ? ['Cruise', cruise] : null,
              briefing?.alternateIcao
                ? ['Alternate', briefing.alternateIcao]
                : null,
            ].filter((item): item is [string, string] => item !== null);

            return (
              <section
                className={`ofp-result-card ofp-briefing-card ofp-result-${check.verdict}`}
                aria-live="polite"
              >
                <div className="ofp-result-head">
                  <strong>
                    {check.verdict === 'pass'
                      ? 'OFP PASSED'
                      : check.verdict === 'warn'
                        ? 'OFP NEEDS REVIEW'
                        : 'OFP FAILED'}
                  </strong>
                  <span>
                    Checked {new Date(check.checkedAtIso).toLocaleTimeString()}
                  </span>
                </div>
                {briefingItems.length > 0 ? (
                  <dl className="ofp-briefing-grid">
                    {briefingItems.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {briefing?.route ? (
                  <div className="ofp-route-strip">
                    <span>Route</span>
                    <code>{briefing.route}</code>
                  </div>
                ) : (
                  <p>Re-check SimBrief to load the operational route.</p>
                )}
                {actionableFindings.length > 0 ? (
                  <details className="preflight-technical">
                    <summary>
                      {actionableFindings.length}{' '}
                      {actionableFindings.length === 1 ? 'OFP detail' : 'OFP details'}
                    </summary>
                    <ul className="ofp-findings">
                      {actionableFindings.map((finding) => (
                        <li
                          key={`ofp-${finding.code}-${finding.message}`}
                          className={`finding-${finding.severity}`}
                        >
                          [{finding.severity.toUpperCase()}]{' '}
                          {formatWeightText(finding.message, weightSystem)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {check.verdict === 'fail' &&
                isOfpCargoUnderOnlyFailureUi(check) &&
                props.onAcceptOfpCargo &&
                !mission.contractPilot ? (
                  <div className="ofp-accept-cargo">
                    <p>
                      SimBrief limited payload for this leg — leftover returns to
                      the board and pay is reduced.
                    </p>
                    <button
                      type="button"
                      className="action"
                      disabled={busy}
                      onClick={() => props.onAcceptOfpCargo?.(mission)}
                    >
                      Accept OFP cargo
                      {(() => {
                        const kg = ofpCargoKgFromUnderFinding(check);
                        return kg
                          ? ` (${formatMassExact(kg, weightSystem)})`
                          : '';
                      })()}
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })()
        : null}

      {step === 'flight_plan' && !mission.lastOfpCheck ? (
        <div className="dispatch-step-card" aria-live="polite">
          <strong>
            {!simbriefUser.trim()
              ? 'SimBrief username required'
              : props.ofpAutoStatus === 'checking'
                ? 'Checking SimBrief for OFP…'
                : 'Waiting for OFP'}
          </strong>
          <p>
            {!simbriefUser.trim()
              ? 'Set your username in Settings, then open SimBrief from the primary action.'
              : 'Generate the OFP in SimBrief. Skyline confirms automatically every 10 seconds while Dispatch is open.'}
          </p>
        </div>
      ) : null}

      {step === 'fuel' ? (
        props.missionFuelQuote ? (
          <section className="fuel-purchase-card" aria-live="polite">
            <div className="fuel-purchase-head">
              <div>
                <strong>FUEL PURCHASE REQUIRED</strong>
                <small>
                  Persisted fuel is below the confirmed SimBrief OFP block fuel.
                </small>
              </div>
              <span>{props.missionFuelQuote.quote.uplift.scarcity}</span>
            </div>
            {props.mxFuelBurnAlert ? (
              <p className="banner warn mx-fuel-burn-alert" role="status">
                {mxFuelBurnAlertText(props.mxFuelBurnAlert)}
              </p>
            ) : null}
            <dl className="fuel-purchase-grid">
              <div>
                <dt>On aircraft</dt>
                <dd>
                  {formatMassExact(
                    props.missionFuelQuote.quote.currentFuelKg,
                    weightSystem,
                  )}
                </dd>
              </div>
              <div>
                <dt>OFP block fuel</dt>
                <dd>
                  {formatMassExact(
                    props.missionFuelQuote.quote.requiredBlockFuelKg,
                    weightSystem,
                  )}
                </dd>
              </div>
              <div>
                <dt>To purchase</dt>
                <dd>
                  {formatMassExact(
                    props.missionFuelQuote.quote.shortfallKg,
                    weightSystem,
                  )}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  {props.formatMoney(props.missionFuelQuote.quote.uplift.costUsd)}
                </dd>
              </div>
            </dl>
            <div className="fuel-purchase-footer">
              <small>
                Wallet {props.formatMoney(props.missionFuelQuote.walletUsd)} →{' '}
                {props.formatMoney(props.missionFuelQuote.walletAfterUsd)}
                {props.missionFuelQuote.quote.uplift.scarcity !== 'ok'
                  ? ' · tanker surcharge included'
                  : ` · ${props.formatMoney(
                      props.missionFuelQuote.quote.uplift.unitPriceUsd,
                    )}/kg`}
              </small>
            </div>
          </section>
        ) : props.missionFuelQuoteStatus === 'error' ? (
          <div className="dispatch-step-card fuel-quote-error" aria-live="polite">
            <strong>Could not calculate OFP fuel purchase</strong>
            <p>{props.missionFuelQuoteError}</p>
            {props.mxFuelBurnAlert ? (
              <p className="banner warn mx-fuel-burn-alert" role="status">
                {mxFuelBurnAlertText(props.mxFuelBurnAlert)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="dispatch-step-card" aria-live="polite">
            <strong>Checking persisted aircraft fuel…</strong>
            <p>Comparing the career tank with OFP block fuel.</p>
            {props.mxFuelBurnAlert ? (
              <p className="banner warn mx-fuel-burn-alert" role="status">
                {mxFuelBurnAlertText(props.mxFuelBurnAlert)}
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {showLoadPanel && loadPath !== 'inject' ? (
        <div className="dispatch-step-card" aria-live="polite">
          <strong>
            {loadPath === 'efb'
              ? 'Import OFP in the aircraft EFB'
              : 'Load manually'}
          </strong>
          <p>
            {loadPath === 'efb'
              ? 'Use Import SimBrief / Load OFP on the aircraft EFB or FMC. Waiting for live preflight…'
              : 'Set fuel and payload in Mass & Balance / EFB. Waiting for live preflight…'}
          </p>
          {props.mxFuelBurnAlert ? (
            <p className="banner warn mx-fuel-burn-alert" role="status">
              {mxFuelBurnAlertText(props.mxFuelBurnAlert)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showLoadPanel &&
      loadPath === 'inject' &&
      !mission.lastPreflightCheck ? (
        <div className="dispatch-step-card" aria-live="polite">
          <strong>Waiting for Preflight</strong>
          <p>
            {props.preflightBootstrapError
              ? props.preflightBootstrapError
              : !props.simBridge?.connected
                ? 'SimBridge is offline — start the bridge, then stay in the Bandeirante cockpit at the origin.'
                : props.simBridge.onGround === false
                  ? 'MSFS reports airborne — Preflight only runs on the ground.'
                  : props.simBridge.aircraftTitle
                    ? `Reading “${props.simBridge.aircraftTitle}”… the Preflight card opens when the first sample lands (engines can be off).`
                    : 'SimBridge is up, but no aircraft title yet — load the Bandeirante at the gate (cold & dark is fine; main menu / world map is not).'}
          </p>
          {props.mxFuelBurnAlert ? (
            <p className="banner warn mx-fuel-burn-alert" role="status">
              {mxFuelBurnAlertText(props.mxFuelBurnAlert)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showPreflight && mission.lastPreflightCheck
        ? (() => {
            const check = mission.lastPreflightCheck;
            const baseVerification = check.loadVerification;
            // Prefer Watch live breakdown when present. Zero liveLb is real
            // (user emptied load) — only keep mission totals when Watch omits liveLb.
            const verification =
              baseVerification &&
              props.watch?.running &&
              props.watch.missionId === mission.id &&
              props.watch.loadVerification
                ? (() => {
                    const watchFuel = props.watch.loadVerification!.fuel;
                    const watchPayload = props.watch.loadVerification!.payload;
                    const { tanks: _watchTanks, ...watchFuelRest } = watchFuel;
                    const { tanks: _baseTanks, ...baseFuelRest } =
                      baseVerification.fuel;
                    const {
                      liveLb: _watchPayloadLive,
                      stations: _watchStations,
                      stationMax: _watchStationMax,
                      ok: _watchPayloadOk,
                      ...watchPayloadRest
                    } = watchPayload;
                    const tanks = pickFuelTankBreakdown(
                      watchFuel.tanks,
                      stickyFuelRef.current.tanks ??
                        baseVerification.fuel.tanks,
                      watchFuel.liveLb,
                    );
                    const liveFuelLb =
                      pickStableLiveFuelLb({
                        next: watchFuel.liveLb,
                        prev:
                          stickyFuelRef.current.liveLb ??
                          baseVerification.fuel.liveLb,
                        plannedLb: baseVerification.fuel.plannedLb,
                        nextTanks: tanks ?? watchFuel.tanks,
                        prevTanks:
                          stickyFuelRef.current.tanks ??
                          baseVerification.fuel.tanks,
                      }) ?? watchFuel.liveLb;
                    const livePayloadLb = pickLivePayloadLb(
                      watchPayload.liveLb,
                      baseVerification.payload.liveLb,
                    );
                    if (typeof liveFuelLb === 'number') {
                      stickyFuelRef.current.liveLb = liveFuelLb;
                    }
                    if (tanks) stickyFuelRef.current.tanks = tanks;
                    const tankCapacity =
                      watchFuel.tankCapacity ??
                      baseVerification.fuel.tankCapacity;
                    const stationMax =
                      watchPayload.stationMax ??
                      baseVerification.payload.stationMax;
                    // Recompute ok from live numbers so a stale ready flag cannot stick.
                    // Fuel undershoot (taxi burn) is allowed; overshoot stays tight.
                    const fuelTol = 50;
                    const payloadTol = 75;
                    const fuelOk =
                      baseVerification.fuel.plannedLb === undefined ||
                      matchFuelOk(
                        liveFuelLb,
                        baseVerification.fuel.plannedLb,
                        fuelTol,
                      );
                    const payloadOk =
                      baseVerification.payload.plannedLb === undefined
                        ? true
                        : livePayloadLb !== undefined &&
                          Math.abs(
                            livePayloadLb - baseVerification.payload.plannedLb,
                          ) <= payloadTol;
                    return {
                      ...baseVerification,
                      ready: fuelOk && payloadOk,
                      fuel: {
                        ...baseFuelRest,
                        ...watchFuelRest,
                        liveLb: liveFuelLb,
                        ok: fuelOk,
                        ...(tanks ? { tanks } : {}),
                        ...(tankCapacity ? { tankCapacity } : {}),
                      },
                      payload: {
                        ...baseVerification.payload,
                        ...watchPayloadRest,
                        liveLb: livePayloadLb,
                        ok: payloadOk,
                        ...(watchPayload.stations ||
                        baseVerification.payload.stations
                          ? {
                              stations:
                                watchPayload.stations ??
                                baseVerification.payload.stations,
                            }
                          : {}),
                        ...(stationMax ? { stationMax } : {}),
                      },
                    };
                  })()
                : baseVerification;
            // While Skyline inject owns the pipe, progress poll carries live L/R/C + stations.
            const injectProgress = props.loadOfpProgress;
            const verificationWithInject =
              verification &&
              props.loadOfpAutoStatus === 'loading' &&
              injectProgress &&
              (injectProgress.liveTanks ||
                injectProgress.liveStations ||
                injectProgress.liveFuelLb !== undefined ||
                injectProgress.livePayloadLb !== undefined)
                ? (() => {
                    const rawInjectFuel =
                      injectProgress.liveFuelLb ?? verification.fuel.liveLb;
                    const { tanks: _vTanks, ...fuelWithoutTanks } =
                      verification.fuel;
                    const injectTanks = pickFuelTankBreakdown(
                      injectProgress.liveTanks,
                      stickyFuelRef.current.tanks ?? verification.fuel.tanks,
                      rawInjectFuel,
                    );
                    const injectFuelLb =
                      pickStableLiveFuelLb({
                        next: rawInjectFuel,
                        prev:
                          stickyFuelRef.current.liveLb ??
                          verification.fuel.liveLb,
                        plannedLb: verification.fuel.plannedLb,
                        nextTanks: injectTanks ?? injectProgress.liveTanks,
                        prevTanks:
                          stickyFuelRef.current.tanks ??
                          verification.fuel.tanks,
                      }) ?? rawInjectFuel;
                    if (typeof injectFuelLb === 'number') {
                      stickyFuelRef.current.liveLb = injectFuelLb;
                    }
                    if (injectTanks) stickyFuelRef.current.tanks = injectTanks;
                    return {
                      ...verification,
                      fuel: {
                        ...fuelWithoutTanks,
                        liveLb: injectFuelLb,
                        ...(injectTanks ? { tanks: injectTanks } : {}),
                        ...(injectProgress.tankCapacity
                          ? { tankCapacity: injectProgress.tankCapacity }
                          : {}),
                      },
                      payload: {
                        ...verification.payload,
                        ...(injectProgress.livePayloadLb !== undefined
                          ? { liveLb: injectProgress.livePayloadLb }
                          : {}),
                        ...(injectProgress.liveStations
                          ? { stations: injectProgress.liveStations }
                          : {}),
                        ...(injectProgress.stationMax
                          ? { stationMax: injectProgress.stationMax }
                          : {}),
                      },
                    };
                  })()
                : verification;
            const rawView = verificationWithInject;
            // One last gate before paint: tip hold + Sim total must match tank row.
            const stabilizedFuel = rawView
              ? stabilizeDisplayedFuel({
                  liveLb: rawView.fuel.liveLb,
                  plannedLb: rawView.fuel.plannedLb,
                  tanks: rawView.fuel.tanks,
                  tankCapacity: rawView.fuel.tankCapacity,
                  stickyLiveLb: stickyFuelRef.current.liveLb,
                  stickyTanks: stickyFuelRef.current.tanks,
                })
              : undefined;
            if (stabilizedFuel?.tanks) {
              stickyFuelRef.current.tanks = stabilizedFuel.tanks;
            }
            if (
              typeof stabilizedFuel?.liveLb === 'number' &&
              Number.isFinite(stabilizedFuel.liveLb)
            ) {
              stickyFuelRef.current.liveLb = stabilizedFuel.liveLb;
            }
            // Paint + ok gates always use the stabilized view (not raw watch/inject).
            const view =
              rawView && stabilizedFuel
                ? {
                    ...rawView,
                    fuel: {
                      ...rawView.fuel,
                      liveLb: stabilizedFuel.liveLb ?? rawView.fuel.liveLb,
                      ...(stabilizedFuel.tanks
                        ? { tanks: stabilizedFuel.tanks }
                        : {}),
                    },
                  }
                : rawView;
            // Never trust a stale ready/ok flag when Sim vs Due numbers disagree.
            const fuelNumbersOk =
              !view ||
              view.fuel.plannedLb === undefined ||
              matchFuelOk(view.fuel.liveLb ?? 0, view.fuel.plannedLb, 50);
            const payloadNumbersOk =
              !view ||
              view.payload.plannedLb === undefined ||
              view.payload.liveLb === undefined ||
              Math.abs(view.payload.liveLb - view.payload.plannedLb) <= 75;
            // After wheels-up, fuel/payload no longer gate departure — but the
            // tiles must still show honest Sim vs Due (not fake green ✓).
            const enRoute = step === 'en_route';
            const fuelOk = fuelNumbersOk;
            const payloadOk =
              Boolean(view?.payload.ok) && payloadNumbersOk;
            const ready =
              view != null ? fuelOk && payloadOk : check.verdict !== 'fail';
            const watchOnGround = props.watch?.onGround === true;
            const watchEngines = props.watch?.enginesRunning === true;
            const enRouteHeadline = watchOnGround
              ? watchEngines
                ? 'LANDED · AWAITING SHUTDOWN'
                : 'LANDED · READY TO SETTLE'
              : 'EN ROUTE · LIVE LOAD';
            const enRouteSub = watchOnGround
              ? watchEngines
                ? 'Shut down engines in MSFS — Watch settles after engines off at the destination.'
                : 'Engines off — Watch will settle when destination proximity and airborne time gates pass.'
              : 'Live load only — fuel burn below OFP departure is normal. Settle after landing + engines off.';
            const loadTileClass = (ok: boolean) =>
              enRoute
                ? ok
                  ? 'preflight-load-ok'
                  : 'preflight-load-live'
                : ok
                  ? 'preflight-load-ok'
                  : 'preflight-load-fail';
            const loadTileMark = (ok: boolean) =>
              enRoute ? (ok ? '✓' : '·') : ok ? '✓' : '✗';
            const noteLabel =
              view?.weightNoteCount &&
              view.weightNoteCount === check.findings.length
                ? `${view.weightNoteCount} weight ${
                    view.weightNoteCount === 1 ? 'note' : 'notes'
                  }`
                : `${check.findings.length} technical ${
                    check.findings.length === 1 ? 'detail' : 'details'
                  }`;
            const massFromLb = (lb: number | undefined) =>
              lb === undefined
                ? 'Not available'
                : formatMassExact(lb / KG_TO_LB, weightSystem);

            return (
              <section
                className={`ofp-result-card preflight-summary-card ofp-result-${
                  enRoute ? 'pass' : ready ? 'pass' : 'fail'
                }`}
                aria-live="polite"
              >
                <div className="ofp-result-head">
                  <div>
                    <strong>
                      {enRoute
                        ? enRouteHeadline
                        : ready
                          ? 'PREFLIGHT READY'
                          : 'PREFLIGHT FAILED'}
                    </strong>
                    <small>
                      {enRoute
                        ? enRouteSub
                        : ready
                          ? 'Fuel and cargo match the confirmed OFP.'
                          : 'Fix the mismatched aircraft load before departure.'}
                    </small>
                  </div>
                  <div className="preflight-head-actions">
                    {loadPath === 'inject' && !enRoute ? (
                      <div className="skyline-inject-row">
                        {(() => {
                          const injectStatus =
                            props.loadOfpAutoStatus === 'failed'
                              ? (props.loadOfpAutoError ??
                                'Inject failed — turn on to retry, or continue manually below.')
                              : props.loadOfpAutoStatus === 'loading'
                                ? (props.loadOfpProgress?.message ??
                                  'Writing fuel + payload and balancing CG. Turn off to stop.')
                                : props.watch?.running &&
                                    props.watch.missionId === mission.id &&
                                    !props.simBridge?.connected
                                  ? (props.watch.lastError ??
                                    'Watch reconnecting to SimBridge…')
                                  : !props.simBridge?.connected
                                    ? 'Start SimBridge, then turn inject on.'
                                    : null;
                          return injectStatus ? (
                            <p
                              className={`skyline-inject-status${
                                props.loadOfpAutoStatus === 'failed'
                                  ? ' skyline-inject-status-fail'
                                  : props.loadOfpAutoStatus === 'loading'
                                    ? ' skyline-inject-status-busy'
                                    : ''
                              }`}
                              aria-live="polite"
                            >
                              {injectStatus}
                            </p>
                          ) : null;
                        })()}
                        <button
                          type="button"
                          role="switch"
                          className={`skyline-inject-switch${
                            props.skylineInjectEnabled
                              ? ' skyline-inject-switch-on'
                              : ''
                          }${
                            props.loadOfpAutoStatus === 'loading'
                              ? ' skyline-inject-switch-busy'
                              : ''
                          }`}
                          aria-checked={props.skylineInjectEnabled}
                          disabled={
                            props.loadOfpAutoStatus === 'loading'
                              ? false
                              : busy || !props.simBridge?.connected
                          }
                          title={
                            props.skylineInjectEnabled
                              ? props.loadOfpAutoStatus === 'loading'
                                ? 'Turn off to cancel fuel/payload inject'
                                : 'Skyline inject is on — turn off to leave load as-is'
                              : 'Turn on to write OFP fuel and payload into the sim'
                          }
                          onClick={() =>
                            props.onToggleSkylineInject(
                              !props.skylineInjectEnabled,
                            )
                          }
                        >
                          <span
                            className="skyline-inject-switch-track"
                            aria-hidden="true"
                          >
                            <span className="skyline-inject-switch-knob" />
                          </span>
                          <span className="skyline-inject-switch-label">
                            <strong>Skyline inject</strong>
                            <small>
                              {props.loadOfpAutoStatus === 'loading'
                                ? 'Writing…'
                                : props.loadOfpAutoStatus === 'failed'
                                  ? 'Failed · off'
                                  : props.skylineInjectEnabled
                                    ? 'On'
                                    : 'Off'}
                            </small>
                          </span>
                        </button>
                      </div>
                    ) : null}
                    <span>
                      Checked{' '}
                      {new Date(check.checkedAtIso).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                {props.mxFuelBurnAlert ||
                check.findings.some((f) => f.code === 'MX_FUEL_BURN') ? (
                  <p className="banner warn mx-fuel-burn-alert" role="status">
                    {props.mxFuelBurnAlert
                      ? mxFuelBurnAlertText(props.mxFuelBurnAlert)
                      : (check.findings.find((f) => f.code === 'MX_FUEL_BURN')
                          ?.message ?? '')}
                  </p>
                ) : null}
                {view ? (
                  <div className="preflight-load-grid">
                    <div className={loadTileClass(fuelOk)}>
                      <span>Fuel</span>
                      <strong>
                        Sim {massFromLb(view.fuel.liveLb)}
                      </strong>
                      <small>
                        {enRoute ? 'OFP dep' : 'Due'}{' '}
                        {massFromLb(view.fuel.plannedLb)}
                      </small>
                      <b>{loadTileMark(fuelOk)}</b>
                      <FuelTankSchematic
                        tanks={view.fuel.tanks}
                        tankCapacity={view.fuel.tankCapacity}
                        weightSystem={weightSystem}
                      />
                    </div>
                    <div className={loadTileClass(payloadOk)}>
                      <span>Payload (stations)</span>
                      <strong>
                        Sim {massFromLb(view.payload.liveLb)}
                      </strong>
                      <small>
                        {formatPayloadDueLine(
                          view.payload,
                          massFromLb,
                        )}
                      </small>
                      <b>{loadTileMark(payloadOk)}</b>
                      <PayloadStationSchematic
                        stations={view.payload.stations}
                        stationMax={view.payload.stationMax}
                        weightSystem={weightSystem}
                      />
                    </div>
                    {view.cg ? (
                      <div
                        className={
                          view.cg.ok
                            ? 'preflight-load-ok'
                            : 'preflight-load-warn'
                        }
                      >
                        <span>CG</span>
                        <strong>
                          {view.cg.liveMac !== undefined
                            ? `${formatMacPct(view.cg.liveMac)}% MAC`
                            : 'n/a'}
                        </strong>
                        <small>
                          {view.cg.minMac !== undefined &&
                          view.cg.maxMac !== undefined
                            ? `envelope ${formatMacPct(view.cg.minMac)}–${formatMacPct(view.cg.maxMac)}`
                            : 'advisory only'}
                        </small>
                        <b>
                          {view.cg.severity === 'warn' ? '⚠' : 'ℹ'}
                        </b>
                        {view.cg.minMac !== undefined &&
                        view.cg.maxMac !== undefined ? (
                          <CgEnvelopeSchematic
                            liveMac={view.cg.liveMac}
                            minMac={view.cg.minMac}
                            maxMac={view.cg.maxMac}
                            ok={view.cg.ok}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {(() => {
                      const liveOnGround =
                        props.watch?.running &&
                        props.watch.missionId === mission.id &&
                        props.watch.onGround != null
                          ? props.watch.onGround
                          : view.aircraft.onGround;
                      const liveEngines =
                        props.watch?.running &&
                        props.watch.missionId === mission.id &&
                        props.watch.enginesRunning != null
                          ? props.watch.enginesRunning
                          : view.aircraft.enginesRunning;
                      return (
                        <div className="preflight-aircraft-state">
                          <span>Aircraft</span>
                          <strong>
                            {liveOnGround ? 'On ground' : 'Airborne'}
                          </strong>
                          <small>
                            {liveEngines ? 'Engines running' : 'Engines off'}
                          </small>
                          <b>
                            {enRoute
                              ? liveOnGround
                                ? liveEngines
                                  ? 'TAXI'
                                  : 'LANDED'
                                : 'AIR'
                              : liveOnGround && !liveEngines
                                ? 'READY'
                                : 'CHECK'}
                          </b>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p>Waiting for live Loaded vs Due data…</p>
                )}
                {check.findings.length > 0 ? (
                  <details className="preflight-technical">
                    <summary>{noteLabel}</summary>
                    <ul className="ofp-findings">
                      {check.findings.map((finding) => (
                        <li
                          key={`pre-${finding.code}-${finding.message}`}
                          className={`finding-${finding.severity}`}
                        >
                          [{finding.severity.toUpperCase()}]{' '}
                          {formatWeightText(finding.message, weightSystem)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            );
          })()
        : null}

      {showPreflight ? (
        <DispatchRouteCard
          originIcao={mission.originIcao}
          destIcao={mission.destIcao}
          waypoints={mission.lastOfpCheck?.briefing?.waypoints}
          aircraft={stickyAircraft}
          busy={busy}
          canRefreshNavlog={Boolean(simbriefUser.trim())}
          onOpenAirport={props.onOpenAirport}
          onRefreshNavlog={() => props.onRefreshOfpBriefing(mission)}
        />
      ) : null}

      {primaryCta ? (
        <div className="dispatch-primary-actions">{primaryCta}</div>
      ) : null}

      {/* Player helpers stay visible; cheats live under Advanced + Dev mode. */}
      {loadPath === 'inject' && step === 'load' ? (
        <div className="dispatch-advanced-actions">
          <button
            type="button"
            className="action ghost"
            disabled={busy}
            onClick={props.onContinueManually}
          >
            Continue manually
          </button>
        </div>
      ) : null}
      {['accepted', 'dispatched'].includes(mission.status) &&
      props.onCrewDispatch &&
      (props.idleCrew?.length ?? 0) > 0 &&
      !mission.crewOperated ? (
        <div className="dispatch-advanced-actions">
          <CrewFlyControls
            idleCrew={props.idleCrew ?? []}
            busy={busy}
            buttonLabel="Send with crew"
            value={mission.crewMemberId}
            onSelect={(crewMemberId) =>
              props.onCrewAssign?.(mission, crewMemberId)
            }
            onFly={(crewMemberId) =>
              props.onCrewDispatch?.(mission, crewMemberId)
            }
          />
        </div>
      ) : null}
      {mission.crewOperated && mission.status === 'in_flight' ? (
        <span className="settings-chip">
          Crew airborne
          {typeof mission.airborneAtMs === 'number' &&
          typeof mission.expectedRouteMs === 'number'
            ? ` · ETA ${new Date(mission.airborneAtMs + mission.expectedRouteMs).toLocaleTimeString()}`
            : ''}
        </span>
      ) : null}

      {devMode ? (
        <details className="dispatch-advanced">
          <summary>Advanced</summary>
          <div className="dispatch-advanced-actions">
            {mission.status === 'dispatched' || mission.status === 'accepted' ? (
              <button
                type="button"
                className="action ghost"
                disabled={busy || !simbriefUser.trim()}
                onClick={() => props.onDispatch(mission)}
              >
                Re-open SimBrief
              </button>
            ) : null}
            {['accepted', 'dispatched'].includes(mission.status) ? (
              <button
                type="button"
                className="action ghost"
                disabled={busy}
                title="Mark cargo airborne without MSFS"
                onClick={() => props.onDepart(mission)}
              >
                Depart without MSFS
              </button>
            ) : null}
            {['accepted', 'dispatched', 'in_flight'].includes(mission.status) ? (
              <button
                type="button"
                className="action ghost"
                disabled={busy}
                title="Deliver cargo and credit wallet without MSFS"
                onClick={() => props.onSettle(mission)}
              >
                Settle without MSFS
              </button>
            ) : null}
            {!simbriefUser.trim() ? (
              <button
                type="button"
                className="action ghost"
                disabled={busy}
                onClick={props.onSelectSettings}
              >
                Set SimBrief user
              </button>
            ) : (
              <span className="settings-chip">
                SimBrief · {simbriefUser.trim()}
              </span>
            )}
          </div>
        </details>
      ) : null}
    </>
  );
}
