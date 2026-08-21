/**
 * Thin wrappers around agent SimBrief helpers so the career-ui API can
 * build Dispatch Redirect URLs and fetch OFPs without going through the CLI.
 * The UI opens the URL in the OS browser — this process must not spawn one.
 */

import {
  canonicalCareerAirportIcao,
  clampCareerMaxCargoKg,
  compareMissionIntentToOfp,
  estimateRouteCargoLimit,
  findCareerPlayerAirframe,
  formatIntentOfpCheck,
  getAircraftClass,
  isPaxAndCargoLoadLayout,
  KG_TO_LB,
  ofpCargoKg,
  planPaxAndCargoSimBriefLoad,
  resolveAirframeFuelBurnKgPerNm,
  resolveConservativeOpsWeights,
  type FreighterClassId,
  type MissionIntent,
} from '@msfs-compat/shared';
import {
  buildDispatchRedirectUrl,
  cargoWeightToThousands,
  makeStaticId,
} from '../../agent/src/ofp-compliance/simbrief-dispatch.ts';
import {
  inferSimBriefAirframeMatchFromTitle,
  preferSimBriefAirframeMatch,
  resolveSimBriefDispatchType,
  resolveSimBriefMaxCargoKg,
  isDefaultSimBriefMatch,
  formatSimBriefAirframeLabel,
} from '../../agent/src/ofp-compliance/simbrief-airframes.ts';
import {
  fetchSimBriefLatestOfp,
  mapSimBriefOfpToBriefing,
  diagnoseSimBriefNavlog,
} from '../../agent/src/ofp-compliance/simbrief-fetch.ts';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
import { getRepoRoot } from './skyline-paths.ts';

const repoRoot = getRepoRoot();

export type ClassCargoLimit = {
  maxCargoKg: number;
  /**
   * Where the ceiling came from:
   * - `mzfw-oew` / `maxcargo` — live SimBrief airframes.json
   * - `airframe-catalog` — career-player-airframes.json (offline / API down)
   * - `class-fallback` — CAREER_AIRCRAFT_CLASSES
   */
  source: string;
  airframeLabel: string;
  oewKg?: number;
  mtowKg?: number;
  mzfwKg?: number;
  fuelCapacityKg?: number;
  fuelBurnKgPerNm?: number;
  airframeTypeId?: string;
};

const cargoLimitCache = new Map<string, ClassCargoLimit>();

/** Re-export shared estimator — class homologation fields live on AircraftClass. */
export { estimateRouteCargoLimit };

/**
 * Route ops cargo with offline conservative OEW/MTOW + station crew (same
 * rules as {@link flyableDispatchCargoKg}).
 */
export function estimateFlyableRouteCargoLimit(
  aircraftClassId: FreighterClassId,
  distanceNm: number,
  structuralMaxCargoKg: number,
  weights: {
    oewKg?: number;
    mtowKg?: number;
    fuelCapacityKg?: number;
    fuelBurnKgPerNm?: number;
    airframeTypeId?: string;
    fuelBurnMult?: number;
  } = {},
): ReturnType<typeof estimateRouteCargoLimit> {
  const catalog = findCareerPlayerAirframe(weights.airframeTypeId);
  const ops = resolveConservativeOpsWeights({
    oewKg: weights.oewKg,
    mtowKg: weights.mtowKg,
    catalogOewKg: catalog?.oewKg,
    catalogMtowKg: catalog?.mtowKg,
  });
  return estimateRouteCargoLimit(
    aircraftClassId,
    distanceNm,
    structuralMaxCargoKg,
    {
      ...weights,
      oewKg: ops.oewKg,
      mtowKg: ops.mtowKg,
      crewKg: ops.crewKg,
    },
  );
}

