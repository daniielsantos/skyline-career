import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { CompanyNetworkNode } from './company-network';
import { companyNetworkMarkerElement } from './company-network-icons';
import { routeEndpointMarkerEl } from './route-map-endpoint-marker';

setWorkerUrl(maplibreWorkerUrl);

const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const FEEDER_ACCENT = '#f0a35a';
const DESK_ROUTE_ACCENT = '#7ec8e3';
const CORRIDOR_ACCENT = '#7ec8e3';

const FEEDERS_SOURCE = 'company-network-feeders';
const FEEDERS_LAYER = 'company-network-feeders';
const DESK_SOURCE = 'company-network-desk-route';
const DESK_LAYER = 'company-network-desk-route';
const CORRIDOR_SOURCE = 'company-network-corridor';
const CORRIDOR_FILL = 'company-network-corridor-fill';
const CORRIDOR_LINE = 'company-network-corridor-line';

type LineFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: 'LineString';
      coordinates: [number, number][];
    };
  }>;
};

type PolygonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: 'Polygon';
      coordinates: [number, number][][];
    };
  }>;
};

function hasCoords(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  );
}

/** Destination [lon, lat] at bearing° / distance nm on a sphere (Earth ~3440 nm). */
function destinationLngLat(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceNm: number,
): [number, number] {
  const R = 3440.065;
  const δ = distanceNm / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * sinδ * cosφ1,
      cosδ - sinφ1 * Math.sin(φ2),
    );
  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI];
}

function corridorCirclePolygon(
  lat: number,
  lon: number,
  radiusNm: number,
  steps = 72,
): PolygonFeatureCollection {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (360 * i) / steps;
    ring.push(destinationLngLat(lat, lon, bearing, radiusNm));
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { radiusNm },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  };
}

function emptyPolygonCollection(): PolygonFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function safeResize(map: MapLibreMap | null) {
  if (!map) return;
  try {
    map.resize();
  } catch {
    /* map torn down mid-resize */
  }
}

function emptyLineCollection(): LineFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function upsertLineLayer(
  map: MapLibreMap,
  sourceId: string,
  layerId: string,
  data: LineFeatureCollection,
  paint: Record<string, unknown>,
) {
  const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (existing && typeof existing.setData === 'function') {
    existing.setData(data);
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: paint as never,
      });
    }
    return;
  }
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  map.addSource(sourceId, { type: 'geojson', data });
  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    paint: paint as never,
  });
}

