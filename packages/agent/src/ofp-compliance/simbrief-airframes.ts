/**
 * Resolve SimBrief public airframe Internal IDs for dispatch `type=`.
 * Source: https://www.simbrief.com/api/inputs.airframes.json
 */

import { KG_TO_LB } from '@msfs-compat/shared';

const AIRFRAMES_URL = 'https://www.simbrief.com/api/inputs.airframes.json';

export interface SimBriefAirframe {
  internalId: string;
  icao: string;
  listType: string;
  comments: string;
  name: string;
  passengers: number;
  /** Soft freight cap from airframe_options.maxcargo, in kg. */
  maxCargoKg?: number;
  /** Operating empty weight from airframe_options.oew, in kg. */
  oewKg?: number;
  /** Max zero-fuel weight from airframe_options.mzfw, in kg. */
  mzfwKg?: number;
  /** Max takeoff weight from airframe_options.mtow, in kg. */
  mtowKg?: number;
  /** Maximum fuel from airframe_options.maxfuel, in kg. */
  fuelCapacityKg?: number;
}

interface RawAirframeOptions {
  wgtunits?: string;
  maxcargo?: number | string;
  oew?: number | string;
  mzfw?: number | string;
  mtow?: number | string;
  maxfuel?: number | string;
}

interface RawAirframe {
  airframe_internal_id?: string;
  airframe_list_type?: string;
  airframe_icao?: string;
  airframe_comments?: string | false;
  airframe_name?: string;
  airframe_passengers?: number | string;
  airframe_options?: RawAirframeOptions;
}

interface RawAircraftEntry {
  aircraft_icao?: string;
  airframes?: RawAirframe[];
}

let airframesCache:
  | { fetchedAtMs: number; data: Record<string, RawAircraftEntry> }
  | undefined;
const AIRFRAMES_CACHE_TTL_MS = 60 * 60 * 1000;

export async function fetchSimBriefAirframesCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, RawAircraftEntry>> {
  const now = Date.now();
  if (
    airframesCache &&
    now - airframesCache.fetchedAtMs < AIRFRAMES_CACHE_TTL_MS &&
    fetchImpl === fetch
  ) {
    return airframesCache.data;
  }
  const res = await fetchImpl(AIRFRAMES_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`SimBrief airframes fetch failed HTTP ${res.status}`);
  }
  const data = (await res.json()) as Record<string, RawAircraftEntry>;
  if (fetchImpl === fetch) {
    airframesCache = { fetchedAtMs: now, data };
  }
  return data;
}

/** Test helper — clear in-memory catalog cache. */
export function clearSimBriefAirframesCache(): void {
  airframesCache = undefined;
}

