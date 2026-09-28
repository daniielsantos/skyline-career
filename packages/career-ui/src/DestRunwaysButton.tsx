import { useEffect, useId, useRef, useState } from 'react';
import { fetchAirportRunways, type CareerRunway } from './api';
import {
  destRunwayEnds,
  formatDestRunwayFacts,
  runwaysLongestFirst,
} from './dest-runways';

export function DestRunwaysButton(props: { icao: string }) {
  const icao = props.icao.trim().toUpperCase();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CareerRunway[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    setRows(null);
    setError(null);
    setOpen(false);
  }, [icao]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        triggerRef.current?.focus({ preventScroll: true });
      }
      return undefined;
    }
    wasOpen.current = true;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function openModal() {
    setOpen(true);
    if (rows != null) return;
    setError(null);
    try {
      const result = await fetchAirportRunways(icao);
      setRows(runwaysLongestFirst(result.runways ?? []));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const listed = rows ?? [];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="dest-runway-trigger"
        aria-label={`Runways at ${icao}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Runways at ${icao}`}
        onClick={() => void openModal()}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <rect
            x="3"
            y="7"
            width="18"
            height="10"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 8.2v7.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeDasharray="1.6 1.8"
          />
        </svg>
      </button>
      {open ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="confirm-dialog dest-runway-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <p className="confirm-kicker">Destination</p>
            <h2 id={titleId} className="confirm-title">
              {icao} runways
            </h2>
            {error ? (
              <p className="empty">{error}</p>
            ) : rows == null ? (
              <p className="empty">Loading runways…</p>
            ) : listed.length === 0 ? (
              <p className="empty">No runway on file for {icao}.</p>
            ) : (
              <ul className="dest-runway-list">
                {listed.map((runway) => (
                  <li key={`${runway.ident}-${runway.lengthM}`}>
                    <strong>{destRunwayEnds(runway)}</strong>
                    <span>{formatDestRunwayFacts(runway)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="confirm-actions">
              <button
                ref={closeRef}
                type="button"
                className="action"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
