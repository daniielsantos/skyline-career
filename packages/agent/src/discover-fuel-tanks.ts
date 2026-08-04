import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/** Classic SimConnect fuel slots we probe for live tank discovery. */
export const CLASSIC_FUEL_SLOTS: Array<{
  id: string;
  label: string;
  capacityVar: string;
  quantityVar: string;
}> = [
  {
    id: 'LEFT_MAIN',
    label: 'Left main',
    capacityVar: 'FUEL TANK LEFT MAIN CAPACITY',
    quantityVar: 'FUEL TANK LEFT MAIN QUANTITY',
  },
  {
    id: 'RIGHT_MAIN',
    label: 'Right main',
    capacityVar: 'FUEL TANK RIGHT MAIN CAPACITY',
    quantityVar: 'FUEL TANK RIGHT MAIN QUANTITY',
  },
  {
    id: 'CENTER',
    label: 'Center',
    capacityVar: 'FUEL TANK CENTER CAPACITY',
    quantityVar: 'FUEL TANK CENTER QUANTITY',
  },
  {
    id: 'CENTER2',
    label: 'Center 2',
    capacityVar: 'FUEL TANK CENTER2 CAPACITY',
    quantityVar: 'FUEL TANK CENTER2 QUANTITY',
  },
  {
    id: 'LEFT_AUX',
    label: 'Left aux',
    capacityVar: 'FUEL TANK LEFT AUX CAPACITY',
    quantityVar: 'FUEL TANK LEFT AUX QUANTITY',
  },
  {
    id: 'RIGHT_AUX',
    label: 'Right aux',
    capacityVar: 'FUEL TANK RIGHT AUX CAPACITY',
    quantityVar: 'FUEL TANK RIGHT AUX QUANTITY',
  },
  {
    id: 'LEFT_TIP',
    label: 'Left tip',
    capacityVar: 'FUEL TANK LEFT TIP CAPACITY',
    quantityVar: 'FUEL TANK LEFT TIP QUANTITY',
  },
  {
    id: 'RIGHT_TIP',
    label: 'Right tip',
    capacityVar: 'FUEL TANK RIGHT TIP CAPACITY',
    quantityVar: 'FUEL TANK RIGHT TIP QUANTITY',
  },
];

export type FuelTankProbe = {
  id: string;
  label: string;
  capacityVar: string;
  quantityVar: string;
  capacity: number | null;
  before: number | null;
  after: number | null;
  target: number | null;
  /** capacity ≥ 5 gal */
  hasCapacity: boolean;
  /** write stuck near target */
  writable: boolean;
  /** value moved after write (even if not fully to target) */
  changed: boolean;
  /** usable in a classic profile: real capacity + writable */
  live: boolean;
  note?: string;
};

