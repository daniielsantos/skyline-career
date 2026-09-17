import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  AUTH_REQUIRED_EVENT,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  signalAuthRequired,
} from './career-auth-client.ts';
import { postLoadOfp } from './api.ts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe('client auth rejection', () => {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;
  const previousFetch = globalThis.fetch;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: new EventTarget(),
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    clearAuthToken();
  });

  afterEach(() => {
    clearAuthToken();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: previousLocalStorage,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: previousSessionStorage,
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: previousFetch,
    });
  });

  it('does not let an old 401 clear a newer login', () => {
    setAuthToken('new-token', { remember: false });
    signalAuthRequired('old-token');
    assert.equal(getAuthToken(), 'new-token');
  });

  it('clears the rejected token and notifies the app shell', () => {
    let events = 0;
    window.addEventListener(AUTH_REQUIRED_EVENT, () => {
      events += 1;
    });
    setAuthToken('rejected-token', { remember: false });

    signalAuthRequired('rejected-token');

    assert.equal(getAuthToken(), null);
    assert.equal(events, 1);
  });

  it('sends the Bearer on the custom structured inject request', async () => {
    let authorization = '';
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_input: RequestInfo | URL, init?: RequestInit) => {
        authorization = new Headers(init?.headers).get('Authorization') ?? '';
        return new Response(
          JSON.stringify({ ok: false, error: 'sim unavailable' }),
          {
            status: 503,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    });
    setAuthToken('inject-token', { remember: false });

    const result = await postLoadOfp({ missionId: 'msn_test' });

    assert.equal(authorization, 'Bearer inject-token');
    assert.equal(result.ok, false);
  });
});
