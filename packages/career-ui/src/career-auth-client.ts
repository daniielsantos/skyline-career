/**
 * Client Auth session (Phase 7) — Bearer token in sessionStorage (tab-scoped).
 * When CAREER_AUTH=1 on the host, api() sends Authorization and company chip
 * is limited to owned companies.
 */

export const AUTH_TOKEN_STORAGE_KEY = 'skyline.authToken';

let memoryAuthToken: string | null = null;

export function getAuthToken(): string | null {
  try {
    if (memoryAuthToken?.trim()) return memoryAuthToken.trim();
    const raw = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return memoryAuthToken?.trim() || null;
  }
}

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token?.trim() || null;
  try {
    if (memoryAuthToken) {
      sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, memoryAuthToken);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}
