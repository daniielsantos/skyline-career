import assert from 'node:assert/strict';
import test from 'node:test';
import { IpcClientError } from './ipc/types.js';
import { finiteOrZero, readSimVarsSoft } from './read-simvars-soft.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

test('readSimVarsSoft returns the batch in request order', async () => {
  const calls: string[] = [];
  const bridge = {
    async readSimVars(requests: Array<{ name: string }>) {
      calls.push('batch');
      return requests.map((_, i) => (i + 1) * 10);
    },
    async readSimVar() {
      calls.push('one');
      return 0;
    },
  } as unknown as NamedPipeSimBridge;
  const values = await readSimVarsSoft(bridge, [
    { name: 'A', unit: 'pounds' },
    { name: 'B', unit: 'pounds' },
  ]);
  assert.deepEqual(values, [10, 20]);
  assert.deepEqual(calls, ['batch']);
});

test('readSimVarsSoft rethrows TIMEOUT without sequential fallback', async () => {
  const bridge = {
    async readSimVars() {
      throw new IpcClientError('TIMEOUT', 'pending read timed out');
    },
    async readSimVar() {
      throw new Error('should not sequential-read after TIMEOUT');
    },
  } as unknown as NamedPipeSimBridge;
  await assert.rejects(
    () => readSimVarsSoft(bridge, [{ name: 'A', unit: 'pounds' }]),
    (err: unknown) => err instanceof IpcClientError && err.code === 'TIMEOUT',
  );
});

test('readSimVarsSoft falls back to sequential on UNRECOGNIZED_ID', async () => {
  const names: string[] = [];
  const bridge = {
    async readSimVars() {
      throw new IpcClientError('UNRECOGNIZED_ID', 'bad def');
    },
    async readSimVar(request: { name: string }) {
      names.push(request.name);
      if (request.name === 'BAD') {
        throw new IpcClientError('UNRECOGNIZED_ID', 'missing');
      }
      return 42;
    },
  } as unknown as NamedPipeSimBridge;
  const values = await readSimVarsSoft(bridge, [
    { name: 'GOOD', unit: 'pounds' },
    { name: 'BAD', unit: 'pounds' },
  ]);
  assert.equal(values[0], 42);
  assert.equal(Number.isFinite(values[1]), false);
  assert.deepEqual(names, ['GOOD', 'BAD']);
  assert.equal(finiteOrZero(values[1]), 0);
});
