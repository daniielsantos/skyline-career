/**
 * Parse MSFS Activities-style bush trip PLN XML into collapsed Skyline legs.
 * Catalog hubs (K**** + bushTripOnly FAA locals) become endpoints; other locals + User POIs → waypoints.
 */

import type { BushWaypoint, BushTripDef, BushTripLeg } from './career-bush-trips.js';
import type { BushCountryId } from './career-bush.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';

const US_ICAO_RE = /^K[A-Z]{3}$/;

/** US career hubs eligible as PLN leg endpoints (network K**** + bushTripOnly). */
const US_PLN_ENDPOINT_SET: ReadonlySet<string> = new Set(
  US_CAREER_HUBS.map((h) => h.icao.toUpperCase()),
);

export type ParsedPlnNode = {
  id: string;
  type: string;
  icao?: string;
  lat?: number;
  lon?: number;
};

export type ParsedMsfsBushPln = {
  title: string;
  departureId?: string;
  destinationId?: string;
  /** Plan-level cruise (ft) from `<CruisingAlt>` — one value for the whole PLN. */
  cruisingAltFt?: number;
  nodes: ParsedPlnNode[];
  /** Catalog hubs in route order (dep/dest included when catalogued). */
  kAirports: string[];
  localAirports: string[];
};

/** Activities PLN filename under profiles/career/bush_PLN (US tours only). */
export const BUSH_TRIP_ACTIVITIES_PLN: Readonly<Record<string, string>> = {
  'us-appalachian-summits': 'Appalachian Summits.PLN',
  'us-california-dreams': 'California Dreams.PLN',
  'us-breckenridge-yosemite': 'Breckenridge to Mariposa Yosemite.PLN',
};

export function bushTripActivitiesPlnFile(
  tripId: string | null | undefined,
): string | undefined {
  if (!tripId) return undefined;
  return BUSH_TRIP_ACTIVITIES_PLN[tripId.trim()];
}

export function isUsIcaoIdent(ident: string | null | undefined): boolean {
  return Boolean(ident && US_ICAO_RE.test(ident.trim().toUpperCase()));
}

/** True when ident is a US career hub (K**** spoke or bushTripOnly local). */
export function isUsBushTripPlnEndpoint(ident: string | null | undefined): boolean {
  if (!ident) return false;
  return US_PLN_ENDPOINT_SET.has(ident.trim().toUpperCase());
}

function parseWorldPosition(raw: string): { lat: number; lon: number } | undefined {
  const m = String(raw).match(
    /([NS])\s*(\d+)[°\s]+(\d+)['\s]+([\d.]+)"\s*,\s*([EW])\s*(\d+)[°\s]+(\d+)['\s]+([\d.]+)"/i,
  );
  if (!m) return undefined;
  let lat = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  let lon = Number(m[6]) + Number(m[7]) / 60 + Number(m[8]) / 3600;
  if (m[1].toUpperCase() === 'S') lat = -lat;
  if (m[5].toUpperCase() === 'W') lon = -lon;
  return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
}

/** Strip Asobo localization keys from waypoint names. */
export function cleanPlnWaypointName(id: string): string {
  const raw = id.trim();
  if (raw.startsWith('@')) {
    const tail = raw.split(',').pop()?.trim() ?? raw;
    return tail.replace(/^TT:[^.]+\./, '').replace(/_/g, ' ');
  }
  return raw;
}

