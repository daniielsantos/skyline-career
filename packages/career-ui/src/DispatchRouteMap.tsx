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
  kind: 'dep' | 'arr',
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `dispatch-route-marker dispatch-route-marker-${kind}`;
  const label = kind === 'dep' ? 'DEP' : 'ARR';
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

function aircraftMarkerEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dispatch-route-ac';
  el.title = 'Aircraft';
  el.setAttribute('aria-label', 'Aircraft position');
  el.innerHTML =
    '<span class="dispatch-route-ac-dot" aria-hidden="true"></span>';
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
  dest: DispatchRouteEndpoint,
  waypoints?: DispatchRouteWaypoint[],
): void {
  ensureRouteLayer(map);
  const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
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

export function DispatchRouteMap(props: {
  origin: DispatchRouteEndpoint;
  dest: DispatchRouteEndpoint;
  waypoints?: DispatchRouteWaypoint[];
  /** Live aircraft position from Watch — updated without re-fitting the route. */
  aircraft?: DispatchAircraftPosition | null;
  onSelectAirport?: (icao: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const aircraftMarkerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(props.onSelectAirport);
  onSelectRef.current = props.onSelectAirport;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: OPENFREEMAP_DARK,
      center: [
        (props.origin.lon + props.dest.lon) / 2,
        (props.origin.lat + props.dest.lat) / 2,
      ],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

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
    };
    // Map is created once; route updates happen in the paint effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const paint = () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      setRouteLine(map, props.origin, props.dest, props.waypoints);

      const ends: Array<{ endpoint: DispatchRouteEndpoint; kind: 'dep' | 'arr' }> =
        [
          { endpoint: props.origin, kind: 'dep' },
          { endpoint: props.dest, kind: 'arr' },
        ];
      for (const { endpoint, kind } of ends) {
        const el = endpointMarker(endpoint, kind);
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectRef.current?.(endpoint.icao);
        });
        const marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([endpoint.lon, endpoint.lat])
          .setPopup(
            new Popup({
              offset: 14,
              closeButton: false,
              className: 'dispatch-route-popup',
            }).setHTML(
              `<strong>${kind === 'dep' ? 'Departure' : 'Arrival'}</strong><br/>${endpoint.icao}${
                endpoint.name ? ` · ${endpoint.name}` : ''
              }`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }

      for (const wpt of intermediateWaypoints(
        props.origin,
        props.dest,
        props.waypoints,
      )) {
        const el = waypointMarker(wpt);
        const marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([wpt.lon, wpt.lat])
          .setPopup(
            new Popup({
              offset: 10,
              closeButton: false,
              className: 'dispatch-route-popup',
            }).setHTML(
              `<strong>${wpt.ident}</strong>${
                wpt.type ? `<br/>${wpt.type}` : ''
              }`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }

      const bounds = new LngLatBounds();
      for (const p of buildRouteTrack(
        props.origin,
        props.dest,
        props.waypoints,
      )) {
        bounds.extend([p.lon, p.lat]);
      }
      map.fitBounds(bounds, { padding: 48, maxZoom: 7, duration: 500 });
      map.resize();
    };

    if (map.isStyleLoaded()) paint();
    else map.once('load', paint);
  }, [props.origin, props.dest, props.waypoints]);

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
          }).setHTML('<strong>Aircraft</strong><br/>Live position'),
        )
        .addTo(map);
      aircraftMarkerRef.current = marker;
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);
  }, [props.aircraft]);

  return (
    <div className={props.className ?? 'dispatch-route-map'}>
      <div ref={containerRef} className="dispatch-route-map-canvas" />
    </div>
  );
}
