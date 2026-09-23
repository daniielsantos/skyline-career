import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatVaCutsPair } from './va-cuts-copy';

describe('va-cuts-copy', () => {
  it('shows one % when equal and a low–high range when they differ', () => {
    assert.equal(formatVaCutsPair(50, 50), '50%');
    assert.equal(formatVaCutsPair(30, 55), '30%–55%');
    assert.equal(formatVaCutsPair(55, 30), '30%–55%');
    assert.equal(formatVaCutsPair(null, 50), '50%');
    assert.equal(formatVaCutsPair(40, undefined), '40%');
    assert.equal(formatVaCutsPair(null, null), '—');
  });
});
