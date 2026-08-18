import { useEffect, useMemo, useState } from 'react';
import {
  DispatchRouteMap,
  pointOnGreatCircle,
  type DispatchAircraftPosition,
  type DispatchRouteEndpoint,
} from './DispatchRouteMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';
import { BusyBlock } from './Busy';

/** FBO / Contracts terminal map — base pin, OD route, optional en-route aircraft. */
export function FboRouteMapCard(props: {
  baseIcao: string;
  /** Selected hold/leg origin (usually the FBO hub). */
  originIcao?: string | null;
  /** Selected hold/leg destination — omit/null for base-only. */
  destIcao?: string | null;
  /** Great-circle nm for the selected route, when known. */
  distanceNm?: number | null;
  /** 0…1 along OD when a crew/player leg is airborne. */
  routeProgress?: number | null;
  /** Popup label for the moving aircraft marker. */
  aircraftLabel?: string | null;
  /** Origin marker role. Defaults to FBO when origin is the base. */
  originRole?: 'dep' | 'fbo';
  /** Idle headline when no destination is selected. */
  idleHeadline?: string;
  /** Idle hint under the map when no destination is selected. */
  idleHint?: string;
  /** When false, hide the "Map" heading (route line still shows). */
  showTitle?: boolean;
  onOpenAirport: (icao: string) => void;
}) {
  const baseCode = props.baseIcao.trim().toUpperCase();
  const originCode = (props.originIcao ?? baseCode).trim().toUpperCase();
  const destCode = props.destIcao?.trim().toUpperCase() || null;
  const showRoute = Boolean(destCode && destCode !== originCode);

  const [base, setBase] = useState<DispatchRouteEndpoint | null>(null);
  const [origin, setOrigin] = useState<DispatchRouteEndpoint | null>(null);
  const [dest, setDest] = useState<DispatchRouteEndpoint | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Drop a stale arrival the moment the selected ICAO changes — don't keep
  // drawing KLIT while the header already says SBEG.
  const destMatches =
    Boolean(destCode) && dest?.icao.toUpperCase() === destCode;

  useEffect(() => {
    setDest((cur) => {
      if (!showRoute || !destCode) return null;
      if (cur && cur.icao.toUpperCase() === destCode) return cur;
      return null;
    });
  }, [showRoute, destCode]);

  useEffect(() => {
    let cancelled = false;
    const haveOrigin =
      (origin ?? base)?.icao.toUpperCase() === originCode &&
      base?.icao.toUpperCase() === baseCode;
    // Keep the map mounted when only the destination changes (MapLibre misses
    // `load` after destroy/recreate and the old route looks frozen).
    if (!haveOrigin) {
      setLoading(true);
    }
    void (async () => {
      const codes = new Set<string>([baseCode, originCode]);
      if (showRoute && destCode) codes.add(destCode);
      const resolved = await Promise.all(
        [...codes].map(async (icao) => [icao, await resolveAirportEndpoint(icao)] as const),
      );
      if (cancelled) return;
      const byIcao = new Map(resolved);
      const b = byIcao.get(baseCode) ?? null;
      const o = byIcao.get(originCode) ?? null;
      const d = showRoute && destCode ? (byIcao.get(destCode) ?? null) : null;
      setBase(b);
      setOrigin(o);
      setDest(d);
      const miss: string[] = [];
      if (!b) miss.push(baseCode);
      if (!o) miss.push(originCode);
      if (showRoute && destCode && !d) miss.push(destCode);
      setMissing([...new Set(miss)]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // origin/base snapshots are only for the loading skip.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve on code changes only
  }, [baseCode, originCode, destCode, showRoute]);

  const mapOrigin = origin ?? base;
  const mapDest = showRoute && destMatches ? dest : null;
  const aircraft: DispatchAircraftPosition | null = useMemo(() => {
    if (
      !showRoute ||
      !mapOrigin ||
      !mapDest ||
      props.routeProgress == null ||
      !Number.isFinite(props.routeProgress)
    ) {
      return null;
    }
    return pointOnGreatCircle(
      mapOrigin,
      mapDest,
      Math.max(0, Math.min(1, props.routeProgress)),
    );
  }, [showRoute, mapOrigin, mapDest, props.routeProgress]);

  const distLabel =
    showRoute && props.distanceNm != null && Number.isFinite(props.distanceNm)
      ? ` · ${Math.round(props.distanceNm).toLocaleString()} nm`
      : '';
  const progressLabel =
    aircraft && props.routeProgress != null
      ? ` · ${Math.round(Math.max(0, Math.min(1, props.routeProgress)) * 100)}% outbound`
      : '';
  const headline = showRoute
    ? `${originCode} → ${destCode}${distLabel}${progressLabel}`
    : (props.idleHeadline ?? `${baseCode} · FBO base`);

  return (
    <section className="fbo-route-map-card" aria-label="FBO route map">
      <div className="dispatch-route-map-head">
        {props.showTitle === false ? null : <strong>Map</strong>}
        <small>{headline}</small>
      </div>
      {loading && !mapOrigin ? (
        <BusyBlock label="Loading map" className="dispatch-route-map-empty" />
      ) : mapOrigin ? (
        <DispatchRouteMap
          className="dispatch-route-map fbo-route-map"
          origin={mapOrigin}
          dest={mapDest}
          aircraft={aircraft}
          aircraftLabel={showRoute ? props.aircraftLabel : null}
          originRole={
            props.originRole ??
            (mapOrigin.icao.toUpperCase() === baseCode ? 'fbo' : 'dep')
          }
          onSelectAirport={props.onOpenAirport}
        />
      ) : (
        <p className="dispatch-route-map-empty">
          Map unavailable
          {missing.length ? ` — missing coords for ${missing.join(', ')}` : ''}.
        </p>
      )}
      {!loading && mapOrigin && !showRoute ? (
        <p className="fbo-route-map-hint">
          {props.idleHint ??
            'Select a bonded hold or crew leg below to draw the route.'}
        </p>
      ) : null}
      {showRoute && mapOrigin && !mapDest ? (
        <p className="fbo-route-map-hint">
          {destCode && missing.includes(destCode)
            ? `Missing coords for ${destCode}.`
            : 'Drawing route…'}
        </p>
      ) : null}
      {showRoute && aircraft && props.aircraftLabel ? (
        <p className="fbo-route-map-hint">{props.aircraftLabel}</p>
      ) : null}
    </section>
  );
}
