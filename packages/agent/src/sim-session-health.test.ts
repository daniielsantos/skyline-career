import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IpcClientError } from './ipc/types.js';
import {
  formatIpcError,
  ipcErrorCode,
  isIpcTimeout,
  isSimDownError,
  nextPipeBackoffMs,
  pingNeedsSessionReset,
  PIPE_BACKOFF_START_MS,
  sanitizeSimBridgeUserMessage,
  shouldReopenSimSession,
  SIM_DOWN_BACKOFF_MAX_MS,
  SIM_DOWN_BACKOFF_START_MS,
  SIM_OPEN_FAIL_USER,
  SIM_OPEN_TIMEOUT_USER,
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

  it('reopens when Host cannot open SimConnect (MSFS down)', () => {
    assert.equal(
      shouldReopenSimSession(
        new IpcClientError(
          'SIM_ERROR',
          'Failed to open SimConnect. Is MSFS 2024 running and in a flight? Details: x',
        ),
        1,
      ),
      true,
    );
    assert.equal(
      shouldReopenSimSession(
        new IpcClientError('SIM_ERROR', SIM_OPEN_FAIL_USER),
        1,
      ),
      true,
    );
  });
});

describe('sanitizeSimBridgeUserMessage', () => {
  it('collapses verbose open failures and HRESULT Details', () => {
    assert.equal(
      sanitizeSimBridgeUserMessage(
        'Failed to open SimConnect. Is MSFS 2024 running and in a flight? Details: Error HRESULT E_FAIL has been returned from a call to a COM component.',
      ),
      SIM_OPEN_FAIL_USER,
    );
    assert.equal(
      sanitizeSimBridgeUserMessage(
        'Timed out waiting for SimConnect open. Start MSFS 2024, load an aircraft, then retry.',
      ),
      SIM_OPEN_TIMEOUT_USER,
    );
    assert.equal(
      formatIpcError(
        new IpcClientError(
          'SIM_ERROR',
          'Failed to open SimConnect. Details: Error HRESULT E_FAIL has been returned from a call to a COM component.',
        ),
      ),
      SIM_OPEN_FAIL_USER,
    );
  });
});

describe('isSimDownError', () => {
  it('treats NOT_CONNECTED and MSFS-not-running as sim down', () => {
    assert.equal(
      isSimDownError(new IpcClientError('NOT_CONNECTED', 'Simulator quit')),
      true,
    );
    assert.equal(
      isSimDownError(
        new IpcClientError(
          'SIM_ERROR',
          'Timed out waiting for SimConnect open. Start MSFS 2024, load an aircraft, then retry.',
        ),
      ),
      true,
    );
    assert.equal(
      isSimDownError(new IpcClientError('SIM_ERROR', SIM_OPEN_TIMEOUT_USER)),
      true,
    );
  });

  it('does not treat TIMEOUT or unrelated SIM_ERROR as sim down', () => {
    assert.equal(
      isSimDownError(new IpcClientError('TIMEOUT', 'SimConnect request timed out')),
      false,
    );
    assert.equal(
      isSimDownError(new IpcClientError('SIM_ERROR', 'readSimVars returned unexpected length')),
      false,
    );
  });
});

describe('nextPipeBackoffMs', () => {
  it('starts hang-mole TIMEOUT at 2s and doubles', () => {
    const timeout = new IpcClientError('TIMEOUT', 'SimConnect request timed out');
    assert.equal(nextPipeBackoffMs(0, timeout), PIPE_BACKOFF_START_MS);
    assert.equal(nextPipeBackoffMs(2_000, timeout), 4_000);
    assert.equal(nextPipeBackoffMs(4_000, timeout), 8_000);
  });

  it('starts MSFS-down at 8s and caps at 15s', () => {
    const down = new IpcClientError('NOT_CONNECTED', 'Simulator quit');
    assert.equal(nextPipeBackoffMs(0, down), SIM_DOWN_BACKOFF_START_MS);
    assert.equal(nextPipeBackoffMs(8_000, down), SIM_DOWN_BACKOFF_MAX_MS);
    assert.equal(nextPipeBackoffMs(15_000, down), SIM_DOWN_BACKOFF_MAX_MS);
  });

  it('jumps from a TIMEOUT wait to the sim-down floor', () => {
    const down = new IpcClientError(
      'SIM_ERROR',
      'Failed to open SimConnect. Is MSFS 2024 running and in a flight?',
    );
    assert.equal(nextPipeBackoffMs(2_000, down), SIM_DOWN_BACKOFF_START_MS);
  });
});
