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

function safeResize(map: Map | null) {
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
  const mapRef = useRef<Map | null>(null);
  const aliveRef = useRef(true);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(props.onSelectNode);
  onSelectRef.current = props.onSelectNode;
  const [mapGeneration, setMapGeneration] = useState(0);

  useEffect(() => {
    aliveRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    let map: Map | null = null;
    let ro: ResizeObserver | null = null;
    let onReady: (() => void) | null = null;

    const attachMap = () => {
      if (!aliveRef.current || mapRef.current || !container.isConnected) return;
      if (container.clientWidth < 2 || container.clientHeight < 2) {
        requestAnimationFrame(attachMap);
        return;
      }
      try {
        map = new Map({
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

    const fboByPort = new Map<string, CompanyNetworkNode>();
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

    const bounds = new LngLatBounds();
    let boundCount = 0;
    const extend = (lon: number, lat: number) => {
      bounds.extend([lon, lat]);
      boundCount += 1;
    };

    const selectedId = props.selectedId;

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
      extend(node.lon, node.lat);
    }

    try {
      if (boundCount === 1) {
        map.easeTo({
          center: [plotNodes[0]!.lon, plotNodes[0]!.lat],
          zoom: 7.5,
          duration: 400,
        });
      } else if (boundCount > 1) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        if (ne.lng === sw.lng && ne.lat === sw.lat) {
          map.easeTo({
            center: [ne.lng, ne.lat],
            zoom: 7.5,
            duration: 400,
          });
        } else {
          map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 450 });
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
