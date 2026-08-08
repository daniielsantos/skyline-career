/**
 * Thin wrappers around agent SimBrief helpers so the career-ui API can
 * open Dispatch Redirect and fetch OFPs without going through the CLI.
 */

import {
  clampCareerMaxCargoKg,
  compareMissionIntentToOfp,
  estimateRouteCargoLimit,
  findCareerPlayerAirframe,
  formatIntentOfpCheck,
  getAircraftClass,
  KG_TO_LB,
  ofpCargoKg,
  resolveAirframeFuelBurnKgPerNm,
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
  inferSimBriefAirframeMatchFromTitle,
  preferSimBriefAirframeMatch,
  resolveSimBriefDispatchType,
  resolveSimBriefMaxCargoKg,
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
  source: string;
  airframeLabel: string;
  oewKg?: number;
  mtowKg?: number;
  fuelCapacityKg?: number;
  fuelBurnKgPerNm?: number;
  airframeTypeId?: string;
};

const cargoLimitCache = new Map<string, ClassCargoLimit>();

/** Re-export shared estimator — class homologation fields live on AircraftClass. */
export { estimateRouteCargoLimit };

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
  const rolesPackRelPath =
    opts.rolesPackRelPath?.trim() ||
    airframe?.rolesPackRelPath ||
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
    simbriefIcao: packIcao || airframe?.simbriefIcao || aircraft.simbriefIcao,
    simbriefAirframeMatch: preferSimBriefAirframeMatch({
      packMatch,
      inferredFromTitle: inferred,
      catalogMatch: airframe?.simbriefAirframeMatch,
      classMatch: aircraft.simbriefAirframeMatch,
    }),
    titleHint,
  };
}

/** Live SimBrief freight cap for a career freighter class (cached). */
export async function resolveClassMaxCargoKg(
  aircraftClassId: FreighterClassId,
  airframeTypeId?: string,
  opts: { liveTitle?: string | null } = {},
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
      }) ?? value.maxCargoKg;
    const next = { ...value, maxCargoKg: clamped };
    cargoLimitCache.set(cacheKey, next);
    return next;
  };

  if (
    airframe &&
    typeof airframe.maxCargoKg === 'number' &&
    airframe.maxCargoKg > 0 &&
    typeof airframe.oewKg === 'number' &&
    typeof airframe.mtowKg === 'number'
  ) {
    return finish({
      maxCargoKg: Math.floor(airframe.maxCargoKg),
      source: 'airframe-catalog',
      airframeLabel: airframe.label,
      oewKg: airframe.oewKg,
      mtowKg: airframe.mtowKg,
      fuelCapacityKg: airframe.fuelCapacityKg ?? aircraft.fuelCapacityKg,
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
    const resolved = await resolveSimBriefMaxCargoKg(params);
    const catalogCap =
      typeof airframe?.maxCargoKg === 'number' && airframe.maxCargoKg > 0
        ? Math.floor(airframe.maxCargoKg)
        : undefined;
    return finish({
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
      fuelBurnKgPerNm,
      airframeTypeId: airframe?.typeId ?? airframeTypeId,
    });
  } catch {
    return finish({
      maxCargoKg: airframe?.maxCargoKg ?? aircraft.maxCargoKg,
      source: airframe?.maxCargoKg ? 'airframe-catalog' : 'class-fallback',
      airframeLabel: airframe?.label ?? aircraft.name,
      oewKg: airframe?.oewKg ?? aircraft.oewKg,
      mtowKg: airframe?.mtowKg ?? aircraft.mtowKg,
      fuelCapacityKg: airframe?.fuelCapacityKg ?? aircraft.fuelCapacityKg,
      fuelBurnKgPerNm,
      airframeTypeId: airframe?.typeId ?? airframeTypeId,
    });
  }
}

export type DispatchWeightSystem = 'metric' | 'imperial';

function normalizeDispatchUnits(
  units?: 'KGS' | 'LBS' | DispatchWeightSystem,
): 'KGS' | 'LBS' {
  if (units === 'LBS' || units === 'imperial') return 'LBS';
  return 'KGS';
}

export async function buildMissionDispatch(
  mission: MissionIntent,
  opts: {
    units?: 'KGS' | 'LBS' | DispatchWeightSystem;
    liveTitle?: string | null;
  } = {},
): Promise<{
  url: string;
  staticId: string;
  type: string;
  airframeLabel: string;
  cargoThousands: number;
  units: 'KGS' | 'LBS';
}> {
  const params = await resolveDispatchSimBriefParams({
    aircraftClassId: mission.aircraftClassId,
    airframeTypeId: mission.airframeTypeId,
    rolesPackRelPath: mission.rolesPackRelPath,
    liveTitle: opts.liveTitle,
  });
  const resolved = await resolveSimBriefDispatchType(params);
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
