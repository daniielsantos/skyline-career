import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBushLightGa,
  assertFerryNotBush,
  bushLotPayMult,
  bushRequiresLightGa,
  isBushFreightOdAllowed,
  isBushGateway,
  isBushHub,
  isBushTripOnlyHub,
  isOfflineNetworkHub,
  listBushIcaos,
  listBushTripOnlyIcaos,
} from './career-bush.js';

describe('career-bush stubs (feature removed)', () => {
  it('returns empty catalogs and false hub checks', () => {
    assert.deepEqual(listBushIcaos(), []);
    assert.deepEqual(listBushTripOnlyIcaos(), []);
    assert.equal(isBushHub('SNYA'), false);
    assert.equal(isBushTripOnlyHub('O67'), false);
    assert.equal(isBushGateway('SBEG'), false);
    assert.equal(isOfflineNetworkHub('SNYA'), false);
  });

  it('allows all freight ODs and is a no-op for light-GA / ferry asserts', () => {
    assert.equal(isBushFreightOdAllowed('SNYA', 'SBEG'), true);
    assert.equal(bushRequiresLightGa('SNYA', 'SBEG'), false);
    assert.equal(bushLotPayMult('SNYA', 'SBEG', 'electronics'), 1);
    assert.doesNotThrow(() =>
      assertBushLightGa('SNYA', 'SBEG', 'narrow_freighter'),
    );
    assert.doesNotThrow(() => assertFerryNotBush('SBEG', 'SNYA'));
  });
});
