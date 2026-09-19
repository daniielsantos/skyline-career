import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIENT_UPDATE_REQUIRED,
  clientUpdateGateRejection,
  compareSemverCore,
  DEFAULT_CLIENT_UPDATE_POLICY,
  isClientUpdateRequired,
  parseClientUpdatePolicy,
  parseSemverCore,
} from './career-client-update-policy.js';

describe('client update policy', () => {
  it('parses missing/invalid misc as force off', () => {
    assert.deepEqual(parseClientUpdatePolicy(undefined), DEFAULT_CLIENT_UPDATE_POLICY);
    assert.deepEqual(parseClientUpdatePolicy(null), DEFAULT_CLIENT_UPDATE_POLICY);
    assert.deepEqual(parseClientUpdatePolicy('x'), DEFAULT_CLIENT_UPDATE_POLICY);
    assert.equal(parseClientUpdatePolicy({ forceUpdate: true }).forceUpdate, true);
    assert.equal(
      parseClientUpdatePolicy({ forceUpdate: true, minClientVersion: '0.3.105' })
        .minClientVersion,
      '0.3.105',
    );
  });

  it('compares major.minor.patch and ignores prerelease noise', () => {
    assert.deepEqual(parseSemverCore('0.3.105'), [0, 3, 105]);
    assert.deepEqual(parseSemverCore('v0.3.105-beta.1'), [0, 3, 105]);
    assert.equal(compareSemverCore('0.3.104', '0.3.105'), -1);
    assert.equal(compareSemverCore('0.3.105', '0.3.105'), 0);
    assert.equal(compareSemverCore('0.4.0', '0.3.105'), 1);
  });

  it('isClientUpdateRequired respects force flag and semver', () => {
    assert.equal(
      isClientUpdateRequired({ forceUpdate: false, minClientVersion: '9.9.9' }, '0.1.0'),
      false,
    );
    assert.equal(
      isClientUpdateRequired(
        { forceUpdate: true, minClientVersion: '0.3.105' },
        '0.3.104',
      ),
      true,
    );
    assert.equal(
      isClientUpdateRequired(
        { forceUpdate: true, minClientVersion: '0.3.105' },
        '0.3.105',
      ),
      false,
    );
    assert.equal(
      isClientUpdateRequired(
        { forceUpdate: true, minClientVersion: '0.3.105' },
        '0.3.105-rc.1',
      ),
      false,
    );
    assert.equal(
      isClientUpdateRequired(
        { forceUpdate: true, minClientVersion: '0.3.105' },
        null,
      ),
      true,
    );
    assert.equal(
      isClientUpdateRequired(
        { forceUpdate: true, minClientVersion: 'not-a-version' },
        '0.1.0',
      ),
      false,
    );
  });

  it('clientUpdateGateRejection returns 426 body when blocked', () => {
    assert.equal(
      clientUpdateGateRejection(
        { forceUpdate: false, minClientVersion: '1.0.0' },
        '0.1.0',
      ),
      null,
    );
    const blocked = clientUpdateGateRejection(
      { forceUpdate: true, minClientVersion: '0.3.105' },
      '0.3.100',
    );
    assert.deepEqual(blocked, {
      status: 426,
      body: {
        error: CLIENT_UPDATE_REQUIRED,
        minClientVersion: '0.3.105',
      },
    });
  });
});
