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
 * Minimum maxcargo/structural ratio that still looks like a real freighter
 * Freight rating (B738 BCF ≈ 0.78). Below this, maxcargo is treated as a GA
 * Freight soft-cap (BN2 ≈ 0.18) and Skyline uses mzfw−oew instead.
 */
export const SIMBRIEF_CREDIBLE_FREIGHT_RATIO = 0.5;

/**
 * Mission payload ceiling from one SimBrief airframe row.
 *
 * - **mzfw−oew** — structural zero-fuel leftover (people + bags + cargo)
 * - **maxcargo** — SimBrief Freight field (often a soft-cap on GA)
 *
 * Prefer structural when known. Keep maxcargo only when it is a credible
 * freighter rating (≥ {@link SIMBRIEF_CREDIBLE_FREIGHT_RATIO} of structural)
 * so B738/MD11 missions stay inside SimBrief Freight; ignore tiny GA caps.
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
  if (fromStruct !== undefined) {
    if (
      fromMax !== undefined &&
      fromMax >= fromStruct * SIMBRIEF_CREDIBLE_FREIGHT_RATIO
    ) {
      return fromMax;
    }
    return fromStruct;
  }
  return fromMax;
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

  const justFlightF100 = inferJustFlightF100SimBriefMatch(t);
  if (justFlightF100) return justFlightF100;
  const justFlightF28 = inferJustFlightF28SimBriefMatch(t);
  if (justFlightF28) return justFlightF28;
  if (/\bJust Flight F70\b/i.test(t)) {
    return 'Just Flight \\(MSFS\\) - 70 Passengers';
  }
  if (/A320neo\s*V2\b/i.test(t)) {
    return 'iniBuilds \\(MSFS\\) - A320neo V2';
  }
  const inibuildsA350 = inferIniBuildsA350SimBriefMatch(t);
  if (inibuildsA350) return inibuildsA350;
  if (/\bA321LR\b/i.test(t) || /^A321$/i.test(t)) {
    return 'iniBuilds \\(MSFS\\) - A321LR LEAP-1A';
  }
  if (/Fly The Maddog X MD-8[238]\s+20th/i.test(t)) {
    return 'Leonardo Maddog \\(MSFS\\) - Y162 Config';
  }
  const pmdg772 = inferPmdg777200erSimBriefMatch(t);
  if (pmdg772) return pmdg772;
  const tfdiMd11 = inferTfdiMd11fSimBriefMatch(t);
  if (tfdiMd11) return tfdiMd11;
  if (/\b777-200LR\b/i.test(t)) {
    return 'PMDG \\(MSFS\\) - Standard';
  }
  if (/\b777-300ER\b/i.test(t)) {
    return 'PMDG \\(MSFS\\) - 777,000 MTOW';
  }
  if (/\b777F\b/i.test(t)) {
    return 'PMDG \\(MSFS\\) - 766,800 MTOW';
  }
  const fenixA320 = inferFenixA320SimBriefMatch(t);
  if (fenixA320) return fenixA320;
  const fenixA321 = inferFenixA321SimBriefMatch(t);
  if (fenixA321) return fenixA321;
  const fenixA319 = inferFenixA319SimBriefMatch(t);
  if (fenixA319) return fenixA319;
  return undefined;
}

/**
 * True when the spawned MSFS title belongs to this Market SKU, so live-title
 * SimBrief inference is safe (F100 door configs — not Caravan vs Commander).
 */
