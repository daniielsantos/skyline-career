/**
 * Client company tenant isolation (Phase 6) — sessionStorage vs shared localStorage.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  COMPANY_STORAGE_KEY,
  getStoredCompanyId,
  LOCAL_COMPANY_ID,
  setActiveCompanyIdForRequests,
  setStoredCompanyId,
} from './career-company-client.ts';

type Store = Map<string, string>;

function installMemoryStorage(session: Store, local: Store): () => void {
  const make = (map: Store) =>
    ({
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    }) as Storage;

  const prevSession = globalThis.sessionStorage;
  const prevLocal = globalThis.localStorage;
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevLocation = (globalThis as { location?: unknown }).location;

  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: make(session),
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: make(local),
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search: '', pathname: '/', href: 'http://localhost/' },
    },
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: '', pathname: '/', href: 'http://localhost/' },
  });

  return () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: prevSession,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: prevLocal,
    });
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: prevWindow,
      });
    }
    if (prevLocation === undefined) {
      delete (globalThis as { location?: unknown }).location;
    } else {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: prevLocation,
      });
    }
  };
}

describe('career-company-client isolation', () => {
  let restore: (() => void) | undefined;
  let session: Store;
  let local: Store;

  beforeEach(() => {
    session = new Map();
    local = new Map();
    restore = installMemoryStorage(session, local);
    setActiveCompanyIdForRequests(LOCAL_COMPANY_ID);
  });

  afterEach(() => {
    restore?.();
  });

  it('uses sessionStorage, not shared localStorage', () => {
    local.set(COMPANY_STORAGE_KEY, 'co_poison');
    setStoredCompanyId('co_labubu');
    assert.equal(session.get(COMPANY_STORAGE_KEY), 'co_labubu');
    assert.equal(local.has(COMPANY_STORAGE_KEY), false);
    assert.equal(getStoredCompanyId(), 'co_labubu');
  });

  it('URL ?company= wins over session + memory', () => {
    setStoredCompanyId('co_session');
    (globalThis as { location: { search: string } }).location.search =
      '?company=co_url';
    (globalThis as { window: { location: { search: string } } }).window.location.search =
      '?company=co_url';
    assert.equal(getStoredCompanyId(), 'co_url');
  });

  it('memory chip id is used when session empty and no URL', () => {
    setActiveCompanyIdForRequests('co_chip');
    session.delete(COMPANY_STORAGE_KEY);
    assert.equal(getStoredCompanyId(), 'co_chip');
  });
});
