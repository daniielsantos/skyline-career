import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONTRACT_PILOT_FEE_FRAC,
  CONTRACT_PILOT_FEE_MIN_USD,
  CONTRACT_PILOT_FEE_USD_PER_NM,
  quoteContractPilotFeeUsd,
} from './career-contract-pilot-fee.js';

describe('quoteContractPilotFeeUsd', () => {
  it('takes 30% of freight pay with a $50 floor', () => {
    assert.equal(quoteContractPilotFeeUsd(1_000), 300);
    assert.equal(quoteContractPilotFeeUsd(100), CONTRACT_PILOT_FEE_MIN_USD);
    assert.equal(CONTRACT_PILOT_FEE_FRAC, 0.3);
  });

  it('floors Light TP / Light GA fees by distance on long thin freights', () => {
    // Long thin Dry (e.g. VTBS→WMKK style) — 30% alone undercuts nm floors.
    const thinPay = 2_267;
    const nm = 659;
    const fromPay = Math.round(thinPay * CONTRACT_PILOT_FEE_FRAC);
    const tpFloor = Math.round(nm * (CONTRACT_PILOT_FEE_USD_PER_NM.light_turboprop ?? 0));
    const gaFloor = Math.round(nm * (CONTRACT_PILOT_FEE_USD_PER_NM.light_ga ?? 0));
    assert.ok(tpFloor > fromPay, 'fixture expects TP nm floor to beat 30%');
    assert.ok(gaFloor > fromPay, 'fixture expects GA nm floor to beat 30%');
    assert.equal(
      quoteContractPilotFeeUsd(thinPay, {
        distanceNm: nm,
        aircraftClassId: 'light_turboprop',
      }),
      tpFloor,
    );
    assert.equal(
      quoteContractPilotFeeUsd(thinPay, {
        distanceNm: nm,
        aircraftClassId: 'light_ga',
      }),
      gaFloor,
    );
  });

  it('does not nm-floor narrow/wide (frac only)', () => {
    const thinPay = 3_180;
    const nm = 667;
    assert.equal(
      quoteContractPilotFeeUsd(thinPay, {
        distanceNm: nm,
        aircraftClassId: 'narrow_freighter',
      }),
      Math.round(thinPay * CONTRACT_PILOT_FEE_FRAC),
    );
  });

  it('keeps dense short-haul frac when it beats the nm floor', () => {
    const richPay = 3_600;
    const nm = 286;
    const fromPay = Math.round(richPay * CONTRACT_PILOT_FEE_FRAC);
    const tpFloor = Math.round(nm * (CONTRACT_PILOT_FEE_USD_PER_NM.light_turboprop ?? 0));
    assert.ok(fromPay > tpFloor);
    assert.equal(
      quoteContractPilotFeeUsd(richPay, {
        distanceNm: nm,
        aircraftClassId: 'light_turboprop',
      }),
      fromPay,
    );
  });
});
