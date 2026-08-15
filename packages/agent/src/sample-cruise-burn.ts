/**
 * Live cruise fuel-flow sampling for homologate / sample-burn wizards.
 *
 * MSFS 2024 GA often exposes RECIP / ENG FUEL FLOW PPH rather than a bare
 * "ENG FUEL FLOW" name; modular jets may use TURB ENG FUEL FLOW PPH.
 */
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/** MSFS Jet-A / avg avgas density fallback when FUEL WEIGHT PER GALLON is unavailable. */
const FALLBACK_LB_PER_GAL = 6.7;
/** Reject batch garbage (misaligned FLOAT64) — A380 takeoff is well below this. */
const MAX_SANE_ENGINE_LB_PER_HOUR = 40_000;
const MAX_SANE_TOTAL_KG_PER_HOUR = 50_000;

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
    simVar: (i) => `GENERAL ENG FUEL FLOW:${i}`,
    unit: 'pounds per hour',
    min: 0.3,
  },
];

const CRUISE_FLOW_MAX_ENGINES = 4;

const CRUISE_FLOW_BATCH: ReadonlyArray<{
  name: string;
  unit: string;
  engine: number;
  asGph?: boolean;
  min: number;
}> = Array.from({ length: CRUISE_FLOW_MAX_ENGINES }, (_, i) => {
  const engine = i + 1;
  return FLOW_CANDIDATES.map((candidate) => ({
    name: candidate.simVar(engine),
    unit: candidate.unit,
    engine,
    asGph: candidate.asGph,
    min: candidate.min,
  }));
}).flat();

const CRUISE_ENGINE_META: ReadonlyArray<{ name: string; unit: string }> = [
  { name: 'NUMBER OF ENGINES', unit: 'number' },
  { name: 'GENERAL ENG COMBUSTION:1', unit: 'bool' },
  { name: 'GENERAL ENG COMBUSTION:2', unit: 'bool' },
  { name: 'GENERAL ENG COMBUSTION:3', unit: 'bool' },
  { name: 'GENERAL ENG COMBUSTION:4', unit: 'bool' },
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
 * One Host readSimVars (≤32). TIMEOUT/NOT_CONNECTED throws — Watch resets next tick.
 * First working family per engine wins (same order as sequential probe).
 * Only engines that are combusting (or within NUMBER OF ENGINES) are summed —
 * ghost Eng2+ SimVar noise was wiping the cruise window (e.g. 58→450 kg/h).
 */
export async function sampleLiveCruiseFuelFlowKgPerHour(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  const values = await bridge.readSimVars([
    ...CRUISE_ENGINE_META,
    ...CRUISE_FLOW_BATCH.map(({ name, unit }) => ({ name, unit })),
  ]);

  const numberOfEnginesRaw = values[0];
  const combustion = [1, 2, 3, 4].map((engine) => {
    const raw = values[engine];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0.5;
  });
  const combustionKnown = combustion.some(Boolean);
  let maxEngines = CRUISE_FLOW_MAX_ENGINES;
  if (
    typeof numberOfEnginesRaw === 'number' &&
    Number.isFinite(numberOfEnginesRaw) &&
    numberOfEnginesRaw >= 1 &&
    numberOfEnginesRaw <= CRUISE_FLOW_MAX_ENGINES
  ) {
    maxEngines = Math.floor(numberOfEnginesRaw);
  }

  let totalLbPerHour = 0;
  let engines = 0;
  const seen = new Set<number>();
  const flowOffset = CRUISE_ENGINE_META.length;
  const accumulate = (requireCombustion: boolean) => {
    totalLbPerHour = 0;
    engines = 0;
    seen.clear();
    for (let i = 0; i < CRUISE_FLOW_BATCH.length; i += 1) {
      const row = CRUISE_FLOW_BATCH[i]!;
      if (seen.has(row.engine)) continue;
      if (row.engine < 1 || row.engine > maxEngines) continue;
      if (requireCombustion && combustionKnown && combustion[row.engine - 1] !== true) {
        continue;
      }
      const raw = values[flowOffset + i];
      if (
        typeof raw !== 'number' ||
        !Number.isFinite(raw) ||
        !(raw > row.min) ||
        raw > MAX_SANE_ENGINE_LB_PER_HOUR
      ) {
        continue;
      }
      seen.add(row.engine);
      totalLbPerHour += row.asGph ? raw * FALLBACK_LB_PER_GAL : raw;
      engines += 1;
    }
  };

  // Prefer combusting engines (drops ghost Eng2+ noise). If flags look wrong and
  // yield nothing, fall back to NUMBER OF ENGINES only so the cruise chip can live.
  accumulate(true);
  if (engines === 0 && combustionKnown) {
    accumulate(false);
  }

  if (engines === 0) return undefined;
  const kgPerHour = Math.round(totalLbPerHour * 0.45359237 * 10) / 10;
  if (!Number.isFinite(kgPerHour) || kgPerHour > MAX_SANE_TOTAL_KG_PER_HOUR) {
    return undefined;
  }
  return kgPerHour;
}

/** Live true airspeed for kg/nm derivation default. TIMEOUT throws. */
export async function readLiveCruiseTasKt(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  const [tas, ias] = await bridge.readSimVars([
    { name: 'AIRSPEED TRUE', unit: 'knots' },
    { name: 'AIRSPEED INDICATED', unit: 'knots' },
  ]);
  if (typeof tas === 'number' && Number.isFinite(tas) && tas > 40) {
    return Math.round(tas);
  }
  if (typeof ias === 'number' && Number.isFinite(ias) && ias > 40) {
    return Math.round(ias);
  }
  return undefined;
}
