import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCargoCommodityLabel } from './CargoLotCards.tsx';

describe('formatCargoCommodityLabel', () => {
  it('title-cases commodity ids', () => {
    assert.equal(formatCargoCommodityLabel('electronics'), 'Electronics');
    assert.equal(formatCargoCommodityLabel('fresh_produce'), 'Fresh Produce');
  });
});
