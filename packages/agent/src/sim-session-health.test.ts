import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IpcClientError } from './ipc/types.js';
import {
  formatIpcError,
  ipcErrorCode,
  isIpcTimeout,
  pingNeedsSessionReset,
  shouldReopenSimSession,
  simIpcSessionDied,
  simSessionDeadError,
  simSessionUnhealthy,
} from './sim-session-health.js';

describe('simSessionUnhealthy', () => {
  it('treats sessionHealthy=false as dead', () => {
    assert.equal(
      simSessionUnhealthy({ connected: true, sessionHealthy: false }),
      true,
    );
  });

  it('ignores old hosts that omit sessionHealthy', () => {
    assert.equal(simSessionUnhealthy({ connected: true }), false);
    assert.equal(simSessionUnhealthy({ connected: false }), false);
    assert.equal(simSessionUnhealthy(null), false);
  });

  it('treats sessionHealthy=true as live', () => {
    assert.equal(
      simSessionUnhealthy({ connected: true, sessionHealthy: true }),
      false,
    );
  });
});

describe('pingNeedsSessionReset', () => {
  it('resets when consecutiveTimeouts > 0 even if ping looks healthy', () => {
    assert.equal(
      pingNeedsSessionReset({
        connected: true,
        sessionHealthy: true,
        consecutiveTimeouts: 1,
      }),
      true,
    );
  });

  it('does not reset a clean healthy ping', () => {
    assert.equal(
      pingNeedsSessionReset({
        connected: true,
        sessionHealthy: true,
        consecutiveTimeouts: 0,
      }),
      false,
    );
  });

  it('resets when sessionHealthy is false', () => {
    assert.equal(
      pingNeedsSessionReset({ connected: true, sessionHealthy: false }),
      true,
    );
  });
});

describe('isIpcTimeout', () => {
  it('uses IpcClientError.code, not the message prose', () => {
    assert.equal(
      isIpcTimeout(new IpcClientError('TIMEOUT', 'SimConnect request timed out')),
      true,
    );
    assert.equal(
      isIpcTimeout(new IpcClientError('TIMEOUT', 'Request timed out: readSimVar')),
      true,
    );
    assert.equal(
      isIpcTimeout(new IpcClientError('TIMEOUT', 'anything')),
      true,
    );
    assert.equal(ipcErrorCode(new IpcClientError('TIMEOUT', 'x')), 'TIMEOUT');
  });

  it('does not treat a bare "timed out" message as timeout', () => {
    assert.equal(isIpcTimeout(new Error('SimConnect request timed out')), false);
    assert.equal(isIpcTimeout('Request timed out: readSimVar'), false);
    assert.equal(simSessionDeadError('SimConnect request timed out'), false);
  });

  it('honors a persisted TIMEOUT: prefix on lastError strings', () => {
    assert.equal(isIpcTimeout('TIMEOUT: SimConnect request timed out'), true);
    assert.equal(formatIpcError(new IpcClientError('TIMEOUT', 'hello')), 'TIMEOUT: hello');
  });
});

describe('simIpcSessionDied', () => {
  it('treats TIMEOUT and NOT_CONNECTED codes as dead', () => {
    assert.equal(
      simIpcSessionDied(new IpcClientError('TIMEOUT', 'nope')),
      true,
    );
    assert.equal(
      simIpcSessionDied(new IpcClientError('NOT_CONNECTED', 'Pipe closed')),
      true,
    );
  });
});

describe('shouldReopenSimSession', () => {
  it('reopens immediately on pipe / NOT_CONNECTED', () => {
    assert.equal(
      shouldReopenSimSession(
        new IpcClientError('NOT_CONNECTED', 'SimConnect is not connected'),
        1,
      ),
      true,
    );
    assert.equal(
      shouldReopenSimSession(new IpcClientError('NOT_CONNECTED', 'Pipe closed'), 1),
      true,
    );
    assert.equal(
      shouldReopenSimSession('STATUS_PIPE_DISCONNECTED (0xC00000B0)', 1),
      true,
    );
  });

  it('does not reopen on the first TIMEOUT', () => {
    assert.equal(
      shouldReopenSimSession(new IpcClientError('TIMEOUT', 'SimConnect request timed out'), 1),
      false,
    );
  });

  it('reopens after two consecutive TIMEOUTs', () => {
    assert.equal(
      shouldReopenSimSession(new IpcClientError('TIMEOUT', 'SimConnect request timed out'), 2),
      true,
    );
  });

  it('does not reopen on unrelated errors', () => {
    assert.equal(shouldReopenSimSession('unknown aircraft', 5), false);
    assert.equal(simIpcSessionDied('unknown aircraft'), false);
  });
});
