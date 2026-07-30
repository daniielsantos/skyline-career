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
}

interface RawAirframeOptions {
  wgtunits?: string;
  maxcargo?: number | string;
  oew?: number | string;
  mzfw?: number | string;
  mtow?: number | string;
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
 */
export function airframeMaxCargoKg(airframe: SimBriefAirframe): number | undefined {
  if (airframe.maxCargoKg !== undefined && airframe.maxCargoKg > 0) {
    return Math.floor(airframe.maxCargoKg);
  }
  if (airframe.mzfwKg !== undefined && airframe.oewKg !== undefined) {
    const structural = Math.floor(airframe.mzfwKg - airframe.oewKg);
    if (structural > 0) {
      return structural;
    }
  }
  return undefined;
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

  const hint = titleHint.toUpperCase();
  const scored = hits.map((a) => {
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
  return scored[0]?.a;
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
  const airframe = matchSimBriefAirframe(
    airframes,
    opts.simbriefAirframeMatch,
    opts.titleHint,
  );
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
  const fromMax = airframe.maxCargoKg !== undefined && airframe.maxCargoKg > 0;
  const maxCargoKg = airframeMaxCargoKg(airframe);
  if (maxCargoKg === undefined) {
    throw new Error(
      `SimBrief airframe ${airframe.internalId} has no maxcargo / mzfw-oew payload limit`,
    );
  }
  return {
    maxCargoKg,
    airframe,
    source: fromMax ? 'maxcargo' : 'mzfw-oew',
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
