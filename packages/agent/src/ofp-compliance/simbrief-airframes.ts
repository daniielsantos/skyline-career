/**
 * Resolve SimBrief public airframe Internal IDs for dispatch `type=`.
 * Source: https://www.simbrief.com/api/inputs.airframes.json
 */

const AIRFRAMES_URL = 'https://www.simbrief.com/api/inputs.airframes.json';

export interface SimBriefAirframe {
  internalId: string;
  icao: string;
  listType: string;
  comments: string;
  name: string;
  passengers: number;
}

interface RawAirframe {
  airframe_internal_id?: string;
  airframe_list_type?: string;
  airframe_icao?: string;
  airframe_comments?: string | false;
  airframe_name?: string;
  airframe_passengers?: number | string;
}

interface RawAircraftEntry {
  aircraft_icao?: string;
  airframes?: RawAirframe[];
}

export async function fetchSimBriefAirframesForIcao(
  icao: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SimBriefAirframe[]> {
  const code = icao.trim().toUpperCase();
  const res = await fetchImpl(AIRFRAMES_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`SimBrief airframes fetch failed HTTP ${res.status}`);
  }
  const all = (await res.json()) as Record<string, RawAircraftEntry>;
  const entry = all[code];
  if (!entry?.airframes?.length) {
    return [];
  }
  return entry.airframes
    .map((a): SimBriefAirframe | undefined => {
      const internalId = a.airframe_internal_id?.trim();
      if (!internalId) {
        return undefined;
      }
      const comments = typeof a.airframe_comments === 'string' ? a.airframe_comments : '';
      const passengers = Number(a.airframe_passengers);
      return {
        internalId,
        icao: (a.airframe_icao ?? code).toUpperCase(),
        listType: (a.airframe_list_type ?? code).toUpperCase(),
        comments,
        name: a.airframe_name ?? code,
        passengers: Number.isFinite(passengers) ? passengers : 0,
      };
    })
    .filter((a): a is SimBriefAirframe => a !== undefined);
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
