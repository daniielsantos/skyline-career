import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/** Curated A2A Aerostar / Accu-Sim candidates (from tablet + panel XML). */
export const A2A_AEROSTAR_LVAR_CANDIDATES: string[] = [
  // Fuel tanks (tablet FuelPayloadPage)
  'FuelLeftWingTank',
  'FuelRightWingTank',
  'FuelFuselageTank',
  'FuelLeftTipTank',
  'FuelRightTipTank',
  'FuelWingTankCapacity',
  'FuelFuselageTankCapacity',
  'FuelTipTankCapacity',
  'FuelLeftTipTankCapacity',
  'FuelRightTipTankCapacity',
  'FuelTotalTanksCapacity',
  'FuelTotalPct',
  'FuelPreset',
  'FuelEconomy',
  'FuelTotalizerUsedFuel',
  'FuelTotalizerRemainingFuel',
  'FSfuel',
  // Payload / seats / baggage
  'PayloadWeight',
  'PayloadWeightPct',
  'TotalWeight',
  'EmptyWeightLbs',
  'GrossWeightLbs',
  'MaxBaggage',
  'BaggageWeight',
  'BaggageMax',
  'Character1Weight',
  'Character2Weight',
  'Character3Weight',
  'Character4Weight',
  'Character5Weight',
  'Character6Weight',
  'Seat1Character',
  'Seat2Character',
  'Seat3Character',
  'Seat4Character',
  'Seat5Character',
  'Seat6Character',
  'CoG',
  'CoGpct',
  'CoGmin',
  'CoGmax',
];

export type LVarProbeReading = {
  name: string;
  ok: boolean;
  value?: number;
  error?: string;
};

export async function readLVarSafe(bridge: NamedPipeSimBridge, name: string): Promise<LVarProbeReading> {
  try {
    const value = await bridge.readLVar(name);
    const sane = Number.isFinite(value);
    return {
      name,
      ok: sane,
      value: sane ? value : undefined,
      error: sane ? undefined : 'insane',
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function probeLVars(
  bridge: NamedPipeSimBridge,
  names: string[],
): Promise<LVarProbeReading[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const readings: LVarProbeReading[] = [];
  for (const name of unique) {
    readings.push(await readLVarSafe(bridge, name));
  }
  return readings;
}

export async function watchLVars(
  bridge: NamedPipeSimBridge,
  names: string[],
  options: { intervalMs?: number; durationMs?: number; onChange: (diff: LVarProbeReading[]) => void },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 750;
  const durationMs = options.durationMs ?? 60_000;
  const baseline = new Map<string, number | undefined>();
  const first = await probeLVars(bridge, names);
  for (const r of first) baseline.set(r.name, r.ok ? r.value : undefined);

  const started = Date.now();
  while (Date.now() - started < durationMs) {
    await bridge.delay(intervalMs);
    const now = await probeLVars(bridge, names);
    const changed: LVarProbeReading[] = [];
    for (const r of now) {
      if (!r.ok) continue;
      const prev = baseline.get(r.name);
      if (prev === undefined || Math.abs((r.value ?? 0) - prev) > 0.05) {
        changed.push(r);
        baseline.set(r.name, r.value);
      }
    }
    if (changed.length > 0) options.onChange(changed);
  }
}
