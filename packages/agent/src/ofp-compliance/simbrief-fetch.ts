/**
 * Fetch latest OFP from SimBrief and map to OfpExpectation fields.
 * Endpoint: https://www.simbrief.com/api/xml.fetcher.php?username=…&json=v2
 * (or userid=…) — call on user action, do not poll.
 */

import {
  normalizeOfpExpectation,
  type OfpExpectation,
  type OfpLoadSheet,
  type OfpPayloadPlan,
  type OfpStationRoleMap,
  type OfpWeightUnit,
} from '@msfs-compat/shared';

const FETCHER = 'https://www.simbrief.com/api/xml.fetcher.php';

export interface SimBriefFetchOpts {
  username?: string;
  userid?: string;
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
  };
  aircraft?: {
    icaocode?: string;
    reg?: string;
    name?: string;
  };
  fuel?: Record<string, string | number | undefined>;
  weights?: Record<string, string | number | undefined>;
  fetch?: { userid?: string; status?: string; fetchtime?: string };
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
