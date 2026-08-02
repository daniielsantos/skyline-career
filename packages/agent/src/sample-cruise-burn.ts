/**
 * Live cruise fuel-flow sampling for homologate / sample-burn wizards.
 *
 * MSFS 2024 GA often exposes RECIP / ENG FUEL FLOW PPH rather than a bare
 * "ENG FUEL FLOW" name; modular jets may use TURB ENG FUEL FLOW PPH.
 */
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/** MSFS Jet-A / avg avgas density fallback when FUEL WEIGHT PER GALLON is unavailable. */
const FALLBACK_LB_PER_GAL = 6.7;

export type FuelFlowProbeRow = {
  simVar: string;
  unit: string;
  value: number | null;
  error?: string;
};

async function tryRead(
  bridge: NamedPipeSimBridge,
  name: string,
  unit: string,
): Promise<{ value: number | null; error?: string }> {
  try {
    const value = await bridge.readSimVar({ name, unit });
    if (!Number.isFinite(value)) return { value: null, error: 'non-finite' };
    return { value };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type FlowCandidate = {
  simVar: (engineIndex: number) => string;
  unit: string;
  /** Treat reading as gallons/hour → convert with density. */
  asGph?: boolean;
  min: number;
};

const FLOW_CANDIDATES: readonly FlowCandidate[] = [
  { simVar: (i) => `ENG FUEL FLOW PPH:${i}`, unit: 'pounds per hour', min: 0.3 },
  { simVar: (i) => `RECIP ENG FUEL FLOW:${i}`, unit: 'pounds per hour', min: 0.3 },
  { simVar: (i) => `TURB ENG FUEL FLOW PPH:${i}`, unit: 'pounds per hour', min: 0.3 },
  { simVar: (i) => `ENG FUEL FLOW:${i}`, unit: 'pounds per hour', min: 0.3 },
  {
    simVar: (i) => `ENG FUEL FLOW GPH:${i}`,
    unit: 'gallons per hour',
    asGph: true,
    min: 0.05,
  },
  {
    simVar: (i) => `ENG FUEL FLOW:${i}`,
    unit: 'gallons per hour',
    asGph: true,
    min: 0.05,
  },
  {
    simVar: (i) => `GENERAL ENG FUEL FLOW:${i}`,
    unit: 'pounds per hour',
    min: 0.3,
  },
];

/** Probe common fuel-flow SimVars (for console diagnostics). */
export async function probeLiveFuelFlowSimVars(
  bridge: NamedPipeSimBridge,
  maxEngines = 4,
): Promise<FuelFlowProbeRow[]> {
  const rows: FuelFlowProbeRow[] = [];
  const combustion = await tryRead(bridge, 'GENERAL ENG COMBUSTION:1', 'bool');
  rows.push({
    simVar: 'GENERAL ENG COMBUSTION:1',
    unit: 'bool',
    value: combustion.value,
    error: combustion.error,
  });
  const rpm = await tryRead(bridge, 'GENERAL ENG RPM:1', 'rpm');
  rows.push({
    simVar: 'GENERAL ENG RPM:1',
    unit: 'rpm',
    value: rpm.value,
    error: rpm.error,
  });

  for (let index = 1; index <= maxEngines; index++) {
    for (const candidate of FLOW_CANDIDATES) {
      const name = candidate.simVar(index);
      const read = await tryRead(bridge, name, candidate.unit);
      rows.push({
        simVar: name,
        unit: candidate.unit,
        value: read.value,
        error: read.error,
      });
    }
  }
  return rows;
}

/**
 * Sum per-engine fuel flow → kg/h.
 * Tries several SimVar names; first working family per engine wins.
 */
export async function sampleLiveCruiseFuelFlowKgPerHour(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  let totalLbPerHour = 0;
  let engines = 0;

  for (let index = 1; index <= 4; index++) {
    let engineLbPerHour: number | undefined;
    for (const candidate of FLOW_CANDIDATES) {
      const read = await tryRead(bridge, candidate.simVar(index), candidate.unit);
      if (read.value == null || !(read.value > candidate.min)) continue;
      engineLbPerHour = candidate.asGph
        ? read.value * FALLBACK_LB_PER_GAL
        : read.value;
      break;
    }
    if (engineLbPerHour == null) continue;
    totalLbPerHour += engineLbPerHour;
    engines += 1;
  }

  if (engines === 0) return undefined;
  return Math.round(totalLbPerHour * 0.45359237 * 10) / 10;
}

/** Live true airspeed for kg/nm derivation default. */
export async function readLiveCruiseTasKt(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  const tas = await tryRead(bridge, 'AIRSPEED TRUE', 'knots');
  if (tas.value != null && tas.value > 40) return Math.round(tas.value);
  const ias = await tryRead(bridge, 'AIRSPEED INDICATED', 'knots');
  if (ias.value != null && ias.value > 40) return Math.round(ias.value);
  return undefined;
}
