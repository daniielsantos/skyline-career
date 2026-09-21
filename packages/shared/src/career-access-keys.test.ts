import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  AccessKeyError,
  CAREER_STORE_SCHEMA_VERSION,
  hashAccessKey,
  normalizeAccessKey,
  openCareerStore,
  type MintedAccessKey,
} from './index.js';

describe('career access keys', () => {
  it('normalizes and hashes stably', () => {
    assert.equal(normalizeAccessKey('abcd-efgh-ijkl-mnop'), 'ABCDEFGH1JK1MN0P');
    const a = hashAccessKey('AAAA-BBBB-CCCC-DDDD');
    const b = hashAccessKey('aaaabbbbccccdddd');
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('mints, claims once, rejects reuse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-access-keys-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    assert.equal(CAREER_STORE_SCHEMA_VERSION, '19');

    const minted = (await Promise.resolve(
      store.mintAccessKeys({ count: 2, batchId: 'test-batch' }),
    )) as MintedAccessKey[];
    assert.equal(minted.length, 2);
    assert.equal(minted[0]!.batchId, 'test-batch');
    assert.match(minted[0]!.key, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

    const first = await Promise.resolve(
      store.authRegister({
        loginName: 'pilot_a',
        displayName: 'Pilot A',
        password: 'secret12',
        accessKeyCode: minted[0]!.key,
      }),
    );
    assert.ok(first.account.id);

    await assert.rejects(
      async () =>
        store.authRegister({
          loginName: 'pilot_b',
          displayName: 'Pilot B',
          password: 'secret12',
          accessKeyCode: minted[0]!.key,
        }),
      (err: unknown) =>
        err instanceof AccessKeyError && err.code === 'access_key_used',
    );

    const second = await Promise.resolve(
      store.authRegister({
        loginName: 'pilot_b',
        displayName: 'Pilot B',
        password: 'secret12',
        accessKeyCode: minted[1]!.key,
      }),
    );
    assert.ok(second.account.id);

    assert.equal(
      await Promise.resolve(store.revokeAccessKey({ code: minted[1]!.key })),
      true,
    );
  });

  it('rejects invalid and revoked keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-access-keys-bad-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    const minted = (await Promise.resolve(
      store.mintAccessKeys({ count: 1 }),
    )) as MintedAccessKey[];
    const key = minted[0]!;
    assert.equal(
      await Promise.resolve(store.revokeAccessKey({ code: key.key })),
      true,
    );

    await assert.rejects(
      async () =>
        store.authRegister({
          loginName: 'pilot_x',
          displayName: 'Pilot X',
          password: 'secret12',
          accessKeyCode: key.key,
        }),
      (err: unknown) =>
        err instanceof AccessKeyError && err.code === 'access_key_revoked',
    );

    await assert.rejects(
      async () =>
        store.authRegister({
          loginName: 'pilot_y',
          displayName: 'Pilot Y',
          password: 'secret12',
          accessKeyCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
        }),
      (err: unknown) =>
        err instanceof AccessKeyError && err.code === 'access_key_invalid',
    );
  });
});
