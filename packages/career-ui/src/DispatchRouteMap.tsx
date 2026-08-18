import { useEffect, useRef } from 'react';
import {
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Vite must bundle the worker (+ shared sibling) — plain auto-detect breaks in optimizeDeps.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

/** Free public dark style (OpenFreeMap — no API key). Same stack as Network. */
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const ROUTE_SOURCE_ID = 'dispatch-route';
const ROUTE_LAYER_ID = 'dispatch-route-line';

export type DispatchRouteEndpoint = {
  icao: string;
  lat: number;
  lon: number;
  name?: string;
};

export type DispatchRouteWaypoint = {
  ident: string;
  lat: number;
  lon: number;
  type?: string;
};

export type DispatchAircraftPosition = {
  lat: number;
  lon: number;
};

type LatLon = { lat: number; lon: number };

function usableAircraftPosition(
  pos: DispatchAircraftPosition | null | undefined,
): pos is DispatchAircraftPosition {
  return (
    !!pos &&
    Number.isFinite(pos.lat) &&
    Number.isFinite(pos.lon) &&
    !(pos.lat === 0 && pos.lon === 0)
  );
}

function toCartesian(lat: number, lon: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return [
    Math.cos(phi) * Math.cos(lambda),
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi),
  ];
}

function fromCartesian(x: number, y: number, z: number): [number, number] {
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  const hyp = Math.sqrt(x * x + y * y);
  const lat = (Math.atan2(z, hyp) * 180) / Math.PI;
  return [lon, lat];
}

/** Densified great-circle as GeoJSON [lon, lat] positions. */
export function greatCircleLine(
  a: LatLon,
  b: LatLon,
  steps = 48,
): [number, number][] {
  const A = toCartesian(a.lat, a.lon);
  const B = toCartesian(b.lat, b.lon);
  const dot = Math.max(
    -1,
    Math.min(1, A[0]! * B[0]! + A[1]! * B[1]! + A[2]! * B[2]!),
  );
  const omega = Math.acos(dot);
  if (!(omega > 1e-9)) {
    return [
      [a.lon, a.lat],
      [b.lon, b.lat],
    ];
  }
  const sinOmega = Math.sin(omega);
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;
    coords.push(
      fromCartesian(
        s0 * A[0]! + s1 * B[0]!,
        s0 * A[1]! + s1 * B[1]!,
        s0 * A[2]! + s1 * B[2]!,
      ),
    );
  }
  return coords;
}

/** Point at fraction `t` (0…1) along the great-circle from a → b. */
export function pointOnGreatCircle(
  a: LatLon,
  b: LatLon,
  t: number,
): { lat: number; lon: number } {
  const u = Math.max(0, Math.min(1, t));
  const A = toCartesian(a.lat, a.lon);
  const B = toCartesian(b.lat, b.lon);
  const dot = Math.max(
    -1,
    Math.min(1, A[0]! * B[0]! + A[1]! * B[1]! + A[2]! * B[2]!),
  );
  const omega = Math.acos(dot);
  if (!(omega > 1e-9)) {
    return { lat: a.lat, lon: a.lon };
  }
  const sinOmega = Math.sin(omega);
  const s0 = Math.sin((1 - u) * omega) / sinOmega;
  const s1 = Math.sin(u * omega) / sinOmega;
  const [lon, lat] = fromCartesian(
    s0 * A[0]! + s1 * B[0]!,
    s0 * A[1]! + s1 * B[1]!,
    s0 * A[2]! + s1 * B[2]!,
  );
  return { lat, lon };
}

function near(a: LatLon, b: LatLon, tolDeg = 0.05): boolean {
  return Math.abs(a.lat - b.lat) < tolDeg && Math.abs(a.lon - b.lon) < tolDeg;
}

/** Ordered path: navlog when present, else OD great-circle bookends. */
export function buildRouteTrack(
  origin: LatLon,
  dest: LatLon,
  waypoints?: DispatchRouteWaypoint[],
): LatLon[] {
  if (!waypoints?.length) return [origin, dest];
  const pts: LatLon[] = waypoints.map((w) => ({ lat: w.lat, lon: w.lon }));
  if (!near(pts[0]!, origin)) pts.unshift(origin);
  if (!near(pts[pts.length - 1]!, dest)) pts.push(dest);
  return pts;
}

