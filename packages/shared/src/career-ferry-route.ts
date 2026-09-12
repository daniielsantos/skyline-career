import { CAREER_HUB_COORDS, distanceNm } from './career-economy.js';
import { assertFerryNotBush, isBushHub, isBushTripOnlyHub } from './career-bush.js';

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

type FerryCoords = Record<string, { lat: number; lon: number; name?: string }>;

type FerryAdjacency = {
  hopRangeNm: number;
  hubs: string[];
  adj: Map<string, Array<{ to: string; nm: number }>>;
  coords: FerryCoords;
};

/** Adjacency by hop range — building it is O(hubs²); reuse across plans. */
const ferryAdjByHopRange = new Map<number, FerryAdjacency>();

function ferryGraphCoords(): FerryCoords {
  return { ...CAREER_HUB_COORDS, ...FERRY_ROUTE_WAYPOINTS };
}

function resolveHopRangeNm(
  maxRangeNm: number,
  rangeMargin: number | undefined,
): number {
  const margin =
    typeof rangeMargin === 'number' &&
    Number.isFinite(rangeMargin) &&
    rangeMargin > 0 &&
    rangeMargin <= 1
      ? rangeMargin
      : FERRY_ROUTE_RANGE_MARGIN;
  return Math.floor(Math.max(0, maxRangeNm) * margin);
}

function getFerryAdjacency(hopRangeNm: number): FerryAdjacency {
  const cached = ferryAdjByHopRange.get(hopRangeNm);
  if (cached) return cached;
  const coords = ferryGraphCoords();
  const hubs = Object.keys(coords).filter(
    (icao) => !isBushHub(icao) && !isBushTripOnlyHub(icao),
  );
  // Soft-field / trip-only hubs may still be origin or final — add on demand
  // in the planner. Graph intermediates stay network hubs + waypoints only.
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
  const built: FerryAdjacency = { hopRangeNm, hubs, adj, coords };
  ferryAdjByHopRange.set(hopRangeNm, built);
  return built;
}

/**
 * Ensure origin/final exist in the adjacency even when they are trip-only /
 * bush-adjacent hubs that were filtered from the intermediate set.
 */
function ensureEndpointInGraph(
  graph: FerryAdjacency,
  icao: string,
): void {
  if (graph.adj.has(icao)) return;
  const coords = graph.coords[icao];
  if (!coords) return;
  const edges: Array<{ to: string; nm: number }> = [];
  for (const other of graph.hubs) {
    const oc = graph.coords[other];
    if (!oc) continue;
    const nm = distanceNm(coords, oc);
    if (nm > graph.hopRangeNm) continue;
    edges.push({ to: other, nm });
    graph.adj.get(other)!.push({ to: icao, nm });
  }
  graph.adj.set(icao, edges);
  graph.hubs.push(icao);
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

function buildPlanFromPrev(opts: {
  origin: string;
  finalDest: string;
  maxRangeNm: number;
  hopRangeNm: number;
  cost: Map<string, number>;
  prev: Map<string, string | null>;
}): FerryRoutePlan {
  const { origin, finalDest, maxRangeNm, hopRangeNm, cost, prev } = opts;
  const INF = Number.POSITIVE_INFINITY;
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

export type FerryRoutePlanner = {
  originIcao: string;
  maxRangeNm: number;
  hopRangeNm: number;
  /** Plan (or throw) from the planner origin to a destination. */
  planTo(finalDestIcao: string): FerryRoutePlan;
};

/**
 * Single-source ferry planner: build adjacency (cached) + Dijkstra once, then
 * O(path) lookups. Use this when estimating ferry to many charter origins.
 */
export function createFerryRoutePlanner(opts: {
  originIcao: string;
  maxRangeNm: number;
  rangeMargin?: number;
}): FerryRoutePlanner {
  const origin = opts.originIcao.trim().toUpperCase();
  const maxRangeNm = Math.max(0, opts.maxRangeNm);
  const hopRangeNm = resolveHopRangeNm(maxRangeNm, opts.rangeMargin);
  const coords = ferryGraphCoords();
  if (!coords[origin]) {
    throw new Error(`Unknown career hub: ${origin}`);
  }
  if (hopRangeNm < 50) {
    throw new Error(`Aircraft range too short to ferry (${maxRangeNm} nm)`);
  }

  const graph = getFerryAdjacency(hopRangeNm);
  ensureEndpointInGraph(graph, origin);

  const INF = Number.POSITIVE_INFINITY;
  const cost = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const icao of graph.hubs) {
    cost.set(icao, INF);
    prev.set(icao, null);
  }
  // Endpoints may have been appended after the hub seed loop.
  if (!cost.has(origin)) {
    cost.set(origin, INF);
    prev.set(origin, null);
  }
  cost.set(origin, 0);

  const unsettled = new Set(graph.hubs);
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
    for (const edge of graph.adj.get(u) ?? []) {
      if (!unsettled.has(edge.to)) continue;
      const nextCost = best + edge.nm;
      if (nextCost < (cost.get(edge.to) ?? INF)) {
        cost.set(edge.to, nextCost);
        prev.set(edge.to, u);
      }
    }
  }

  const planCache = new Map<string, FerryRoutePlan>();

  return {
    originIcao: origin,
    maxRangeNm,
    hopRangeNm,
    planTo(finalDestIcao: string): FerryRoutePlan {
      const finalDest = finalDestIcao.trim().toUpperCase();
      assertFerryNotBush(origin, finalDest);
      if (!coords[finalDest] && !graph.coords[finalDest]) {
        throw new Error(`Unknown career hub: ${finalDest}`);
      }
      if (origin === finalDest) {
        throw new Error(`Aircraft is already at ${finalDest}`);
      }
      const cached = planCache.get(finalDest);
      if (cached) return cached;

      const directNm = hubDistanceNm(origin, finalDest);
      if (directNm === undefined) {
        throw new Error(`No route distance for ${origin}→${finalDest}`);
      }
      if (directNm <= hopRangeNm) {
        const plan: FerryRoutePlan = {
          originIcao: origin,
          finalDestIcao: finalDest,
          hops: [origin, finalDest],
          legs: [
            { from: origin, to: finalDest, distanceNm: Math.round(directNm) },
          ],
          totalDistanceNm: Math.round(directNm),
          legCount: 1,
          maxRangeNm,
          hopRangeNm,
        };
        planCache.set(finalDest, plan);
        return plan;
      }

      // Dest may be trip-only / late-added — link into the static graph and
      // re-relax only from neighbors (cost from origin already known).
      ensureEndpointInGraph(graph, finalDest);
      if (!cost.has(finalDest)) {
        cost.set(finalDest, INF);
        prev.set(finalDest, null);
      }
      for (const edge of graph.adj.get(finalDest) ?? []) {
        const via = cost.get(edge.to) ?? INF;
        if (via === INF) continue;
        const nextCost = via + edge.nm;
        if (nextCost < (cost.get(finalDest) ?? INF)) {
          cost.set(finalDest, nextCost);
          prev.set(finalDest, edge.to);
        }
      }

      const plan = buildPlanFromPrev({
        origin,
        finalDest,
        maxRangeNm,
        hopRangeNm,
        cost,
        prev,
      });
      planCache.set(finalDest, plan);
      return plan;
    },
  };
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
  return createFerryRoutePlanner(opts).planTo(opts.finalDestIcao);
}