async function readGal(
  bridge: NamedPipeSimBridge,
  name: string,
): Promise<number | null> {
  try {
    const v = await bridge.readSimVar({ name, unit: 'gallons' });
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeTolerance(target: number): number {
  return Math.max(Math.abs(target) * 0.05, 0.25);
}

/**
 * Residual band for unusable-fuel / vendor clamps. Calibrate later turns this
 * into fuelOffset (often ~0.8–3.5 gal); discovery should still treat the tank
 * as writable when the write mostly closes the gap.
 */
export function fuelWriteOffsetBand(target: number): number {
  return Math.max(4, Math.abs(target) * 0.15);
}

/**
 * True when the quantity stuck on/near the target, including near-misses that
 * look like a fuelOffset residual (AUX 8.2→9, FUELSYSTEM 36.5→40). Weak
 * mirror slots that only crawl a little (MAIN 15.3→18.5 wanted 22) stay false.
 */
export function isFuelWriteAccepted(
  before: number,
  after: number,
  target: number,
): boolean {
  const residual = Math.abs(after - target);
  if (residual <= writeTolerance(target)) return true;

  const needed = Math.abs(target - before);
  if (needed < 0.05) return false;

  const moved = Math.abs(after - before);
  const closedGap = Math.abs(after - target) < Math.abs(before - target) - 0.05;
  const progress = moved / needed;
  return closedGap && progress >= 0.5 && residual <= fuelWriteOffsetBand(target);
}

/**
 * Poll a quantity after a write instead of sampling once. Vendor fuel systems
 * (Black Box, Black Square) ramp the tank toward the target over a second or
 * more, so a single fast read reports a real write as "ignored".
 */
export async function readAfterWriteSettles(
  bridge: NamedPipeSimBridge,
  name: string,
  target: number,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<number | null> {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const pollIntervalMs = opts.pollIntervalMs ?? 250;
  const tolerance = writeTolerance(target);
  const offsetBand = fuelWriteOffsetBand(target);
  const deadline = Date.now() + timeoutMs;
  let latest: number | null = null;
  let stableSamples = 0;

  while (Date.now() < deadline) {
    await bridge.delay(pollIntervalMs);
    const sample = await readGal(bridge, name);
    if (sample === null) break;
    const residual = Math.abs(sample - target);
    if (residual <= tolerance) return sample;
    // Near-miss inside the offset band — good enough for discovery; calibrate
    // will measure the exact fuelOffset later.
    if (residual <= offsetBand && latest !== null && Math.abs(sample - latest) < 0.05) {
      return sample;
    }
    // Give up early once the value stops moving between polls.
    stableSamples = latest !== null && Math.abs(sample - latest) < 0.05 ? stableSamples + 1 : 0;
    latest = sample;
    if (stableSamples >= 2) break;
  }
  return latest;
}

/**
 * Probe every classic fuel slot: read capacity, write a safe test quantity, restore.
 * Ghost tanks (write sticks but capacity ~0) are flagged but not `live`.
 */
export async function discoverClassicFuelTanks(
  bridge: NamedPipeSimBridge,
): Promise<FuelTankProbe[]> {
  const results: FuelTankProbe[] = [];

  for (const slot of CLASSIC_FUEL_SLOTS) {
    const capacity = await readGal(bridge, slot.capacityVar);
    const before = await readGal(bridge, slot.quantityVar);
    const hasCapacity = capacity !== null && capacity >= 5;

    if (before === null) {
      results.push({
        id: slot.id,
        label: slot.label,
        capacityVar: slot.capacityVar,
        quantityVar: slot.quantityVar,
        capacity,
        before: null,
        after: null,
        target: null,
        hasCapacity,
        writable: false,
        changed: false,
        live: false,
        note: 'quantity unreadable',
      });
      continue;
    }

    // Probe target: mid-range but distinct from current, within capacity when known.
    const cap = hasCapacity ? capacity! : 40;
    let target = Math.max(5, Math.min(Math.floor(cap * 0.35), 80));
    if (Math.abs(before - target) < 1) {
      target = Math.max(5, Math.min(Math.floor(cap * 0.55), 90));
    }

    let after: number | null = null;
    let writable = false;
    let changed = false;
    let note: string | undefined;

    try {
      await bridge.writeSimVar({ name: slot.quantityVar, unit: 'gallons', value: target });
      after = await readAfterWriteSettles(bridge, slot.quantityVar, target);
      if (after !== null) {
        changed = Math.abs(after - before) > 0.05;
        writable = isFuelWriteAccepted(before, after, target);
      }
      // Restore original quantity.
      await bridge.writeSimVar({ name: slot.quantityVar, unit: 'gallons', value: before });
      // Local gap between tank probes — avoid pipe IPC delay storms.
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
      after = null;
    }

    if (writable && !hasCapacity) {
      note = note ?? 'ghost write (capacity < 5)';
    } else if (!writable && changed) {
      note =
        note ??
        `moved ${before.toFixed(1)} → ${after?.toFixed(1) ?? '?'} gal (wanted ${target})`;
    }

    results.push({
      id: slot.id,
      label: slot.label,
      capacityVar: slot.capacityVar,
      quantityVar: slot.quantityVar,
      capacity,
      before,
      after,
      target,
      hasCapacity,
      writable,
      changed,
      live: hasCapacity && writable,
      note,
    });
  }

  return results;
}

export function liveFuelTanks(probes: FuelTankProbe[]): FuelTankProbe[] {
  return probes.filter((p) => p.live);
}
