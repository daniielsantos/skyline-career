import { normalizeMacPercent } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

export type LiveCgState = {
  /** Current longitudinal CG in %MAC. */
  liveMac?: number;
  /** Most forward authorized CG (%MAC) from CG FWD LIMIT. */
  minMac?: number;
  /** Most aft authorized CG (%MAC) from CG AFT LIMIT. */
  maxMac?: number;
};

async function tryReadMac(
  bridge: NamedPipeSimBridge,
  name: string,
  unit = 'Percent over 100',
): Promise<number | undefined> {
  try {
    const raw = await bridge.readSimVar({ name, unit });
    if (!Number.isFinite(raw)) return undefined;
    return normalizeMacPercent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Live CG + official envelope from MSFS SimVars (same values as Mass & Balance tablet).
 * CG PERCENT / CG FWD LIMIT / CG AFT LIMIT.
 */
export async function readLiveCgState(
  bridge: NamedPipeSimBridge,
  opts: { readVar?: string; readUnit?: string } = {},
): Promise<LiveCgState> {
  const [liveMac, minMac, maxMac] = await Promise.all([
    tryReadMac(bridge, opts.readVar ?? 'CG PERCENT', opts.readUnit ?? 'Percent over 100'),
    tryReadMac(bridge, 'CG FWD LIMIT'),
    tryReadMac(bridge, 'CG AFT LIMIT'),
  ]);
  let forward = minMac;
  let aft = maxMac;
  if (forward !== undefined && aft !== undefined && forward > aft) {
    [forward, aft] = [aft, forward];
  }
  return { liveMac, minMac: forward, maxMac: aft };
}
