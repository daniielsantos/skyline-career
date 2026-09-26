import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldKeepWorldWaitingOnUnfixedHealth } from './world-waiting-policy.js';

describe('shouldKeepWorldWaitingOnUnfixedHealth', () => {
  it('keeps waiting for desktop MP even without sawWorldFixed', () => {
    assert.equal(
      shouldKeepWorldWaitingOnUnfixedHealth({
        playMode: 'mp',
        sawWorldFixed: false,
      }),
      true,
    );
  });

  it('keeps waiting after a fixed-world session even if playMode unknown', () => {
    assert.equal(
      shouldKeepWorldWaitingOnUnfixedHealth({
        playMode: null,
        sawWorldFixed: true,
      }),
      true,
    );
  });

  it('allows ProfileGate for explicit SP', () => {
    assert.equal(
      shouldKeepWorldWaitingOnUnfixedHealth({
        playMode: 'sp',
        sawWorldFixed: false,
      }),
      false,
    );
  });

  it('allows ProfileGate when never MP and never saw fixed', () => {
    assert.equal(
      shouldKeepWorldWaitingOnUnfixedHealth({
        playMode: null,
        sawWorldFixed: false,
      }),
      false,
    );
  });

  it('explicit SP leaves waiting even if this process once saw fixed', () => {
    assert.equal(
      shouldKeepWorldWaitingOnUnfixedHealth({
        playMode: 'sp',
        sawWorldFixed: true,
      }),
      false,
    );
  });
});
