import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hubSelectionPersistence } from './hub-selection-persistence.ts';

describe('hubSelectionPersistence', () => {
  it('persists only the company in Postgres multiplayer', () => {
    assert.deepEqual(hubSelectionPersistence('postgres'), {
      persist: 'company',
      syncWorldHomeCountry: false,
    });
  });

  it('preserves full single-player save semantics', () => {
    for (const kind of ['sqlite', 'json'] as const) {
      assert.deepEqual(hubSelectionPersistence(kind), {
        persist: 'blob',
        syncWorldHomeCountry: true,
      });
    }
  });
});
