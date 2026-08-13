import assert from 'node:assert/strict';
import test from 'node:test';
import { IpcClientError } from './ipc/types.js';
import { readLiveCgState, readLiveCgStateBestEffort } from './live-cg.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

test('readLiveCgState batches CG PERCENT + envelope', async () => {
  let batch: Array<{ name: string }> | undefined;
  const bridge = {
    async readSimVars(requests: Array<{ name: string }>) {
      batch = requests;
      return [0.25, 0.15, 0.35];
    },
  } as unknown as NamedPipeSimBridge;
  const cg = await readLiveCgState(bridge);
  assert.deepEqual(
    batch?.map((r) => r.name),
    ['CG PERCENT', 'CG FWD LIMIT', 'CG AFT LIMIT'],
  );
  assert.equal(cg.liveMac, 25);
  assert.equal(cg.minMac, 15);
  assert.equal(cg.maxMac, 35);
});

test('readLiveCgState throws TIMEOUT', async () => {
  const bridge = {
    async readSimVars() {
      throw new IpcClientError('TIMEOUT', 'pending read timed out');
    },
  } as unknown as NamedPipeSimBridge;
  await assert.rejects(
    () => readLiveCgState(bridge),
    (err: unknown) => err instanceof IpcClientError && err.code === 'TIMEOUT',
  );
});

test('readLiveCgStateBestEffort returns fallback on TIMEOUT', async () => {
  const bridge = {
    async readSimVars() {
      throw new IpcClientError('TIMEOUT', 'pending read timed out');
    },
  } as unknown as NamedPipeSimBridge;
  const cg = await readLiveCgStateBestEffort(bridge, {}, { liveMac: 22 });
  assert.equal(cg.liveMac, 22);
});
