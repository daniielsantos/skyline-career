import type { SimVarReadRequest } from '@msfs-compat/runtime';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { simIpcSessionDied } from './sim-session-health.js';

/**
 * Batch read for inject/preflight.
 * TIMEOUT / NOT_CONNECTED throws (do not invent zeros).
 * UNRECOGNIZED_ID / missing vars fall back to sequential; those slots become NaN.
 */
export async function readSimVarsSoft(
  bridge: NamedPipeSimBridge,
  requests: SimVarReadRequest[],
  timeoutMs?: number,
): Promise<number[]> {
  if (requests.length === 0) return [];
  try {
    return await bridge.readSimVars(requests, timeoutMs);
  } catch (err) {
    if (simIpcSessionDied(err)) throw err;
    const values: number[] = [];
    for (const request of requests) {
      try {
        values.push(await bridge.readSimVar(request, timeoutMs));
      } catch (inner) {
        if (simIpcSessionDied(inner)) throw inner;
        values.push(Number.NaN);
      }
    }
    return values;
  }
}

export function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
