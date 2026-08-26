import type { ReactNode } from 'react';

export type DispatchFlightSummaryHighlight = {
  label: string;
  value: ReactNode;
  strongClassName?: string;
};

export function DispatchFlightSummary(props: {
  ariaLabel?: string;
  formatTonnes: (kg: number) => string;
  capacityLabel: string;
  totalKg: number;
  capKg: number;
  showCapacityBar?: boolean;
  capacityStaticLabel?: string;
  capacityNote?: string;
  highlights: DispatchFlightSummaryHighlight[];
  planningDetails: ReactNode;
  planningSummaryLabel?: string;
}) {
  const showBar = props.showCapacityBar !== false && props.capKg > 0;
  const fillPct = showBar
    ? Math.min(100, Math.round((props.totalKg / props.capKg) * 100))
    : 0;

  return (
    <section
      className="staging-manifest-summary"
      aria-label={props.ariaLabel ?? 'Flight summary'}
    >
      <div className="staging-manifest-capacity">
        <div className="staging-manifest-capacity-head">
          <span className="staging-manifest-capacity-label">
            {props.capacityLabel}
          </span>
          <strong>
            {showBar ? (
              <>
                {props.formatTonnes(props.totalKg)} /{' '}
                {props.formatTonnes(props.capKg)}
              </>
            ) : (
              props.capacityStaticLabel ?? props.formatTonnes(props.totalKg)
            )}
          </strong>
        </div>
        {showBar ? (
          <>
            <div
              className="staging-manifest-capacity-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={props.capKg}
              aria-valuenow={props.totalKg}
              aria-label={props.capacityLabel}
            >
              <div
                className="staging-manifest-capacity-fill"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            {props.capacityNote ? (
              <p className="dispatch-flight-capacity-note">{props.capacityNote}</p>
            ) : null}
          </>
        ) : props.capacityNote ? (
          <p className="dispatch-flight-capacity-note">{props.capacityNote}</p>
        ) : null}
      </div>

      <div className="staging-manifest-highlights">
        {props.highlights.map((row) => (
          <span key={row.label}>
            {row.label}
            <strong className={row.strongClassName}>{row.value}</strong>
          </span>
        ))}
      </div>

      <details className="staging-planning-details">
        <summary>{props.planningSummaryLabel ?? 'Planning details'}</summary>
        <div className="cargo-capacity staging-capacity staging-planning-grid">
          {props.planningDetails}
        </div>
      </details>
    </section>
  );
}
