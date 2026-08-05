import { CAREER_HUB_COORDS, distanceNm } from './career-economy.js';

/** Planning margin vs airframe max range (leave headroom for winds / burn). */
export const FERRY_ROUTE_RANGE_MARGIN = 0.92;

/**
 * Ferry-only stepping stones bridging geographic gaps between career hubs
 * (e.g. northern Brazil ↔ Caribbean ↔ Florida). Not economy terminals.
 */
export const FERRY_ROUTE_WAYPOINTS: Readonly<
  Record<string, { lat: number; lon: number; name: string }>
> = {
  SMJP: { lat: 5.4528, lon: -55.1878, name: 'Paramaribo' },
  SOCA: { lat: 4.8198, lon: -52.3604, name: 'Cayenne' },
  TNCC: { lat: 12.1889, lon: -68.9598, name: 'Curaçao' },
  TBPB: { lat: 13.0746, lon: -59.4925, name: 'Barbados' },
  TNCM: { lat: 18.0595, lon: -63.1107, name: 'St. Maarten' },
  MKJP: { lat: 17.9357, lon: -76.7875, name: 'Kingston' },
  MUHA: { lat: 22.9892, lon: -82.4091, name: 'Havana' },
  MYNN: { lat: 25.039, lon: -77.466, name: 'Nassau' },
  TKPK: { lat: 17.3112, lon: -62.7187, name: 'Basseterre' },
  TFFF: { lat: 14.591, lon: -61.0032, name: 'Martinique' },
};

export type FerryRouteLeg = {
  from: string;
  to: string;
  distanceNm: number;
};

export type FerryRoutePlan = {
  originIcao: string;
  finalDestIcao: string;
  /** Inclusive ICAO chain origin … final. */
  hops: string[];
  legs: FerryRouteLeg[];
  totalDistanceNm: number;
  legCount: number;
  maxRangeNm: number;
  /** Effective max hop length used while planning. */
  hopRangeNm: number;
};

function ferryGraphCoords(): Record<
  string,
  { lat: number; lon: number; name?: string }
> {
  return { ...CAREER_HUB_COORDS, ...FERRY_ROUTE_WAYPOINTS };
}

export function hubDistanceNm(
  originIcao: string,
  destIcao: string,
): number | undefined {
  const a = originIcao.trim().toUpperCase();
  const b = destIcao.trim().toUpperCase();
  if (a === b) return 0;
  const coords = ferryGraphCoords();
  const ac = coords[a];
  const bc = coords[b];
  if (!ac || !bc) return undefined;
  return distanceNm(ac, bc);
}

export function remainingNmToFinal(
  currentIcao: string,
  finalIcao: string,
): number | undefined {
  return hubDistanceNm(currentIcao, finalIcao);
}

/** 0..100 how much closer to final vs the journey start great-circle. */
export function ferryProgressPct(
  initialNm: number,
  remainingNm: number,
): number {
  if (!Number.isFinite(initialNm) || initialNm <= 0) return 0;
  if (!Number.isFinite(remainingNm) || remainingNm < 0) return 100;
  const closer = Math.max(0, initialNm - remainingNm);
  return Math.max(0, Math.min(100, Math.round((closer / initialNm) * 100)));
}

export function nextFerryLeg(
  plan: FerryRoutePlan,
  currentIcao: string,
): FerryRouteLeg | null {
  const here = currentIcao.trim().toUpperCase();
  const final = plan.finalDestIcao.trim().toUpperCase();
  if (here === final) return null;
  const idx = plan.hops.findIndex((h) => h === here);
  if (idx >= 0 && idx < plan.legs.length) {
    return plan.legs[idx] ?? null;
  }
  // Aircraft left the planned path — caller should replan from here.
  return plan.legs[0] ?? null;
}

export function isFerryRouteWaypoint(icao: string): boolean {
  return Boolean(FERRY_ROUTE_WAYPOINTS[icao.trim().toUpperCase()]);
}

/**
 * Multi-hop ferry plan over career hubs + ferry stepping stones.
 * Each hop is ≤ maxRangeNm × margin.
 */
