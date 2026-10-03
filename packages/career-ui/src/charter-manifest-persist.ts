const KEY_PREFIX = 'skyline-career-port-charter-manifest:';

export type PersistedPortCharterManifest = {
  offerId: string;
  aircraftId: string;
  companyId?: string;
};

function storageKey(profileId: string, accountId?: string | null): string {
  const acct = accountId?.trim() || 'local';
  return `${KEY_PREFIX}${profileId}:${acct}`;
}

export function readPersistedPortCharterManifest(
  profileId: string,
  accountId?: string | null,
): PersistedPortCharterManifest | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(profileId, accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPortCharterManifest;
    if (!parsed?.offerId?.trim() || !parsed?.aircraftId?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedPortCharterManifest(
  profileId: string,
  draft: PersistedPortCharterManifest,
  accountId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(profileId, accountId), JSON.stringify(draft));
  } catch {
    /* storage full — the world hold still resumes the card */
  }
}

export function clearPersistedPortCharterManifest(
  profileId: string,
  accountId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(profileId, accountId));
}
