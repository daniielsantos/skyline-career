import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatPayloadDueLine,
  inferMissingOuterTanks,
  matchFuelOk,
  pickFuelTankBreakdown,
  stabilizeDisplayedFuel,
} from './load-verification.js';

/** King Air 350i classic caps (190 gal mains, 79.5 gal aux, Jet-A 6.7 lb/gal). */
const KING_AIR_CAPS = {
  left: 1273,
  right: 1273,
  center: 0,
  leftAux: 533,
  rightAux: 533,
};

describe('stabilizeDisplayedFuel', () => {
  it('shows a real drain instead of latching onto Due', () => {
    // Sticky matched Due on the previous poll; draining fuel in MSFS must reach
    // the card instead of being replaced by the sticky forever.
    const out = stabilizeDisplayedFuel({
      liveLb: 1000,
      plannedLb: 1858,
      tanks: { left: 500, right: 500, center: 0 },
      tankCapacity: KING_AIR_CAPS,
      stickyLiveLb: 1858,
      stickyTanks: { left: 929, right: 929, center: 0 },
    });
    assert.equal(out.liveLb, 1000);
    assert.equal(matchFuelOk(out.liveLb, 1858, 50), false);
  });

  it('still absorbs a flicker-sized dip', () => {
    const out = stabilizeDisplayedFuel({
      liveLb: 1800,
      plannedLb: 1858,
      tanks: { left: 900, right: 900, center: 0 },
      tankCapacity: KING_AIR_CAPS,
      stickyLiveLb: 1858,
      stickyTanks: { left: 929, right: 929, center: 0 },
    });
    assert.equal(out.liveLb, 1858);
  });

  it('drops drained tips instead of holding residue', () => {
    const out = stabilizeDisplayedFuel({
      liveLb: 1950,
      plannedLb: 1858,
      tanks: { left: 975, right: 975, center: 0 },
      tankCapacity: KING_AIR_CAPS,
      stickyLiveLb: 1970,
      stickyTanks: {
        left: 933,
        right: 933,
        center: 0,
        leftAux: 52,
        rightAux: 52,
      },
    });
    assert.equal(out.tanks?.leftAux, 0);
    assert.equal(out.tanks?.rightAux, 0);
    assert.equal(out.liveLb, 1950);
  });
});

describe('inferMissingOuterTanks', () => {
  it('never invents fuel for outers the sim reported as empty', () => {
    // Mains full, Due above them: the old rule split the deficit into the tips
    // and painted Sim = Due, passing Preflight on fuel that is not in the wing.
    const tanks = inferMissingOuterTanks({
      tanks: { left: 1273, right: 1273, center: 0, leftAux: 0, rightAux: 0 },
      tankCapacity: KING_AIR_CAPS,
      liveLb: 2546,
      plannedLb: 2900,
    });
    assert.equal(tanks?.leftAux, 0);
    assert.equal(tanks?.rightAux, 0);
  });

  it('still fills the gap when outers were never read', () => {
    const tanks = inferMissingOuterTanks({
      tanks: { left: 1273, right: 1273, center: 0 },
      tankCapacity: KING_AIR_CAPS,
      liveLb: 2546,
      plannedLb: 2900,
    });
    assert.equal(tanks?.leftAux, 177);
    assert.equal(tanks?.rightAux, 177);
  });
});

describe('matchFuelOk', () => {
  it('keeps the unusable slack proportional to the block', () => {
    // C172 with full tanks against a 200 lb OFP block must not pass on the
    // King Air-sized 200 lb allowance.
    assert.equal(matchFuelOk(340, 200, 50), false);
    // King Air tip floors (~112 lb over a 1858 lb block) still pass.
    assert.equal(matchFuelOk(1970, 1858, 50), true);
  });

  it('still allows taxi burn undershoot', () => {
    assert.equal(matchFuelOk(1700, 1858, 50), true);
  });
});

describe('pickFuelTankBreakdown', () => {
  it('holds tips when the total still covers them', () => {
    const prev = {
      left: 1254,
      right: 1254,
      center: 0,
      leftAux: 527,
      rightAux: 527,
    };
    assert.deepEqual(
      pickFuelTankBreakdown({ left: 1254, right: 1254, center: 0 }, prev, 3562),
      prev,
    );
  });
});

describe('formatPayloadDueLine', () => {
  const fmt = (lb: number | undefined) =>
    lb === undefined ? '—' : `${Math.round(lb)} lb`;

  it('shows cargo + crew when both are present', () => {
    assert.equal(
      formatPayloadDueLine(
        { plannedLb: 2840, cargoLb: 2500, crewLb: 340 },
        fmt,
      ),
      'Due 2840 lb · 2500 lb cargo + 340 lb crew',
    );
  });

  it('falls back to total-only when breakdown is missing', () => {
    assert.equal(
      formatPayloadDueLine({ plannedLb: 2840 }, fmt),
      'Due 2840 lb',
    );
  });
});
