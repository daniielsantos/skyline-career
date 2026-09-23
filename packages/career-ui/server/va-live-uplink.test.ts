import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createVaLiveUplink } from './va-live-uplink.ts';
import type { WorldApiClient } from './world-api-client.js';

describe('createVaLiveUplink', () => {
  it('posts to world with explicit companyId and auth', async () => {
    const calls: unknown[] = [];
    const worldClient = {
      withAuth(auth: { authorization?: string; companyId?: string }) {
        return {
          postVaFlightTrack(body: unknown) {
            calls.push({ auth, body });
            return Promise.resolve({ ok: true });
          },
        };
      },
    } as unknown as WorldApiClient;

    const uplink = createVaLiveUplink({
      worldClient,
      getAuth: () => ({ authorization: 'Bearer t', companyId: 'co_home' }),
      minIntervalMs: 0,
    });
    uplink.softReport({
      companyId: 'co_va',
      missionId: 'msn_1',
      lat: -23.4,
      lon: -46.5,
      altFt: 9000,
      gsKt: 180,
      phase: 'cruise',
      onGround: false,
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.length, 1);
    const call = calls[0] as {
      auth: { companyId: string; authorization: string };
      body: { companyId: string; missionId: string };
    };
    assert.equal(call.auth.companyId, 'co_va');
    assert.equal(call.auth.authorization, 'Bearer t');
    assert.equal(call.body.companyId, 'co_va');
    assert.equal(call.body.missionId, 'msn_1');
  });

  it('swallows world errors', async () => {
    const worldClient = {
      withAuth() {
        return {
          postVaFlightTrack() {
            return Promise.reject(new Error('world down'));
          },
        };
      },
    } as unknown as WorldApiClient;
    const uplink = createVaLiveUplink({
      worldClient,
      getAuth: () => ({ authorization: 'Bearer t' }),
      minIntervalMs: 0,
    });
    assert.doesNotThrow(() => {
      uplink.softReport({
        companyId: 'co_va',
        missionId: 'msn_1',
        lat: 1,
        lon: 2,
      });
    });
    await new Promise((r) => setTimeout(r, 20));
  });

  it('no-ops without company or lat/lon', async () => {
    let posts = 0;
    const worldClient = {
      withAuth() {
        return {
          postVaFlightTrack() {
            posts += 1;
            return Promise.resolve({});
          },
        };
      },
    } as unknown as WorldApiClient;
    const uplink = createVaLiveUplink({
      worldClient,
      getAuth: () => ({ authorization: 'Bearer t' }),
      minIntervalMs: 0,
    });
    uplink.softReport({
      companyId: '',
      missionId: 'msn_1',
      lat: 1,
      lon: 2,
    });
    uplink.softReport({
      companyId: 'co_va',
      missionId: 'msn_1',
      lat: 0,
      lon: 0,
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(posts, 0);
  });
});