/** Resolve SimBrief ICAO/match preferring the live/family roles pack. */
export async function resolveDispatchSimBriefParams(opts: {
  aircraftClassId: FreighterClassId;
  airframeTypeId?: string;
  rolesPackRelPath?: string;
  liveTitle?: string | null;
}): Promise<{
  simbriefIcao: string;
  simbriefAirframeMatch: string;
  titleHint: string;
}> {
  const aircraft = getAircraftClass(opts.aircraftClassId);
  const airframe = findCareerPlayerAirframe(opts.airframeTypeId);
  // Purchased SKU pack wins over mission.rolesPackRelPath: Demand/empty/FBO
  // historically stamped the *class* pack (light_ga → Bonanza BE36) even when
  // airframeTypeId was Aerostar/Comanche/etc.
  const rolesPackRelPath =
    airframe?.rolesPackRelPath?.trim() ||
    opts.rolesPackRelPath?.trim() ||
    aircraft.rolesPackRelPath;

  let packMatch: string | undefined;
  let packIcao: string | undefined;
  let packTitle: string | undefined;
  if (rolesPackRelPath) {
    try {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath,
        liveTitle: opts.liveTitle,
        airframeTypeId: opts.airframeTypeId,
        strictAirframeMatch: false,
      });
      packMatch = roles.pack.simbriefAirframeMatch?.trim();
      packIcao = roles.pack.simbriefIcao?.trim();
      packTitle = roles.pack.matchTitles?.[0]?.trim();
    } catch {
      // Fall through to catalog / class defaults.
    }
  }

  // Prefer the purchased airframe label over a mismatched live MSFS title so
  // SimBrief Default scoring stays on the mission SKU (e.g. Caravan vs Commander).
  const titleHint =
    airframe?.label ||
    opts.liveTitle?.trim() ||
    packTitle ||
    aircraft.name;
  // With a purchased SKU, SimBrief match comes from the family-resolved roles
  // pack (live title only applies inside that family). Do not infer from a
  // mismatched live MSFS title (Commander while planning Caravan).
  const inferred = opts.airframeTypeId?.trim()
    ? undefined
    : inferSimBriefAirframeMatchFromTitle(opts.liveTitle ?? '') ??
      inferSimBriefAirframeMatchFromTitle(packTitle ?? '') ??
      inferSimBriefAirframeMatchFromTitle(airframe?.label ?? '');

  return {
    // Catalog ICAO first so a stale class pack cannot force BE36 over AEST.
    simbriefIcao:
      airframe?.simbriefIcao?.trim() ||
      packIcao ||
      aircraft.simbriefIcao,
    simbriefAirframeMatch: preferSimBriefAirframeMatch({
      packMatch,
      inferredFromTitle: inferred,
      catalogMatch: airframe?.simbriefAirframeMatch,
      classMatch: aircraft.simbriefAirframeMatch,
    }),
    titleHint,
  };
}

/**
 * Mission / staging cargo ceiling (cached).
 *
 * Online: SimBrief airframes.json via {@link resolveSimBriefMaxCargoKg}
 * (structural mzfw−oew, or credible Freight maxcargo). Catalog is offline /
 * API-failure fallback — it must not permanently override SimBrief when the
 * network works (that hid BN2 structural payload behind a stale JSON row).
 */
