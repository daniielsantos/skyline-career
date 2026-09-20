import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyWalletDelta,
  enterLedgerActorAccountId,
  ledgerEntriesInWindow,
  normalizeCareerLedger,
  runWithLedgerActorAccountId,
  summarizeCareerLedger,
  summarizeLedgerEntries,
} from './career-ledger.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { TICKS_PER_DAY } from './career-clock.js';

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

  it('stamps actor from opts, ambient, then mission.pilotAccountId', () => {
    const state = emptyMissionsStateV2();
    state.missions.push({
      id: 'msn_pilot',
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      aircraftClassId: 'light_ga',
      cargoKg: 100,
      payUsd: 100,
      status: 'dispatched',
      lots: [],
      createdAtTick: 0,
      deadlineTick: 100,
      pilotAccountId: 'acc_mission',
    } as unknown as (typeof state.missions)[number]);

    applyWalletDelta(state, {
      amountUsd: -10,
      kind: 'fuel',
      atTick: 1,
      actorAccountId: 'acc_explicit',
    });
    assert.equal(state.ledger?.at(-1)?.actorAccountId, 'acc_explicit');

    runWithLedgerActorAccountId('acc_ambient', () => {
      applyWalletDelta(state, {
        amountUsd: -11,
        kind: 'fuel',
        atTick: 2,
      });
    });
    assert.equal(state.ledger?.at(-1)?.actorAccountId, 'acc_ambient');

    enterLedgerActorAccountId(undefined);
    applyWalletDelta(state, {
      amountUsd: -12,
      kind: 'fuel',
      atTick: 3,
      missionId: 'msn_pilot',
    });
    assert.equal(state.ledger?.at(-1)?.actorAccountId, 'acc_mission');

    applyWalletDelta(state, {
      amountUsd: -50,
      kind: 'hangar_parking',
      atTick: 4,
      actorAccountId: 'acc_should_ignore',
    });
    assert.equal(state.ledger?.at(-1)?.actorAccountId, undefined);
  });

  it('windows by economy day for week/month', () => {
    const state = emptyMissionsStateV2();
    applyWalletDelta(state, { amountUsd: 100, kind: 'freight_payout', atTick: 0 });
    applyWalletDelta(state, {
      amountUsd: 200,
      kind: 'freight_payout',
      atTick: TICKS_PER_DAY * 10,
    });
    applyWalletDelta(state, {
      amountUsd: -50,
      kind: 'ferry',
      atTick: TICKS_PER_DAY * 12,
    });

    const week = summarizeLedgerEntries(
      ledgerEntriesInWindow(state.ledger ?? [], TICKS_PER_DAY * 12, 7),
    );
    assert.equal(week.incomeUsd, 200);
    assert.equal(week.expenseUsd, 50);
    assert.equal(week.netUsd, 150);

    const month = summarizeCareerLedger(state, TICKS_PER_DAY * 12).month;
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

  it('recent order uses append seq, not lexicographic id (same tick)', () => {
    // Legacy ids: led_676_10_* sorts before led_676_4_* as strings — broke Recent activity.
    const cleaned = normalizeCareerLedger([
      {
        id: 'led_676_10_1',
        atTick: 676,
        dayIndex: 7,
        amountUsd: 100_000,
        kind: 'other',
        note: 'credit mid',
      },
      {
        id: 'led_676_14_2',
        atTick: 676,
        dayIndex: 7,
        amountUsd: -831_463,
        kind: 'aircraft_buy',
        note: 'ATR 72-600',
      },
      {
        id: 'led_676_4_3',
        atTick: 676,
        dayIndex: 7,
        amountUsd: 100_000,
        kind: 'other',
        note: 'credit early',
      },
    ]);
    assert.deepEqual(
      cleaned.map((e) => e.note),
      ['credit early', 'credit mid', 'ATR 72-600'],
    );
    const snap = summarizeCareerLedger({ ledger: cleaned }, 676);
    assert.equal(snap.recent[0]?.kind, 'aircraft_buy');
    assert.equal(snap.recent[0]?.note, 'ATR 72-600');
  });
});
