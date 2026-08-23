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
  formatRunwayTouchdownDebriefLine,
  airborneResumeShouldOpenDispatch,
  isOfpCargoUnderOnlyFailureUi,
  livePreflightWaitHint,
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
            verdict: 'fail',
            summary: 'far',
            checkedAtIso: new Date().toISOString(),
            findings: [],
            loadVerification: { ready: true },
            location: {
              ok: false,
              originIcao: 'SBGR',
              distanceNm: 40,
              radiusNm: 12,
              code: 'ORIGIN_TOO_FAR',
            },
          } as Mission['lastPreflightCheck'],
        }),
      }),
      'load',
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

  it('maps B707 stamp without inject to efb', () => {
    assert.equal(
      resolveLoadPath(
        mission({
          aircraftClassId: 'narrow_freighter',
          airframeTypeId: 'inibuilds-boeing-b707-gns',
          loadMethod: 'native-simbrief',
          injectCapable: false,
        }),
        false,
      ),
      'efb',
    );
  });
});

describe('livePreflightWaitHint', () => {
  it('explains SimBridge offline instead of a blank wait', () => {
    assert.match(
      livePreflightWaitHint({
        simBridgeConnected: false,
        onGround: true,
        watchRunning: false,
        aircraftLabel: 'Boeing B707 GNS',
      }),
      /SimBridge is offline/i,
    );
  });

  it('surfaces bootstrap errors', () => {
    assert.match(
      livePreflightWaitHint({
        bootstrapError: 'pipe timeout',
        simBridgeConnected: true,
        onGround: true,
        watchRunning: false,
        aircraftLabel: 'Boeing B707 GNS',
      }),
      /Preflight error: pipe timeout/,
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

  it('says Watch is reconnecting when landed but Watch is down', () => {
    assert.match(
      dispatchStepStatusLine({
        ...base,
        step: 'en_route',
        watchRunning: false,
        watchOnGround: true,
        watchEnginesRunning: false,
      }),
      /reconnecting to settle/i,
    );
  });

  it('does not call a ramp reload a landing', () => {
    assert.match(
      dispatchStepStatusLine({
        ...base,
        step: 'en_route',
        watchOnGround: true,
        watchEnginesRunning: false,
        watchSawAirborne: false,
      }),
      /still on the ground/i,
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

describe('formatRunwayTouchdownDebriefLine', () => {
  // KSTL 12R/30L: landing 30L is the reciprocal end, so the stored lateral
  // (measured against the 12R heading) has to be mirrored for the pilot.
  const kstl30L = {
    lat: 38.745,
    lon: -90.36,
    icao: 'KSTL',
    runwayIdent: '12R',
    runwayIdentReciprocal: '30L',
    lengthM: 3359,
    widthM: 61,
    headingTrueDeg: 122,
    alongM: -400,
    lateralM: 12,
    pastThresholdM: 1280,
    onPavement: true,
    landingEnd: 'reciprocal' as const,
  };

  it('mirrors the lateral side on a reciprocal approach', () => {
    const line = formatRunwayTouchdownDebriefLine(kstl30L);
    assert.match(line, /RWY 30L/);
    assert.match(line, /12 m left/);
    assert.equal(line.includes('right'), false);
  });

  it('keeps the stored side on a primary approach', () => {
    assert.match(
      formatRunwayTouchdownDebriefLine({
        ...kstl30L,
        landingEnd: 'primary' as const,
      }),
      /RWY 12R · 1280 m past THR · 12 m right/,
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

describe('airborneResumeShouldOpenDispatch', () => {
  it('waits until an in_flight mission exists so a ground hydrate cannot skip cruise', () => {
    assert.equal(
      airborneResumeShouldOpenDispatch({
        alreadyDone: false,
        hubSelected: true,
        tab: 'market',
        airportIcao: null,
        playerMissionStatus: 'dispatched',
      }),
      'wait',
    );
    assert.equal(
      airborneResumeShouldOpenDispatch({
        alreadyDone: false,
        hubSelected: true,
        tab: 'market',
        airportIcao: null,
        playerMissionStatus: 'in_flight',
      }),
      'open-dispatch',
    );
  });

  it('does not steal Dispatch when already there', () => {
    assert.equal(
      airborneResumeShouldOpenDispatch({
        alreadyDone: false,
        hubSelected: true,
        tab: 'staging',
        airportIcao: null,
        playerMissionStatus: 'in_flight',
      }),
      'mark-done',
    );
  });
});
