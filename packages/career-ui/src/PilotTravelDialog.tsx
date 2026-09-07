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

/**
 * Single-step pilot reposition: pick dest, see quote, Travel once.
 */
export function PilotTravelDialog(props: {
  pilotIcao: string;
  hubs: FerryHubOption[];
  /** Prefill destination (e.g. Hangar “Travel here”). */
  initialDestIcao?: string | null;
  /** Parked fleet ICAOs where the pilot is away — one-click dest. */
  fleetShortcuts?: PilotTravelFleetShortcut[];
  formatMoney: (n: number) => string;
  busy?: boolean;
  onCancel: () => void;
  /** Execute travel after quote is shown in this dialog. Resolve true when moved. */
  onTravel: (destIcao: string) => Promise<boolean>;
}) {
  const titleId = useId();
  const bodyId = useId();
  const fieldRef = useRef<HTMLLabelElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const [destIcao, setDestIcao] = useState(
    () => props.initialDestIcao?.trim().toUpperCase() ?? '',
  );
  const [quote, setQuote] = useState<PilotTravelQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const origin = props.pilotIcao.trim().toUpperCase();
  const hubs = useMemo(
    () =>
      props.hubs.filter(
        (hub) => hub.icao && hub.icao.toUpperCase() !== origin,
      ),
    [props.hubs, origin],
  );
  const shortcuts = useMemo(() => {
    const seen = new Set<string>();
    const out: PilotTravelFleetShortcut[] = [];
    for (const row of props.fleetShortcuts ?? []) {
      const icao = row.icao.trim().toUpperCase();
      if (!icao || icao === origin || seen.has(icao)) continue;
      seen.add(icao);
      out.push({ icao, label: row.label });
    }
    return out;
  }, [props.fleetShortcuts, origin]);

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
  }, [submitting]);

  const dest = destIcao.trim().toUpperCase();

  useEffect(() => {
    if (!dest || dest === origin) {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    const timer = window.setTimeout(() => {
      void postPilotTravel({ destIcao: dest, quoteOnly: true })
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
  }, [dest, origin]);

  const canGo =
    Boolean(dest) &&
    dest !== origin &&
    Boolean(quote) &&
    !quoteError &&
    !quoting &&
    !props.busy &&
    !submitting;

  async function submit() {
    if (!canGo || !quote) return;
    setSubmitting(true);
    try {
      const moved = await props.onTravel(dest);
      if (moved) onCancelRef.current();
    } finally {
      setSubmitting(false);
    }
  }

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
        <p className="confirm-kicker">Pilot</p>
        <h2 id={titleId} className="confirm-title">
          Travel from {origin || '—'}
        </h2>
        <div id={bodyId} className="confirm-body">
          <p>
            Instant pilot reposition — aircraft stays put.
          </p>
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
                    dest === row.icao ? 'fbo-icao-chip active' : 'fbo-icao-chip'
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
          <label className="confirm-field" ref={fieldRef}>
            <span>Travel to</span>
            <FerryHubCombobox
              hubs={hubs}
              excludeIcao={origin}
              value={destIcao}
              onChange={setDestIcao}
              disabled={props.busy || submitting}
            />
          </label>
          {quoting ? (
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
          <button
            type="button"
            className="accept"
            disabled={!canGo}
            aria-busy={submitting || quoting || undefined}
            onClick={() => void submit()}
          >
            {submitting
              ? 'Traveling…'
              : quote
                ? `Travel · ${props.formatMoney(quote.costUsd)}`
                : 'Travel'}
          </button>
        </div>
      </div>
    </div>
  );
}
