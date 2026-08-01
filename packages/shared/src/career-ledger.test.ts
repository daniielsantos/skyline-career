import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyWalletDelta,
  ledgerEntriesInWindow,
  normalizeCareerLedger,
  summarizeCareerLedger,
  summarizeLedgerEntries,
} from './career-ledger.js';
import { emptyMissionsStateV2 } from './career-fleet.js';

describe('career ledger', () => {
  it('records signed wallet deltas and summarizes income vs expense', () => {
    const state = emptyMissionsStateV2();
    state.walletUsd = 1_000;
    applyWalletDelta(state, {
      amountUsd: 500,
      kind: 'freight_payout',
      atTick: 24,
      note: 'SBGR→SBEG',
    });
    applyWalletDelta(state, {
      amountUsd: -120,
      kind: 'hangar_parking',
      atTick: 48,
    });
    applyWalletDelta(state, {
      amountUsd: -80,
      kind: 'fuel',
      atTick: 48,
    });

    assert.equal(state.walletUsd, 1_300);
    assert.equal(state.ledger?.length, 3);

    const snap = summarizeCareerLedger(state, 48);
    assert.equal(snap.month.incomeUsd, 500);
    assert.equal(snap.month.expenseUsd, 200);
    assert.equal(snap.month.netUsd, 300);
    assert.equal(snap.recent[0]?.kind, 'fuel');
  });

  it('windows by economy day for week/month', () => {
    const state = emptyMissionsStateV2();
    applyWalletDelta(state, { amountUsd: 100, kind: 'freight_payout', atTick: 0 });
    applyWalletDelta(state, { amountUsd: 200, kind: 'freight_payout', atTick: 24 * 10 });
    applyWalletDelta(state, { amountUsd: -50, kind: 'ferry', atTick: 24 * 12 });

    const week = summarizeLedgerEntries(
      ledgerEntriesInWindow(state.ledger ?? [], 24 * 12, 7),
    );
    assert.equal(week.incomeUsd, 200);
    assert.equal(week.expenseUsd, 50);
    assert.equal(week.netUsd, 150);

    const month = summarizeCareerLedger(state, 24 * 12).month;
    assert.equal(month.incomeUsd, 300);
    assert.equal(month.expenseUsd, 50);
  });

  it('normalizes corrupt ledger rows', () => {
    const cleaned = normalizeCareerLedger([
      { id: 'a', atTick: 10, amountUsd: 5, kind: 'fuel' },
      { amountUsd: 'nope', kind: 'fuel', atTick: 1 },
      { amountUsd: 0, kind: 'fuel', atTick: 2 },
      null,
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0]?.amountUsd, 5);
  });
});
