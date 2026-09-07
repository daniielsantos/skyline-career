/**
 * Base Dispatcher seat — hire / fire / salary / scout policy.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fireBaseDispatcherMember,
  hireBaseDispatcherCandidate,
  quoteBaseDispatcherFireSeveranceUsd,
  refreshBaseDispatcherHirePool,
  resolveBaseDispatchScoutPolicy,
  settleBaseDispatcherSalaries,
} from './career-base-dispatcher.js';
import { buyFboTier1 } from './career-fbo.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { TICKS_PER_DAY } from './career-clock.js';

describe('base dispatcher seat', () => {
  it('hires one seat per Base and unlocks fleet scout policy', () => {
    const world = createSeedEconomyWorld({ seed: 'base-dispatcher-hire' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DispHire',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 50_000;
    const { fbo } = buyFboTier1(state, world, 'SBGR');

    assert.equal(resolveBaseDispatchScoutPolicy(state).mode, 'manual');

    refreshBaseDispatcherHirePool(state, world, {
      hubIcao: 'SBGR',
      force: true,
    });
    const candidate =
      state.playerFbos!.dispatcherHirePoolByHub!.SBGR![0]!;
    const before = state.walletUsd;
    const hired = hireBaseDispatcherCandidate(state, world, {
      fboId: fbo.id,
      candidateId: candidate.id,
    });
    assert.ok(hired.debitUsd > 0);
    assert.equal(state.walletUsd, before - hired.debitUsd);
    assert.equal(resolveBaseDispatchScoutPolicy(state).mode, 'fleet');

    assert.throws(
      () =>
        hireBaseDispatcherCandidate(state, world, {
          fboId: fbo.id,
          candidateId: candidate.id,
        }),
      /Already have a Dispatcher/i,
    );
  });

  it('fires with severance and settles daily salary', () => {
    const world = createSeedEconomyWorld({ seed: 'base-dispatcher-pay' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'DispPay',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 50_000;
    const { fbo } = buyFboTier1(state, world, 'SBGR');
    refreshBaseDispatcherHirePool(state, world, {
      hubIcao: 'SBGR',
      force: true,
    });
    const candidate =
      state.playerFbos!.dispatcherHirePoolByHub!.SBGR![0]!;
    const hired = hireBaseDispatcherCandidate(state, world, {
      fboId: fbo.id,
      candidateId: candidate.id,
    });

    const salary = settleBaseDispatcherSalaries(state, {
      fromTick: world.tick,
      toTick: world.tick + TICKS_PER_DAY,
    });
    assert.equal(salary.daysCharged, 1);
    assert.ok(salary.requestedUsd > 0);
    assert.equal(salary.debitUsd, salary.requestedUsd);

    const sev = quoteBaseDispatcherFireSeveranceUsd(hired.member);
    const walletBeforeFire = state.walletUsd;
    const fired = fireBaseDispatcherMember(state, world, hired.member.id);
    assert.equal(fired.debitUsd, sev);
    assert.equal(state.walletUsd, walletBeforeFire - sev);
    assert.equal(resolveBaseDispatchScoutPolicy(state).mode, 'manual');
  });
});
