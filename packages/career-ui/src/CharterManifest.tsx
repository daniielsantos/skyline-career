import { useEffect, useMemo, useState } from 'react';
import {
  fetchCharters,
  type CharterOfferView,
  type PlayerAircraft,
} from './api';
import { FerryJourneyDialog } from './FerryJourneyDialog';
import { boardMoneyLabel, formatBoardDistanceNm } from './board-money';

export type CharterManifestDraft = {
  offer: CharterOfferView;
  aircraftId: string;
};

type CharterManifestProps = {
  draft: CharterManifestDraft;
  fleet: PlayerAircraft[];
  /** Aircraft ids that belong to the member's VA (label prefix). */
  vaAircraftIds?: ReadonlySet<string>;
  busy: boolean;
  formatMoney: (value: number) => string;
  formatMass: (kg: number) => string;
  onChange: (draft: CharterManifestDraft) => void;
  onCancel: () => void;
  onFerry: (aircraftId: string, legDest: string, finalDest: string) => Promise<void>;
  onAccept: (draft: CharterManifestDraft) => Promise<void>;
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
};

export function CharterManifest(props: CharterManifestProps) {
  const [ferryOpen, setFerryOpen] = useState(false);
  const [fitLoading, setFitLoading] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const aircraft = props.fleet.find((item) => item.id === props.draft.aircraftId);
  const origin = props.draft.offer.originIcao.trim().toUpperCase();
  const atOrigin =
    aircraft?.status === 'parked' &&
    aircraft.locationIcao.trim().toUpperCase() === origin;
  const fit = props.draft.offer.fit;
  const updateBlocked = Boolean(props.clientUpdateRequiredMin);
  const valid = Boolean(
    aircraft &&
      atOrigin &&
      !updateBlocked &&
      fit?.aircraftId === aircraft.id &&
      fit.compatible &&
      props.draft.offer.status === 'available',
  );
  const reasons = useMemo(() => fit?.reasons ?? [], [fit]);

  useEffect(() => {
    if (atOrigin) setFerryOpen(false);
  }, [atOrigin]);

  useEffect(() => {
    if (!aircraft) return;
    let cancelled = false;
    setFitLoading(true);
    setFitError(null);
    void fetchCharters({
      origin: props.draft.offer.originIcao,
      dest: props.draft.offer.destIcao,
      aircraftId: aircraft.id,
      page: 1,
      pageSize: 100,
    })
      .then((result) => {
        if (cancelled) return;
        const refreshed = result.offers.find((offer) => offer.id === props.draft.offer.id);
        if (!refreshed) {
          setFitError('This charter is no longer available.');
          return;
        }
        props.onChange({ offer: refreshed, aircraftId: aircraft.id });
      })
      .catch((err: unknown) => {
        if (!cancelled) setFitError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setFitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    aircraft?.id,
    aircraft?.locationIcao,
    aircraft?.status,
    props.draft.offer.id,
    props.draft.offer.originIcao,
    props.draft.offer.destIcao,
  ]);

  return (
    <>
      <div className="staging-manifest-head charter-manifest">
        <div className="panel-head missions-head">
          <div className="missions-head-spacer" aria-hidden="true" />
          <div className="missions-head-center">
            <p className="charter-kicker">Charter</p>
            <h2>{props.draft.offer.originIcao} → {props.draft.offer.destIcao}</h2>
            <p>
              {props.draft.offer.paxCount} passengers ·{' '}
              {props.formatMass(props.draft.offer.baggageKg)}
            </p>
          </div>
          <div className="missions-head-actions">
            <button
              type="button"
              className="action ghost danger compact"
              onClick={props.onCancel}
              disabled={props.busy}
            >
              Discard manifest
            </button>
          </div>
        </div>

        <div className="staging-manifest-aircraft">
          <label className="staging-aircraft staging-aircraft-centered">
            Aircraft
            <select
              value={props.draft.aircraftId}
              disabled={props.busy}
              onChange={(event) => {
                setFerryOpen(false);
                props.onChange({
                  offer: { ...props.draft.offer, fit: undefined },
                  aircraftId: event.target.value,
                });
              }}
            >
              {props.fleet
                .filter((item) => item.status === 'parked')
                .map((item) => {
                  const isVa = props.vaAircraftIds?.has(item.id);
                  const prefix = isVa ? 'VA' : 'Yours';
                  return (
                  <option key={item.id} value={item.id}>
                    {prefix} · {item.label} · {item.locationIcao === origin ? `@ ${origin}` : `ferry from ${item.locationIcao}`}
                  </option>
                  );
                })}
            </select>
          </label>
          {aircraft && !atOrigin ? (
            <div className="staging-manifest-ferry">
              <p className="muted staging-manifest-ferry-hint">
                {aircraft.label} is at {aircraft.locationIcao} — ferry to {origin} before accepting.
              </p>
              <button
                type="button"
                className="accept"
                disabled={props.busy || aircraft.status !== 'parked'}
                onClick={() => setFerryOpen(true)}
              >
                Ferry to {origin}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="charter-manifest-summary" aria-label="Charter manifest">
        <div><span>Passengers</span><strong>{props.draft.offer.paxCount}</strong></div>
        <div><span>Baggage</span><strong>{props.formatMass(props.draft.offer.baggageKg)}</strong></div>
        <div><span>Distance</span><strong>{formatBoardDistanceNm(props.draft.offer.distanceNm)}</strong></div>
        <div><span>Contract pay</span><strong>{boardMoneyLabel(props.draft.offer.payUsd, props.formatMoney)}</strong></div>
        <div>
          <span>Estimated net</span>
          <strong>{boardMoneyLabel(fit?.netUsd, props.formatMoney)}</strong>
        </div>
        <div>
          <span>Fit</span>
          <strong>
            {fitLoading ? 'Checking…' : fit?.compatible ? 'Ready' : 'Not compatible'}
          </strong>
        </div>
      </section>

      <div className="staging-section charter-fixed-manifest">
        <h3>Fixed manifest</h3>
        <p>
          {props.draft.offer.paxCount} passengers and {props.formatMass(props.draft.offer.baggageKg)} baggage.
          Charters cannot be split, resized, or combined.
        </p>
        {props.draft.offer.reason ? <small>{props.draft.offer.reason}</small> : null}
      </div>

      {fitError ? <p className="banner error">{fitError}</p> : null}
      {!fitLoading && fit && !fit.compatible ? (
        <p className="banner error">
          {reasons.length > 0 ? reasons.join(' · ') : 'Selected aircraft is not compatible.'}
        </p>
      ) : null}

      <div className="staging-footer staging-footer-sticky">
        <div>
          <p>{props.draft.offer.paxCount} pax · {boardMoneyLabel(props.draft.offer.payUsd, props.formatMoney)}</p>
          {!atOrigin ? <p className="cargo-dialog-error">Aircraft must be at {origin} — ferry first.</p> : null}
          {updateBlocked ? (
            <p className="cargo-dialog-error">
              Update required · v{props.clientUpdateRequiredMin}+
              {props.onOpenUpdates ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="action ghost compact"
                    onClick={() => props.onOpenUpdates?.()}
                  >
                    Settings → Updates
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="accept"
          disabled={props.busy || fitLoading || !valid}
          onClick={() => void props.onAccept(props.draft)}
        >
          {props.busy
            ? 'Accepting…'
            : updateBlocked
              ? 'Update required'
              : 'Accept & Dispatch'}
        </button>
      </div>

      {ferryOpen && aircraft?.status === 'parked' ? (
        <FerryJourneyDialog
          aircraft={aircraft}
          finalDestIcao={origin}
          formatMoney={props.formatMoney}
          busy={props.busy}
          onClose={() => setFerryOpen(false)}
          onFlyLeg={(legDest) => props.onFerry(aircraft.id, legDest, origin)}
        />
      ) : null}
    </>
  );
}
