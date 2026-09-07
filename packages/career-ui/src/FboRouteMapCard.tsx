import { useEffect, useMemo, useState } from 'react';
import {
  DispatchRouteMap,
  pointOnGreatCircle,
  type DispatchAircraftPosition,
  type DispatchRouteEndpoint,
  type DispatchRouteSegment,
  type DispatchRouteWaypoint,
} from './DispatchRouteMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';
import { BusyBlock } from './Busy';

function normalizeIcaoList(codes: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes ?? []) {
    const icao = raw.trim().toUpperCase();
    if (!icao || seen.has(icao)) continue;
    seen.add(icao);
    out.push(icao);
  }
  return out;
}

/** Ordered ICAO stops including ferry hops between lots. */
export function tourMapStops(
  legs: Array<{ originIcao: string; destIcao: string }>,
): string[] {
  const stops: string[] = [];
  for (const leg of legs) {
    const origin = leg.originIcao.trim().toUpperCase();
    const dest = leg.destIcao.trim().toUpperCase();
    if (!origin || !dest) continue;
    if (stops.length === 0 || stops[stops.length - 1] !== origin) {
      stops.push(origin);
    }
    if (stops[stops.length - 1] !== dest) {
      stops.push(dest);
    }
  }
  return stops;
}

/** Cargo-only label (first origin + each dest — hides ferry hops). */
export function tourCargoRouteLabel(
  legs: Array<{ originIcao: string; destIcao: string }>,
): string {
  if (!legs.length) return '';
  const parts = [legs[0]!.originIcao.trim().toUpperCase()];
  for (const leg of legs) {
    const dest = leg.destIcao.trim().toUpperCase();
    if (dest && parts[parts.length - 1] !== dest) parts.push(dest);
  }
  return parts.join(' → ');
}

