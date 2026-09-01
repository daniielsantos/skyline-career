import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { companySessionFromTick } from './career-company-session.js';

describe('companySessionFromTick', () => {
  it('uses persisted lastSeenTick when set', () => {
    const from = companySessionFromTick({ lastSeenTick: 100 }, 50, 120);
    assert.equal(from, 100);
  });

  it('falls back when lastSeenTick is absent', () => {
    const from = companySessionFromTick({}, 80, 120);
    assert.equal(from, 80);
  });

  it('returns 0 when toTick equals from', () => {
    const from = companySessionFromTick({ lastSeenTick: 200 }, 100, 200);
    assert.equal(from, 200);
  });
});
