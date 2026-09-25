import type { MarketLot } from './api';

export type PersistedStagingDraft = {
  originIcao: string;
  destIcao: string;
  originName: string;
  destName: string;
  aircraft: string;
  aircraftId?: string;
  intoMissionId?: string;
  replaceManifest?: boolean;
  lines: Array<{ lot: MarketLot; cargoKg: number }>;
  /** VA Hauls desk hold — no Market lots; Accept → *DispatchHold. */
  deskHold?: {
    id: string;
    kind: 'demand' | 'bridge' | 'haul';
    commodityId: string;
    kg: number;
    /** This flight's load; omit on legacy drafts → treat as full hold.kg. */
    loadKg?: number;
    unitPriceUsd?: number;
    pilotPayUsd?: number;
    expiresAtTick?: number;
  };
};

type MissionRef = {
  id: string;
  status: string;
};

const KEY_PREFIX = 'skyline-career-staging-draft:';

/** Per save profile + auth account so logout/switch does not share drafts. */
export function stagingDraftStorageKey(
  profileId: string,
  accountId?: string | null,
): string {
  const acct = accountId?.trim() || 'local';
  return `${KEY_PREFIX}${profileId}:${acct}`;
}

/** Pre-auth-scoped key (migrate once into account-scoped key). */
export function stagingDraftLegacyStorageKey(profileId: string): string {
  return `${KEY_PREFIX}${profileId}`;
}

function parsePersistedDraft(raw: string | null): PersistedStagingDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedStagingDraft;
    if (
      !parsed?.originIcao ||
      !parsed?.destIcao ||
      !parsed?.aircraft ||
      !Array.isArray(parsed.lines)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readPersistedStagingDraft(
  profileId: string,
  accountId?: string | null,
): PersistedStagingDraft | null {
  if (typeof window === 'undefined') return null;
  const scoped = parsePersistedDraft(
    localStorage.getItem(stagingDraftStorageKey(profileId, accountId)),
  );
  if (scoped) return scoped;
  // Legacy profile-only key (pre account-scope). Do not delete here — the
  // first write from this account claims it; logout/switch must not let the
  // other account steal+erase the draft on a failed restore.
  return parsePersistedDraft(
    localStorage.getItem(stagingDraftLegacyStorageKey(profileId)),
  );
}

export function writePersistedStagingDraft(
  profileId: string,
  draft: PersistedStagingDraft,
  accountId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      stagingDraftStorageKey(profileId, accountId),
      JSON.stringify(draft),
    );
    localStorage.removeItem(stagingDraftLegacyStorageKey(profileId));
  } catch {
    /* storage full — draft stays in memory only */
  }
}

export function clearPersistedStagingDraft(
  profileId: string,
  accountId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(stagingDraftStorageKey(profileId, accountId));
  // Also drop legacy key so a later migrate cannot resurrect a discarded draft.
  localStorage.removeItem(stagingDraftLegacyStorageKey(profileId));
}

const ACTIVE_MISSION = new Set([
  'accepted',
  'dispatched',
  'in_flight',
  'arrived',
]);

function missionById(missions: MissionRef[], id: string | undefined) {
  if (!id) return undefined;
  return missions.find((mission) => mission.id === id);
}

/** Whether a saved draft is still safe to reopen after a UI reload. */
export function canRestoreStagingDraft(
  draft: PersistedStagingDraft,
  missions: MissionRef[],
  activeMissionId?: string,
): boolean {
  const deskHoldId = draft.deskHold?.id?.trim();
  if (deskHoldId) {
    if (draft.replaceManifest || draft.intoMissionId) return false;
    if (activeMissionId) return false;
    return Boolean(draft.aircraftId?.trim());
  }

  if (draft.lines.length === 0) return false;

  if (draft.replaceManifest) {
    const editing = missionById(missions, draft.intoMissionId);
    return Boolean(
      editing &&
        draft.intoMissionId === activeMissionId &&
        ['accepted', 'dispatched'].includes(editing.status),
    );
  }

  if (activeMissionId && !draft.intoMissionId) {
    return false;
  }

  if (draft.intoMissionId) {
    const bound = missionById(missions, draft.intoMissionId);
    return Boolean(bound && ACTIVE_MISSION.has(bound.status));
  }

  return true;
}

/**
 * Drop localStorage only when the draft is obsolete — not when restore is
 * temporarily blocked (e.g. another account's open flight on a shared save,
 * or this pilot still finishing a hop). Auth logout must not erase a Manifest
 * the player intends to resume.
 */
export function shouldDiscardPersistedStagingDraft(
  draft: PersistedStagingDraft,
  missions: MissionRef[],
  activeMissionId?: string,
): boolean {
  if (canRestoreStagingDraft(draft, missions, activeMissionId)) return false;

  const deskHoldId = draft.deskHold?.id?.trim();
  if (deskHoldId) {
    if (draft.replaceManifest || draft.intoMissionId) return true;
    if (!draft.aircraftId?.trim()) return true;
    // Blocked only by an open flight — keep for later restore.
    if (activeMissionId) return false;
    return true;
  }

  if (draft.lines.length === 0) return true;

  if (draft.replaceManifest) {
    const editing = missionById(missions, draft.intoMissionId);
    if (
      editing &&
      ['accepted', 'dispatched'].includes(editing.status) &&
      activeMissionId &&
      draft.intoMissionId !== activeMissionId
    ) {
      return false;
    }
    return true;
  }

  if (activeMissionId && !draft.intoMissionId) return false;

  if (draft.intoMissionId) {
    const bound = missionById(missions, draft.intoMissionId);
    return !(bound && ACTIVE_MISSION.has(bound.status));
  }

  return true;
}
