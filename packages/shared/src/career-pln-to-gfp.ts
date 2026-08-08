/**
 * Convert MSFS .PLN XML → Garmin/TDS GTNXi .gfp (single-line FPN/RI).
 *
 * Enroute points are emitted as lat/lon user waypoints so obscure FAA locals
 * and Asobo Mission.* POIs do not lock against a mismatched GTN database
 * (e.g. O64 ≠ Port of Catoosa). Named airports keep ICAO + coords when known.
 *
 * Source .PLN files under profiles/career/bush_PLN are read-only — this module
 * never writes them. Airport coords prefer MSFS homologation / catalog over
 * PLN WorldPosition (Airport nodes often lack position; nearby User WPs were
 * Asobo stand-ins at rough FAA estimates).
 */

import { parseMsfsBushPln, type ParsedPlnNode } from './career-bush-pln.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { listMsfsBushHubOverrides } from './career-msfs-hub-overrides.js';

/** GTN family flight-plan capacity (dep + enroute + dest). */
export const GFP_MAX_WAYPOINTS = 99;

const US_HUB_COORDS: Readonly<Record<string, { lat: number; lon: number }>> =
  Object.fromEntries(
    US_CAREER_HUBS.map((h) => [h.icao.toUpperCase(), { lat: h.lat, lon: h.lon }]),
  );

/** Catalog + runtime/shipped MSFS overrides (later wins). */
export function gfpCoordsByIcao(
  extra?: Readonly<Record<string, { lat: number; lon: number }>>,
): Record<string, { lat: number; lon: number }> {
  const out: Record<string, { lat: number; lon: number }> = {
    ...US_HUB_COORDS,
  };
  for (const [icao, row] of Object.entries(listMsfsBushHubOverrides())) {
    out[icao] = { lat: row.lat, lon: row.lon };
  }
  if (extra) {
    for (const [icao, row] of Object.entries(extra)) {
      out[icao.trim().toUpperCase()] = row;
    }
  }
  return out;
}

export type GfpWaypoint = {
  /** Garmin segment after `:F:` (ident and/or DMM coords). */
  segment: string;
  lat: number;
  lon: number;
  kind: 'airport' | 'user';
};

/**
 * Garmin DMM compact form: NddmmmWdddmmm
 * (deg + minutes to 0.1′, lat 5 digits / lon 6 digits after hemisphere).
 */
export function toGarminDmm(lat: number, lon: number): string {
  return `${formatHemisphere(lat, true)}${formatHemisphere(lon, false)}`;
}

function formatHemisphere(value: number, isLat: boolean): string {
  const hemi = isLat
    ? value >= 0
      ? 'N'
      : 'S'
    : value >= 0
      ? 'E'
      : 'W';
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let tenths = Math.round((abs - deg) * 60 * 10);
  if (tenths >= 600) {
    deg += 1;
    tenths = 0;
  }
  const mm = Math.floor(tenths / 10);
  const t = tenths % 10;
  if (isLat) {
    return `${hemi}${String(deg).padStart(2, '0')}${String(mm).padStart(2, '0')}${t}`;
  }
  return `${hemi}${String(deg).padStart(3, '0')}${String(mm).padStart(2, '0')}${t}`;
}

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

function resolveNodeCoords(
  node: ParsedPlnNode,
  coordsByIcao: Readonly<Record<string, { lat: number; lon: number }>>,
): { lat: number; lon: number } | undefined {
  const icao = node.icao?.trim().toUpperCase();
  // Airports: Skyline/MSFS homologation wins. PLN Airport nodes usually lack
  // WorldPosition; Asobo often left a User WP on a rough FAA estimate instead.
  if (node.type === 'Airport' && icao) {
    const known = coordsByIcao[icao];
    if (known) return known;
  }
  if (
    typeof node.lat === 'number' &&
    typeof node.lon === 'number' &&
    Number.isFinite(node.lat) &&
    Number.isFinite(node.lon) &&
    !(node.lat === 0 && node.lon === 0)
  ) {
    return { lat: node.lat, lon: node.lon };
  }
  if (!icao) return undefined;
  return coordsByIcao[icao];
}

function near(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  eps = 0.0008,
): boolean {
  return Math.abs(a.lat - b.lat) < eps && Math.abs(a.lon - b.lon) < eps;
}

/**
 * Drop User WPs that sit on (or next to) an airport already in the plan —
 * those were typically Asobo stand-ins for the field at wrong coords.
 */
export function scrubGfpUserWaypointsNearAirports(
  points: GfpWaypoint[],
  withinNm = 1.5,
): GfpWaypoint[] {
  const airports = points.filter((p) => p.kind === 'airport');
  if (airports.length === 0) return points;
  return points.filter((p) => {
    if (p.kind === 'airport') return true;
    return !airports.some((a) => haversineNm(p, a) <= withinNm);
  });
}

/**
 * Build ordered GFP waypoints from a parsed PLN.
 * Airports → `:F:ICAO,DMM` (or user DMM if no ICAO). User POIs → `:F:DMM`.
 */
