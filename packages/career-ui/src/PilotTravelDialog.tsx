import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  postPilotTravel,
  type PilotTravelQuote,
} from './api';
import { FerryHubCombobox, type FerryHubOption } from './FerryHubCombobox';

export type PilotTravelFleetShortcut = {
  icao: string;
  label: string;
};

export type PilotTravelContextShortcut = {
  icao: string;
  /** Short reason — e.g. Dispatch origin, Mission origin. */
  label: string;
};

export type PilotTravelFerryAircraft = {
  id: string;
  label: string;
  locationIcao: string;
  status: string;
  leaseOverdue?: boolean;
};

type Mode = 'pilot' | 'ferry';

/**
 * Topbar reposition: pilot travel (instant) or open a ferry journey for a parked airframe.
 */
export function PilotTravelDialog(props: {
  pilotIcao: string;
  /** Pilot home company — quotes/writes never use a pinned VA tenant. */
  homeCompanyId?: string | null;
  hubs: FerryHubOption[];
  /** Prefill destination (e.g. Hangar “Travel here”). */
  initialDestIcao?: string | null;
  /** Current Dispatch / accepted mission origins — one-click dest (pilot mode). */
  contextShortcuts?: PilotTravelContextShortcut[];
  /** Parked fleet ICAOs where the pilot is away — one-click dest (pilot mode). */
  fleetShortcuts?: PilotTravelFleetShortcut[];
  /** Parked fleet for ferry mode. */
  ferryAircraft?: PilotTravelFerryAircraft[];
  formatMoney: (n: number) => string;
  busy?: boolean;
  onCancel: () => void;
  /** Execute travel after quote is shown in this dialog. Resolve true when moved. */
  onTravel: (destIcao: string) => Promise<boolean>;
  /** Close this dialog and open the multi-leg ferry journey sheet. */
  onPlanFerry?: (aircraftId: string, destIcao: string) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const fieldRef = useRef<HTMLLabelElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const [mode, setMode] = useState<Mode>('pilot');
  const [destIcao, setDestIcao] = useState(
    () => props.initialDestIcao?.trim().toUpperCase() ?? '',
  );
  const [quote, setQuote] = useState<PilotTravelQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const origin = props.pilotIcao.trim().toUpperCase();
  const ferryOptions = useMemo(() => {
    return (props.ferryAircraft ?? []).filter(
      (acf) =>
        (acf.status === 'parked' || acf.status === 'maintenance') &&
        !acf.leaseOverdue &&
        acf.locationIcao.trim(),
    );
  }, [props.ferryAircraft]);

  const [aircraftId, setAircraftId] = useState(() => {
    const atPilot = ferryOptions.find(
      (a) => a.locationIcao.trim().toUpperCase() === origin,
    );
    return atPilot?.id ?? ferryOptions[0]?.id ?? '';
  });

  const selectedAircraft = ferryOptions.find((a) => a.id === aircraftId) ?? null;
  const ferryOrigin = selectedAircraft?.locationIcao.trim().toUpperCase() ?? '';

  const hubs = useMemo(() => {
    const exclude =
      mode === 'ferry' ? ferryOrigin || origin : origin;
    return props.hubs.filter(
      (hub) => hub.icao && hub.icao.toUpperCase() !== exclude,
    );
  }, [props.hubs, origin, ferryOrigin, mode]);

  const contextShortcuts = useMemo(() => {
    const seen = new Set<string>();
    const out: PilotTravelContextShortcut[] = [];
    for (const row of props.contextShortcuts ?? []) {
      const icao = row.icao.trim().toUpperCase();
      if (!icao || icao === origin || seen.has(icao)) continue;
      seen.add(icao);
      out.push({ icao, label: row.label.trim() || icao });
    }
    return out;
  }, [props.contextShortcuts, origin]);

  const shortcuts = useMemo(() => {
    const seen = new Set(contextShortcuts.map((r) => r.icao));
    const out: PilotTravelFleetShortcut[] = [];
    for (const row of props.fleetShortcuts ?? []) {
      const icao = row.icao.trim().toUpperCase();
      if (!icao || icao === origin || seen.has(icao)) continue;
      seen.add(icao);
      out.push({ icao, label: row.label });
    }
    return out;
  }, [props.fleetShortcuts, origin, contextShortcuts]);

  useEffect(() => {
    if (!aircraftId && ferryOptions[0]) {
      setAircraftId(ferryOptions[0].id);
    } else if (
      aircraftId &&
      ferryOptions.length > 0 &&
      !ferryOptions.some((a) => a.id === aircraftId)
    ) {
      setAircraftId(ferryOptions[0]?.id ?? '');
    }
  }, [aircraftId, ferryOptions]);

  useEffect(() => {
    const input = fieldRef.current?.querySelector('input');
    input?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submitting, mode]);

  const dest = destIcao.trim().toUpperCase();

  useEffect(() => {
    if (mode !== 'pilot') {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      return;
    }
    if (!dest || dest === origin) {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    const homeId = props.homeCompanyId?.trim() || undefined;
    const timer = window.setTimeout(() => {
      void postPilotTravel({
        destIcao: dest,
        quoteOnly: true,
        companyId: homeId,
      })
        .then((res) => {
          if (cancelled) return;
          setQuote(res.quote);
          setQuoteError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setQuote(null);
          setQuoteError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dest, origin, mode, props.homeCompanyId]);

  const canTravel =
    mode === 'pilot' &&
    Boolean(dest) &&
    dest !== origin &&
    Boolean(quote) &&
    !quoteError &&
    !quoting &&
    !props.busy &&
    !submitting;

  const canPlanFerry =
    mode === 'ferry' &&
    Boolean(props.onPlanFerry) &&
    Boolean(selectedAircraft) &&
    Boolean(dest) &&
    dest !== ferryOrigin &&
    !props.busy &&
    !submitting;

  async function submitTravel() {
    if (!canTravel || !quote) return;
    setSubmitting(true);
    try {
      const moved = await props.onTravel(dest);
      if (moved) onCancelRef.current();
    } finally {
      setSubmitting(false);
    }
  }

  function submitFerry() {
    if (!canPlanFerry || !selectedAircraft || !props.onPlanFerry) return;
    props.onPlanFerry(selectedAircraft.id, dest);
  }

  const ferryAvailable = ferryOptions.length > 0 && Boolean(props.onPlanFerry);

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancelRef.current();
        }
      }}
    >
      <div
        className="confirm-dialog tone-default pilot-travel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Reposition</p>
        <h2 id={titleId} className="confirm-title">
          {mode === 'pilot'
            ? `Travel from ${origin || '—'}`
            : selectedAircraft
              ? `Ferry ${selectedAircraft.label}`
              : 'Ferry aircraft'}
        </h2>
        <div id={bodyId} className="confirm-body">
          {ferryAvailable ? (
            <div
              className="pilot-travel-mode"
              role="tablist"
              aria-label="Reposition mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'pilot'}
                className={
                  mode === 'pilot'
                    ? 'pilot-travel-mode-btn active'
                    : 'pilot-travel-mode-btn'
                }
                disabled={props.busy || submitting}
                onClick={() => setMode('pilot')}
              >
                Pilot
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'ferry'}
                className={
                  mode === 'ferry'
                    ? 'pilot-travel-mode-btn active'
                    : 'pilot-travel-mode-btn'
                }
                disabled={props.busy || submitting}
                onClick={() => setMode('ferry')}
              >
                Ferry
              </button>
            </div>
          ) : null}

          {mode === 'pilot' ? (
            <p>Instant pilot reposition — aircraft stays put.</p>
          ) : (
            <p>
              Plan a ferry journey for a parked airframe. Pilot stays put unless
              you Travel separately.
            </p>
          )}

          {mode === 'ferry' ? (
            ferryOptions.length === 0 ? (
              <p className="cargo-dialog-error" role="status">
                No parked aircraft available to ferry.
              </p>
            ) : (
              <label className="confirm-field">
                <span>Aircraft</span>
                <select
                  value={aircraftId}
                  disabled={props.busy || submitting}
                  onChange={(e) => setAircraftId(e.target.value)}
                >
                  {ferryOptions.map((acf) => (
                    <option key={acf.id} value={acf.id}>
                      {acf.label} · {acf.locationIcao.trim().toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : null}

          {mode === 'pilot' &&
          (contextShortcuts.length > 0 || shortcuts.length > 0) ? (
            <div className="pilot-travel-shortcuts">
              {contextShortcuts.length > 0 ? (
                <div
                  className="fbo-icao-switcher"
                  role="group"
                  aria-label="Flight destinations"
                >
                  {contextShortcuts.map((row) => (
                    <button
                      key={`ctx-${row.icao}`}
                      type="button"
                      className={
                        dest === row.icao
                          ? 'fbo-icao-chip active pilot-travel-chip'
                          : 'fbo-icao-chip pilot-travel-chip'
                      }
                      disabled={props.busy || submitting}
                      title={`Travel to ${row.icao} · ${row.label}`}
                      onClick={() => setDestIcao(row.icao)}
                    >
                      <span className="pilot-travel-chip-icao">{row.icao}</span>
                      <span className="pilot-travel-chip-label">{row.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {shortcuts.length > 0 ? (
                <div
                  className="fbo-icao-switcher"
                  role="group"
                  aria-label="Fleet locations"
                >
                  {shortcuts.map((row) => (
                    <button
                      key={row.icao}
                      type="button"
                      className={
                        dest === row.icao
                          ? 'fbo-icao-chip active'
                          : 'fbo-icao-chip'
                      }
                      disabled={props.busy || submitting}
                      title={`${row.label} at ${row.icao}`}
                      onClick={() => setDestIcao(row.icao)}
                    >
                      {row.icao}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="confirm-field" ref={fieldRef}>
            <span>{mode === 'pilot' ? 'Travel to' : 'Ferry to'}</span>
            <FerryHubCombobox
              hubs={hubs}
              excludeIcao={mode === 'ferry' ? ferryOrigin : origin}
              value={destIcao}
              onChange={setDestIcao}
              disabled={
                props.busy ||
                submitting ||
                (mode === 'ferry' && !selectedAircraft)
              }
            />
          </label>

          {mode === 'pilot' ? (
            quoting ? (
              <p className="muted pilot-travel-quote" role="status">
                Quoting…
              </p>
            ) : quoteError ? (
              <p className="cargo-dialog-error pilot-travel-quote" role="alert">
                {quoteError}
              </p>
            ) : quote ? (
              <p className="pilot-travel-quote" role="status">
                {Math.round(quote.distanceNm)} nm ·{' '}
                <strong>{props.formatMoney(quote.costUsd)}</strong>
              </p>
            ) : dest && dest !== origin ? (
              <p className="muted pilot-travel-quote">Pick a career hub</p>
            ) : null
          ) : selectedAircraft && dest && dest === ferryOrigin ? (
            <p className="muted pilot-travel-quote">Aircraft is already there</p>
          ) : selectedAircraft && dest ? (
            <p className="muted pilot-travel-quote" role="status">
              Opens the ferry journey sheet (multi-leg if needed).
            </p>
          ) : null}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            onClick={() => onCancelRef.current()}
            disabled={submitting}
          >
            Cancel
          </button>
          {mode === 'pilot' ? (
            <button
              type="button"
              className="accept"
              disabled={!canTravel}
              aria-busy={submitting || quoting || undefined}
              onClick={() => void submitTravel()}
            >
              {submitting
                ? 'Traveling…'
                : quote
                  ? `Travel · ${props.formatMoney(quote.costUsd)}`
                  : 'Travel'}
            </button>
          ) : (
            <button
              type="button"
              className="accept"
              disabled={!canPlanFerry}
              onClick={submitFerry}
            >
              Plan ferry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
