/**
 * Preflight Live Load — SimBrief OFP vs live MSFS fuel/payload/weight.
 * Reuses agent compare-ofp stack (compareOnce + roles pack).
 */

import {
  KG_TO_LB,
  applyOfpBallastLb,
  careerFreighterLivePayloadLb,
  careerPaxAndCargoLivePayloadLb,
  evaluateLoadVerification,
  evaluateOriginProximity,
  findCareerPlayerAirframe,
  isPaxAndCargoLoadLayout,
  isUsableFuelTankBreakdown,
  normalizeAircraftTitle,
  ofpCargoKg,
  ofpFreightTowardMissionKg,
  ofpFuelToLb,
  ofpTaxiFuelLb,
  payloadMatchToleranceLb,
  adjustPaxAndCargoDueForEfbPaxLb,
  clampPaxAndCargoDueToHoldsLb,
  resolveAirportCoords,
  softenCareerPreflightVerdict,
  softenCgFindingSeverity,
  toLb,
  type FuelTankBreakdown,
  type MissionIntent,
  type OfpExpectation,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { applyOfpOverrides } from '../../agent/src/ofp-compliance/parse-ofp.ts';
import { compareOnce, formatComplianceSummary } from '../../agent/src/ofp-compliance/run-compare.ts';
import { fetchSimBriefLatestOfp } from '../../agent/src/ofp-compliance/simbrief-fetch.ts';
import {
  adjustPlannedPayloadForLiveCrewStations,
  freighterBaggageCapacityFromStationMax,
  plannedStationPayloadLb,
} from '../../agent/src/ofp-load-plan.ts';
import { readLiveCgState } from '../../agent/src/live-cg.ts';
import { readSimVarsSoft } from '../../agent/src/read-simvars-soft.ts';
import { resolveMissionRolesPack } from './roles-pack-helpers.ts';
import {
  pickStationMax,
  pickTankCapacity,
  readClassicFuelTankCapacityLb,
  resolveCatalogCgEnvelope,
  resolveSchematicCapsFromCatalog,
} from './schematic-capacity.ts';
import { withSimBridgeExclusive } from './simbridge-gate.ts';
import { applyTargetBlockFuelKg } from './ofp-target-fuel.ts';
import { getRepoRoot } from './skyline-paths.ts';
const repoRoot = getRepoRoot();
const ofpCache = new Map<string, Promise<OfpExpectation>>();

async function loadPreflightOfp(
  mission: MissionIntent,
  identity: { username?: string; userid?: string },
): Promise<OfpExpectation> {
  const key = [
    mission.staticId,
    mission.lastOfpCheck?.checkedAtIso ?? '',
    identity.username ?? '',
    identity.userid ?? '',
  ].join(':');
  let cached = ofpCache.get(key);
  if (!cached) {
    cached = fetchSimBriefLatestOfp({
      ...identity,
      staticId: mission.staticId!,
    }).then(({ expectation }) => expectation);
    ofpCache.set(key, cached);
    if (ofpCache.size > 20) {
      ofpCache.delete(ofpCache.keys().next().value!);
    }
    cached.catch(() => ofpCache.delete(key));
  }
  return cached;
}

export type PreflightCheckResult = {
  verdict: 'pass' | 'warn' | 'fail';
  summary: string;
  checkedAtIso: string;
  phase: string;
  loadVerification: {
    ready: boolean;
    fuel: {
      plannedLb?: number;
      liveLb: number;
      ok: boolean;
      /** SimBrief OFP taxi fuel (lb) used as Loaded vs Due undershoot slack. */
      taxiBurnLb?: number;
      tanks?: {
        left: number;
        right: number;
        center: number;
        leftAux?: number;
        rightAux?: number;
        leftTip?: number;
        rightTip?: number;
      };
      tankCapacity?: {
        left: number;
        right: number;
        center: number;
        leftAux?: number;
        rightAux?: number;
        leftTip?: number;
        rightTip?: number;
      };
    };
      payload: {
        plannedLb?: number;
        /** Mission cargo in the Due total (excludes crew floor). */
        cargoLb?: number;
        /** Crew floor in the Due total (n × 170 lb) — not seat fill above that. */
        crewLb?: number;
        /** Nominal crew floor before empty-station adjust (for Watch re-eval). */
        crewFloorLb?: number;
        liveLb?: number;
        ok: boolean;
        stations?: Record<number, number>;
        stationMax?: Record<number, number>;
      };
    aircraft: { onGround: boolean; enginesRunning: boolean };
    cg?: {
      liveMac?: number;
      minMac?: number;
      maxMac?: number;
      ok: boolean;
      severity: 'info' | 'warn';
    };
    weightNoteCount: number;
  };
  location?: {
    ok: boolean;
    originIcao: string;
    distanceNm?: number;
    radiusNm: number;
    code: string;
  };
  findings: Array<{ code: string; severity: string; message: string }>;
};

export type MissionPreflightResult = {
  check: PreflightCheckResult;
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
  live: {
    fuelTotalLb: number;
    fuelSource: string;
    payloadTotalLb?: number;
    payloadSource?: string;
    emptyLb?: number;
    zfwLb?: number;
    grossLb?: number;
    weightSource?: string;
    onGround: boolean;
    enginesRunning: boolean;
  };
};

export async function runMissionPreflight(
  mission: MissionIntent,
  opts: {
    username?: string;
    userid?: string;
    pipeName?: string;
    /** Optional block-fuel override (kg); normally omit so Due matches SimBrief. */
    targetBlockFuelKg?: number;
    /**
     * CG ballast (lb) just placed by inject. Overrides the mission's stored
     * value so the post-inject check sees the load that was actually applied.
     */
    ballastLb?: number;
    /**
     * Origin airport coords (from world terminal). When omitted, resolved from
     * hub catalog / bush overrides via ICAO alone.
     */
    originCoords?: { lat: number; lon: number };
  } = {},
): Promise<MissionPreflightResult> {
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

  const expectation = await loadPreflightOfp(mission, { username, userid });
  const ofpBase = applyTargetBlockFuelKg(expectation, opts.targetBlockFuelKg);

  const bridge = new NamedPipeSimBridge(
    opts.pipeName ? { pipeName: opts.pipeName } : {},
  );
  return withSimBridgeExclusive(async () => {
  try {
    await bridge.open('Skyline Career UI Preflight');
    const identity = await bridge.getAircraftIdentity();
    const liveTitle = normalizeAircraftTitle(identity.title ?? '');
    let ofp = ofpBase;
    try {
      const roles = await resolveMissionRolesPack({
        repoRoot,
        rolesPackRelPath: mission.rolesPackRelPath,
        airframeTypeId: mission.airframeTypeId,
        strictAirframeMatch: Boolean(mission.airframeTypeId),
        liveTitle: liveTitle || identity.title,
      });
      ofp = applyOfpOverrides(ofpBase, {
        stationRoles: roles.pack.payload?.stationRoles,
        liveSources: roles.pack.liveSources,
      });
    } catch (rolesError) {
      if (
        rolesError instanceof Error &&
        rolesError.message.includes('purchased airframe')
      ) {
        throw rolesError;
      }
      // Freighter compare still works without roles; classic payload path.
    }

    const ballastLb = opts.ballastLb ?? mission.injectBallastLb ?? 0;
    if (ballastLb > 0) {
      ofp = applyOfpBallastLb(ofp, ballastLb);
    }

    const previousStationSumLb = mission.lastPreflightCheck?.loadVerification
      ?.payload?.stations
      ? Object.values(
          mission.lastPreflightCheck.loadVerification.payload.stations,
        ).reduce((sum, lb) => sum + (Number.isFinite(lb) ? lb : 0), 0)
      : undefined;
    // CG first (3 SimVars). compareOnce is heavy — if it runs first, CG PERCENT
    // often times out and the Dispatch CG card never appears on first open.
    const liveCg = await readLiveCgState(bridge);
    const { snapshot, live } = await compareOnce(bridge, {
      ofp,
      locked: false,
      previousStationSumLb,
    });
    const checkedAtIso = new Date().toISOString();
    const payloadFailed = snapshot.findings.some(
      (finding) =>
        finding.severity === 'fail' &&
        /^(PAYLOAD_|BAGGAGE|PAX_|STATION_)/.test(finding.code),
    );
    const weightNoteCount = snapshot.findings.filter(
      (finding) =>
        finding.severity === 'warn' &&
        ['EMPTY_WEIGHT', 'TOW', 'ZFW'].includes(finding.code),
    ).length;
    const careerAirframe = findCareerPlayerAirframe(mission.airframeTypeId);
    // pax_and_cargo: Due = SimBrief payload (route/MTOW may trim below mission).
    // ofpCargoKg with pax>0 returns baggage-only and left Due at ~1k lb.
    const cargoKg = isPaxAndCargoLoadLayout(careerAirframe)
      ? ofpFreightTowardMissionKg(ofp, careerAirframe)
      : ofpCargoKg(ofp);

    const catalogCaps = await resolveSchematicCapsFromCatalog({
      repoRoot,
      title: liveTitle || identity.title,
      icao: identity.icao,
    });

    // CG is advisory in Career preflight (OnAir-style Loaded vs Due).
    // Paint the same envelope inject uses (calibrated-live JSON), not SimVar 0–100.
    const painted = await resolveCatalogCgEnvelope({
      repoRoot,
      title: identity.title,
      icao: identity.icao,
      liveMinMac: liveCg.minMac,
      liveMaxMac: liveCg.maxMac,
    });
    const cgLiveMac = liveCg.liveMac;
    const cgMinMac = painted.minMac;
    const cgMaxMac = painted.maxMac;
    const cgInEnvelope =
      cgLiveMac === undefined ||
      cgMinMac === undefined ||
      cgMaxMac === undefined ||
      (cgLiveMac >= cgMinMac - 0.5 && cgLiveMac <= cgMaxMac + 0.5);
    // Soften CG findings: Preflight never fails on CG alone (OnAir Loaded vs Due).
    const findings = snapshot.findings.map((f) => ({
      code: f.code,
      severity: softenCgFindingSeverity(f.code, f.severity),
      message: f.message,
    }));
    if (cgLiveMac !== undefined) {
      const envelopeNote =
        cgMinMac !== undefined && cgMaxMac !== undefined
          ? ` envelope ${cgMinMac.toFixed(0)}–${cgMaxMac.toFixed(0)}%`
          : '';
      findings.push({
        code: 'CG_LIVE',
        severity: cgInEnvelope ? 'info' : 'warn',
        message: `Live CG ${cgLiveMac.toFixed(1)}% MAC${envelopeNote} (advisory; does not block Validate)`,
      });
    }

    let planePosition: { lat: number; lon: number } | undefined;
    try {
      const [latRaw, lonRaw] = await readSimVarsSoft(
        bridge,
        [
          { name: 'PLANE LATITUDE', unit: 'degrees' },
          { name: 'PLANE LONGITUDE', unit: 'degrees' },
        ],
        2_000,
      );
      if (
        Number.isFinite(latRaw) &&
        Number.isFinite(lonRaw) &&
        !(latRaw === 0 && lonRaw === 0)
      ) {
        planePosition = { lat: latRaw, lon: lonRaw };
      }
    } catch {
      planePosition = undefined;
    }
    const originCoords =
      opts.originCoords ?? resolveAirportCoords(mission.originIcao);
    const originProx = evaluateOriginProximity({
      originIcao: mission.originIcao,
      position: planePosition,
      onGround: live.onGround,
      originCoords: originCoords ?? null,
    });
    findings.push({
      code: originProx.code,
      severity: originProx.severity,
      message: originProx.message,
    });
    const location = {
      ok: originProx.ok,
      originIcao: originProx.originIcao,
      ...(originProx.distanceNm !== undefined
        ? { distanceNm: originProx.distanceNm }
        : {}),
      radiusNm: originProx.radiusNm,
      code: originProx.code,
    };

    // Ready = fuel + payload OK. CG / empty-weight notes never block Depart alone.
    // Always gate on numeric Loaded vs Due — finding codes alone can miss freighter
    // baggage-only OFPs and show ✓ with Sim 0 / Due 992.
    const plannedFuelLb = ofpFuelToLb(ofp.fuel).total;
    const liveFuelLb = live.fuel.total;
    // Compare station totals (matches the Mass & Balance tablet sum). Using
    // ofpPayloadLb (pax+bags only) made Sim look like ~550 while seats showed 1050.
    const cargoLb =
      cargoKg !== undefined ? cargoKg * KG_TO_LB : undefined;
    // Cabin seats on pax_and_cargo are freight ballast — not GA soft-caps.
    // SimBrief payload already includes cabin (not cockpit crew) — no crew floor.
    const stationRolesForDue = isPaxAndCargoLoadLayout(careerAirframe)
      ? {
          ...ofp.payload?.stationRoles,
          crewStations: [] as number[],
          passengerStations: [] as number[],
          baggageStations: [
            ...(ofp.payload?.stationRoles?.passengerStations ?? []),
            ...(ofp.payload?.stationRoles?.baggageStations ?? []),
          ],
        }
      : ofp.payload?.stationRoles;
    const baggageCapacityLb = !isPaxAndCargoLoadLayout(careerAirframe)
      ? freighterBaggageCapacityFromStationMax(
          catalogCaps.stationMax,
          stationRolesForDue,
        )
      : undefined;
    // Freighter + pax_and_cargo Due = OFP/mission payload. Do NOT re-clamp with
    // live EMPTY×MTOW — after inject, EMPTY often folds in station/cabin mass and
    // shrinks Due below Sim (Baron freighter; same risk on Phenom/CJ4).
    // Freighter hard cap: baggageCapacity. pax_and_cargo: hold/EFB clamps below.
    // MTOW room belongs to SimBrief + Accept, not Loaded vs Due.
    const plannedPayloadBase =
      cargoLb !== undefined
        ? plannedStationPayloadLb({
            cargoLb,
            stationRoles: stationRolesForDue,
            ...(baggageCapacityLb !== undefined ? { baggageCapacityLb } : {}),
          })
        : undefined;
    const stationSumLb = live.payload?.stations
      ? Object.values(live.payload.stations).reduce(
          (sum, lb) => sum + (Number.isFinite(lb) ? lb : 0),
          0,
        )
      : undefined;
    // Prefer emptied classic stations over a stale mass-balance READY.
    const clearedStations =
      stationSumLb !== undefined &&
      stationSumLb < 50 &&
      previousStationSumLb !== undefined &&
      previousStationSumLb > 200;
    // TFDi EFB "Payload" is cargo-only; S1–S3 still hold the three crew members.
    // Loaded vs Due = EFB cargo + live crew stations, against OFP cargo + crew floor.
    const tfdiEfbCargoLb =
      live.payload?.source === 'tfdi-efb' &&
      typeof live.payload.ofpPayloadLb === 'number' &&
      Number.isFinite(live.payload.ofpPayloadLb) &&
      live.payload.ofpPayloadLb > 0
        ? live.payload.ofpPayloadLb
        : undefined;
    const pmdgEfbCargoLb =
      live.payload?.source === 'pmdg-efb' &&
      typeof live.payload.ofpPayloadLb === 'number' &&
      Number.isFinite(live.payload.ofpPayloadLb) &&
      live.payload.ofpPayloadLb > 0
        ? live.payload.ofpPayloadLb
        : undefined;
    const a2aPayloadLb =
      live.payload?.source === 'a2a-lvars' &&
      typeof live.payload.total === 'number' &&
      Number.isFinite(live.payload.total) &&
      live.payload.total > 0
        ? live.payload.total
        : undefined;
    const crewStationIdxs =
      ofp.payload?.stationRoles?.crewStations?.filter(
        (idx) => Number.isFinite(idx) && idx > 0,
      ) ?? [];
    const liveCrewLb = crewStationIdxs.reduce((sum, idx) => {
      const lb = live.payload?.stations?.[idx];
      return sum + (typeof lb === 'number' && Number.isFinite(lb) ? lb : 0);
    }, 0);
    const ofpEmptyLb =
      ofp.loadSheet?.emptyWeight !== undefined
        ? toLb(
            ofp.loadSheet.emptyWeight,
            ofp.loadSheet.unit ?? ofp.fuel.unit ?? 'lb',
          )
        : undefined;
    const ofpZfwLb =
      ofp.loadSheet?.zfw !== undefined
        ? toLb(
            ofp.loadSheet.zfw,
            ofp.loadSheet.unit ?? ofp.fuel.unit ?? 'lb',
          )
        : undefined;
    // Layout branches stay separate: pax_and_cargo ≠ GA freighter bags-only.
    const paxCargoLiveLb =
      isPaxAndCargoLoadLayout(careerAirframe) && live.payload?.stations
        ? careerPaxAndCargoLivePayloadLb({
            stations: live.payload.stations,
            stationRoles: ofp.payload?.stationRoles,
            zfwLb: live.weights?.zfwLb,
            ofpEmptyLb,
          })
        : undefined;
    const freighterRoleSumLb = !isPaxAndCargoLoadLayout(careerAirframe)
      ? careerFreighterLivePayloadLb({
          stations: live.payload?.stations,
          stationRoles: ofp.payload?.stationRoles,
        })
      : undefined;
    // EFB imports often leave S1/S2 at 0 — drop crew floor from Due when empty.
    // When crew is present (MD-11 S1–S3), keep 3 × 170 lb in Due.
    const plannedPayload = plannedPayloadBase
      ? adjustPlannedPayloadForLiveCrewStations({
          cargoPlacedLb: plannedPayloadBase.cargoPlacedLb,
          crewLb: plannedPayloadBase.crewLb,
          crewStations: ofp.payload?.stationRoles?.crewStations,
          liveStations: live.payload?.stations,
        })
      : undefined;
    // Match Watch: hold clamp (Phenom EFB bags stay in SimBrief math only) +
    // efbPaxWeightLb. Recompute from OFP — never stack on painted Due.
    const plannedPayloadLbRaw = plannedPayload?.plannedTotalLb;
    const plannedPayloadLb =
      plannedPayloadLbRaw !== undefined
        ? adjustPaxAndCargoDueForEfbPaxLb(
            clampPaxAndCargoDueToHoldsLb(
              plannedPayloadLbRaw,
              careerAirframe,
            ),
            careerAirframe,
            {
              ofpPassengerCount:
                typeof ofp.loadSheet?.passengerCount === 'number'
                  ? ofp.loadSheet.passengerCount
                  : (ofp.payload?.stationRoles?.passengerStations?.length ??
                        0) === 0 &&
                      (ofp.payload?.stationRoles?.baggageStations?.length ??
                        0) > 0
                    ? 0
                    : undefined,
            },
          )
        : undefined;
    const livePayloadLb = clearedStations
      ? stationSumLb
      : paxCargoLiveLb !== undefined
        ? paxCargoLiveLb
        : pmdgEfbCargoLb !== undefined
          ? pmdgEfbCargoLb +
            (plannedPayload?.crewOnStations ? liveCrewLb : 0)
          : tfdiEfbCargoLb !== undefined
            ? tfdiEfbCargoLb +
              (plannedPayload?.crewOnStations ? liveCrewLb : 0)
            : a2aPayloadLb !== undefined
              ? a2aPayloadLb
              : freighterRoleSumLb !== undefined
                ? freighterRoleSumLb
                : (live.payload?.total ?? live.payload?.ofpPayloadLb);
    const fuelTolLb = Math.max(
      ofp.tolerances?.fuelAbsLb ?? 50,
      Math.abs(plannedFuelLb ?? 0) * (ofp.tolerances?.fuelPct ?? 0.03),
    );
    // Prefer SimBrief TAXI line; else flat 150 / 1% of Due inside careerFuelMatchOk.
    const taxiBurnLb = ofpTaxiFuelLb(ofp);
    // Large EFB sheets round stations a few dozen lb off the OFP/mission figure.
    const payloadTolLb = Math.max(
      ofp.tolerances?.payloadAbsLb ?? 75,
      payloadMatchToleranceLb(plannedPayloadLb),
    );
    // Finding codes can miss freighter baggage-only OFPs; GA soft-cap uses
    // station totals only. evaluateLoadVerification is the shared numeric gate.
    const weights = evaluateLoadVerification({
      plannedFuelLb,
      liveFuelLb,
      plannedPayloadLb,
      livePayloadLb,
      fuelTolLb,
      payloadTolLb,
      ...(taxiBurnLb !== undefined ? { taxiBurnLb } : {}),
    });
    // Loaded vs Due uses block-fuel total only. Per-tank FUEL_LEFT/RIGHT findings
    // are softened to warn (classic L/R can glitch while TOTAL matches).
    const fuelOk = weights.fuel.ok;
    // Vendor tablet path: trust numeric Loaded vs Due — classic station findings
    // under-read Accu-Sim / TFDi cargo while the tablet matches Due.
    const payloadOk = plannedPayloadBase?.gaCabin
      ? weights.payload.ok
      : tfdiEfbCargoLb !== undefined ||
          pmdgEfbCargoLb !== undefined ||
          a2aPayloadLb !== undefined ||
          paxCargoLiveLb !== undefined ||
          freighterRoleSumLb !== undefined
        ? weights.payload.ok
        : !payloadFailed && weights.payload.ok;
    const ready = fuelOk && payloadOk;
    let careerVerdict = softenCareerPreflightVerdict(ready, snapshot.verdict);
    if (!location.ok) {
      careerVerdict = 'fail';
    }

    const catalogCapsForSchematic = catalogCaps;
    let liveTankCapacity: FuelTankBreakdown | undefined;
    try {
      liveTankCapacity = await readClassicFuelTankCapacityLb(bridge);
    } catch {
      liveTankCapacity = undefined;
    }
    const tankCapacity = pickTankCapacity(
      liveTankCapacity,
      catalogCapsForSchematic.tankCapacity,
    );
    const stationMax = pickStationMax(catalogCapsForSchematic.stationMax, undefined);

    const check: PreflightCheckResult = {
      verdict: careerVerdict,
      summary: formatComplianceSummary({
        ...snapshot,
        verdict: careerVerdict,
        findings: findings.map((f) => ({
          ...f,
          severity: f.severity as 'pass' | 'warn' | 'fail' | 'info',
        })),
      }),
      checkedAtIso,
      phase: snapshot.phase,
      loadVerification: {
        ready,
        fuel: {
          plannedLb: plannedFuelLb,
          liveLb: liveFuelLb,
          ok: fuelOk,
          ...(taxiBurnLb !== undefined ? { taxiBurnLb } : {}),
          // Omit classic L/R/C when they glitch to 0 while FUEL TOTAL / mass-balance
          // still shows fuel — READY uses liveLb, not the schematic.
          ...(isUsableFuelTankBreakdown(
            {
              left: live.fuel.left,
              right: live.fuel.right,
              center: live.fuel.center,
              ...(live.fuel.leftAux != null
                ? { leftAux: live.fuel.leftAux }
                : {}),
              ...(live.fuel.rightAux != null
                ? { rightAux: live.fuel.rightAux }
                : {}),
              ...(live.fuel.leftTip != null
                ? { leftTip: live.fuel.leftTip }
                : {}),
              ...(live.fuel.rightTip != null
                ? { rightTip: live.fuel.rightTip }
                : {}),
            },
            liveFuelLb,
          )
            ? {
                tanks: {
                  left: live.fuel.left,
                  right: live.fuel.right,
                  center: live.fuel.center,
                  ...(live.fuel.leftAux != null
                    ? { leftAux: live.fuel.leftAux }
                    : {}),
                  ...(live.fuel.rightAux != null
                    ? { rightAux: live.fuel.rightAux }
                    : {}),
                  ...(live.fuel.leftTip != null
                    ? { leftTip: live.fuel.leftTip }
                    : {}),
                  ...(live.fuel.rightTip != null
                    ? { rightTip: live.fuel.rightTip }
                    : {}),
                },
              }
            : {}),
          ...(tankCapacity ? { tankCapacity } : {}),
        },
        payload: {
          plannedLb: plannedPayloadLb,
          liveLb: livePayloadLb,
          ok: payloadOk,
          ...(plannedPayload && plannedPayloadBase
            ? {
                cargoLb: plannedPayload.cargoPlacedLb,
                ...(plannedPayload.crewLb > 0
                  ? {
                      crewLb: plannedPayload.crewLb,
                      /** Nominal crew floor before EFB empty-station adjust (n × 170). */
                      crewFloorLb: plannedPayloadBase.crewLb,
                    }
                  : plannedPayloadBase.crewLb > 0
                    ? { crewFloorLb: plannedPayloadBase.crewLb }
                    : {}),
              }
            : {}),
          ...(ofpEmptyLb !== undefined ? { ofpEmptyLb } : {}),
          ...(ofpZfwLb !== undefined ? { ofpZfwLb } : {}),
          ...(live.payload?.stations
            ? { stations: { ...live.payload.stations } }
            : {}),
          ...(stationMax ? { stationMax } : {}),
        },
        aircraft: {
          onGround: live.onGround,
          enginesRunning: live.enginesRunning,
        },
        cg:
          cgLiveMac !== undefined ||
          (cgMinMac !== undefined && cgMaxMac !== undefined)
            ? {
                liveMac: cgLiveMac,
                minMac: cgMinMac,
                maxMac: cgMaxMac,
                ok: cgInEnvelope,
                severity: cgInEnvelope ? 'info' : 'warn',
              }
            : undefined,
        weightNoteCount,
      },
      location,
      findings,
    };
    return {
      check,
      summary: check.summary,
      ofp: {
        originIcao: ofp.originIcao,
        destIcao: ofp.destIcao,
        icao: ofp.icao,
        cargoKg,
        passengerCount: ofp.loadSheet?.passengerCount,
        blockFuel: ofp.loadSheet?.blockFuel,
        ofpId: ofp.ofpId,
      },
      live: {
        fuelTotalLb: live.fuel.total,
        fuelSource: live.fuel.source,
        payloadTotalLb: live.payload?.total,
        payloadSource: live.payload?.source,
        emptyLb: live.weights?.emptyLb,
        zfwLb: live.weights?.zfwLb,
        grossLb: live.weights?.grossLb,
        weightSource: live.weights?.source,
        onGround: live.onGround,
        enginesRunning: live.enginesRunning,
      },
    };
  } finally {
    try {
      // The host owns one shared SimConnect session. Closing this short-lived
      // pipe client must not disconnect Watch or a following operation.
      await bridge.close({ disconnectHost: false });
    } catch {
      /* ignore */
    }
  }
  });
}

/** True when mission must not auto/manual depart without override. */
export function preflightBlocksDepart(mission: MissionIntent): boolean {
  if (!mission.lastPreflightCheck) return true;
  if (mission.lastPreflightCheck.location?.ok === false) return true;
  const ready = mission.lastPreflightCheck?.loadVerification?.ready;
  if (typeof ready === 'boolean') return !ready;
  return mission.lastPreflightCheck?.verdict === 'fail';
}

function sumFinite(values: Iterable<number>): number {
  let sum = 0;
  for (const n of values) {
    if (typeof n === 'number' && Number.isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * Stamp Loaded vs Due from the inject `after` snapshot — no extra SimConnect
 * pass. Watch still refreshes later; Ready must not wait on that sample.
 */
export function lastPreflightFromInjectLive(opts: {
  previous?: MissionIntent['lastPreflightCheck'];
  stations: Record<number, number>;
  liveFuelLb?: number;
  livePayloadLb?: number;
  liveTanks?: { left: number; right: number; center: number };
  tanks: Record<string, number>;
  blockFuelLb: number;
  cargoLb: number;
  displayCg?: {
    liveMac?: number;
    minMac?: number;
    maxMac?: number;
  };
}): NonNullable<MissionIntent['lastPreflightCheck']> {
  const prevLv = opts.previous?.loadVerification as
    | (NonNullable<
        NonNullable<MissionIntent['lastPreflightCheck']>['loadVerification']
      > & {
        fuel: {
          plannedLb?: number;
          liveLb: number;
          ok: boolean;
          taxiBurnLb?: number;
          tanks?: { left: number; right: number; center: number };
          tankCapacity?: unknown;
        };
        payload: {
          plannedLb?: number;
          liveLb?: number;
          ok: boolean;
          stations?: Record<number, number>;
          cargoLb?: number;
          crewLb?: number;
          stationMax?: unknown;
        };
        cg?: {
          liveMac?: number;
          minMac?: number;
          maxMac?: number;
          ok?: boolean;
          severity?: string;
        };
      })
    | undefined;
  const livePayloadLb = Math.round(
    typeof opts.livePayloadLb === 'number' && Number.isFinite(opts.livePayloadLb)
      ? opts.livePayloadLb
      : sumFinite(Object.values(opts.stations)),
  );
  const liveFuelLb = Math.round(
    typeof opts.liveFuelLb === 'number' && Number.isFinite(opts.liveFuelLb)
      ? opts.liveFuelLb
      : sumFinite(Object.values(opts.tanks)),
  );
  const plannedFuelLb =
    typeof prevLv?.fuel.plannedLb === 'number' && prevLv.fuel.plannedLb > 0
      ? prevLv.fuel.plannedLb
      : opts.blockFuelLb;
  const crewLb =
    typeof prevLv?.payload.crewLb === 'number' ? prevLv.payload.crewLb : 0;
  const plannedPayloadLb =
    typeof prevLv?.payload.plannedLb === 'number' && prevLv.payload.plannedLb > 0
      ? prevLv.payload.plannedLb
      : opts.cargoLb + crewLb;
  const taxiBurnLb = prevLv?.fuel.taxiBurnLb;
  const weights = evaluateLoadVerification({
    plannedFuelLb,
    liveFuelLb,
    plannedPayloadLb,
    livePayloadLb,
    taxiBurnLb,
  });
  const painted = opts.displayCg;
  const liveMac = painted?.liveMac ?? prevLv?.cg?.liveMac;
  const minMac = painted?.minMac ?? prevLv?.cg?.minMac;
  const maxMac = painted?.maxMac ?? prevLv?.cg?.maxMac;
  const cgOk =
    liveMac === undefined ||
    minMac === undefined ||
    maxMac === undefined ||
    (liveMac >= minMac && liveMac <= maxMac);
  const ready = weights.ready;
  return {
    verdict: ready ? 'pass' : 'fail',
    summary: ready
      ? 'Inject applied — Loaded vs Due from write snapshot'
      : 'Inject applied — write snapshot does not yet match Due',
    checkedAtIso: new Date().toISOString(),
    phase: opts.previous?.phase ?? 'load',
    loadVerification: {
      ready,
      fuel: {
        plannedLb: plannedFuelLb,
        liveLb: liveFuelLb,
        ok: weights.fuel.ok,
        ...(taxiBurnLb !== undefined ? { taxiBurnLb } : {}),
        ...(opts.liveTanks
          ? { tanks: opts.liveTanks }
          : prevLv?.fuel.tanks
            ? { tanks: prevLv.fuel.tanks }
            : {}),
        ...(prevLv?.fuel.tankCapacity
          ? { tankCapacity: prevLv.fuel.tankCapacity }
          : {}),
      },
      payload: {
        plannedLb: plannedPayloadLb,
        liveLb: livePayloadLb,
        ok: weights.payload.ok,
        stations: { ...opts.stations },
        ...(typeof prevLv?.payload.cargoLb === 'number'
          ? { cargoLb: prevLv.payload.cargoLb }
          : { cargoLb: opts.cargoLb }),
        ...(crewLb > 0 ? { crewLb } : {}),
        ...(prevLv?.payload.stationMax
          ? { stationMax: prevLv.payload.stationMax }
          : {}),
      },
      ...(liveMac !== undefined || minMac !== undefined || maxMac !== undefined
        ? {
            cg: {
              liveMac,
              minMac,
              maxMac,
              ok: cgOk,
              severity: cgOk ? 'info' : 'warn',
            },
          }
        : prevLv?.cg
          ? { cg: prevLv.cg }
          : {}),
      aircraft: prevLv?.aircraft ?? {
        onGround: true,
        enginesRunning: false,
      },
      weightNoteCount: prevLv?.weightNoteCount ?? 0,
    },
    location: opts.previous?.location,
    findings: opts.previous?.findings ?? [],
  } as NonNullable<MissionIntent['lastPreflightCheck']>;
}
