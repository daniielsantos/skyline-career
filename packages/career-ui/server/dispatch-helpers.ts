/**
 * Thin wrappers around agent SimBrief helpers so the career-ui API can
 * open Dispatch Redirect and fetch OFPs without going through the CLI.
 */

import {
  compareMissionIntentToOfp,
  estimateRouteCargoLimit,
  findCareerPlayerAirframe,
  formatIntentOfpCheck,
  getAircraftClass,
  KG_TO_LB,
  ofpCargoKg,
  type FreighterClassId,
  type MissionIntent,
} from '@msfs-compat/shared';
import {
  buildDispatchRedirectUrl,
  cargoWeightToThousands,
  makeStaticId,
  openDispatchInBrowser,
} from '../../agent/src/ofp-compliance/simbrief-dispatch.ts';
import {
  resolveSimBriefDispatchType,
  resolveSimBriefMaxCargoKg,
} from '../../agent/src/ofp-compliance/simbrief-airframes.ts';
import {
  fetchSimBriefLatestOfp,
  mapSimBriefOfpToBriefing,
} from '../../agent/src/ofp-compliance/simbrief-fetch.ts';

export type ClassCargoLimit = {
  maxCargoKg: number;
  source: string;
  airframeLabel: string;
  oewKg?: number;
  mtowKg?: number;
  fuelCapacityKg?: number;
};

const cargoLimitCache = new Map<string, ClassCargoLimit>();

/** Re-export shared estimator — class homologation fields live on AircraftClass. */
export { estimateRouteCargoLimit };

/** Live SimBrief freight cap for a career freighter class (cached). */
export async function resolveClassMaxCargoKg(
  aircraftClassId: FreighterClassId,
  airframeTypeId?: string,
): Promise<ClassCargoLimit> {
  const cacheKey = airframeTypeId ?? aircraftClassId;
  const cached = cargoLimitCache.get(cacheKey);
  if (cached) return cached;
  const aircraft = getAircraftClass(aircraftClassId);
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  if (
    airframe &&
    typeof airframe.maxCargoKg === 'number' &&
    airframe.maxCargoKg > 0 &&
    typeof airframe.oewKg === 'number' &&
    typeof airframe.mtowKg === 'number'
  ) {
    const value = {
      maxCargoKg: Math.floor(airframe.maxCargoKg),
      source: 'airframe-catalog',
      airframeLabel: airframe.label,
      oewKg: airframe.oewKg,
      mtowKg: airframe.mtowKg,
      fuelCapacityKg: airframe.fuelCapacityKg ?? aircraft.fuelCapacityKg,
    };
    cargoLimitCache.set(cacheKey, value);
    return value;
  }
  try {
    const resolved = await resolveSimBriefMaxCargoKg({
      simbriefIcao: airframe?.simbriefIcao ?? aircraft.simbriefIcao,
      simbriefAirframeMatch:
        airframe?.simbriefAirframeMatch ?? aircraft.simbriefAirframeMatch,
      titleHint: airframe?.label ?? aircraft.name,
    });
    const catalogCap =
      typeof airframe?.maxCargoKg === 'number' && airframe.maxCargoKg > 0
        ? Math.floor(airframe.maxCargoKg)
        : undefined;
    const value = {
      maxCargoKg: catalogCap
        ? Math.min(resolved.maxCargoKg, catalogCap)
        : resolved.maxCargoKg,
      source: catalogCap ? 'simbrief+airframe-cap' : resolved.source,
      airframeLabel: resolved.airframe.comments || resolved.airframe.name,
      oewKg: airframe?.oewKg ?? resolved.airframe.oewKg ?? aircraft.oewKg,
      mtowKg: airframe?.mtowKg ?? resolved.airframe.mtowKg ?? aircraft.mtowKg,
      fuelCapacityKg:
        airframe?.fuelCapacityKg ??
        resolved.airframe.fuelCapacityKg ??
        aircraft.fuelCapacityKg,
    };
    cargoLimitCache.set(cacheKey, value);
    return value;
  } catch {
    const value = {
      maxCargoKg: airframe?.maxCargoKg ?? aircraft.maxCargoKg,
      source: airframe?.maxCargoKg ? 'airframe-catalog' : 'class-fallback',
      airframeLabel: airframe?.label ?? aircraft.name,
      oewKg: airframe?.oewKg ?? aircraft.oewKg,
      mtowKg: airframe?.mtowKg ?? aircraft.mtowKg,
      fuelCapacityKg: airframe?.fuelCapacityKg ?? aircraft.fuelCapacityKg,
    };
    cargoLimitCache.set(cacheKey, value);
    return value;
  }
}

export type DispatchWeightSystem = 'metric' | 'imperial';

const KG_TO_LB = 2.2046226218;

function normalizeDispatchUnits(
  units?: 'KGS' | 'LBS' | DispatchWeightSystem,
): 'KGS' | 'LBS' {
  if (units === 'LBS' || units === 'imperial') return 'LBS';
  return 'KGS';
}

export async function buildMissionDispatch(
  mission: MissionIntent,
  opts: { units?: 'KGS' | 'LBS' | DispatchWeightSystem } = {},
): Promise<{
  url: string;
  staticId: string;
  type: string;
  airframeLabel: string;
  cargoThousands: number;
  units: 'KGS' | 'LBS';
}> {
  const aircraft = getAircraftClass(mission.aircraftClassId);
  const airframe = findCareerPlayerAirframe(mission.airframeTypeId);
  const resolved = await resolveSimBriefDispatchType({
    simbriefIcao: airframe?.simbriefIcao ?? aircraft.simbriefIcao,
    simbriefAirframeMatch:
      airframe?.simbriefAirframeMatch ?? aircraft.simbriefAirframeMatch,
    titleHint: airframe?.label ?? aircraft.name,
  });
  const units = normalizeDispatchUnits(opts.units);
  // A static_id identifies one dispatch revision, not the mission forever.
  // Reusing it after payload edits lets SimBrief return the previous OFP and
  // can produce a false PASS when the revised values happen to match.
  const staticId = makeStaticId('career');
  const weightInUnit =
    units === 'LBS' ? mission.cargoKg * KG_TO_LB : mission.cargoKg;
  const cargoThousands = cargoWeightToThousands(weightInUnit);
  const url = buildDispatchRedirectUrl({
    type: resolved.type,
    orig: mission.originIcao,
    dest: mission.destIcao,
    pax: 0,
    cargo: cargoThousands,
    units,
    staticId,
  });
  return {
    url,
    staticId,
    type: resolved.type,
    airframeLabel: resolved.airframe.comments || resolved.airframe.name,
    cargoThousands,
    units,
  };
}

export function openDispatchUrl(url: string): void {
  openDispatchInBrowser(url);
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
      briefing: mapSimBriefOfpToBriefing(raw),
    },
  };
}
