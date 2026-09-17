import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WorldApiAuthScope,
  WorldApiClient,
  WorldApiError,
} from './world-api-client.ts';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('WorldApiAuthScope', () => {
  it('isolates overlapping gateway requests', async () => {
    const scope = new WorldApiAuthScope();

    const [authenticated, publicRequest] = await Promise.all([
      scope.run(
        { authorization: 'Bearer pilot', companyId: 'co_pilot' },
        async () => {
          await delay(15);
          return scope.current();
        },
      ),
      scope.run({}, async () => {
        await delay(5);
        return scope.current();
      }),
    ]);

    assert.deepEqual(authenticated, {
      authorization: 'Bearer pilot',
      companyId: 'co_pilot',
    });
    assert.deepEqual(publicRequest, {});
  });

  it('keeps authenticated credentials for background Watch work', () => {
    const scope = new WorldApiAuthScope();
    scope.run(
      { authorization: 'Bearer pilot', companyId: 'co_pilot' },
      () => assert.equal(scope.current().authorization, 'Bearer pilot'),
    );
    scope.run({}, () => assert.equal(scope.current().authorization, undefined));

    assert.deepEqual(scope.current(), {
      authorization: 'Bearer pilot',
      companyId: 'co_pilot',
    });
  });

  it('preserves an upstream auth_required response', async () => {
    const client = new WorldApiClient({
      baseUrl: 'https://world.example',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: 'Authentication required',
            code: 'auth_required',
          }),
          { status: 401 },
        ),
    });

    await assert.rejects(
      () => client.getMissions(),
      (error: unknown) => {
        assert.ok(error instanceof WorldApiError);
        assert.equal(error.status, 401);
        assert.deepEqual(error.body, {
          error: 'Authentication required',
          code: 'auth_required',
        });
        return true;
      },
    );
  });
});
