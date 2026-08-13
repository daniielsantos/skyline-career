import { normalizeMacPercent } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { readSimVarsSoft } from './read-simvars-soft.js';
import { simIpcSessionDied } from './sim-session-health.js';

export type LiveCgState = {
  /** Current longitudinal CG in %MAC. */
  liveMac?: number;
  /** Most forward authorized CG (%MAC) from CG FWD LIMIT. */
  minMac?: number;
  /** Most aft authorized CG (%MAC) from CG AFT LIMIT. */
  maxMac?: number;
};

function macFromRaw(raw: number | undefined): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return normalizeMacPercent(raw);
}

/**
 * Live CG + official envelope from MSFS SimVars (same values as Mass & Balance tablet).
 * One readSimVars batch (3 FLOAT64). TIMEOUT/NOT_CONNECTED throws.
 */
export async function readLiveCgState(
  bridge: NamedPipeSimBridge,
  opts: { readVar?: string; readUnit?: string } = {},
): Promise<LiveCgState> {
  const [liveRaw, fwdRaw, aftRaw] = await readSimVarsSoft(bridge, [
    {
      name: opts.readVar ?? 'CG PERCENT',
      unit: opts.readUnit ?? 'Percent over 100',
    },
    { name: 'CG FWD LIMIT', unit: 'Percent over 100' },
    { name: 'CG AFT LIMIT', unit: 'Percent over 100' },
  ]);
  const liveMac = macFromRaw(liveRaw);
  let forward = macFromRaw(fwdRaw);
  let aft = macFromRaw(aftRaw);
  if (forward !== undefined && aft !== undefined && forward > aft) {
    [forward, aft] = [aft, forward];
  }
  return { liveMac, minMac: forward, maxMac: aft };
}

/** Same as readLiveCgState, but hang-mole returns `fallback` instead of throwing. */
export async function readLiveCgStateBestEffort(
  bridge: NamedPipeSimBridge,
  opts: { readVar?: string; readUnit?: string } = {},
  fallback: LiveCgState = {},
): Promise<LiveCgState> {
  try {
    return await readLiveCgState(bridge, opts);
  } catch (err) {
    if (simIpcSessionDied(err)) return fallback;
    throw err;
  }
}
