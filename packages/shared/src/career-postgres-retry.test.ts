import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTransientPostgresStartupError,
  withPostgresReadyRetry,
} from './career-postgres-retry.js';

describe('Postgres startup retry', () => {
  it('treats reboot deadlocks and recovery failures as transient', () => {
    assert.equal(
      isTransientPostgresStartupError({
        code: '40P01',
        message: 'deadlock detected',
      }),
      true,
    );
    assert.equal(
      isTransientPostgresStartupError({
        code: '57P03',
        message: 'the database system is not yet accepting connections',
      }),
      true,
    );
    assert.equal(
      isTransientPostgresStartupError({ code: '42P01', message: 'missing' }),
      false,
    );
  });

  it('retries a transient open and returns the successful result', async () => {
    let calls = 0;
    const logs: string[] = [];
    const result = await withPostgresReadyRetry(
      'fixed-world open',
      async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
        }
        return 'postgres';
      },
      {
        attempts: 3,
        delayMs: 1,
        log: (line) => logs.push(line),
        sleep: async () => undefined,
      },
    );

    assert.equal(result, 'postgres');
    assert.equal(calls, 2);
    assert.equal(logs.length, 1);
  });

  it('does not retry a permanent schema failure', async () => {
    let calls = 0;
    await assert.rejects(
      withPostgresReadyRetry(
        'fixed-world open',
        async () => {
          calls += 1;
          throw Object.assign(new Error('missing relation'), { code: '42P01' });
        },
        {
          attempts: 3,
          delayMs: 1,
          log: () => undefined,
          sleep: async () => undefined,
        },
      ),
      /missing relation/,
    );
    assert.equal(calls, 1);
  });
});
