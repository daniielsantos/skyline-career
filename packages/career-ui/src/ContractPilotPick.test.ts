import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flyableContractPilotAirframes,
  preferredContractPilotAirframe,
} from './ContractPilotPick.js';
import type { ContractPilotPickAirframe } from './api.js';

function frame(
  partial: Partial<ContractPilotPickAirframe> & Pick<ContractPilotPickAirframe, 'typeId'>,
): ContractPilotPickAirframe {
  return {
    label: partial.typeId,
    aircraftClassId: 'light_turboprop',
    maxCargoKg: 1500,
    operationalMaxCargoKg: 1500,
    liftKg: 0,
    remainderKg: 0,
    coversOffer: false,
    routeLimited: false,
    pilotFeeUsd: 0,
    ...partial,
  };
}

describe('contract-pilot pick helpers', () => {
  it('keeps cargo airframes with lift and repo airframes with a fee', () => {
    const rows = [
      frame({ typeId: 'otter', liftKg: 1300, remainderKg: 0, coversOffer: true, pilotFeeUsd: 400 }),
      frame({ typeId: 'empty-lift', liftKg: 0, remainderKg: 1300, pilotFeeUsd: 0 }),
      frame({ typeId: 'ferry', liftKg: 0, remainderKg: 0, coversOffer: true, pilotFeeUsd: 250 }),
    ];
    assert.deepEqual(
      flyableContractPilotAirframes(rows, false).map((a) => a.typeId),
      ['otter'],
    );
    assert.deepEqual(
      flyableContractPilotAirframes(rows, true).map((a) => a.typeId),
      ['otter', 'ferry'],
    );
  });

  it('prefers a full-offer airframe over a larger leftover lift', () => {
    const flyable = [
      frame({ typeId: 'partial', liftKg: 2000, remainderKg: 100, coversOffer: false, pilotFeeUsd: 500 }),
      frame({ typeId: 'full', liftKg: 1300, remainderKg: 0, coversOffer: true, pilotFeeUsd: 400 }),
    ];
    assert.equal(preferredContractPilotAirframe(flyable)?.typeId, 'full');
  });
});
