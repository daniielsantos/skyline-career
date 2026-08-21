import { useEffect, useId, useRef, useState } from 'react';
import {
  fetchFerryPlan,
  type FerryPlanView,
  type PlayerAircraft,
} from './api';

export type FerryJourneyDialogProps = {
  aircraft: PlayerAircraft;
  finalDestIcao: string;
  formatMoney: (n: number) => string;
  busy: boolean;
  onClose: () => void;
  /** Execute one hop toward `legDest`; parent updates fleet/wallet. */
  onFlyLeg: (legDest: string) => Promise<void>;
};

/**
 * Multi-leg ferry journey sheet: full route, progress, next-leg cost, fuel note.
 * Card keeps the final dest locally; this dialog drives hop-by-hop clicks.
 */
export function FerryJourneyDialog(props: FerryJourneyDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const flyRef = useRef<HTMLButtonElement>(null);
  const journeyOriginRef = useRef<string | null>(null);
  const [plan, setPlan] = useState<FerryPlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flying, setFlying] = useState(false);

  const finalDest = props.finalDestIcao.trim().toUpperCase();
  const here = props.aircraft.locationIcao.trim().toUpperCase();
  const arrived = here === finalDest;

  useEffect(() => {
    if (!journeyOriginRef.current) {
      journeyOriginRef.current = here;
    }
  }, [here]);

  useEffect(() => {
    flyRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !flying) {
        event.preventDefault();
        props.onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flying, props]);

  async function refreshPlan() {
    if (arrived) {
      setPlan(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const view = await fetchFerryPlan({
        aircraftId: props.aircraft.id,
        destIcao: finalDest,
        journeyOrigin: journeyOriginRef.current ?? here,
      });
      setPlan(view);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshPlan();
    // Re-fetch when the airframe moves or final dest changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.aircraft.id, props.aircraft.locationIcao, finalDest, arrived]);

  async function flyNext() {
    const legTo = plan?.nextLeg?.to;
    if (!legTo || flying || props.busy) return;
    setFlying(true);
    setError(null);
    try {
      await props.onFlyLeg(legTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFlying(false);
    }
  }

  const legs = plan?.plan?.legs ?? [];
  const hops = plan?.plan?.hops ?? [];
  const nextQuote = plan?.nextQuote;
  const legsDone = Math.max(
    0,
    hops.findIndex((h) => h === here),
  );
  const totalLegs = plan?.legCount ?? legs.length;
  const progressPct = arrived
    ? 100
    : (plan?.progressPct ?? 0);

  return (
    <div
      className="confirm-overlay ferry-journey-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !flying) props.onClose();
      }}
    >
      <div
        className="confirm-dialog tone-warn ferry-journey-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Ferry journey</p>
        <h2 id={titleId} className="confirm-title">
          {here} → {finalDest}
        </h2>
        <div id={bodyId} className="confirm-body ferry-journey-body">
          <p className="ferry-journey-aircraft">
            {props.aircraft.label}
            {arrived ? ' · arrived' : ` · now at ${here}`}
          </p>

          <div
            className="ferry-journey-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="Journey progress"
          >
            <div
              className="ferry-journey-progress-bar"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="ferry-journey-progress-meta">
            {arrived
              ? 'Journey complete'
              : loading
                ? 'Planning route…'
                : plan
                  ? `Leg ${Math.min(legsDone + 1, Math.max(1, totalLegs))} of ${totalLegs} · ${progressPct}% · ${plan.remainingNm.toLocaleString()} nm left`
                  : '—'}
          </p>

          {error ? <p className="ferry-journey-error">{error}</p> : null}

          {!arrived && !loading && legs.length > 0 ? (
            <ol className="ferry-journey-legs">
              {legs.map((leg, i) => {
                const done = i < legsDone;
                const current = i === legsDone;
                return (
                  <li
                    key={`${leg.from}-${leg.to}-${i}`}
                    className={
                      done
                        ? 'is-done'
                        : current
                          ? 'is-current'
                          : 'is-upcoming'
                    }
                  >
                    <span className="ferry-journey-leg-status">
                      {done ? 'Done' : current ? 'Next' : 'Later'}
                    </span>
                    <span className="ferry-journey-leg-route">
                      {leg.from} → {leg.to}
                    </span>
                    <span className="ferry-journey-leg-nm">
                      {Math.round(leg.distanceNm).toLocaleString()} nm
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {!arrived && nextQuote ? (
            <p className="ferry-journey-cost">
              Next leg{' '}
              <strong>{props.formatMoney(nextQuote.totalCostUsd)}</strong>
              {' · '}
              fee {props.formatMoney(nextQuote.ferryFeeUsd)}
              {' · '}
              fuel {props.formatMoney(nextQuote.fuelCostUsd)}
              {nextQuote.fuelUpliftKg > 0
                ? ` (uplift ~${Math.round(nextQuote.fuelUpliftKg)} kg)`
                : ''}
            </p>
          ) : null}

          <p className="ferry-journey-fuel-note">
            Instant relocation. Each leg tops up for the hop, then burns trip
            fuel — tanks usually arrive empty. Keep clicking{' '}
            <strong>Fly next leg</strong> until you reach {finalDest}.
          </p>
        </div>

        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={flying}
            onClick={props.onClose}
          >
            {arrived ? 'Close' : 'Pause'}
          </button>
          {!arrived ? (
            <button
              ref={flyRef}
              type="button"
              className="action warn"
              disabled={
                flying ||
                props.busy ||
                loading ||
                !plan?.nextLeg
              }
              onClick={() => void flyNext()}
            >
              {flying
                ? 'Ferrying…'
                : plan?.nextLeg
                  ? `Fly next leg · ${plan.nextLeg.from}→${plan.nextLeg.to}`
                  : 'Fly next leg'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
