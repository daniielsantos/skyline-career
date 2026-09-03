import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FREIGHT_PAY_CAP_MULT,
  FREIGHT_TOTAL_CAP_MULT,
  dryFormationMinGapMult,
  destRoomKg,
  freightTonnagePayMult,
  LAST_MILE_MIN_PAY_GAP_MULT,
  quoteFreightLotPay,
} from './career-economy.js';
import type { StockPile } from './types/career-economy.js';

function pile(fill: number, capacityKg = 80_000): StockPile {
  return {
    capacityKg,
    stockKg: Math.round(capacityKg * fill),
  };
}

/** Extreme shortage: fat origin, empty dest → max local gap. */
const extremeGap = {
  originStock: pile(1),
  destStock: pile(0),
} as const;

describe('quoteFreightLotPay', () => {
  it('pays more for the same electronics load on a longer haul', () => {
    const short = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 18_000,
      ...extremeGap,
      distanceNm: 96,
      urgent: true,
    });
    const long = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 18_000,
      ...extremeGap,
      distanceNm: 1_042,
      urgent: true,
    });
    assert.ok(
      long.payUsd > short.payUsd,
      `long ${long.payUsd} should beat short ${short.payUsd}`,
    );
    assert.ok(long.haulUsdPerKg > short.haulUsdPerKg);
  });

  it('scales total pay with load at fixed distance below tonnage soft', () => {
    const half = quoteFreightLotPay({
      commodityId: 'general',
      quantityKg: 2_000,
      ...extremeGap,
      distanceNm: 250,
    });
    const full = quoteFreightLotPay({
      commodityId: 'general',
      quantityKg: 4_000,
      ...extremeGap,
      distanceNm: 250,
    });
    // Rounding to whole dollars can leave ±1 on doubled lots.
    assert.ok(Math.abs(full.payUsd - half.payUsd * 2) <= 1);
  });

  it('caps short Value electronics well below the old jackpot', () => {
    const q = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 26_000,
      ...extremeGap,
      distanceNm: 96,
      urgent: true,
      scarcePayMult: 1.2,
      weatherPayMult: 1.1,
    });
    assert.ok(
      q.payPerKg < 8,
      `electronics short $/kg ${q.payPerKg.toFixed(2)} should stay under $8`,
    );
    assert.ok(
      q.payUsd < 200_000,
      `electronics 26t / 96nm pay ${q.payUsd} should stay under $200k`,
    );
    assert.ok(q.arbUsdPerKg <= q.capUsdPerKg + 1e-9);
  });

  it('pays a short XL fat lot less than a long mid lot of the same commodity', () => {
    const shortXl = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 50_500,
      ...extremeGap,
      distanceNm: 182,
      urgent: true,
      sizePayMult: 0.88,
    });
    const longMid = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 28_000,
      ...extremeGap,
      distanceNm: 2_385,
      international: true,
      urgent: true,
      sizePayMult: 0.88,
    });
    assert.ok(
      longMid.payUsd > shortXl.payUsd,
      `long mid ${longMid.payUsd} should beat short XL ${shortXl.payUsd}`,
    );
    assert.ok(
      longMid.distanceCapMult > shortXl.distanceCapMult,
      'distance cap mult should rise with nm',
    );
  });

  it('same electronics load pays clearly more on a long haul than a short hop', () => {
    const short = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 28_000,
      ...extremeGap,
      distanceNm: 182,
      urgent: true,
    });
    const long = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 28_000,
      ...extremeGap,
      distanceNm: 2_385,
      international: true,
      urgent: true,
    });
    assert.ok(
      long.payUsd > short.payUsd * 1.35,
      `long ${long.payUsd} should clear short ${short.payUsd} by at least 35%`,
    );
  });

  it('caps long XL Value intl so one hop cannot buy a used Narrow', () => {
    const q = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 28_000,
      ...extremeGap,
      distanceNm: 2_385,
      international: true,
      urgent: true,
      sizePayMult: 0.88,
    });
    assert.ok(
      q.payUsd < 220_000,
      `XL intl electronics ${q.payUsd} should stay under $220k (was ~$415k)`,
    );
    assert.ok(
      q.payPerKg < 8,
      `$/kg ${q.payPerKg.toFixed(2)} should stay under total cap band`,
    );
    assert.ok(q.tonnageMult < 1);
  });

  it('applies tonnage soft-mult toward Wide loads', () => {
    assert.equal(freightTonnagePayMult(10_000), 1);
    assert.ok(freightTonnagePayMult(28_000) < 1);
    assert.equal(freightTonnagePayMult(90_000), 0.45);
    const narrowish = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 18_000,
      ...extremeGap,
      distanceNm: 1_200,
      international: true,
      urgent: true,
    });
    const wide = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 90_000,
      ...extremeGap,
      distanceNm: 1_200,
      international: true,
      urgent: true,
    });
    assert.ok(wide.payUsd > narrowish.payUsd);
    assert.ok(wide.payUsd < narrowish.payUsd * (90_000 / 18_000) * 0.6);
  });

  it('keeps Dry and Time above a playable floor on short hops', () => {
    for (const id of ['general', 'supplies', 'perishables'] as const) {
      const q = quoteFreightLotPay({
        commodityId: id,
        quantityKg: 1_200,
        ...extremeGap,
        distanceNm: 120,
        urgent: id === 'perishables',
      });
      assert.ok(
        q.payPerKg >= 1.2,
        `${id} $/kg ${q.payPerKg.toFixed(2)} too low`,
      );
      assert.ok(q.payUsd >= 1_400, `${id} pay ${q.payUsd} too low`);
    }
  });

  it('ranks Value total/arb caps tighter than Dry/Time', () => {
    assert.ok((FREIGHT_PAY_CAP_MULT.electronics ?? 0) < 0.5);
    assert.ok((FREIGHT_TOTAL_CAP_MULT.electronics ?? 0) < 0.5);
    assert.ok((FREIGHT_PAY_CAP_MULT.machinery ?? 0) < 0.5);
    assert.ok((FREIGHT_TOTAL_CAP_MULT.machinery ?? 0) < 0.5);
    assert.ok((FREIGHT_PAY_CAP_MULT.general ?? 0) > 1);
    assert.ok(
      (FREIGHT_PAY_CAP_MULT.electronics ?? 0) <
        (FREIGHT_PAY_CAP_MULT.machinery ?? 0),
    );
  });

  it('pays machinery long thin clearly above mid-haul XL fat', () => {
    const longThin = quoteFreightLotPay({
      commodityId: 'machinery',
      quantityKg: 24_585,
      ...extremeGap,
      distanceNm: 3_323,
      urgent: true,
    });
    const midXl = quoteFreightLotPay({
      commodityId: 'machinery',
      quantityKg: 45_994,
      ...extremeGap,
      distanceNm: 1_071,
      sizePayMult: 0.88,
    });
    assert.ok(
      longThin.payUsd > midXl.payUsd * 1.35,
      `long thin ${longThin.payUsd} should clear mid XL ${midXl.payUsd} by ≥35%`,
    );
    assert.ok(longThin.distanceCapMult > midXl.distanceCapMult);
    assert.ok(midXl.tonnageMult < longThin.tonnageMult);
  });

  it('applies a steeper machinery tonnage soft than the default curve', () => {
    assert.ok(
      freightTonnagePayMult(46_000, 'machinery') <
        freightTonnagePayMult(46_000),
    );
    assert.equal(freightTonnagePayMult(70_000, 'machinery'), 0.32);
  });

  it('intl total soft-caps above domestic but not at the old 2.1x base', () => {
    const domestic = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 18_000,
      ...extremeGap,
      distanceNm: 800,
      international: false,
      urgent: true,
    });
    const intl = quoteFreightLotPay({
      commodityId: 'electronics',
      quantityKg: 18_000,
      ...extremeGap,
      distanceNm: 800,
      international: true,
      urgent: true,
    });
    assert.ok(intl.totalCapUsdPerKg > domestic.totalCapUsdPerKg);
    assert.ok(intl.totalCapUsdPerKg < 18 * 0.55 * 1.1);
  });

  it('lets URGENT, INTL, and stock gap still move machinery pay on one OD', () => {
    const base = {
      commodityId: 'machinery' as const,
      quantityKg: 24_585,
      distanceNm: 3_323,
    };
    const quietMild = quoteFreightLotPay({
      ...base,
      originStock: pile(0.7),
      destStock: pile(0.4),
    });
    const urgentMild = quoteFreightLotPay({
      ...base,
      originStock: pile(0.7),
      destStock: pile(0.4),
      urgent: true,
    });
    const extreme = quoteFreightLotPay({
      ...base,
      ...extremeGap,
    });
    const extremeUrgent = quoteFreightLotPay({
      ...base,
      ...extremeGap,
      urgent: true,
    });
    const extremeIntlUrgent = quoteFreightLotPay({
      ...base,
      ...extremeGap,
      urgent: true,
      international: true,
    });
    assert.ok(
      urgentMild.payUsd > quietMild.payUsd,
      `URGENT should lift mild lots (${urgentMild.payUsd} vs ${quietMild.payUsd})`,
    );
    assert.ok(
      extreme.payUsd > quietMild.payUsd,
      `deeper stock gap should pay more (${extreme.payUsd} vs ${quietMild.payUsd})`,
    );
    assert.ok(
      extremeUrgent.payUsd > extreme.payUsd,
      `URGENT should lift the total ceiling (${extremeUrgent.payUsd} vs ${extreme.payUsd})`,
    );
    assert.ok(
      extremeIntlUrgent.payUsd > extremeUrgent.payUsd,
      `INTL should lift pay further (${extremeIntlUrgent.payUsd} vs ${extremeUrgent.payUsd})`,
    );
  });

  it('keeps haul from eating the whole total cap so arb can vary', () => {
    const q = quoteFreightLotPay({
      commodityId: 'machinery',
      quantityKg: 24_585,
      ...extremeGap,
      distanceNm: 3_323,
      urgent: true,
    });
    assert.ok(
      q.haulUsdPerKg <= q.totalCapUsdPerKg * 0.5 + 1e-9,
      `haul ${q.haulUsdPerKg} should leave arb headroom under ${q.totalCapUsdPerKg}`,
    );
  });

  it('requires wider dry gap into filling destinations', () => {
    assert.equal(dryFormationMinGapMult('general', 0.5, 0.22), 0.22);
    assert.ok(dryFormationMinGapMult('general', 0.85, 0.22) > 0.3);
    assert.equal(dryFormationMinGapMult('electronics', 0.9, 0.22), 0.22);
  });

  it('shrinks dry bulk dest room below default soft fill', () => {
    const stock = pile(0.55);
    assert.ok(destRoomKg(stock, 'general') < destRoomKg(stock, 'electronics'));
  });

  it('last-mile minPayGapMult lifts pay on flat dry spreads', () => {
    const stock = pile(0.5);
    const base = {
      commodityId: 'general' as const,
      quantityKg: 400,
      originStock: stock,
      destStock: stock,
      distanceNm: 200,
    };
    const low = quoteFreightLotPay({ ...base, minPayGapMult: 0.2 });
    const lastMile = quoteFreightLotPay({
      ...base,
      minPayGapMult: LAST_MILE_MIN_PAY_GAP_MULT,
    });
    assert.ok(
      lastMile.payUsd > low.payUsd,
      `last-mile gap floor should pay more (${lastMile.payUsd} vs ${low.payUsd})`,
    );
  });
});
