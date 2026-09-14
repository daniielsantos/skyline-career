/**
 * Client Auth session (Phase 7) — Bearer token for CAREER_AUTH=1 hosts.
 * "Remember me" (opt-in) keeps the token in localStorage across Electron
 * restarts; otherwise sessionStorage (tab-scoped). Never stores passwords.
 */

export const AUTH_TOKEN_STORAGE_KEY = 'skyline.authToken';
export const AUTH_LOGIN_NAME_KEY = 'skyline.authLoginName';
export const AUTH_REMEMBER_KEY = 'skyline.authRemember';

let memoryAuthToken: string | null = null;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Default false — Bearer stays in sessionStorage unless user opts in (XSS surface). */
export function getRememberAuth(): boolean {
  return readFlag(AUTH_REMEMBER_KEY, false);
}

export function setRememberAuth(remember: boolean): void {
  try {
    localStorage.setItem(AUTH_REMEMBER_KEY, remember ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getRememberedLoginName(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_LOGIN_NAME_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function setRememberedLoginName(loginName: string | null): void {
  try {
    const trimmed = loginName?.trim() || '';
    if (trimmed) localStorage.setItem(AUTH_LOGIN_NAME_KEY, trimmed);
    else localStorage.removeItem(AUTH_LOGIN_NAME_KEY);
  } catch {
    /* ignore */
  }
}

export function getAuthToken(): string | null {
  try {
    if (memoryAuthToken?.trim()) return memoryAuthToken.trim();
    const durable = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim();
    if (durable) return durable;
    const session = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim();
    return session || null;
  } catch {
    return memoryAuthToken?.trim() || null;
  }
}

export function setAuthToken(
  token: string | null,
  opts?: { remember?: boolean },
): void {
  memoryAuthToken = token?.trim() || null;
  const remember =
    opts?.remember !== undefined ? opts.remember : getRememberAuth();
  if (opts?.remember !== undefined) {
    setRememberAuth(opts.remember);
  }
  try {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    if (!memoryAuthToken) return;
    if (remember) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, memoryAuthToken);
    } else {
      sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, memoryAuthToken);
    }
  } catch {
    /* ignore */
  }
}

export function clearAuthToken(): void {
  memoryAuthToken = null;
  try {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