export function liveTitleMatchesMarketSku(
  liveTitle: string,
  airframeTypeId: string,
): boolean {
  const t = liveTitle.trim();
  const id = airframeTypeId.trim();
  if (!t || !id) return false;
  if (id === 'justflight-f100') return /\bJust Flight F100\b/i.test(t);
  if (id === 'justflight-f70') return /\bJust Flight F70\b/i.test(t);
  if (id === 'justflight-fokker-f28') {
    return /Just Flight Fokker F28-(?:1000|2000|3000|4000)/i.test(t);
  }
  if (id === 'microsoft-a320neo-v2') return /A320neo\s*V2\b/i.test(t);
  if (id === 'microsoft-a321lr') {
    return /(?:Microsoft\s+)?A321LR\b/i.test(t) || /^A321$/i.test(t);
  }
  if (id === 'fenix-a320') return /FenixA320\s+(?:CFM|IAE)\s+(?:SL|WF)\b/i.test(t);
  if (id === 'fenix-a321') {
    return /FenixA321\s+(?:CFM|IAE)\s+(?:SL|WF)\s+(?:TC|SC)\b/i.test(t);
  }
  if (id === 'fenix-a319') {
    return /FenixA319\s+(?:CFM|IAE)\s+(?:SL|WF)\s+(?:HD|SD)\b/i.test(t);
  }
  if (id === 'leonardo-fly-the-maddog-x-md-82-20th') {
    return /Fly The Maddog X MD-82 20th/i.test(t);
  }
  if (id === 'leonardo-fly-the-maddog-x-md-83-20th') {
    return /Fly The Maddog X MD-83 20th/i.test(t);
  }
  if (id === 'leonardo-fly-the-maddog-x-md-88-20th') {
    return /Fly The Maddog X MD-88 20th/i.test(t);
  }
  if (id === 'inibuilds-a350-900-ulr') {
    return /\bA350-900\s*ULR\b/i.test(t) || /\bA350-900ULR\b/i.test(t);
  }
  if (id === 'inibuilds-a350-900-default-cabin') {
    return /\bA350-900\b/i.test(t) && !/\bULR\b/i.test(t);
  }
  if (id === 'inibuilds-a350-1000-default-cabin') {
    return /\bA350-1000\b/i.test(t);
  }
  if (id === 'pmdg-777-200er') {
    return /\b777-200ER(?:\s+(?:RR|PW|GE))?\b/i.test(t);
  }
  if (id === 'pmdg-777-200lr') {
    return /\b777-200LR\b/i.test(t);
  }
  if (id === 'pmdg-777-300er') {
    return /\b777-300ER\b/i.test(t);
  }
  if (id === 'pmdg-777f') {
    return /\b777F\b/i.test(t);
  }
  if (id === 'tfdi-md11f-family') {
    return /TFDi Design MD-11F/i.test(t);
  }
  return false;
}

/** TFDi MD-11F — engine preset picks the SimBrief MD1F row (GE vs PW). */
function inferTfdiMd11fSimBriefMatch(title: string): string | undefined {
  if (!/TFDi Design MD-11/i.test(title) && !/\bMD-11F\b/i.test(title)) {
    return undefined;
  }
  const isErf = /\bMD-11\s*ERF\b/i.test(title) || /\bMD-11ERF\b/i.test(title);
  const isPw = /\bPW\b/i.test(title) || /PW4462/i.test(title);
  const isGe = /\bGE\b/i.test(title);
  if (isErf) {
    if (isPw) return 'TFDi Design \\(MSFS\\) - MD-11ERF PW';
    if (isGe) return 'TFDi Design \\(MSFS\\) - MD-11ERF GE';
    return undefined;
  }
  if (isPw) return 'TFDi Design \\(MSFS\\) - MD-11F PW';
  if (isGe) return 'TFDi Design \\(MSFS\\) - MD-11F GE';
  return undefined;
}

/** PMDG 777-200ER — engine suffix picks the SimBrief B772 row (Default MTOW). */
function inferPmdg777200erSimBriefMatch(title: string): string | undefined {
  if (/\b777-200ER\s+GE\b/i.test(title)) {
    return 'PMDG \\(MSFS\\) - GE90-94B - Default MTOW';
  }
  if (/\b777-200ER\s+PW\b/i.test(title)) {
    return 'PMDG \\(MSFS\\) - PW4092 - Default MTOW';
  }
  if (/\b777-200ER(?:\s+RR)?\b/i.test(title)) {
    return 'PMDG \\(MSFS\\) - Trent 892 - Default MTOW';
  }
  return undefined;
}

/** iniBuilds A350 family — ULR before -900 (substring). */
function inferIniBuildsA350SimBriefMatch(title: string): string | undefined {
  if (/\bA350-900\s*ULR\b/i.test(title) || /\bA350-900ULR\b/i.test(title)) {
    return 'iniBuilds \\(MSFS\\) - A350-900ULR';
  }
  if (/\bA350-900\b/i.test(title)) {
    return 'iniBuilds \\(MSFS\\) - A350-900$';
  }
  if (/\bA350-1000\b/i.test(title)) {
    return 'iniBuilds \\(MSFS\\) - A350-1000';
  }
  return undefined;
}