function clearLineLayer(map: MapLibreMap, sourceId: string, layerId: string) {
  const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (existing && typeof existing.setData === 'function') {
    existing.setData(emptyLineCollection());
    return;
  }
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function upsertCorridorLayer(
  map: MapLibreMap,
  data: PolygonFeatureCollection,
) {
  const existing = map.getSource(CORRIDOR_SOURCE) as GeoJSONSource | undefined;
  if (existing && typeof existing.setData === 'function') {
    existing.setData(data);
    if (!map.getLayer(CORRIDOR_FILL)) {
      map.addLayer({
        id: CORRIDOR_FILL,
        type: 'fill',
        source: CORRIDOR_SOURCE,
        paint: {
          'fill-color': CORRIDOR_ACCENT,
          'fill-opacity': 0.08,
        },
      });
    }
    if (!map.getLayer(CORRIDOR_LINE)) {
      map.addLayer({
        id: CORRIDOR_LINE,
        type: 'line',
        source: CORRIDOR_SOURCE,
        paint: {
          'line-color': CORRIDOR_ACCENT,
          'line-width': 1.4,
          'line-opacity': 0.55,
          'line-dasharray': [2, 2],
        },
      });
    }
    // Keep disk under feeder / desk lines.
    const before =
      (map.getLayer(FEEDERS_LAYER) && FEEDERS_LAYER) ||
      (map.getLayer(DESK_LAYER) && DESK_LAYER) ||
      undefined;
    if (before) {
      try {
        map.moveLayer(CORRIDOR_FILL, before);
        map.moveLayer(CORRIDOR_LINE, before);
      } catch {
        /* layer order optional */
      }
    }
    return;
  }
  if (map.getLayer(CORRIDOR_LINE)) map.removeLayer(CORRIDOR_LINE);
  if (map.getLayer(CORRIDOR_FILL)) map.removeLayer(CORRIDOR_FILL);
  if (map.getSource(CORRIDOR_SOURCE)) map.removeSource(CORRIDOR_SOURCE);
  map.addSource(CORRIDOR_SOURCE, { type: 'geojson', data });
  map.addLayer({
    id: CORRIDOR_FILL,
    type: 'fill',
    source: CORRIDOR_SOURCE,
    paint: {
      'fill-color': CORRIDOR_ACCENT,
      'fill-opacity': 0.08,
    },
  });
  map.addLayer({
    id: CORRIDOR_LINE,
    type: 'line',
    source: CORRIDOR_SOURCE,
    paint: {
      'line-color': CORRIDOR_ACCENT,
      'line-width': 1.4,
      'line-opacity': 0.55,
      'line-dasharray': [2, 2],
    },
  });
  const before =
    (map.getLayer(FEEDERS_LAYER) && FEEDERS_LAYER) ||
    (map.getLayer(DESK_LAYER) && DESK_LAYER) ||
    undefined;
  if (before) {
    try {
      map.moveLayer(CORRIDOR_FILL, before);
      map.moveLayer(CORRIDOR_LINE, before);
    } catch {
      /* layer order optional */
    }
  }
}

function clearCorridorLayer(map: MapLibreMap) {
  const existing = map.getSource(CORRIDOR_SOURCE) as GeoJSONSource | undefined;
  if (existing && typeof existing.setData === 'function') {
    existing.setData(emptyPolygonCollection());
    return;
  }
  if (map.getLayer(CORRIDOR_LINE)) map.removeLayer(CORRIDOR_LINE);
  if (map.getLayer(CORRIDOR_FILL)) map.removeLayer(CORRIDOR_FILL);
  if (map.getSource(CORRIDOR_SOURCE)) map.removeSource(CORRIDOR_SOURCE);
}

function nodesSignature(
  nodes: CompanyNetworkNode[],
  selectedId: string | null,
): string {
  return nodes
    .filter((n) => hasCoords(n.lat, n.lon))
    .map(
      (n) =>
        `${n.id}:${n.kind}:${n.lat.toFixed(5)}:${n.lon.toFixed(5)}:${n.portId ?? ''}:${selectedId === n.id ? 1 : 0}`,
    )
    .join('|');
}

function routeSignature(
  route: CompanyNetworkMapRoute | null | undefined,
): string {
  if (!route) return '';
  if (
    !hasCoords(route.originLat, route.originLon) ||
    !hasCoords(route.destLat, route.destLon)
  ) {
    return '';
  }
  return [
    route.originIcao,
    route.destIcao,
    route.originLat.toFixed(5),
    route.originLon.toFixed(5),
    route.destLat.toFixed(5),
    route.destLon.toFixed(5),
  ].join('|');
}

function corridorSignature(
  ring: CompanyNetworkCorridorRing | null | undefined,
): string {
  if (!ring) return '';
  if (!hasCoords(ring.lat, ring.lon) || !(ring.radiusNm > 0)) return '';
  return `${ring.lat.toFixed(5)}:${ring.lon.toFixed(5)}:${Math.round(ring.radiusNm)}`;
}

export type CompanyNetworkMapRoute = {
  originIcao: string;
  destIcao: string;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
};

/** Demand desk corridor reach (nm) — P1/P2; omit for P3 open. */
export type CompanyNetworkCorridorRing = {
  lat: number;
  lon: number;
  radiusNm: number;
};

type Props = {
  nodes: CompanyNetworkNode[];
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  /** Selected Open desk hold OD — solid line + camera focus. */
  highlightRoute?: CompanyNetworkMapRoute | null;
  /** Soft Demand corridor disk (centered on pickup hub). */
  corridorRing?: CompanyNetworkCorridorRing | null;
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
  const plottedSigRef = useRef('');
  const onSelectRef = useRef(props.onSelectNode);
  onSelectRef.current = props.onSelectNode;
  const [mapGeneration, setMapGeneration] = useState(0);

  const plotSig = useMemo(
    () =>
      `${nodesSignature(props.nodes, props.selectedId)}#${routeSignature(props.highlightRoute)}#${corridorSignature(props.corridorRing)}`,
    [props.nodes, props.selectedId, props.highlightRoute, props.corridorRing],
  );

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
      plottedSigRef.current = '';
      const active = mapRef.current;
      mapRef.current = null;
      if (active) {
        try {
          if (active.getLayer(FEEDERS_LAYER)) {
            active.removeLayer(FEEDERS_LAYER);
          }
          if (active.getSource(FEEDERS_SOURCE)) {
            active.removeSource(FEEDERS_SOURCE);
          }
          if (active.getLayer(DESK_LAYER)) {
            active.removeLayer(DESK_LAYER);
          }
          if (active.getSource(DESK_SOURCE)) {
            active.removeSource(DESK_SOURCE);
          }
          if (active.getLayer(CORRIDOR_LINE)) {
            active.removeLayer(CORRIDOR_LINE);
          }
          if (active.getLayer(CORRIDOR_FILL)) {
            active.removeLayer(CORRIDOR_FILL);
          }
          if (active.getSource(CORRIDOR_SOURCE)) {
            active.removeSource(CORRIDOR_SOURCE);
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

    const fullSig = `${mapGeneration}|${plotSig}`;
    if (fullSig === plottedSigRef.current) return;
    plottedSigRef.current = fullSig;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    const plotNodes = props.nodes.filter((n) => hasCoords(n.lat, n.lon));
    if (plotNodes.length === 0) {
      try {
        clearLineLayer(map, FEEDERS_SOURCE, FEEDERS_LAYER);
        clearLineLayer(map, DESK_SOURCE, DESK_LAYER);
        clearCorridorLayer(map);
      } catch {
        /* ok */
      }
      return;
    }

    // Must be the JS Map — never shadow with maplibre's `Map` import.
    const fboByPort = new globalThis.Map<string, CompanyNetworkNode>();
    for (const n of plotNodes) {
      if (n.kind === 'fbo' && n.portId) {
        fboByPort.set(n.portId.toUpperCase(), n);
      }
    }

    const feederFeatures: LineFeatureCollection['features'] = [];
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
      if (feederFeatures.length > 0) {
        upsertLineLayer(
          map,
          FEEDERS_SOURCE,
          FEEDERS_LAYER,
          { type: 'FeatureCollection', features: feederFeatures },
          {
            'line-color': FEEDER_ACCENT,
            'line-width': ['case', ['get', 'highlighted'], 2.5, 1.2],
            'line-opacity': ['case', ['get', 'highlighted'], 0.85, 0.45],
            'line-dasharray': [2, 2],
          },
        );
      } else {
        clearLineLayer(map, FEEDERS_SOURCE, FEEDERS_LAYER);
      }
    } catch {
      /* style not ready / map removed */
    }

    const deskRoute = props.highlightRoute;
    const deskRouteOk =
      deskRoute &&
      hasCoords(deskRoute.originLat, deskRoute.originLon) &&
      hasCoords(deskRoute.destLat, deskRoute.destLon);

    try {
      if (deskRouteOk) {
        upsertLineLayer(
          map,
          DESK_SOURCE,
          DESK_LAYER,
          {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  label: `${deskRoute.originIcao}→${deskRoute.destIcao}`,
                },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [deskRoute.originLon, deskRoute.originLat],
                    [deskRoute.destLon, deskRoute.destLat],
                  ],
                },
              },
            ],
          },
          {
            'line-color': DESK_ROUTE_ACCENT,
            'line-width': 3.2,
            'line-opacity': 0.92,
          },
        );
      } else {
        clearLineLayer(map, DESK_SOURCE, DESK_LAYER);
      }
    } catch {
      /* style not ready / map removed */
    }

    const corridor = props.corridorRing;
    const corridorOk =
      corridor &&
      hasCoords(corridor.lat, corridor.lon) &&
      corridor.radiusNm > 0;

    try {
      if (corridorOk) {
        upsertCorridorLayer(
          map,
          corridorCirclePolygon(corridor.lat, corridor.lon, corridor.radiusNm),
        );
      } else {
        clearCorridorLayer(map);
      }
    } catch {
      /* style not ready / map removed */
    }

    const selectedId = props.selectedId;
    const nodeKey = plotNodes.map((n) => n.id).join('|');
    const routeKey = deskRouteOk
      ? `${deskRoute.originIcao}-${deskRoute.destIcao}-${deskRoute.originLat.toFixed(3)}-${deskRoute.destLat.toFixed(3)}`
      : 'none';
    const corridorKey = corridorOk
      ? `${corridor.lat.toFixed(3)}-${corridor.lon.toFixed(3)}-${Math.round(corridor.radiusNm)}`
      : 'none';

    for (const node of plotNodes) {
      const selected = selectedId === node.id;
      const el = companyNetworkMarkerElement(node.kind, selected);
      const label =
        node.kind === 'fbo'
          ? node.title
          : node.kind === 'hq'
            ? `${node.primaryHubIcao} · HQ`
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
                  node.kind === 'fbo'
                    ? 'Port FBO'
                    : node.kind === 'hq'
                      ? 'Headquarters'
                      : 'Company warehouse'
                }`,
              ),
            )
            .addTo(map),
        );
      } catch {
        continue;
      }
    }

    // After network pins so ICAO labels sit on top of WH/FBO glyphs.
    if (deskRouteOk) {
      const endpoints: Array<{
        icao: string;
        lat: number;
        lon: number;
        kind: 'dep' | 'arr';
      }> = [
        {
          icao: deskRoute.originIcao,
          lat: deskRoute.originLat,
          lon: deskRoute.originLon,
          kind: 'dep',
        },
        {
          icao: deskRoute.destIcao,
          lat: deskRoute.destLat,
          lon: deskRoute.destLon,
          kind: 'arr',
        },
      ];
      for (const ep of endpoints) {
        try {
          markersRef.current.push(
            new Marker({
              element: routeEndpointMarkerEl(ep.icao, ep.kind),
              anchor: 'bottom',
            })
              .setLngLat([ep.lon, ep.lat])
              .addTo(map),
          );
        } catch {
          /* map removed */
        }
      }
    }

    const focusBounds = new LngLatBounds();
    let focusCount = 0;
    let focused = false;

    if (deskRouteOk) {
      focusBounds.extend([deskRoute.originLon, deskRoute.originLat]);
      focusBounds.extend([deskRoute.destLon, deskRoute.destLat]);
      focusCount = 2;
      focused = true;
    } else {
      // Selected pin → zoom in. Corridor ring stays drawn but does not drive
      // the camera (fitBounds on P1/P2 felt like a continent zoom-out).
      let focusNodes: CompanyNetworkNode[] = plotNodes;
      if (selectedId) {
        const selected = plotNodes.find((n) => n.id === selectedId);
        focusNodes = selected ? [selected] : plotNodes;
      }
      for (const n of focusNodes) {
        focusBounds.extend([n.lon, n.lat]);
        focusCount += 1;
      }
      focused = Boolean(selectedId);
    }

    const cameraKey = `${mapGeneration}|${nodeKey}|${selectedId ?? 'all'}|${routeKey}|${corridorKey}`;
    if (cameraKey === fittedForRef.current || focusCount === 0) return;
    fittedForRef.current = cameraKey;

    try {
      if (focusCount === 1) {
        const ne = focusBounds.getNorthEast();
        map.easeTo({
          center: [ne.lng, ne.lat],
          zoom: focused ? 9.75 : 7.5,
          duration: 400,
        });
      } else {
        const ne = focusBounds.getNorthEast();
        const sw = focusBounds.getSouthWest();
        if (ne.lng === sw.lng && ne.lat === sw.lat) {
          map.easeTo({
            center: [ne.lng, ne.lat],
            zoom: focused ? 9.75 : 7.5,
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
  }, [
    plotSig,
    mapGeneration,
    props.nodes,
    props.selectedId,
    props.highlightRoute,
    props.corridorRing,
  ]);

  return (
    <div
      ref={containerRef}
      className={props.className ?? 'va-company-network-map'}
      role="img"
      aria-label="Company network map"
    />
  );
}