export function parseMsfsBushPln(xml: string): ParsedMsfsBushPln {
  const departureId = xml.match(/<DepartureID>([^<]+)<\/DepartureID>/i)?.[1]?.trim();
  const destinationId = xml
    .match(/<DestinationID>([^<]+)<\/DestinationID>/i)?.[1]
    ?.trim();
  const title =
    xml.match(/<Title>([^<]+)<\/Title>/i)?.[1]?.trim() ||
    `${departureId ?? '?'} - ${destinationId ?? '?'}`;
  const cruisingRaw = xml.match(/<CruisingAlt>([^<]+)<\/CruisingAlt>/i)?.[1]?.trim();
  const cruisingParsed = cruisingRaw != null ? Number(cruisingRaw) : NaN;
  const cruisingAltFt =
    Number.isFinite(cruisingParsed) && cruisingParsed > 0
      ? Math.round(cruisingParsed)
      : undefined;

  const nodes: ParsedPlnNode[] = [];
  const blockRe = /<ATCWaypoint\s+id="([^"]+)">([\s\S]*?)<\/ATCWaypoint>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml))) {
    const id = m[1]!;
    const body = m[2]!;
    const type = body.match(/<ATCWaypointType>([^<]+)<\/ATCWaypointType>/i)?.[1]?.trim() ?? 'User';
    const icao = body.match(/<ICAOIdent>([^<]+)<\/ICAOIdent>/i)?.[1]?.trim();
    const posRaw = body.match(/<WorldPosition>([^<]+)<\/WorldPosition>/i)?.[1];
    const pos = posRaw ? parseWorldPosition(posRaw) : undefined;
    nodes.push({
      id,
      type,
      ...(icao ? { icao: icao.toUpperCase() } : {}),
      ...(pos ? { lat: pos.lat, lon: pos.lon } : {}),
    });
  }

  const kFromNodes: string[] = [];
  const localAirports: string[] = [];
  for (const n of nodes) {
    if (n.type !== 'Airport' || !n.icao) continue;
    if (isUsBushTripPlnEndpoint(n.icao)) kFromNodes.push(n.icao);
    else localAirports.push(n.icao);
  }

  const kAirports: string[] = [];
  if (departureId && isUsBushTripPlnEndpoint(departureId)) {
    kAirports.push(departureId.toUpperCase());
  }
  for (const k of kFromNodes) {
    if (kAirports[kAirports.length - 1] !== k) kAirports.push(k);
  }
  if (destinationId && isUsBushTripPlnEndpoint(destinationId)) {
    const d = destinationId.toUpperCase();
    if (kAirports[kAirports.length - 1] !== d) kAirports.push(d);
  }

  return {
    title,
    ...(departureId ? { departureId: departureId.toUpperCase() } : {}),
    ...(destinationId ? { destinationId: destinationId.toUpperCase() } : {}),
    ...(cruisingAltFt != null ? { cruisingAltFt } : {}),
    nodes,
    kAirports,
    localAirports,
  };
}

/**
 * Collapse PLN nodes into legs between consecutive catalog hubs.
 * Non-catalog Airport + User nodes between them become waypoints.
 */
export function collapsePlnToKLegs(parsed: ParsedMsfsBushPln): Array<{
  fromIcao: string;
  toIcao: string;
  waypoints: BushWaypoint[];
}> {
  const kSet = new Set(parsed.kAirports);
  // Walk nodes in order; also inject synthetic dep/dest if missing as Airport nodes
  type Walk = { kind: 'k'; icao: string } | { kind: 'wp'; wp: BushWaypoint };
  const walk: Walk[] = [];

  const dep = parsed.departureId;
  if (
    dep &&
    isUsBushTripPlnEndpoint(dep) &&
    !parsed.nodes.some((n) => n.icao === dep && n.type === 'Airport')
  ) {
    walk.push({ kind: 'k', icao: dep });
  }

  for (const n of parsed.nodes) {
    if (n.type === 'Airport' && n.icao && isUsBushTripPlnEndpoint(n.icao)) {
      walk.push({ kind: 'k', icao: n.icao });
    } else if (typeof n.lat === 'number' && typeof n.lon === 'number') {
      walk.push({
        kind: 'wp',
        wp: { lat: n.lat, lon: n.lon, name: cleanPlnWaypointName(n.id) },
      });
    }
  }

  const dest = parsed.destinationId;
  if (dest && isUsBushTripPlnEndpoint(dest) && walk[walk.length - 1]?.kind === 'k') {
    const last = walk[walk.length - 1] as { kind: 'k'; icao: string };
    if (last.icao !== dest) walk.push({ kind: 'k', icao: dest });
  } else if (dest && isUsBushTripPlnEndpoint(dest)) {
    walk.push({ kind: 'k', icao: dest });
  }

  const legs: Array<{ fromIcao: string; toIcao: string; waypoints: BushWaypoint[] }> = [];
  let from: string | null = null;
  let wps: BushWaypoint[] = [];
  for (const step of walk) {
    if (step.kind === 'k') {
      if (from && from !== step.icao) {
        legs.push({ fromIcao: from, toIcao: step.icao, waypoints: wps });
      }
      from = step.icao;
      wps = [];
    } else {
      wps.push(step.wp);
    }
  }

  void kSet;
  return legs;
}