/** FBO / Contracts terminal map — base pin, OD route, optional en-route aircraft. */
export function FboRouteMapCard(props: {
  baseIcao: string;
  /** Selected hold/leg origin (usually the FBO hub). */
  originIcao?: string | null;
  /** Selected hold/leg destination — omit/null for base-only. */
  destIcao?: string | null;
  /**
   * Intermediate airports on a continuous multi-stop path (between origin and dest).
   * Prefer `tourLegs` for dispatcher tours (cargo + ferry segments).
   */
  viaIcaos?: string[] | null;
  /**
   * Multi-leg Market tour — draws each cargo OD solid and ferry gaps dashed.
   */
  tourLegs?: Array<{ originIcao: string; destIcao: string }> | null;
  /** Great-circle nm for the selected route, when known. */
  distanceNm?: number | null;
  /** Ferry nm total (tour) — shown in headline when &gt; 0.5. */
  ferryNm?: number | null;
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
  /** Override route headline (e.g. full tour SBSP→SBCT→SBFL). */
  routeHeadline?: string | null;
  /** When false, hide the "Map" heading (route line still shows). */
  showTitle?: boolean;
  onOpenAirport: (icao: string) => void;
}) {
  const baseCode = props.baseIcao.trim().toUpperCase();
  const tourLegs = props.tourLegs ?? null;
  const tourKey = (tourLegs ?? [])
    .map((l) => `${l.originIcao}>${l.destIcao}`)
    .join('|');

  const originCode = (
    tourLegs?.[0]?.originIcao ??
    props.originIcao ??
    baseCode
  )
    .trim()
    .toUpperCase();
  const destCode = (() => {
    if (tourLegs?.length) {
      return tourLegs[tourLegs.length - 1]!.destIcao.trim().toUpperCase() || null;
    }
    return props.destIcao?.trim().toUpperCase() || null;
  })();

  const viaCodes = useMemo(() => {
    if (tourLegs?.length || !destCode) return [] as string[];
    return normalizeIcaoList(props.viaIcaos).filter(
      (icao) => icao !== originCode && icao !== destCode,
    );
  }, [props.viaIcaos, originCode, destCode, tourLegs]);
  const viaKey = viaCodes.join('|');
  const showRoute = Boolean(
    (tourLegs && tourLegs.length > 0) || (destCode && destCode !== originCode),
  );

  const [base, setBase] = useState<DispatchRouteEndpoint | null>(null);
  const [origin, setOrigin] = useState<DispatchRouteEndpoint | null>(null);
  const [dest, setDest] = useState<DispatchRouteEndpoint | null>(null);
  const [vias, setVias] = useState<DispatchRouteWaypoint[]>([]);
  const [segments, setSegments] = useState<DispatchRouteSegment[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!haveOrigin) {
      setLoading(true);
    }
    void (async () => {
      const codes = new Set<string>([baseCode, originCode]);
      if (destCode) codes.add(destCode);
      for (const via of viaCodes) codes.add(via);
      if (tourLegs) {
        for (const leg of tourLegs) {
          codes.add(leg.originIcao.trim().toUpperCase());
          codes.add(leg.destIcao.trim().toUpperCase());
        }
      }
      const resolved = await Promise.all(
        [...codes].map(
          async (icao) => [icao, await resolveAirportEndpoint(icao)] as const,
        ),
      );
      if (cancelled) return;
      const byIcao = new Map(resolved);
      const b = byIcao.get(baseCode) ?? null;
      const o = byIcao.get(originCode) ?? null;
      const d = destCode ? (byIcao.get(destCode) ?? null) : null;
      const viaPts: DispatchRouteWaypoint[] = [];
      for (const icao of viaCodes) {
        const ep = byIcao.get(icao);
        if (!ep) continue;
        viaPts.push({
          ident: ep.icao,
          lat: ep.lat,
          lon: ep.lon,
          type: 'airport',
        });
      }

      let nextSegments: DispatchRouteSegment[] | null = null;
      if (tourLegs?.length) {
        nextSegments = [];
        for (let i = 0; i < tourLegs.length; i++) {
          const leg = tourLegs[i]!;
          const fromIcao = leg.originIcao.trim().toUpperCase();
          const toIcao = leg.destIcao.trim().toUpperCase();
          const from = byIcao.get(fromIcao);
          const to = byIcao.get(toIcao);
          if (i > 0) {
            const prevToIcao = tourLegs[i - 1]!.destIcao.trim().toUpperCase();
            if (prevToIcao !== fromIcao) {
              const ferryFrom = byIcao.get(prevToIcao);
              if (ferryFrom && from) {
                nextSegments.push({
                  from: ferryFrom,
                  to: from,
                  kind: 'ferry',
                });
              }
            }
          }
          if (from && to && fromIcao !== toIcao) {
            nextSegments.push({ from, to, kind: 'cargo' });
          }
        }
        if (nextSegments.length === 0) nextSegments = null;
      }

      setBase(b);
      setOrigin(o);
      setDest(d);
      setVias(viaPts);
      setSegments(nextSegments);
      const miss: string[] = [];
      if (!b) miss.push(baseCode);
      if (!o) miss.push(originCode);
      if (destCode && !d) miss.push(destCode);
      for (const icao of viaCodes) {
        if (!byIcao.get(icao)) miss.push(icao);
      }
      if (tourLegs) {
        for (const leg of tourLegs) {
          const a = leg.originIcao.trim().toUpperCase();
          const c = leg.destIcao.trim().toUpperCase();
          if (!byIcao.get(a)) miss.push(a);
          if (!byIcao.get(c)) miss.push(c);
        }
      }
      setMissing([...new Set(miss)]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve on code changes only
  }, [baseCode, originCode, destCode, showRoute, viaKey, tourKey]);

  const mapOrigin = origin ?? base;
  const mapDest = showRoute && destMatches ? dest : null;
  const mapWaypoints =
    showRoute && mapDest && !segments ? vias : undefined;
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
  const ferryLabel =
    showRoute &&
    props.ferryNm != null &&
    Number.isFinite(props.ferryNm) &&
    props.ferryNm > 0.5
      ? ` · ferry ${Math.round(props.ferryNm)} nm`
      : '';
  const progressLabel =
    aircraft && props.routeProgress != null
      ? ` · ${Math.round(Math.max(0, Math.min(1, props.routeProgress)) * 100)}% outbound`
      : '';
  const cargoLabel = tourLegs?.length
    ? tourMapStops(tourLegs).join(' → ')
    : showRoute && viaCodes.length > 0
      ? [originCode, ...viaCodes, destCode].join(' → ')
      : showRoute
        ? `${originCode} → ${destCode}`
        : null;
  const headline = showRoute
    ? `${props.routeHeadline?.trim() || cargoLabel}${distLabel}${ferryLabel}${progressLabel}`
    : (props.idleHeadline ?? `${baseCode} · company base`);

  return (
    <section className="fbo-route-map-card" aria-label="Company base route map">
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
          waypoints={mapWaypoints}
          segments={segments ?? undefined}
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
      {showRoute && mapOrigin && !mapDest && !segments ? (
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
