/**
 * Thin wrappers around agent SimBrief helpers so the career-ui API can
 * open Dispatch Redirect and fetch OFPs without going through the CLI.
 */

import {
  compareMissionIntentToOfp,
  formatIntentOfpCheck,
  getAircraftClass,
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
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';

const cargoLimitCache = new Map<
  FreighterClassId,
  { maxCargoKg: number; source: string; airframeLabel: string }
>();

/** Live SimBrief freight cap for a career freighter class (cached). */
export async function resolveClassMaxCargoKg(
  aircraftClassId: FreighterClassId,
): Promise<{ maxCargoKg: number; source: string; airframeLabel: string }> {
  const cached = cargoLimitCache.get(aircraftClassId);
  if (cached) return cached;
  const aircraft = getAircraftClass(aircraftClassId);
  try {
    const resolved = await resolveSimBriefMaxCargoKg({
      simbriefIcao: aircraft.simbriefIcao,
      simbriefAirframeMatch: aircraft.simbriefAirframeMatch,
      titleHint: aircraft.name,
    });
    const value = {
      maxCargoKg: resolved.maxCargoKg,
      source: resolved.source,
      airframeLabel: resolved.airframe.comments || resolved.airframe.name,
    };
    cargoLimitCache.set(aircraftClassId, value);
    return value;
  } catch {
    const value = {
      maxCargoKg: aircraft.maxCargoKg,
      source: 'class-fallback',
      airframeLabel: aircraft.name,
    };
    cargoLimitCache.set(aircraftClassId, value);
    return value;
  }
}

export async function buildMissionDispatch(mission: MissionIntent): Promise<{
  url: string;
  staticId: string;
  type: string;
  airframeLabel: string;
  cargoThousands: number;
}> {
  const aircraft = getAircraftClass(mission.aircraftClassId);
  const resolved = await resolveSimBriefDispatchType({
    simbriefIcao: aircraft.simbriefIcao,
    simbriefAirframeMatch: aircraft.simbriefAirframeMatch,
    titleHint: aircraft.name,
  });
  const staticId = mission.staticId ?? makeStaticId('career');
  const cargoThousands = cargoWeightToThousands(mission.cargoKg);
  const url = buildDispatchRedirectUrl({
    type: resolved.type,
    orig: mission.originIcao,
    dest: mission.destIcao,
    pax: 0,
    cargo: cargoThousands,
    units: 'KGS',
    staticId,
  });
  return {
    url,
    staticId,
    type: resolved.type,
    airframeLabel: resolved.airframe.comments || resolved.airframe.name,
    cargoThousands,
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
    ofpId?: string;
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

  const { expectation } = await fetchSimBriefLatestOfp({
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
      ofpId: expectation.ofpId,
    },
  };
}
