import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DispatchRouteMap,
  type DispatchAircraftPosition,
  type DispatchRouteEndpoint,
  type DispatchRouteWaypoint,
} from './DispatchRouteMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';
import { BusyBlock } from './Busy';
import { downloadBushTripGfp, downloadBushTripPln, type BushTripMapNode } from './api';

type HubStopStatus = 'done' | 'current' | 'next';

type HubStop = {
  icao: string;
  name?: string;
  lat?: number;
  lon?: number;
  status: HubStopStatus;
  /** Great-circle NM to the next hub (omit on last). */
  nmToNext?: number;
};

function haversineNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function orderedHubIcaos(nodes: BushTripMapNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind !== 'hub') continue;
    const code = n.icao.trim().toUpperCase();
    if (!code) continue;
    if (out[out.length - 1] === code) continue;
    out.push(code);
  }
  return out;
}

export function BushTripMapCard(props: {
  tripId: string;
  title: string;
  startIcao: string;
  endIcao: string;
  currentFromIcao: string;
  currentToIcao: string;
  legIndex: number;
  legs: number;
  mapNodes: BushTripMapNode[];
  hasPln?: boolean;
  /** Suggested cruise (ft MSL) from Activities PLN. */
  cruisingAltFt?: number;
  /** Parked/assigned aircraft hub — used when live coords are absent. */
  aircraftIcao?: string | null;
  /** Prefer live sim coords when present. */
  liveAircraft?: DispatchAircraftPosition | null;
  aircraftLabel?: string | null;
  onOpenAirport: (icao: string) => void;
}) {
  const [origin, setOrigin] = useState<DispatchRouteEndpoint | null>(null);
  const [dest, setDest] = useState<DispatchRouteEndpoint | null>(null);
  const [waypoints, setWaypoints] = useState<DispatchRouteWaypoint[]>([]);
  const [hubStops, setHubStops] = useState<HubStop[]>([]);
  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    token: number;
  } | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [plnBusy, setPlnBusy] = useState(false);
  const [gfpBusy, setGfpBusy] = useState(false);
  const [plnNote, setPlnNote] = useState<string | null>(null);
  const [parkedAircraft, setParkedAircraft] =
    useState<DispatchAircraftPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<string[]>([]);

  const nodeKey = useMemo(
    () =>
      props.mapNodes
        .map((n) =>
          n.kind === 'hub' ? `h:${n.icao}` : `w:${n.ident}:${n.lat}:${n.lon}`,
        )
        .join('|'),
    [props.mapNodes],
  );

  const currentFrom = props.currentFromIcao.trim().toUpperCase();

  // Keep a stable snapshot of nodes for async resolve (ignore new array refs
  // with the same nodeKey from poll/refresh).
  const mapNodesRef = useRef(props.mapNodes);
  if (mapNodesRef.current !== props.mapNodes) {
    const prevKey = mapNodesRef.current
      .map((n) =>
        n.kind === 'hub' ? `h:${n.icao}` : `w:${n.ident}:${n.lat}:${n.lon}`,
      )
      .join('|');
    if (prevKey !== nodeKey) mapNodesRef.current = props.mapNodes;
  }

  useEffect(() => {
    let cancelled = false;
    // Do not flip loading (unmount map) on soft re-resolve — that was resetting
    // the camera whenever Dispatch refreshed active bush trip mapNodes.
    setLoading((was) => (origin && dest ? false : true));
    void (async () => {
      const nodes = mapNodesRef.current;
      const routeHubs = orderedHubIcaos(nodes);
      const hubCodes = [...routeHubs];
      const parkCode =
        currentFrom ||
        props.aircraftIcao?.trim().toUpperCase() ||
        '';
      if (parkCode) hubCodes.push(parkCode);
      const resolved = await Promise.all(
        [...new Set(hubCodes)].map(
          async (icao) => [icao, await resolveAirportEndpoint(icao)] as const,
        ),
      );
      if (cancelled) return;
      const byIcao = new Map(
        resolved.filter(([, ep]) => ep).map(([icao, ep]) => [icao, ep!]),
      );
      const miss = hubCodes.filter((c) => !byIcao.has(c));

      const track: DispatchRouteWaypoint[] = [];
      for (const node of nodes) {
        if (node.kind === 'hub') {
          const ep = byIcao.get(node.icao);
          if (!ep) continue;
          track.push({
            ident: ep.icao,
            lat: ep.lat,
            lon: ep.lon,
            type: 'Airport',
          });
        } else {
          track.push({
            ident: node.ident,
            lat: node.lat,
            lon: node.lon,
            type: 'User',
          });
        }
      }

      const start =
        byIcao.get(props.startIcao.trim().toUpperCase()) ??
        (track[0]
          ? {
              icao: track[0].ident,
              lat: track[0].lat,
              lon: track[0].lon,
            }
          : null);

      let end: DispatchRouteEndpoint | null =
        byIcao.get(props.endIcao.trim().toUpperCase()) ?? null;
      if (!end && track.length > 1) {
        const last = track[track.length - 1]!;
        end = { icao: last.ident, lat: last.lat, lon: last.lon };
      }
      if (start && end && start.icao === end.icao) {
        for (let i = track.length - 2; i >= 1; i--) {
          const p = track[i]!;
          if (p.type === 'Airport' && p.ident.toUpperCase() !== start.icao) {
            end = { icao: p.ident, lat: p.lat, lon: p.lon };
            break;
          }
        }
      }

      const currentIdx = Math.max(
        0,
        routeHubs.findIndex((h) => h === currentFrom),
      );
      const stops: HubStop[] = routeHubs.map((icao, i) => {
        const ep = byIcao.get(icao);
        const next = routeHubs[i + 1];
        const nextEp = next ? byIcao.get(next) : undefined;
        let nmToNext: number | undefined;
        if (ep && nextEp) {
          nmToNext = Math.round(haversineNm(ep, nextEp));
        }
        const status: HubStopStatus =
          i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'next';
        return {
          icao,
          ...(ep?.name ? { name: ep.name } : {}),
          ...(ep
            ? { lat: ep.lat, lon: ep.lon }
            : {}),
          status,
          ...(nmToNext != null ? { nmToNext } : {}),
        };
      });

      const parked = parkCode ? byIcao.get(parkCode) : null;
      setParkedAircraft(
        parked ? { lat: parked.lat, lon: parked.lon } : null,
      );
      setHubStops(stops);
      setOrigin((prev) =>
        prev &&
        start &&
        prev.icao === start.icao &&
        prev.lat === start.lat &&
        prev.lon === start.lon
          ? prev
          : start,
      );
      setDest((prev) =>
        prev &&
        end &&
        prev.icao === end.icao &&
        prev.lat === end.lat &&
        prev.lon === end.lon
          ? prev
          : end,
      );
      setWaypoints((prev) => {
        if (
          prev.length === track.length &&
          prev.every(
            (p, i) =>
              p.ident === track[i]!.ident &&
              p.lat === track[i]!.lat &&
              p.lon === track[i]!.lon,
          )
        ) {
          return prev;
        }
        return track;
      });
      setMissing([...new Set(miss)]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // nodeKey covers mapNodes content; omit array identity from poll refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- origin/dest only gate loading
  }, [
    nodeKey,
    props.startIcao,
    props.endIcao,
    props.aircraftIcao,
    currentFrom,
  ]);

  const live = props.liveAircraft;
  const liveOk =
    live &&
    Number.isFinite(live.lat) &&
    Number.isFinite(live.lon) &&
    !(live.lat === 0 && live.lon === 0)
      ? live
      : null;
  // Trust bush Watch live coords when present. Parked pin is only a fallback
  // at the current leg origin (never override live with a wrong hangar hub).
  const aircraft: DispatchAircraftPosition | null = liveOk ?? parkedAircraft;

  const headline = `${props.currentFromIcao}→${props.currentToIcao} · leg ${props.legIndex + 1}/${props.legs}`;
  const cruiseLabel =
    typeof props.cruisingAltFt === 'number' &&
    Number.isFinite(props.cruisingAltFt) &&
    props.cruisingAltFt > 0
      ? ` · cruise ${props.cruisingAltFt.toLocaleString('en-US')} ft`
      : '';
  const totalNm = hubStops.reduce((sum, s) => sum + (s.nmToNext ?? 0), 0);
  const doneNm = hubStops
    .filter((s) => s.status === 'done')
    .reduce((sum, s) => sum + (s.nmToNext ?? 0), 0);

  function focusHub(icao: string) {
    const code = icao.trim().toUpperCase();
    const stop = hubStops.find((s) => s.icao === code);
    if (
      !stop ||
      stop.lat == null ||
      stop.lon == null ||
      !Number.isFinite(stop.lat) ||
      !Number.isFinite(stop.lon)
    ) {
      return;
    }
    const token = focusToken + 1;
    setFocusToken(token);
    setFocusTarget({
      lat: stop.lat,
      lon: stop.lon,
      zoom: 8.75,
      token,
    });
  }

  async function onDownloadPln() {
    if (!props.hasPln || plnBusy || gfpBusy) return;
    setPlnBusy(true);
    setPlnNote(null);
    try {
      const file = await downloadBushTripPln(props.tripId);
      setPlnNote(`Saved ${file} — import in the MSFS tablet / EFB`);
    } catch (err) {
      setPlnNote(err instanceof Error ? err.message : String(err));
    } finally {
      setPlnBusy(false);
    }
  }

  async function onDownloadGfp() {
    if (!props.hasPln || plnBusy || gfpBusy) return;
    setGfpBusy(true);
    setPlnNote(null);
    try {
      const { filename, waypointCount, thinned } = await downloadBushTripGfp(
        props.tripId,
      );
      const thinNote = thinned
        ? ' (thinned to GTN 99-waypoint limit)'
        : waypointCount != null
          ? ` · ${waypointCount} wpts`
          : '';
      setPlnNote(
        `Saved ${filename}${thinNote} — copy to C:\\ProgramData\\TDS\\GTNXi\\FPL then Catalog → Import`,
      );
    } catch (err) {
      setPlnNote(err instanceof Error ? err.message : String(err));
    } finally {
      setGfpBusy(false);
    }
  }

  return (
    <section className="bush-trip-map-card" aria-label="Bush trip route map">
      <div className="dispatch-route-map-head">
        <div className="bush-trip-map-head-text">
          <strong>Route map</strong>
          <small>
            {props.title} · {headline}
            {cruiseLabel}
            {totalNm > 0 ? ` · ${doneNm}/${totalNm} nm` : ''}
          </small>
        </div>
        {props.hasPln ? (
          <div className="bush-trip-map-dl-actions">
            <button
              type="button"
              className="action ghost bush-trip-pln-btn"
              disabled={plnBusy || gfpBusy}
              title="Download the Activities .PLN for MSFS tablet import"
              onClick={() => void onDownloadPln()}
            >
              {plnBusy ? 'Saving…' : 'Copy PLN'}
            </button>
            <button
              type="button"
              className="action ghost bush-trip-pln-btn"
              disabled={plnBusy || gfpBusy}
              title="Download Garmin/TDS GTNXi .gfp — place in ProgramData\\TDS\\GTNXi\\FPL"
              onClick={() => void onDownloadGfp()}
            >
              {gfpBusy ? 'Saving…' : 'Copy GFP'}
            </button>
          </div>
        ) : null}
      </div>
      {plnNote ? (
        <p className="bush-trip-pln-note muted" role="status">
          {plnNote}
        </p>
      ) : null}
      {hubStops.length > 0 ? (
        <ol className="bush-trip-hub-rail" aria-label="Route hubs">
          {hubStops.map((stop, i) => (
            <li
              key={`${stop.icao}-${i}`}
              className={`bush-trip-hub-rail-stop is-${stop.status}`}
            >
              <button
                type="button"
                className="bush-trip-hub-rail-icao"
                title={
                  stop.name
                    ? `${stop.icao} · ${stop.name} — focus on map`
                    : `${stop.icao} — focus on map`
                }
                onClick={() => focusHub(stop.icao)}
              >
                <span className="bush-trip-hub-rail-dot" aria-hidden="true" />
                <span className="bush-trip-hub-rail-code">{stop.icao}</span>
                <span className="bush-trip-hub-rail-state">
                  {stop.status === 'done'
                    ? 'Done'
                    : stop.status === 'current'
                      ? 'Here'
                      : 'Next'}
                </span>
              </button>
              {stop.nmToNext != null ? (
                <span className="bush-trip-hub-rail-leg" aria-hidden="true">
                  <span className="bush-trip-hub-rail-line" />
                  <span className="bush-trip-hub-rail-nm">
                    {stop.nmToNext} nm
                  </span>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {loading ? (
        <BusyBlock label="Loading map" className="dispatch-route-map-empty" />
      ) : origin && dest ? (
        <DispatchRouteMap
          className="dispatch-route-map bush-trip-route-map"
          origin={origin}
          dest={dest}
          waypoints={waypoints}
          aircraft={aircraft}
          aircraftLabel={props.aircraftLabel}
          originRole="dep"
          focusTarget={focusTarget}
          onSelectAirport={(icao) => focusHub(icao)}
        />
      ) : (
        <p className="dispatch-route-map-empty">
          Map unavailable
          {missing.length ? ` — missing coords for ${missing.join(', ')}` : ''}.
        </p>
      )}
    </section>
  );
}
