import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOARD_SMALL_MIN_PAY_CAP_USD,
  BOARD_SMALL_MIN_VIABLE_KG,
  FEEDER_LTL_MIN_KG,
  GA_LTL_MAX_KG,
  LARGE_LOT_MIN_KG,
  SMALL_LOT_MAX_KG,
  SMALL_LOT_MIN_KG,
  boardLotMinViablePayUsd,
  isGaBandBoardLotViable,
  sizeSmallLotKg,
} from './career-economy.js';

function rngSequence(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)]!;
    i += 1;
    return v;
  };
}

describe('sizeSmallLotKg', () => {
  it('no longer forces GA on every spoke OD', () => {
    // rng 0.99 → above spokeSpoke gaChance (0.32) → feeder LTL
    const kg = sizeSmallLotKg(2_000, 'spoke', 'spoke', rngSequence([0.99]), 200);
    assert.ok(kg >= FEEDER_LTL_MIN_KG, `expected feeder LTL, got ${kg}`);
    assert.ok(kg <= SMALL_LOT_MAX_KG);
  });

  it('still forms GA when rng asks for it on spoke OD', () => {
    const kg = sizeSmallLotKg(2_000, 'spoke', 'spoke', rngSequence([0.01]), 200);
    assert.ok(
      kg >= BOARD_SMALL_MIN_VIABLE_KG && kg <= GA_LTL_MAX_KG,
      `got ${kg}`,
    );
  });

  it('keeps major↔major mostly in feeder LTL', () => {
    const kg = sizeSmallLotKg(2_000, 'major', 'major', rngSequence([0.5]), 300);
    assert.ok(kg >= FEEDER_LTL_MIN_KG, `got ${kg}`);
  });

  it('skips GA rolls on international ODs', () => {
    const kg = sizeSmallLotKg(
      2_000,
      'major',
      'major',
      rngSequence([0.01, 0.5]),
      200,
      { international: true },
    );
    assert.ok(kg >= FEEDER_LTL_MIN_KG, `expected feeder on intl, got ${kg}`);
  });
});

describe('LARGE_LOT_MIN_KG', () => {
  it('closes the former 2–4 t dead zone under small max', () => {
    assert.ok(LARGE_LOT_MIN_KG > SMALL_LOT_MAX_KG);
    assert.ok(LARGE_LOT_MIN_KG < 4_000);
  });
});

describe('hold-to-viable GA board lots', () => {
  it('raises pay floor with distance and caps it', () => {
    const near = boardLotMinViablePayUsd(50);
    const mid = boardLotMinViablePayUsd(100);
    const far = boardLotMinViablePayUsd(800);
    assert.ok(mid > near);
    assert.equal(far, BOARD_SMALL_MIN_PAY_CAP_USD);
    assert.ok(near >= 140);
  });

  it('uses a higher floor for international trips', () => {
    const domestic = boardLotMinViablePayUsd(150);
    const intl = boardLotMinViablePayUsd(150, { international: true });
    assert.ok(intl > domestic);
  });

  it('rejects scrap kg and scrap pay in the GA band', () => {
    assert.equal(
      isGaBandBoardLotViable({
        quantityKg: SMALL_LOT_MIN_KG,
        payUsd: 500,
        distanceNm: 70,
      }),
      false,
    );
    assert.equal(
      isGaBandBoardLotViable({
        quantityKg: BOARD_SMALL_MIN_VIABLE_KG,
        payUsd: 40,
        distanceNm: 70,
      }),
      false,
    );
    assert.equal(
      isGaBandBoardLotViable({
        quantityKg: BOARD_SMALL_MIN_VIABLE_KG,
        payUsd: boardLotMinViablePayUsd(70),
        distanceNm: 70,
      }),
      true,
    );
  });

  it('never treats international GA-band as viable', () => {
    assert.equal(
      isGaBandBoardLotViable({
        quantityKg: 300,
        payUsd: 5_000,
        distanceNm: 200,
        international: true,
      }),
      false,
    );
  });

  it('does not gate feeder LTL by the GA kg floor', () => {
    assert.equal(
      isGaBandBoardLotViable({
        quantityKg: FEEDER_LTL_MIN_KG,
        payUsd: 1,
        distanceNm: 70,
      }),
      true,
    );
  });
});
