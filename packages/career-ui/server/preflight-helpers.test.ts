import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lastPreflightFromInjectLive, preflightBlocksDepart } from './preflight-helpers.ts';
import type { MissionIntent } from '@msfs-compat/shared';

function missionWithPreflight(
  check: NonNullable<MissionIntent['lastPreflightCheck']>,
): MissionIntent {
  return {
    id: 'm1',
    status: 'dispatched',
    originIcao: 'SBGR',
    destIcao: 'SBSP',
    lastPreflightCheck: check,
  } as MissionIntent;
}

describe('preflightBlocksDepart', () => {
  it('blocks when no preflight check', () => {
    assert.equal(
      preflightBlocksDepart({ id: 'm1', status: 'dispatched' } as MissionIntent),
      true,
    );
  });

  it('blocks when fuel/payload not ready', () => {
    assert.equal(
      preflightBlocksDepart(
        missionWithPreflight({
          verdict: 'fail',
          summary: 'not ready',
          checkedAtIso: '2026-01-01T00:00:00Z',
          loadVerification: {
            ready: false,
            fuel: { liveLb: 0, ok: false },
            payload: { ok: false },
            aircraft: { onGround: true, enginesRunning: false },
            weightNoteCount: 0,
          },
          findings: [],
        }),
      ),
      true,
    );
  });

  it('blocks when ready but location.ok is false', () => {
    assert.equal(
      preflightBlocksDepart(
        missionWithPreflight({
          verdict: 'fail',
          summary: 'far from origin',
          checkedAtIso: '2026-01-01T00:00:00Z',
          loadVerification: {
            ready: true,
            fuel: { liveLb: 1000, ok: true },
            payload: { ok: true },
            aircraft: { onGround: true, enginesRunning: false },
            weightNoteCount: 0,
          },
          location: {
            ok: false,
            originIcao: 'SBGR',
            distanceNm: 40,
            radiusNm: 12,
            code: 'ORIGIN_TOO_FAR',
          },
          findings: [],
        }),
      ),
      true,
    );
  });

  it('allows when ready and location ok', () => {
    assert.equal(
      preflightBlocksDepart(
        missionWithPreflight({
          verdict: 'pass',
          summary: 'ready',
          checkedAtIso: '2026-01-01T00:00:00Z',
          loadVerification: {
            ready: true,
            fuel: { liveLb: 1000, ok: true },
            payload: { ok: true },
            aircraft: { onGround: true, enginesRunning: false },
            weightNoteCount: 0,
          },
          location: {
            ok: true,
            originIcao: 'SBGR',
            distanceNm: 1.2,
            radiusNm: 12,
            code: 'ORIGIN_OK',
          },
          findings: [],
        }),
      ),
      false,
    );
  });

  it('allows when ready and location omitted (legacy checks)', () => {
    assert.equal(
      preflightBlocksDepart(
        missionWithPreflight({
          verdict: 'pass',
          summary: 'ready',
          checkedAtIso: '2026-01-01T00:00:00Z',
          loadVerification: {
            ready: true,
            fuel: { liveLb: 1000, ok: true },
            payload: { ok: true },
            aircraft: { onGround: true, enginesRunning: false },
            weightNoteCount: 0,
          },
          findings: [],
        }),
      ),
      false,
    );
  });
});

describe('lastPreflightFromInjectLive', () => {
  it('marks ready from the inject write snapshot without another sample', () => {
    const check = lastPreflightFromInjectLive({
      previous: {
        verdict: 'fail',
        summary: 'stale',
        checkedAtIso: '2026-01-01T00:00:00Z',
        loadVerification: {
          ready: false,
          fuel: { plannedLb: 6100, liveLb: 100, ok: false },
          payload: {
            plannedLb: 15_200,
            liveLb: 200,
            ok: false,
            cargoLb: 14_980,
            crewLb: 220,
          },
          aircraft: { onGround: true, enginesRunning: false },
          weightNoteCount: 0,
        },
        findings: [],
      } as NonNullable<MissionIntent['lastPreflightCheck']>,
      stations: { 1: 220, 5: 7490, 6: 7490 },
      tanks: { LEFT_MAIN: 400, RIGHT_MAIN: 400 },
      liveFuelLb: 6100,
      livePayloadLb: 15_200,
      liveTanks: { left: 3050, right: 3050, center: 0 },
      blockFuelLb: 6100,
      cargoLb: 14_980,
    });
    assert.equal(check.loadVerification?.ready, true);
    assert.equal(check.loadVerification?.payload.liveLb, 15_200);
    assert.equal(check.verdict, 'pass');
  });
});
