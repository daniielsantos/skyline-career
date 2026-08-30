import { useEffect, useRef } from 'react';
import {
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Vite must bundle the worker (+ shared sibling) — plain auto-detect breaks in optimizeDeps.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

export type HubMapPoint = {
  icao: string;
  name: string;
  region: string;
  hubTier: 'major' | 'regional' | 'spoke';
  lat: number;
  lon: number;
  level?: number;
};

const TIER_STYLE: Record<
  HubMapPoint['hubTier'],
  { size: number; color: string }
> = {
  major: { size: 14, color: '#f0c14b' },
  regional: { size: 11, color: '#c9a227' },
  spoke: { size: 8, color: '#a89060' },
};

/** Free public dark style (OpenFreeMap — no API key). */
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';

function markerElement(
  hub: HubMapPoint,
  isHome: boolean,
  isFocus: boolean,
): HTMLButtonElement {
  const style = TIER_STYLE[hub.hubTier];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = [
    'hub-map-marker',
    isHome ? 'is-home' : '',
    isFocus ? 'is-focus' : '',
  ]
    .filter(Boolean)
    .join(' ');
  el.title = `${hub.icao} ${hub.name}`;
  el.setAttribute('aria-label', `${hub.icao} ${hub.name}`);
  const size = isHome || isFocus ? style.size + 4 : style.size;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  if (isHome) {
    el.style.background = '#ffe08a';
    el.style.boxShadow =
      '0 0 0 2px #fff4c8, 0 0 12px rgba(240,193,75,0.55)';
  } else if (isFocus) {
    el.style.background = style.color;
    el.style.boxShadow =
      '0 0 0 2px #7ec8ff, 0 0 14px rgba(96, 180, 255, 0.55)';
  } else {
    el.style.background = style.color;
    el.style.boxShadow = `0 0 0 1px rgba(0,0,0,0.45), 0 0 8px ${style.color}55`;
  }
  return el;
}

export function HubNetworkMap(props: {
  hubs: HubMapPoint[];
  highlightIcao?: string | null;
  /** Selected hub from the Network find filter — camera flies here. */
  focusIcao?: string | null;
  /** Bump to re-run camera even when focusIcao is unchanged. */
  focusToken?: number;
  onSelectHub?: (icao: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(props.onSelectHub);
  onSelectRef.current = props.onSelectHub;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: OPENFREEMAP_DARK,
      center: [-40, 10],
      zoom: 2.4,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const paint = () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      if (props.hubs.length === 0) return;

      const home = props.highlightIcao?.trim().toUpperCase() ?? '';
      const focus = props.focusIcao?.trim().toUpperCase() ?? '';

      for (const hub of props.hubs) {
        const icao = hub.icao.toUpperCase();
        const el = markerElement(
          hub,
          Boolean(home) && icao === home,
          Boolean(focus) && icao === focus,
        );
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectRef.current?.(hub.icao);
        });
        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([hub.lon, hub.lat])
          .setPopup(
            new Popup({
              offset: 12,
              closeButton: false,
              className: 'hub-map-popup',
            }).setHTML(
              `<strong>${hub.icao} ${hub.name}</strong><br/>${hub.hubTier}${
                hub.region ? ` · ${hub.region}` : ''
              }${hub.level != null ? ` · L${hub.level}` : ''}`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }
    };

    if (map.isStyleLoaded()) paint();
    else map.once('load', paint);
  }, [props.hubs, props.highlightIcao, props.focusIcao]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.hubs.length === 0) return;

    const focusCamera = () => {
      const focus = props.focusIcao?.trim().toUpperCase() ?? '';
      if (focus) {
        const hub = props.hubs.find((h) => h.icao.toUpperCase() === focus);
        if (hub) {
          try {
            map.easeTo({
              center: [hub.lon, hub.lat],
              zoom: 5.5,
              duration: 700,
            });
          } catch {
            /* ignore camera errors */
          }
          return;
        }
      }

      try {
        if (props.hubs.length === 1) {
          map.easeTo({
            center: [props.hubs[0]!.lon, props.hubs[0]!.lat],
            zoom: 5,
            duration: 600,
          });
          return;
        }
        const bounds = new LngLatBounds();
        for (const hub of props.hubs) {
          bounds.extend([hub.lon, hub.lat]);
        }
        map.fitBounds(bounds, { padding: 56, maxZoom: 5, duration: 600 });
      } catch {
        /* ignore camera errors */
      }
    };

    if (map.isStyleLoaded()) focusCamera();
    else map.once('load', focusCamera);
  }, [props.hubs, props.focusIcao, props.focusToken]);

  return (
    <div className={props.className ?? 'hub-network-map'}>
      <div ref={containerRef} className="hub-network-map-canvas" />
      <ul className="hub-network-map-legend" aria-label="Hub tiers">
        <li>
          <span className="dot major" /> Major
        </li>
        <li>
          <span className="dot regional" /> Regional
        </li>
        <li>
          <span className="dot spoke" /> Spoke
        </li>
      </ul>
    </div>
  );
}