export function routeLineCoordinates(
  origin: LatLon,
  dest: LatLon,
  waypoints?: DispatchRouteWaypoint[],
): [number, number][] {
  const points = buildRouteTrack(origin, dest, waypoints);
  if (points.length < 2) {
    return [
      [origin.lon, origin.lat],
      [dest.lon, dest.lat],
    ];
  }
  const coords: [number, number][] = [];
  const stepsPerLeg = Math.max(4, Math.round(48 / Math.max(1, points.length - 1)));
  for (let i = 0; i < points.length - 1; i++) {
    const seg = greatCircleLine(points[i]!, points[i + 1]!, stepsPerLeg);
    if (i > 0) seg.shift();
    coords.push(...seg);
  }
  return coords;
}

function endpointMarker(
  endpoint: DispatchRouteEndpoint,
  kind: 'dep' | 'arr' | 'fbo',
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `dispatch-route-marker dispatch-route-marker-${kind}`;
  const label = kind === 'dep' ? 'DEP' : kind === 'arr' ? 'ARR' : 'FBO';
  el.title = `${label} ${endpoint.icao}${endpoint.name ? ` · ${endpoint.name}` : ''}`;
  el.setAttribute(
    'aria-label',
    `${label} ${endpoint.icao}${endpoint.name ? ` ${endpoint.name}` : ''}`,
  );
  el.innerHTML = `<span class="dispatch-route-marker-icao">${endpoint.icao}</span><span class="dispatch-route-marker-kind">${label}</span>`;
  return el;
}

function waypointMarker(waypoint: DispatchRouteWaypoint): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'dispatch-route-wpt';
  el.title = waypoint.type
    ? `${waypoint.ident} (${waypoint.type})`
    : waypoint.ident;
  el.setAttribute('aria-label', `Waypoint ${waypoint.ident}`);
  el.textContent = waypoint.ident;
  return el;
}

/** Intermediate career hub on a multi-leg route (between DEP and ARR). */
function hubRouteMarker(waypoint: DispatchRouteWaypoint): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'dispatch-route-marker dispatch-route-marker-hub';
  el.title = `HUB ${waypoint.ident}`;
  el.setAttribute('aria-label', `Hub ${waypoint.ident}`);
  el.innerHTML = `<span class="dispatch-route-marker-icao">${waypoint.ident}</span><span class="dispatch-route-marker-kind">HUB</span>`;
  return el;
}

function isAirportWaypoint(waypoint: DispatchRouteWaypoint): boolean {
  return String(waypoint.type ?? '').toLowerCase() === 'airport';
}

function aircraftMarkerEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dispatch-route-ac';
  el.title = 'Aircraft';
  el.setAttribute('aria-label', 'Aircraft position');
  el.innerHTML =
    '<span class="dispatch-route-ac-dot" aria-hidden="true"></span><span class="dispatch-route-ac-label">AC</span>';
  return el;
}

function ensureRouteLayer(map: Map): void {
  if (map.getSource(ROUTE_SOURCE_ID)) return;
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] },
    },
  });
  map.addLayer({
    id: ROUTE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#6ea8fe',
      'line-width': 2.5,
      'line-opacity': 0.9,
    },
  });
}

function setRouteLine(
  map: Map,
  origin: DispatchRouteEndpoint,
  dest: DispatchRouteEndpoint | null | undefined,
  waypoints?: DispatchRouteWaypoint[],
): void {
  ensureRouteLayer(map);
  const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  if (!dest) {
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] },
    });
    return;
  }
  source.setData({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: routeLineCoordinates(origin, dest, waypoints),
    },
  });
}

function intermediateWaypoints(
  origin: DispatchRouteEndpoint,
  dest: DispatchRouteEndpoint,
  waypoints?: DispatchRouteWaypoint[],
): DispatchRouteWaypoint[] {
  if (!waypoints?.length) return [];
  const originId = origin.icao.toUpperCase();
  const destId = dest.icao.toUpperCase();
  return waypoints.filter((w) => {
    const id = w.ident.toUpperCase();
    if (id === originId || id === destId) return false;
    if (near(w, origin) || near(w, dest)) return false;
    return true;
  });
}

