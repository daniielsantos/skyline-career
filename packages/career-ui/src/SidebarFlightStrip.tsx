import { formatWatchPhaseLabel } from './WatchStatusFooter';

export type SidebarFlightStripKind = 'active' | 'draft' | 'bush' | 'crew';

const MISSION_STATUS_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  dispatched: 'Dispatched',
  in_flight: 'En route',
};

/** Player-facing status for the sidebar strip. Live Watch phase wins once airborne. */
export function sidebarFlightStatusLabel(
  status: string,
  phase?: string | null,
): string {
  if (status === 'in_flight' && phase) {
    const live = formatWatchPhaseLabel(phase);
    if (live !== '—') return live;
  }
  return MISSION_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

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
  detail?: string;
  /** Mission status key, used only for the chip color. */
  status?: string;
  statusLabel?: string;
  busy: boolean;
  onOpen: () => void;
}) {
  const openLabel = `Open ${props.label}, ${props.originIcao} to ${props.destIcao}${
    props.statusLabel ? `, ${props.statusLabel}` : ''
  }`;
  const statusClass = (props.status ?? 'plain').replace(/[^a-z0-9_]/gi, '');

  return (
    <button
      type="button"
      className={`sidebar-flight-strip sidebar-flight-strip--${props.kind}`}
      disabled={props.busy}
      onClick={props.onOpen}
      aria-label={openLabel}
      title={openLabel}
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
      {props.statusLabel ? (
        <p
          className={`sidebar-flight-strip-status sidebar-flight-strip-status--${statusClass}`}
        >
          <span className="sidebar-flight-strip-status-dot" aria-hidden="true" />
          {props.statusLabel}
        </p>
      ) : null}
      {props.detail ? (
        <p className="sidebar-flight-strip-detail">{props.detail}</p>
      ) : null}
    </button>
  );
}