export function planFerryRoute(opts: {
  originIcao: string;
  finalDestIcao: string;
  maxRangeNm: number;
  rangeMargin?: number;
}): FerryRoutePlan {
  const origin = opts.originIcao.trim().toUpperCase();
  const finalDest = opts.finalDestIcao.trim().toUpperCase();
  const maxRangeNm = Math.max(0, opts.maxRangeNm);
  const margin =
    typeof opts.rangeMargin === 'number' &&
    Number.isFinite(opts.rangeMargin) &&
    opts.rangeMargin > 0 &&
    opts.rangeMargin <= 1
      ? opts.rangeMargin
      : FERRY_ROUTE_RANGE_MARGIN;
  const hopRangeNm = Math.floor(maxRangeNm * margin);
  const coords = ferryGraphCoords();

  if (!coords[origin]) {
    throw new Error(`Unknown career hub: ${origin}`);
  }
  if (!coords[finalDest]) {
    throw new Error(`Unknown career hub: ${finalDest}`);
  }
  if (origin === finalDest) {
    throw new Error(`Aircraft is already at ${finalDest}`);
  }
  if (hopRangeNm < 50) {
    throw new Error(`Aircraft range too short to ferry (${maxRangeNm} nm)`);
  }

  const directNm = hubDistanceNm(origin, finalDest);
  if (directNm === undefined) {
    throw new Error(`No route distance for ${origin}→${finalDest}`);
  }

  if (directNm <= hopRangeNm) {
    return {
      originIcao: origin,
      finalDestIcao: finalDest,
      hops: [origin, finalDest],
      legs: [{ from: origin, to: finalDest, distanceNm: Math.round(directNm) }],
      totalDistanceNm: Math.round(directNm),
      legCount: 1,
      maxRangeNm,
      hopRangeNm,
    };
  }

  const hubs = Object.keys(coords);

  // Adjacency: undirected hop ≤ hopRange.
  const adj = new Map<string, Array<{ to: string; nm: number }>>();
  for (const icao of hubs) adj.set(icao, []);
  for (let i = 0; i < hubs.length; i++) {
    const a = hubs[i]!;
    const aCoords = coords[a]!;
    for (let j = i + 1; j < hubs.length; j++) {
      const b = hubs[j]!;
      const nm = distanceNm(aCoords, coords[b]!);
      if (nm > hopRangeNm) continue;
      adj.get(a)!.push({ to: b, nm });
      adj.get(b)!.push({ to: a, nm });
    }
  }

  // Dijkstra: cost = path nm.
  const INF = Number.POSITIVE_INFINITY;
  const cost = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const icao of hubs) {
    cost.set(icao, INF);
    prev.set(icao, null);
  }
  cost.set(origin, 0);

  const unsettled = new Set(hubs);
  while (unsettled.size > 0) {
    let u: string | null = null;
    let best = INF;
    for (const icao of unsettled) {
      const c = cost.get(icao) ?? INF;
      if (c < best) {
        best = c;
        u = icao;
      }
    }
    if (u === null || best === INF) break;
    unsettled.delete(u);
    if (u === finalDest) break;

    for (const edge of adj.get(u) ?? []) {
      if (!unsettled.has(edge.to)) continue;
      const nextCost = best + edge.nm;
      if (nextCost < (cost.get(edge.to) ?? INF)) {
        cost.set(edge.to, nextCost);
        prev.set(edge.to, u);
      }
    }
  }

  if ((cost.get(finalDest) ?? INF) === INF) {
    throw new Error(
      `No hub chain within ${hopRangeNm} nm hops from ${origin} to ${finalDest} (aircraft range ${maxRangeNm} nm)`,
    );
  }

  const hopsRev: string[] = [];
  let cur: string | null = finalDest;
  while (cur) {
    hopsRev.push(cur);
    if (cur === origin) break;
    cur = prev.get(cur) ?? null;
  }
  if (hopsRev[hopsRev.length - 1] !== origin) {
    throw new Error(
      `No hub chain within ${hopRangeNm} nm hops from ${origin} to ${finalDest} (aircraft range ${maxRangeNm} nm)`,
    );
  }
  const hops = hopsRev.reverse();
  const legs: FerryRouteLeg[] = [];
  let total = 0;
  for (let i = 0; i < hops.length - 1; i++) {
    const from = hops[i]!;
    const to = hops[i + 1]!;
    const nm = hubDistanceNm(from, to) ?? 0;
    legs.push({ from, to, distanceNm: Math.round(nm) });
    total += nm;
    if (nm > hopRangeNm + 0.5) {
      throw new Error(
        `Planned hop ${from}→${to} exceeds range (${Math.round(nm)} nm)`,
      );
    }
  }

  return {
    originIcao: origin,
    finalDestIcao: finalDest,
    hops,
    legs,
    totalDistanceNm: Math.round(total),
    legCount: legs.length,
    maxRangeNm,
    hopRangeNm,
  };
}