export async function fetchSimBriefAirframesForIcao(
  icao: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimBriefAirframe[]> {
  const code = icao.trim().toUpperCase();
  const all = await fetchSimBriefAirframesCatalog(fetchImpl);
  const entry = all[code];
  if (!entry?.airframes?.length) {
    return [];
  }
  return entry.airframes
    .map((a): SimBriefAirframe | undefined => mapRawAirframe(a, code))
    .filter((a): a is SimBriefAirframe => a !== undefined);
}

/**
 * Prefer explicit maxcargo; when missing/zero (common on freighters),
 * fall back to structural payload MZFW − OEW.
 *
 * Passenger GA airframes often set maxcargo to a small *freight-only* soft
 * cap (BN2 ≈ 400 lb) while useful payload is mzfw−oew (≈ 2 186 lb / EFB).
 * When maxcargo is under half of structural payload, use structural.
 */
export function airframeMaxCargoKg(airframe: SimBriefAirframe): number | undefined {
  const fromMax =
    airframe.maxCargoKg !== undefined && airframe.maxCargoKg > 0
      ? Math.floor(airframe.maxCargoKg)
      : undefined;
  let fromStruct: number | undefined;
  if (airframe.mzfwKg !== undefined && airframe.oewKg !== undefined) {
    const structural = Math.floor(airframe.mzfwKg - airframe.oewKg);
    if (structural > 0) fromStruct = structural;
  }
  if (
    fromMax !== undefined &&
    fromStruct !== undefined &&
    fromMax < fromStruct * 0.5
  ) {
    return fromStruct;
  }
  if (fromMax !== undefined) return fromMax;
  return fromStruct;
}

/** Which SimBrief weight field drove {@link airframeMaxCargoKg}. */
export function airframeMaxCargoSource(
  airframe: SimBriefAirframe,
): 'maxcargo' | 'mzfw-oew' | undefined {
  const kg = airframeMaxCargoKg(airframe);
  if (kg === undefined) return undefined;
  const fromMax =
    airframe.maxCargoKg !== undefined && airframe.maxCargoKg > 0
      ? Math.floor(airframe.maxCargoKg)
      : undefined;
  if (fromMax !== undefined && kg === fromMax) return 'maxcargo';
  return 'mzfw-oew';
}

/**
 * Map live / profile titles onto SimBrief airframe_comments regex sources.
 * Longest variant tokens first so EMB-110P1F does not collapse to EMB-110P.
 */
export function inferSimBriefAirframeMatchFromTitle(
  title: string,
): string | undefined {
  const t = title.trim();
  if (!t) return undefined;

  // NextGenSim EMB-110 family (SimBrief E110 comments).
  const nextGen = [
    { re: /\bEMB-?110\s*P1F\b/i, suffix: 'EMB-110P1F' },
    { re: /\bEMB-?110\s*P2\b/i, suffix: 'EMB-110P2' },
    { re: /\bEMB-?110\s*P1\b/i, suffix: 'EMB-110P1' },
    { re: /\bEMB-?110\s*P\b/i, suffix: 'EMB-110P' },
  ] as const;
  for (const row of nextGen) {
    if (row.re.test(t)) {
      return `NextGen Simulations \\(MSFS\\) - ${row.suffix}$`;
    }
  }
  return undefined;
}

/**
 * Prefer an anchored roles-pack match over Market/class "Default", then title
 * inference, then catalog/class fallbacks.
 */
export function preferSimBriefAirframeMatch(opts: {
  packMatch?: string | null;
  inferredFromTitle?: string | null;
  catalogMatch?: string | null;
  classMatch?: string | null;
}): string {
  const pack = opts.packMatch?.trim();
  if (pack && pack !== 'Default') return pack;
  const inferred = opts.inferredFromTitle?.trim();
  if (inferred) return inferred;
  if (pack) return pack;
  const catalog = opts.catalogMatch?.trim();
  if (catalog) return catalog;
  const classMatch = opts.classMatch?.trim();
  if (classMatch) return classMatch;
  return 'Default';
}

/**
 * Pick an airframe whose comments match `match` (regex source or plain substring).
 * When several match, prefer ones whose comments also share tokens with `titleHint`
 * (e.g. PW / GE / Dual Class).
 */
export function matchSimBriefAirframe(
  airframes: SimBriefAirframe[],
  match: string,
  titleHint?: string,
): SimBriefAirframe | undefined {
  const pattern = compileMatch(match);
  const hits = airframes.filter((a) => pattern.test(a.comments));
  if (hits.length === 0) {
    return undefined;
  }
  if (hits.length === 1 || !titleHint) {
    return hits[0];
  }

  return scoreSimBriefAirframes(hits, titleHint)[0]?.a;
}

/**
 * When roles/catalog say "Default" but SimBrief only ships a vendor pack
 * (C408 Carenado, etc.), pick the best available airframe instead of failing.
 */
export function fallbackSimBriefAirframeForDefault(
  airframes: readonly SimBriefAirframe[],
  titleHint?: string,
): SimBriefAirframe | undefined {
  if (airframes.length === 0) return undefined;
  if (airframes.length === 1) return airframes[0];
  const msfs = airframes.filter((a) => /\(MSFS\)/i.test(a.comments));
  const pool = msfs.length > 0 ? msfs : [...airframes];
  if (titleHint?.trim()) {
    return scoreSimBriefAirframes(pool, titleHint)[0]?.a ?? pool[0];
  }
  return pool[0];
}

function isDefaultSimBriefMatch(match: string): boolean {
  return match.trim().toLowerCase() === 'default';
}

function scoreSimBriefAirframes(
  airframes: readonly SimBriefAirframe[],
  titleHint: string,
): Array<{ a: SimBriefAirframe; score: number }> {
  const hint = titleHint.toUpperCase();
  const scored = airframes.map((a) => {
    let score = 0;
    const c = a.comments.toUpperCase();
    for (const token of hintTokens(hint)) {
      if (c.includes(token)) {
        score += token.length >= 4 ? 3 : 1;
      }
    }
    // Prefer non-ER when title doesn't say ER
    if (!/\bER\b/.test(hint) && /\bERF?\b/.test(c)) {
      score -= 2;
    }
    return { a, score };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored;
}

export async function resolveSimBriefDispatchType(opts: {
  /** ICAO key in airframes.json (e.g. B738, MD1F, A346). */
  simbriefIcao: string;
  /** Regex source or substring matched against airframe_comments. */
  simbriefAirframeMatch: string;
  titleHint?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ type: string; airframe: SimBriefAirframe }> {
  const airframes = await fetchSimBriefAirframesForIcao(
    opts.simbriefIcao,
    opts.fetchImpl ?? fetch,
  );
  if (airframes.length === 0) {
    throw new Error(`No SimBrief airframes for ICAO ${opts.simbriefIcao}`);
  }
  let airframe = matchSimBriefAirframe(
    airframes,
    opts.simbriefAirframeMatch,
    opts.titleHint,
  );
  if (!airframe && isDefaultSimBriefMatch(opts.simbriefAirframeMatch)) {
    airframe = fallbackSimBriefAirframeForDefault(airframes, opts.titleHint);
  }
  if (!airframe) {
    const sample = airframes
      .slice(0, 8)
      .map((a) => `  ${a.internalId} — ${a.comments || '(no comment)'}`)
      .join('\n');
    throw new Error(
      `No SimBrief airframe for ${opts.simbriefIcao} matching /${opts.simbriefAirframeMatch}/.\nAvailable:\n${sample}`,
    );
  }
  return { type: airframe.internalId, airframe };
}

/** Resolve SimBrief soft freight limit (kg) for a career freighter class match. */
export async function resolveSimBriefMaxCargoKg(opts: {
  simbriefIcao: string;
  simbriefAirframeMatch: string;
  titleHint?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ maxCargoKg: number; airframe: SimBriefAirframe; source: 'maxcargo' | 'mzfw-oew' }> {
  const { airframe } = await resolveSimBriefDispatchType(opts);
  const maxCargoKg = airframeMaxCargoKg(airframe);
  const source = airframeMaxCargoSource(airframe);
  if (maxCargoKg === undefined || !source) {
    throw new Error(
      `SimBrief airframe ${airframe.internalId} has no maxcargo / mzfw-oew payload limit`,
    );
  }
  return {
    maxCargoKg,
    airframe,
    source,
  };
}

function mapRawAirframe(a: RawAirframe, fallbackIcao: string): SimBriefAirframe | undefined {
  const internalId = a.airframe_internal_id?.trim();
  if (!internalId) {
    return undefined;
  }
  const comments = typeof a.airframe_comments === 'string' ? a.airframe_comments : '';
  const passengers = Number(a.airframe_passengers);
  const weights = parseAirframeWeightsKg(a.airframe_options);
  return {
    internalId,
    icao: (a.airframe_icao ?? fallbackIcao).toUpperCase(),
    listType: (a.airframe_list_type ?? fallbackIcao).toUpperCase(),
    comments,
    name: a.airframe_name ?? fallbackIcao,
    passengers: Number.isFinite(passengers) ? passengers : 0,
    ...weights,
  };
}

function parseAirframeWeightsKg(opts: RawAirframeOptions | undefined): {
  maxCargoKg?: number;
  oewKg?: number;
  mzfwKg?: number;
  mtowKg?: number;
  fuelCapacityKg?: number;
} {
  if (!opts) return {};
  const unit = (opts.wgtunits ?? 'LBS').toUpperCase();
  const toKg = (raw: number | string | undefined): number | undefined => {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) return undefined;
    const kg = unit === 'KGS' || unit === 'KG' ? n : n / KG_TO_LB;
    return Math.round(kg);
  };
  return {
    maxCargoKg: toKg(opts.maxcargo),
    oewKg: toKg(opts.oew),
    mzfwKg: toKg(opts.mzfw),
    mtowKg: toKg(opts.mtow),
    fuelCapacityKg: toKg(opts.maxfuel),
  };
}

function compileMatch(match: string): RegExp {
  const trimmed = match.trim();
  if (!trimmed) {
    return /.^/;
  }
  try {
    return new RegExp(trimmed, 'i');
  } catch {
    return new RegExp(escapeRegExp(trimmed), 'i');
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hintTokens(hint: string): string[] {
  const tokens = new Set<string>();
  for (const m of hint.match(/[A-Z]{2,}|\d{3,}/g) ?? []) {
    tokens.add(m);
  }
  if (/\bPW\b|PW4462/i.test(hint)) {
    tokens.add('PW');
  }
  if (/\bGE\b/i.test(hint)) {
    tokens.add('GE');
  }
  if (/DUAL\s*CLASS/i.test(hint)) {
    tokens.add('DUAL CLASS');
  }
  if (/BCF|CONVERTED\s*FREIGHTER/i.test(hint)) {
    tokens.add('CONVERTED FREIGHTER');
  }
  if (/HIGH\s*GROSS|HGW/i.test(hint)) {
    tokens.add('HIGH GROSS');
  }
  if (/STANDARD\s*GROSS|SGW/i.test(hint)) {
    tokens.add('STANDARD GROSS');
  }
  return [...tokens];
}
