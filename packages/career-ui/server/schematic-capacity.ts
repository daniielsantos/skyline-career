/**
 * Tank / station capacity for Preflight load schematics (fill = current / max).
 */

import {
  DEFAULT_JET_A_LB_PER_GAL,
  type AircraftProfile,
  type FuelTankBreakdown,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import {
  defaultProfileDirs,
  loadProfilesFromDirs,
  type LoadedProfile,
} from '../../agent/src/profile-registry.ts';
import { resolveProfile } from '../../agent/src/profile-resolver.ts';

let catalogCache: { repoRoot: string; loaded: LoadedProfile[] } | null = null;

async function loadCatalog(repoRoot: string): Promise<LoadedProfile[]> {
  if (catalogCache?.repoRoot === repoRoot) return catalogCache.loaded;
  const loaded = await loadProfilesFromDirs(defaultProfileDirs(repoRoot));
  catalogCache = { repoRoot, loaded };
  return loaded;
}

/** Classic L/R/C tank capacity (lb) from SimConnect CAPACITY SimVars. */
export async function readClassicFuelTankCapacityLb(
  bridge: NamedPipeSimBridge,
  densityLbPerGal = DEFAULT_JET_A_LB_PER_GAL,
): Promise<FuelTankBreakdown | undefined> {
  const readGal = async (name: string): Promise<number> => {
    try {
      const gal = await bridge.readSimVar({ name, unit: 'gallons' });
      return Number.isFinite(gal) && gal > 0 ? gal : 0;
    } catch {
      return 0;
    }
  };
  const leftMainCap = await readGal('FUEL TANK LEFT MAIN CAPACITY');
  const rightMainCap = await readGal('FUEL TANK RIGHT MAIN CAPACITY');
  const centerCapGal =
    (await readGal('FUEL TANK CENTER CAPACITY')) +
    (await readGal('FUEL TANK CENTER2 CAPACITY'));
  const leftAuxCap = await readGal('FUEL TANK LEFT AUX CAPACITY');
  const rightAuxCap = await readGal('FUEL TANK RIGHT AUX CAPACITY');
  const leftTipCap = await readGal('FUEL TANK LEFT TIP CAPACITY');
  const rightTipCap = await readGal('FUEL TANK RIGHT TIP CAPACITY');
  const left = leftMainCap * densityLbPerGal;
  const right = rightMainCap * densityLbPerGal;
  const center = centerCapGal * densityLbPerGal;
  const leftAux = leftAuxCap * densityLbPerGal;
  const rightAux = rightAuxCap * densityLbPerGal;
  const leftTip = leftTipCap * densityLbPerGal;
  const rightTip = rightTipCap * densityLbPerGal;
  if (left + right + center + leftAux + rightAux + leftTip + rightTip < 1) {
    return undefined;
  }
  return {
    left,
    right,
    center,
    ...(leftAux > 0.5 ? { leftAux } : {}),
    ...(rightAux > 0.5 ? { rightAux } : {}),
    ...(leftTip > 0.5 ? { leftTip } : {}),
    ...(rightTip > 0.5 ? { rightTip } : {}),
  };
}

/** Structural maxLoad (lb) keyed by station index. */
export function stationMaxFromProfile(
  profile: AircraftProfile,
): Record<number, number> | undefined {
  const out: Record<number, number> = {};
  for (const station of profile.payload?.stations ?? []) {
    if (
      Number.isFinite(station.index) &&
      Number.isFinite(station.maxLoad) &&
      station.maxLoad > 0
    ) {
      out[station.index] = station.maxLoad;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Fold profile fuel tanks into classic L/R/C (+ aux/tip) capacity (lb).
 */
export function tankCapacityLbFromProfile(
  profile: AircraftProfile,
  densityLbPerGal = DEFAULT_JET_A_LB_PER_GAL,
): FuelTankBreakdown | undefined {
  const unit = profile.fuel?.unit ?? 'gallons';
  const toLb = (cap: number): number => {
    if (!(cap > 0)) return 0;
    if (unit === 'pounds') return cap;
    if (unit === 'kilograms') return cap * 2.20462262;
    if (unit === 'liters') return (cap / 3.785411784) * densityLbPerGal;
    return cap * densityLbPerGal;
  };

  let left = 0;
  let right = 0;
  let center = 0;
  let leftAux = 0;
  let rightAux = 0;
  let leftTip = 0;
  let rightTip = 0;
  for (const tank of profile.fuel?.tanks ?? []) {
    const id = (tank.id ?? '').toUpperCase();
    const lb = toLb(tank.capacity ?? 0);
    if (!lb) continue;
    if (id.includes('LEFT') && id.includes('TIP')) leftTip += lb;
    else if (id.includes('RIGHT') && id.includes('TIP')) rightTip += lb;
    else if (id.includes('LEFT') && id.includes('AUX')) leftAux += lb;
    else if (id.includes('RIGHT') && id.includes('AUX')) rightAux += lb;
    else if (id.includes('LEFT')) left += lb;
    else if (id.includes('RIGHT')) right += lb;
    else if (id.includes('CENTER')) center += lb;
  }
  if (left + right + center + leftAux + rightAux + leftTip + rightTip < 1) {
    return undefined;
  }
  return {
    left,
    right,
    center,
    ...(leftAux > 0.5 ? { leftAux } : {}),
    ...(rightAux > 0.5 ? { rightAux } : {}),
    ...(leftTip > 0.5 ? { leftTip } : {}),
    ...(rightTip > 0.5 ? { rightTip } : {}),
  };
}

export function pickTankCapacity(
  next: FuelTankBreakdown | undefined,
  prev: FuelTankBreakdown | undefined,
): FuelTankBreakdown | undefined {
  const usable = (c?: FuelTankBreakdown) =>
    Boolean(
      c &&
        c.left +
          c.right +
          c.center +
          (c.leftAux ?? 0) +
          (c.rightAux ?? 0) +
          (c.leftTip ?? 0) +
          (c.rightTip ?? 0) >
          1,
    );
  if (usable(next)) return next;
  if (usable(prev)) return prev;
  return undefined;
}

export function pickStationMax(
  next: Record<number, number> | undefined,
  prev: Record<number, number> | undefined,
): Record<number, number> | undefined {
  if (next && Object.keys(next).length > 0) return next;
  if (prev && Object.keys(prev).length > 0) return prev;
  return undefined;
}

/** Best-effort caps from local homologated profiles (no SimConnect structure probe). */
export async function resolveSchematicCapsFromCatalog(opts: {
  repoRoot: string;
  title?: string;
  icao?: string;
  publisher?: string;
  densityLbPerGal?: number;
}): Promise<{
  stationMax?: Record<number, number>;
  tankCapacity?: FuelTankBreakdown;
}> {
  const title = (opts.title ?? '').trim();
  if (!title) return {};
  try {
    const catalog = await loadCatalog(opts.repoRoot);
    const resolved = resolveProfile(
      {
        title,
        icao: opts.icao,
        publisher: opts.publisher,
      },
      catalog,
      { minConfidence: 0.7 },
    );
    if (!resolved.matched || !resolved.profile) return {};
    return {
      stationMax: stationMaxFromProfile(resolved.profile),
      tankCapacity: tankCapacityLbFromProfile(
        resolved.profile,
        opts.densityLbPerGal ?? DEFAULT_JET_A_LB_PER_GAL,
      ),
    };
  } catch {
    return {};
  }
}
