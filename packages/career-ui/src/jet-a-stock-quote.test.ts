import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { quoteJetAStockCashUsd } from './jet-a-stock-quote.ts';

describe('quoteJetAStockCashUsd', () => {
  it('prices a fresh load at the origin spot', () => {
    const quote = quoteJetAStockCashUsd({
      bookedKg: 0,
      nextKg: 18_000,
      fromTankKg: 0,
      boughtKg: 0,
      boughtUsd: 0,
      originTankKg: 0,
      unitUsdPerKg: 0.463,
    });
    assert.equal(quote.totalUsd, Math.round(18_000 * 0.463));
    assert.equal(quote.deltaUsd, quote.totalUsd);
  });

  it('skips kilograms already sitting in the company tank', () => {
    const quote = quoteJetAStockCashUsd({
      bookedKg: 0,
      nextKg: 2_000,
      fromTankKg: 0,
      boughtKg: 0,
      boughtUsd: 0,
      originTankKg: 1_000,
      unitUsdPerKg: 0.5,
    });
    assert.equal(quote.totalUsd, 500);
  });

  it('refunds a cut in proportion to what was bought', () => {
    const quote = quoteJetAStockCashUsd({
      bookedKg: 10_000,
      nextKg: 6_000,
      fromTankKg: 0,
      boughtKg: 10_000,
      boughtUsd: 5_000,
      originTankKg: 0,
      unitUsdPerKg: 0.5,
    });
    assert.equal(quote.totalUsd, 3_000);
    assert.equal(quote.deltaUsd, -2_000);
  });
});
