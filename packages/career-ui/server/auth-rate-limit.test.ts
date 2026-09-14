import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumeAuthRateLimit,
  isAuthSessionsListAllEnabled,
  resetAuthRateLimitForTests,
} from './auth-rate-limit.ts';

describe('auth rate limit', () => {
  it('allows up to max then blocks until window slides', () => {
    resetAuthRateLimitForTests();
    const t0 = 1_700_000_000_000;
    const windowMs = 60_000;
    const max = 3;
    for (let i = 0; i < max; i++) {
      const r = consumeAuthRateLimit('10.0.0.1', {
        nowMs: t0 + i * 1000,
        windowMs,
        max,
      });
      assert.equal(r.ok, true);
    }
    const blocked = consumeAuthRateLimit('10.0.0.1', {
      nowMs: t0 + 4_000,
      windowMs,
      max,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);

    const later = consumeAuthRateLimit('10.0.0.1', {
      nowMs: t0 + windowMs + 2_000,
      windowMs,
      max,
    });
    assert.equal(later.ok, true);
  });

  it('keys are independent', () => {
    resetAuthRateLimitForTests();
    const t0 = 1_700_000_000_000;
    assert.equal(
      consumeAuthRateLimit('a', { nowMs: t0, max: 1, windowMs: 60_000 }).ok,
      true,
    );
    assert.equal(
      consumeAuthRateLimit('a', { nowMs: t0 + 1, max: 1, windowMs: 60_000 }).ok,
      false,
    );
    assert.equal(
      consumeAuthRateLimit('b', { nowMs: t0 + 1, max: 1, windowMs: 60_000 }).ok,
      true,
    );
  });

  it('isAuthSessionsListAllEnabled reads env', () => {
    assert.equal(isAuthSessionsListAllEnabled({}), false);
    assert.equal(
      isAuthSessionsListAllEnabled({ CAREER_AUTH_SESSIONS_LIST_ALL: '1' }),
      true,
    );
    assert.equal(
      isAuthSessionsListAllEnabled({ CAREER_AUTH_SESSIONS_LIST_ALL: 'off' }),
      false,
    );
  });
});
