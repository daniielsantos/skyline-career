import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { fetchSatelliteMapStyle } from './api';

setWorkerUrl(maplibreWorkerUrl);

/** One MapTiler session per page load so pan/zoom share a quota bucket when Cloud honors `mtsid`. */
const MAPTILER_SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `skyline-${Date.now()}`;

type FieldPoint = { lat: number; lon: number };

function usableCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  );
}

function nearField(point: FieldPoint, hub: FieldPoint): boolean {
  return (
    usableCoord(point.lat, point.lon) &&
    Math.abs(point.lat - hub.lat) < 0.25 &&
    Math.abs(point.lon - hub.lon) < 0.25
  );
}

function withMapTilerSession(url: string, apiKey: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('maptiler.com')) return url;
    if (!parsed.searchParams.get('key')) parsed.searchParams.set('key', apiKey);
    parsed.searchParams.set('mtsid', MAPTILER_SESSION_ID);
    return parsed.toString();
  } catch {
    return url;
  }
}

function frameAirport(
  map: Map,
  hub: FieldPoint,
  runways: FieldPoint[],
): void {
  const bounds = new LngLatBounds();
  bounds.extend([hub.lon, hub.lat]);
  let extras = 0;
  for (const runway of runways) {
    if (!nearField(runway, hub)) continue;
    bounds.extend([runway.lon, runway.lat]);
    extras += 1;
  }
  if (extras === 0) {
    map.jumpTo({ center: [hub.lon, hub.lat], zoom: 14.6 });
    return;
  }
  map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 0 });
}

function pinElement(icao: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'airport-sat-map-pin';
  el.title = icao;
  el.setAttribute('aria-label', icao);
  return el;
}

function AirportSatelliteMapCanvas(props: {
  apiKey: string;
  icao: string;
  name: string;
  lat: number;
  lon: number;
  runways: FieldPoint[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const framedKeyRef = useRef<string>('');
  const styleUrl = `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(props.apiKey)}`;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: withMapTilerSession(styleUrl, props.apiKey),
      center: [props.lon, props.lat],
      zoom: 14.6,
      maxZoom: 18,
      attributionControl: false,
      transformRequest: (url) => ({
        url: withMapTilerSession(url, props.apiKey),
      }),
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const resize = () => map.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);
    map.once('load', resize);

    return () => {
      ro.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      framedKeyRef.current = '';
    };
  }, [props.apiKey, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const paint = () => {
      const lngLat: [number, number] = [props.lon, props.lat];
      const html = `<strong>${props.icao}</strong>${
        props.name ? `<br/>${props.name}` : ''
      }`;
      if (markerRef.current) {
        const el = markerRef.current.getElement();
        el.title = props.icao;
        el.setAttribute('aria-label', props.icao);
        markerRef.current.setLngLat(lngLat);
        markerRef.current.setPopup(
          new Popup({
            offset: 12,
            closeButton: false,
            className: 'hub-map-popup',
          }).setHTML(html),
        );
      } else {
        markerRef.current = new Marker({
          element: pinElement(props.icao),
          anchor: 'center',
        })
          .setLngLat(lngLat)
          .setPopup(
            new Popup({
              offset: 12,
              closeButton: false,
              className: 'hub-map-popup',
            }).setHTML(html),
          )
          .addTo(map);
      }

      const frameKey = `${props.icao}:${props.lat.toFixed(5)}:${props.lon.toFixed(5)}:${props.runways.length}`;
      if (framedKeyRef.current !== frameKey) {
        framedKeyRef.current = frameKey;
        frameAirport(map, { lat: props.lat, lon: props.lon }, props.runways);
      }
      map.resize();
    };

    if (map.isStyleLoaded()) paint();
    else map.once('load', paint);
    return () => {
      map.off('load', paint);
    };
  }, [props.apiKey, props.icao, props.name, props.lat, props.lon, props.runways]);

  return (
    <div className="airport-sat-map">
      <div ref={containerRef} className="airport-sat-map-canvas" />
    </div>
  );
}

class SatelliteMapErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown map error';
    return { message };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="airport-sat-map-card">
          <p className="muted">Satellite map failed to load. The rest of Career should still work.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AirportSatelliteMap(props: {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  runways: FieldPoint[];
}) {
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = 0;
    const load = () =>
      fetchSatelliteMapStyle()
        .then((result) => {
          if (cancelled) return true;
          setFetchFailed(false);
          const key = result.apiKey?.trim() || null;
          setApiKey(key);
          return Boolean(key);
        })
        .catch(() => {
          if (!cancelled) {
            setFetchFailed(true);
            setApiKey(null);
          }
          return false;
        });

    void load().then((ok) => {
      if (ok || cancelled) return;
      retryTimer = window.setTimeout(() => {
        if (!cancelled) void load();
      }, 800);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, []);

  if (apiKey === undefined) {
    return (
      <div className="airport-sat-map-card">
        <p className="muted">Loading satellite map…</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="airport-sat-map-card">
        <p className="muted">
          {fetchFailed
            ? 'Could not reach Career API for the satellite style. Is it running on :8787?'
            : 'Career API has no MAPTILER_KEY yet. Save .env and restart the API, then hard-refresh this page (Ctrl+Shift+R).'}
        </p>
      </div>
    );
  }

  return (
    <SatelliteMapErrorBoundary>
      <div className="airport-sat-map-card">
        <AirportSatelliteMapCanvas
          apiKey={apiKey}
          icao={props.icao}
          name={props.name}
          lat={props.lat}
          lon={props.lon}
          runways={props.runways}
        />
      </div>
    </SatelliteMapErrorBoundary>
  );
}