/** Append deadhead return to the trip's first catalog hub (optional — long tours stay one-way). */
export function appendReturnLegToStart(
  legs: readonly { fromIcao: string; toIcao: string; waypoints: BushWaypoint[] }[],
): Array<{ fromIcao: string; toIcao: string; waypoints: BushWaypoint[] }> {
  if (legs.length === 0) return [];
  const start = legs[0]!.fromIcao;
  const end = legs[legs.length - 1]!.toIcao;
  if (start === end) return [...legs];
  return [
    ...legs,
    { fromIcao: end, toIcao: start, waypoints: [] },
  ];
}

function haversineNmWp(
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

/**
 * Drop User WPs that sit on (or next to) a leg endpoint.
 * Activities PLNs often place a scenic WP on the estimated field before the
 * Airport node — after MSFS homologation that WP is a false "airport" pin.
 */
export function dropWaypointsNearLegHubs(
  legs: readonly {
    fromIcao: string;
    toIcao: string;
    waypoints: BushWaypoint[];
  }[],
  hubCoords: Readonly<Record<string, { lat: number; lon: number }>>,
  withinNm = 1.5,
): Array<{ fromIcao: string; toIcao: string; waypoints: BushWaypoint[] }> {
  return legs.map((leg) => {
    const from = hubCoords[leg.fromIcao.trim().toUpperCase()];
    const to = hubCoords[leg.toIcao.trim().toUpperCase()];
    if (!from && !to) return { ...leg, waypoints: [...leg.waypoints] };
    const waypoints = leg.waypoints.filter((wp) => {
      if (from && haversineNmWp(wp, from) <= withinNm) return false;
      if (to && haversineNmWp(wp, to) <= withinNm) return false;
      return true;
    });
    return { fromIcao: leg.fromIcao, toIcao: leg.toIcao, waypoints };
  });
}

export function bushTripDefFromPln(opts: {
  id: string;
  displayTitle: string;
  summary?: string;
  countryId: BushCountryId;
  xml: string;
  payUsd?: number;
  cargoKgOutbound?: number;
  /**
   * When true, append deadhead back to the first catalog hub.
   * Default false — Activities tours are one-way.
   */
  appendReturn?: boolean;
  msfsValidated?: boolean;
  /** Optional hub coords for near-hub WP scrubbing (MSFS overrides preferred). */
  hubCoords?: Readonly<Record<string, { lat: number; lon: number }>>;
}): BushTripDef {
  const parsed = parseMsfsBushPln(opts.xml);
  let collapsed = collapsePlnToKLegs(parsed);
  if (opts.appendReturn) {
    collapsed = appendReturnLegToStart(collapsed);
  }
  if (opts.hubCoords) {
    collapsed = dropWaypointsNearLegHubs(collapsed, opts.hubCoords);
  }
  if (collapsed.length < 1) {
    throw new Error(`PLN ${opts.id}: need ≥1 collapsed leg after catalog-hub filter`);
  }
  const cargoOut = opts.cargoKgOutbound ?? 120;
  const validated = opts.msfsValidated === true;
  const legs: BushTripLeg[] = collapsed.map((leg, i) => ({
    id: `${opts.id}-${i + 1}`,
    fromIcao: leg.fromIcao,
    toIcao: leg.toIcao,
    waypoints: leg.waypoints,
    cargoKg:
      i === 0 ? cargoOut : Math.round(cargoOut * (i === collapsed.length - 1 ? 0.35 : 0.5)),
    msfsValidated: validated,
  }));
  return {
    id: opts.id,
    title: opts.displayTitle,
    countryId: opts.countryId,
    summary: opts.summary,
    aircraftHint: 'light_ga',
    msfsValidated: validated,
    payUsd: opts.payUsd ?? 8_500,
    ...(parsed.cruisingAltFt != null
      ? { cruisingAltFt: parsed.cruisingAltFt }
      : {}),
    legs,
  };
}
