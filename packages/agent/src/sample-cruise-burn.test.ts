import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IpcClientError } from './ipc/types.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { sampleLiveCruiseFuelFlowKgPerHour } from './sample-cruise-burn.js';

function mockBridge(
  values: Record<string, number>,
): NamedPipeSimBridge {
  return {
    async readSimVar(request: { name: string; unit: string }) {
      const key = `${request.name}|${request.unit}`;
      if (!(key in values) && !(request.name in values)) {
        throw new Error(`unknown ${request.name}`);
      }
      return values[key] ?? values[request.name]!;
    },
    async readSimVars(requests: Array<{ name: string; unit: string }>) {
      return requests.map((request) => {
        const key = `${request.name}|${request.unit}`;
        return values[key] ?? values[request.name] ?? 0;
      });
    },
  } as NamedPipeSimBridge;
}

describe('sampleLiveCruiseFuelFlowKgPerHour', () => {
  it('prefers ENG FUEL FLOW PPH over bare ENG FUEL FLOW', async () => {
    const kgPerHour = await sampleLiveCruiseFuelFlowKgPerHour(
      mockBridge({
        'ENG FUEL FLOW PPH:1|pounds per hour': 40,
        'ENG FUEL FLOW PPH:2|pounds per hour': 42,
      }),
    );
    // 82 lb/h → ~37.2 kg/h
    assert.equal(kgPerHour, 37.2);
  });

  it('falls back to RECIP ENG FUEL FLOW for piston twins', async () => {
    const kgPerHour = await sampleLiveCruiseFuelFlowKgPerHour(
      mockBridge({
        'RECIP ENG FUEL FLOW:1|pounds per hour': 35,
        'RECIP ENG FUEL FLOW:2|pounds per hour': 35,
      }),
    );
    assert.equal(kgPerHour, 31.8);
  });

  it('ignores insane batch garbage instead of painting a huge kg/h', async () => {
    const kgPerHour = await sampleLiveCruiseFuelFlowKgPerHour(
      mockBridge({
        'ENG FUEL FLOW PPH:1|pounds per hour': 1e15,
        'ENG FUEL FLOW PPH:2|pounds per hour': 1e15,
      }),
    );
    assert.equal(kgPerHour, undefined);
  });

  it('throws on the first TIMEOUT instead of probing 28 SimVars', async () => {
    await assert.rejects(
      () =>
        sampleLiveCruiseFuelFlowKgPerHour({
          async readSimVars() {
            throw new IpcClientError('TIMEOUT', 'SimConnect request timed out');
          },
        } as unknown as NamedPipeSimBridge),
      (err: unknown) =>
        err instanceof IpcClientError && err.code === 'TIMEOUT',
    );
  });
});
