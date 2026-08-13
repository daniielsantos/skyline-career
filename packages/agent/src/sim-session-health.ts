/**
 * Honest SimConnect session health from Host ping/status (0.3.21+).
 * Older hosts omit sessionHealthy — callers must not infer zombie from that.
 *
 * Timeout is an IPC *code*, never a message regex. Host WaitPending throws
 * SimClientException("TIMEOUT", …); NamedPipeClient throws IpcClientError
 * with the same code. Matching "timed out" in prose is what froze Watch ~75s.
 */

import { IpcClientError } from './ipc/types.js';

export const IPC_TIMEOUT = 'TIMEOUT';
export const IPC_NOT_CONNECTED = 'NOT_CONNECTED';

const IPC_SESSION_CODES = new Set([IPC_TIMEOUT, IPC_NOT_CONNECTED]);

export type SimBridgeSessionPing = {
  pong?: boolean;
  mode?: string;
  connected: boolean;
  sessionHealthy?: boolean;
  lastRecvAgeMs?: number | null;
  consecutiveTimeouts?: number;
  aircraftTitle?: string;
};

/** Host advertised a dead/stale SimConnect session. Missing field = old host. */
export function simSessionUnhealthy(
  ping:
    | Pick<SimBridgeSessionPing, 'sessionHealthy' | 'connected'>
    | null
    | undefined,
): boolean {
  if (!ping) return false;
  if (typeof ping.sessionHealthy === 'boolean') {
    return ping.sessionHealthy === false;
  }
  return false;
}

/**
 * Watch must drop+reopen SimConnect (IPC disconnect+connect), not reuse.
 * Fuel reads NoteHealthyRecv and zero the Host timeout counter, so a station
 * TIMEOUT never reaches the 3-storm tear-down — ping stays "healthy".
 */
export function pingNeedsSessionReset(
  ping:
    | Pick<
        SimBridgeSessionPing,
        'sessionHealthy' | 'connected' | 'consecutiveTimeouts'
      >
    | null
    | undefined,
): boolean {
  if (!ping) return false;
  if (simSessionUnhealthy(ping)) return true;
  return (ping.consecutiveTimeouts ?? 0) > 0;
}

/** Canonical IPC / errno / prefixed lastError. Undefined if only prose. */
export function ipcErrorCode(err: unknown): string | undefined {
  if (err instanceof IpcClientError) return err.code;
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      if (IPC_SESSION_CODES.has(code) || code === 'EPIPE' || code === 'ENOENT') {
        return code;
      }
    }
  }
  const text =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : '';
  const prefixed = /^(TIMEOUT|NOT_CONNECTED):/.exec(text);
  return prefixed?.[1];
}

export function isIpcTimeout(err: unknown): boolean {
  return ipcErrorCode(err) === IPC_TIMEOUT;
}

export function isIpcDisconnected(err: unknown): boolean {
  const code = ipcErrorCode(err);
  if (code === IPC_NOT_CONNECTED || code === 'EPIPE' || code === 'ENOENT') {
    return true;
  }
  const text =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : String(err ?? '');
  return /0xC00000B0/i.test(text);
}

/** Persist `TIMEOUT: …` so later string checks still see the code. */
export function formatIpcError(err: unknown): string {
  const code = ipcErrorCode(err);
  const msg = err instanceof Error ? err.message : String(err);
  if (code && !msg.startsWith(`${code}:`)) return `${code}: ${msg}`;
  return msg;
}

export function simIpcSessionDied(err: unknown): boolean {
  return isIpcTimeout(err) || isIpcDisconnected(err);
}

/** @deprecated Prefer simIpcSessionDied(err). String form only honors `CODE:` prefix. */
export function simSessionDeadError(message: string): boolean {
  return simIpcSessionDied(message);
}

/**
 * Pipe-down / NOT_CONNECTED → reopen immediately.
 * Hang-mole TIMEOUT → after 2 consecutive tick errors (not on the first miss).
 */
export function shouldReopenSimSession(
  err: unknown,
  consecutiveErrors: number,
): boolean {
  if (isIpcDisconnected(err)) return true;
  return isIpcTimeout(err) && consecutiveErrors >= 2;
}
