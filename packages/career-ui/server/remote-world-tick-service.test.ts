/**
 * RemoteWorldTickService — Phase 4 live client (never advances).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isRemoteWorldTickEnabled,
  RemoteWorldTickService,
  remoteWorldPathStyleFromEnv,
} from './remote-world-tick-service.ts';

describe('RemoteWorldTickService', () => {
  it('reads api-style clock and never advances', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/api/world/clock')) {
        return new Response(
          JSON.stringify({
            worldId: 'local',
            tick: 42,
            lastBatchAtMs: 1_000,
            continuousHours: 0.1,
            serverNowMs: 2_000,
            msPerTick: 900_000,
            nextPulseAtMs: 1_900_000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('missing', { status: 404 });
    };
    const svc = new RemoteWorldTickService({
      baseUrl: 'http://host.test',
      pathStyle: 'api',
      fetchImpl,
    });
    const clock = await svc.getClock('local', 2_000);
    assert.equal(clock.tick, 42);
    assert.equal(svc.mode, 'mp-remote');
    assert.equal(await svc.getCatchUpProgress('local'), null);
    await assert.rejects(() => svc.advance('local', { n: 1 }), /cannot advance/);
    assert.ok(calls[0]?.includes('/api/world/clock'));
  });

  it('opens session via api path with company body', async () => {
    let body = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          worldClock: {
            worldId: 'local',
            tick: 10,
            lastBatchAtMs: 1,
            continuousHours: 0,
            serverNowMs: 2,
            msPerTick: 900_000,
            nextPulseAtMs: 901_000,
          },
          tickDelta: 3,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const svc = new RemoteWorldTickService({
      baseUrl: 'http://host.test/',
      pathStyle: 'api',
      fetchImpl,
      companyId: 'co_a',
    });
    const result = await svc.openCompanySession({
      companyId: 'co_a',
      worldId: 'local',
      lastSeenTick: 7,
    });
    assert.equal(result.tickDelta, 3);
    assert.ok(body.includes('"companyId":"co_a"'));
  });

  it('uses worlds path style when configured', async () => {
    let seen = '';
    const fetchImpl: typeof fetch = async (input) => {
      seen = String(input);
      return new Response(
        JSON.stringify({
          worldId: 'w1',
          tick: 1,
          lastBatchAtMs: 1,
          continuousHours: 0,
          serverNowMs: 2,
          msPerTick: 900_000,
          nextPulseAtMs: 901_000,
        }),
        { status: 200 },
      );
    };
    const svc = new RemoteWorldTickService({
      baseUrl: 'http://host.test',
      pathStyle: 'worlds',
      fetchImpl,
    });
    await svc.getClock('w1');
    assert.ok(seen.includes('/worlds/w1/clock'));
  });

  it('env helpers resolve remote mode', () => {
    assert.equal(
      isRemoteWorldTickEnabled({
        CAREER_WORLD_TICK: 'remote',
        CAREER_REMOTE_WORLD_URL: 'http://127.0.0.1:8787',
      }),
      true,
    );
    assert.equal(
      isRemoteWorldTickEnabled({ CAREER_WORLD_TICK: 'remote' }),
      false,
    );
    assert.equal(remoteWorldPathStyleFromEnv({}), 'api');
    assert.equal(
      remoteWorldPathStyleFromEnv({ CAREER_REMOTE_WORLD_PATH_STYLE: 'worlds' }),
      'worlds',
    );
  });
});
