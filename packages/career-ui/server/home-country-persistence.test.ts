import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homeCountryPersistence } from './home-country-persistence.ts';

describe('homeCountryPersistence', () => {
  it('keeps Postgres world reads global-state free', () => {
    assert.deepEqual(homeCountryPersistence('postgres', false), {
      persistHubSelection: 'company',
      syncWorldHomeCountry: false,
    });
  });

  it('treats fixed-world SQLite as multiplayer', () => {
    assert.deepEqual(homeCountryPersistence('sqlite', true), {
      persistHubSelection: 'company',
      syncWorldHomeCountry: false,
    });
  });

  it('preserves full single-player save semantics', () => {
    for (const kind of ['sqlite', 'json'] as const) {
      assert.deepEqual(homeCountryPersistence(kind, false), {
        persistHubSelection: 'blob',
        syncWorldHomeCountry: true,
      });
    }
  });
});
