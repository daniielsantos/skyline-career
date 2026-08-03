import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Mission, MissionSettlement } from './api.ts';
import {
  buildFlightDebrief,
  deriveDispatchStep,
  formatFlightDurationMs,
  formatLandingFpm,
  resolveLoadPath,
} from './dispatch-flow.ts';

function mission(partial: Partial<Mission>): Mission {
  return {
    id: 'msn_1',
    status: 'dispatched',
    originIcao: 'SBSV',
    destIcao: 'SBPS',
    commodityId: 'electronics',
    cargoKg: 1000,
    payUsd: 5000,
    urgency: 'normal',
    aircraftClassId: 'light_turboprop',
    deadlineTick: 100,
    reason: 'test',
    ...partial,
  };
}

describe('deriveDispatchStep', () => {
  it('returns manifest for draft and debrief when settled panel is open', () => {
    assert.equal(
      deriveDispatchStep({ hasDraft: true, hasDebrief: false, mission: null }),
      'manifest',
    );
    assert.equal(
      deriveDispatchStep({ hasDraft: false, hasDebrief: true, mission: null }),
      'debrief',
    );
  });

  it('walks flight_plan → fuel → load → ready → en_route', () => {
    assert.equal(
      deriveDispatchStep({
        hasDraft: false,
        hasDebrief: false,
        mission: mission({ status: 'accepted' }),
      }),
      'flight_plan',
    );
    assert.equal(
      deriveDispatchStep({
        hasDraft: false,
        hasDebrief: false,
        mission: mission({
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: new Date().toISOString(),
            ofpId: 'ofp1',
            findings: [],
          },
        }),
      }),
      'fuel',
    );
    assert.equal(
      deriveDispatchStep({
        hasDraft: false,
        hasDebrief: false,
        mission: mission({
          fuelAuthorizedOfpId: 'ofp1',
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: new Date().toISOString(),
            ofpId: 'ofp1',
            findings: [],
          },
        }),
      }),
      'load',
    );
    assert.equal(
      deriveDispatchStep({
        hasDraft: false,
        hasDebrief: false,
        mission: mission({
          fuelAuthorizedOfpId: 'ofp1',
          lastOfpCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: new Date().toISOString(),
            ofpId: 'ofp1',
            findings: [],
          },
          lastPreflightCheck: {
            verdict: 'pass',
            summary: 'ok',
            checkedAtIso: new Date().toISOString(),
            findings: [],
            loadVerification: { ready: true },
          } as Mission['lastPreflightCheck'],
        }),
      }),
      'ready',
    );
    assert.equal(
      deriveDispatchStep({
        hasDraft: false,
        hasDebrief: false,
        mission: mission({ status: 'in_flight' }),
      }),
      'en_route',
    );
  });
});

describe('resolveLoadPath', () => {
  it('prefers inject for light turboprop unless manual override', () => {
    assert.equal(resolveLoadPath(mission({}), false), 'inject');
    assert.equal(resolveLoadPath(mission({}), true), 'manual');
    assert.equal(
      resolveLoadPath(
        mission({
          aircraftClassId: 'narrow_freighter',
          loadMethod: 'native-simbrief',
        }),
        false,
      ),
      'efb',
    );
  });
});

describe('buildFlightDebrief', () => {
  it('nets payout minus fuel cost', () => {
    const settlement: MissionSettlement = {
      payoutUsd: 4500,
      penaltyUsd: 500,
      lateTicks: 2,
      onTime: false,
      deliveredKg: 1000,
      residualFuelKg: 120,
      landingFpm: -185,
      flightDurationMs: 69 * 60_000,
    };
    const debrief = buildFlightDebrief({
      mission: mission({
        payUsd: 5000,
        fuelUplift: {
          originIcao: 'SBSV',
          requestedKg: 200,
          deliveredKg: 200,
          unitPriceUsd: 1,
          costUsd: 800,
          scarcity: 'ok',
          upliftedAtTick: 10,
        },
      }),
      settlement,
    });
    assert.equal(debrief.netUsd, 3700);
    assert.equal(debrief.penaltyUsd, 500);
    assert.equal(debrief.landingFpm, -185);
    assert.equal(debrief.flightDurationMs, 69 * 60_000);
    assert.equal(formatFlightDurationMs(debrief.flightDurationMs), '1h 9m');
  });
});

describe('formatLandingFpm', () => {
  it('formats signed fpm', () => {
    assert.equal(formatLandingFpm(-220), '-220 fpm');
    assert.equal(formatLandingFpm(40), '+40 fpm');
    assert.equal(formatLandingFpm(null), '—');
  });
});
