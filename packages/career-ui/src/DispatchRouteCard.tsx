import { useEffect, useState, type ReactNode } from 'react';
import {
  DispatchRouteMap,
  type DispatchAircraftPosition,
  type DispatchRouteEndpoint,
  type DispatchRouteWaypoint,
} from './DispatchRouteMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';
import { BusyBlock, BusySpinner } from './Busy';

/** Highlight origin/dest ICAO tokens (incl. runway suffix like SAVN/12) in the OFP route. */
function highlightOfpRoute(
  route: string,
  originIcao: string,
  destIcao: string,
): ReactNode[] {
  const origin = originIcao.trim().toUpperCase();
  const dest = destIcao.trim().toUpperCase();
  return route
    .trim()
    .split(/(\s+)/)
    .map((part, index) => {
      if (!part || /^\s+$/.test(part)) return part;
      const token = part.toUpperCase();
      const isOrigin =
        Boolean(origin) &&
        (token === origin || token.startsWith(`${origin}/`));
      const isDest =
        Boolean(dest) && (token === dest || token.startsWith(`${dest}/`));
      if (isOrigin) {
        return (
          <span key={index} className="dispatch-route-hub-origin">
            {part}
          </span>
        );
      }
      if (isDest) {
        return (
          <span key={index} className="dispatch-route-hub-dest">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
}

/** Compact route map card for Dispatch — below Preflight (or cockpit map when fill). */
export function DispatchRouteCard(props: {
  originIcao: string;
  destIcao: string;
  waypoints?: DispatchRouteWaypoint[];
  /** Full OFP route string (shown in map header when present). */
  ofpRoute?: string;
  /** Live aircraft from Watch (updates as the plane moves). */
  aircraft?: DispatchAircraftPosition | null;
  /** Stretch map to fill parent height (EN ROUTE cockpit). */
  fill?: boolean;
  busy?: boolean;
  canRefreshNavlog?: boolean;
  onOpenAirport: (icao: string) => void;
  onRefreshNavlog?: () => Promise<void>;
}) {
  const [origin, setOrigin] = useState<DispatchRouteEndpoint | null>(null);
  const [dest, setDest] = useState<DispatchRouteEndpoint | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [o, d] = await Promise.all([
        resolveAirportEndpoint(props.originIcao),
        resolveAirportEndpoint(props.destIcao),
      ]);
      if (cancelled) return;
      setOrigin(o);
      setDest(d);
      const miss: string[] = [];
      if (!o) miss.push(props.originIcao.trim().toUpperCase());
      if (!d) miss.push(props.destIcao.trim().toUpperCase());
      setMissing(miss);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.originIcao, props.destIcao]);

  const wptCount = props.waypoints?.length ?? 0;
  const hasAircraft =
    props.aircraft != null &&
    Number.isFinite(props.aircraft.lat) &&
    Number.isFinite(props.aircraft.lon) &&
    !(props.aircraft.lat === 0 && props.aircraft.lon === 0);
  const ofpRoute = props.ofpRoute?.trim() ?? '';

  async function refreshNavlog() {
    if (!props.onRefreshNavlog || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await props.onRefreshNavlog();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section
      className={`dispatch-route-map-card${
        props.fill ? ' dispatch-route-map-card-fill' : ''
      }`}
      aria-label="Dispatch route map"
    >
      <div className="dispatch-route-map-head">
        <strong>Route</strong>
        {ofpRoute ? (
          <code className="dispatch-route-map-ofp" title={ofpRoute}>
            {highlightOfpRoute(ofpRoute, props.originIcao, props.destIcao)}
          </code>
        ) : null}
      </div>
      {loading ? (
        <BusyBlock label="Loading map" className="dispatch-route-map-empty" />
      ) : origin && dest ? (
        <>
          <DispatchRouteMap
            className={
              props.fill
                ? 'dispatch-route-map dispatch-route-map-fill'
                : undefined
            }
            origin={origin}
            dest={dest}
            waypoints={props.waypoints}
            aircraft={hasAircraft ? props.aircraft : null}
            onSelectAirport={props.onOpenAirport}
          />
          {wptCount === 0 ? (
            <div className="dispatch-route-map-hint">
              <p>
                No navlog coordinates on this OFP. SimBrief only sends fix
                lat/lon when <strong>Detailed Navlog</strong> is enabled at
                generation. Re-open SimBrief (Skyline now forces that option),
                generate the OFP again, then load navlog.
              </p>
              {props.canRefreshNavlog && props.onRefreshNavlog ? (
                <button
                  type="button"
                  className="action ghost"
                  disabled={props.busy || refreshing}
                  onClick={() => void refreshNavlog()}
                >
                  {refreshing ? (
                    <>
                      <BusySpinner size="sm" /> Loading navlog…
                    </>
                  ) : (
                    'Load navlog from OFP'
                  )}
                </button>
              ) : null}
              {refreshError ? (
                <p className="dispatch-route-map-error">{refreshError}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="dispatch-route-map-empty">
          Map unavailable
          {missing.length ? ` — missing coords for ${missing.join(', ')}` : ''}.
        </p>
      )}
    </section>
  );
}
