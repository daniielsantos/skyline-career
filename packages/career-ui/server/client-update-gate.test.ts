import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_UPDATE_REQUIRED,
  clientUpdateGateRejection,
  DEFAULT_CLIENT_UPDATE_POLICY,
  parseClientUpdatePolicy,
} from '@msfs-compat/shared';

/**
 * Mirrors world-api accept-path gating (staging/commit, /api/accept,
 * /api/charters/accept). Full HTTP harness is heavy; this locks the 426 contract.
 */
describe('client update accept gate', () => {
  it('health default policy is force off', () => {
    const policy = parseClientUpdatePolicy(undefined);
    assert.deepEqual(policy, DEFAULT_CLIENT_UPDATE_POLICY);
    assert.equal(
      clientUpdateGateRejection(policy, '0.0.1'),
      null,
    );
  });

  it('returns 426 when force on and client below min', () => {
    const rejection = clientUpdateGateRejection(
      { forceUpdate: true, minClientVersion: '0.3.105' },
      '0.3.100',
    );
    assert.ok(rejection);
    assert.equal(rejection!.status, 426);
    assert.equal(rejection!.body.error, CLIENT_UPDATE_REQUIRED);
    assert.equal(rejection!.body.minClientVersion, '0.3.105');
  });

  it('allows when version ≥ min or force off', () => {
    assert.equal(
      clientUpdateGateRejection(
        { forceUpdate: true, minClientVersion: '0.3.105' },
        '0.3.105',
      ),
      null,
    );
    assert.equal(
      clientUpdateGateRejection(
        { forceUpdate: false, minClientVersion: '9.9.9' },
        '0.1.0',
      ),
      null,
    );
  });
});
