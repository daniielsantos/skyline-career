import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authInviteCodeMatches,
  authInviteCodeRequired,
  isAuthAccessKeysRequired,
  isAuthClaimCompanyAllowed,
  isAuthInviteFieldRequired,
  isAuthRegisterEnabled,
  resolveRegisterAccessGate,
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

  it('access keys gate + staff invite bypass', () => {
    assert.equal(isAuthAccessKeysRequired({}), false);
    assert.equal(
      isAuthAccessKeysRequired({ CAREER_AUTH_ACCESS_KEYS: '1' }),
      true,
    );
    assert.equal(
      isAuthInviteFieldRequired({ CAREER_AUTH_ACCESS_KEYS: '1' }),
      true,
    );

    const needKey = resolveRegisterAccessGate('', {
      CAREER_AUTH_ACCESS_KEYS: '1',
    });
    assert.equal(needKey.ok, false);
    if (!needKey.ok) assert.equal(needKey.code, 'access_key_required');

    const withKey = resolveRegisterAccessGate('AAAA-BBBB-CCCC-DDDD', {
      CAREER_AUTH_ACCESS_KEYS: '1',
    });
    assert.equal(withKey.ok, true);
    if (withKey.ok) {
      assert.equal(withKey.accessKeyCode, 'AAAA-BBBB-CCCC-DDDD');
    }

    const staff = resolveRegisterAccessGate('staff-secret', {
      CAREER_AUTH_ACCESS_KEYS: '1',
      CAREER_AUTH_INVITE: 'staff-secret',
    });
    assert.equal(staff.ok, true);
    if (staff.ok) assert.equal(staff.accessKeyCode, undefined);
  });
});
