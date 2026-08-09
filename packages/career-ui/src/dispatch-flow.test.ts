import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Mission, MissionSettlement } from './api.ts';
import {
  buildFlightDebrief,
  deriveDispatchStep,
  dispatchStepStatusLine,
  formatCargoOpsDebriefLine,
  formatFlightDurationMs,
  formatLandingFpm,
  isOfpCargoUnderOnlyFailureUi,
  ofpCargoKgFromUnderFinding,
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

describe('dispatchStepStatusLine en_route', () => {
  const base = {
    mission: mission({ status: 'in_flight' as const }),
    simbriefUser: 'pilot',
    ofpAutoStatus: 'idle' as const,
    missionFuelQuoteStatus: 'idle' as const,
    missionFuelQuoteError: null,
    loadOfpAutoStatus: 'idle' as const,
    loadOfpAutoError: null,
    loadPath: 'inject' as const,
    simBridgeConnected: true,
    watchRunning: true,
    watchAutoStatus: 'idle' as const,
  };

  it('asks for engines off after landing', () => {
    assert.match(
      dispatchStepStatusLine({
        ...base,
        step: 'en_route',
        watchOnGround: true,
        watchEnginesRunning: true,
        watchSawAirborne: true,
      }),
      /shut down engines/i,
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
      flightScore: {
        earned: 44,
        max: 51,
        pct: 86,
        categories: [
          {
            id: 'envelope',
            label: 'Envelope',
            earned: 20,
            max: 20,
            metrics: [],
          },
          {
            id: 'taxi',
            label: 'Taxi',
            earned: 8,
            max: 8,
            metrics: [],
          },
          {
            id: 'landing',
            label: 'Landing',
            earned: 16,
            max: 23,
            metrics: [],
          },
        ],
      },
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
    assert.equal(debrief.flightScore?.pct, 86);
    assert.equal(debrief.flightScore?.earned, 44);
    assert.deepEqual(debrief.cargoOpsDeltas, []);
  });

  it('includes cargo ops deltas when settlement provides them', () => {
    const debrief = buildFlightDebrief({
      mission: mission({ payUsd: 1000 }),
      settlement: {
        payoutUsd: 1000,
        penaltyUsd: 0,
        lateTicks: 0,
        onTime: true,
        deliveredKg: 100,
        residualFuelKg: null,
        cargoOpsDeltas: [
          {
            commodityId: 'general',
            deltaRep: 4,
            repBefore: 55,
            repAfter: 59,
            settlesOkAfter: 1,
            unlockedNow: false,
            clean: true,
          },
        ],
      },
    });
    assert.equal(debrief.cargoOpsDeltas.length, 1);
    assert.match(
      formatCargoOpsDebriefLine(debrief.cargoOpsDeltas),
      /General \+4→59 · clean/,
    );
  });
});

describe('formatLandingFpm', () => {
  it('formats signed fpm', () => {
    assert.equal(formatLandingFpm(-220), '-220 fpm');
    assert.equal(formatLandingFpm(40), '+40 fpm');
    assert.equal(formatLandingFpm(null), '—');
  });
});

describe('isOfpCargoUnderOnlyFailureUi', () => {
  it('detects under-cargo from actual/expected', () => {
    const check = {
      verdict: 'fail' as const,
      summary: 'fail',
      checkedAtIso: new Date().toISOString(),
      findings: [
        {
          code: 'INTENT_CARGO_MISMATCH',
          severity: 'fail',
          message: 'OFP cargo 1500 kg below mission 1800 kg',
          expected: 1800,
          actual: 1500,
          delta: -300,
        },
      ],
    };
    assert.equal(isOfpCargoUnderOnlyFailureUi(check), true);
    assert.equal(ofpCargoKgFromUnderFinding(check), 1500);
  });

  it('rejects when another fail is present', () => {
    assert.equal(
      isOfpCargoUnderOnlyFailureUi({
        verdict: 'fail',
        summary: 'fail',
        checkedAtIso: new Date().toISOString(),
        findings: [
          {
            code: 'INTENT_CARGO_MISMATCH',
            severity: 'fail',
            message: 'OFP cargo 1500 kg below mission 1800 kg',
            expected: 1800,
            actual: 1500,
          },
          {
            code: 'INTENT_ORIGIN_MISMATCH',
            severity: 'fail',
            message: 'origin mismatch',
          },
        ],
      }),
      false,
    );
  });
});
