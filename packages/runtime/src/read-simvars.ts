import type { SimBridge, SimVarReadRequest } from './types.js';

/** Use Host batch when present; otherwise sequential (tests / old mocks). */
export async function readBridgeSimVars(
  bridge: SimBridge,
  requests: SimVarReadRequest[],
): Promise<number[]> {
  if (requests.length === 0) return [];
  if (typeof bridge.readSimVars === 'function') {
    return bridge.readSimVars(requests);
  }
  const values: number[] = [];
  for (const request of requests) {
    values.push(await bridge.readSimVar(request));
  }
  return values;
}