export function plnNodesToGfpWaypoints(
  nodes: ParsedPlnNode[],
  opts: {
    coordsByIcao?: Readonly<Record<string, { lat: number; lon: number }>>;
    /** Prefer pure user lat/lon for every point (max GTN compatibility). */
    allUserWaypoints?: boolean;
  } = {},
): GfpWaypoint[] {
  const coords = opts.coordsByIcao ?? gfpCoordsByIcao();
  const out: GfpWaypoint[] = [];
  for (const node of nodes) {
    const pos = resolveNodeCoords(node, coords);
    if (!pos) continue;
    if (out.length && near(out[out.length - 1]!, pos)) continue;

    const icao = node.icao?.trim().toUpperCase();
    const isAirport = node.type === 'Airport' && Boolean(icao);
    const dmm = toGarminDmm(pos.lat, pos.lon);

    if (isAirport && icao && !opts.allUserWaypoints) {
      // ICAO + coords avoids GTN picking a same-ident airport elsewhere.
      out.push({
        segment: `${icao},${dmm}`,
        lat: pos.lat,
        lon: pos.lon,
        kind: 'airport',
      });
    } else {
      out.push({
        segment: dmm,
        lat: pos.lat,
        lon: pos.lon,
        kind: 'user',
      });
    }
  }
  return scrubGfpUserWaypointsNearAirports(out);
}

/** Keep endpoints + evenly sample middle points when over GTN capacity. */
export function thinGfpWaypoints(
  points: GfpWaypoint[],
  maxPoints = GFP_MAX_WAYPOINTS,
): GfpWaypoint[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 2) return points.slice(0, maxPoints);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const middleBudget = maxPoints - 2;
  if (middleBudget <= 0) return [first, last];
  const middle = points.slice(1, -1);
  if (middle.length <= middleBudget) return points;
  const picked: GfpWaypoint[] = [];
  for (let i = 0; i < middleBudget; i++) {
    const idx = Math.round((i * (middle.length - 1)) / (middleBudget - 1 || 1));
    const p = middle[idx]!;
    if (!picked.length || !near(picked[picked.length - 1]!, p)) picked.push(p);
  }
  return [first, ...picked, last];
}

export function gfpWaypointsToFileBody(points: GfpWaypoint[]): string {
  if (points.length < 2) {
    throw new Error('GFP needs at least departure and destination');
  }
  return `FPN/RI${points.map((p) => `:F:${p.segment}`).join('')}`;
}

export type PlnToGfpResult = {
  body: string;
  waypointCount: number;
  thinned: boolean;
  title: string;
  departureId?: string;
  destinationId?: string;
};

/** Full PLN XML → single-line .gfp body (no trailing newline required). */
export function msfsPlnXmlToGfp(
  xml: string,
  opts: {
    coordsByIcao?: Readonly<Record<string, { lat: number; lon: number }>>;
    allUserWaypoints?: boolean;
    maxWaypoints?: number;
    /** Prefer catalog/display title over PLN <Title> (often "O64 - KMPI"). */
    title?: string;
  } = {},
): PlnToGfpResult {
  const coords = opts.coordsByIcao ?? gfpCoordsByIcao();
  const parsed = parseMsfsBushPln(xml);
  let points = plnNodesToGfpWaypoints(parsed.nodes, {
    ...opts,
    coordsByIcao: coords,
  });

  // Departure/destination may be absent as Airport nodes with coords — prepend/append.
  const ensureEnd = (
    icao: string | undefined,
    at: 'start' | 'end',
  ): void => {
    if (!icao) return;
    const code = icao.trim().toUpperCase();
    const hub = coords[code];
    if (!hub) return;
    const dmm = toGarminDmm(hub.lat, hub.lon);
    const segment = opts.allUserWaypoints ? dmm : `${code},${dmm}`;
    const wp: GfpWaypoint = {
      segment,
      lat: hub.lat,
      lon: hub.lon,
      kind: opts.allUserWaypoints ? 'user' : 'airport',
    };
    if (at === 'start') {
      if (!points.length || !near(points[0]!, hub)) points = [wp, ...points];
    } else if (!points.length || !near(points[points.length - 1]!, hub)) {
      points = [...points, wp];
    }
  };
  ensureEnd(parsed.departureId, 'start');
  ensureEnd(parsed.destinationId, 'end');
  points = scrubGfpUserWaypointsNearAirports(points);

  const max = opts.maxWaypoints ?? GFP_MAX_WAYPOINTS;
  const before = points.length;
  points = thinGfpWaypoints(points, max);

  return {
    body: gfpWaypointsToFileBody(points),
    waypointCount: points.length,
    thinned: before > points.length,
    title: (opts.title?.trim() || parsed.title).trim(),
    departureId: parsed.departureId?.toUpperCase(),
    destinationId: parsed.destinationId?.toUpperCase(),
  };
}

/** Safe download filename: TITLE.gfp */
export function gfpDownloadFilename(
  title: string,
  departureId?: string,
  destinationId?: string,
): string {
  const base =
    title
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64) ||
    `${departureId ?? 'DEP'}-${destinationId ?? 'DEST'}`;
  return `${base}.gfp`;
}
