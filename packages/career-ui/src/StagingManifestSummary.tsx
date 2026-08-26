import type { ReactNode } from 'react';

export function StagingManifestSummary(props: {
  formatTonnes: (kg: number) => string;
  formatMoney: (usd: number) => string;
  totalKg: number;
  capKg: number;
  payUsd: number;
  estNetUsd: number | null;
  estNetLoss?: boolean;
  distanceNm?: number;
  planningDetails: ReactNode;
}) {
  const fillPct =
    props.capKg > 0
      ? Math.min(100, Math.round((props.totalKg / props.capKg) * 100))
      : 0;

  return (
    <section className="staging-manifest-summary" aria-label="Manifest summary">
      <div className="staging-manifest-capacity">
        <div className="staging-manifest-capacity-head">
          <span className="staging-manifest-capacity-label">Payload reserved</span>
          <strong>
            {props.formatTonnes(props.totalKg)} / {props.formatTonnes(props.capKg)}
          </strong>
        </div>
        <div
          className="staging-manifest-capacity-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={props.capKg}
          aria-valuenow={props.totalKg}
          aria-label="Manifest payload"
        >
          <div
            className="staging-manifest-capacity-fill"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      <div className="staging-manifest-highlights">
        <span>
          Contract pay
          <strong>{props.formatMoney(props.payUsd)}</strong>
        </span>
        <span>
          Est. net
          <strong
            className={
              props.estNetUsd !== null && props.estNetLoss
                ? 'staging-est-net-loss'
                : props.estNetUsd !== null && props.estNetUsd >= 0
                  ? 'staging-est-net-ok'
                  : undefined
            }
          >
            {props.estNetUsd !== null ? props.formatMoney(props.estNetUsd) : '—'}
          </strong>
        </span>
        <span>
          Route
          <strong>
            {props.distanceNm !== undefined
              ? `${Math.round(props.distanceNm).toLocaleString()} nm`
              : '—'}
          </strong>
        </span>
      </div>

      <details className="staging-planning-details">
        <summary>Planning details</summary>
        <div className="cargo-capacity staging-capacity staging-planning-grid">
          {props.planningDetails}
        </div>
      </details>
    </section>
  );
}