function inferFenixCeoSimBriefMatch(
  title: string,
  icao: 'A319' | 'A320' | 'A321',
): string | undefined {
  const token =
    icao === 'A319'
      ? /FenixA319\b/i
      : icao === 'A321'
        ? /FenixA321\b/i
        : /FenixA320\b/i;
  if (!token.test(title)) return undefined;
  const iae = /\bIAE\b/i.test(title);
  const sl = /\bSL\b/i.test(title);
  const eng = iae ? 'IAE' : 'CFM';
  if (sl) {
    return `Fenix Simulations \\(MSFS\\) - ${icao} ${eng} \\(SL\\)`;
  }
  if (/\bWF\b/i.test(title) || /\bCFM\b/i.test(title) || iae) {
    return `Fenix Simulations \\(MSFS\\) - ${icao} ${eng}$`;
  }
  return undefined;
}

/** Fenix A320: WF → CFM/IAE row; SL → CFM/IAE (SL) row. */
function inferFenixA320SimBriefMatch(title: string): string | undefined {
  return inferFenixCeoSimBriefMatch(title, 'A320');
}

function inferFenixA319SimBriefMatch(title: string): string | undefined {
  return inferFenixCeoSimBriefMatch(title, 'A319');
}

/** Fenix A321: WF → CFM/IAE row; SL → CFM/IAE (SL) row. TC/SC ignored (like A319 HD/SD). */
function inferFenixA321SimBriefMatch(title: string): string | undefined {
  return inferFenixCeoSimBriefMatch(title, 'A321');
}

/** SimBrief F28 has no Default type — only JF Mk.1000/2000/3000/4000 rows. */
function inferJustFlightF28SimBriefMatch(title: string): string | undefined {
  const mk = title.match(/Just Flight Fokker F28-(1000|2000|3000|4000)/i);
  if (!mk) return undefined;
  return `Just Flight \\(MSFS\\) - Fokker F28 Mk.${mk[1]}`;
}

/** MSFS uses Airstairs / Cargo Door; SimBrief comments use Stairs / Cargo. */
function inferJustFlightF100SimBriefMatch(title: string): string | undefined {
  if (!/\bJust Flight F100\b/i.test(title)) return undefined;
  const stairs = /integral\s+airstairs|integral\s+stairs/i.test(title);
  const sliding = /sliding\s+door/i.test(title);
  const small = /small\s+cargo/i.test(title);
  const large = /large\s+cargo/i.test(title);
  const l2 = /\bL2\s+door\b/i.test(title);
  if (l2 && stairs && small) {
    return 'Just Flight \\(MSFS\\) - 98 Pax, L2 Door, Integral Stairs, Small Cargo';
  }
  if (sliding && large) {
    return 'Just Flight \\(MSFS\\) - 100 Pax, Sliding Door, Large Cargo';
  }
  if (stairs && large) {
    return 'Just Flight \\(MSFS\\) - 100 Pax, Integral Stairs, Large Cargo';
  }
  if (stairs && small) {
    return 'Just Flight \\(MSFS\\) - 100 Pax, Integral Stairs, Small Cargo';
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
  const catalog = opts.catalogMatch?.trim();
  if (catalog && catalog !== 'Default') return catalog;
  if (pack) return pack;
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

export function isDefaultSimBriefMatch(match: string): boolean {
  return match.trim().toLowerCase() === 'default';
}

/** Prefer real airframe name over SimBrief's literal "Default" comment. */
export function formatSimBriefAirframeLabel(
  airframe: Pick<SimBriefAirframe, 'comments' | 'name' | 'internalId'>,
  fallback?: string,
): string {
  const comments = airframe.comments?.trim() ?? '';
  if (comments && !isDefaultSimBriefMatch(comments)) return comments;
  const name = airframe.name?.trim() ?? '';
  if (name) return name;
  const fb = fallback?.trim() ?? '';
  if (fb) return fb;
  return airframe.internalId;
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