export async function resolveClassMaxCargoKg(
  aircraftClassId: FreighterClassId,
  airframeTypeId?: string,
  opts: {
    liveTitle?: string | null;
    /** Test seam — defaults to global fetch. */
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ClassCargoLimit> {
  const cacheKey = `${airframeTypeId ?? aircraftClassId}::${opts.liveTitle?.trim() || ''}`;
  const cached = cargoLimitCache.get(cacheKey);
  if (cached) return cached;
  const aircraft = getAircraftClass(aircraftClassId);
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  const fuelBurnKgPerNm = resolveAirframeFuelBurnKgPerNm(
    airframe?.typeId ?? airframeTypeId,
    aircraftClassId,
  );

  const finish = (value: ClassCargoLimit): ClassCargoLimit => {
    const clamped =
      clampCareerMaxCargoKg({
        maxCargoKg: value.maxCargoKg,
        oewKg: value.oewKg,
        mtowKg: value.mtowKg,
        mzfwKg: value.mzfwKg,
      }) ?? value.maxCargoKg;
    const next = { ...value, maxCargoKg: clamped };
    cargoLimitCache.set(cacheKey, next);
    return next;
  };

  // Homologated jet/heavy SKUs with full catalog weights — skip the ~1MB
  // SimBrief catalog fetch so Open SimBrief stays snappy. light_ga stays
  // SimBrief-first (BN2 soft maxcargo vs structural mzfw−oew).
  const catalogFastPath =
    aircraftClassId === 'narrow_freighter' ||
    aircraftClassId === 'wide_freighter' ||
    aircraftClassId === 'medium_piston' ||
    aircraftClassId === 'light_jet' ||
    aircraftClassId === 'light_turboprop';
  if (
    catalogFastPath &&
    airframe &&
    typeof airframe.maxCargoKg === 'number' &&
    airframe.maxCargoKg > 0 &&
    typeof airframe.oewKg === 'number' &&
    airframe.oewKg > 0 &&
    typeof airframe.mtowKg === 'number' &&
    airframe.mtowKg > 0 &&
    typeof airframe.fuelCapacityKg === 'number' &&
    airframe.fuelCapacityKg > 0
  ) {
    return finish({
      maxCargoKg: Math.floor(airframe.maxCargoKg),
      source: 'airframe-catalog',
      airframeLabel: airframe.label,
      oewKg: airframe.oewKg,
      mtowKg: airframe.mtowKg,
      fuelCapacityKg: airframe.fuelCapacityKg,
      fuelBurnKgPerNm,
      airframeTypeId: airframe.typeId,
    });
  }

  try {
    const params = await resolveDispatchSimBriefParams({
      aircraftClassId,
      airframeTypeId,
      liveTitle: opts.liveTitle,
    });
    const resolved = await resolveSimBriefMaxCargoKg({
      ...params,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    return finish({
      maxCargoKg: resolved.maxCargoKg,
      source: resolved.source,
      airframeLabel:
        airframe?.label ??
        formatSimBriefAirframeLabel(resolved.airframe, aircraft.name),
      oewKg: resolved.airframe.oewKg ?? airframe?.oewKg ?? aircraft.oewKg,
      mtowKg: resolved.airframe.mtowKg ?? airframe?.mtowKg ?? aircraft.mtowKg,
      mzfwKg: resolved.airframe.mzfwKg,
      fuelCapacityKg:
        resolved.airframe.fuelCapacityKg ??
        airframe?.fuelCapacityKg ??
        aircraft.fuelCapacityKg,
      fuelBurnKgPerNm,
      airframeTypeId: airframe?.typeId ?? airframeTypeId,
    });
  } catch {
    if (
      airframe &&
      typeof airframe.maxCargoKg === 'number' &&
      airframe.maxCargoKg > 0
    ) {
      return finish({
        maxCargoKg: Math.floor(airframe.maxCargoKg),
        source: 'airframe-catalog',
        airframeLabel: airframe.label,
        oewKg: airframe.oewKg ?? aircraft.oewKg,
        mtowKg: airframe.mtowKg ?? aircraft.mtowKg,
        fuelCapacityKg: airframe.fuelCapacityKg ?? aircraft.fuelCapacityKg,
        fuelBurnKgPerNm,
        airframeTypeId: airframe.typeId,
      });
    }
    return finish({
      maxCargoKg: aircraft.maxCargoKg,
      source: 'class-fallback',
      airframeLabel: airframe?.label ?? aircraft.name,
      oewKg: airframe?.oewKg ?? aircraft.oewKg,
      mtowKg: airframe?.mtowKg ?? aircraft.mtowKg,
      fuelCapacityKg: airframe?.fuelCapacityKg ?? aircraft.fuelCapacityKg,
      fuelBurnKgPerNm,
      airframeTypeId: airframe?.typeId ?? airframeTypeId,
    });
  }
}

/** Test helper — drop cached mission cargo ceilings. */
export function clearClassMaxCargoKgCache(): void {
  cargoLimitCache.clear();
}

export type DispatchWeightSystem = 'metric' | 'imperial';

function normalizeDispatchUnits(
  units?: 'KGS' | 'LBS' | DispatchWeightSystem,
): 'KGS' | 'LBS' {
  if (units === 'LBS' || units === 'imperial') return 'LBS';
  return 'KGS';
}

/**
 * Cargo kg Skyline should hand SimBrief / inject — never above the route
 * fuel+MTOW ops cap (mission booking can still be stale from older accepts).
 *
 * Offline only: heavier catalog OEW vs SimBrief + default station crew under
 * MTOW (no live EMPTY/MTOW probe — catalog is the MSFS stand-in).
 */
export function flyableDispatchCargoKg(
  mission: Pick<
    MissionIntent,
    'cargoKg' | 'aircraftClassId' | 'airframeTypeId'
  >,
  distanceNm: number,
  structuralMaxCargoKg: number,
  weights: {
    oewKg?: number;
    mtowKg?: number;
    fuelCapacityKg?: number;
    fuelBurnKgPerNm?: number;
    airframeTypeId?: string;
    fuelBurnMult?: number;
  } = {},
  opts: {
    /** Station crew reserved under MTOW (kg). Default 2×170 lb. */
    crewKg?: number;
  } = {},
): {
  cargoKg: number;
  operationalMaxCargoKg: number;
  fuelFeasible: boolean;
  estimatedBlockFuelKg: number;
  fuelCapacityKg: number;
  fuelDeficitKg: number;
} {
  const catalog = findCareerPlayerAirframe(
    weights.airframeTypeId ?? mission.airframeTypeId,
  );
  const ops = resolveConservativeOpsWeights({
    oewKg: weights.oewKg,
    mtowKg: weights.mtowKg,
    catalogOewKg: catalog?.oewKg,
    catalogMtowKg: catalog?.mtowKg,
    crewKg: opts.crewKg,
  });

  const route = estimateRouteCargoLimit(
    mission.aircraftClassId,
    distanceNm,
    structuralMaxCargoKg,
    {
      ...weights,
      oewKg: ops.oewKg,
      mtowKg: ops.mtowKg,
      fuelCapacityKg: weights.fuelCapacityKg ?? catalog?.fuelCapacityKg,
      fuelBurnKgPerNm: weights.fuelBurnKgPerNm ?? catalog?.fuelBurnKgPerNm,
      airframeTypeId: weights.airframeTypeId ?? mission.airframeTypeId,
      crewKg: ops.crewKg,
    },
  );
  const booked = Math.max(0, Math.floor(mission.cargoKg));
  const cap = route.fuelFeasible
    ? Math.max(0, Math.floor(route.operationalMaxCargoKg))
    : 0;
  return {
    cargoKg: Math.min(booked, cap),
    operationalMaxCargoKg: cap,
    fuelFeasible: route.fuelFeasible,
    estimatedBlockFuelKg: route.estimatedBlockFuelKg,
    fuelCapacityKg: route.fuelCapacityKg,
    fuelDeficitKg: route.fuelDeficitKg,
  };
}

export async function buildMissionDispatch(
  mission: MissionIntent,
  opts: {
    units?: 'KGS' | 'LBS' | DispatchWeightSystem;
    liveTitle?: string | null;
    /**
     * Prefill cargo (kg). Defaults to mission.cargoKg. Pass the route ops cap
     * so SimBrief is not asked for more freight than inject can load.
     */
    cargoKg?: number;
    /** Test seam — defaults to global fetch. */
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{
  url: string;
  staticId: string;
  type: string;
  airframeLabel: string;
  cargoThousands: number;
  cargoKg: number;
  units: 'KGS' | 'LBS';
  /** SimBrief cabin seats used for pax_and_cargo prefill (when resolved). */
  maxPaxSeats?: number;
}> {
  const params = await resolveDispatchSimBriefParams({
    aircraftClassId: mission.aircraftClassId,
    airframeTypeId: mission.airframeTypeId,
    rolesPackRelPath: mission.rolesPackRelPath,
    liveTitle: opts.liveTitle,
  });
  // "Default" match → use ICAO as SimBrief type (B703, etc.) and skip the
  // multi-MB airframes.json round-trip on Open SimBrief — unless we need
  // airframe_passengers for pax_and_cargo.
  const careerAirframe = findCareerPlayerAirframe(mission.airframeTypeId);
  const needsSimBriefAirframeRow =
    isPaxAndCargoLoadLayout(careerAirframe) ||
    !isDefaultSimBriefMatch(params.simbriefAirframeMatch);

  let type: string;
  let airframeLabel: string;
  let simBriefPassengers = 0;
  if (!needsSimBriefAirframeRow) {
    type = params.simbriefIcao.trim().toUpperCase();
    airframeLabel = params.titleHint || type;
  } else {
    const resolved = await resolveSimBriefDispatchType({
      simbriefIcao: params.simbriefIcao,
      simbriefAirframeMatch: params.simbriefAirframeMatch,
      titleHint: params.titleHint,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    type = isDefaultSimBriefMatch(params.simbriefAirframeMatch)
      ? params.simbriefIcao.trim().toUpperCase()
      : resolved.type;
    airframeLabel = formatSimBriefAirframeLabel(
      resolved.airframe,
      params.titleHint,
    );
    simBriefPassengers = resolved.airframe.passengers;
  }
  const units = normalizeDispatchUnits(opts.units);
  // A static_id identifies one dispatch revision, not the mission forever.
  // Reusing it after payload edits lets SimBrief return the previous OFP and
  // can produce a false PASS when the revised values happen to match.
  const staticId = makeStaticId('career');
  const cargoKg = Math.max(
    0,
    Math.floor(
      typeof opts.cargoKg === 'number' && Number.isFinite(opts.cargoKg)
        ? opts.cargoKg
        : mission.cargoKg,
    ),
  );
  const weightInUnit = units === 'LBS' ? cargoKg * KG_TO_LB : cargoKg;
  const cargoThousands = cargoWeightToThousands(weightInUnit);
  // light_ga SimBrief airframes (BN2, Comanche, …) drive load via Payload, not
  // Freight — cargo= hits a small maxcargo soft-cap while manualpayload fills
  // the field that matches EFB useful load.
  const usePayloadPrefill = mission.aircraftClassId === 'light_ga';
  // Navigraph SimBrief EFB (MSFS) refuses IMPORT WEIGHTS with pax=0:
  // "Expecting at least one passenger (pilot)". Mission intent stays pax=0;
  // compareMissionIntentToOfp allows +1 via maxExtraPax (or maxPaxSeats).
  let maxPaxSeatsResolved: number | undefined;
  let paxAndCargo: ReturnType<typeof planPaxAndCargoSimBriefLoad> | null = null;
  if (!usePayloadPrefill && isPaxAndCargoLoadLayout(careerAirframe)) {
    const catalogFallback =
      typeof careerAirframe?.maxPaxSeats === 'number' && careerAirframe.maxPaxSeats > 0
        ? careerAirframe.maxPaxSeats
        : 0;
    const maxPax =
      simBriefPassengers > 0
        ? simBriefPassengers
        : catalogFallback > 0
          ? catalogFallback
          : 1;
    maxPaxSeatsResolved = maxPax;
    paxAndCargo = planPaxAndCargoSimBriefLoad({ cargoKg, maxPax });
  }
  const dispatchPax = paxAndCargo?.pax ?? 1;
  const dispatchCargoKg = paxAndCargo?.cargoKg ?? cargoKg;
  const freightThousands = cargoWeightToThousands(
    units === 'LBS' ? dispatchCargoKg * KG_TO_LB : dispatchCargoKg,
  );
  const url = buildDispatchRedirectUrl({
    type,
    orig: canonicalCareerAirportIcao(mission.originIcao),
    dest: canonicalCareerAirportIcao(mission.destIcao),
    pax: dispatchPax,
    ...(usePayloadPrefill
      ? { manualPayload: cargoThousands }
      : { cargo: freightThousands }),
    units,
    staticId,
  });
  return {
    url,
    staticId,
    type,
    airframeLabel,
    cargoThousands: usePayloadPrefill ? cargoThousands : freightThousands,
    cargoKg,
    units,
    ...(maxPaxSeatsResolved !== undefined
      ? { maxPaxSeats: maxPaxSeatsResolved }
      : {}),
  };
}

/**
 * Resolve structural + route ops cap, then build a SimBrief URL whose cargo=
 * matches what inject can actually load (not a stale overbooked mission kg).
 */
export async function buildFlyableMissionDispatch(
  mission: MissionIntent,
  distanceNm: number,
  opts: {
    units?: 'KGS' | 'LBS' | DispatchWeightSystem;
    liveTitle?: string | null;
    /** Test seam — defaults to global fetch. */
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{
  built: Awaited<ReturnType<typeof buildMissionDispatch>>;
  flyable: ReturnType<typeof flyableDispatchCargoKg>;
  cargoLimit: ClassCargoLimit;
}> {
  const cargoLimit = await resolveClassMaxCargoKg(
    mission.aircraftClassId,
    mission.airframeTypeId,
    {
      liveTitle: opts.liveTitle,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    },
  );
  const flyable = flyableDispatchCargoKg(
    mission,
    distanceNm,
    cargoLimit.maxCargoKg,
    cargoLimit,
  );
  if (!flyable.fuelFeasible) {
    throw new Error(
      `Estimated block fuel ${flyable.estimatedBlockFuelKg} kg exceeds ` +
        `tank capacity ${flyable.fuelCapacityKg} kg ` +
        `(deficit ${flyable.fuelDeficitKg} kg)`,
    );
  }
  const built = await buildMissionDispatch(mission, {
    units: opts.units,
    liveTitle: opts.liveTitle,
    cargoKg: flyable.cargoKg,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  return { built, flyable, cargoLimit };
}

export async function confirmMissionOfp(
  mission: MissionIntent,
  opts: { username?: string; userid?: string },
): Promise<{
  check: ReturnType<typeof compareMissionIntentToOfp>;
  summary: string;
  ofp: {
    originIcao?: string;
    destIcao?: string;
    icao?: string;
    cargoKg?: number;
    passengerCount?: number;
    blockFuel?: number;
    blockFuelKg?: number;
    ofpId?: string;
    briefing: ReturnType<typeof mapSimBriefOfpToBriefing>;
    navlogDiag?: ReturnType<typeof diagnoseSimBriefNavlog>;
  };
}> {
  if (!mission.staticId) {
    throw new Error('Mission has no static_id — Dispatch first');
  }
  const username = opts.username?.trim() || process.env.SIMBRIEF_USERNAME?.trim();
  const userid = opts.userid?.trim() || process.env.SIMBRIEF_USERID?.trim();
  if (!username && !userid) {
    throw new Error(
      'SimBrief username required — set it in the UI or SIMBRIEF_USERNAME env',
    );
  }

  const { expectation, raw } = await fetchSimBriefLatestOfp({
    username,
    userid,
    staticId: mission.staticId,
  });
  const check = compareMissionIntentToOfp(mission, expectation);
  const briefing = mapSimBriefOfpToBriefing(raw);
  return {
    check,
    summary: formatIntentOfpCheck(check),
    ofp: {
      originIcao: expectation.originIcao,
      destIcao: expectation.destIcao,
      icao: expectation.icao,
      cargoKg: ofpCargoKg(expectation),
      passengerCount: expectation.loadSheet?.passengerCount,
      blockFuel: expectation.loadSheet?.blockFuel,
      blockFuelKg:
        expectation.loadSheet?.blockFuel === undefined
          ? undefined
          : expectation.loadSheet.unit === 'lb'
            ? expectation.loadSheet.blockFuel / KG_TO_LB
            : expectation.loadSheet.blockFuel,
      ofpId: expectation.ofpId,
      briefing,
      navlogDiag: diagnoseSimBriefNavlog(raw),
    },
  };
}
