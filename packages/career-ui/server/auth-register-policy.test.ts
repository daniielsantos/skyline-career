import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authInviteCodeMatches,
  authInviteCodeRequired,
  isAuthClaimCompanyAllowed,
  isAuthRegisterEnabled,
} from './auth-register-policy.ts';

describe('auth register policy', () => {
  it('register enabled by default; off with CAREER_AUTH_REGISTER=0', () => {
    assert.equal(isAuthRegisterEnabled({}), true);
    assert.equal(isAuthRegisterEnabled({ CAREER_AUTH_REGISTER: '0' }), false);
    assert.equal(isAuthRegisterEnabled({ CAREER_AUTH_REGISTER: '1' }), true);
  });

  it('invite optional unless CAREER_AUTH_INVITE set', () => {
    assert.equal(authInviteCodeRequired({}), null);
    assert.equal(authInviteCodeRequired({ CAREER_AUTH_INVITE: ' lab ' }), 'lab');
    assert.equal(authInviteCodeMatches(undefined, {}), true);
    assert.equal(
      authInviteCodeMatches('lab', { CAREER_AUTH_INVITE: 'lab' }),
      true,
    );
    assert.equal(
      authInviteCodeMatches('wrong', { CAREER_AUTH_INVITE: 'lab' }),
      false,
    );
  });

  it('claim company off unless CAREER_AUTH_ALLOW_CLAIM=1', () => {
    assert.equal(isAuthClaimCompanyAllowed({}), false);
    assert.equal(
      isAuthClaimCompanyAllowed({ CAREER_AUTH_ALLOW_CLAIM: '1' }),
      true,
    );
  });
});
