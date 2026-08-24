import { useEffect, useRef, useState } from 'react';
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

setWorkerUrl(maplibreWorkerUrl);

/** Free public dark style (OpenFreeMap — no API key). Same stack as Network. */
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';

const PORT_ACCENT = '#f0a35a';

/** Generated map pins. Anchor PNG in `public/ports`; WH is SVG so dock/door read at map scale. */
const PORT_ANCHOR_SRC = '/ports/anchor.png';
/** Chunky 20ft-style container — bold ribs + doors so it still reads at ~48px. */
const WAREHOUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 36" fill="none">
  <polygon points="15,31 35,20.5 35,8 15,18.5" fill="#1e6a96"/>
  <polygon points="15,31 19,28.9 19,16.4 15,18.5" fill="#165a82"/>
  <polygon points="23,26.8 27,24.7 27,12.2 23,16.3" fill="#165a82"/>
  <polygon points="31,22.6 35,20.5 35,8 31,10.1" fill="#165a82"/>
  <polygon points="4,33.5 15,31 15,18.5 4,21" fill="#3d9ac8"/>
  <path d="M9.5 32.25 9.5 19.75" stroke="#fff4e8" stroke-width="1.55" stroke-linecap="round"/>
  <path d="M6.4 31.7 6.4 21.3M12.6 30.3 12.6 19.9" stroke="#16384c" stroke-width="1.35" stroke-linecap="round"/>
  <polygon points="4,21 15,18.5 35,8 24,10.5" fill="#8fd0ee"/>
  <path d="M4 33.5 15 31 35 20.5 35 8 24 10.5 4 21Z" stroke="#fff4e8" stroke-width="2" stroke-linejoin="round"/>
</svg>`;
const WAREHOUSE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WAREHOUSE_SVG)}`;

function markerImage(src: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'contain';
  img.style.pointerEvents = 'none';
  img.style.display = 'block';
  return img;
}

function portMarkerElement(selected: boolean): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ports-map-port-marker${selected ? ' is-selected' : ''}`;
  const size = selected ? 34 : 30;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.appendChild(markerImage(PORT_ANCHOR_SRC));
  return el;
}

export type PortsMapPort = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pickupHubDetails: Array<{
    icao: string;
    lat: number;
    lon: number;
    name?: string;
  }>;
};

export type PortsMapFbo = {
  id: string;
  icao: string;
  lat: number;
  lon: number;
  name?: string;
  tier?: number;
};

function hubMarkerElement(highlighted: boolean): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ports-map-hub-marker${highlighted ? ' is-selected' : ''}`;
  const size = highlighted ? 12 : 9;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  return el;
}

function fboMarkerElement(highlighted: boolean): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `ports-map-fbo-marker${highlighted ? ' is-selected' : ''}`;
  const size = highlighted ? 56 : 48;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.appendChild(markerImage(WAREHOUSE_SRC));
  return el;
}

function hasCoords(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  );
}

