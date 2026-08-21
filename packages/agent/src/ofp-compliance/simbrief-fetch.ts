/**
 * Fetch latest OFP from SimBrief and map to OfpExpectation fields.
 * Endpoint: https://www.simbrief.com/api/xml.fetcher.php?username=…&json=v2
 * (or userid=…) — call on user action, do not poll.
 */

import {
  normalizeOfpExpectation,
  type OfpBriefingSummary,
  type OfpExpectation,
  type OfpLoadSheet,
  type OfpPayloadPlan,
  type OfpRouteWaypoint,
  type OfpStationRoleMap,
  type OfpWeightUnit,
} from '@msfs-compat/shared';

const FETCHER = 'https://www.simbrief.com/api/xml.fetcher.php';

export interface SimBriefFetchOpts {
  username?: string;
  userid?: string;
  /**
   * When set, fetch the OFP tied to this Dispatch Redirect / API static_id
   * instead of whatever happens to be the user's absolute latest flight.
   */
  staticId?: string;
  /** Optional station roles (e.g. from PMDG homologation). */
  stationRoles?: OfpStationRoleMap;
  /** Fetch implementation (tests). */
  fetchImpl?: typeof fetch;
}

/** Subset of SimBrief JSON v2 we care about (all numeric fields often arrive as strings). */
export interface SimBriefOfpJson {
  params?: {
    units?: string;
    request_id?: string;
    user_id?: string;
  };
  general?: {
    icao_airline?: string;
    flight_number?: string;
    is_etops?: string;
    route?: string;
    route_ifps?: string;
    route_distance?: string | number;
    air_distance?: string | number;
    gc_distance?: string | number;
    initial_altitude?: string | number;
  };
  aircraft?: {
    icaocode?: string;
    reg?: string;
    name?: string;
  };
  origin?: {
    icao_code?: string;
    icao?: string;
    iata_code?: string;
    name?: string;
    plan_rwy?: string;
  };
  destination?: {
    icao_code?: string;
    icao?: string;
    iata_code?: string;
    name?: string;
    plan_rwy?: string;
  };
  alternate?:
    | {
        icao_code?: string;
        icao?: string;
      }
    | Array<{
        icao_code?: string;
        icao?: string;
      }>;
  times?: {
    est_block?: string | number;
    sched_block?: string | number;
    /** Estimated air/enroute time — seconds (classic) or HH:MM[:SS] (json v2). */
    est_time_enroute?: string | number;
    sched_time_enroute?: string | number;
    taxi_out?: string | number;
    taxi_in?: string | number;
  };
  fuel?: Record<string, string | number | undefined>;
  weights?: Record<string, string | number | undefined>;
  fetch?: { userid?: string; status?: string; fetchtime?: string };
  /** Navlog fixes — array in json=v2; sometimes a single object. */
  navlog?:
    | {
        fix?: SimBriefNavlogFix | SimBriefNavlogFix[];
      }
    | SimBriefNavlogFix[];
}

export type SimBriefNavlogFix = {
  ident?: string;
  name?: string;
  type?: string;
  pos_lat?: string | number;
  pos_long?: string | number;
  pos_lon?: string | number;
  lat?: string | number;
  lon?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  is_sid_star?: string | number;
  via_airway?: string;
};

function compactText(value: string | undefined): string | undefined {
  const compact = value?.trim().replace(/\s+/g, ' ');
  return compact || undefined;
}

function airportWithRunway(
  block:
    | {
        icao_code?: string;
        icao?: string;
        plan_rwy?: string;
      }
    | undefined,
): string | undefined {
  const icao = airportIcao(block);
  if (!icao) return undefined;
  const runway = compactText(block?.plan_rwy)?.toUpperCase();
  return runway ? `${icao}/${runway}` : icao;
}

