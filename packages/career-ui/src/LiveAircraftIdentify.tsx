/**
 * Airframes page — probe live MSFS title and show Market / OFP / Inject match.
 */
import { useState } from 'react';
import {
  postIdentifyLiveAircraft,
  type IdentifyLiveAircraftResponse,
} from './api';

function verdictLabel(verdict: IdentifyLiveAircraftResponse['verdict']): string {
  switch (verdict) {
    case 'ready':
      return 'Recognized — Market SKU available';
    case 'recognized':
      return 'Recognized (no Market SKU row)';
    case 'unknown':
      return 'Not homologated';
    case 'no_aircraft':
      return 'No aircraft title from the sim';
    default:
      return verdict;
  }
}

function layerStatus(ok: boolean): string {
  return ok ? 'Yes' : 'No';
}

type Props = {
  disabled?: boolean;
};

export function LiveAircraftIdentify(props: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IdentifyLiveAircraftResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function onIdentify() {
    setBusy(true);
    setError(null);
    try {
      const next = await postIdentifyLiveAircraft();
      setResult(next);
      if (next.error && !next.aircraftTitle) {
        setError(next.error);
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="live-aircraft-identify">
      <div className="live-aircraft-identify-head">
        <div className="live-aircraft-identify-copy">
          <p className="live-aircraft-identify-label">Live aircraft</p>
          <p className="muted live-aircraft-identify-hint">
            Spawn in MSFS, then check whether Airframe recognizes this title
            (Market, Dispatch OFP, inject profile). Paint/livery does not matter
            — only the aircraft title.
          </p>
        </div>
        <button
          type="button"
          className="action"
          disabled={props.disabled || busy}
          onClick={() => {
            void onIdentify();
          }}
        >
          {busy ? 'Checking…' : 'Identify live aircraft'}
        </button>
      </div>
      {error ? (
        <p className="live-aircraft-identify-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div
          className={`live-aircraft-identify-result verdict-${result.verdict}`}
          role="status"
        >
          <p className="live-aircraft-identify-verdict">
            {verdictLabel(result.verdict)}
          </p>
          <p className="live-aircraft-identify-title">
            <span className="muted">Title</span>{' '}
            {result.aircraftTitle?.trim() || '—'}
          </p>
          <dl className="live-aircraft-identify-layers">
            <div>
              <dt>Market</dt>
              <dd>
                {layerStatus(result.market.matched)}
                {result.market.skus.length > 0 ? (
                  <ul className="live-aircraft-identify-skus">
                    {result.market.skus.map((sku) => (
                      <li key={sku.typeId}>
                        {sku.label}
                        {!sku.enabled ? ' (disabled)' : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Dispatch / OFP</dt>
              <dd>
                {layerStatus(result.ofp.matched)}
                {result.ofp.matched ? (
                  <span className="muted">
                    {' '}
                    · {result.ofp.ofpId || 'pack'}
                    {result.ofp.loadMethod
                      ? ` · ${result.ofp.loadMethod}`
                      : ''}
                    {result.ofp.injectCapable === true
                      ? ' · inject capable'
                      : result.ofp.injectCapable === false
                        ? ' · EFB / native SimBrief'
                        : ''}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Inject profile</dt>
              <dd>
                {layerStatus(result.inject.matched)}
                {result.inject.matched ? (
                  <span className="muted">
                    {' '}
                    · {result.inject.displayName || result.inject.profileKey}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
