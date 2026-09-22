import { useEffect, useRef, useState } from 'react';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { CompanyNetworkNode } from './company-network';
import { companyNetworkMarkerElement } from './company-network-icons';

setWorkerUrl(maplibreWorkerUrl);

const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const FEEDER_ACCENT = '#f0a35a';

function hasCoords(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  );
}

function safeResize(map: MapLibreMap | null) {
  if (!map) return;
  try {
    map.resize();
  } catch {
    /* map torn down mid-resize */
  }
}

type Props = {
  nodes: CompanyNetworkNode[];
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  className?: string;
};

/**
 * Company network map — one pin per node (FBO at port, WH at hub ICAO).
 * Uses the same glyphs as the network chips.
 */
export function CompanyNetworkMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const aliveRef = useRef(true);
  const markersRef = useRef<Marker[]>([]);
  const fittedForRef = useRef('');
  const onSelectRef = useRef(props.onSelectNode);
  onSelectRef.current = props.onSelectNode;
  const [mapGeneration, setMapGeneration] = useState(0);

  useEffect(() => {
    aliveRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    let map: MapLibreMap | null = null;
    let ro: ResizeObserver | null = null;
    let onReady: (() => void) | null = null;

    const attachMap = () => {
      if (!aliveRef.current || mapRef.current || !container.isConnected) return;
      if (container.clientWidth < 2 || container.clientHeight < 2) {
        requestAnimationFrame(attachMap);
        return;
      }
      try {
        map = new MapLibreMap({
          container,
          style: OPENFREEMAP_DARK,
          center: [-46.5, -24.5],
          zoom: 5.2,
          attributionControl: false,
        });
      } catch {
        return;
      }
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;

      onReady = () => {
        if (!aliveRef.current || mapRef.current !== map) return;
        setMapGeneration((n) => n + 1);
        safeResize(map);
      };
      if (map.isStyleLoaded()) onReady();
      else map.once('load', onReady);

      ro = new ResizeObserver(() => safeResize(mapRef.current));
      ro.observe(container);
    };

    requestAnimationFrame(attachMap);

    return () => {
      aliveRef.current = false;
      ro?.disconnect();
      if (map && onReady) {
        try {
          map.off('load', onReady);
        } catch {
          /* ignore */
        }
      }
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      const active = mapRef.current;
      mapRef.current = null;
      if (active) {
        try {
          if (active.getLayer('company-network-feeders')) {
            active.removeLayer('company-network-feeders');
          }
          if (active.getSource('company-network-feeders')) {
            active.removeSource('company-network-feeders');
          }
        } catch {
          /* torn down */
        }
        try {
          active.remove();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapGeneration < 1 || !aliveRef.current) return;
    if (!map.isStyleLoaded()) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    const plotNodes = props.nodes.filter((n) => hasCoords(n.lat, n.lon));
    if (plotNodes.length === 0) return;

    // Must be the JS Map — never shadow with maplibre's `Map` import.
    const fboByPort = new globalThis.Map<string, CompanyNetworkNode>();
    for (const n of plotNodes) {
      if (n.kind === 'fbo' && n.portId) {
        fboByPort.set(n.portId.toUpperCase(), n);
      }
    }

    const feederFeatures: Array<{
      type: 'Feature';
      properties: { highlighted: boolean };
      geometry: {
        type: 'LineString';
        coordinates: [number, number][];
      };
    }> = [];

    for (const wh of plotNodes) {
      if (wh.kind !== 'wh' || !wh.portId) continue;
      const fbo = fboByPort.get(wh.portId.toUpperCase());
      if (!fbo || !hasCoords(fbo.lat, fbo.lon)) continue;
      const highlighted =
        props.selectedId === wh.id || props.selectedId === fbo.id;
      feederFeatures.push({
        type: 'Feature',
        properties: { highlighted },
        geometry: {
          type: 'LineString',
          coordinates: [
            [fbo.lon, fbo.lat],
            [wh.lon, wh.lat],
          ],
        },
      });
    }

    try {
      if (map.getLayer('company-network-feeders')) {
        map.removeLayer('company-network-feeders');
      }
      if (map.getSource('company-network-feeders')) {
        map.removeSource('company-network-feeders');
      }
    } catch {
      /* ok */
    }

    if (feederFeatures.length > 0) {
      try {
        map.addSource('company-network-feeders', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: feederFeatures },
        });
        map.addLayer({
          id: 'company-network-feeders',
          type: 'line',
          source: 'company-network-feeders',
          paint: {
            'line-color': FEEDER_ACCENT,
            'line-width': ['case', ['get', 'highlighted'], 2.5, 1.2],
            'line-opacity': ['case', ['get', 'highlighted'], 0.85, 0.45],
            'line-dasharray': [2, 2],
          },
        });
      } catch {
        /* style not ready / map removed */
      }
    }

    const selectedId = props.selectedId;
    const nodeKey = plotNodes.map((n) => n.id).join('|');

    for (const node of plotNodes) {
      const selected = selectedId === node.id;
      const el = companyNetworkMarkerElement(node.kind, selected);
      const label =
        node.kind === 'fbo'
          ? node.title
          : `${node.primaryHubIcao} · Warehouse`;
      el.title = label;
      el.setAttribute('aria-label', label);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectRef.current(node.id);
      });

      try {
        markersRef.current.push(
          new Marker({ element: el, anchor: 'center' })
            .setLngLat([node.lon, node.lat])
            .setPopup(
              new Popup({
                offset: 14,
                closeButton: false,
                className: 'hub-map-popup',
              }).setHTML(
                `<strong>${label}</strong><br/>${
                  node.kind === 'fbo' ? 'Port FBO' : 'Company warehouse'
                }`,
              ),
            )
            .addTo(map),
        );
      } catch {
        continue;
      }
    }

    // Focus camera on the selected node (zoom in). All / no selection → whole network.
    let focusNodes: CompanyNetworkNode[] = plotNodes;
    if (selectedId) {
      const selected = plotNodes.find((n) => n.id === selectedId);
      if (selected) {
        if (selected.kind === 'fbo' && selected.portId) {
          const port = selected.portId.toUpperCase();
          focusNodes = plotNodes.filter(
            (n) =>
              n.id === selected.id ||
              (n.kind === 'wh' && n.portId?.toUpperCase() === port),
          );
        } else if (selected.kind === 'wh' && selected.portId) {
          const fbo = fboByPort.get(selected.portId.toUpperCase());
          focusNodes =
            fbo && hasCoords(fbo.lat, fbo.lon) ? [selected, fbo] : [selected];
        } else {
          focusNodes = [selected];
        }
      }
    }

    const focusBounds = new LngLatBounds();
    let focusCount = 0;
    for (const n of focusNodes) {
      focusBounds.extend([n.lon, n.lat]);
      focusCount += 1;
    }

    const cameraKey = `${mapGeneration}|${nodeKey}|${selectedId ?? 'all'}`;
    if (cameraKey === fittedForRef.current || focusCount === 0) return;
    fittedForRef.current = cameraKey;

    const focused = Boolean(selectedId);
    try {
      if (focusCount === 1) {
        map.easeTo({
          center: [focusNodes[0]!.lon, focusNodes[0]!.lat],
          zoom: focused ? 8.5 : 7.5,
          duration: 400,
        });
      } else {
        const ne = focusBounds.getNorthEast();
        const sw = focusBounds.getSouthWest();
        if (ne.lng === sw.lng && ne.lat === sw.lat) {
          map.easeTo({
            center: [ne.lng, ne.lat],
            zoom: focused ? 8.5 : 7.5,
            duration: 400,
          });
        } else {
          map.fitBounds(focusBounds, {
            padding: focused ? 56 : 48,
            maxZoom: focused ? 11 : 9,
            duration: 450,
          });
        }
      }
    } catch {
      /* map removed mid-camera */
    }
  }, [props.nodes, props.selectedId, mapGeneration]);

  return (
    <div
      ref={containerRef}
      className={props.className ?? 'va-company-network-map'}
      role="img"
      aria-label="Company network map"
    />
  );
}
