/**
 * Company persist guard — empty shell must not wipe progress.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertCompanyPersistSafe,
  companyProgressFromState,
  isEmptyCompanyShell,
} from './career-store-company-guard.js';
import { emptyMissionsStateV2 } from './career-fleet.js';

describe('company persist guard', () => {
  it('detects empty shells', () => {
    assert.equal(
      isEmptyCompanyShell(companyProgressFromState(emptyMissionsStateV2())),
      true,
    );
  });

  it('refuses empty shell over wallet/fleet/ledger', () => {
    assert.throws(
      () =>
        assertCompanyPersistSafe({
          companyId: 'co_x',
          existing: {
            walletUsd: 50_000,
            fleetCount: 1,
            ledgerCount: 12,
            missionCount: 0,
          },
          incoming: {
            walletUsd: 0,
            fleetCount: 0,
            ledgerCount: 0,
            missionCount: 0,
          },
        }),
      /empty shell/,
    );
  });

  it('refuses clearing fleet or ledger alone', () => {
    assert.throws(
      () =>
        assertCompanyPersistSafe({
          companyId: 'co_x',
          existing: {
            walletUsd: 10,
            fleetCount: 2,
            ledgerCount: 5,
            missionCount: 0,
          },
          incoming: {
            walletUsd: 10,
            fleetCount: 0,
            ledgerCount: 5,
            missionCount: 0,
          },
        }),
      /clear fleet/,
    );
    assert.throws(
      () =>
        assertCompanyPersistSafe({
          companyId: 'co_x',
          existing: {
            walletUsd: 10,
            fleetCount: 1,
            ledgerCount: 5,
            missionCount: 0,
          },
          incoming: {
            walletUsd: 10,
            fleetCount: 1,
            ledgerCount: 0,
            missionCount: 0,
          },
        }),
      /clear ledger/,
    );
  });

  it('allows normal wallet spend with fleet retained', () => {
    assert.doesNotThrow(() =>
      assertCompanyPersistSafe({
        companyId: 'co_x',
        existing: {
          walletUsd: 100_000,
          fleetCount: 1,
          ledgerCount: 3,
          missionCount: 0,
          fleetIds: ['acf_atr'],
        },
        incoming: {
          walletUsd: 20_000,
          fleetCount: 1,
          ledgerCount: 4,
          missionCount: 0,
          incomingFleetIds: ['acf_atr'],
        },
      }),
    );
  });

  it('refuses replacing entire fleet identity (e.g. ATR → random C172)', () => {
    assert.throws(
      () =>
        assertCompanyPersistSafe({
          companyId: 'co_x',
          existing: {
            walletUsd: 5_000,
            fleetCount: 1,
            ledgerCount: 1,
            missionCount: 0,
            fleetIds: ['acf_microsoft_atr_72_600_1'],
          },
          incoming: {
            walletUsd: 12_500,
            fleetCount: 1,
            ledgerCount: 1,
            missionCount: 0,
            incomingFleetIds: ['acf_test_1'],
          },
        }),
      /replace entire fleet identity/,
    );
  });
});
