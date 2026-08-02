import type { Mission, MissionFuelQuote, SimBridgeStatus, WatchStatus } from './api';
import {
  DISPATCH_STEP_LABEL,
  DISPATCH_STEP_ORDER,
  type DispatchStepId,
  type LoadPath,
} from './dispatch-flow';
import { formatMassExact, formatWeightText, KG_TO_LB, type WeightSystem } from './weight-units';

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
  statusText: string;
  loadPath: LoadPath;
  busy: boolean;
  weightSystem: WeightSystem;
  simbriefUser: string;
  continuousHours: number;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  formatDeadline: (tick: number, hours: number) => string;
  aircraftClassLabel: (id: string) => string;
  fallbackMaxCargoKg: (cls: string) => number;
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
    plannedFuelLb?: number;
    plannedPayloadLb?: number;
  } | null;
  simBridge: SimBridgeStatus | null;
  watch: WatchStatus | null;
  watchAutoStatus: 'idle' | 'waiting' | 'connecting' | 'blocked';
  watchAutoPaused: boolean;
  onOpenAirport: (icao: string) => void;
  onSelectSettings: () => void;
  onDispatch: (mission: Mission) => void;
  onCancel: (mission: Mission) => void;
  onEditManifest: (mission: Mission) => void;
  onBuyFuel: (mission: Mission) => void;
  onRetryFuelQuote: () => void;
  onLoadFuelAndPayload: (mission: Mission) => void;
  onCancelInject: () => void;
  onRetryInject: () => void;
  onContinueManually: () => void;
  onDepart: (mission: Mission) => void;
  onSettle: (mission: Mission) => void;
}) {
  const {
    mission,
    step,
    statusText,
    loadPath,
    busy,
    weightSystem,
    simbriefUser,
    continuousHours,
  } = props;

  const watchRunning = Boolean(
    props.watch?.running && props.watch.missionId === mission.id,
  );
  const showOfpCard = Boolean(mission.lastOfpCheck);
  const showFuelCard =
    step === 'fuel' ||
    (mission.fuelUplift &&
      (step === 'load' || step === 'ready' || step === 'en_route'));
  const showLoadPanel = step === 'load';
  const showPreflight =
    Boolean(mission.lastPreflightCheck) &&
    (step === 'load' || step === 'ready' || step === 'en_route');
  const showWatch =
    step === 'ready' ||
    step === 'en_route' ||
    watchRunning ||
    props.watchAutoStatus === 'waiting' ||
    props.watchAutoStatus === 'connecting';

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
    if (step === 'load' && loadPath === 'inject') {
      if (props.loadOfpAutoStatus === 'failed') {
        return (
          <button
            type="button"
            className="accept"
            disabled={busy}
            onClick={props.onRetryInject}
          >
            Retry inject
          </button>
        );
      }
      if (props.loadOfpAutoStatus === 'loading') {
        return (
          <button
            type="button"
            className="accept"
            onClick={() => props.onCancelInject()}
            title="Stop fuel inject, payload load, and CG rebalance"
          >
            Cancel
          </button>
        );
      }
      return (
        <button
          type="button"
          className="accept"
          disabled={busy || !props.simBridge?.connected}
          onClick={() => props.onLoadFuelAndPayload(mission)}
        >
          Inject fuel & payload
        </button>
      );
    }
    return null;
  })();

  return (
    <>
      <DispatchStepper current={step} />
      <p className="dispatch-step-status" role="status">
        {statusText}
      </p>

      <div className="panel-head missions-head">
        <div>
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
            {mission.id} · {props.aircraftClassLabel(mission.aircraftClassId)} ·{' '}
            <span className={`status status-${mission.status}`}>{mission.status}</span>
          </p>
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
                props.fallbackMaxCargoKg(mission.aircraftClassId) - mission.cargoKg,
              ),
            )}
          </strong>
        </span>
      </div>

      {(mission.lots?.length ?? 0) > 0 ||
      ['accepted', 'dispatched'].includes(mission.status) ? (
        <div className="staging-section">
          <div className="staging-section-head">
            <h3>Cargo</h3>
            {['accepted', 'dispatched'].includes(mission.status) ? (
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
              : 'Generate the OFP in SimBrief. Skyline confirms automatically every 15 seconds while Dispatch is open.'}
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
                  Persisted fuel is below the confirmed OFP block fuel.
                </small>
              </div>
              <span>{props.missionFuelQuote.quote.uplift.scarcity}</span>
            </div>
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
          </div>
        ) : (
          <div className="dispatch-step-card" aria-live="polite">
            <strong>Checking persisted aircraft fuel…</strong>
            <p>Comparing the career tank with OFP block fuel.</p>
          </div>
        )
      ) : null}

      {showFuelCard &&
      mission.fuelUplift &&
      step !== 'fuel' &&
      (mission.fuelUplift.costUsd > 0 || mission.fuelUplift.requestedKg > 0.5) ? (
        <p className="dispatch-fuel-paid">
          Fuel paid {props.formatMoney(mission.fuelUplift.costUsd)} ·{' '}
          {props.formatTonnes(mission.fuelUplift.requestedKg)}
          {mission.fuelUplift.scarcity !== 'ok'
            ? ` · ${mission.fuelUplift.scarcity}`
            : ''}
        </p>
      ) : null}

      {showLoadPanel ? (
        <div
          className={`dispatch-step-card ${
            props.loadOfpAutoStatus === 'failed' ? 'dispatch-step-card-fail' : ''
          }`}
          aria-live="polite"
        >
          <strong>
            {loadPath === 'inject'
              ? props.loadOfpAutoStatus === 'failed'
                ? 'Inject failed'
                : props.loadOfpAutoStatus === 'loading'
                  ? 'Loading aircraft…'
                  : 'Skyline inject'
              : loadPath === 'efb'
                ? 'Import OFP in the aircraft EFB'
                : 'Load manually'}
          </strong>
          <p>
            {loadPath === 'inject'
              ? props.loadOfpAutoStatus === 'failed'
                ? props.loadOfpAutoError ??
                  'Retry inject from the primary action, or continue manually in Advanced.'
                : props.loadOfpAutoStatus === 'loading'
                  ? props.loadOfpProgress?.message ??
                    'Fuel + equal payload, then 50 lb CG steps. Press Cancel to stop everything.'
                  : !props.simBridge?.connected
                    ? 'Start the local SimBridge host. Loading resumes automatically when connected.'
                    : 'Loaded vs Due updates live after inject. CG is advisory on Preflight.'
              : loadPath === 'efb'
                ? 'Use Import SimBrief / Load OFP on the aircraft EFB or FMC. Waiting for live preflight…'
                : 'Set fuel and payload in Mass & Balance / EFB. Waiting for live preflight…'}
          </p>
        </div>
      ) : null}

      {showPreflight && mission.lastPreflightCheck
        ? (() => {
            const check = mission.lastPreflightCheck;
            const verification = check.loadVerification;
            // Never trust a stale ready/ok flag when Sim vs Due numbers disagree.
            const fuelNumbersOk =
              !verification ||
              verification.fuel.plannedLb === undefined ||
              Math.abs(
                (verification.fuel.liveLb ?? 0) - verification.fuel.plannedLb,
              ) <= 50;
            const payloadNumbersOk =
              !verification ||
              verification.payload.plannedLb === undefined ||
              verification.payload.liveLb === undefined ||
              Math.abs(
                verification.payload.liveLb - verification.payload.plannedLb,
              ) <= 75;
            const fuelOk = Boolean(verification?.fuel.ok) && fuelNumbersOk;
            const payloadOk =
              Boolean(verification?.payload.ok) && payloadNumbersOk;
            const ready =
              verification != null
                ? fuelOk && payloadOk
                : check.verdict !== 'fail';
            const noteLabel =
              verification?.weightNoteCount &&
              verification.weightNoteCount === check.findings.length
                ? `${verification.weightNoteCount} weight ${
                    verification.weightNoteCount === 1 ? 'note' : 'notes'
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
                  ready ? 'pass' : 'fail'
                }`}
                aria-live="polite"
              >
                <div className="ofp-result-head">
                  <div>
                    <strong>
                      {ready ? 'PREFLIGHT READY' : 'PREFLIGHT FAILED'}
                    </strong>
                    <small>
                      {ready
                        ? 'Fuel and cargo match the confirmed OFP.'
                        : 'Fix the mismatched aircraft load before departure.'}
                    </small>
                  </div>
                  <span>
                    Checked {new Date(check.checkedAtIso).toLocaleTimeString()}
                  </span>
                </div>
                {verification ? (
                  <div className="preflight-load-grid">
                    <div
                      className={
                        fuelOk ? 'preflight-load-ok' : 'preflight-load-fail'
                      }
                    >
                      <span>Fuel</span>
                      <strong>Sim {massFromLb(verification.fuel.liveLb)}</strong>
                      <small>Due {massFromLb(verification.fuel.plannedLb)}</small>
                      <b>{fuelOk ? '✓' : '✗'}</b>
                    </div>
                    <div
                      className={
                        payloadOk ? 'preflight-load-ok' : 'preflight-load-fail'
                      }
                    >
                      <span>Payload (stations)</span>
                      <strong>
                        Sim {massFromLb(verification.payload.liveLb)}
                      </strong>
                      <small>
                        Due {massFromLb(verification.payload.plannedLb)}
                      </small>
                      <b>{payloadOk ? '✓' : '✗'}</b>
                    </div>
                    {verification.cg ? (
                      <div
                        className={
                          verification.cg.ok
                            ? 'preflight-load-ok'
                            : 'preflight-load-warn'
                        }
                      >
                        <span>CG</span>
                        <strong>
                          {verification.cg.liveMac !== undefined
                            ? `${verification.cg.liveMac.toFixed(1)}% MAC`
                            : 'n/a'}
                        </strong>
                        <small>
                          {verification.cg.minMac !== undefined &&
                          verification.cg.maxMac !== undefined
                            ? `envelope ${verification.cg.minMac}–${verification.cg.maxMac}`
                            : 'advisory only'}
                        </small>
                        <b>
                          {verification.cg.severity === 'warn' ? '⚠' : 'ℹ'}
                        </b>
                      </div>
                    ) : null}
                    <div className="preflight-aircraft-state">
                      <span>Aircraft</span>
                      <strong>
                        {verification.aircraft.onGround ? 'On ground' : 'Airborne'}
                      </strong>
                      <small>
                        {verification.aircraft.enginesRunning
                          ? 'Engines running'
                          : 'Engines off'}
                      </small>
                      <b>
                        {verification.aircraft.onGround &&
                        !verification.aircraft.enginesRunning
                          ? 'READY'
                          : 'CHECK'}
                      </b>
                    </div>
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

      {primaryCta ||
      ['accepted', 'dispatched', 'in_flight'].includes(mission.status) ? (
        <div className="dispatch-primary-actions">
          {primaryCta}
          {['accepted', 'dispatched', 'in_flight'].includes(mission.status) ? (
            <button
              type="button"
              className="action ghost danger"
              disabled={busy}
              title="Abort this flight — no payout; cargo returns to the market"
              onClick={() => props.onCancel(mission)}
            >
              Cancel flight
            </button>
          ) : null}
        </div>
      ) : null}

      {showWatch
        ? (() => {
            const bridgeConnected = Boolean(
              watchRunning || props.simBridge?.connected,
            );
            const bridgeOnGround =
              watchRunning &&
              props.watch?.onGround !== null &&
              props.watch?.onGround !== undefined
                ? props.watch.onGround
                : props.simBridge?.onGround ?? null;
            const bridgeEngines =
              watchRunning &&
              props.watch?.enginesRunning !== null &&
              props.watch?.enginesRunning !== undefined
                ? props.watch.enginesRunning
                : props.simBridge?.enginesRunning ?? null;
            const bridgePhase =
              (watchRunning ? props.watch?.phase : null) ??
              props.simBridge?.phase ??
              null;
            const bridgeGs =
              watchRunning &&
              props.watch?.groundSpeedKt !== null &&
              props.watch?.groundSpeedKt !== undefined
                ? props.watch.groundSpeedKt
                : props.simBridge?.groundSpeedKt ?? null;
            const stageDetail =
              bridgePhase === 'taxi' ||
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
            // Prefer a stable connected label — don't flash CONNECTING… over an
            // already-live SimBridge/Watch link (retry loops looked like flicker).
            const statusLabel = watchRunning
              ? 'MSFS CONNECTED'
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
                  watchRunning || bridgeConnected
                    ? 'watch-connected'
                    : 'watch-waiting'
                }`}
              >
                <div className="watch-footer-primary">
                  <span
                    className={`watch-dot ${
                      !bridgeConnected &&
                      props.watchAutoStatus === 'connecting'
                        ? 'checking'
                        : watchRunning || bridgeConnected
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
                    <b>{mission.status}</b>
                  </div>
                </div>
                <div className="watch-footer-secondary">
                  <span>
                    {bridgePhase ??
                      props.watch?.phase ??
                      props.simBridge?.phase ??
                      'idle'}
                  </span>
                  {props.watch?.flightTime ? (
                    <span
                      className={
                        props.watch.flightTime.met
                          ? 'watch-flight-time ok'
                          : 'watch-flight-time pending'
                      }
                      title="Minimum airborne time is 70% of the planned OFP/route block (wall clock)"
                    >
                      Airborne{' '}
                      {Math.round(props.watch.flightTime.elapsedMs / 60_000)}m /{' '}
                      {Math.round(props.watch.flightTime.expectedRouteMs / 60_000)}m
                      air planned ·{' '}
                      {Math.round(props.watch.flightTime.ratio * 100)}%
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
                  {props.watch?.cruiseSample &&
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
                      {props.watch.cruiseSample.fuelFlowKgPerHour != null
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
                  ) : null}
                  {props.watch?.lastError ? (
                    <span className="watch-footer-error">
                      {props.watch.lastError}
                    </span>
                  ) : props.simBridge?.error && !bridgeConnected ? (
                    <span className="watch-footer-error">
                      {props.simBridge.error}
                    </span>
                  ) : null}
                </div>
              </footer>
            );
          })()
        : null}

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
          {loadPath === 'inject' && step === 'load' ? (
            <button
              type="button"
              className="action ghost"
              disabled={busy}
              onClick={props.onContinueManually}
            >
              Continue manually
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
            <span className="settings-chip">SimBrief · {simbriefUser.trim()}</span>
          )}
        </div>
      </details>
    </>
  );
}
