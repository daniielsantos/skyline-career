import { DefaultProfileEngine } from '@msfs-compat/runtime';
import {
  normalizeMacPercent,
  type AircraftProfile,
  type PayloadStationProfile,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

export interface CgSweepSelection {
  forward: PayloadStationProfile;
  aft: PayloadStationProfile;
  usedStationArms: boolean;
}

export interface CgSweepResult {
  minObservedMac: number;
  maxObservedMac: number;
  forwardCgMac: number;
  aftCgMac: number;
  payloadLb: number;
  forwardStation: number;
  aftStation: number;
  usedStationArms: boolean;
  restored: boolean;
  sampledAtIso: string;
}

export function selectCgSweepStations(profile: AircraftProfile): CgSweepSelection {
  const stations = profile.payload.stations.filter((station) => station.maxLoad > 0);
  if (stations.length < 2) {
    throw new Error('CG sweep requires at least two writable payload stations');
  }
  const withArms = stations.filter(
    (station): station is PayloadStationProfile & { arm: number } =>
      typeof station.arm === 'number' && Number.isFinite(station.arm),
  );
  if (withArms.length >= 2) {
    const ordered = [...withArms].sort((a, b) => a.arm - b.arm);
    return {
      // MSFS longitudinal station coordinates are positive forward.
      forward: ordered[ordered.length - 1]!,
      aft: ordered[0]!,
      usedStationArms: true,
    };
  }
  const ordered = [...stations].sort((a, b) => a.index - b.index);
  return {
    forward: ordered[0]!,
    aft: ordered[ordered.length - 1]!,
    usedStationArms: false,
  };
}

function stationLvarMap(profile: AircraftProfile): Map<number, string> {
  const map = new Map<number, string>();
  for (const step of profile.payload.writePlan) {
    if (step.op !== 'lvar_set' || !step.name || !step.valueExpr) continue;
    const match = /^\{station_(\d+)\}$/.exec(step.valueExpr.trim());
    if (match) map.set(Number(match[1]), step.name);
  }
  return map;
}

async function readStations(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
): Promise<Record<number, number>> {
  const values: Record<number, number> = {};
  const lvars = stationLvarMap(profile);
  for (const station of profile.payload.stations) {
    const lvar = lvars.get(station.index);
    const value = lvar
      ? await bridge.readLVar(lvar)
      : await bridge.readSimVar({
          name: station.readVar ?? `PAYLOAD STATION WEIGHT:${station.index}`,
          unit: 'pounds',
        });
    values[station.index] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return values;
}

async function readCgMac(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
): Promise<number> {
  let value = await bridge.readSimVar({
    name: profile.cg?.readVar ?? 'CG PERCENT',
    unit: profile.cg?.readUnit ?? 'Percent over 100',
  });
  value = normalizeMacPercent(value);
  if (!Number.isFinite(value)) throw new Error(`Invalid live CG value: ${value}`);
  return value;
}

function singleStationTargets(
  profile: AircraftProfile,
  stationIndex: number,
  payloadLb: number,
): Record<number, number> {
  return Object.fromEntries(
    profile.payload.stations.map((station) => [
      station.index,
      station.index === stationIndex ? payloadLb : 0,
    ]),
  );
}

export async function sweepCgEnvelope(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  opts: { payloadLb?: number } = {},
): Promise<CgSweepResult> {
  const selection = selectCgSweepStations(profile);
  const original = await readStations(bridge, profile);
  const originalTotal = Object.values(original).reduce((sum, value) => sum + value, 0);
  const capacity = Math.min(selection.forward.maxLoad, selection.aft.maxLoad);
  const requested =
    typeof opts.payloadLb === 'number' && Number.isFinite(opts.payloadLb)
      ? opts.payloadLb
      : originalTotal > 0
        ? originalTotal
        : 200;
  const payloadLb = Math.max(25, Math.min(400, capacity, Math.round(requested)));
  if (payloadLb > capacity) {
    throw new Error(`CG sweep payload ${payloadLb} lb exceeds station capacity ${capacity} lb`);
  }

  const engine = new DefaultProfileEngine({ profile, bridge });
  let restored = false;
  let forwardCgMac: number | undefined;
  let aftCgMac: number | undefined;
  try {
    const forwardApply = await engine.applyLoadPlan({
      payload: {
        stations: singleStationTargets(profile, selection.forward.index, payloadLb),
        total: payloadLb,
      },
    });
    if (!forwardApply.payload?.success) {
      throw new Error(`Forward CG sweep write failed: ${forwardApply.payload?.errorCode ?? 'unknown'}`);
    }
    forwardCgMac = await readCgMac(bridge, profile);

    const aftApply = await engine.applyLoadPlan({
      payload: {
        stations: singleStationTargets(profile, selection.aft.index, payloadLb),
        total: payloadLb,
      },
    });
    if (!aftApply.payload?.success) {
      throw new Error(`Aft CG sweep write failed: ${aftApply.payload?.errorCode ?? 'unknown'}`);
    }
    aftCgMac = await readCgMac(bridge, profile);
  } finally {
    const restore = await engine.applyLoadPlan({
      payload: { stations: original, total: originalTotal },
    });
    const afterRestore = await readStations(bridge, profile);
    restored =
      Boolean(restore.payload?.success) &&
      profile.payload.stations.every(
        (station) =>
          Math.abs((afterRestore[station.index] ?? 0) - (original[station.index] ?? 0)) <= 2,
      );
  }

  if (forwardCgMac === undefined || aftCgMac === undefined) {
    throw new Error('CG sweep did not produce both forward and aft samples');
  }
  return {
    minObservedMac: Math.min(forwardCgMac, aftCgMac),
    maxObservedMac: Math.max(forwardCgMac, aftCgMac),
    forwardCgMac,
    aftCgMac,
    payloadLb,
    forwardStation: selection.forward.index,
    aftStation: selection.aft.index,
    usedStationArms: selection.usedStationArms,
    restored,
    sampledAtIso: new Date().toISOString(),
  };
}
