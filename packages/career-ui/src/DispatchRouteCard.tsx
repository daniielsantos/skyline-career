import { useEffect, useState } from 'react';
import {
  DispatchRouteMap,
  type DispatchAircraftPosition,
  type DispatchRouteEndpoint,
  type DispatchRouteWaypoint,
} from './DispatchRouteMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';

/** Compact route map card for Dispatch — below Preflight. */
export function DispatchRouteCard(props: {
  originIcao: string;
  destIcao: string;
  waypoints?: DispatchRouteWaypoint[];
  /** Live aircraft from Watch (updates as the plane moves). */
  aircraft?: DispatchAircraftPosition | null;
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
    <section className="dispatch-route-map-card" aria-label="Dispatch route map">
      <div className="dispatch-route-map-head">
        <strong>Route</strong>
        <small>
          {props.originIcao.trim().toUpperCase()} →{' '}
          {props.destIcao.trim().toUpperCase()}
          {wptCount > 0 ? ` · ${wptCount} navlog fixes` : ''}
          {hasAircraft ? ' · live aircraft' : ''}
        </small>
      </div>
      {loading ? (
        <p className="dispatch-route-map-empty">Loading map…</p>
      ) : origin && dest ? (
        <>
          <DispatchRouteMap
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
                  {refreshing ? 'Loading navlog…' : 'Load navlog from OFP'}
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
