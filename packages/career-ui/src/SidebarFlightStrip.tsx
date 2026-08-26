export type SidebarFlightStripKind = 'active' | 'draft' | 'bush' | 'crew';

function StripOpenIcon() {
  return (
    <svg
      className="sidebar-flight-strip-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.5 9.5 9.5 4.5M9.5 4.5H5.75M9.5 4.5V8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarFlightStrip(props: {
  kind: SidebarFlightStripKind;
  label: string;
  originIcao: string;
  destIcao: string;
  detail: string;
  busy: boolean;
  onOpen: () => void;
}) {
  const openLabel = `Open Dispatch — ${props.label}, ${props.originIcao} to ${props.destIcao}`;

  return (
    <button
      type="button"
      className={`sidebar-flight-strip sidebar-flight-strip--${props.kind}`}
      disabled={props.busy}
      onClick={props.onOpen}
      aria-label={openLabel}
      title="Open Dispatch"
    >
      <div className="sidebar-flight-strip-head">
        <span className="sidebar-flight-strip-badge">{props.label}</span>
        <span className="sidebar-flight-strip-icon-wrap" aria-hidden="true">
          <StripOpenIcon />
        </span>
      </div>
      <div className="sidebar-flight-strip-route">
        <span className="sidebar-flight-strip-icao">{props.originIcao}</span>
        <span className="sidebar-flight-strip-arrow" aria-hidden="true">
          →
        </span>
        <span className="sidebar-flight-strip-icao">{props.destIcao}</span>
      </div>
      <p className="sidebar-flight-strip-detail">{props.detail}</p>
    </button>
  );
}
