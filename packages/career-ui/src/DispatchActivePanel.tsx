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
import { logbookAircraftLabel, logbookFlightKind } from './logbook';

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
    minMac?: number;
    maxMac?: number;
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
  // The panel is not remounted between missions, so the sticky fuel of the
  // previous flight would seed the next one's first frames.
  const stickyFuelMissionRef = useRef<string | null>(null);
  if (stickyFuelMissionRef.current !== mission.id) {
    stickyFuelMissionRef.current = mission.id;
    stickyFuelRef.current = {};
  }
  const stickyInjectStatusRef = useRef(props.loadOfpAutoStatus);
  if (
    stickyInjectStatusRef.current !== 'loading' &&
    props.loadOfpAutoStatus === 'loading'
  ) {
    stickyFuelRef.current = {};
  }
  if (
    stickyInjectStatusRef.current === 'loading' &&
    props.loadOfpAutoStatus !== 'loading'
  ) {
    stickyFuelRef.current = {};
  }
  stickyInjectStatusRef.current = props.loadOfpAutoStatus;
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
  const flightKind = logbookFlightKind(mission);
  const assignedAircraft = logbookAircraftLabel(mission);
  const liveAircraftTitle = props.simBridge?.aircraftTitle?.trim() || null;
  const airframeMismatch = Boolean(
    props.preflightBootstrapError &&
      /purchased airframe|does not match/i.test(props.preflightBootstrapError),
  );
  const isFerryLeg = flightKind === 'Ferry';
  const isEnRoute = step === 'en_route';
  const showOfpCard = Boolean(mission.lastOfpCheck);
  /** Collapse passed OFP after flight_plan so load/ready/en_route stay short. */
  const collapseOfpCard =
    showOfpCard &&
    step !== 'flight_plan' &&
    mission.lastOfpCheck?.verdict === 'pass';
  const showFuelCard =
    step === 'fuel' ||
    (mission.fuelUplift &&
      (step === 'load' || step === 'ready' || step === 'en_route'));
  const showLoadPanel = step === 'load';
  const showPreflight =
    Boolean(mission.lastPreflightCheck) &&
    (step === 'load' || step === 'ready' || step === 'en_route');
  const showRouteMap = showPreflight;

  const ofpCargoUnderOnly =
    isOfpCargoUnderOnlyFailureUi(mission.lastOfpCheck) &&
    Boolean(props.onAcceptOfpCargo);
  const ofpAcceptCargoKg = ofpCargoUnderOnly
    ? ofpCargoKgFromUnderFinding(mission.lastOfpCheck)
    : undefined;

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
      if (ofpCargoUnderOnly) {
        return (
          <>
            <button
              type="button"
              className="accept"
              disabled={busy}
              onClick={() => props.onAcceptOfpCargo?.(mission)}
              title="Trim mission cargo and pay to match the SimBrief OFP"
            >
              Accept OFP cargo
              {ofpAcceptCargoKg
                ? ` (${formatMassExact(ofpAcceptCargoKg, weightSystem)})`
                : ''}
            </button>
            <button
              type="button"
              className="action ghost"
              disabled={busy}
              onClick={() => props.onDispatch(mission)}
              title="Open SimBrief with the current cargo"
            >
              {mission.status === 'accepted' ? 'Open SimBrief' : 'Re-open SimBrief'}
            </button>
          </>
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
    <div
      className={
        isEnRoute ? 'dispatch-active dispatch-active-enroute' : 'dispatch-active'
      }
    >
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
            {assignedAircraft}
            {assignedAircraft !== props.aircraftClassLabel(mission.aircraftClassId)
              ? ` · ${props.aircraftClassLabel(mission.aircraftClassId)}`
              : null}
            {' · '}
            <span className="logbook-kind">{flightKind}</span>
            {' · '}
            <span className={`status status-${mission.status}`}>
              {mission.status.replace(/_/g, ' ')}
            </span>
            {mission.operatorNpcName ? (
              <>
                {' · '}
                {mission.operatorNpcName}
              </>
            ) : null}
          </p>
        </div>
        <div className="missions-head-actions">
          {['accepted', 'dispatched', 'in_flight'].includes(mission.status) ? (
            <button
              type="button"
              className="action ghost danger missions-head-cancel"
              disabled={busy}
              title={
                isFerryLeg
                  ? 'Abort this ferry — no payout'
                  : 'Abort this flight — no payout; cargo returns to the market'
              }
              onClick={() => props.onCancel(mission)}
            >
              Cancel flight
            </button>
          ) : null}
        </div>
      </div>

      {!isEnRoute ? (
        <div className="cargo-capacity staging-capacity staging-ops-capacity">
          {isFerryLeg ? (
            <span>
              Load
              <strong>Empty</strong>
              <em>ferry / reposition</em>
            </span>
          ) : (
            <span>
              Cargo
              <strong>{props.formatTonnes(mission.cargoKg)}</strong>
              <em>
                {(mission.lots?.length ?? 1) > 1
                  ? `${mission.lots!.length} lots`
                  : '1 lot'}
              </em>
            </span>
          )}
          <span>
            {isFerryLeg
              ? mission.contractPilot
                ? 'Pilot fee'
                : 'Payout'
              : 'Contract'}
            <strong>{props.formatMoney(mission.payUsd)}</strong>
          </span>
          <span>
            Deadline
            <strong>
              {props.formatDeadline(mission.deadlineTick, continuousHours)}
            </strong>
          </span>
          {!isFerryLeg ? (
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
          ) : null}
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
      ) : null}

      {!isEnRoute &&
      !isFerryLeg &&
      ((mission.lots?.length ?? 0) > 0 ||
        ['accepted', 'dispatched'].includes(mission.status)) ? (
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
      ) : !isEnRoute && isFerryLeg ? (
        <div className="staging-section">
          <div className="staging-section-head">
            <h3>Ferry</h3>
          </div>
          <p className="empty">
            {mission.reason?.trim() ||
              (mission.contractPilot
                ? 'Empty reposition for the operator — no freight on board.'
                : 'Empty reposition — no freight on board.')}
          </p>
        </div>
      ) : null}

      {(step === 'flight_plan' || showOfpCard) && showOfpCard && !isEnRoute
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
              assignedAircraft ? ['Hangar', assignedAircraft] : null,
              briefing?.aircraftIcao ? ['OFP type', briefing.aircraftIcao] : null,
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

            const foldOfp = collapseOfpCard;
            const ofpCard = (
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
                {check.verdict === 'fail' &&
                isOfpCargoUnderOnlyFailureUi(check) &&
                props.onAcceptOfpCargo ? (
                  <div className="ofp-accept-cargo">
                    <p>
                      SimBrief limited payload for this leg — leftover returns to
                      the board and{' '}
                      {mission.contractPilot ? 'pilot fee' : 'pay'} is reduced.
                    </p>
                  </div>
                ) : null}
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
                  <details className="preflight-technical" open={ofpCargoUnderOnly}>
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
                {ofpCargoUnderOnly && primaryCta ? (
                  <div className="dispatch-primary-actions ofp-accept-actions">
                    {primaryCta}
                  </div>
                ) : null}
              </section>
            );

            if (!foldOfp) return ofpCard;

            const foldLabel =
              check.verdict === 'pass'
                ? 'OFP passed'
                : check.verdict === 'warn'
                  ? 'OFP needs review'
                  : 'OFP failed';
            const foldMeta = [
              briefing?.distanceNm !== undefined
                ? `${Math.round(briefing.distanceNm)} NM`
                : null,
              cruise ?? null,
              briefing?.blockTime ?? null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <details className="dispatch-fold dispatch-fold-ofp">
                <summary>
                  {foldLabel}
                  {foldMeta ? ` · ${foldMeta}` : ''}
                </summary>
                {ofpCard}
              </details>
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
              ? `Use Import SimBrief / Load OFP on the ${assignedAircraft} EFB or FMC. Waiting for live preflight…`
              : `Set fuel and payload on the ${assignedAircraft} in Mass & Balance / EFB. Waiting for live preflight…`}
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
        <div
          className={`dispatch-step-card${airframeMismatch ? ' dispatch-step-card-fail' : ''}`}
          aria-live="polite"
        >
          <strong>Waiting for Preflight</strong>
          <dl className="dispatch-aircraft-pair">
            <div>
              <dt>Selected</dt>
              <dd>{assignedAircraft}</dd>
            </div>
            {liveAircraftTitle ? (
              <div>
                <dt>In simulator</dt>
                <dd>{liveAircraftTitle}</dd>
              </div>
            ) : null}
          </dl>
          <p>
            {props.preflightBootstrapError
              ? props.preflightBootstrapError
              : !props.simBridge?.connected
                ? `SimBridge is offline — start the bridge, then load the ${assignedAircraft} at the origin.`
                : props.simBridge.onGround === false
                  ? 'MSFS reports airborne — Preflight only runs on the ground.'
                  : liveAircraftTitle
                    ? `Reading “${liveAircraftTitle}”… the Preflight card opens when the first sample lands (engines can be off).`
                    : `SimBridge is up, but no aircraft title yet — load the ${assignedAircraft} at the gate (cold & dark is fine; main menu / world map is not).`}
          </p>
          {props.mxFuelBurnAlert ? (
            <p className="banner warn mx-fuel-burn-alert" role="status">
              {mxFuelBurnAlertText(props.mxFuelBurnAlert)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showRouteMap && isEnRoute ? (
        <DispatchRouteCard
          fill
          originIcao={mission.originIcao}
          destIcao={mission.destIcao}
          waypoints={mission.lastOfpCheck?.briefing?.waypoints}
          ofpRoute={mission.lastOfpCheck?.briefing?.route}
          aircraft={stickyAircraft}
          busy={busy}
          canRefreshNavlog={Boolean(simbriefUser.trim())}
          onOpenAirport={props.onOpenAirport}
          onRefreshNavlog={() => props.onRefreshOfpBriefing(mission)}
        />
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
                    // Watch already filtered flicker on the server. Re-running
                    // pickStable against the inject sticky latched Sim=Due and
                    // hid EFB drains after the first inject.
                    const tanks =
                      watchFuel.tanks ??
                      stickyFuelRef.current.tanks ??
                      baseVerification.fuel.tanks;
                    const liveFuelLb = watchFuel.liveLb;
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
                    const watchCg =
                      props.watch.loadVerification!.cg ??
                      baseVerification.cg;
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
                      ...(watchCg ? { cg: watchCg } : {}),
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
                      cg:
                        injectProgress.liveMac !== undefined ||
                        injectProgress.minMac !== undefined ||
                        verification.cg
                          ? {
                              ...(verification.cg ?? {
                                ok: true,
                                severity: 'info' as const,
                              }),
                              liveMac:
                                injectProgress.liveMac ??
                                verification.cg?.liveMac,
                              ...(injectProgress.minMac !== undefined
                                ? { minMac: injectProgress.minMac }
                                : {}),
                              ...(injectProgress.maxMac !== undefined
                                ? { maxMac: injectProgress.maxMac }
                                : {}),
                            }
                          : verification.cg,
                    };
                  })()
                : verification;
            const rawView = verificationWithInject;
            const watchOwnsLoad =
              Boolean(props.watch?.running) &&
              props.watch?.missionId === mission.id &&
              props.loadOfpAutoStatus !== 'loading';
            // Watch is the Loaded vs Due owner after inject. The sticky
            // stabilize gate latched Sim=Due and hid EFB fuel/payload edits.
            const stabilizedFuel = rawView
              ? watchOwnsLoad
                ? {
                    liveLb: rawView.fuel.liveLb,
                    tanks: rawView.fuel.tanks,
                  }
                : stabilizeDisplayedFuel({
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
            // Same as fuel: Sim vs Due numbers only. Stale payload.ok from an
            // EFB unload before reinject kept PREFLIGHT FAILED with Sim=Due.
            const payloadOk = payloadNumbersOk;
            // While Skyline inject is writing, never show PREFLIGHT READY from
            // mid-ramp live numbers — the switch also looked "finished" early.
            const injecting = props.loadOfpAutoStatus === 'loading';
            const liveLocation =
              props.watch?.running &&
              props.watch.missionId === mission.id &&
              props.watch.originProximity
                ? props.watch.originProximity
                : check.location;
            const locationOk = liveLocation?.ok !== false;
            const loadReady =
              view != null ? fuelOk && payloadOk : check.verdict !== 'fail';
            const ready = injecting
              ? false
              : loadReady && locationOk;
            const injectSwitchOn =
              props.skylineInjectEnabled || injecting;
            const watchLive =
              Boolean(props.watch?.running) &&
              props.watch?.missionId === mission.id;
            const liveOnGroundNow =
              watchLive && props.watch?.onGround != null
                ? props.watch.onGround
                : props.simBridge?.onGround != null
                  ? props.simBridge.onGround
                  : false;
            const liveEnginesNow =
              watchLive && props.watch?.enginesRunning != null
                ? props.watch.enginesRunning
                : props.simBridge?.enginesRunning != null
                  ? props.simBridge.enginesRunning
                  : false;
            const sawAirborneNow = Boolean(props.watch?.sawAirborne);
            const enRouteHeadline = !liveOnGroundNow
              ? 'EN ROUTE · LIVE LOAD'
              : !sawAirborneNow
                ? 'ON GROUND · WAITING FOR DEPARTURE'
                : !watchLive
                  ? 'LANDED · WATCH RECONNECTING'
                  : liveEnginesNow
                    ? 'LANDED · AWAITING SHUTDOWN'
                    : 'LANDED · READY TO SETTLE';
            const enRouteSub = !liveOnGroundNow
              ? 'Live load only — fuel burn below OFP departure is normal. Settle after landing + engines off.'
              : !sawAirborneNow
                ? 'Still on the ramp — Watch ignores the MSFS menu and aircraft reloads. Take off to depart.'
                : !watchLive
                  ? 'Watch dropped mid-flight — reconnecting so shutdown at the destination can settle.'
                  : liveEnginesNow
                    ? 'Shut down engines (or set parking brake) in MSFS — Watch settles after engines off at the destination.'
                    : 'Engines off — Watch will settle when destination proximity and airborne time gates pass.';
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

            const ofpBriefing = mission.lastOfpCheck?.briefing;
            const cargoLots = mission.lots ?? [];
            const cargoCommodityLabel = (() => {
              if (isFerryLeg) return 'ferry / reposition';
              if (cargoLots.length === 0) {
                return (mission.commodityId || 'cargo').replace(/_/g, ' ');
              }
              if (cargoLots.length === 1) {
                return cargoLots[0]!.commodityId.replace(/_/g, ' ');
              }
              const names = [
                ...new Set(
                  cargoLots.map((line) =>
                    line.commodityId.replace(/_/g, ' '),
                  ),
                ),
              ];
              return names.length <= 2
                ? `${names.join(' · ')} · ${cargoLots.length} lots`
                : `${cargoLots.length} lots`;
            })();
            const enRouteBriefItems = (
              [
                assignedAircraft ? ['Aircraft', assignedAircraft] : null,
                ofpBriefing?.aircraftIcao
                  ? ['OFP type', ofpBriefing.aircraftIcao]
                  : null,
                ofpBriefing?.distanceNm !== undefined
                  ? [
                      'Distance',
                      `${Math.round(ofpBriefing.distanceNm)} NM`,
                    ]
                  : null,
                ofpBriefing?.blockTime
                  ? ['Block time', ofpBriefing.blockTime]
                  : null,
                ofpBriefing?.airTime
                  ? ['Air time', ofpBriefing.airTime]
                  : null,
                ofpBriefing?.alternateIcao
                  ? ['Alternate', ofpBriefing.alternateIcao]
                  : null,
              ] as Array<[string, string] | null>
            ).filter((item): item is [string, string] => item !== null);

            const liveLoadGrid = view ? (
              <div className="preflight-load-grid">
                <div className={loadTileClass(fuelOk)}>
                  <span>Fuel</span>
                  <strong>Sim {massFromLb(view.fuel.liveLb)}</strong>
                  <small>
                    {enRoute ? 'OFP dep' : 'Due'}{' '}
                    {massFromLb(view.fuel.plannedLb)}
                  </small>
                  <b>{loadTileMark(fuelOk)}</b>
                  <FuelTankSchematic
                    tanks={view.fuel.tanks}
                    tankCapacity={view.fuel.tankCapacity}
                    liveFuelLb={view.fuel.liveLb}
                    weightSystem={weightSystem}
                  />
                </div>
                <div className={loadTileClass(payloadOk)}>
                  <span>Payload (stations)</span>
                  <strong>Sim {massFromLb(view.payload.liveLb)}</strong>
                  <small>
                    {formatPayloadDueLine(view.payload, massFromLb)}
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
                      view.cg.ok ? 'preflight-load-ok' : 'preflight-load-warn'
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
                    <b>{view.cg.severity === 'warn' ? '⚠' : 'ℹ'}</b>
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
                  const watchSample =
                    props.watch?.running &&
                    props.watch.missionId === mission.id
                      ? props.watch
                      : null;
                  const liveOnGround =
                    watchSample?.onGround ??
                    props.simBridge?.onGround ??
                    view.aircraft.onGround;
                  const liveEngines =
                    watchSample?.enginesRunning ??
                    props.simBridge?.enginesRunning ??
                    view.aircraft.enginesRunning;
                  const loc =
                    props.watch?.running &&
                    props.watch.missionId === mission.id &&
                    props.watch.originProximity
                      ? props.watch.originProximity
                      : check.location;
                  return (
                    <div className="preflight-aircraft-stack">
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
                              ? !props.watch?.sawAirborne
                                ? 'RAMP'
                                : liveEngines
                                  ? 'TAXI'
                                  : 'LANDED'
                              : 'AIR'
                            : liveOnGround && !liveEngines
                              ? 'READY'
                              : 'CHECK'}
                        </b>
                      </div>
                      {loc ? (
                        <div
                          className={
                            loc.ok ? 'preflight-load-ok' : 'preflight-load-fail'
                          }
                          role="status"
                        >
                          <span>Origin</span>
                          <strong>
                            {loc.ok
                              ? `At ${loc.originIcao}`
                              : loc.distanceNm !== undefined
                                ? `${loc.distanceNm.toFixed(1)} nm`
                                : loc.originIcao}
                          </strong>
                          <small>
                            {enRoute && loc.ok
                              ? 'Cleared at departure'
                              : loc.ok
                                ? loc.distanceNm !== undefined
                                  ? `${loc.distanceNm.toFixed(1)} nm · ≤${loc.radiusNm} nm`
                                  : `≤${loc.radiusNm} nm`
                                : loc.distanceNm !== undefined
                                  ? `from ${loc.originIcao} · need ≤${loc.radiusNm} nm`
                                  : (check.findings.find(
                                      (f) => f.code === loc.code,
                                    )?.message ??
                                    `need ≤${loc.radiusNm} nm at ${loc.originIcao}`)}
                          </small>
                          <b>{loc.ok ? '✓' : '✕'}</b>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p>Waiting for live Loaded vs Due data…</p>
            );

            const enRouteCargo = (
              <div className="dispatch-enroute-block">
                <h3 className="dispatch-enroute-block-title">
                  {isFerryLeg ? 'Ferry' : 'Cargo'}
                </h3>
                <dl className="ofp-briefing-grid dispatch-enroute-metrics">
                  {isFerryLeg ? (
                    <div>
                      <dt>Load</dt>
                      <dd>
                        Empty
                        <small>{cargoCommodityLabel}</small>
                      </dd>
                    </div>
                  ) : (
                    <div>
                      <dt>Load</dt>
                      <dd>
                        {props.formatTonnes(mission.cargoKg)}
                        <small>{cargoCommodityLabel}</small>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      {isFerryLeg
                        ? mission.contractPilot
                          ? 'Pilot fee'
                          : 'Payout'
                        : 'Contract'}
                    </dt>
                    <dd>{props.formatMoney(mission.payUsd)}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>
                      {props.formatDeadline(
                        mission.deadlineTick,
                        continuousHours,
                      )}
                    </dd>
                  </div>
                  {!isFerryLeg ? (
                    <div>
                      <dt>Capacity left</dt>
                      <dd>
                        {props.formatTonnes(
                          Math.max(
                            0,
                            props.missionMaxCargoKg(mission) - mission.cargoKg,
                          ),
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {mission.fuelUplift &&
                  (mission.fuelUplift.costUsd > 0 ||
                    mission.fuelUplift.requestedKg > 0.5) ? (
                    <div>
                      <dt>Fuel</dt>
                      <dd>
                        {props.formatMoney(mission.fuelUplift.costUsd)}
                        <small>
                          {props.formatTonnes(mission.fuelUplift.requestedKg)}
                        </small>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {isFerryLeg ? (
                  <p className="empty dispatch-enroute-block-note">
                    {mission.reason?.trim() ||
                      'Empty reposition — no freight on board.'}
                  </p>
                ) : cargoLots.length > 1 ? (
                  <ul className="staging-existing dispatch-enroute-block-note">
                    {cargoLots.map((line) => (
                      <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                        {props.formatTonnes(line.cargoKg)}{' '}
                        {line.commodityId.replace(/_/g, ' ')} ·{' '}
                        {props.formatMoney(line.payUsd)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );

            return (
              <section
                className={`ofp-result-card preflight-summary-card ofp-result-${
                  enRoute ? 'pass' : ready ? 'pass' : 'fail'
                }`}
                aria-live="polite"
              >
                {enRoute ? (
                  enRouteBriefItems.length > 0 ? (
                    <div className="dispatch-enroute-block">
                      <h3 className="dispatch-enroute-block-title">OFP</h3>
                      <dl className="ofp-briefing-grid dispatch-enroute-metrics">
                        {enRouteBriefItems.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null
                ) : (
                  <div className="ofp-result-head">
                    <div>
                      <strong>
                        {injecting
                          ? 'INJECTING LOAD'
                          : ready
                            ? 'PREFLIGHT READY'
                            : loadReady && !locationOk
                              ? 'NOT AT ORIGIN'
                              : 'PREFLIGHT FAILED'}
                      </strong>
                      <small>
                        {injecting
                          ? (props.loadOfpProgress?.message ??
                            'Writing fuel and payload into the sim…')
                          : ready
                            ? 'Fuel and cargo match the confirmed OFP. Take off when Watch is connected.'
                            : loadReady && !locationOk
                              ? liveLocation
                                ? liveLocation.distanceNm !== undefined
                                  ? `Aircraft is ${liveLocation.distanceNm.toFixed(1)} nm from ${liveLocation.originIcao} (need ≤${liveLocation.radiusNm} nm). Relocate before takeoff — Watch will not auto-depart.`
                                  : `Not verified at ${liveLocation.originIcao}. Relocate before takeoff — Watch will not auto-depart.`
                                : 'Relocate to the mission origin before takeoff — Watch will not auto-depart.'
                            : 'Fix the mismatched aircraft load before departure.'}
                      </small>
                    </div>
                    <div className="preflight-head-actions">
                      {loadPath === 'inject' ? (
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
                              injectSwitchOn
                                ? ' skyline-inject-switch-on'
                                : ''
                            }${
                              injecting ? ' skyline-inject-switch-busy' : ''
                            }`}
                            aria-checked={injectSwitchOn}
                            disabled={
                              injecting
                                ? false
                                : busy ||
                                  !(
                                    props.simBridge?.connected ||
                                    watchLive
                                  )
                            }
                            title={
                              injectSwitchOn
                                ? injecting
                                  ? 'Turn off to cancel fuel/payload inject'
                                  : 'Skyline inject is on — turn off to leave load as-is'
                                : 'Turn on to write OFP fuel and payload into the sim'
                            }
                            onClick={() =>
                              props.onToggleSkylineInject(!injectSwitchOn)
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
                                {injecting
                                  ? 'Writing…'
                                  : props.loadOfpAutoStatus === 'failed'
                                    ? 'Failed · off'
                                    : props.loadOfpAutoStatus === 'done'
                                      ? 'Done'
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
                )}
                {props.mxFuelBurnAlert ||
                check.findings.some((f) => f.code === 'MX_FUEL_BURN') ? (
                  <p className="banner warn mx-fuel-burn-alert" role="status">
                    {props.mxFuelBurnAlert
                      ? mxFuelBurnAlertText(props.mxFuelBurnAlert)
                      : (check.findings.find((f) => f.code === 'MX_FUEL_BURN')
                          ?.message ?? '')}
                  </p>
                ) : null}
                {enRoute ? (
                  <>
                    {enRouteCargo}
                    <div className="dispatch-enroute-block dispatch-enroute-live">
                      <div className="dispatch-enroute-live-head">
                        <h3 className="dispatch-enroute-block-title">
                          {enRouteHeadline}
                        </h3>
                        <span className="dispatch-enroute-live-checked">
                          Checked{' '}
                          {new Date(check.checkedAtIso).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="dispatch-enroute-live-sub">{enRouteSub}</p>
                      {liveLoadGrid}
                    </div>
                  </>
                ) : (
                  liveLoadGrid
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

      {showRouteMap && !isEnRoute ? (
        <DispatchRouteCard
          originIcao={mission.originIcao}
          destIcao={mission.destIcao}
          waypoints={mission.lastOfpCheck?.briefing?.waypoints}
          ofpRoute={mission.lastOfpCheck?.briefing?.route}
          aircraft={stickyAircraft}
          busy={busy}
          canRefreshNavlog={Boolean(simbriefUser.trim())}
          onOpenAirport={props.onOpenAirport}
          onRefreshNavlog={() => props.onRefreshOfpBriefing(mission)}
        />
      ) : null}

      {primaryCta && !ofpCargoUnderOnly ? (
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
    </div>
  );
}