export function PortsMap(props: {
  ports: PortsMapPort[];
  ownedFbos?: PortsMapFbo[];
  selectedPortId?: string | null;
  /** Hub ICAO to emphasize (warehouse / stock selection). */
  highlightedHubIcao?: string | null;
  /** Bump to re-run camera focus even when selectedPortId is unchanged. */
  focusToken?: number;
  onSelectPort?: (portId: string) => void;
  onSelectHub?: (icao: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectPortRef = useRef(props.onSelectPort);
  const onSelectHubRef = useRef(props.onSelectHub);
  onSelectPortRef.current = props.onSelectPort;
  onSelectHubRef.current = props.onSelectHub;
  /** Bumps when the MapLibre style is ready so markers always (re)paint. */
  const [mapGeneration, setMapGeneration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: OPENFREEMAP_DARK,
      center: [-46.5, -24.5],
      zoom: 5.2,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const onReady = () => {
      setMapGeneration((n) => n + 1);
      map.resize();
    };
    if (map.isStyleLoaded()) onReady();
    else map.once('load', onReady);

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.off('load', onReady);
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      try {
        if (map.getLayer('port-feeder-lines')) map.removeLayer('port-feeder-lines');
        if (map.getSource('port-feeders')) map.removeSource('port-feeders');
      } catch {
        /* map may already be torn down */
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapGeneration < 1) return;
    if (!map.isStyleLoaded()) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    if (props.ports.length === 0) return;

    const bounds = new LngLatBounds();
    let boundCount = 0;
    const extend = (lon: number, lat: number) => {
      bounds.extend([lon, lat]);
      boundCount += 1;
    };

    const selectedId = props.selectedPortId?.toUpperCase() ?? '';
    const highlightHub =
      props.highlightedHubIcao?.trim().toUpperCase() ?? '';
    const ownedList = (props.ownedFbos ?? []).filter((f) =>
      hasCoords(f.lat, f.lon),
    );
    const ownedIcaos = new Set(
      ownedList.map((f) => f.icao.trim().toUpperCase()).filter(Boolean),
    );

    const features: Array<{
      type: 'Feature';
      properties: { portId: string; selected: boolean; highlighted: boolean };
      geometry: {
        type: 'LineString';
        coordinates: [number, number][];
      };
    }> = [];
    const hubSeen = new Set<string>();
    let focusLon: number | null = null;
    let focusLat: number | null = null;

    for (const port of props.ports) {
      if (!hasCoords(port.lat, port.lon)) continue;
      const portSelected = port.id.toUpperCase() === selectedId;

      for (const hub of port.pickupHubDetails ?? []) {
        if (!hasCoords(hub.lat, hub.lon)) continue;
        const hubKey = hub.icao.trim().toUpperCase();
        const hubHighlighted = Boolean(highlightHub && hubKey === highlightHub);
        features.push({
          type: 'Feature',
          properties: {
            portId: port.id,
            selected: portSelected,
            highlighted: hubHighlighted || (portSelected && !highlightHub),
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [port.lon, port.lat],
              [hub.lon, hub.lat],
            ],
          },
        });

        if (hubHighlighted) {
          focusLon = hub.lon;
          focusLat = hub.lat;
          extend(port.lon, port.lat);
          extend(hub.lon, hub.lat);
        }

        if (!hubKey || hubSeen.has(hubKey)) {
          extend(hub.lon, hub.lat);
          continue;
        }
        hubSeen.add(hubKey);

        // Pickup hub (skip muted dot when this ICAO is already an owned warehouse).
        if (!ownedIcaos.has(hubKey)) {
          const el = hubMarkerElement(hubHighlighted);
          el.title = `${hub.icao}${hub.name ? ` ${hub.name}` : ''} · pickup`;
          el.setAttribute('aria-label', `Pickup hub ${hub.icao}`);
          el.addEventListener('click', (event) => {
            event.stopPropagation();
            onSelectHubRef.current?.(hub.icao);
          });
          markersRef.current.push(
            new Marker({ element: el, anchor: 'center' })
              .setLngLat([hub.lon, hub.lat])
              .setPopup(
                new Popup({
                  offset: 10,
                  closeButton: false,
                  className: 'hub-map-popup',
                }).setHTML(
                  `<strong>${hub.icao}${hub.name ? ` ${hub.name}` : ''}</strong><br/>Pickup hub`,
                ),
              )
              .addTo(map),
          );
        }
        extend(hub.lon, hub.lat);
      }
    }

    for (const fbo of ownedList) {
      const icao = fbo.icao.trim().toUpperCase();
      if (!icao) continue;
      const hubHighlighted = Boolean(highlightHub && icao === highlightHub);
      const el = fboMarkerElement(hubHighlighted);
      const label = fbo.name?.trim() || icao;
      el.title = `${label} · your warehouse`;
      el.setAttribute('aria-label', `Your warehouse ${label}`);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectHubRef.current?.(fbo.icao);
      });
      markersRef.current.push(
        new Marker({ element: el, anchor: 'center' })
          .setLngLat([fbo.lon, fbo.lat])
          .setPopup(
            new Popup({
              offset: 20,
              closeButton: false,
              className: 'hub-map-popup',
            }).setHTML(
              `<strong>${label}</strong><br/>Your warehouse${
                fbo.tier != null ? ` · T${fbo.tier}` : ''
              }`,
            ),
          )
          .addTo(map),
      );
      if (hubHighlighted) {
        focusLon = fbo.lon;
        focusLat = fbo.lat;
      }
      extend(fbo.lon, fbo.lat);
    }

    for (const port of props.ports) {
      if (!hasCoords(port.lat, port.lon)) continue;
      const selected = port.id.toUpperCase() === selectedId;
      const el = portMarkerElement(selected);
      el.title = `${port.name} (${port.id})`;
      el.setAttribute('aria-label', `Port ${port.name}`);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectPortRef.current?.(port.id);
      });
      const hubsLabel = (port.pickupHubDetails ?? [])
        .map((h) => h.icao)
        .join(', ');
      markersRef.current.push(
        new Marker({ element: el, anchor: 'center' })
          .setLngLat([port.lon, port.lat])
          .setPopup(
            new Popup({
              offset: 14,
              closeButton: false,
              className: 'hub-map-popup',
            }).setHTML(
              `<strong>${port.name}</strong><br/>${port.id}<br/>Pickup · ${hubsLabel}`,
            ),
          )
          .addTo(map),
      );
      extend(port.lon, port.lat);
    }

    // Feeder lines — never block markers if the style/source rejects the update.
    try {
      const lineData = {
        type: 'FeatureCollection' as const,
        features,
      };
      const source = map.getSource('port-feeders') as
        | { setData: (data: typeof lineData) => void }
        | undefined;
      if (source) {
        source.setData(lineData);
        try {
          map.setPaintProperty('port-feeder-lines', 'line-width', [
            'case',
            ['==', ['get', 'highlighted'], true],
            3,
            ['==', ['get', 'selected'], true],
            2.5,
            1.25,
          ]);
          map.setPaintProperty('port-feeder-lines', 'line-opacity', [
            'case',
            ['==', ['get', 'highlighted'], true],
            0.95,
            ['==', ['get', 'selected'], true],
            0.85,
            0.35,
          ]);
        } catch {
          /* layer may be missing briefly */
        }
      } else {
        map.addSource('port-feeders', { type: 'geojson', data: lineData });
        map.addLayer({
          id: 'port-feeder-lines',
          type: 'line',
          source: 'port-feeders',
          paint: {
            'line-color': PORT_ACCENT,
            'line-width': [
              'case',
              ['==', ['get', 'highlighted'], true],
              3,
              ['==', ['get', 'selected'], true],
              2.5,
              1.25,
            ],
            'line-opacity': [
              'case',
              ['==', ['get', 'highlighted'], true],
              0.95,
              ['==', ['get', 'selected'], true],
              0.85,
              0.35,
            ],
            'line-dasharray': [1.2, 1.6],
          },
        });
      }
    } catch {
      /* keep markers even if lines fail */
    }

    if (boundCount === 0) return;
    try {
      if (focusLon != null && focusLat != null) {
        map.easeTo({
          center: [focusLon, focusLat],
          zoom: 7.4,
          duration: 550,
        });
      } else if (selectedId) {
        // Zoom into the selected port (+ feeders), not fitBounds of the whole catalog
        // (AR/CL/US/BR spans the Americas and felt like a zoom-out on click).
        const selected = props.ports.find(
          (p) => p.id.toUpperCase() === selectedId,
        );
        if (selected && hasCoords(selected.lat, selected.lon)) {
          const selBounds = new LngLatBounds([selected.lon, selected.lat], [
            selected.lon,
            selected.lat,
          ]);
          for (const hub of selected.pickupHubDetails ?? []) {
            if (hasCoords(hub.lat, hub.lon)) {
              selBounds.extend([hub.lon, hub.lat]);
            }
          }
          const ne = selBounds.getNorthEast();
          const sw = selBounds.getSouthWest();
          const tight =
            Math.abs(ne.lng - sw.lng) < 0.02 &&
            Math.abs(ne.lat - sw.lat) < 0.02;
          if (tight) {
            map.easeTo({
              center: [selected.lon, selected.lat],
              zoom: 7.5,
              duration: 550,
            });
          } else {
            map.fitBounds(selBounds, {
              padding: { top: 56, bottom: 56, left: 56, right: 56 },
              maxZoom: 8,
              duration: 550,
            });
          }
        }
      } else if (props.ports.length === 1 && ownedList.length === 0) {
        const only = props.ports[0]!;
        map.easeTo({
          center: [only.lon, only.lat],
          zoom: 7.2,
          duration: 500,
        });
      } else {
        map.fitBounds(bounds, {
          padding: { top: 48, bottom: 48, left: 48, right: 48 },
          maxZoom: 7.5,
          duration: 500,
        });
      }
    } catch {
      /* ignore camera errors */
    }
  }, [
    mapGeneration,
    props.ports,
    props.selectedPortId,
    props.highlightedHubIcao,
    props.focusToken,
    // Stabilize: identity of FBO set, not a fresh [] each parent render.
    (props.ownedFbos ?? []).map((f) => f.id).join(','),
  ]);

  return (
    <div className={props.className ?? 'ports-map'}>
      <div ref={containerRef} className="ports-map-canvas" />
      <ul className="ports-map-legend" aria-label="Map legend">
        <li>
          <span className="dot port">
            <img src={PORT_ANCHOR_SRC} alt="" />
          </span>{' '}
          Seaport
        </li>
        <li>
          <span className="dot hub" /> Pickup hub
        </li>
        <li>
          <span className="dot fbo">
            <img src={WAREHOUSE_SRC} alt="" />
          </span>{' '}
          Your warehouse
        </li>
      </ul>
    </div>
  );
}
