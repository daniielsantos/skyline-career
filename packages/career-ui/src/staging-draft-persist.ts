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
};

type MissionRef = {
  id: string;
  status: string;
};

const KEY_PREFIX = 'skyline-career-staging-draft:';

export function stagingDraftStorageKey(profileId: string): string {
  return `${KEY_PREFIX}${profileId}`;
}

export function readPersistedStagingDraft(
  profileId: string,
): PersistedStagingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(stagingDraftStorageKey(profileId));
    if (!raw) return null;
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

export function writePersistedStagingDraft(
  profileId: string,
  draft: PersistedStagingDraft,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(stagingDraftStorageKey(profileId), JSON.stringify(draft));
  } catch {
    /* storage full — draft stays in memory only */
  }
}

export function clearPersistedStagingDraft(profileId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(stagingDraftStorageKey(profileId));
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
