/**
 * Skyline brand lockup — geometric skyline mark + SKY/LINE wordmark.
 */

type BrandMarkProps = {
  className?: string;
  /** Optional secondary line (e.g. "Career" on the profile gate). */
  subtitle?: string;
};

export function BrandMark(props: BrandMarkProps) {
  const rootClass = ['brand-mark', props.className].filter(Boolean).join(' ');
  return (
    <span className={rootClass}>
      <span className="brand-mark-row" aria-label="Skyline">
        <svg
          className="brand-mark-icon"
          viewBox="0 0 40 40"
          aria-hidden="true"
        >
          {/* Ascending skyline bars on a runway/horizon base. */}
          <rect x="2" y="24" width="7" height="12" rx="0.5" fill="currentColor" />
          <rect x="11" y="16" width="7" height="20" rx="0.5" fill="currentColor" />
          <rect
            className="brand-mark-icon-peak"
            x="20"
            y="6"
            width="8"
            height="30"
            rx="0.5"
            fill="var(--accent)"
          />
          <rect x="30" y="14" width="7" height="22" rx="0.5" fill="currentColor" />
          <rect
            className="brand-mark-icon-horizon"
            x="2"
            y="36.5"
            width="35"
            height="1.5"
            fill="var(--accent)"
          />
        </svg>
        <span className="brand-mark-lockup" aria-hidden="true">
          <span className="brand-mark-word">
            <span className="brand-mark-sky">SKY</span>
            <span className="brand-mark-line">LINE</span>
          </span>
          <svg
            className="brand-mark-horizon"
            viewBox="0 0 100 2"
            preserveAspectRatio="none"
          >
            <line
              x1="0"
              y1="1"
              x2="100"
              y2="1"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </span>
      </span>
      {props.subtitle ? (
        <span className="brand-mark-subtitle">{props.subtitle}</span>
      ) : null}
    </span>
  );
}
