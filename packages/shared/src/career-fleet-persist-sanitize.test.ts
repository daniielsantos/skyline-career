import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeFleetForPersist } from './career-fleet-persist-sanitize.js';
import type { PlayerAircraft } from './types/career-economy.js';

function stub(id: string, label = id): PlayerAircraft {
  return {
    id,
    label,
    aircraftClassId: 'light_ga',
    locationIcao: 'SBGR',
    fuelKg: 10,
    fuelCapacityKg: 100,
    status: 'parked',
    ownership: 'owned',
  };
}

describe('sanitizeFleetForPersist', () => {
  it('dedupes by id keeping the last row', () => {
    const result = sanitizeFleetForPersist([
      stub('acf_1', 'first'),
      stub('acf_1', 'second'),
      stub('acf_2'),
    ]);
    assert.deepEqual(
      result.kept.map((a) => ({ id: a.id, label: a.label })),
      [
        { id: 'acf_1', label: 'second' },
        { id: 'acf_2', label: 'acf_2' },
      ],
    );
    assert.deepEqual(result.droppedDuplicateIds, ['acf_1']);
    assert.equal(result.droppedForeign.length, 0);
  });

  it('skips hulls owned by another company', () => {
    const result = sanitizeFleetForPersist(
      [stub('acf_home'), stub('acf_va')],
      new Map([['acf_va', 'co_other']]),
    );
    assert.deepEqual(
      result.kept.map((a) => a.id),
      ['acf_home'],
    );
    assert.deepEqual(result.droppedForeign, [
      { id: 'acf_va', ownerCompanyId: 'co_other' },
    ]);
  });
});