function blockTime(value: string | number | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    // SimBrief classic XML uses seconds for many time fields.
    if (value >= 60) return secondsToHhMm(value);
    return undefined;
  }
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;
  // Pure seconds as a digit string.
  if (/^\d+$/.test(raw)) {
    const sec = Number(raw);
    if (Number.isFinite(sec) && sec >= 60) return secondsToHhMm(sec);
  }
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return compactText(raw);
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function secondsToHhMm(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Map SimBrief JSON v2 into the compact JetCard-style OFP strip. */
export function mapSimBriefOfpToBriefing(
  ofp: SimBriefOfpJson,
): OfpBriefingSummary {
  const origin = airportWithRunway(ofp.origin);
  const destination = airportWithRunway(ofp.destination);
  const routeBody = compactText(ofp.general?.route ?? ofp.general?.route_ifps);
  const route = compactText(
    [origin, routeBody, destination].filter(Boolean).join(' '),
  );

  const block = blockTime(ofp.times?.est_block ?? ofp.times?.sched_block);
  let airTime = blockTime(
    ofp.times?.est_time_enroute ?? ofp.times?.sched_time_enroute,
  );
  // Derive air time from block − taxi when SimBrief omitted enroute.
  if (!airTime && block && ofp.times) {
    const taxiOut = num(ofp.times.taxi_out);
    const taxiIn = num(ofp.times.taxi_in);
    const blockMs = parseHhMmToMs(block);
    if (
      blockMs !== undefined &&
      taxiOut !== undefined &&
      taxiIn !== undefined
    ) {
      const airMs = blockMs - (taxiOut + taxiIn) * 1000;
      if (airMs >= 60_000) airTime = secondsToHhMm(airMs / 1000);
    }
  }

  const waypoints = mapSimBriefNavlogWaypoints(ofp);
  const result: OfpBriefingSummary = {
    aircraftIcao: compactText(ofp.aircraft?.icaocode)?.toUpperCase(),
    tailNumber: compactText(ofp.aircraft?.reg)?.toUpperCase(),
    distanceNm:
      num(ofp.general?.route_distance) ??
      num(ofp.general?.air_distance) ??
      num(ofp.general?.gc_distance),
    blockTime: block,
    cruiseAltitudeFt: num(ofp.general?.initial_altitude),
    alternateIcao: airportIcao(
      Array.isArray(ofp.alternate) ? ofp.alternate[0] : ofp.alternate,
    ),
    route,
  };
  if (airTime) result.airTime = airTime;
  if (waypoints?.length) result.waypoints = waypoints;
  return result;
}

/** Extract ordered navlog fixes that carry usable WGS84 coordinates. */
export function mapSimBriefNavlogWaypoints(
  ofp: SimBriefOfpJson,
): OfpRouteWaypoint[] | undefined {
  const fixes = collectSimBriefNavlogFixes(ofp);
  const out: OfpRouteWaypoint[] = [];
  for (const fix of fixes) {
    const ident = compactText(fix.ident ?? fix.name)?.toUpperCase();
    const lat =
      num(fix.pos_lat) ?? num(fix.latitude) ?? num(fix.lat);
    const lon =
      num(fix.pos_long) ??
      num(fix.pos_lon) ??
      num(fix.longitude) ??
      num(fix.lon);
    if (!ident || lat === undefined || lon === undefined) continue;
    if (lat === 0 && lon === 0) continue;
    const type = compactText(fix.type)?.toLowerCase();
    out.push(type ? { ident, lat, lon, type } : { ident, lat, lon });
  }
  return out.length > 0 ? out : undefined;
}

function collectSimBriefNavlogFixes(ofp: SimBriefOfpJson): SimBriefNavlogFix[] {
  const navlog = ofp.navlog as unknown;
  if (!navlog) return [];
  if (Array.isArray(navlog)) return navlog as SimBriefNavlogFix[];
  if (typeof navlog !== 'object') return [];

  const asRecord = navlog as Record<string, unknown>;
  const raw = asRecord.fix ?? asRecord.Fix ?? asRecord.fixes;
  return coerceFixList(raw);
}

function coerceFixList(raw: unknown): SimBriefNavlogFix[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as SimBriefNavlogFix[];
  if (typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  // Single fix object.
  if (
    'ident' in obj ||
    'name' in obj ||
    'pos_lat' in obj ||
    'pos_long' in obj
  ) {
    return [obj as SimBriefNavlogFix];
  }
  // XML→JSON sometimes emits { "0": fix, "1": fix, ... }.
  const values = Object.values(obj);
  if (
    values.length > 0 &&
    values.every(
      (v) =>
        v &&
        typeof v === 'object' &&
        ('ident' in (v as object) ||
          'name' in (v as object) ||
          'pos_lat' in (v as object)),
    )
  ) {
    return values as SimBriefNavlogFix[];
  }
  return [];
}

/** Diagnostic for UI when waypoints are missing after confirm. */
export function diagnoseSimBriefNavlog(ofp: SimBriefOfpJson): {
  present: boolean;
  fixCount: number;
  withCoords: number;
  topKeys: string[];
} {
  const fixes = collectSimBriefNavlogFixes(ofp);
  let withCoords = 0;
  for (const fix of fixes) {
    const lat = num(fix.pos_lat) ?? num(fix.latitude) ?? num(fix.lat);
    const lon =
      num(fix.pos_long) ??
      num(fix.pos_lon) ??
      num(fix.longitude) ??
      num(fix.lon);
    if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
      withCoords += 1;
    }
  }
  return {
    present: ofp.navlog != null,
    fixCount: fixes.length,
    withCoords,
    topKeys: ofp.navlog
      ? Array.isArray(ofp.navlog)
        ? ['(array)']
        : Object.keys(ofp.navlog as object).slice(0, 12)
      : [],
  };
}

function parseHhMmToMs(value: string): number | undefined {
  const match = /^(\d+):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return Math.max(0, Math.round((hours * 60 + minutes) * 60_000));
}

function num(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function unitsFromSimBrief(paramsUnits: string | undefined): OfpWeightUnit {
  const u = (paramsUnits ?? 'kgs').toLowerCase();
  if (u === 'lbs' || u === 'lb') {
    return 'lb';
  }
  return 'kg';
}

function airportIcao(
  block: { icao_code?: string; icao?: string } | undefined,
): string | undefined {
  const code = (block?.icao_code ?? block?.icao)?.trim().toUpperCase();
  return code || undefined;
}

/**
 * Map SimBrief OFP JSON (v2) → OfpExpectation.
 * Block fuel = plan_ramp.
 * Baggage total = `cargo` (or bag_count × bag_weight) — never bare `bag_weight`
 * (that field is average kg/lb **per bag**).
 */
export function mapSimBriefOfpToExpectation(
  ofp: SimBriefOfpJson,
  opts: { stationRoles?: OfpStationRoleMap } = {},
): OfpExpectation {
  const unit = unitsFromSimBrief(ofp.params?.units);
  const w = ofp.weights ?? {};
  const f = ofp.fuel ?? {};

  const blockFuel = num(f.plan_ramp);
  const enrouteBurn = num(f.enroute_burn);
  const taxiFuel = num(f.taxi) ?? num(f.taxi_fuel);
  const passengerCount = num(w.pax_count) ?? num(w.pax_count_actual);
  const payload = num(w.payload);
  const emptyWeight = num(w.oew);
  const zfw = num(w.est_zfw);
  const tow = num(w.est_tow);
  const lw = num(w.est_ldw);

  const baggage = resolveSimBriefBaggageTotal(w);
  const avgPaxFromSheet = num(w.pax_weight);

  const loadSheet: OfpLoadSheet = {
    unit,
    blockFuel,
    enrouteBurn,
    taxiFuel,
    passengerCount,
    baggage,
    payload,
    emptyWeight,
    zfw,
    tow,
    lw,
    maxZfw: num(w.max_zfw),
    maxTow: num(w.max_tow),
    maxLw: num(w.max_ldw),
  };

  const avgPax =
    opts.stationRoles?.averagePassengerWeight ??
    avgPaxFromSheet ??
    (payload !== undefined &&
    baggage !== undefined &&
    passengerCount !== undefined &&
    passengerCount > 0
      ? (payload - baggage) / passengerCount
      : undefined);

  const stationRoles: OfpStationRoleMap | undefined = opts.stationRoles
    ? {
        ...opts.stationRoles,
        averagePassengerWeight:
          opts.stationRoles.averagePassengerWeight ?? avgPax,
      }
    : avgPax !== undefined
      ? { averagePassengerWeight: avgPax }
      : undefined;

  const payloadPlan: OfpPayloadPlan | undefined =
    payload !== undefined || stationRoles
      ? {
          unit,
          total: payload,
          stationRoles,
        }
      : undefined;

  const ofpId =
    ofp.params?.request_id ??
    (ofp.general?.flight_number
      ? `sb-${ofp.general.icao_airline ?? ''}${ofp.general.flight_number}`
      : undefined);

  return normalizeOfpExpectation({
    source: 'simbrief',
    ofpId,
    icao: ofp.aircraft?.icaocode,
    originIcao: airportIcao(ofp.origin),
    destIcao: airportIcao(ofp.destination),
    fuel: { unit, total: blockFuel },
    loadSheet,
    payload: payloadPlan,
  });
}

/**
 * SimBrief `bag_weight` is per-bag; load-sheet Baggage total is `cargo`
 * (≈ bag_count × bag_weight + freight_added).
 */
export function resolveSimBriefBaggageTotal(
  w: Record<string, string | number | undefined>,
): number | undefined {
  const cargo = num(w.cargo);
  const bagCount = num(w.bag_count) ?? num(w.bag_count_actual);
  const bagWeight = num(w.bag_weight);
  const freight = num(w.freight_added) ?? 0;

  if (cargo !== undefined) {
    return cargo;
  }
  if (bagCount !== undefined && bagWeight !== undefined) {
    return bagCount * bagWeight + freight;
  }
  return undefined;
}

export async function fetchSimBriefLatestOfp(opts: SimBriefFetchOpts): Promise<{
  raw: SimBriefOfpJson;
  expectation: OfpExpectation;
  url: string;
}> {
  const username = opts.username?.trim();
  const userid = opts.userid?.trim();
  if (!username && !userid) {
    throw new Error('SimBrief fetch requires --simbrief-user or --simbrief-userid');
  }

  const qs = new URLSearchParams({ json: 'v2' });
  if (userid) {
    qs.set('userid', userid);
  } else if (username) {
    qs.set('username', username);
  }
  if (opts.staticId?.trim()) {
    qs.set('static_id', opts.staticId.trim());
  }

  const url = `${FETCHER}?${qs.toString()}`;
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(url, {
    headers: { Accept: 'application/json' },
  });

  const text = await res.text();
  let parsed: SimBriefOfpJson;
  try {
    parsed = JSON.parse(text) as SimBriefOfpJson;
  } catch {
    throw new Error(
      `SimBrief returned non-JSON (HTTP ${res.status}). Check username/userid. Body: ${text.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    const msg =
      (parsed as { fetch?: { status?: string }; status?: string }).fetch?.status ??
      (parsed as { status?: string }).status ??
      text.slice(0, 200);
    throw new Error(`SimBrief fetch failed HTTP ${res.status}: ${msg}`);
  }

  // Error payloads sometimes still 200 with empty weights
  if (!parsed.fuel && !parsed.weights) {
    throw new Error(
      `SimBrief response missing fuel/weights — no recent OFP for this user? Body keys: ${Object.keys(parsed).join(',')}`,
    );
  }

  const expectation = mapSimBriefOfpToExpectation(parsed, {
    stationRoles: opts.stationRoles,
  });

  return { raw: parsed, expectation, url };
}
