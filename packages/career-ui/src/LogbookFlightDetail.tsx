import type { Mission } from './api';
import { boardMoneyLabel } from './board-money';
import {
  buildDebriefPillars,
  buildLogbookDebriefFromMission,
  formatLandingFpm,
  formatRunwayTouchdownDebriefLine,
  type FlightDebrief,
} from './dispatch-flow';
import {
  logbookAircraftLabel,
  logbookCargoLabel,
  logbookDistanceNm,
  logbookFlightKind,
  logbookFlightWhenLabel,
  logbookStatusLabel,
} from './logbook';
import { RunwayTouchdownDiagram } from './RunwayTouchdownDiagram';

type Props = {
  mission: Mission;
  formatMoney: (n: number) => string;
  formatMass: (kg: number) => string;
  /** Home logbook shows pilot cut; VA company shows route gross. */
  payoutMode: 'pilot' | 'company';
  fleetLabel?: string | null;
  pilotLabel?: string | null;
  onBack: () => void;
};

function scoreToneClass(pct: number): string | undefined {
  if (pct >= 90) return 'debrief-ok';
  if (pct < 70) return 'debrief-late';
  return undefined;
}

/**
 * Archived flight debrief for Logbook (home + Crew).
 * Reuses Dispatch debrief pillars / runway / score — no live Watch.
 */
export function LogbookFlightDetail(props: Props) {
  const { mission: m } = props;
  const debrief: FlightDebrief = buildLogbookDebriefFromMission(m);
  const distanceNm = logbookDistanceNm(m);
  const when = logbookFlightWhenLabel(m);
  const kind = logbookFlightKind(m);
  const displayPayout =
    props.payoutMode === 'pilot' &&
    typeof m.pilotPayoutUsd === 'number' &&
    Number.isFinite(m.pilotPayoutUsd)
      ? m.pilotPayoutUsd
      : debrief.payoutUsd;
  const netForMode =
    props.payoutMode === 'pilot' &&
    typeof m.pilotPayoutUsd === 'number' &&
    Number.isFinite(m.pilotPayoutUsd)
      ? m.pilotPayoutUsd - debrief.fuelCostUsd
      : debrief.netUsd;

  return (
    <section className="logbook-detail" aria-label="Flight detail">
      <div className="logbook-detail-toolbar">
        <button type="button" className="action ghost" onClick={props.onBack}>
          ← Logbook
        </button>
        <span className={`status status-${m.status}`}>
          {logbookStatusLabel(m.status)}
        </span>
      </div>

      <header className="debrief-hero logbook-detail-hero">
        <p className="debrief-kicker">
          {debrief.impactEnded ? 'Flight ended' : 'Flight record'}
        </p>
        <h2>
          {debrief.originIcao}
          <span className="debrief-hero-arrow" aria-hidden="true">
            →
          </span>
          {debrief.destIcao}
        </h2>
        <p className="debrief-hero-meta">
          {logbookAircraftLabel(m, { fleetLabel: props.fleetLabel })}
          {' · '}
          {logbookCargoLabel(m, props.formatMass)}
          {distanceNm != null
            ? ` · ${distanceNm.toLocaleString('en-US')} nm`
            : ''}
          {when ? ` · ${when}` : ''}
          {' · '}
          <span className="logbook-kind">{kind}</span>
          {props.pilotLabel ? (
            <>
              {' · '}
              <span className="logbook-kind logbook-pilot">
                {props.pilotLabel}
              </span>
            </>
          ) : null}
        </p>
      </header>

      <ul className="debrief-pillars" aria-label="Flight glance">
        {buildDebriefPillars(debrief).map((pillar) => (
          <li
            key={pillar.id}
            className={`debrief-pillar debrief-pillar-${pillar.tone}`}
          >
            <span className="debrief-pillar-label">{pillar.label}</span>
            <span className="debrief-pillar-badge">{pillar.badge}</span>
            <span className="debrief-pillar-detail">{pillar.detail}</span>
          </li>
        ))}
      </ul>

      {debrief.impactEnded && debrief.payLine ? (
        <p className="debrief-impact-note" role="status">
          {debrief.payLine}
        </p>
      ) : null}

      <div className="debrief-layout">
        <div className="debrief-col-touch">
          {debrief.runwayTouch ? (
            <div className="debrief-runway-block">
              <RunwayTouchdownDiagram touch={debrief.runwayTouch} />
              {formatRunwayTouchdownDebriefLine(debrief.runwayTouch) ? (
                <p
                  className={
                    debrief.runwayTouch.onPavement
                      ? 'debrief-runway-line'
                      : 'debrief-runway-line debrief-runway-line-off'
                  }
                >
                  {formatRunwayTouchdownDebriefLine(debrief.runwayTouch)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="muted debrief-no-touch">
              {debrief.impactEnded
                ? 'No destination touchdown — cargo written off.'
                : 'No runway sample on this leg.'}
            </p>
          )}
        </div>

        <div className="debrief-col-stats">
          <div className="debrief-hero-money">
            <div>
              <span className="debrief-hero-money-label">
                {props.payoutMode === 'pilot' ? 'Net (home)' : 'Net'}
              </span>
              <strong className="debrief-hero-money-net">
                {boardMoneyLabel(netForMode, props.formatMoney)}
              </strong>
            </div>
            {debrief.flightScore && !debrief.impactEnded ? (
              <div className="debrief-hero-score">
                <span className="debrief-hero-money-label">Score</span>
                <strong
                  className={scoreToneClass(
                    Math.round(debrief.flightScore.pct),
                  )}
                >
                  {Math.round(debrief.flightScore.pct)}%
                </strong>
              </div>
            ) : null}
          </div>

          {!debrief.impactEnded ? (
            <dl className="debrief-metrics">
              <div>
                <dt>Payout</dt>
                <dd>{props.formatMoney(displayPayout)}</dd>
              </div>
              {debrief.penaltyUsd > 0 ? (
                <div>
                  <dt>Late</dt>
                  <dd>−{props.formatMoney(debrief.penaltyUsd)}</dd>
                </div>
              ) : null}
              {debrief.fuelCostUsd > 0 ? (
                <div>
                  <dt>Fuel</dt>
                  <dd>−{props.formatMoney(debrief.fuelCostUsd)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Landing</dt>
                <dd>{formatLandingFpm(debrief.landingFpm)}</dd>
              </div>
              {debrief.weatherBonusUsd > 0 ? (
                <div>
                  <dt>Weather</dt>
                  <dd>+{props.formatMoney(debrief.weatherBonusUsd)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {debrief.flightScore && !debrief.impactEnded ? (
            <div
              className="flight-score flight-score-compact"
              aria-label="Flight score"
            >
              <ul className="flight-score-cats">
                {debrief.flightScore.categories.map((cat) => (
                  <li key={cat.id}>
                    <div className="flight-score-cat-head">
                      <span>{cat.label}</span>
                      <span>
                        {cat.earned}/{cat.max}
                      </span>
                    </div>
                    <div className="flight-score-bar" role="presentation">
                      <div
                        className="flight-score-bar-fill"
                        style={{
                          width: `${
                            cat.max > 0
                              ? Math.round((100 * cat.earned) / cat.max)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
