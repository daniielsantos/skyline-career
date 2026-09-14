/**
 * Client company tenant for dual-tab MP local (Phase 6).
 * SP default remains `local` when unset.
 *
 * Isolation (critical for dual-tab):
 * 1. `?company=` — per-tab URL (wins)
 * 2. in-memory — last id set by the UI chip in this JS realm
 * 3. `sessionStorage` — per-tab (survives reload; not shared across tabs)
 *
 * Do **not** use `localStorage` for the live tenant — it is shared across tabs
 * and made Labubu Accept see Nothin’s active `msn_cp_*`.
 */

export const LOCAL_COMPANY_ID = 'local';
export const COMPANY_STORAGE_KEY = 'skyline.companyId';

let memoryCompanyId: string | null = null;

function isValidCompanyId(raw: string | null | undefined): raw is string {
  return Boolean(raw && /^[a-zA-Z0-9_-]{1,64}$/.test(raw));
}

/** Read ?company= from the current URL (tab-scoped dual-tenant). */
export function companyIdFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): string | null {
  try {
    const raw = new URLSearchParams(search).get('company')?.trim();
    return isValidCompanyId(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Keep `api()` aligned with the header chip even before URL/storage catch up.
 * Call whenever the UI activates a company.
 */
export function setActiveCompanyIdForRequests(companyId: string): void {
  const id = companyId.trim() || LOCAL_COMPANY_ID;
  memoryCompanyId = id;
  setStoredCompanyId(id);
}

export function getStoredCompanyId(): string {
  try {
    const fromUrl = companyIdFromUrl();
    if (fromUrl) return fromUrl;
    if (isValidCompanyId(memoryCompanyId)) return memoryCompanyId;
    const raw = sessionStorage.getItem(COMPANY_STORAGE_KEY)?.trim();
    if (isValidCompanyId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return LOCAL_COMPANY_ID;
}

export function setStoredCompanyId(companyId: string): void {
  const id = companyId.trim() || LOCAL_COMPANY_ID;
  memoryCompanyId = id;
  try {
    sessionStorage.setItem(COMPANY_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  // Drop legacy shared key so an old tab cannot keep poisoning others.
  try {
    localStorage.removeItem(COMPANY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Suggest a unique id for “New company” (host still validates). */
export function suggestCompanyId(): string {
  return `co_${Date.now().toString(36)}`;
}
