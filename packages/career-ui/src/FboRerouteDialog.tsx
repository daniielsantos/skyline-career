import { useEffect, useId, useRef, useState } from 'react';
import { FerryHubCombobox, type FerryHubOption } from './FerryHubCombobox';
import { postFboReroute, type PlayerFboHold } from './api';

export function FboRerouteDialog(props: {
  hold: PlayerFboHold;
  hubs: FerryHubOption[];
  /** Other owned FBO ICAOs for one-click company-lane reroute. */
  sisterFboIcaos?: string[];
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (destIcao: string) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const fieldRef = useRef<HTMLLabelElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const [destIcao, setDestIcao] = useState('');
  const [feeUsd, setFeeUsd] = useState<number | null>(null);
  const [payAfterUsd, setPayAfterUsd] = useState<number | null>(null);
  const [haircutApplied, setHaircutApplied] = useState(false);
  const [bumpApplied, setBumpApplied] = useState(false);
  const [bumpFrac, setBumpFrac] = useState(0);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const origin = props.hold.originIcao.toUpperCase();
  const currentDest = props.hold.destIcao.toUpperCase();
  const sisterPicks = (props.sisterFboIcaos ?? [])
    .map((icao) => icao.toUpperCase())
    .filter((icao) => icao && icao !== origin && icao !== currentDest);
  const hubs = props.hubs.filter(
    (hub) =>
      hub.icao &&
      hub.icao.toUpperCase() !== origin &&
      hub.icao.toUpperCase() !== currentDest,
  );

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

  useEffect(() => {
    const dest = destIcao.trim().toUpperCase();
    if (!dest || dest === origin || dest === currentDest) {
      setFeeUsd(null);
      setPayAfterUsd(null);
      setHaircutApplied(false);
      setBumpApplied(false);
      setBumpFrac(0);
      setQuoteError(null);
      setQuoting(false);
      return;
    }

    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    const timer = window.setTimeout(() => {
      void postFboReroute({
        holdId: props.hold.id,
        destIcao: dest,
        quoteOnly: true,
      })
        .then((quote) => {
          if (cancelled) return;
          setFeeUsd(quote.feeUsd);
          setPayAfterUsd(quote.payAfterUsd ?? null);
          setHaircutApplied(Boolean(quote.haircutApplied));
          setBumpApplied(Boolean(quote.bumpApplied));
          setBumpFrac(
            typeof quote.bumpFrac === 'number' && Number.isFinite(quote.bumpFrac)
              ? quote.bumpFrac
              : 0,
          );
          setQuoting(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setFeeUsd(null);
          setPayAfterUsd(null);
          setHaircutApplied(false);
          setBumpApplied(false);
          setBumpFrac(0);
          setQuoting(false);
          setQuoteError(err instanceof Error ? err.message : String(err));
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destIcao, origin, currentDest, props.hold.id]);

  const canConfirm =
    Boolean(destIcao.trim()) &&
    feeUsd != null &&
    !quoting &&
    !quoteError &&
    !props.busy;

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
      }}
    >
      <div
        className="confirm-dialog tone-warn"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Check before continuing</p>
        <h2 id={titleId} className="confirm-title">
          Reroute bonded hold?
        </h2>
        <div id={bodyId} className="confirm-body">
          <p>
            {origin}→{currentDest} · {props.formatTonnes(props.hold.cargoKg)} ·{' '}
            contract {props.formatMoney(props.hold.payUsd)}
          </p>
          <p>
            Not free: fee (~12% of pay, min $75, plus $/nm if longer). Same or
            shorter leg takes an 8% pay haircut; longer leg bumps contract pay
            with extra nm (capped at +12%). Lot stays bonded until release.
          </p>
          <label className="confirm-field" ref={fieldRef}>
            <span>New destination hub</span>
            {sisterPicks.length > 0 ? (
              <div className="fbo-icao-switcher" role="group" aria-label="Sister FBOs">
                {sisterPicks.map((icao) => (
                  <button
                    key={icao}
                    type="button"
                    className={
                      destIcao.toUpperCase() === icao
                        ? 'fbo-icao-chip active'
                        : 'fbo-icao-chip'
                    }
                    disabled={props.busy}
                    onClick={() => setDestIcao(icao)}
                  >
                    {icao}
                  </button>
                ))}
              </div>
            ) : null}
            <FerryHubCombobox
              hubs={hubs}
              excludeIcao={origin}
              value={destIcao}
              onChange={setDestIcao}
              disabled={props.busy}
            />
          </label>
          <div className="confirm-quote-slot" aria-live="polite">
            {quoting ? (
              <p className="confirm-quote">Quoting fee…</p>
            ) : quoteError ? (
              <p className="confirm-quote is-error">{quoteError}</p>
            ) : feeUsd != null ? (
              <p className="confirm-quote">
                Fee {props.formatMoney(feeUsd)}
                {payAfterUsd != null
                  ? haircutApplied
                    ? ` · contract pay after → ${props.formatMoney(payAfterUsd)} (−8%)`
                    : bumpApplied
                      ? ` · contract pay after → ${props.formatMoney(payAfterUsd)} (+${Math.round(bumpFrac * 1000) / 10}%)`
                      : ` · contract pay unchanged → ${props.formatMoney(payAfterUsd)}`
                  : ''}
              </p>
            ) : null}
          </div>
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            onClick={() => onCancelRef.current()}
            disabled={props.busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="action warn"
            disabled={!canConfirm}
            onClick={() => {
              const dest = destIcao.trim().toUpperCase();
              if (!dest || !canConfirm) return;
              props.onConfirm(dest);
            }}
          >
            Reroute
          </button>
        </div>
      </div>
    </div>
  );
}
