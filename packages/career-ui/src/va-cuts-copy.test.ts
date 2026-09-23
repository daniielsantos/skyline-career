import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatVaCutsPair } from './va-cuts-copy';

describe('va-cuts-copy', () => {
  it('formats market hire / airline desk pair', () => {
    assert.equal(formatVaCutsPair(50, 50), 'Mkt 50% · Desk 50%');
    assert.equal(formatVaCutsPair(30, 55), 'Mkt 30% · Desk 55%');
    assert.equal(formatVaCutsPair(null, 50), 'Desk 50%');
    assert.equal(formatVaCutsPair(40, undefined), 'Mkt 40%');
    assert.equal(formatVaCutsPair(null, null), '—');
  });
});
