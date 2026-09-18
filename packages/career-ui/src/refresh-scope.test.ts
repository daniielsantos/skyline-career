import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liveRefreshScope } from './refresh-scope.ts';

describe('liveRefreshScope', () => {
  it('always loads missions so an in-flight Dispatch survives a Freights reload', () => {
    assert.equal(liveRefreshScope('market', false).missions, true);
    assert.equal(liveRefreshScope('hangar', false).missions, true);
    assert.equal(liveRefreshScope('ports', false).missions, true);
    assert.equal(liveRefreshScope('market', true).missions, true);
  });

  it('loads aircraft market specs on Hangar so cabin/charter lines resolve', () => {
    assert.equal(liveRefreshScope('hangar', false).aircraftMarket, true);
    assert.equal(liveRefreshScope('aircraft', false).aircraftMarket, true);
  });
});
