import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeLotsByCountryOrder,
  splitCountryJobs,
} from './career-form-lots-jobs.js';
import type { ShipmentLot } from './types/career-economy.js';

function lot(id: string): ShipmentLot {
  return {
    id,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 100,
    reservedKg: 0,
    createdAtTick: 1,
    expiresAtTick: 10,
    payUsd: 1,
    urgency: 'normal',
    reason: 'test',
    status: 'available',
  };
}

describe('formLots country jobs', () => {
  it('round-robins countries and merges lots in sorted country order', () => {
    const ids = ['AR', 'BR', 'US'];
    const buckets = splitCountryJobs(ids, 2);
    assert.deepEqual(buckets, [
      ['AR', 'US'],
      ['BR'],
    ]);
    const byCountry = new Map([
      ['US', [lot('u1')]],
      ['AR', [lot('a1'), lot('a2')]],
      ['BR', [lot('b1')]],
    ]);
    assert.deepEqual(
      mergeLotsByCountryOrder(ids, byCountry).map((row) => row.id),
      ['a1', 'a2', 'b1', 'u1'],
    );
  });
});
