import type { Mission } from './api';
import {
  logbookAircraftLabel,
  logbookCargoLabel,
  logbookDistanceNm,
  logbookFlightDurationLabel,
  logbookFlightKind,
  logbookFlightWhenLabel,
  logbookHasDetail,
  logbookIsVaFlight,
  logbookScorePct,
  logbookStatusLabel,
} from './logbook';

type Props = {
  mission: Mission;
  formatMoney: (n: number) => string;
  formatMass: (kg: number) => string;
  /** Money shown in the Pay column (home cut vs company gross). */
  payoutUsd: number | null;
  payoutIsCut?: boolean;
  fleetLabel?: string | null;
  /** Extra chip — e.g. VA pilot name. */
  pilotLabel?: string | null;
  selected?: boolean;
  onOpen?: (mission: Mission) => void;
  /** Active legs: jump to Dispatch. */
  onOperate?: (mission: Mission) => void;
  operateDisabled?: boolean;
};

/**
 * Pilops-style logbook row: route hero + duration / nm / pay / score columns.
 * Shared by home Logbook and Crew (VA) Logbook.
 */
export function LogbookFlightCard(props: Props) {
  const { mission: m } = props;
  const kind = logbookFlightKind(m);
  const distanceNm = logbookDistanceNm(m);
  const duration = logbookFlightDurationLabel(m);
  const when = logbookFlightWhenLabel(m);
  const scorePct = logbookScorePct(m);
  const vaFlight = logbookIsVaFlight(m);
  const canDetail = logbookHasDetail(m) && Boolean(props.onOpen);
  const isActive =
    m.status === 'in_flight' ||
    m.status === 'dispatched' ||
    m.status === 'accepted';

  const payLabel =
    props.payoutUsd != null
      ? props.payoutIsCut
        ? `${props.formatMoney(props.payoutUsd)} cut`
        : props.formatMoney(props.payoutUsd)
      : '—';

  const scoreTone =
    scorePct == null
      ? 'muted'
      : scorePct >= 90
        ? 'good'
        : scorePct < 70
          ? 'warn'
          : 'ok';

  const body = (
    <>
      <div className="logbook-card-route">
        <div className="logbook-card-od">
          <span className="logbook-card-icao">{m.originIcao}</span>
          <span className="logbook-card-arrow" aria-hidden="true">
            →
          </span>
          <span className="logbook-card-icao">{m.destIcao}</span>
        </div>
        <p className="logbook-card-aircraft">
          {logbookAircraftLabel(m, { fleetLabel: props.fleetLabel })}
          {' · '}
          {logbookCargoLabel(m, props.formatMass)}
        </p>
        <div className="logbook-card-chips">
          <span className={`status status-${m.status}`}>
            {logbookStatusLabel(m.status)}
          </span>
          <span className="logbook-kind" data-kind={kind}>
            {kind}
          </span>
          {vaFlight ? (
            <span
              className="logbook-kind logbook-va"
              title="Flown for a listed airline"
            >
              Airline
            </span>
          ) : null}
          {props.pilotLabel ? (
            <span
              className="logbook-kind logbook-pilot"
              title="Pilot who flew this leg"
            >
              {props.pilotLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="logbook-card-metrics">
        <div>
          <span className="logbook-card-metric-label">Time</span>
          <span className="logbook-card-metric-value">
            {duration ?? '—'}
          </span>
        </div>
        <div>
          <span className="logbook-card-metric-label">Dist</span>
          <span className="logbook-card-metric-value">
            {distanceNm != null
              ? `${distanceNm.toLocaleString('en-US')} nm`
              : '—'}
          </span>
        </div>
        <div>
          <span className="logbook-card-metric-label">Pay</span>
          <span className="logbook-card-metric-value logbook-card-pay">
            {payLabel}
          </span>
        </div>
        <div>
          <span className="logbook-card-metric-label">Score</span>
          <span
            className={`logbook-card-metric-value logbook-card-score is-${scoreTone}`}
          >
            {scorePct != null ? `${scorePct}%` : '—'}
          </span>
        </div>
      </div>

      <div className="logbook-card-when">
        <span className="muted">{when ?? '—'}</span>
        {isActive && props.onOperate ? (
          <button
            type="button"
            className="linkish"
            disabled={props.operateDisabled}
            onClick={(e) => {
              e.stopPropagation();
              props.onOperate?.(m);
            }}
          >
            Dispatch
          </button>
        ) : null}
      </div>
    </>
  );

  if (canDetail) {
    return (
      <li
        className={`logbook-card${props.selected ? ' is-selected' : ''}`}
      >
        <button
          type="button"
          className="logbook-card-hit"
          onClick={() => props.onOpen?.(m)}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li className={`logbook-card${props.selected ? ' is-selected' : ''}`}>
      <div className="logbook-card-hit is-static">{body}</div>
    </li>
  );
}
