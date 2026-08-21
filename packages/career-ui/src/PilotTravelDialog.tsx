import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FerryHubCombobox, type FerryHubOption } from './FerryHubCombobox';

export type PilotTravelFleetShortcut = {
  icao: string;
  label: string;
};

/**
 * Picker for instant pilot reposition (aircraft stays put).
 * Confirm + wallet debit stay in the parent `onTravel` flow.
 */
export function PilotTravelDialog(props: {
  pilotIcao: string;
  hubs: FerryHubOption[];
  /** Parked fleet ICAOs where the pilot is away — one-click dest. */
  fleetShortcuts?: PilotTravelFleetShortcut[];
  busy?: boolean;
  onCancel: () => void;
  /** Quote → confirm → travel. Resolve true when the pilot moved. */
  onTravel: (destIcao: string) => Promise<boolean>;
}) {
  const titleId = useId();
  const bodyId = useId();
  const fieldRef = useRef<HTMLLabelElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const [destIcao, setDestIcao] = useState('');
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
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const dest = destIcao.trim().toUpperCase();
  const canGo =
    Boolean(dest) && dest !== origin && !props.busy && !submitting;

  async function submit(nextDest: string) {
    const icao = nextDest.trim().toUpperCase();
    if (!icao || icao === origin || props.busy || submitting) return;
    setSubmitting(true);
    // Close this overlay first — the quote confirm shares the same z-index and
    // would otherwise sit underneath an unresponsive Cancel/Go.
    onCancelRef.current();
    try {
      await props.onTravel(icao);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
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
            Instant pilot reposition — aircraft stays put. Cost is quoted
            before you confirm.
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
            className="action"
            disabled={!canGo}
            aria-busy={submitting || undefined}
            onClick={() => void submit(dest)}
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