function routeCameraKey(
  origin: DispatchRouteEndpoint,
  dest: DispatchRouteEndpoint | null | undefined,
  waypoints: DispatchRouteWaypoint[] | undefined,
  originRole: string | undefined,
): string {
  const w = (waypoints ?? [])
    .map((p) => `${p.ident}:${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)
    .join('|');
  const d = dest
    ? `${dest.icao}:${dest.lat.toFixed(4)},${dest.lon.toFixed(4)}`
    : '';
  return `${originRole ?? 'dep'}|${origin.icao}:${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}|${d}|${w}`;
}

export function DispatchRouteMap(props: {
  origin: DispatchRouteEndpoint;
  /** When omitted, only the origin/base pin is shown (no route line). */
  dest?: DispatchRouteEndpoint | null;
  waypoints?: DispatchRouteWaypoint[];
  /** Live aircraft position from Watch — updated without re-fitting the route. */
  aircraft?: DispatchAircraftPosition | null;
  /** Popup title for the aircraft marker. */
  aircraftLabel?: string | null;
  /** Origin marker role — FBO base vs departure. */
  originRole?: 'dep' | 'fbo';
  /**
   * Fly the camera to this point (e.g. hub rail click). Change identity
   * (new object / token) to re-trigger when focusing the same coords again.
   */
  focusTarget?: {
    lat: number;
    lon: number;
    zoom?: number;
    token?: number | string;
  } | null;
  onSelectAirport?: (icao: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const aircraftMarkerRef = useRef<Marker | null>(null);
  const fittedRouteKeyRef = useRef<string | null>(null);
  const onSelectRef = useRef(props.onSelectAirport);
  onSelectRef.current = props.onSelectAirport;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: OPENFREEMAP_DARK,
      center: [props.origin.lon, props.origin.lat],
      zoom: 5,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    fittedRouteKeyRef.current = null;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.resize();
          })
        : null;
    resizeObserver?.observe(containerRef.current);

    return () => {
      resizeObserver?.disconnect();
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      aircraftMarkerRef.current?.remove();
      aircraftMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      fittedRouteKeyRef.current = null;
    };
    // Map is created once; route updates happen in the paint effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    const paint = () => {
      if (cancelled) return;
      try {
        for (const marker of markersRef.current) marker.remove();
        markersRef.current = [];

        const dest = props.dest ?? null;
        setRouteLine(map, props.origin, dest, props.waypoints);

        // Route gone → drop aircraft; live effect will recreate if needed.
        if (!dest) {
          aircraftMarkerRef.current?.remove();
          aircraftMarkerRef.current = null;
        }

        const originKind = props.originRole ?? 'dep';
        const ends: Array<{
          endpoint: DispatchRouteEndpoint;
          kind: 'dep' | 'arr' | 'fbo';
        }> = [{ endpoint: props.origin, kind: originKind }];
        if (dest) {
          ends.push({ endpoint: dest, kind: 'arr' });
        }

        for (const { endpoint, kind } of ends) {
          const el = endpointMarker(endpoint, kind);
          el.addEventListener('click', (event) => {
            event.stopPropagation();
            onSelectRef.current?.(endpoint.icao);
          });
          const title =
            kind === 'dep'
              ? 'Departure'
              : kind === 'arr'
                ? 'Arrival'
                : 'FBO base';
          const marker = new Marker({ element: el, anchor: 'bottom' })
            .setLngLat([endpoint.lon, endpoint.lat])
            .setPopup(
              new Popup({
                offset: 14,
                closeButton: false,
                className: 'dispatch-route-popup',
              }).setHTML(
                `<strong>${title}</strong><br/>${endpoint.icao}${
                  endpoint.name ? ` · ${endpoint.name}` : ''
                }`,
              ),
            )
            .addTo(map);
          markersRef.current.push(marker);
        }

        if (dest) {
          for (const wpt of intermediateWaypoints(
            props.origin,
            dest,
            props.waypoints,
          )) {
            const isHub = isAirportWaypoint(wpt);
            const el = isHub ? hubRouteMarker(wpt) : waypointMarker(wpt);
            if (isHub) {
              el.addEventListener('click', (event) => {
                event.stopPropagation();
                onSelectRef.current?.(wpt.ident);
              });
            }
            const marker = new Marker({ element: el, anchor: 'bottom' })
              .setLngLat([wpt.lon, wpt.lat])
              .setPopup(
                new Popup({
                  offset: isHub ? 14 : 10,
                  closeButton: false,
                  className: 'dispatch-route-popup',
                }).setHTML(
                  isHub
                    ? `<strong>Hub</strong><br/>${wpt.ident}`
                    : `<strong>${wpt.ident}</strong>${
                        wpt.type ? `<br/>${wpt.type}` : ''
                      }`,
                ),
              )
              .addTo(map);
            markersRef.current.push(marker);
          }
        }

        // Only auto-frame when the route geometry actually changes. Polling /
        // parent re-renders were re-fitting and yanking the camera off the
        // user's pan/zoom.
        const cameraKey = routeCameraKey(
          props.origin,
          dest,
          props.waypoints,
          props.originRole,
        );
        if (fittedRouteKeyRef.current !== cameraKey) {
          fittedRouteKeyRef.current = cameraKey;
          if (dest) {
            const bounds = new LngLatBounds();
            for (const p of buildRouteTrack(
              props.origin,
              dest,
              props.waypoints,
            )) {
              bounds.extend([p.lon, p.lat]);
            }
            map.fitBounds(bounds, { padding: 48, maxZoom: 7, duration: 500 });
          } else {
            map.flyTo({
              center: [props.origin.lon, props.origin.lat],
              zoom: 5.5,
              duration: 500,
            });
          }
        }
        map.resize();
      } catch {
        // Style/source not ready yet — load/idle below retries.
      }
    };

    paint();
    if (!map.isStyleLoaded()) {
      map.once('load', paint);
      map.once('idle', paint);
    }
    return () => {
      cancelled = true;
      map.off('load', paint);
      map.off('idle', paint);
    };
  }, [props.origin, props.dest, props.waypoints, props.originRole]);

  // Live aircraft — move marker only; do not refit route bounds each tick.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sync = () => {
      if (!usableAircraftPosition(props.aircraft)) {
        aircraftMarkerRef.current?.remove();
        aircraftMarkerRef.current = null;
        return;
      }
      const lngLat: [number, number] = [props.aircraft.lon, props.aircraft.lat];
      if (aircraftMarkerRef.current) {
        aircraftMarkerRef.current.setLngLat(lngLat);
        return;
      }
      const title = props.aircraftLabel?.trim() || 'Aircraft';
      const marker = new Marker({
        element: aircraftMarkerEl(),
        anchor: 'center',
      })
        .setLngLat(lngLat)
        .setPopup(
          new Popup({
            offset: 12,
            closeButton: false,
            className: 'dispatch-route-popup',
          }).setHTML(
            `<strong>${title}</strong><br/>${
              props.aircraftLabel?.trim() ? 'En route' : 'Live position'
            }`,
          ),
        )
        .addTo(map);
      aircraftMarkerRef.current = marker;
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);
  }, [props.aircraft, props.aircraftLabel]);

  // Hub rail / marker focus — fly without rebuilding the route.
  useEffect(() => {
    const map = mapRef.current;
    const target = props.focusTarget;
    if (!map || !target) return;
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon)) return;
    if (target.lat === 0 && target.lon === 0) return;
    const zoom =
      typeof target.zoom === 'number' && Number.isFinite(target.zoom)
        ? target.zoom
        : 8.5;
    const fly = () => {
      map.flyTo({
        center: [target.lon, target.lat],
        zoom,
        duration: 700,
      });
    };
    if (map.isStyleLoaded()) fly();
    else map.once('load', fly);
  }, [props.focusTarget]);

  return (
    <div className={props.className ?? 'dispatch-route-map'}>
      <div ref={containerRef} className="dispatch-route-map-canvas" />
    </div>
  );
}
