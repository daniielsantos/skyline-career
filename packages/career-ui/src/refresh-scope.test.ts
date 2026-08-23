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
});
